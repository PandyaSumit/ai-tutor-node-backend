// src/services/monitoring/PerformanceMonitor.ts
import logger from '@/config/logger';
import { EventEmitter } from 'events';

interface LatencyMetric {
    operation: string;
    latency: number;
    timestamp: number;
}

export class PerformanceMonitor extends EventEmitter {
    private metrics: Map<string, LatencyMetric[]> = new Map();
    private readonly MAX_METRICS_PER_TYPE = 1000;
    private readonly ALERT_THRESHOLD_MS = 1000;
    private readonly P95_ALERT_THRESHOLD_MS = 500;

    constructor() {
        super();
        this.startPeriodicReporting();
    }

    /**
     * Track operation latency
     */
    trackLatency(operation: string, latency: number): void {
        if (!this.metrics.has(operation)) {
            this.metrics.set(operation, []);
        }

        const operationMetrics = this.metrics.get(operation)!;
        operationMetrics.push({
            operation,
            latency,
            timestamp: Date.now()
        });

        // Keep only recent metrics
        if (operationMetrics.length > this.MAX_METRICS_PER_TYPE) {
            operationMetrics.shift();
        }

        // Alert on high latency
        if (latency > this.ALERT_THRESHOLD_MS) {
            this.emit('high_latency', { operation, latency });
            logger.warn(`High latency detected: ${operation} took ${latency}ms`);
        }
    }

    /**
     * Measure async operation
     */
    async measure<T>(
        operation: string,
        fn: () => Promise<T>
    ): Promise<T> {
        const start = Date.now();
        try {
            const result = await fn();
            this.trackLatency(operation, Date.now() - start);
            return result;
        } catch (error) {
            this.trackLatency(operation, Date.now() - start);
            throw error;
        }
    }

    /**
     * Measure sync operation
     */
    measureSync<T>(operation: string, fn: () => T): T {
        const start = Date.now();
        try {
            const result = fn();
            this.trackLatency(operation, Date.now() - start);
            return result;
        } catch (error) {
            this.trackLatency(operation, Date.now() - start);
            throw error;
        }
    }

    /**
     * Get statistics for an operation
     */
    getStats(operation: string) {
        const metrics = this.metrics.get(operation);
        if (!metrics || metrics.length === 0) {
            return null;
        }

        const latencies = metrics.map(m => m.latency).sort((a, b) => a - b);
        const sum = latencies.reduce((a, b) => a + b, 0);

        return {
            operation,
            count: latencies.length,
            min: latencies[0],
            max: latencies[latencies.length - 1],
            avg: sum / latencies.length,
            p50: this.percentile(latencies, 50),
            p95: this.percentile(latencies, 95),
            p99: this.percentile(latencies, 99)
        };
    }

    /**
     * Get all operations statistics
     */
    getAllStats() {
        const stats: any = {};
        for (const [operation] of this.metrics) {
            stats[operation] = this.getStats(operation);
        }
        return stats;
    }

    /**
     * Check health based on performance metrics
     */
    checkHealth(): { healthy: boolean; issues: string[] } {
        const issues: string[] = [];

        for (const [operation] of this.metrics) {
            const stats = this.getStats(operation);
            if (stats && stats.p95 > this.P95_ALERT_THRESHOLD_MS) {
                issues.push(
                    `${operation}: P95 latency ${stats.p95.toFixed(2)}ms exceeds threshold`
                );
            }
        }

        return {
            healthy: issues.length === 0,
            issues
        };
    }

    /**
     * Clear old metrics
     */
    clearOldMetrics(maxAgeMs: number = 3600000): void {
        const cutoff = Date.now() - maxAgeMs;

        for (const [operation, metrics] of this.metrics) {
            const filtered = metrics.filter(m => m.timestamp > cutoff);

            if (filtered.length === 0) {
                this.metrics.delete(operation);
            } else {
                this.metrics.set(operation, filtered);
            }
        }
    }

    /**
     * Reset all metrics
     */
    reset(): void {
        this.metrics.clear();
    }

    private percentile(sorted: number[], p: number): number {
        const index = Math.ceil((sorted.length * p) / 100) - 1;
        return sorted[Math.max(0, index)];
    }

    private startPeriodicReporting(): void {
        // Report metrics every 5 minutes
        setInterval(() => {
            const stats = this.getAllStats();
            const health = this.checkHealth();

            logger.info('Performance Metrics', {
                stats,
                health
            });

            // Emit metrics for external monitoring
            this.emit('metrics', { stats, health });

            // Clean up old metrics
            this.clearOldMetrics();
        }, 5 * 60 * 1000);
    }
}

// Singleton instance
export const performanceMonitor = new PerformanceMonitor();

/**
 * Decorator for measuring method execution time
 */
export function Monitored(operation?: string) {
    return function (
        target: any,
        propertyKey: string,
        descriptor: PropertyDescriptor
    ) {
        const originalMethod = descriptor.value;
        const op = operation || `${target.constructor.name}.${propertyKey}`;

        descriptor.value = async function (...args: any[]) {
            return performanceMonitor.measure(op, () =>
                originalMethod.apply(this, args)
            );
        };

        return descriptor;
    };
}