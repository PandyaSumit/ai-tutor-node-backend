// src/routes/health.routes.ts
import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import RedisService from '@/services/external/RedisService';
import PythonAPIClient from '@/services/external/PythonAPIClient';

const router = Router();
const redisService = new RedisService();
const pythonClient = new PythonAPIClient();

router.get('/health', async (_req: Request, res: Response) => {
    const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        services: {
            mongodb: 'unknown',
            redis: 'unknown',
            pythonApi: 'unknown'
        }
    };

    try {
        // Check MongoDB
        health.services.mongodb = mongoose.connection.readyState === 1
            ? 'connected'
            : 'disconnected';

        // Check Redis
        try {
            await redisService.getCached('health-check');
            health.services.redis = 'connected';
        } catch {
            health.services.redis = 'disconnected';
        }

        // Check Python API
        const pythonHealthy = await pythonClient.healthCheck();
        health.services.pythonApi = pythonHealthy ? 'connected' : 'disconnected';

        // Overall status
        const allHealthy = Object.values(health.services).every(s => s === 'connected');
        health.status = allHealthy ? 'healthy' : 'degraded';

        const statusCode = allHealthy ? 200 : 503;
        res.status(statusCode).json(health);

    } catch (error) {
        health.status = 'unhealthy';
        res.status(503).json(health);
    }
});

router.get('/ready', async (_req: Request, res: Response) => {
    const isMongoReady = mongoose.connection.readyState === 1;

    if (isMongoReady) {
        res.status(200).json({ ready: true });
    } else {
        res.status(503).json({ ready: false });
    }
});

export default router;