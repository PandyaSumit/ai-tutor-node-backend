// src/services / external / PythonAPIClient.ts
import logger from '@/config/logger';
import axios, { AxiosInstance } from 'axios';

interface LLMRequest {
    message: string;
    context: Array<string>;
    sessionId: string;
    userId: string;
    stream?: boolean;
}

export default class PythonAPIClient {
    private client: AxiosInstance;

    constructor() {
        this.client = axios.create({
            baseURL: process.env.PYTHON_API_URL || 'http://localhost:8000',
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': process.env.PYTHON_API_KEY
            }
        });

        this.setupInterceptors();
    }

    private setupInterceptors() {
        this.client.interceptors.request.use(
            (config) => {
                logger.debug(`Python API Request: ${config.method} ${config.url}`);
                return config;
            },
            (error) => {
                logger.error('Python API Request Error', error);
                return Promise.reject(error);
            }
        );

        this.client.interceptors.response.use(
            (response) => {
                logger.debug(`Python API Response: ${response.status}`);
                return response;
            },
            (error) => {
                logger.error('Python API Response Error', error);
                return Promise.reject(error);
            }
        );
    }

    async generateResponse(request: LLMRequest): Promise<any | AsyncGenerator<any, void, unknown>> {
        try {
            if (request.stream) {
                return this.streamResponse(request);
            }

            const response = await this.client.post('/api/llm/generate', request);
            return response.data;
        } catch (error) {
            logger.error('Error generating LLM response', error);
            throw error;
        }
    }

    private async *streamResponse(request: LLMRequest) {
        try {
            const response = await this.client.post(
                '/api/llm/stream',
                request,
                {
                    responseType: 'stream',
                    timeout: 60000
                }
            );

            for await (const chunk of response.data) {
                const lines = chunk.toString().split('\n').filter(Boolean);

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') {
                            return;
                        }

                        try {
                            const parsed = JSON.parse(data);
                            yield parsed;
                        } catch (e) {
                            logger.warn('Failed to parse streaming chunk', e);
                        }
                    }
                }
            }
        } catch (error) {
            logger.error('Error in streaming response', error);
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
            const response = await this.client.get('/health');
            return response.status === 200;
        } catch {
            return false;
        }
    }
}