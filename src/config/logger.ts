import winston from 'winston';
import path from 'path';
import fs from 'fs';

const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Define log format
const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
        let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;

        // Add metadata if present
        if (Object.keys(meta).length > 0) {
            log += ` ${JSON.stringify(meta)}`;
        }

        // Add stack trace for errors
        if (stack) {
            log += `\n${stack}`;
        }

        return log;
    })
);

// Define transports
const transports: winston.transport[] = [
    // Console transport with colors
    new winston.transports.Console({
        format: winston.format.combine(
            winston.format.colorize({ all: true }),
            winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
            winston.format.printf(({ timestamp, level, message, stack }) => {
                let log = `${timestamp} ${level}: ${message}`;
                if (stack) {
                    log += `\n${stack}`;
                }
                return log;
            })
        )
    }),

    // Combined log file (all levels)
    new winston.transports.File({
        filename: path.join(logsDir, 'combined.log'),
        format: logFormat,
        maxsize: 5242880, // 5MB
        maxFiles: 5,
        tailable: true
    }),

    // Error log file (errors only)
    new winston.transports.File({
        filename: path.join(logsDir, 'error.log'),
        level: 'error',
        format: logFormat,
        maxsize: 5242880, // 5MB
        maxFiles: 5,
        tailable: true
    }),

    // HTTP log file
    new winston.transports.File({
        filename: path.join(logsDir, 'http.log'),
        level: 'http',
        format: logFormat,
        maxsize: 5242880, // 5MB
        maxFiles: 3,
        tailable: true
    })
];

// Add daily rotate file transport in production
if (process.env.NODE_ENV === 'production') {
    // You can add winston-daily-rotate-file here if needed
    // npm install winston-daily-rotate-file
}

// Create logger instance
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    levels: winston.config.npm.levels,
    format: logFormat,
    transports,
    exitOnError: false
});

// Create stream for Morgan (HTTP logging)
export const stream = {
    write: (message: string) => {
        logger.http(message.trim());
    }
};

// Add custom log methods
export const logInfo = (message: string, meta?: any) => {
    logger.info(message, meta);
};

export const logError = (message: string, error?: Error | any) => {
    console.log('error :>> ', error);
    if (error instanceof Error) {
        logger.error(message, { error: error.message, stack: error.stack });
    } else {
        logger.error(message, error);
    }
};

export const logWarn = (message: string, meta?: any) => {
    logger.warn(message, meta);
};

export const logDebug = (message: string, meta?: any) => {
    logger.debug(message, meta);
};

export const logHttp = (message: string, meta?: any) => {
    logger.http(message, meta);
};

export default logger;