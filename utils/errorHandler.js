// utils/errorHandler.js
// Error logging utility

import { log } from "../modules/logger.js";

/**
 * Log error with context
 * @param {Array} errorLog - Array to store error logs
 * @param {Error|Object} error - Error object
 * @param {Object} context - Additional context
 */
export function logError(errorLog, error, context = {}) {
  const errorEntry = {
    timestamp: Date.now(),
    message: error.message || String(error),
    error: error.stack || String(error),
    ...context
  };
  errorLog.push(errorEntry);
  
  // Keep only last 1000 errors
  if (errorLog.length > 1000) {
    errorLog.shift();
  }
  
  log.error(`[error] ${errorEntry.message}`, context);
}





























