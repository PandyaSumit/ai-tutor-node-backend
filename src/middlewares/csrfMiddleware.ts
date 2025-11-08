// src/middlewares/csrfMiddleware.ts
import { Response, NextFunction } from 'express';
import crypto from 'crypto';
import apiResponse from '@/utils/apiResponse';
import { AuthRequest } from '@/types';

/**
 * CSRF Token Store
 * In production, use Redis for distributed systems
 * For now, using in-memory store (will work in single-instance deployments)
 */
const csrfTokens = new Map<string, { token: string; createdAt: number }>();

// Clean up old tokens every hour
setInterval(() => {
    const now = Date.now();
    const EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

    for (const [userId, data] of csrfTokens.entries()) {
        if (now - data.createdAt > EXPIRY) {
            csrfTokens.delete(userId);
        }
    }
}, 60 * 60 * 1000);

/**
 * Generate a CSRF token for a user
 */
export function generateCsrfToken(userId: string): string {
    const token = crypto.randomBytes(32).toString('hex');
    csrfTokens.set(userId, { token, createdAt: Date.now() });
    return token;
}

/**
 * Get CSRF token endpoint
 * GET /api/csrf-token
 */
export const getCsrfToken = (req: AuthRequest, res: Response): void => {
    if (!req.user) {
        apiResponse.unauthorized(res, 'Authentication required');
        return;
    }

    const token = generateCsrfToken(req.user.userId);

    apiResponse.success(res, 'CSRF token generated', { csrfToken: token });
};

/**
 * Verify CSRF token middleware
 * Use this on all state-changing operations (POST, PUT, DELETE)
 */
export const verifyCsrfToken = (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): void => {
    // Skip CSRF for GET, HEAD, OPTIONS
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        next();
        return;
    }

    if (!req.user) {
        apiResponse.unauthorized(res, 'Authentication required');
        return;
    }

    // Get token from header
    const csrfToken = req.headers['x-csrf-token'] as string;

    if (!csrfToken) {
        apiResponse.forbidden(res, 'CSRF token missing');
        return;
    }

    // Verify token
    const storedData = csrfTokens.get(req.user.userId);

    if (!storedData) {
        apiResponse.forbidden(res, 'CSRF token expired or invalid');
        return;
    }

    if (storedData.token !== csrfToken) {
        apiResponse.forbidden(res, 'Invalid CSRF token');
        return;
    }

    // Check if token is expired (24 hours)
    const EXPIRY = 24 * 60 * 60 * 1000;
    if (Date.now() - storedData.createdAt > EXPIRY) {
        csrfTokens.delete(req.user.userId);
        apiResponse.forbidden(res, 'CSRF token expired');
        return;
    }

    next();
};

/**
 * Optional CSRF protection (doesn't fail if token is missing)
 * Useful for endpoints that can be accessed both from web and mobile
 */
export const optionalCsrfToken = (
    req: AuthRequest,
    _res: Response,
    next: NextFunction
): void => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        next();
        return;
    }

    const csrfToken = req.headers['x-csrf-token'] as string;

    if (csrfToken && req.user) {
        const storedData = csrfTokens.get(req.user.userId);
        if (storedData && storedData.token === csrfToken) {
            // Valid token, continue
            next();
            return;
        }
    }

    // No token or invalid token, but we allow it for mobile apps
    next();
};
