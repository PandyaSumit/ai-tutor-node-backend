// src/services/socket/SocketManager.ts - COMPLETE DEBUG VERSION
import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import RedisService from '../external/RedisService';
import SessionService from '../session/SessionService';
import PythonAPIClient from '../external/PythonAPIClient';
import { MessageHandler } from './handlers/MessageHandler';
import logger from '@/config/logger';
import { verifySocketToken } from '@/middlewares/authMiddleware';
import { LRUCache } from 'lru-cache';

interface SessionCache {
    userId: string;
    status: string;
    lastActivity: number;
}

export class SocketManager {
    private io: SocketIOServer;
    private redisService: RedisService;
    private sessionService: SessionService;
    private pythonClient: PythonAPIClient;
    private messageHandler: MessageHandler;
    private sessionCache: LRUCache<string, SessionCache>;
    private activeConnections: Map<string, Set<string>> = new Map();

    constructor(server: HTTPServer) {
        logger.info('🔧 Initializing SocketManager...');

        // Initialize Socket.IO Server
        this.io = new SocketIOServer(server, {
            cors: {
                origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
                credentials: true,
                methods: ['GET', 'POST']
            },
            transports: ['websocket', 'polling'],
            upgradeTimeout: 10000,
            pingInterval: 25000,
            pingTimeout: 20000,
            maxHttpBufferSize: 1e6,
            allowEIO3: true,
            perMessageDeflate: {
                threshold: 1024,
                zlibDeflateOptions: {
                    chunkSize: 8 * 1024
                }
            },
            connectionStateRecovery: {
                maxDisconnectionDuration: 2 * 60 * 1000,
                skipMiddlewares: true
            }
        });

        logger.info('✅ Socket.IO server instance created');

        // Initialize cache
        this.sessionCache = new LRUCache({
            max: 10000,
            ttl: 1000 * 60 * 5,
            updateAgeOnGet: true
        });

        logger.info('✅ Session cache initialized');

        // Initialize services
        this.redisService = new RedisService();
        this.sessionService = new SessionService();
        this.pythonClient = new PythonAPIClient();
        this.messageHandler = new MessageHandler();

        logger.info('✅ All services initialized');

        // Setup in correct order
        this.setupRedisAdapter();
        this.setupMiddleware();
        this.setupEventHandlers();
        this.setupMonitoring();

        logger.info('✅ SocketManager fully initialized');
    }

    private async setupRedisAdapter() {
        try {
            logger.info('🔄 Setting up Redis adapter...');

            const pubClient = createClient({
                socket: {
                    host: process.env.REDIS_HOST || 'localhost',
                    port: parseInt(process.env.REDIS_PORT || '6379')
                },
                password: process.env.REDIS_PASSWORD || undefined
            });

            const subClient = pubClient.duplicate();

            await Promise.all([
                pubClient.connect(),
                subClient.connect()
            ]);

            this.io.adapter(createAdapter(pubClient, subClient));
            logger.info('✅ Socket.IO Redis adapter configured');
        } catch (error) {
            logger.error('❌ Failed to setup Redis adapter', error);
            logger.warn('⚠️  Running Socket.IO without Redis adapter (single server mode)');
        }
    }

