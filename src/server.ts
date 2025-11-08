// src/server.ts - Updated with Provider Pattern for Dependency Injection
import express, { Application } from 'express';
import { createServer } from 'http';
import cluster from 'cluster';
import os from 'os';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import compression from 'compression';
import config from './config/env';
import connectDB from './config/database';
import passport from './config/passport';
import authRoutes from './routes/authRoutes';
import healthRoutes from './routes/healthRoutes';
import sessionRoutes from './routes/sessionRoutes';
import messageRoutes from './routes/messageRoutes';
import {
    helmetMiddleware,
    corsMiddleware,
    generalRateLimiter,
    mongoSanitizeMiddleware,
} from './middlewares/securityMiddleware';
import { errorHandler, notFoundHandler } from './middlewares/errorMiddleware';
import RefreshToken from './models/RefreshToken';
import { performanceMonitor } from './services/monitoring/PerformanceMonitor';
import logger from './config/logger';
import { SocketManager } from './services/socket/SocketManager';
import MessageQueue from './services/queue/MessageQueue';

const numCPUs = os.cpus().length;
const USE_CLUSTER = process.env.USE_CLUSTER === 'true' && config.nodeEnv === 'production';

// ============================================================
// SERVICE PROVIDER - Centralized Dependency Management
// ============================================================
class ServiceProvider {
    private static instance: ServiceProvider;

    public socketManager!: SocketManager;
    public messageQueue!: MessageQueue;

    private constructor() { }

    public static getInstance(): ServiceProvider {
        if (!ServiceProvider.instance) {
            ServiceProvider.instance = new ServiceProvider();
        }
        return ServiceProvider.instance;
    }

    public initialize(httpServer: any) {
        logger.info('🔧 Initializing services...');

        // Initialize SocketManager
        this.socketManager = new SocketManager(httpServer);
        logger.info('✅ SocketManager initialized');

        // Initialize MessageQueue
        this.messageQueue = new MessageQueue();
        logger.info('✅ MessageQueue initialized');

        // Link services together
        this.messageQueue.setSocketManager(this.socketManager);
        logger.info('✅ Services linked together');
    }

    public getSocketManager(): SocketManager {
        if (!this.socketManager) {
            throw new Error('SocketManager not initialized. Call initialize() first.');
        }
        return this.socketManager;
    }

    public getMessageQueue(): MessageQueue {
        if (!this.messageQueue) {
            throw new Error('MessageQueue not initialized. Call initialize() first.');
        }
        return this.messageQueue;
    }

    public async shutdown(): Promise<void> {
        logger.info('🛑 Shutting down services...');

        if (this.messageQueue) {
            await this.messageQueue.shutdown();
            logger.info('✅ MessageQueue shut down');
        }

        if (this.socketManager) {
            await this.socketManager.shutdown();
            logger.info('✅ SocketManager shut down');
        }
    }
}

// ============================================================
// CLUSTER MODE
// ============================================================
if (USE_CLUSTER && cluster.isPrimary) {
    logger.info(`Master process ${process.pid} is running`);
    logger.info(`Spawning ${numCPUs} worker processes`);

    for (let i = 0; i < numCPUs; i++) {
        cluster.fork();
    }

    cluster.on('exit', (worker, code, signal) => {
        logger.error(`Worker ${worker.process.pid} died (${signal || code}). Restarting...`);
        cluster.fork();
    });

} else {
    startServer();
}

// ============================================================
// SERVER INITIALIZATION
// ============================================================
async function startServer() {
    const app: Application = express();
    const httpServer = createServer(app);

    try {
        // Connect to database
        await connectDB();
        logger.info('✅ Database connected');

        // Initialize all services via ServiceProvider
        const serviceProvider = ServiceProvider.getInstance();
        serviceProvider.initialize(httpServer);

        // Configure Express app
        configureApp(app, serviceProvider);

        // Setup routes
        setupRoutes(app, serviceProvider);

        // Setup error handling
        setupErrorHandling(app);

        // Start server
        const PORT = config.port;
        httpServer.listen(PORT, () => {
            logServerStart(PORT);
        });

        // Setup error handlers
        setupServerErrorHandlers(httpServer, PORT);

        // Setup graceful shutdown
        setupGracefulShutdown(httpServer, serviceProvider);

        return { app, httpServer, serviceProvider };

    } catch (error) {
        logger.error('❌ Failed to start server:', error);
        process.exit(1);
    }
}

// ============================================================
// APP CONFIGURATION
// ============================================================
function configureApp(app: Application, serviceProvider: ServiceProvider) {
    // Trust proxy
    app.set('trust proxy', 1);

    // Security middleware
    app.use(helmetMiddleware);
    app.use(corsMiddleware);
    app.use(mongoSanitizeMiddleware);

    // Body parsing
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Compression
    app.use(compression({
        level: 6,
        threshold: 1024,
        filter: (req, res) => {
            if (req.headers['x-no-compression']) {
                return false;
            }
            return compression.filter(req, res);
        }
    }));

    // Cookie parser
    app.use(cookieParser());

    // Session configuration
    app.use(
        session({
            secret: config.jwt.accessSecret,
            resave: false,
            saveUninitialized: false,
            cookie: {
                secure: config.cookie.secure,
                httpOnly: true,
                maxAge: 24 * 60 * 60 * 1000,
            },
        })
    );

    // Passport
    app.use(passport.initialize());
    app.use(passport.session());

    // Performance monitoring
    app.use((req, res, next) => {
        const start = Date.now();
        res.on('finish', () => {
            const latency = Date.now() - start;
            performanceMonitor.trackLatency(
                `http:${req.method}:${req.route?.path || req.path}`,
                latency
            );
        });
        next();
    });

    // Rate limiting
    app.use('/api', generalRateLimiter);

    // Make services available to routes via app.locals
    app.locals.socketManager = serviceProvider.getSocketManager();
    app.locals.messageQueue = serviceProvider.getMessageQueue();
}

