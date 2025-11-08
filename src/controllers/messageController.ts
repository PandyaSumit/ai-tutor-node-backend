// src/controllers/messageController.ts - COMPLETE FIXED VERSION
import { Request, Response } from 'express';
import SessionService from '@/services/session/SessionService';
import logger from '@/config/logger';
import { AuthRequest } from '@/types';
import Message from '@/models/Message';

export class MessageController {
    private sessionService: SessionService;

    constructor() {
        this.sessionService = new SessionService();
    }

    /**
     * ✅ FIXED: Get session messages with proper error handling
     */
    async getSessionMessages(req: Request, res: Response): Promise<Response | void> {
        try {
            const { sessionId } = req.params;
            const { limit = '50', offset = '0' } = req.query;
            const authReq = req as AuthRequest;

            // ✅ Validate authentication
            if (!authReq.user?.userId) {
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required'
                });
            }

            const userId = authReq.user.userId;

            // ✅ Validate session ID
            if (!sessionId) {
                return res.status(400).json({
                    success: false,
                    message: 'Session ID is required'
                });
            }

            // ✅ Verify session ownership
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

            // ✅ Get messages with pagination
            const result = await this.sessionService.getSessionHistory(
                sessionId,
                Number(limit),
                Number(offset)
            );

            return res.json({
                success: true,
                data: {
                    messages: result.messages,
                    pagination: {
                        total: result.total,
                        limit: Number(limit),
                        offset: Number(offset),
                        hasMore: result.hasMore
                    }
                }
            });
        } catch (error) {
            logger.error('Get messages error:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to get messages'
            });
        }
    }

    /**
     * ✅ FIXED: Search messages with proper validation
     */
    async searchMessages(req: Request, res: Response): Promise<Response | void> {
        try {
            const authReq = req as AuthRequest;

            // ✅ Validate authentication
            if (!authReq.user?.userId) {
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required'
                });
            }

            const userId = authReq.user.userId;
            const { query, sessionId, limit = '20' } = req.query;

            // ✅ Validate search query
            if (!query || typeof query !== 'string' || query.trim().length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Search query is required'
                });
            }

            if (query.length < 2) {
                return res.status(400).json({
                    success: false,
                    message: 'Search query must be at least 2 characters'
                });
            }

            // ✅ Build search query
            const searchQuery: any = {
                userId,
                content: { $regex: query.trim(), $options: 'i' }
            };

            // ✅ If sessionId provided, verify access
            if (sessionId && typeof sessionId === 'string') {
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
                        message: 'Access denied to this session'
                    });
                }

                searchQuery.sessionId = session._id;
            }

            // ✅ Execute search
            const messages = await Message.find(searchQuery)
                .sort({ createdAt: -1 })
                .limit(Number(limit))
                .populate('sessionId', 'sessionId metadata.topic')
                .lean();

            return res.json({
                success: true,
                data: {
                    messages,
                    total: messages.length,
                    query: query.trim()
                }
            });
        } catch (error) {
            logger.error('Search messages error:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to search messages'
            });
        }
    }

    /**
     * ✅ FIXED: Get message by ID with ownership verification
     */
    async getMessage(req: Request, res: Response): Promise<Response | void> {
        try {
            const { messageId } = req.params;
            const authReq = req as AuthRequest;

            // ✅ Validate authentication
            if (!authReq.user?.userId) {
                return res.status(401).json({
                    success: false,
                    message: 'Authentication required'
                });
            }

            const userId = authReq.user.userId;

            // ✅ Validate messageId
            if (!messageId) {
                return res.status(400).json({
                    success: false,
                    message: 'Message ID is required'
                });
            }

            // ✅ Find message
            const message = await Message.findOne({
                _id: messageId,
                userId
            }).populate('sessionId', 'sessionId metadata.topic');

            if (!message) {
                return res.status(404).json({
                    success: false,
                    message: 'Message not found'
                });
            }

            return res.json({
                success: true,
                data: { message }
            });
        } catch (error) {
            logger.error('Get message error:', error);
            return res.status(500).json({
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