    private setupMiddleware() {
        logger.info('🔄 Setting up Socket.IO middleware...');

        // Authentication middleware
        this.io.use(async (socket: Socket, next) => {
            try {
                const token = socket.handshake.auth?.token ||
                    socket.handshake.headers?.authorization?.replace('Bearer ', '');

                logger.info('🔐 Socket authentication attempt', {
                    hasToken: !!token,
                    hasAuth: !!socket.handshake.auth,
                    hasAuthHeader: !!socket.handshake.headers?.authorization
                });

                if (!token) {
                    logger.error('❌ No token in socket handshake');
                    return next(new Error('Authentication token required'));
                }

                const user = await verifySocketToken(token);

                socket.data.user = user;
                socket.data.connectedAt = Date.now();

                logger.info('✅ Socket authenticated', {
                    userId: user.userId,
                    email: user.email,
                    role: user.role
                });

                next();
            } catch (error) {
                logger.error('❌ Socket auth failed:', error);
                next(new Error('Authentication failed'));
            }
        });

        // Rate limiting middleware
        this.io.use(async (socket: Socket, next) => {
            try {
                const userId = socket.data.user?.userId?.toString();

                if (!userId) {
                    return next(new Error('User not found'));
                }

                const limit = await this.redisService.checkRateLimit(
                    `socket:connect:${userId}`,
                    10,
                    60
                );

                if (!limit.allowed) {
                    logger.warn(`⚠️  Rate limit exceeded for user: ${userId}`);
                    return next(new Error('Rate limit exceeded'));
                }

                next();
            } catch (error) {
                logger.error('❌ Rate limit check failed', error);
                next(); // Allow connection if rate limit check fails
            }
        });

        logger.info('✅ Socket.IO middleware configured');
    }

    private setupEventHandlers() {
        logger.info('🔄 Setting up Socket.IO event handlers...');

        this.io.on('connection', async (socket: Socket) => {
            const userId = socket.data.user?.userId?.toString();
            const socketId = socket.id;

            logger.info(`🔌 NEW CONNECTION: User ${userId} connected [${socketId}]`, {
                transport: socket.conn.transport.name,
                recovered: socket.recovered,
                remoteAddress: socket.handshake.address
            });

            if (!userId) {
                logger.error('❌ Connected socket has no userId!');
                socket.disconnect(true);
                return;
            }

            // Track connection
            if (!this.activeConnections.has(userId)) {
                this.activeConnections.set(userId, new Set());
            }
            this.activeConnections.get(userId)!.add(socketId);

            logger.info(`📊 Active connections for user ${userId}: ${this.activeConnections.get(userId)!.size}`);

            // Join user's personal room
            socket.join(`user:${userId}`);
            await this.redisService.setPresence(userId, 'online');

            // Emit connection success
            socket.emit('connected', {
                socketId,
                serverTime: Date.now(),
                recovered: socket.recovered,
                userId
            });

            logger.info(`✅ Sent 'connected' event to user ${userId}`);

            // === MESSAGE HANDLERS ===
            socket.on('message:send', async (data: any) => {
                logger.info(`📨 Received 'message:send' from user ${userId}`, data);
                try {
                    await this.messageHandler.handleMessage(socket, data);
                } catch (error) {
                    logger.error('❌ Error handling message:', error);
                    socket.emit('error', {
                        code: 'MESSAGE_SEND_ERROR',
                        message: 'Failed to send message'
                    });
                }
            });

            socket.on('voice:send', async (data: any) => {
                logger.info(`🎤 Received 'voice:send' from user ${userId}`);
                try {
                    await this.messageHandler.handleVoiceMessage(socket, data);
                } catch (error) {
                    logger.error('❌ Error handling voice message:', error);
                    socket.emit('error', {
                        code: 'VOICE_SEND_ERROR',
                        message: 'Failed to send voice message'
                    });
                }
            });

            // === TYPING INDICATORS ===
            socket.on('typing:start', (data: any) => {
                logger.info(`⌨️  User ${userId} started typing`);
                this.handleTyping(socket, data, true);
            });

            socket.on('typing:stop', (data: any) => {
                logger.info(`⌨️  User ${userId} stopped typing`);
                this.handleTyping(socket, data, false);
            });

            // === SESSION MANAGEMENT ===
            socket.on('session:join', async (data: any) => {
                logger.info(`🚪 User ${userId} joining session`, data);
                await this.handleSessionJoin(socket, data);
            });

            socket.on('session:leave', async (data: any) => {
                logger.info(`🚪 User ${userId} leaving session`, data);
                await this.handleSessionLeave(socket, data);
            });

            socket.on('session:create', async (data: any) => {
                logger.info(`➕ User ${userId} creating session`, data);
                await this.handleSessionCreate(socket, data);
            });

            socket.on('session:end', async (data: any) => {
                logger.info(`🔚 User ${userId} ending session`, data);
                await this.handleSessionEnd(socket, data);
            });

            // === WEBRTC SIGNALING ===
            socket.on('webrtc:offer', (data: any) => {
                logger.info(`📞 WebRTC offer from user ${userId}`);
                this.handleWebRTCSignal(socket, 'offer', data);
            });

            socket.on('webrtc:answer', (data: any) => {
                logger.info(`📞 WebRTC answer from user ${userId}`);
                this.handleWebRTCSignal(socket, 'answer', data);
            });

            socket.on('webrtc:ice-candidate', (data: any) => {
                logger.info(`🧊 ICE candidate from user ${userId}`);
                this.handleWebRTCSignal(socket, 'ice-candidate', data);
            });

            socket.on('webrtc:hangup', (data: any) => {
                logger.info(`📴 WebRTC hangup from user ${userId}`);
                this.handleWebRTCHangup(socket, data);
            });

            // === DISCONNECT ===
            socket.on('disconnect', async (reason: string) => {
                logger.info(`🔌 User ${userId} disconnecting: ${reason}`);
                await this.handleDisconnect(socket, reason);
            });

            socket.on('error', (error: Error) => {
                logger.error(`❌ Socket error for user ${userId}:`, error);
            });

            logger.info(`✅ All event handlers registered for user ${userId}`);
        });

        logger.info('✅ Socket.IO event handlers configured - Ready to accept connections!');
    }

