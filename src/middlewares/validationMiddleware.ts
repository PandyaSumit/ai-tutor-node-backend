import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import apiResponse from '../utils/apiResponse';

export const validateBody = (schema: ZodSchema) => {
    return (req: Request, res: Response, next: NextFunction): void => {
        try {
            schema.parse(req.body);
            next();
        } catch (error) {
            if (error instanceof ZodError) {
                const zError = error as ZodError<any>;
                const errors = zError.issues.map((err: any) => ({
                    field: (err.path || []).join('.'),
                    message: err.message,
                }));
                apiResponse.validationError(res, 'Validation failed', errors);
            } else {
                apiResponse.badRequest(res, 'Invalid request data');
            }
        }
    };
};

export const validateQuery = (schema: ZodSchema) => {
    return (req: Request, res: Response, next: NextFunction): void => {
        try {
            schema.parse(req.query);
            next();
        } catch (error) {
            if (error instanceof ZodError) {
                const zError = error as ZodError<any>;
                const errors = zError.issues.map((err: any) => ({
                    field: (err.path || []).join('.'),
                    message: err.message,
                }));
                apiResponse.validationError(res, 'Query validation failed', errors);
            } else {
                apiResponse.badRequest(res, 'Invalid query parameters');
            }
        }
    };
};

export const validateParams = (schema: ZodSchema) => {
    return (req: Request, res: Response, next: NextFunction): void => {
        try {
            schema.parse(req.params);
            next();
        } catch (error) {
            if (error instanceof ZodError) {
                const zError = error as ZodError<any>;
                const errors = zError.issues.map((err: any) => ({
                    field: (err.path || []).join('.'),
                    message: err.message,
                }));
                apiResponse.validationError(res, 'Params validation failed', errors);
            } else {
                apiResponse.badRequest(res, 'Invalid URL parameters');
            }
        }
    };
};