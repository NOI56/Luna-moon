// routes/rps-competition.js
// RPS Competition Routes

import { log } from "../modules/logger.js";

/**
 * Setup RPS Competition routes
 * @param {Object} app - Express app instance
 * @param {Object} dependencies - Dependencies needed by routes
 */
export function setupRpsCompetitionRoutes(app, dependencies) {
  const {
    competitionStartTime,
    competitionEndTime,
  } = dependencies;

  /**
   * Get weekly competition time remaining
   * GET /luna/rps/competition/time
   */
  app.get("/luna/rps/competition/time", async (req, res) => {
    try {
      const now = Date.now();
      const timeRemaining = Math.max(0, competitionEndTime - now);
      const days = Math.floor(timeRemaining / (24 * 60 * 60 * 1000));
      const hours = Math.floor((timeRemaining % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
      const minutes = Math.floor((timeRemaining % (60 * 60 * 1000)) / (60 * 1000));
      const seconds = Math.floor((timeRemaining % (60 * 1000)) / 1000);
      
      return res.json({
        ok: true,
        timeRemaining: timeRemaining,
        timeRemainingFormatted: {
          days: days,
          hours: hours,
          minutes: minutes,
          seconds: seconds,
          total: timeRemaining
        },
        startTime: competitionStartTime,
        endTime: competitionEndTime,
        isActive: timeRemaining > 0,
        endDate: new Date(competitionEndTime).toISOString(),
      });
    } catch (e) {
      log.error("[rps] Competition time error:", e);
      res.status(500).json({
        ok: false,
        error: e.message,
        message: "Failed to get competition time",
      });
    }
  });
}






























