// src/controllers/message.controller.ts
import { Request, Response } from 'express';
import SessionService from '@/services/session/SessionService';
import logger from '@/config/logger';

export class MessageController {
    private sessionService: SessionService;

    constructor() {
        this.sessionService = new SessionService();
    }

    // Get session messages
    async getSessionMessages(req: Request, res: Response): Promise<Response | void> {
        try {
            const { sessionId } = req.params;
            const { limit = 50 } = req.query;
            const userId = req.user?.id;

            // Verify session ownership
            const session = await this.sessionService.getSession(sessionId);
            if (!session) {
                return res.status(404).json({
                    success: false,
                    message: 'Session not found'
                });
            }

            if (session.userId.toString() !== userId) {
                return res.status(403).json({
                    success: false,
                    message: 'Access denied'
                });
            }

            const messages = await this.sessionService.getSessionHistory(
                sessionId,
                Number(limit)
            );

            res.json({
                success: true,
                data: {
                    messages,
                    hasMore: messages.length === Number(limit)
                }
            });
        } catch (error) {
            logger.error('Get messages error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get messages'
            });
        }
    }

    // Search messages
    async searchMessages(req: Request, res: Response) {
        try {
            const userId = req.user?.id;
            const { query, sessionId, limit = 20 } = req.query;

            const Message = require('../models/Message').default;

            const searchQuery: any = {
                userId,
                content: { $regex: query, $options: 'i' }
            };

            if (sessionId) {
                const session = await this.sessionService.getSession(sessionId as string);
                if (session) {
                    searchQuery.sessionId = session._id;
                }
            }

            const messages = await Message.find(searchQuery)
                .sort({ createdAt: -1 })
                .limit(Number(limit))
                .populate('sessionId', 'sessionId metadata.topic');

            res.json({
                success: true,
                data: {
                    messages,
                    total: messages.length
                }
            });
        } catch (error) {
            logger.error('Search messages error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to search messages'
            });
        }
    }

    // Get message by ID
    async getMessage(req: Request, res: Response): Promise<Response | void> {
        try {
            const { messageId } = req.params;
            const userId = req.user?.id;

            const Message = require('../models/Message').default;
            const message = await Message.findOne({
                _id: messageId,
                userId
            });

            if (!message) {
                return res.status(404).json({
                    success: false,
                    message: 'Message not found'
                });
            }

            res.json({
                success: true,
                data: { message }
            });
        } catch (error) {
            logger.error('Get message error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get message'
            });
        }
    }

    // Delete message
    async deleteMessage(req: Request, res: Response): Promise<Response | void> {
        try {
            const { messageId } = req.params;
            const userId = req.user?.id;

            const Message = require('../models/Message').default;
            const message = await Message.findOneAndDelete({
                _id: messageId,
                userId
            });

            if (!message) {
                return res.status(404).json({
                    success: false,
                    message: 'Message not found'
                });
            }

            res.json({
                success: true,
                message: 'Message deleted successfully'
            });
        } catch (error) {
            logger.error('Delete message error:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to delete message'
            });
        }
    }
}
