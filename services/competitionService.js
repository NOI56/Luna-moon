// services/competitionService.js
// Weekly competition service

import { log } from "../modules/logger.js";
import { getNextMonday } from "../utils/helpers.js";

/**
 * Initialize competition start time
 * @param {Map} rpsLeaderboard - RPS leaderboard map
 * @param {Object} rewardPool - Reward pool object with getter/setter
 * @param {number} competitionStartTime - Current competition start time
 * @param {number} competitionEndTime - Current competition end time
 * @param {Function} distributeRewards - Function to distribute rewards (optional)
 * @returns {Object} - { competitionStartTime, competitionEndTime, rewardsDistributed }
 */
export async function initializeCompetition(rpsLeaderboard, rewardPool, competitionStartTime, competitionEndTime, distributeRewards = null) {
  let rewardsDistributed = false;
  
  // Check if we need to start a new competition
  const now = Date.now();
  if (now >= competitionEndTime) {
    // Competition ended - distribute rewards before starting new one
    if (distributeRewards && typeof distributeRewards === 'function') {
      const poolBeforeDistribution = rewardPool.value;
      if (poolBeforeDistribution > 0 && rpsLeaderboard.size > 0) {
        try {
          log.info(`[rps-competition] Competition ended. Auto-distributing rewards (${poolBeforeDistribution.toFixed(6)} SOL)...`);
          const result = await distributeRewards(null); // Use accumulated pool
          if (result.ok) {
            rewardsDistributed = true;
            log.info(`[rps-competition] ✓ Rewards distributed successfully. Total: ${result.totalDistributed?.toFixed(6)} SOL`);
          } else {
            log.error(`[rps-competition] ✗ Failed to distribute rewards: ${result.error || result.message}`);
          }
        } catch (error) {
          log.error(`[rps-competition] Error during auto-distribution:`, error);
        }
      } else {
        if (poolBeforeDistribution === 0) {
          log.info(`[rps-competition] Competition ended but reward pool is empty. Skipping distribution.`);
        } else if (rpsLeaderboard.size === 0) {
          log.info(`[rps-competition] Competition ended but no players in leaderboard. Skipping distribution.`);
        }
      }
    } else {
      log.warn(`[rps-competition] Competition ended but distributeRewards function not provided. Rewards not distributed automatically.`);
    }
    
    // Start new competition
    competitionStartTime = now;
    competitionEndTime = getNextMonday(); // Set to next Monday 00:00:00 UTC
    // Reset leaderboard for new competition
    rpsLeaderboard.clear();
    rewardPool.value = 0;
    log.info(`[rps-competition] New weekly competition started. Ends at: ${new Date(competitionEndTime).toISOString()} (Next Monday 00:00:00 UTC)`);
  } else {
    // Competition still active, just update end time if needed (in case server restarted)
    const calculatedEndTime = getNextMonday();
    if (competitionEndTime !== calculatedEndTime) {
      competitionEndTime = calculatedEndTime;
      log.info(`[rps-competition] Competition end time updated to: ${new Date(competitionEndTime).toISOString()} (Next Monday 00:00:00 UTC)`);
    }
  }
  
  return { competitionStartTime, competitionEndTime, rewardsDistributed };
}








