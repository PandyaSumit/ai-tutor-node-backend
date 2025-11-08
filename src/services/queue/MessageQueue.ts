// src/services/queue/MessageQueue.ts - FIXED Bull Queue Redis Configuration
import Bull, { Queue, Job } from 'bull';
import PythonAPIClient from '../external/PythonAPIClient';
import { SocketManager } from '../socket/SocketManager';
import logger from '@/config/logger';
import Message from '@/models/Message';
import Session from '@/models/Session';
import mongoose from 'mongoose';

interface LLMJobData {
    sessionId: string;
    userId: string;
    messageId: string;
    content: string;
    context: any;
}

export default class MessageQueue {
    private llmQueue: Queue | null = null;
    private notificationQueue: Queue | null = null;
    private pythonClient: PythonAPIClient;
    private socketManager: SocketManager | null = null;
    private fallbackMode: boolean = false;

    constructor(
        private readonly messageModel = Message,
        private readonly sessionModel = Session
    ) {
        // ✅ FIXED: Correct Redis configuration for Bull
        const redisConfig = {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            password: process.env.REDIS_PASSWORD || undefined,
            // ✅ CRITICAL: Remove these options for Bull queue
            // enableReadyCheck: false,
            // maxRetriesPerRequest: null,
            retryStrategy: (times: number) => {
                if (times > 3) {
                    logger.error('❌ Redis connection failed for Bull queue after 3 retries');
                    return null; // Stop retrying
                }
                const delay = Math.min(times * 50, 2000);
                logger.warn(`⚠️  Redis retry attempt ${times}, waiting ${delay}ms`);
                return delay;
            }
        };

        this.pythonClient = new PythonAPIClient();

        try {
            // Initialize LLM Queue
            this.llmQueue = new Bull('llm-processing', {
                redis: redisConfig,
                defaultJobOptions: {
                    attempts: 3,
                    backoff: {
                        type: 'exponential',
                        delay: 2000
                    },
                    removeOnComplete: 100,
                    removeOnFail: false,
                    timeout: 60000 // 60 second timeout
                }
            });

            // Initialize Notification Queue
            this.notificationQueue = new Bull('notifications', {
                redis: redisConfig,
                defaultJobOptions: {
                    attempts: 2,
                    backoff: {
                        type: 'fixed',
                        delay: 1000
                    },
                    removeOnComplete: true,
                    removeOnFail: false
                }
            });
            console.log("Working")
            this.setupProcessors();
            this.setupEventHandlers();

            logger.info('✅ Message queues initialized successfully');
        } catch (error) {
            logger.error('❌ Failed to initialize Bull queues:', error);
            this.fallbackMode = true;
            logger.warn('⚠️  Running in fallback mode (direct processing without queue)');
        }
    }

    public setSocketManager(socketManager: SocketManager) {
        this.socketManager = socketManager;
        logger.info('✅ SocketManager linked to MessageQueue');
    }

    private setupProcessors() {
        if (!this.llmQueue || !this.notificationQueue) {
            logger.warn('⚠️  Queues not initialized, skipping processor setup');
            return;
        }

        // LLM processing with concurrency control
        this.llmQueue.process(5, async (job: Job) => {
            return this.processLLMRequest(job);
        });

        // Notification processing
        this.notificationQueue.process(10, async (job: Job) => {
            return this.processNotification(job);
        });

        logger.info('✅ Queue processors configured');
    }

    private setupEventHandlers() {
        if (!this.llmQueue) return;

        this.llmQueue.on('completed', (job, result) => {
            logger.info(`✅ LLM job completed: ${job.id}`, {
                messageId: result?.messageId,
                duration: Date.now() - job.timestamp
            });
        });

        this.llmQueue.on('failed', (job, err) => {
            logger.error(`❌ LLM job failed: ${job?.id}`, {
                error: err.message,
                attempts: job?.attemptsMade,
                data: job?.data
            });
        });

        this.llmQueue.on('stalled', (job) => {
            logger.warn(`⚠️  LLM job stalled: ${job.id}`);
        });

        this.llmQueue.on('error', (error) => {
            logger.error('❌ LLM Queue error:', error);
        });

        logger.info('✅ Queue event handlers configured');
    }

