// modules/logger.js
// Winston-based logging system for Luna AI

import winston from 'winston';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create logs directory if it doesn't exist
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Log level from environment (default: info)
const logLevel = process.env.LOG_LEVEL || 'info';

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.printf(({ timestamp, level, message, ...metadata }) => {
    let msg = `${timestamp} [${level.toUpperCase()}] ${message}`;
    if (Object.keys(metadata).length > 0) {
      msg += ` ${JSON.stringify(metadata)}`;
    }
    return msg;
  })
);

// Console format (with colors)
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...metadata }) => {
    let msg = `${timestamp} [${level}] ${message}`;
    if (Object.keys(metadata).length > 0 && process.env.LOG_VERBOSE === 'true') {
      msg += ` ${JSON.stringify(metadata)}`;
    }
    return msg;
  })
);

// Create Winston logger
const logger = winston.createLogger({
  level: logLevel,
  format: logFormat,
  defaultMeta: { service: 'luna-ai' },
  transports: [
    // Write all logs to combined.log
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 10485760, // 10MB
      maxFiles: 5,
      tailable: true
    }),
    // Write errors to error.log
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 5,
      tailable: true
    })
  ],
  // Don't exit on handled exceptions
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'exceptions.log'),
      maxsize: 10485760, // 10MB
      maxFiles: 3
    })
  ],
  // Don't exit on unhandled promise rejections
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(logsDir, 'rejections.log'),
      maxsize: 10485760, // 10MB
      maxFiles: 3
    })
  ]
});

// Add console transport in development or if LOG_CONSOLE is enabled
if (process.env.NODE_ENV !== 'production' || process.env.LOG_CONSOLE === 'true') {
  logger.add(new winston.transports.Console({
    format: consoleFormat,
    level: logLevel
  }));
}

// Export logger functions
export const log = {
  // Info level - general information
  info: (message, ...args) => {
    logger.info(message, ...args);
  },
  
  // Error level - errors that need attention
  error: (message, ...args) => {
    logger.error(message, ...args);
  },
  
  // Warn level - warnings
  warn: (message, ...args) => {
    logger.warn(message, ...args);
  },
  
  // Debug level - detailed debugging information
  debug: (message, ...args) => {
    logger.debug(message, ...args);
  },
  
  // Verbose level - very detailed information
  verbose: (message, ...args) => {
    logger.verbose(message, ...args);
  },
  
  // Silly level - extremely detailed information
  silly: (message, ...args) => {
    logger.silly(message, ...args);
  }
};

// Export default logger instance
export default logger;

