import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import config from '@/config/env';
import { Request, Response, NextFunction } from 'express';
import apiResponse from '@/utils/apiResponse';

// ========================================
// Helmet - Security Headers
// ========================================
export const helmetMiddleware = helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", 'data:', 'https:'],
        },
    },
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
    },
});

// ========================================
// CORS Configuration
// ========================================
export const corsMiddleware = cors({
    origin: (origin, callback) => {
        const allowedOrigins = [config.cors.origin, config.frontendUrl];

        // Allow requests with no origin (mobile apps, postman, etc.)
        if (!origin) return callback(null, true);

        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true, // Allow cookies
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Set-Cookie'],
    maxAge: 86400, // 24 hours
});

// ========================================
// Rate Limiters (Industry Standard)
// ========================================

/**
 * Strict Auth Rate Limiter
 * For login/signup endpoints
 * Industry Standard: 10-20 attempts per 15 minutes
 */
export const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // ✅ Increased from 5 to 10 (industry standard)
    message: 'Too many authentication attempts, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    keyGenerator: (req: Request) => {
        return `${req.ip}-${req.headers['user-agent'] || 'unknown'}`;
    },
    handler: (req: Request, res: Response) => {
        // const retryAfter = req.rateLimit?.resetTime
        //     ? Math.ceil(req.rateLimit.resetTime.getTime() / 1000)
        //     : 60;
        const retryAfter = req.rateLimit?.resetTime
            ? Math.ceil((req.rateLimit.resetTime.getTime() - Date.now()) / 1000)
            : 60;
        res.setHeader('Retry-After', retryAfter);
        apiResponse.error(
            res,
            'Too many login attempts. Please try again later.',
            429
        );
    },
    // Skip rate limit for successful auth (optional)
    skip: (req: Request) => {
        // Skip if authenticated (has valid token)
        const token = req.cookies?.accessToken || req.headers.authorization;
        return !!token;
    },
});

/**
 * Strict Rate Limiter for Password Reset
 * Prevents brute force password reset attacks
 */
export const passwordResetRateLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // Only 3 attempts per hour
    message: 'Too many password reset attempts',
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => {
        // Rate limit by email if provided, else by IP
        const email = req.body?.email;
        return email ? `reset-${email}` : `reset-ip-${req.ip}`;
    },
    handler: (_req: Request, res: Response) => {
        apiResponse.error(
            res,
            'Too many password reset requests. Please try again later.',
            429
        );
    },
});

/**
 * General API Rate Limiter
 * For all other endpoints
 * Industry Standard: 100-1000 requests per 15 minutes
 */
export const generalRateLimiter = rateLimit({
    windowMs: config.rateLimit.windowMs || 15 * 60 * 1000,
    max: config.rateLimit.maxRequests || 100,
    message: 'Too many requests from this IP, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
    // Don't rate limit authenticated users as strictly
    skip: (req: Request) => {
        // Skip for authenticated requests with valid tokens
        const token = req.cookies?.accessToken || req.headers.authorization;
        return !!token;
    },
    handler: (_req: Request, res: Response) => {
        apiResponse.error(res, 'Rate limit exceeded', 429);
    },
});

/**
 * Aggressive Rate Limiter for Sensitive Operations
 * For operations like change password, delete account
 */
export const sensitiveOperationRateLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 5, // 5 attempts per hour
    message: 'Too many sensitive operation attempts',
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: Request) => {
        // Rate limit per user if authenticated
        const userId = (req as any).user?.userId;
        return userId ? `sensitive-${userId}` : `sensitive-ip-${req.ip}`;
    },
    handler: (_req: Request, res: Response) => {
        apiResponse.error(
            res,
            'Too many attempts. Please try again later.',
            429
        );
    },
});

// ========================================
// MongoDB Sanitization
// ========================================
const _mongoSanitize = mongoSanitize({
    replaceWith: '_',
    onSanitize: ({ req, key }) => {
        const ip = (req && (req as any).ip) || 'unknown';
        console.warn(`⚠️ Sanitized key: ${key} in request from ${ip}`);
    },
});

function ensureMutableProps(target: any, props: string[]) {
    for (const prop of props) {
        try {
            const desc = Object.getOwnPropertyDescriptor(target, prop) ||
                Object.getOwnPropertyDescriptor(Object.getPrototypeOf(target) || {}, prop);

            if (desc && desc.get && !desc.set) {
                const value = (target as any)[prop];
                Object.defineProperty(target, prop, {
                    configurable: true,
                    enumerable: true,
                    writable: true,
                    value: value === undefined ? {} : (Array.isArray(value) ? [...value] : { ...value }),
                });
            } else if (!desc) {
                if ((target as any)[prop] === undefined) {
                    Object.defineProperty(target, prop, {
                        configurable: true,
                        enumerable: true,
                        writable: true,
                        value: {},
                    });
                }
            }
        } catch (e) {
            // Ignore errors
        }
    }
}

export const mongoSanitizeMiddleware = (req: Request, res: Response, next: NextFunction) => {
    try {
        ensureMutableProps(req, ['query', 'body', 'params']);
        return _mongoSanitize(req as any, res as any, next as any);
    } catch (err) {
        console.warn('⚠️ mongoSanitize middleware failed, skipping sanitize for this request:', err);
        return next();
    }
};

// ========================================
// CSRF Protection (Optional)
// ========================================
export const csrfProtection = (req: Request, _res: Response, next: Function) => {
    if (req.path.startsWith('/api/')) {
        return next();
    }
    next();
};