    private async processLLMRequest(job: Job<LLMJobData>): Promise<any> {
        const { sessionId, userId, content, context } = job.data;
        const startTime = Date.now();

        try {
            logger.info(`🔄 Processing LLM request for session: ${sessionId}`);

            const session = await this.sessionModel.findOne({ sessionId, status: 'active' });
            if (!session) {
                throw new Error(`Session ${sessionId} not found or inactive`);
            }

            await job.progress(20);

            if (this.socketManager) {
                this.socketManager.emitToSession(sessionId, 'assistant:thinking', {
                    status: 'processing',
                    timestamp: Date.now()
                });
            }

            await job.progress(40);

            const response = await this.pythonClient.generateResponse({
                message: content,
                context: context.messages,
                sessionId,
                userId,
                stream: true
            });

            await job.progress(60);

            let fullResponse = '';
            const streamTimeout = setTimeout(() => {
                throw new Error('Stream timeout after 60 seconds');
            }, 60000);

            try {
                for await (const chunk of response) {
                    fullResponse += chunk.content;

                    if (this.socketManager) {
                        this.socketManager.emitToSession(sessionId, 'message:partial', {
                            content: chunk.content,
                            isDone: false
                        });
                    }
                }
            } finally {
                clearTimeout(streamTimeout);
            }

            await job.progress(80);

            if (!fullResponse || fullResponse.trim().length === 0) {
                throw new Error('Empty response from LLM');
            }

            const assistantMessage = await this.saveAssistantMessage(
                (session._id as mongoose.Types.ObjectId).toString(),
                userId,
                fullResponse
            );

            await job.progress(100);

            if (this.socketManager) {
                this.socketManager.emitToSession(sessionId, 'message:received', {
                    messageId: assistantMessage._id,
                    role: 'assistant',
                    content: fullResponse,
                    timestamp: assistantMessage.createdAt,
                    metadata: {
                        duration: Date.now() - startTime,
                        tokens: assistantMessage.metadata?.tokens
                    }
                });
            }

            return {
                success: true,
                messageId: assistantMessage._id,
                content: fullResponse,
                duration: Date.now() - startTime
            };

        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            logger.error('❌ Error processing LLM request', {
                sessionId,
                userId,
                error: errorMessage,
                duration: Date.now() - startTime
            });

            if (this.socketManager) {
                this.socketManager.emitToUser(userId, 'error', {
                    message: 'Failed to generate response',
                    sessionId,
                    error: errorMessage
                });
            }

            throw error;
        }
    }

    private async saveAssistantMessage(
        sessionId: string,
        userId: string,
        content: string
    ) {
        try {
            if (!mongoose.Types.ObjectId.isValid(sessionId)) {
                throw new Error('Invalid session ID format');
            }

            const message = await this.messageModel.create({
                sessionId: new mongoose.Types.ObjectId(sessionId),
                userId: new mongoose.Types.ObjectId(userId),
                role: 'assistant' as const,
                content,
                metadata: {
                    llmModel: 'gpt-4',
                    tokens: Math.ceil(content.length / 4)
                }
            });

            await this.sessionModel.findByIdAndUpdate(
                sessionId,
                {
                    $push: {
                        'contextWindow.messages': {
                            $each: [{
                                role: 'assistant',
                                content,
                                timestamp: new Date()
                            }],
                            $slice: -20
                        }
                    },
                    $inc: { 'metadata.messageCount': 1 },
                    $set: { 'metadata.lastActivity': new Date() }
                },
                { new: true }
            );

            logger.info(`💾 Saved assistant message: ${message._id}`);
            return message;

        } catch (error) {
            logger.error('❌ Failed to save assistant message:', error);
            throw error;
        }
    }

    private async processNotification(job: Job): Promise<any> {
        try {
            logger.info(`📧 Processing notification: ${job.id}`);
            return { success: true };
        } catch (error) {
            logger.error('❌ Notification processing failed:', error);
            throw error;
        }
    }

    public async addToLLMQueue(data: LLMJobData): Promise<Job | null> {
        try {
            if (this.fallbackMode || !this.llmQueue) {
                logger.warn('⚠️  Queue unavailable, processing directly');
                await this.processLLMRequest({ data } as Job);
                return null;
            }

            const job = await this.llmQueue.add(data, {
                priority: 1,
                timeout: 60000,
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 2000
                }
            });

            logger.info(`✅ Job added to LLM queue: ${job.id}`);
            return job;
        } catch (error) {
            logger.error('❌ Failed to add job to LLM queue:', error);
            logger.info('🔄 Falling back to direct processing');
            await this.processLLMRequest({ data } as Job);
            return null;
        }
    }

    public async addToNotificationQueue(data: any): Promise<Job | null> {
        try {
            if (this.fallbackMode || !this.notificationQueue) {
                logger.warn('⚠️  Notification queue unavailable');
                return null;
            }

            return await this.notificationQueue.add(data);
        } catch (error) {
            logger.error('❌ Failed to add notification to queue:', error);
            return null;
        }
    }

    public async getQueueStats() {
        if (!this.llmQueue) {
            return {
                waiting: 0,
                active: 0,
                completed: 0,
                failed: 0,
                fallbackMode: true
            };
        }

        try {
            const [waiting, active, completed, failed] = await Promise.all([
                this.llmQueue.getWaitingCount(),
                this.llmQueue.getActiveCount(),
                this.llmQueue.getCompletedCount(),
                this.llmQueue.getFailedCount()
            ]);

            return {
                waiting,
                active,
                completed,
                failed,
                fallbackMode: this.fallbackMode
            };
        } catch (error) {
            logger.error('❌ Failed to get queue stats:', error);
            return {
                waiting: 0,
                active: 0,
                completed: 0,
                failed: 0,
                fallbackMode: true,
                error: error instanceof Error ? error.message : 'Unknown error'
            };
        }
    }

    public async shutdown(): Promise<void> {
        logger.info('🛑 Shutting down message queues...');

        try {
            if (this.llmQueue) {
                await this.llmQueue.close();
                logger.info('✅ LLM queue closed');
            }

            if (this.notificationQueue) {
                await this.notificationQueue.close();
                logger.info('✅ Notification queue closed');
            }
        } catch (error) {
            logger.error('❌ Error during queue shutdown:', error);
        }
    }
}