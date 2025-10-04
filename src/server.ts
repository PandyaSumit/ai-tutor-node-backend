import express, { Application } from 'express';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import config from './config/env';
import connectDB from './config/database';
import passport from './config/passport';
import authRoutes from './routes/authRoutes';
import {
    helmetMiddleware,
    corsMiddleware,
    generalRateLimiter,
    mongoSanitizeMiddleware,
} from './middlewares/securityMiddleware';
import { errorHandler, notFoundHandler } from './middlewares/errorMiddleware';
import RefreshToken from './models/RefreshToken';

const app: Application = express();

connectDB();

app.set('trust proxy', 1);

app.use(helmetMiddleware);
app.use(corsMiddleware);
app.use(mongoSanitizeMiddleware);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(cookieParser());

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

app.use(passport.initialize());
app.use(passport.session());

app.use('/api', generalRateLimiter);

app.get('/health', (_req, res) => {
    res.status(200).json({
        success: true,
        message: 'Server is healthy',
        timestamp: new Date().toISOString(),
    });
});

app.use('/api/auth', authRoutes);

app.use(notFoundHandler);

app.use(errorHandler);

setInterval(async () => {
    try {
        await RefreshToken.cleanupExpiredTokens();
        console.log('✅ Expired tokens cleaned up');
    } catch (error) {
        console.error('❌ Error cleaning up tokens:', error);
    }
}, 24 * 60 * 60 * 1000);

// Start server and handle listen errors (EADDRINUSE)
const PORT = config.port;
const server = app.listen(PORT, () => {
    console.log(`
        ╔══════════════════════════════════════════════
        ║   🚀 Server Started Successfully            ║
        ║                                             ║
        ║   Environment: ${config.nodeEnv.padEnd(21)} ║
        ║   Port: ${PORT.toString().padEnd(29)}       ║
        ║   API URL: ${config.apiUrl.padEnd(25)}      ║
        ║                                             ║
        ║   📚 API Documentation:                     ║
        ║   ${config.apiUrl}/health${' '.repeat(16)}  ║
        ╚══════════════════════════════════════════════
    `);
});

server.on('error', (err: any) => {
    if (err && err.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use. Another process is listening on this port.`);
        console.error('To free the port on Windows run:');
        console.error('  netstat -ano | findstr :' + PORT);
        console.error('  taskkill /PID <PID_FROM_PREVIOUS_COMMAND> /F');
        process.exit(1);
    }
    console.error('Server error:', err);
    process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: Error) => {
    console.error('❌ Unhandled Rejection:', reason);
    process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
    console.error('❌ Uncaught Exception:', error);
    process.exit(1);
});

export default app;