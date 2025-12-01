// routes/rps-rewards.js
// RPS Rewards Routes

import { log } from "../modules/logger.js";

/**
 * Setup RPS Rewards routes
 * @param {Object} app - Express app instance
 * @param {Object} dependencies - Dependencies needed by routes
 */
export function setupRpsRewardsRoutes(app, dependencies) {
  const {
    rewardPool,
    rpsLeaderboard,
    REWARD_DISTRIBUTION_WALLET,
    REWARD_PERCENTAGES,
    distributeRewards,
  } = dependencies;

  /**
   * Distribute rewards to top 5 players
   * POST /luna/rps/rewards/distribute
   * Body: { totalRewardPool: number } (optional - if not provided, uses accumulated pool)
   */
  app.post("/luna/rps/rewards/distribute", async (req, res) => {
    try {
      const { totalRewardPool } = req.body || {};
      const result = await distributeRewards(totalRewardPool);
      
      if (result.ok) {
        return res.json(result);
      } else {
        return res.status(400).json(result);
      }
    } catch (e) {
      log.error("[rps] Reward distribution endpoint error:", e);
      res.status(500).json({
        ok: false,
        error: e.message,
        message: "Failed to distribute rewards",
      });
    }
  });

  /**
   * Generate mock wallet address for demo
   */
  function generateMockWallet(index) {
    const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let wallet = '';
    for (let i = 0; i < 44; i++) {
      wallet += chars[Math.floor(Math.random() * chars.length)];
    }
    return wallet;
  }

  /**
   * Get reward pool status
   * GET /luna/rps/rewards/pool?demo=true (optional - for testing with mock data)
   */
  app.get("/luna/rps/rewards/pool", async (req, res) => {
    try {
      const isDemo = req.query.demo === 'true' || req.query.simulate === 'true';
      
      let leaderboardArray;
      
      if (isDemo) {
        // Generate mock top 5 for demo
        leaderboardArray = [];
        for (let i = 0; i < 5; i++) {
          const rank = i + 1;
          const totalWonBase = 500000 - (rank * 50000);
          const totalWon = Math.max(300000, totalWonBase + Math.floor(Math.random() * 100000));
          const totalSolWon = totalWon * 0.00009;
          
          leaderboardArray.push({
            wallet: generateMockWallet(i),
            totalWon: totalWon,
            totalSolWon: totalSolWon,
          });
        }
        leaderboardArray.sort((a, b) => (b.totalWon || 0) - (a.totalWon || 0));
      } else {
        // Real data
        leaderboardArray = Array.from(rpsLeaderboard.entries()).map(([wallet, stats]) => ({
          wallet: wallet,
          totalWon: stats.totalWon || 0, // Sort by Luna won
          totalSolWon: stats.totalSolWon || 0,
        }));
        
        // Sort by total Luna won (descending)
        leaderboardArray.sort((a, b) => (b.totalWon || 0) - (a.totalWon || 0));
      }
      
      const top5 = leaderboardArray.slice(0, 5);
      
      // For demo mode, use mock reward pool if real pool is empty
      const displayRewardPool = isDemo && rewardPool === 0 ? 12.345678 : rewardPool;
      
      const distributionPlan = top5.map((player, index) => {
        const rank = index + 1;
        return {
          rank: rank,
          wallet: player.wallet,
          percentage: REWARD_PERCENTAGES[rank] * 100,
          estimatedAmount: displayRewardPool * REWARD_PERCENTAGES[rank],
        };
      });
      
      if (REWARD_DISTRIBUTION_WALLET) {
        distributionPlan.push({
          rank: "distribution",
          wallet: REWARD_DISTRIBUTION_WALLET,
          percentage: REWARD_PERCENTAGES.remaining * 100,
          estimatedAmount: displayRewardPool * REWARD_PERCENTAGES.remaining,
        });
      } else {
        distributionPlan.push({
          rank: "distribution",
          wallet: null,
          percentage: REWARD_PERCENTAGES.remaining * 100,
          estimatedAmount: displayRewardPool * REWARD_PERCENTAGES.remaining,
          note: "REWARD_DISTRIBUTION_WALLET not configured"
        });
      }
      
      return res.json({
        ok: true,
        rewardPool: displayRewardPool,
        distributionPlan: distributionPlan,
        top5: top5,
      });
    } catch (e) {
      log.error("[rps] Get reward pool error:", e);
      res.status(500).json({
        ok: false,
        error: e.message,
        message: "Failed to get reward pool",
      });
    }
  });
}









