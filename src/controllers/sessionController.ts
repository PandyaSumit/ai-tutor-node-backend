// src/controllers/sessionController.ts - COMPLETE FIXED VERSION
import { Request, Response } from 'express';
import SessionService from '@/services/session/SessionService';
import logger from '@/config/logger';
import { AuthRequest } from '@/types';

export class SessionController {
    private sessionService: SessionService;

    constructor() {
        this.sessionService = new SessionService();
    }

    async createSession(req: Request, res: Response): Promise<Response> {
        try {
            const authReq = req as AuthRequest;

            if (!authReq.user?.userId) {
                return res.status(401).json({
                    success: false,
                    message: 'User not authenticated'
                });
            }

            const userId = authReq.user.userId;
            const { topic, metadata } = req.body;

            if (topic && typeof topic !== 'string') {
                return res.status(400).json({
                    success: false,
                    message: 'Topic must be a string'
                });
            }

            const session = await this.sessionService.createSession(
                userId,
                topic,
                metadata
            );

            logger.info(`Session created: ${session.sessionId} by user: ${userId}`);

            return res.status(201).json({
                success: true,
                data: {
                    session: {
                        id: session._id,
                        sessionId: session.sessionId,
                        topic: session.metadata.topic,
                        status: session.status,
                        createdAt: session.createdAt
                    }
                }
            });
        } catch (error) {
            logger.error('Create session error:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to create session'
            });
        }
    }

    async getUserSessions(req: Request, res: Response): Promise<Response> {
        try {
            const authReq = req as AuthRequest;

            if (!authReq.user?.userId) {
                return res.status(401).json({
                    success: false,
                    message: 'User not authenticated'
                });
            }

            const userId = authReq.user.userId;
            const { status, limit = '20', page = '1' } = req.query;

            const sessions = await this.sessionService.getUserSessions(
                userId,
                status as string
            );

            const pageNum = Number(page);
            const limitNum = Number(limit);
            const startIndex = (pageNum - 1) * limitNum;
            const endIndex = startIndex + limitNum;
            const paginatedSessions = sessions.slice(startIndex, endIndex);

            return res.json({
                success: true,
                data: {
                    sessions: paginatedSessions,
                    pagination: {
                        total: sessions.length,
                        page: pageNum,
                        limit: limitNum,
                        pages: Math.ceil(sessions.length / limitNum)
                    }
                }
            });
        } catch (error) {
            logger.error('Get sessions error:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to get sessions'
            });
        }
    }

    async getSession(req: Request, res: Response): Promise<Response> {
        try {
            const { sessionId } = req.params;
            const authReq = req as AuthRequest;

            if (!authReq.user?.userId) {
                return res.status(401).json({
                    success: false,
                    message: 'User not authenticated'
                });
            }

            const userId = authReq.user.userId;

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

            return res.json({
                success: true,
                data: { session }
            });

        } catch (error) {
            logger.error('Get session error:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to get session'
            });
        }
    }

    async resumeSession(req: Request, res: Response): Promise<Response> {
        try {
            const { sessionId } = req.params;
            const authReq = req as AuthRequest;

            if (!authReq.user?.userId) {
                return res.status(401).json({
                    success: false,
                    message: 'User not authenticated'
                });
            }

            const userId = authReq.user.userId;

            const session = await this.sessionService.resumeSession(
                sessionId,
                userId
            );

            if (!session) {
                return res.status(404).json({
                    success: false,
                    message: 'Session not found or already ended'
                });
            }

            return res.json({
                success: true,
                data: { session }
            });
        } catch (error) {
            logger.error('Resume session error:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to resume session'
            });
        }
    }

    async endSession(req: Request, res: Response): Promise<Response> {
        try {
            const { sessionId } = req.params;
            const authReq = req as AuthRequest;

            if (!authReq.user?.userId) {
                return res.status(401).json({
                    success: false,
                    message: 'User not authenticated'
                });
            }

            const userId = authReq.user.userId;

            await this.sessionService.endSession(sessionId, userId);

            return res.json({
                success: true,
                message: 'Session ended successfully'
            });
        } catch (error) {
            logger.error('End session error:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to end session'
            });
        }
    }

    async getSessionStats(req: Request, res: Response): Promise<Response> {
        try {
            const authReq = req as AuthRequest;

            if (!authReq.user?.userId) {
                return res.status(401).json({
                    success: false,
                    message: 'User not authenticated'
                });
            }

            const userId = authReq.user.userId;

            const sessions = await this.sessionService.getUserSessions(userId);

            const stats = {
                total: sessions.length,
                active: sessions.filter((s: any) => s.status === 'active').length,
                completed: sessions.filter((s: any) => s.status === 'ended').length,
                totalMessages: sessions.reduce((sum: number, s: any) => sum + s.metadata.messageCount, 0),
                averageMessagesPerSession: sessions.length > 0
                    ? sessions.reduce((sum: number, s: any) => sum + s.metadata.messageCount, 0) / sessions.length
                    : 0
            };

            return res.json({
                success: true,
                data: { stats }
            });
        } catch (error) {
            logger.error('Get stats error:', error);
            return res.status(500).json({
                success: false,
                message: 'Failed to get statistics'
            });
        }
    }
}