    private handleTyping(socket: Socket, data: any, isTyping: boolean): void {
        const { sessionId } = data;
        const userId = socket.data.user.userId.toString();

        socket.to(`session:${sessionId}`).emit('typing:status', {
            userId,
            isTyping,
            timestamp: Date.now()
        });
    }

    private async handleSessionJoin(socket: Socket, data: any): Promise<void> {
        try {
            const { sessionId } = data;
            const userId = socket.data.user.userId.toString();

            let cachedSession = this.sessionCache.get(sessionId);

            if (!cachedSession) {
                const session = await this.sessionService.getSession(sessionId);
                if (!session) {
                    socket.emit('error', { code: 'SESSION_NOT_FOUND' });
                    return;
                }

                if (session.userId.toString() !== userId) {
                    socket.emit('error', { code: 'SESSION_ACCESS_DENIED' });
                    return;
                }

                cachedSession = {
                    userId: session.userId.toString(),
                    status: session.status,
                    lastActivity: Date.now()
                };
                this.sessionCache.set(sessionId, cachedSession);
            }

            socket.join(`session:${sessionId}`);

            socket.emit('session:joined', {
                sessionId,
                timestamp: Date.now()
            });

            logger.info(`✅ User ${userId} joined session ${sessionId}`);
        } catch (error) {
            logger.error('❌ Error joining session', error);
            socket.emit('error', { code: 'SESSION_JOIN_ERROR' });
        }
    }

