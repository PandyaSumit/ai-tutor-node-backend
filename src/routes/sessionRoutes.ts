// src/routes/session.routes.ts
import { Router } from 'express';
import { SessionController } from '@/controllers/sessionController';
import { z } from 'zod';
import { authenticate } from '@/middlewares/authMiddleware';
import { validateRequest } from '@/middlewares/validationMiddleware';

const router = Router();
const sessionController = new SessionController();

// Validation schemas
const createSessionSchema = z.object({
    body: z.object({
        topic: z.string().optional(),
        metadata: z.record(z.any()).optional()
    })
});

// All routes require authentication
router.use(authenticate);

// Routes
router.post(
    '/',
    validateRequest(createSessionSchema),
    sessionController.createSession.bind(sessionController)
);

router.get(
    '/',
    sessionController.getUserSessions.bind(sessionController)
);

router.get(
    '/stats',
    sessionController.getSessionStats.bind(sessionController)
);

router.get(
    '/:sessionId',
    sessionController.getSession.bind(sessionController)
);

router.post(
    '/:sessionId/resume',
    sessionController.resumeSession.bind(sessionController)
);

router.delete(
    '/:sessionId',
    sessionController.endSession.bind(sessionController)
);

export default router;