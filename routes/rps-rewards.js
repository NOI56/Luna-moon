// routes/rps-rewards.js
// RPS Rewards Routes

import { log } from "../modules/logger.js";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";

/**
 * Setup RPS Rewards routes
 * @param {Object} app - Express app instance
 * @param {Object} dependencies - Dependencies needed by routes
 */
export function setupRpsRewardsRoutes(app, dependencies) {
  const {
    rewardPool,
    rpsLeaderboard,
    collectedFees,
    BETTING_FEE_WALLET,
    SOLANA_RPC_URL,
    REWARD_DISTRIBUTION_WALLET,
    REWARD_PERCENTAGES,
    distributeRewards,
  } = dependencies;

  /**
   * Resolve current reward pool value from dependency (supports primitive or state accessor)
   */
  function getRewardPoolValue() {
    if (rewardPool && typeof rewardPool === "object") {
      const value = rewardPool.value ?? (typeof rewardPool.get === "function" ? rewardPool.get() : undefined);
      if (typeof value === "number" && Number.isFinite(value)) {
        return value;
      }
    }
    const numericValue = Number(rewardPool);
    return Number.isFinite(numericValue) ? numericValue : 0;
  }

  /**
   * Calculate total fees collected in SOL
   */
  function getTotalFeesCollected() {
    if (!collectedFees || typeof collectedFees.forEach !== "function") {
      return 0;
    }

    let total = 0;
    if (typeof collectedFees.values === "function") {
      for (const entry of collectedFees.values()) {
        total += entry?.totalFees || 0;
      }
    } else if (Array.isArray(collectedFees)) {
      collectedFees.forEach((entry) => {
        total += entry?.totalFees || 0;
      });
    }
    return total;
  }

  async function getFeeWalletBalanceInfo() {
    const feeWallet = BETTING_FEE_WALLET || process.env.BETTING_FEE_WALLET;
    if (!feeWallet) {
      return {
        wallet: null,
        balanceLamports: null,
        balanceSol: null,
        available: false,
        message: "BETTING_FEE_WALLET not configured",
      };
    }

    const rpcEndpoint =
      SOLANA_RPC_URL ||
      process.env.SOLANA_RPC_URL ||
      "https://api.mainnet-beta.solana.com";

    try {
      const connection = new Connection(rpcEndpoint, "confirmed");
      const balanceLamports = await connection.getBalance(new PublicKey(feeWallet));
      const balanceSol = balanceLamports / LAMPORTS_PER_SOL;

      return {
        wallet: feeWallet,
        balanceLamports,
        balanceSol,
        available: true,
      };
    } catch (error) {
      log.error("[rps] Fee wallet balance fetch error:", error);
      return {
        wallet: feeWallet,
        balanceLamports: null,
        balanceSol: null,
        available: false,
        error: error.message || "Failed to fetch fee wallet balance",
      };
    }
  }

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
      const currentRewardPool = getRewardPoolValue();
      const totalFeesCollected = getTotalFeesCollected();
      const feeWalletBalance = isDemo
        ? {
            wallet: BETTING_FEE_WALLET || process.env.BETTING_FEE_WALLET || "MockFeeWallet123",
            balanceLamports: 0,
            balanceSol: 0,
            available: false,
            message: "Demo mode - fee wallet balance not fetched",
          }
        : await getFeeWalletBalanceInfo();
      
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
      const displayRewardPool = isDemo && currentRewardPool === 0 ? 12.345678 : currentRewardPool;
      
      const distributionPlan = [];
      for (let rank = 1; rank <= 5; rank++) {
        const player = top5[rank - 1] || null;
        const percentage = REWARD_PERCENTAGES[rank] || 0;
        distributionPlan.push({
          rank,
          wallet: player?.wallet || null,
          percentage: percentage * 100,
          estimatedAmount: displayRewardPool * percentage,
          note: player ? null : "No player in this position yet",
        });
      }
      
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
        totalFeesCollected: totalFeesCollected,
        feeWalletBalance,
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









