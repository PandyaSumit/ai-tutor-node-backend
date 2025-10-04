import { Request, Response, NextFunction } from 'express';
import config from '../config/env';
import apiResponse from '../utils/apiResponse';

interface ErrorWithStatus extends Error {
    statusCode?: number;
    status?: string;
    isOperational?: boolean;
}

export const errorHandler = (
    err: ErrorWithStatus,
    _req: Request,
    res: Response,
    _next: NextFunction
): void => {
    err.statusCode = err.statusCode || 500;
    err.status = err.status || 'error';

    if (config.nodeEnv === 'development') {
        console.error('Error:', err);
    }

    if (err.name === 'MongoError' && (err as any).code === 11000) {
        const field = Object.keys((err as any).keyValue)[0];
        apiResponse.conflict(res, `${field} already exists`);
        return;
    }

    if (err.name === 'ValidationError') {
        const errors = Object.values((err as any).errors).map((e: any) => ({
            field: e.path,
            message: e.message,
        }));
        apiResponse.validationError(res, 'Validation failed', errors);
        return;
    }

    if (err.name === 'CastError') {
        apiResponse.badRequest(res, 'Invalid ID format');
        return;
    }

    if (err.name === 'JsonWebTokenError') {
        apiResponse.unauthorized(res, 'Invalid token');
        return;
    }

    if (err.name === 'TokenExpiredError') {
        apiResponse.unauthorized(res, 'Token expired');
        return;
    }

    const statusCode = err.statusCode || 500;
    const message = config.nodeEnv === 'production' && statusCode === 500
        ? 'Internal server error'
        : err.message;

    apiResponse.error(res, message, statusCode, config.nodeEnv === 'development' ? err.stack : undefined);
};

export const notFoundHandler = (_req: Request, res: Response, _next: NextFunction): void => {
    apiResponse.notFound(res, `Route ${_req.originalUrl} not found`);
};

export const asyncHandler = (fn: Function) => {
    return (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};