// ============================================================
// ROUTES SETUP
// ============================================================
function setupRoutes(app: Application, serviceProvider: ServiceProvider) {
    // Health check endpoint
    app.get('/health', async (_req, res) => {
        try {
            const health = performanceMonitor.checkHealth();
            const socketMetrics = serviceProvider.getSocketManager().getMetrics();
            const queueStats = await serviceProvider.getMessageQueue().getQueueStats();

            res.status(health.healthy ? 200 : 503).json({
                success: health.healthy,
                timestamp: new Date().toISOString(),
                worker: process.pid,
                services: {
                    database: health.healthy,
                    socket: socketMetrics.totalConnections > 0 || true,
                    queue: !queueStats.fallbackMode,
                    pythonAPI: socketMetrics.pythonAPIHealthy
                },
                metrics: {
                    connections: socketMetrics.totalConnections,
                    users: socketMetrics.uniqueUsers,
                    cachedSessions: socketMetrics.cachedSessions,
                    queue: {
                        waiting: queueStats.waiting,
                        active: queueStats.active,
                        completed: queueStats.completed,
                        failed: queueStats.failed,
                        fallbackMode: queueStats.fallbackMode
                    }
                },
                performance: health,
                uptime: process.uptime()
            });
        } catch (error) {
            logger.error('Health check error:', error);
            res.status(503).json({
                success: false,
                message: 'Health check failed'
            });
        }
    });

    // Metrics endpoint
    app.get('/metrics', async (_req, res) => {
        try {
            const stats = performanceMonitor.getAllStats();
            const socketMetrics = serviceProvider.getSocketManager().getMetrics();
            const queueStats = await serviceProvider.getMessageQueue().getQueueStats();

            res.json({
                performance: stats,
                socket: socketMetrics,
                queue: queueStats,
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            logger.error('Metrics error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch metrics'
            });
        }
    });

    // API Routes
    app.use('/', healthRoutes);
    app.use('/api/auth', authRoutes);
    app.use('/api/sessions', sessionRoutes);
    app.use('/api/messages', messageRoutes);
}

// ============================================================
// ERROR HANDLING
// ============================================================
function setupErrorHandling(app: Application) {
    app.use(notFoundHandler);
    app.use(errorHandler);
}

// ============================================================
// SERVER ERROR HANDLERS
// ============================================================
function setupServerErrorHandlers(httpServer: any, PORT: number) {
    httpServer.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
            logger.error(`❌ Port ${PORT} is already in use`);
            process.exit(1);
        }
        logger.error('❌ Server error:', err);
        process.exit(1);
    });
}

// ============================================================
// GRACEFUL SHUTDOWN
// ============================================================
function setupGracefulShutdown(httpServer: any, serviceProvider: ServiceProvider) {
    // Cleanup interval for expired tokens
    const cleanupInterval = setInterval(async () => {
        try {
            await RefreshToken.cleanupExpiredTokens();
            performanceMonitor.clearOldMetrics();
            logger.info('🧹 Cleanup tasks completed');
        } catch (error) {
            logger.error('❌ Error in cleanup tasks:', error);
        }
    }, 24 * 60 * 60 * 1000); // Run daily

    const gracefulShutdown = async (signal: string) => {
        logger.info(`\n${signal} received. Starting graceful shutdown...`);

        // Stop accepting new connections
        httpServer.close(async () => {
            logger.info('✅ HTTP server closed');

            // Clear cleanup interval
            clearInterval(cleanupInterval);

            // Shutdown services
            await serviceProvider.shutdown();

            // Close database connections
            try {
                const mongoose = require('mongoose');
                await mongoose.connection.close();
                logger.info('✅ Database connections closed');
            } catch (error) {
                logger.error('❌ Error closing database:', error);
            }

            logger.info('✅ Graceful shutdown completed');
            process.exit(0);
        });

        // Force shutdown after timeout
        setTimeout(() => {
            logger.error('⚠️  Forced shutdown after timeout');
            process.exit(1);
        }, 10000);
    };

    // Handle shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason: Error) => {
        logger.error('❌ Unhandled Rejection:', reason);
        if (config.nodeEnv === 'production') {
            gracefulShutdown('UNHANDLED_REJECTION');
        }
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error: Error) => {
        logger.error('❌ Uncaught Exception:', error);
        if (config.nodeEnv === 'production') {
            gracefulShutdown('UNCAUGHT_EXCEPTION');
        }
    });
}

// ============================================================
// LOGGING
// ============================================================
function logServerStart(PORT: number) {
    logger.info(`
╔═══════════════════════════════════════════════════════╗
║   🚀 Server Started Successfully                      ║
║                                                       ║
║   Environment: ${config.nodeEnv.padEnd(33)}║
║   Worker PID: ${process.pid.toString().padEnd(34)}║
║   Port: ${PORT.toString().padEnd(40)}║
║   API URL: ${config.apiUrl.padEnd(36)}║
║                                                       ║
║   📡 Services:                                        ║
║   REST API: ${config.apiUrl.padEnd(33)}║
║   WebSocket: ws://localhost:${PORT.toString().padEnd(22)}║
║   Health: ${config.apiUrl}/health${' '.repeat(23)}║
║   Metrics: ${config.apiUrl}/metrics${' '.repeat(21)}║
║                                                       ║
║   ✅ SocketManager: Active                            ║
║   ✅ MessageQueue: Active                             ║
║   ✅ Database: Connected                              ║
╚═══════════════════════════════════════════════════════╝
    `);
}

export default startServer;
export { ServiceProvider };