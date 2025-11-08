// src/services/socket/handlers/MessageHandler.ts
// Create this directory: src/services/socket/handlers/
// Then create this file inside

import { Socket } from 'socket.io';
import SessionService from '@/services/session/SessionService';
import MessageQueue from '@/services/queue/MessageQueue';
import logger from '@/config/logger';

export class MessageHandler {
    private sessionService: SessionService;
    private messageQueue: MessageQueue;

    constructor() {
        this.sessionService = new SessionService();
        this.messageQueue = new MessageQueue();
    }

    /**
     * Handle text message
     */
    async handleMessage(socket: Socket, data: any): Promise<void> {
        const startTime = Date.now();

        try {
            const { sessionId, content } = data;
            const userId = socket.data.user?.userId?.toString();

            if (!userId) {
                socket.emit('error', {
                    code: 'UNAUTHORIZED',
                    message: 'User not authenticated'
                });
                return;
            }

            // Validate input
            if (!sessionId || !content) {
                socket.emit('error', {
                    code: 'INVALID_INPUT',
                    message: 'Session ID and content are required'
                });
                return;
            }

            if (typeof content !== 'string' || content.trim().length === 0) {
                socket.emit('error', {
                    code: 'INVALID_CONTENT',
                    message: 'Message content must be a non-empty string'
                });
                return;
            }

            if (content.length > 5000) {
                socket.emit('error', {
                    code: 'CONTENT_TOO_LONG',
                    message: 'Message content exceeds maximum length (5000 characters)'
                });
                return;
            }

            logger.info(`📨 Handling message from user ${userId} in session ${sessionId}`);

            // Verify session exists and user has access
            const session = await this.sessionService.getSession(sessionId);

            if (!session) {
                socket.emit('error', {
                    code: 'SESSION_NOT_FOUND',
                    message: 'Session not found'
                });
                return;
            }

            if (session.userId.toString() !== userId) {
                socket.emit('error', {
                    code: 'SESSION_ACCESS_DENIED',
                    message: 'You do not have access to this session'
                });
                return;
            }

            if (session.status !== 'active') {
                socket.emit('error', {
                    code: 'SESSION_INACTIVE',
                    message: 'Session is not active'
                });
                return;
            }

            // Save user message to database
            const userMessage = await this.sessionService.addMessage(
                sessionId,
                userId,
                'user',
                content.trim()
            );

            // Emit confirmation that user message was received
            socket.emit('message:sent', {
                messageId: userMessage._id,
                role: 'user',
                content: content.trim(),
                timestamp: userMessage.createdAt,
                sessionId
            });

            logger.info(`✅ User message saved: ${userMessage._id}`);

            // Get conversation context (last 10 messages)
            const history = await this.sessionService.getSessionHistory(sessionId, 10);

            const context = {
                messages: history.messages.map(msg => ({
                    role: msg.role,
                    content: msg.content,
                    timestamp: msg.createdAt
                })),
                sessionId,
                topic: session.metadata?.topic
            };

            // Queue LLM processing
            await this.messageQueue.addToLLMQueue({
                sessionId,
                userId,
                messageId: userMessage._id.toString(),
                content: content.trim(),
                context
            });

            logger.info(`⏭️  Message queued for LLM processing`, {
                messageId: userMessage._id,
                duration: Date.now() - startTime
            });

        } catch (error) {
            logger.error('❌ Error handling message:', error);

            socket.emit('error', {
                code: 'MESSAGE_PROCESSING_ERROR',
                message: error instanceof Error ? error.message : 'Failed to process message'
            });
        }
    }

    /**
     * Handle voice message
     */
    async handleVoiceMessage(socket: Socket, data: any): Promise<void> {
        try {
            const { sessionId, audioData, format } = data;
            const userId = socket.data.user?.userId?.toString();

            if (!userId) {
                socket.emit('error', {
                    code: 'UNAUTHORIZED',
                    message: 'User not authenticated'
                });
                return;
            }

            if (!sessionId || !audioData) {
                socket.emit('error', {
                    code: 'INVALID_INPUT',
                    message: 'Session ID and audio data are required'
                });
                return;
            }

            logger.info(`🎤 Handling voice message from user ${userId}`);

            const session = await this.sessionService.getSession(sessionId);

            if (!session) {
                socket.emit('error', {
                    code: 'SESSION_NOT_FOUND',
                    message: 'Session not found'
                });
                return;
            }

            if (session.userId.toString() !== userId) {
                socket.emit('error', {
                    code: 'SESSION_ACCESS_DENIED',
                    message: 'Access denied'
                });
                return;
            }

            socket.emit('voice:processing', {
                status: 'transcribing',
                timestamp: Date.now()
            });

            // TODO: Implement voice transcription with Python API
            socket.emit('voice:transcribed', {
                text: '[Voice transcription not yet implemented]',
                confidence: 0,
                timestamp: Date.now()
            });

            logger.info(`✅ Voice message processed`);

        } catch (error) {
            logger.error('❌ Error handling voice message:', error);

            socket.emit('error', {
                code: 'VOICE_PROCESSING_ERROR',
                message: 'Failed to process voice message'
            });
        }
    }

    /**
     * Set message queue instance
     */
    public setMessageQueue(queue: MessageQueue): void {
        this.messageQueue = queue;
    }
}