// src/middlewares/authMiddleware.ts
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { AuthRequest, UserRole, IJWTPayload, IUser } from '@/types';
import jwtService from '@/services/jwtService';
import apiResponse from '@/utils/apiResponse';
import { COOKIE_NAMES } from '@/utils/cookieHelper';
import User from '@/models/User';

export const authenticate = async (
    req: Request,
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

        // cast to AuthRequest to set typed user
        (req as AuthRequest).user = decoded;

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
    return (req: Request, res: Response, next: NextFunction): void => {
        const authReq = req as AuthRequest;
        if (!authReq.user) {
            apiResponse.unauthorized(res, 'User not authenticated');
            return;
        }

        if (!allowedRoles.includes(authReq.user.role)) {
            apiResponse.forbidden(res, 'You do not have permission to access this resource');
            return;
        }

        next();
    };
};

export const optionalAuth = async (
    req: Request,
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
                (req as AuthRequest).user = decoded;
            } catch (error) {
                // Token invalid, but continue without authentication
            }
        }

        next();
    } catch (error) {
        next();
    }
};

export async function verifySocketToken(token: string): Promise<IJWTPayload> {
    try {

        const decoded = jwt.verify(token, process.env.JWT_SECRET!);

        if (typeof decoded === 'object' && decoded !== null && 'userId' in decoded) {
            const userId = (decoded as any).userId as string;

            const user: IUser | null = await User.findById(userId).select('email role isActive');

            if (!user || !user.isActive) throw new Error('User not found or inactive');

            return {
                userId: user._id,
                email: user.email,
                role: user.role
            };
        } else {
            throw new Error('Invalid token payload');
        }

    } catch (error) {
        throw new Error('Invalid token');
    }
}