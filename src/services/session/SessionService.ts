import { v4 as uuidv4 } from 'uuid';
import logger from '@/config/logger';
import Session, { ISession } from '@/models/Session';
import Message, { IMessageData } from '@/models/Message';
import mongoose from 'mongoose';

export default class SessionService {
    async createSession(
        userId: string,
        topic?: string,
        metadata?: Record<string, any>
    ): Promise<ISession> {
        const session = await Session.create({
            userId,
            sessionId: uuidv4(),
            status: 'active',
            contextWindow: {
                messages: [],
                maxTokens: 4000
            },
            metadata: {
                startTime: new Date(),
                lastActivity: new Date(),
                messageCount: 0,
                topic,
                ...metadata
            }
        });

        logger.info(`Session created: ${session.sessionId} for user: ${userId}`);
        return session;
    }

    async getSession(sessionId: string): Promise<ISession | null> {
        return Session.findOne({ sessionId });
    }

    async resumeSession(
        sessionId: string,
        userId: string
    ): Promise<ISession | null> {
        const session = await Session.findOne({ sessionId, userId });

        if (session && session.status !== 'ended') {
            session.status = 'active';
            session.metadata.lastActivity = new Date();
            await session.save();

            logger.info(`Session resumed: ${sessionId}`);
            return session;
        }

        return null;
    }

    async endSession(sessionId: string, userId: string): Promise<void> {
        await Session.findOneAndUpdate(
            { sessionId, userId },
            {
                status: 'ended',
                'metadata.lastActivity': new Date()
            }
        );

        logger.info(`Session ended: ${sessionId}`);
    }

    async addMessage(
        sessionId: string,
        userId: string,
        role: 'user' | 'assistant' | 'system',
        content: string
    ): Promise<IMessageData> {
        const session = await Session.findOne({ sessionId });

        if (!session) {
            throw new Error('Session not found');
        }

        const message = await Message.create({
            sessionId: session._id,
            userId: new mongoose.Types.ObjectId(userId),
            role,
            content,
            metadata: {
                latency: undefined,
                llmModel: undefined,
                tokens: undefined,
                confidence: undefined
            }
        });

        const newMessage = { role, content, timestamp: new Date() };
        const maxMessages = 20;

        let messages = [...session.contextWindow.messages, newMessage];
        if (messages.length > maxMessages) {
            messages = messages.slice(-maxMessages);
        }

        await Session.findByIdAndUpdate(session._id, {
            $set: {
                'contextWindow.messages': messages,
                'metadata.lastActivity': new Date()
            },
            $inc: { 'metadata.messageCount': 1 }
        });

        // Return plain object with proper typing
        return {
            _id: message._id as mongoose.Types.ObjectId,
            sessionId: message.sessionId,
            userId: message.userId,
            role: message.role,
            content: message.content,
            metadata: message.metadata,
            createdAt: message.createdAt,
            updatedAt: message.updatedAt
        };
    }

    async getSessionHistory(
        sessionId: string,
        limit: number = 50,
        offset: number = 0
    ): Promise<{ messages: IMessageData[]; total: number; hasMore: boolean }> {
        const session = await Session.findOne({ sessionId }).select('_id').lean();

        if (!session) {
            throw new Error('Session not found');
        }

        // ✅ Single aggregation query
        const [result] = await Message.aggregate([
            { $match: { sessionId: session._id } },
            {
                $facet: {
                    messages: [
                        { $sort: { createdAt: -1 } },
                        { $skip: offset },
                        { $limit: limit }
                    ],
                    totalCount: [
                        { $count: 'count' }
                    ]
                }
            }
        ]);

        const total = result.totalCount[0]?.count || 0;
        const messages = result.messages;

        return {
            messages,
            total,
            hasMore: offset + limit < total
        };
    }

    async getUserSessions(
        userId: string,
        status?: string
    ): Promise<ISession[]> {
        const query: Record<string, any> = { userId };
        if (status) query.status = status;

        return Session.find(query)
            .sort({ 'metadata.lastActivity': -1 })
            .limit(20);
    }

    async cleanupOldSessions(daysOld: number = 30): Promise<number> {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysOld);

        const result = await Session.deleteMany({
            status: 'ended',
            'metadata.lastActivity': { $lt: cutoffDate }
        });

        logger.info(`Cleaned up ${result.deletedCount} old sessions`);
        return result.deletedCount ?? 0;
    }
}