    private async handleSessionLeave(socket: Socket, data: any): Promise<void> {
        const { sessionId } = data;
        socket.leave(`session:${sessionId}`);
        socket.emit('session:left', { sessionId });
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

            this.sessionCache.set(session.sessionId, {
                userId,
                status: session.status,
                lastActivity: Date.now()
            });

            socket.join(`session:${session.sessionId}`);

            socket.emit('session:created', {
                sessionId: session.sessionId,
                status: session.status,
                createdAt: session.createdAt
            });

            logger.info(`✅ Session created: ${session.sessionId} by user ${userId}`);
        } catch (error) {
            logger.error('❌ Error creating session', error);
            socket.emit('error', { code: 'SESSION_CREATE_ERROR' });
        }
    }

    private async handleSessionEnd(socket: Socket, data: any): Promise<void> {
        try {
            const { sessionId } = data;
            const userId = socket.data.user.userId.toString();

            await this.sessionService.endSession(sessionId, userId);
            this.sessionCache.delete(sessionId);

            socket.leave(`session:${sessionId}`);
            socket.emit('session:ended', { sessionId });

            logger.info(`✅ Session ended: ${sessionId}`);
        } catch (error) {
            logger.error('❌ Error ending session', error);
            socket.emit('error', { code: 'SESSION_END_ERROR' });
        }
    }

    private handleWebRTCSignal(socket: Socket, type: string, data: any): void {
        const { sessionId, to, ...payload } = data;
        const userId = socket.data.user.userId.toString();

        const event = `webrtc:${type}`;
        const message = { from: userId, ...payload };

        if (to) {
            this.io.to(`user:${to}`).emit(event, message);
        } else {
            socket.to(`session:${sessionId}`).emit(event, message);
        }
    }

    private handleWebRTCHangup(socket: Socket, data: any): void {
        const { sessionId } = data;
        const userId = socket.data.user.userId.toString();

        socket.to(`session:${sessionId}`).emit('webrtc:hangup', {
            from: userId
        });
    }

    private async handleDisconnect(socket: Socket, reason: string): Promise<void> {
        const socketId = socket.id;
        const userId = socket.data.user?.userId?.toString();

        if (!userId) {
            logger.warn(`Socket ${socketId} disconnected without userId`);
            return;
        }

        const userSockets = this.activeConnections.get(userId);
        if (userSockets) {
            userSockets.delete(socketId);

            if (userSockets.size === 0) {
                this.activeConnections.delete(userId);

                try {
                    await Promise.race([
                        this.redisService.setPresence(userId, 'offline'),
                        new Promise((_, reject) =>
                            setTimeout(() => reject(new Error('Timeout')), 3000)
                        )
                    ]);
                } catch (error) {
                    logger.error('❌ Failed to update presence:', error);
                }
            }
        }

        const connectionDuration = Date.now() - (socket.data.connectedAt || 0);
        logger.info(`🔌 User disconnected: ${userId} [${socketId}]`, {
            reason,
            duration: `${(connectionDuration / 1000).toFixed(2)}s`,
            remainingConnections: userSockets?.size || 0
        });
    }

    private setupMonitoring() {
        logger.info('🔄 Setting up monitoring...');

        this.pythonClient.on('health', (isHealthy: boolean) => {
            if (!isHealthy) {
                logger.error('❌ Python API is unhealthy');
                this.io.emit('system:alert', {
                    type: 'service_degraded',
                    message: 'AI service experiencing issues'
                });
            }
        });

        setInterval(() => {
            const metrics = this.getMetrics();
            logger.info('📊 Socket.IO Metrics', metrics);
        }, 5 * 60 * 1000);

        logger.info('✅ Monitoring configured');
    }

    // Public methods
    public emitToUser(userId: string, event: string, data: any): void {
        this.io.to(`user:${userId}`).emit(event, data);
        logger.info(`📤 Emitted '${event}' to user ${userId}`);
    }

    public emitToSession(sessionId: string, event: string, data: any): void {
        this.io.to(`session:${sessionId}`).emit(event, data);
        logger.info(`📤 Emitted '${event}' to session ${sessionId}`);
    }

    public async broadcastToAllUsers(event: string, data: any): Promise<void> {
        this.io.emit(event, data);
        logger.info(`📢 Broadcasted '${event}' to all users`);
    }

    public getMetrics() {
        const totalConnections = Array.from(this.activeConnections.values())
            .reduce((sum, sockets) => sum + sockets.size, 0);

        return {
            totalConnections,
            uniqueUsers: this.activeConnections.size,
            cachedSessions: this.sessionCache.size,
            pythonAPIHealthy: this.pythonClient.getHealthStatus()
        };
    }

    public async getConnectedUsers(): Promise<number> {
        return this.activeConnections.size;
    }

    public async getUserSocketIds(userId: string): Promise<string[]> {
        return Array.from(this.activeConnections.get(userId) || []);
    }

    public async shutdown(): Promise<void> {
        logger.info('🛑 Shutting down SocketManager...');
        await this.pythonClient.shutdown();
        this.sessionCache.clear();
        this.activeConnections.clear();
        this.io.close();
        logger.info('✅ SocketManager shutdown complete');
    }
}