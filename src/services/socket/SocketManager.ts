// src/services/socket/SocketManager.ts
import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import RedisService from '../external/RedisService';
import MessageQueue from '../queue/MessageQueue';
import SessionService from '../session/SessionService';
import logger from '@/config/logger';
import { verifySocketToken } from '@/middlewares/authMiddleware';

export class SocketManager {
    private io: SocketIOServer;
    private redisService: RedisService;
    private messageQueue: MessageQueue;
    private sessionService: SessionService;

    constructor(server: HTTPServer) {
        this.io = new SocketIOServer(server, {
            cors: {
                origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
                credentials: true,
                methods: ['GET', 'POST']
            },
            transports: ['websocket', 'polling'],
            pingInterval: 25000,
            pingTimeout: 60000,
            maxHttpBufferSize: 1e6,
            allowEIO3: true
        });

        this.redisService = new RedisService();
        this.messageQueue = new MessageQueue();
        this.sessionService = new SessionService();

        this.setupRedisAdapter();
        this.setupMiddleware();
        this.setupEventHandlers();

        // Link socket manager to message queue
        this.messageQueue.setSocketManager(this);
    }

    private async setupRedisAdapter() {
        try {
            const pubClient = createClient({
                socket: {
                    host: process.env.REDIS_HOST || 'localhost',
                    port: parseInt(process.env.REDIS_PORT || '6379')
                },
                password: process.env.REDIS_PASSWORD
            });

            const subClient = pubClient.duplicate();

            await Promise.all([
                pubClient.connect(),
                subClient.connect()
            ]);

            this.io.adapter(createAdapter(pubClient, subClient));
            logger.info('Socket.IO Redis adapter configured');
        } catch (error) {
            logger.error('Failed to setup Redis adapter', error);
            logger.warn('Running Socket.IO without Redis adapter (single server mode)');
        }
    }

    private setupMiddleware() {
        // Authentication middleware
        this.io.use(async (socket: Socket, next) => {
            try {
                const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];

                if (!token) {
                    return next(new Error('Authentication token missing'));
                }

                const user = await verifySocketToken(token);
                socket.data.user = user;
                next();
            } catch (error) {
                logger.error('Socket authentication failed', error);
                next(new Error('Authentication failed'));
            }
        });

