// utils/helpers.js
// General helper functions

import { log } from "../modules/logger.js";

/**
 * Estimate speech duration in milliseconds
 * @param {string} text - Text to estimate
 * @param {string} voiceMode - Voice mode (normal, soft)
 * @returns {number} - Estimated duration in milliseconds
 */
export function estimateSpeechDurationMs(text, voiceMode = "normal") {
  // Rough estimate: ~150 words per minute, ~5 characters per word
  const words = text.length / 5;
  const wpm = voiceMode === "soft" ? 120 : 150; // Soft voice is slower
  const minutes = words / wpm;
  return Math.round(minutes * 60 * 1000); // Convert to milliseconds
}

/**
 * Get client IP address from request
 * @param {Object} req - Express request object
 * @returns {string} - Client IP address
 */
export function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
         req.headers['x-real-ip'] || 
         req.connection?.remoteAddress || 
         req.socket?.remoteAddress ||
         'unknown';
}

/**
 * Get US hour (America/New_York timezone)
 * @returns {number} - Hour (0-23)
 */
export function getAmericaHour() {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: "America/New_York",
    });
    const hourStr = formatter.format(now);
    const hour = parseInt(hourStr, 10);
    return Number.isNaN(hour) ? now.getHours() : hour;
  } catch {
    return new Date().getHours();
  }
}

/**
 * Get next Monday at 00:00:00 UTC
 * @returns {number} - Timestamp of next Monday 00:00:00 UTC
 */
export function getNextMonday() {
  const now = new Date();
  const currentDay = now.getUTCDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  const currentHour = now.getUTCHours();
  const currentMinute = now.getUTCMinutes();
  const currentSecond = now.getUTCSeconds();
  
  // Calculate days until next Monday
  // Always use next Monday (not today's Monday if it's already past 00:00:00)
  let daysUntilMonday;
  if (currentDay === 0) {
    // Sunday, next Monday is tomorrow
    daysUntilMonday = 1;
  } else if (currentDay === 1) {
    // Monday - always use next Monday (7 days from now)
    // This ensures competition always ends on Monday 00:00:00 UTC
    daysUntilMonday = 7;
  } else {
    // Tuesday-Saturday, calculate days to next Monday
    daysUntilMonday = 8 - currentDay; // 8 - 2 = 6 (Tue), 8 - 3 = 5 (Wed), etc.
  }
  
  // Create date for next Monday 00:00:00 UTC
  const nextMonday = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + daysUntilMonday,
    0, 0, 0, 0 // 00:00:00.000
  ));
  
  return nextMonday.getTime();
}











