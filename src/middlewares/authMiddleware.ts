import { Response, NextFunction } from 'express';
import { AuthRequest, UserRole } from '../types';
import jwtService from '../services/jwtService';
import apiResponse from '../utils/apiResponse';
import { COOKIE_NAMES } from '../utils/cookieHelper';

export const authenticate = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        let token = req.cookies[COOKIE_NAMES.ACCESS_TOKEN];

        if (!token) {
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.startsWith('Bearer ')) {
                token = authHeader.substring(7);
            }
        }

        if (!token) {
            apiResponse.unauthorized(res, 'Access token not found');
            return;
        }

        const decoded = jwtService.verifyAccessToken(token);

        req.user = decoded;

        next();
    } catch (error: any) {
        if (error.message === 'Access token expired') {
            apiResponse.unauthorized(res, 'Access token expired');
        } else if (error.message === 'Invalid access token') {
            apiResponse.unauthorized(res, 'Invalid access token');
        } else {
            apiResponse.unauthorized(res, 'Authentication failed');
        }
    }
};

export const authorize = (...allowedRoles: UserRole[]) => {
    return (req: AuthRequest, res: Response, next: NextFunction): void => {
        if (!req.user) {
            apiResponse.unauthorized(res, 'User not authenticated');
            return;
        }

        if (!allowedRoles.includes(req.user.role)) {
            apiResponse.forbidden(res, 'You do not have permission to access this resource');
            return;
        }

        next();
    };
};

export const optionalAuth = async (
    req: AuthRequest,
    _res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        let token = req.cookies[COOKIE_NAMES.ACCESS_TOKEN];

        if (!token) {
            const authHeader = req.headers.authorization;
            if (authHeader && authHeader.startsWith('Bearer ')) {
                token = authHeader.substring(7);
            }
        }

        if (token) {
            try {
                const decoded = jwtService.verifyAccessToken(token);
                req.user = decoded;
            } catch (error) {
                // Token invalid, but continue without authentication
            }
        }

        next();
    } catch (error) {
        next();
    }
};