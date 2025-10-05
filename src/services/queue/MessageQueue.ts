// src/services/queue/MessageQueue.ts
import Bull, { Queue, Job } from 'bull';
import PythonAPIClient from '../external/PythonAPIClient';
import { SocketManager } from '../socket/SocketManager';
import logger from '@/config/logger';

interface LLMJobData {
    sessionId: string;
    userId: string;
    messageId: string;
    content: string;
    context: any;
}

export default class MessageQueue {
    private llmQueue: Queue;
    private notificationQueue: Queue;
    private pythonClient: PythonAPIClient;
    private socketManager: SocketManager | null = null;

    constructor() {
        const redisConfig = {
            host: process.env.REDIS_HOST || 'localhost',
            port: parseInt(process.env.REDIS_PORT || '6379'),
            password: process.env.REDIS_PASSWORD,
            maxRetriesPerRequest: null,
            enableReadyCheck: false
        };

        // Initialize queues
        this.llmQueue = new Bull('llm-processing', {
            redis: redisConfig,
            defaultJobOptions: {
                attempts: 3,
                backoff: {
                    type: 'exponential',
                    delay: 2000
                },
                removeOnComplete: true,
                removeOnFail: false
            }
        });

        this.notificationQueue = new Bull('notifications', {
            redis: redisConfig
        });

        this.pythonClient = new PythonAPIClient();

        this.setupProcessors();
        this.setupEventHandlers();
    }

    public setSocketManager(socketManager: SocketManager) {
        this.socketManager = socketManager;
    }

    private setupProcessors() {
        // LLM processing
        this.llmQueue.process(5, async (job: Job) => {
            return this.processLLMRequest(job);
        });

        // Notification processing
        this.notificationQueue.process(10, async (job: Job) => {
            return this.processNotification(job);
        });
    }

    private setupEventHandlers() {
        this.llmQueue.on('completed', (job, _result) => {
            logger.info(`LLM job completed: ${job.id}`);
        });

        this.llmQueue.on('failed', (job, err) => {
            logger.error(`LLM job failed: ${job?.id}`, err);
        });

        this.llmQueue.on('stalled', (job) => {
            logger.warn(`LLM job stalled: ${job.id}`);
        });
    }

    private async processLLMRequest(job: Job): Promise<any> {
        const { sessionId, userId, content, context } = job.data;

        try {
            logger.info(`Processing LLM request for session: ${sessionId}`);

            // Update job progress
            await job.progress(20);

            // Emit "AI is thinking" status
            if (this.socketManager) {
                this.socketManager.emitToSession(sessionId, 'assistant:thinking', {
                    status: 'processing'
                });
            }

            await job.progress(40);

            // Call Python FastAPI LLM service with streaming
            const response = await this.pythonClient.generateResponse({
                message: content,
                context: context.messages,
                sessionId,
                userId,
                stream: true
            });

            await job.progress(60);

            // Handle streaming response
            let fullResponse = '';
            for await (const chunk of response) {
                fullResponse += chunk.content;

                // Emit partial response
                if (this.socketManager) {
                    this.socketManager.emitToSession(sessionId, 'message:partial', {
                        content: chunk.content,
                        isDone: false
                    });
                }
            }

            await job.progress(80);

            // Save assistant message to database
            const assistantMessage = await this.saveAssistantMessage(
                sessionId,
                userId,
                fullResponse
            );

            await job.progress(100);

            // Emit complete response
            if (this.socketManager) {
                this.socketManager.emitToSession(sessionId, 'message:received', {
                    messageId: assistantMessage._id,
                    role: 'assistant',
                    content: fullResponse,
                    timestamp: assistantMessage.createdAt
                });
            }

            return {
                success: true,
                messageId: assistantMessage._id,
                content: fullResponse
            };

        } catch (error) {
            logger.error('Error processing LLM request', error);

            // Emit error to client
            if (this.socketManager) {
                this.socketManager.emitToUser(userId, 'error', {
                    message: 'Failed to generate response',
                    sessionId
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
        const Message = require('../../models/Message').default;
        const Session = require('../../models/Session').default;

        const message = await Message.create({
            sessionId,
            userId,
            role: 'assistant',
            content,
            metadata: {
                llmModel: 'gpt-4',
                tokens: Math.ceil(content.length / 4)
            }
        });

        // Update session context
        await Session.findByIdAndUpdate(sessionId, {
            $push: {
                'contextWindow.messages': {
                    role: 'assistant',
                    content,
                    timestamp: new Date()
                }
            },
            $inc: { 'metadata.messageCount': 1 },
            $set: { 'metadata.lastActivity': new Date() }
        });

        return message;
    }

    private async processNotification(job: Job): Promise<any> {
        // Process notifications (email, push, etc.)
        logger.info(`Processing notification: ${job.id}`);
        return { success: true };
    }

    // Public methods to add jobs
    public async addToLLMQueue(data: LLMJobData) {
        return this.llmQueue.add(data, {
            priority: 1,
            timeout: 30000 // 30 seconds timeout
        });
    }

    public async addToNotificationQueue(data: any) {
        return this.notificationQueue.add(data);
    }

    // Queue monitoring
    public async getQueueStats() {
        const [waiting, active, completed, failed] = await Promise.all([
            this.llmQueue.getWaitingCount(),
            this.llmQueue.getActiveCount(),
            this.llmQueue.getCompletedCount(),
            this.llmQueue.getFailedCount()
        ]);

        return { waiting, active, completed, failed };
    }
}