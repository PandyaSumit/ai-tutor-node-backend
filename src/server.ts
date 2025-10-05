// src/server.ts (or index.ts)
import express, { Application } from 'express';
import { createServer } from 'http';
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
import { SocketManager } from './services/socket/SocketManager';
import logger from './config/logger';

const app: Application = express();
const httpServer = createServer(app);

// Initialize Socket.IO
const socketManager = new SocketManager(httpServer);

// Connect to database
connectDB();

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
app.use(compression());

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
            maxAge: 24 * 60 * 60 * 1000, // 24 hours
        },
    })
);

// Passport initialization
app.use(passport.initialize());
app.use(passport.session());

// Rate limiting
app.use('/api', generalRateLimiter);

// Basic health check
app.get('/health', (_req, res) => {
    res.status(200).json({
        success: true,
        message: 'Server is healthy',
        timestamp: new Date().toISOString(),
    });
});

// Routes
app.use('/', healthRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/messages', messageRoutes);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

// Cleanup expired tokens periodically
setInterval(async () => {
    try {
        await RefreshToken.cleanupExpiredTokens();
        logger.info('Expired tokens cleaned up');
    } catch (error) {
        logger.error('Error cleaning up tokens:', error);
    }
}, 24 * 60 * 60 * 1000); // Every 24 hours

// Start server
const PORT = config.port;
httpServer.listen(PORT, () => {
    logger.info(`
╔══════════════════════════════════════════════
║   🚀 Server Started Successfully            ║
║                                             ║
║   Environment: ${config.nodeEnv.padEnd(21)} ║
║   Port: ${PORT.toString().padEnd(29)}       ║
║   API URL: ${config.apiUrl.padEnd(25)}      ║
║                                             ║
║   📚 Services:                              ║
║   REST API: ${config.apiUrl.padEnd(21)}     ║
║   WebSocket: ws://localhost:${PORT}         ║
║   Health: ${config.apiUrl}/health${' '.repeat(11)} ║
╚══════════════════════════════════════════════
    `);
});

// Error handling for server
httpServer.on('error', (err: any) => {
    if (err && err.code === 'EADDRINUSE') {
        logger.error(`Port ${PORT} is already in use. Another process is listening on this port.`);
        logger.error('To free the port on Windows run:');
        logger.error('  netstat -ano | findstr :' + PORT);
        logger.error('  taskkill /PID <PID_FROM_PREVIOUS_COMMAND> /F');
        process.exit(1);
    }
    logger.error('Server error:', err);
    process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: Error) => {
    logger.error('Unhandled Rejection:', reason);
    process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught Exception:', error);
    process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    logger.info('SIGTERM received. Closing HTTP server...');
    httpServer.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
    });
});

export default app;
export { socketManager };