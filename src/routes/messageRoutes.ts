// src/routes/message.routes.ts
import { Router } from 'express';
import { authenticate } from '@/middlewares/authMiddleware';
import { MessageController } from '@/controllers/messageController';

const router = Router();
const messageController = new MessageController();

// All routes require authentication
router.use(authenticate);

// Routes
router.get(
    '/session/:sessionId',
    messageController.getSessionMessages.bind(messageController)
);

router.get(
    '/search',
    messageController.searchMessages.bind(messageController)
);

router.get(
    '/:messageId',
    messageController.getMessage.bind(messageController)
);

router.delete(
    '/:messageId',
    messageController.deleteMessage.bind(messageController)
);

export default router;