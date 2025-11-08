import { IJWTPayload } from './index';
import 'express-serve-static-core';

declare module 'express-serve-static-core' {
    interface Request {
        user?: IJWTPayload;
        rateLimit?: {
            limit: number;
            current: number;
            remaining: number;
            resetTime: Date | undefined;
        };
    }
}