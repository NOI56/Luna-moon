// routes/rps.js
// RPS Routes - Main entry point that imports all RPS route modules

import { setupRpsMatchmakingRoutes } from "./rps-matchmaking.js";
import { setupRpsBettingRoutes } from "./rps-betting.js";
import { setupRpsStatsRoutes } from "./rps-stats.js";
import { setupRpsRewardsRoutes } from "./rps-rewards.js";
import { setupRpsCompetitionRoutes } from "./rps-competition.js";

/**
 * Setup all RPS routes
 * @param {Object} app - Express app instance
 * @param {Object} dependencies - Dependencies needed by routes
 */
export function setupRpsRoutes(app, dependencies) {
  // Setup all RPS route modules
  setupRpsMatchmakingRoutes(app, dependencies);
  setupRpsBettingRoutes(app, dependencies);
  setupRpsStatsRoutes(app, dependencies);
  setupRpsRewardsRoutes(app, dependencies);
  setupRpsCompetitionRoutes(app, dependencies);
}
