// src/services/external/PythonAPIClient.ts - FIXED with better error logging
import axios, { AxiosInstance, AxiosError } from 'axios';
import { EventEmitter } from 'events';
import logger from '@/config/logger';

interface GenerateRequest {
    message: string;
    context: any[];
    sessionId: string;
    userId: string;
    stream?: boolean;
}

interface GenerateResponse {
    content: string;
    model?: string;
    tokens?: number;
}

export default class PythonAPIClient extends EventEmitter {
    private client: AxiosInstance;
    private baseURL: string;
    private isHealthy: boolean = false;
    private healthCheckInterval: NodeJS.Timeout | null = null;
    private retryAttempts = 0;
    private maxRetries = 5;
    private retryDelay = 1000;

    constructor() {
        super();

        this.baseURL = process.env.PYTHON_API_URL || 'http://localhost:8000';

        this.client = axios.create({
            baseURL: this.baseURL,
            timeout: parseInt(process.env.PYTHON_API_TIMEOUT || '30000'),
            headers: {
                'Content-Type': 'application/json'
            }
        });

        // Setup response interceptor for better error logging
        this.client.interceptors.response.use(
            (response) => response,
            (error: AxiosError) => {
                this.logDetailedError(error);
                return Promise.reject(error);
            }
        );

        // Start health monitoring
        this.startHealthCheck();

        logger.info(`✅ PythonAPIClient initialized for ${this.baseURL}`);
    }

    /**
     * ✅ FIXED: Log detailed error information
     */
    private logDetailedError(error: AxiosError): void {
        if (error.code === 'ECONNREFUSED') {
            logger.error(`❌ Python API connection refused at ${this.baseURL}`, {
                message: 'Cannot connect to Python API server',
                suggestion: 'Make sure Python API is running on port 8000',
                command: 'python main.py'
            });
        } else if (error.code === 'ETIMEDOUT') {
            logger.error(`❌ Python API request timeout`, {
                url: error.config?.url,
                timeout: error.config?.timeout
            });
        } else if (error.response) {
            // Server responded with error status
            logger.error(`❌ Python API error response`, {
                status: error.response.status,
                statusText: error.response.statusText,
                data: error.response.data,
                url: error.config?.url
            });
        } else if (error.request) {
            // Request made but no response
            logger.error(`❌ Python API no response`, {
                message: error.message,
                code: error.code,
                url: error.config?.url
            });
        } else {
            // Something else happened
            logger.error(`❌ Python API error`, {
                message: error.message,
                stack: error.stack
            });
        }
    }

    /**
     * Health check with proper error handling
     */
    private async checkHealth(): Promise<boolean> {
        try {
            const response = await this.client.get('/health', {
                timeout: 5000 // 5 second timeout for health check
            });

            if (response.status === 200) {
                if (!this.isHealthy) {
                    logger.info(`✅ Python API is now healthy at ${this.baseURL}`);
                }
                this.isHealthy = true;
                this.retryAttempts = 0;
                this.emit('health', true);
                return true;
            }

            return false;
        } catch (error) {
            if (this.retryAttempts < this.maxRetries) {
                this.retryAttempts++;
                logger.warn(`⚠️  Retrying Python API connection (${this.retryAttempts}/${this.maxRetries})`);
            } else if (this.retryAttempts === this.maxRetries && this.isHealthy) {
                // Only log as unhealthy after max retries and if it was previously healthy
                logger.error('❌ Python API is unhealthy after max retries');
                this.isHealthy = false;
                this.emit('health', false);
            }

            return false;
        }
    }

    /**
     * Start periodic health checks
     */
    private startHealthCheck(): void {
        const interval = parseInt(
            process.env.PYTHON_API_HEALTH_CHECK_INTERVAL || '30000'
        );

        // Initial check
        this.checkHealth();

        // Periodic checks
        this.healthCheckInterval = setInterval(() => {
            this.checkHealth();
        }, interval);

        logger.info(`✅ Python API health check started (interval: ${interval}ms)`);
    }

    /**
     * Stop health checks
     */
    private stopHealthCheck(): void {
        if (this.healthCheckInterval) {
            clearInterval(this.healthCheckInterval);
            this.healthCheckInterval = null;
            logger.info('🛑 Python API health check stopped');
        }
    }

    /**
     * Generate response from LLM
     */
    async generateResponse(request: GenerateRequest): Promise<AsyncIterable<GenerateResponse>> {
        try {
            if (!this.isHealthy) {
                logger.warn('⚠️  Python API is not healthy, request may fail');
            }

            const response = await this.client.post<GenerateResponse>('/api/generate', request);

            // For now, return as async iterable with single item
            // TODO: Implement actual streaming when Python API supports it
            async function* generateChunks() {
                yield response.data;
            }

            return generateChunks();
        } catch (error) {
            logger.error('❌ Failed to generate response from Python API', {
                sessionId: request.sessionId,
                userId: request.userId,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw error;
        }
    }

    /**
     * Get health status
     */
    getHealthStatus(): boolean {
        return this.isHealthy;
    }

    /**
     * Manual health check
     */
    async performHealthCheck(): Promise<boolean> {
        return await this.checkHealth();
    }

    /**
     * Shutdown client
     */
    async shutdown(): Promise<void> {
        logger.info('🛑 Shutting down PythonAPIClient...');
        this.stopHealthCheck();
        this.removeAllListeners();
    }
}