        // Rate limiting middleware
        this.io.use(async (socket: Socket, next) => {
            try {
                const userId = socket.data.user.userId.toString();
                const limit = await this.redisService.checkRateLimit(
                    `socket:${userId}`,
                    100,
                    60
                );

                if (!limit.allowed) {
                    return next(new Error('Rate limit exceeded'));
                }
                next();
            } catch (error) {
                logger.error('Rate limit check failed', error);
                next();
            }
        });
    }

    private setupEventHandlers() {
        this.io.on('connection', async (socket: Socket) => {
            const userId = socket.data.user.userId.toString();
            logger.info(`User connected: ${userId} [${socket.id}]`);

            // Join user's personal room
            socket.join(`user:${userId}`);
            await this.redisService.setPresence(userId, 'online');

            // Message handling
            socket.on('message:send', async (data: any) => {
                await this.handleMessage(socket, data);
            });

            // Typing indicators
            socket.on('typing:start', async (data: any) => {
                await this.handleTyping(socket, data, true);
            });

            socket.on('typing:stop', async (data: any) => {
                await this.handleTyping(socket, data, false);
            });

            // Session management
            socket.on('session:create', async (data: any) => {
                await this.handleSessionCreate(socket, data);
            });

            socket.on('session:resume', async (data: any) => {
                await this.handleSessionResume(socket, data);
            });

            socket.on('session:end', async (data: any) => {
                await this.handleSessionEnd(socket, data);
            });

            // WebRTC signaling
            socket.on('webrtc:offer', async (data: any) => {
                await this.handleWebRTCOffer(socket, data);
            });

            socket.on('webrtc:answer', async (data: any) => {
                await this.handleWebRTCAnswer(socket, data);
            });

            socket.on('webrtc:ice-candidate', async (data: any) => {
                await this.handleICECandidate(socket, data);
            });

            socket.on('webrtc:hangup', async (data: any) => {
                await this.handleWebRTCHangup(socket, data);
            });

            // Disconnect handling
            socket.on('disconnect', async (reason: string) => {
                await this.handleDisconnect(socket, reason);
            });
        });
    }

    private async handleMessage(socket: Socket, data: any): Promise<void> {
        try {
            const { sessionId, content } = data;
            const userId = socket.data.user.userId.toString();

            // Validate session ownership
            const session = await this.sessionService.getSession(sessionId);
            if (!session || session.userId.toString() !== userId) {
                socket.emit('error', { message: 'Invalid session' });
                return;
            }

            // Save user message
            const message = await this.sessionService.addMessage(
                sessionId,
                userId,
                'user',
                content
            );

            // Acknowledge message sent
            socket.emit('message:sent', {
                messageId: message._id.toString(),
                timestamp: message.createdAt
            });

            // Queue for LLM processing
            await this.messageQueue.addToLLMQueue({
                sessionId,
                userId,
                messageId: message._id.toString(),
                content,
                context: session.contextWindow
            });

            logger.info(`Message queued for LLM: ${message._id}`);
        } catch (error) {
            logger.error('Error handling message', error);
            socket.emit('error', { message: 'Failed to process message' });
        }
    }

    private async handleTyping(socket: Socket, data: any, isTyping: boolean): Promise<void> {
        const { sessionId } = data;
        const userId = socket.data.user.userId.toString();

        socket.to(`session:${sessionId}`).emit('typing:status', {
            userId,
            isTyping,
            timestamp: Date.now()
        });
    }

    private async handleSessionCreate(socket: Socket, data: any): Promise<void> {
        try {
            const userId = socket.data.user.userId.toString();
            const { topic, metadata } = data;

            const session = await this.sessionService.createSession(
                userId,
                topic,
                metadata
            );

            socket.join(`session:${session.sessionId}`);

            await this.redisService.setSession(session.sessionId, {
                userId,
                socketId: socket.id,
                createdAt: Date.now()
            }, 3600);

            socket.emit('session:created', {
                sessionId: session.sessionId,
                status: session.status,
                createdAt: session.createdAt
            });

            logger.info(`Session created: ${session.sessionId}`);
        } catch (error) {
            logger.error('Error creating session', error);
            socket.emit('error', { message: 'Failed to create session' });
        }
    }

    private async handleSessionResume(socket: Socket, data: any): Promise<void> {
        try {
            const { sessionId } = data;
            const userId = socket.data.user.userId.toString();

            const session = await this.sessionService.resumeSession(sessionId, userId);

            if (!session) {
                socket.emit('error', { message: 'Session not found or already ended' });
                return;
            }

            socket.join(`session:${sessionId}`);

            const messages = await this.sessionService.getSessionHistory(sessionId, 50);

            socket.emit('session:resumed', {
                sessionId: session.sessionId,
                status: session.status,
                context: session.contextWindow,
                messageCount: session.metadata.messageCount,
                messages: messages.reverse() // Chronological order
            });

            logger.info(`Session resumed: ${sessionId}`);
        } catch (error) {
            logger.error('Error resuming session', error);
            socket.emit('error', { message: 'Failed to resume session' });
        }
    }

    private async handleSessionEnd(socket: Socket, data: any): Promise<void> {
        try {
            const { sessionId } = data;
            const userId = socket.data.user.userId.toString();

            await this.sessionService.endSession(sessionId, userId);

            socket.leave(`session:${sessionId}`);
            await this.redisService.deleteSession(sessionId);

            socket.emit('session:ended', { sessionId });

            logger.info(`Session ended: ${sessionId}`);
        } catch (error) {
            logger.error('Error ending session', error);
            socket.emit('error', { message: 'Failed to end session' });
        }
    }

    private async handleWebRTCOffer(socket: Socket, data: any): Promise<void> {
        try {
            const { sessionId, offer, audioOnly } = data;
            const userId = socket.data.user.userId.toString();

            logger.info(`WebRTC offer from ${userId} in session ${sessionId}`);

            // Relay offer to other participants in session
            socket.to(`session:${sessionId}`).emit('webrtc:offer', {
                from: userId,
                offer,
                audioOnly
            });
        } catch (error) {
            logger.error('Error handling WebRTC offer', error);
            socket.emit('error', { message: 'Failed to process WebRTC offer' });
        }
    }

    private async handleWebRTCAnswer(socket: Socket, data: any): Promise<void> {
        try {
            const { sessionId, answer, to } = data;
            const userId = socket.data.user.userId.toString();

            logger.info(`WebRTC answer from ${userId} in session ${sessionId}`);

            // Send answer to specific peer
            if (to) {
                this.io.to(`user:${to}`).emit('webrtc:answer', {
                    from: userId,
                    answer
                });
            } else {
                socket.to(`session:${sessionId}`).emit('webrtc:answer', {
                    from: userId,
                    answer
                });
            }
        } catch (error) {
            logger.error('Error handling WebRTC answer', error);
            socket.emit('error', { message: 'Failed to process WebRTC answer' });
        }
    }

    private async handleICECandidate(socket: Socket, data: any): Promise<void> {
        try {
            const { sessionId, candidate, to } = data;
            const userId = socket.data.user.userId.toString();

            // Relay ICE candidate
            if (to) {
                this.io.to(`user:${to}`).emit('webrtc:ice-candidate', {
                    from: userId,
                    candidate
                });
            } else {
                socket.to(`session:${sessionId}`).emit('webrtc:ice-candidate', {
                    from: userId,
                    candidate
                });
            }
        } catch (error) {
            logger.error('Error handling ICE candidate', error);
        }
    }

    private async handleWebRTCHangup(socket: Socket, data: any): Promise<void> {
        try {
            const { sessionId } = data;
            const userId = socket.data.user.userId.toString();

            socket.to(`session:${sessionId}`).emit('webrtc:hangup', {
                from: userId
            });

            logger.info(`WebRTC hangup from ${userId} in session ${sessionId}`);
        } catch (error) {
            logger.error('Error handling WebRTC hangup', error);
        }
    }

    private async handleDisconnect(socket: Socket, reason: string): Promise<void> {
        const userId = socket.data.user.userId.toString();

        await this.redisService.setPresence(userId, 'offline');

        // Get user's active sessions
        const sessions = await this.redisService.getUserSessions(userId);
        for (const sessionId of sessions) {
            socket.leave(`session:${sessionId}`);

            // Notify other participants
            socket.to(`session:${sessionId}`).emit('user:disconnected', {
                userId,
                reason
            });
        }

        logger.info(`User disconnected: ${userId} [${socket.id}] - Reason: ${reason}`);
    }

    // Public methods for external use
    public emitToUser(userId: string, event: string, data: any): void {
        this.io.to(`user:${userId}`).emit(event, data);
    }

    public emitToSession(sessionId: string, event: string, data: any): void {
        this.io.to(`session:${sessionId}`).emit(event, data);
    }

    public async broadcastToAllUsers(event: string, data: any): Promise<void> {
        this.io.emit(event, data);
    }

    public async getConnectedUsers(): Promise<number> {
        const sockets = await this.io.fetchSockets();
        return sockets.length;
    }

    public async getUserSocketIds(userId: string): Promise<string[]> {
        const sockets = await this.io.in(`user:${userId}`).fetchSockets();
        return sockets.map(s => s.id);
    }
}