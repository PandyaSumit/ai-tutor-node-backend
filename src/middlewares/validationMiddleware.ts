import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError, AnyZodObject } from 'zod';
import apiResponse from '@/utils/apiResponse';
import logger from '@/config/logger';

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


export function validateRequest(schema: AnyZodObject) {
    return async (req: Request, res: Response, next: NextFunction): Promise<Response | void> => {
        try {
            await schema.parseAsync({
                body: req.body,
                query: req.query,
                params: req.params
            });
            next();
        } catch (error) {
            if (error instanceof ZodError) {
                const errors = error.errors.map(err => ({
                    field: err.path.join('.'),
                    message: err.message
                }));

                logger.warn('Validation error:', errors);

                return res.status(400).json({
                    success: false,
                    message: 'Validation error',
                    errors
                });
            }

            logger.error('Validation middleware error:', error);
            return res.status(500).json({
                success: false,
                message: 'Validation failed'
            });
        }
    };
}