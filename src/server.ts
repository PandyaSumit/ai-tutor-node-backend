// src/server.ts - Updated for optimal performance
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

const numCPUs = os.cpus().length;
const USE_CLUSTER = process.env.USE_CLUSTER === 'true' && config.nodeEnv === 'production';

if (USE_CLUSTER && cluster.isPrimary) {
    logger.info(`Master process ${process.pid} is running`);
    logger.info(`Spawning ${numCPUs} worker processes`);

    // Fork workers
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

async function startServer() {
    const app: Application = express();
    const httpServer = createServer(app);

    // Initialize Socket.IO with optimizations
    const socketManager = new SocketManager(httpServer);

    // Connect to database
    await connectDB();

    // Trust proxy for accurate IP addresses
    app.set('trust proxy', 1);

    // Security middleware
    app.use(helmetMiddleware);
    app.use(corsMiddleware);
    app.use(mongoSanitizeMiddleware);

    // Body parsing with limits
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Compression with performance tuning
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

    // Passport initialization
    app.use(passport.initialize());
    app.use(passport.session());

    // Performance monitoring middleware
    app.use((req, res, next) => {
        const start = Date.now();
        res.on('finish', () => {
            const latency = Date.now() - start;
            performanceMonitor.trackLatency(`http:${req.method}:${req.route?.path || req.path}`, latency);
        });
        next();
    });

    // Rate limiting
    app.use('/api', generalRateLimiter);

    // Health check endpoints
    app.get('/health', async (_req, res) => {
        const health = performanceMonitor.checkHealth();
        const metrics = socketManager.getMetrics();

        res.status(health.healthy ? 200 : 503).json({
            success: health.healthy,
            timestamp: new Date().toISOString(),
            worker: process.pid,
            metrics: {
                connections: metrics.totalConnections,
                users: metrics.uniqueUsers,
                cachedSessions: metrics.cachedSessions,
                pythonAPI: metrics.pythonAPIHealthy
            },
            performance: health,
            uptime: process.uptime()
        });
    });

    app.get('/metrics', async (_req, res) => {
        const stats = performanceMonitor.getAllStats();
        res.json(stats);
    });

    // Routes
    app.use('/', healthRoutes);
    app.use('/api/auth', authRoutes);
    app.use('/api/sessions', sessionRoutes);
    app.use('/api/messages', messageRoutes);

    // Error handling
    app.use(notFoundHandler);
    app.use(errorHandler);

    // Cleanup tasks
    const cleanupInterval = setInterval(async () => {
        try {
            await RefreshToken.cleanupExpiredTokens();
            performanceMonitor.clearOldMetrics();
            logger.info('Cleanup tasks completed');
        } catch (error) {
            logger.error('Error in cleanup tasks:', error);
        }
    }, 24 * 60 * 60 * 1000);

    // Start server
    const PORT = config.port;
    httpServer.listen(PORT, () => {
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
╚═══════════════════════════════════════════════════════╝
        `);
    });

    // Error handling for server
    httpServer.on('error', (err: any) => {
        if (err.code === 'EADDRINUSE') {
            logger.error(`Port ${PORT} is already in use`);
            process.exit(1);
        }
        logger.error('Server error:', err);
        process.exit(1);
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
        logger.info(`${signal} received. Starting graceful shutdown...`);

        // Stop accepting new connections
        httpServer.close(async () => {
            logger.info('HTTP server closed');

            // Cleanup
            clearInterval(cleanupInterval);
            await socketManager.shutdown();

            // Close database connections
            try {
                const mongoose = require('mongoose');
                await mongoose.connection.close();
                logger.info('Database connections closed');
            } catch (error) {
                logger.error('Error closing database:', error);
            }

            logger.info('Graceful shutdown completed');
            process.exit(0);
        });

        // Force shutdown after timeout
        setTimeout(() => {
            logger.error('Forced shutdown after timeout');
            process.exit(1);
        }, 10000);
    };

    // Handle shutdown signals
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason: Error) => {
        logger.error('Unhandled Rejection:', reason);
        if (config.nodeEnv === 'production') {
            gracefulShutdown('UNHANDLED_REJECTION');
        }
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error: Error) => {
        logger.error('Uncaught Exception:', error);
        if (config.nodeEnv === 'production') {
            gracefulShutdown('UNCAUGHT_EXCEPTION');
        }
    });

    return { app, httpServer, socketManager };
}

export default startServer;