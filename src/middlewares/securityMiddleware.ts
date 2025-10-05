import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import mongoSanitize from 'express-mongo-sanitize';
import config from '@/config/env';
import { Request, Response, NextFunction } from 'express';
import apiResponse from '@/utils/apiResponse';

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

export const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 requests per window
    message: 'Too many authentication attempts, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req: Request, res: Response) => {
        apiResponse.error(res, 'Too many requests, please try again later', 429);
    },
});

export const generalRateLimiter = rateLimit({
    windowMs: config.rateLimit.windowMs,
    max: config.rateLimit.maxRequests,
    message: 'Too many requests from this IP, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req: Request, res: Response) => {
        apiResponse.error(res, 'Rate limit exceeded', 429);
    },
});

// Create an instance of the sanitizer middleware and wrap it to avoid
// throwing if the request object has read-only properties in some environments.
const _mongoSanitize = mongoSanitize({
    replaceWith: '_',
    onSanitize: ({ req, key }) => {
        // avoid accessing req properties directly in case they're implemented as getters only
        const ip = (req && (req as any).ip) || 'unknown';
        console.warn(`Sanitized key: ${key} in request from ${ip}`);
    },
});

function ensureMutableProps(target: any, props: string[]) {
    for (const prop of props) {
        try {
            const desc = Object.getOwnPropertyDescriptor(target, prop) || Object.getOwnPropertyDescriptor(Object.getPrototypeOf(target) || {}, prop);
            // if descriptor exists and is not writable (getter-only), replace with an own-writable copy
            if (desc && desc.get && !desc.set) {
                const value = (target as any)[prop];
                Object.defineProperty(target, prop, {
                    configurable: true,
                    enumerable: true,
                    writable: true,
                    value: value === undefined ? {} : (Array.isArray(value) ? [...value] : { ...value }),
                });
            } else if (!desc) {
                // no descriptor found (rare) — ensure property exists as object
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
            // ignore — we'll handle sanitizer errors by skipping
        }
    }
}

export const mongoSanitizeMiddleware = (req: Request, res: Response, next: NextFunction) => {
    try {
        ensureMutableProps(req, ['query', 'body', 'params']);

        return _mongoSanitize(req as any, res as any, next as any);
    } catch (err) {
        console.warn('mongoSanitize middleware failed, skipping sanitize for this request:', err);
        return next();
    }
};

export const csrfProtection = (req: Request, _res: Response, next: Function) => {
    if (req.path.startsWith('/api/')) {
        return next();
    }

    next();
};