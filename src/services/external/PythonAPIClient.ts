// src/services/external/EnhancedPythonAPIClient.ts
import logger from '@/config/logger';
import axios, { AxiosInstance } from 'axios';
import { EventEmitter } from 'events';

interface LLMRequest {
    message: string;
    context: Array<{ role: string; content: string }>;
    sessionId: string;
    userId: string;
    stream?: boolean;
    mode?: 'text' | 'voice';
    temperature?: number;
    maxTokens?: number;
}

interface AudioTranscriptionRequest {
    audio: string; // Base64 encoded
    format: string;
    userId: string;
    sessionId: string;
}

interface StreamChunk {
    content: string;
    audio?: string;
    audioFormat?: string;
    done: boolean;
    metadata?: {
        tokens?: number;
        latency?: number;
    };
}

export default class PythonAPIClient extends EventEmitter {
    private client: AxiosInstance;
    private healthCheckInterval: NodeJS.Timeout | null = null;
    private isHealthy: boolean = false;
    private reconnectAttempts: number = 0;
    private maxReconnectAttempts: number = 5;

    constructor() {
        super();

        this.client = axios.create({
            baseURL: process.env.PYTHON_API_URL || 'http://localhost:8000',
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': process.env.PYTHON_API_KEY || '',
                'Connection': 'keep-alive'
            },
            // Enable HTTP/2 if available
            httpAgent: new (require('http').Agent)({
                keepAlive: true,
                maxSockets: 100
            }),
            httpsAgent: new (require('https').Agent)({
                keepAlive: true,
                maxSockets: 100
            })
        });

        this.setupInterceptors();
        this.startHealthCheck();
    }

    private setupInterceptors() {
        this.client.interceptors.request.use(
            (config) => {
                config.headers['X-Request-Start'] = Date.now().toString();
                logger.debug(`Python API Request: ${config.method?.toUpperCase()} ${config.url}`);
                return config;
            },
            (error) => {
                logger.error('Python API Request Error', error);
                return Promise.reject(error);
            }
        );

        this.client.interceptors.response.use(
            (response) => {
                const startTime = parseInt(response.config.headers?.['X-Request-Start'] as string || '0');
                const latency = Date.now() - startTime;
                logger.debug(`Python API Response: ${response.status} (${latency}ms)`);
                return response;
            },
            async (error) => {
                logger.error('Python API Response Error', {
                    url: error.config?.url,
                    status: error.response?.status,
                    message: error.message
                });

                // Retry logic for network errors
                if (error.code === 'ECONNREFUSED' && this.reconnectAttempts < this.maxReconnectAttempts) {
                    this.reconnectAttempts++;
                    logger.warn(`Retrying Python API connection (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
                    await this.delay(1000 * this.reconnectAttempts);
                    return this.client.request(error.config);
                }

                return Promise.reject(error);
            }
        );
    }

    private startHealthCheck() {
        // Check health every 30 seconds
        this.healthCheckInterval = setInterval(async () => {
            this.isHealthy = await this.healthCheck();
            this.emit('health', this.isHealthy);

            if (this.isHealthy) {
                this.reconnectAttempts = 0;
            }
        }, 30000);

        // Initial health check
        this.healthCheck().then(healthy => {
            this.isHealthy = healthy;
        });
    }

    async generateResponse(request: LLMRequest): Promise<AsyncGenerator<StreamChunk, void, unknown>> {
        if (!this.isHealthy) {
            logger.warn('Python API unhealthy, attempting request anyway');
        }

        if (request.stream) {
            return this.streamResponse(request);
        }

        // Non-streaming fallback
        const response = await this.client.post('/api/llm/generate', request);
        return this.singleChunkGenerator(response.data);
    }

    private async *singleChunkGenerator(data: any): AsyncGenerator<StreamChunk, void, unknown> {
        yield {
            content: data.content || data.response || '',
            done: true,
            metadata: data.metadata
        };
    }

    private async *streamResponse(request: LLMRequest): AsyncGenerator<StreamChunk, void, unknown> {
        const controller = new AbortController();

        try {
            const response = await this.client.post(
                '/api/llm/stream',
                request,
                {
                    responseType: 'stream',
                    timeout: 60000,
                    signal: controller.signal,
                    headers: {
                        'Accept': 'text/event-stream'
                    }
                }
            );

            let buffer = '';

            for await (const chunk of response.data) {
                buffer += chunk.toString();
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (!line.trim() || !line.startsWith('data: ')) continue;

                    const data = line.slice(6).trim();

                    if (data === '[DONE]') {
                        yield { content: '', done: true };
                        return;
                    }

                    try {
                        const parsed = JSON.parse(data);

                        yield {
                            content: parsed.content || parsed.delta || '',
                            audio: parsed.audio,
                            audioFormat: parsed.audioFormat,
                            done: false,
                            metadata: parsed.metadata
                        };
                    } catch (e) {
                        logger.warn('Failed to parse SSE chunk', { line, error: e });
                    }
                }
            }

            // Process remaining buffer
            if (buffer.trim() && buffer.startsWith('data: ')) {
                const data = buffer.slice(6).trim();
                if (data !== '[DONE]') {
                    try {
                        const parsed = JSON.parse(data);
                        yield {
                            content: parsed.content || '',
                            done: false
                        };
                    } catch (e) {
                        logger.warn('Failed to parse final chunk', e);
                    }
                }
            }

        } catch (error: any) {
            if (error.name === 'AbortError') {
                logger.info('Stream aborted by client');
            } else {
                logger.error('Error in streaming response', error);
            }
            throw error;
        } finally {
            controller.abort();
        }
    }

    async transcribeAudio(request: AudioTranscriptionRequest): Promise<any> {
        try {
            const response = await this.client.post('/api/audio/transcribe', request, {
                timeout: 15000 // Shorter timeout for transcription
            });
            return response.data;
        } catch (error) {
            logger.error('Error transcribing audio', error);
            throw error;
        }
    }

    async synthesizeSpeech(text: string, voice: string = 'default'): Promise<string> {
        try {
            const response = await this.client.post('/api/audio/synthesize', {
                text,
                voice,
                format: 'opus' // Use Opus for better compression
            });
            return response.data.audio; // Base64 encoded audio
        } catch (error) {
            logger.error('Error synthesizing speech', error);
            throw error;
        }
    }

    async analyzeIntent(text: string): Promise<any> {
        const response = await this.client.post('/api/nlp/intent', { text });
        return response.data;
    }

    async extractEntities(text: string): Promise<any> {
        const response = await this.client.post('/api/nlp/entities', { text });
        return response.data;
    }

    async analyzeSentiment(text: string): Promise<any> {
        const response = await this.client.post('/api/nlp/sentiment', { text });
        return response.data;
    }

    async healthCheck(): Promise<boolean> {
        try {
            const response = await this.client.get('/health', { timeout: 5000 });
            return response.status === 200;
        } catch {
            return false;
        }
    }

    getHealthStatus(): boolean {
        return this.isHealthy;
    }

    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async shutdown() {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
        }
        this.removeAllListeners();
    }
}