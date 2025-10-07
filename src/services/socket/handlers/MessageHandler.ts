// src/services/socket/handlers/MessageHandler.ts
import { Socket } from 'socket.io';
import PythonAPIClient from '@/services/external/PythonAPIClient';
import SessionService from '@/services/session/SessionService';
import logger from '@/config/logger';

export class MessageHandler {
    private pythonClient: PythonAPIClient;
    private sessionService: SessionService;

    constructor() {
        this.pythonClient = new PythonAPIClient();
        this.sessionService = new SessionService();
    }

    async handleMessage(socket: Socket, data: any): Promise<void> {
        const startTime = Date.now();
        const { sessionId, content, mode = 'text' } = data; // mode: 'text' | 'voice'
        const userId = socket.data.user.userId.toString();

        try {
            // 1. Validate session (cached lookup)
            const session = await this.sessionService.getSession(sessionId);
            if (!session || session.userId.toString() !== userId) {
                socket.emit('error', {
                    code: 'INVALID_SESSION',
                    message: 'Invalid session'
                });
                return;
            }

            // 2. Save user message asynchronously (don't wait)
            const userMessagePromise = this.sessionService.addMessage(
                sessionId,
                userId,
                'user',
                content
            );

            // 3. Immediately acknowledge receipt
            socket.emit('message:ack', {
                timestamp: Date.now(),
                latency: Date.now() - startTime
            });

            // 4. Stream response directly from Python API
            await this.streamLLMResponse(
                socket,
                sessionId,
                userId,
                content,
                session.contextWindow,
                mode
            );

            // 5. Wait for user message to be saved
            const userMessage = await userMessagePromise;

            logger.info(`Message processed in ${Date.now() - startTime}ms`, {
                sessionId,
                userId,
                messageId: userMessage._id
            });

        } catch (error) {
            logger.error('Error handling message', { error, sessionId, userId });
            socket.emit('error', {
                code: 'MESSAGE_PROCESSING_ERROR',
                message: 'Failed to process message'
            });
        }
    }

    private async streamLLMResponse(
        socket: Socket,
        sessionId: string,
        userId: string,
        content: string,
        contextWindow: any,
        mode: 'text' | 'voice'
    ): Promise<void> {
        let fullResponse = '';
        let chunkCount = 0;
        const streamStartTime = Date.now();

        try {
            // Notify client that AI is processing
            socket.emit('assistant:thinking', {
                status: 'processing',
                timestamp: Date.now()
            });

            // Stream from Python API
            const stream = await this.pythonClient.generateResponse({
                message: content,
                context: contextWindow.messages.map((m: any) => ({
                    role: m.role,
                    content: m.content
                })),
                sessionId,
                userId,
                stream: true,
                mode // Pass mode to Python API for voice-optimized responses
            });

            // Process stream chunks
            for await (const chunk of stream) {
                chunkCount++;
                const chunkText = chunk.content || '';
                fullResponse += chunkText;

                // Emit chunk to client immediately
                socket.emit('message:chunk', {
                    content: chunkText,
                    chunkIndex: chunkCount,
                    timestamp: Date.now()
                });

                // For voice mode, also emit audio chunks if available
                if (mode === 'voice' && chunk.audio) {
                    socket.emit('audio:chunk', {
                        audio: chunk.audio, // Base64 encoded audio
                        format: chunk.audioFormat || 'opus',
                        chunkIndex: chunkCount
                    });
                }
            }

            const streamLatency = Date.now() - streamStartTime;

            // Save assistant message asynchronously
            const assistantMessage = await this.sessionService.addMessage(
                sessionId,
                userId,
                'assistant',
                fullResponse
            );

            // Emit completion
            socket.emit('message:complete', {
                messageId: assistantMessage._id,
                role: 'assistant',
                content: fullResponse,
                metadata: {
                    chunkCount,
                    streamLatency,
                    tokensEstimate: Math.ceil(fullResponse.length / 4)
                },
                timestamp: Date.now()
            });

            logger.info(`Stream completed: ${streamLatency}ms, ${chunkCount} chunks`);

        } catch (error) {
            logger.error('Streaming error', error);

            // If we have partial response, save it
            if (fullResponse.length > 0) {
                await this.sessionService.addMessage(
                    sessionId,
                    userId,
                    'assistant',
                    fullResponse
                );
            }

            socket.emit('message:error', {
                message: 'Stream interrupted',
                partialContent: fullResponse,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }

    async handleVoiceMessage(socket: Socket, data: any): Promise<void> {
        const { sessionId, audioData, format = 'webm' } = data;
        const userId = socket.data.user.userId.toString();

        try {
            // 1. Send audio to Python API for transcription
            socket.emit('voice:transcribing', { status: 'processing' });

            const transcription = await this.pythonClient.transcribeAudio({
                audio: audioData,
                format,
                userId,
                sessionId
            });

            // 2. Process transcribed text as regular message
            await this.handleMessage(socket, {
                sessionId,
                content: transcription.text,
                mode: 'voice'
            });

        } catch (error) {
            logger.error('Voice message error', error);
            socket.emit('error', {
                code: 'VOICE_PROCESSING_ERROR',
                message: 'Failed to process voice message'
            });
        }
    }
}