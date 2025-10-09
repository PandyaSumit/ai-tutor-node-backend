// src/services/socket/OptimizedSocketManager.ts
import { Server as SocketIOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'redis';
import RedisService from '../external/RedisService';
import SessionService from '../session/SessionService';
import EnhancedPythonAPIClient from '../external/PythonAPIClient';
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
    private pythonClient: EnhancedPythonAPIClient;
    private messageHandler: MessageHandler;

    // In-memory cache for active sessions (reduces DB queries)
    private sessionCache: LRUCache<string, SessionCache>;

    // Connection pool tracking
    private activeConnections: Map<string, Set<string>> = new Map(); // userId -> Set<socketId>

    constructor(server: HTTPServer) {
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
            // Connection state recovery
            connectionStateRecovery: {
                maxDisconnectionDuration: 2 * 60 * 1000,
                skipMiddlewares: true
            }
        });

        // Initialize cache
        this.sessionCache = new LRUCache({
            max: 10000,
            ttl: 1000 * 60 * 5, // 5 minutes
            updateAgeOnGet: true
        });

        this.redisService = new RedisService();
        this.sessionService = new SessionService();
        this.pythonClient = new EnhancedPythonAPIClient();
        this.messageHandler = new MessageHandler();

        this.setupRedisAdapter();
        this.setupMiddleware();
        this.setupEventHandlers();
        this.setupMonitoring();
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
            logger.info('✓ Socket.IO Redis adapter configured');
        } catch (error) {
            logger.error('Failed to setup Redis adapter', error);
            logger.warn('⚠ Running Socket.IO without Redis adapter (single server mode)');
        }
    }

    private setupMiddleware() {
        // Authentication middleware
        this.io.use(async (socket: Socket, next) => {
            try {
                // ✅ FIX: Handle both direct token string and object with token property
                let token: string | undefined;

                const authData = socket.handshake.auth;

                // Case 1: Direct token string
                if (typeof authData.token === 'string') {
                    token = authData.token;
                }
                // Case 2: Nested token object (shouldn't happen but handle it)
                else if (authData.token && typeof authData.token === 'object' && 'token' in authData.token) {
                    token = (authData.token as any).token;
                }
                // Case 3: Token in headers (fallback)
                else if (socket.handshake.headers.authorization) {
                    const authHeader = socket.handshake.headers.authorization;
                    token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;
                }

                console.log('🔐 Socket auth attempt:', {
                    hasAuthData: !!authData,
                    authType: typeof authData.token,
                    hasToken: !!token,
                    headers: socket.handshake.headers.authorization ? 'present' : 'missing'
                });

                if (!token) {
                    console.error('❌ No token provided in socket handshake');
                    return next(new Error('AUTH_TOKEN_MISSING'));
                }

                // Verify the token
                const user = await verifySocketToken(token);

                // Store user data in socket
                socket.data.user = user;
                socket.data.connectedAt = Date.now();

                console.log('✅ Socket authenticated:', {
                    userId: user.userId,
                    email: user.email,
                    role: user.role
                });

                next();
            } catch (error) {
                console.error('❌ Socket authentication failed:', error);
                const errorMessage = error instanceof Error ? error.message : 'AUTH_FAILED';
                next(new Error(errorMessage));
            }
        });

        // Rate limiting middleware (using sliding window)
        this.io.use(async (socket: Socket, next) => {
            try {
                const userId = socket.data.user?.userId?.toString();

                if (!userId) {
                    return next(new Error('USER_NOT_FOUND'));
                }

                const limit = await this.redisService.checkRateLimit(
                    `socket:connect:${userId}`,
                    10, // Max 10 connections per minute
                    60
                );

                if (!limit.allowed) {
                    console.warn(`⚠️ Rate limit exceeded for user: ${userId}`);
                    return next(new Error('RATE_LIMIT_EXCEEDED'));
                }

                next();
            } catch (error) {
                logger.error('Rate limit check failed', error);
                next(); // Allow connection if rate limit check fails
            }
        });
    }

    private setupEventHandlers() {
        this.io.on('connection', async (socket: Socket) => {
            const userId = socket.data.user.userId.toString();
            const socketId = socket.id;

            logger.info(`🔌 User connected: ${userId} [${socketId}]`, {
                transport: socket.conn.transport.name,
                recovered: socket.recovered
            });

            // Track connection
            if (!this.activeConnections.has(userId)) {
                this.activeConnections.set(userId, new Set());
            }
            this.activeConnections.get(userId)!.add(socketId);

            // Join user's personal room
            socket.join(`user:${userId}`);
            await this.redisService.setPresence(userId, 'online');

            // Emit connection success with server time for sync
            socket.emit('connected', {
                socketId,
                serverTime: Date.now(),
                recovered: socket.recovered
            });

            // === TEXT MESSAGE HANDLERS ===
            socket.on('message:send', async (data: any) => {
                await this.handleWithMetrics('message:send', () =>
                    this.messageHandler.handleMessage(socket, data)
                );
            });

            // === VOICE MESSAGE HANDLERS ===
            socket.on('voice:send', async (data: any) => {
                await this.handleWithMetrics('voice:send', () =>
                    this.messageHandler.handleVoiceMessage(socket, data)
                );
            });

            // === TYPING INDICATORS ===
            socket.on('typing:start', (data: any) => {
                this.handleTyping(socket, data, true);
            });

            socket.on('typing:stop', (data: any) => {
                this.handleTyping(socket, data, false);
            });

            // === SESSION MANAGEMENT ===
            socket.on('session:join', async (data: any) => {
                await this.handleSessionJoin(socket, data);
            });

            socket.on('session:leave', async (data: any) => {
                await this.handleSessionLeave(socket, data);
            });

            socket.on('session:create', async (data: any) => {
                await this.handleSessionCreate(socket, data);
            });

            socket.on('session:end', async (data: any) => {
                await this.handleSessionEnd(socket, data);
            });

            // === WEBRTC SIGNALING ===
            socket.on('webrtc:offer', (data: any) => {
                this.handleWebRTCSignal(socket, 'offer', data);
            });

            socket.on('webrtc:answer', (data: any) => {
                this.handleWebRTCSignal(socket, 'answer', data);
            });

            socket.on('webrtc:ice-candidate', (data: any) => {
                this.handleWebRTCSignal(socket, 'ice-candidate', data);
            });

            socket.on('webrtc:hangup', (data: any) => {
                this.handleWebRTCHangup(socket, data);
            });

            // === DISCONNECT HANDLING ===
            socket.on('disconnect', async (reason: string) => {
                await this.handleDisconnect(socket, reason);
            });

            // Error handling
            socket.on('error', (error: Error) => {
                logger.error('Socket error', { userId, socketId, error });
            });
        });
    }

    private async handleWithMetrics(
        eventName: string,
        handler: () => Promise<void>
    ): Promise<void> {
        const startTime = Date.now();
        try {
            await handler();
            const latency = Date.now() - startTime;
            if (latency > 1000) {
                logger.warn(`Slow event handler: ${eventName} took ${latency}ms`);
            }
        } catch (error) {
            logger.error(`Error in ${eventName}`, error);
            throw error;
        }
    }

    private handleTyping(socket: Socket, data: any, isTyping: boolean): void {
        const { sessionId } = data;
        const userId = socket.data.user.userId.toString();

        // Broadcast to session without storing
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

            // Check cache first
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

            logger.info(`User ${userId} joined session ${sessionId}`);
        } catch (error) {
            logger.error('Error joining session', error);
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

            // Cache the new session
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

            logger.info(`Session created: ${session.sessionId}`);
        } catch (error) {
            logger.error('Error creating session', error);
            socket.emit('error', { code: 'SESSION_CREATE_ERROR' });
        }
    }

    private async handleSessionEnd(socket: Socket, data: any): Promise<void> {
        try {
            const { sessionId } = data;
            const userId = socket.data.user.userId.toString();

            await this.sessionService.endSession(sessionId, userId);

            // Remove from cache
            this.sessionCache.delete(sessionId);

            socket.leave(`session:${sessionId}`);
            socket.emit('session:ended', { sessionId });

            logger.info(`Session ended: ${sessionId}`);
        } catch (error) {
            logger.error('Error ending session', error);
            socket.emit('error', { code: 'SESSION_END_ERROR' });
        }
    }

    private handleWebRTCSignal(socket: Socket, type: string, data: any): void {
        const { sessionId, to, ...payload } = data;
        const userId = socket.data.user.userId.toString();

        const event = `webrtc:${type}`;
        const message = { from: userId, ...payload };

        if (to) {
            // Send to specific user
            this.io.to(`user:${to}`).emit(event, message);
        } else {
            // Broadcast to session
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
        const userId = socket.data.user.userId.toString();
        const socketId = socket.id;

        // Remove from connection tracking
        const userSockets = this.activeConnections.get(userId);
        if (userSockets) {
            userSockets.delete(socketId);
            if (userSockets.size === 0) {
                this.activeConnections.delete(userId);
                await this.redisService.setPresence(userId, 'offline');
            }
        }

        const connectionDuration = Date.now() - (socket.data.connectedAt || 0);

        logger.info(`User disconnected: ${userId} [${socketId}]`, {
            reason,
            duration: `${(connectionDuration / 1000).toFixed(2)}s`,
            remainingConnections: userSockets?.size || 0
        });
    }

    private setupMonitoring() {
        // Monitor Python API health
        this.pythonClient.on('health', (isHealthy: boolean) => {
            if (!isHealthy) {
                logger.error('Python API is unhealthy');
                this.io.emit('system:alert', {
                    type: 'service_degraded',
                    message: 'AI service experiencing issues'
                });
            }
        });

        // Log metrics every 5 minutes
        setInterval(() => {
            const metrics = this.getMetrics();
            logger.info('Socket.IO Metrics', metrics);
        }, 5 * 60 * 1000);
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
        logger.info('Shutting down SocketManager...');
        await this.pythonClient.shutdown();
        this.sessionCache.clear();
        this.activeConnections.clear();
        this.io.close();
    }
}