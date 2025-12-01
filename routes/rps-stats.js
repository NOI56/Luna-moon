// routes/rps-stats.js
// RPS Stats/Info Routes

import { log } from "../modules/logger.js";
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";

/**
 * Setup RPS Stats routes
 * @param {Object} app - Express app instance
 * @param {Object} dependencies - Dependencies needed by routes
 */
export function setupRpsStatsRoutes(app, dependencies) {
  const {
    rpsLeaderboard,
    rpsGames,
    RPS_MIN_BALANCE,
    LUNA_TOKEN_MINT,
    getWalletBalance,
  } = dependencies;

  /**
   * Get Luna token balance for a wallet
   * GET /luna/rps/balance?wallet=wallet_address
   */
  app.get("/luna/rps/balance", async (req, res) => {
    try {
      const wallet = req.query.wallet;
      const mint =
        req.query.mint ||
        LUNA_TOKEN_MINT ||
        process.env.LUNA_TOKEN_MINT ||
        "CbB4ivri6wLfqx4NwrWY3ArD7mXv1e91HeYeq3KBpump";
      
      // If wallet is provided, check balance from blockchain
      if (wallet) {
        const forceRefresh = req.query.refresh === "true";
        try {
          const result = await getWalletBalance({
            wallet,
            mint,
            forceRefresh,
          });

          return res.json({
            ok: true,
            balance: result.balance,
            minRequired: RPS_MIN_BALANCE,
            canPlay: result.balance >= RPS_MIN_BALANCE,
            cached: result.cached,
            warning: result.warning,
          });
        } catch (error) {
          log.error(
            `[rps] Balance check failed for ${wallet.substring(0, 8)}...:`,
            error
          );
          return res.status(502).json({
            ok: false,
            error: "BalanceCheckFailed",
            message: error.message || "Failed to verify wallet balance",
          });
        }
      }
      
      // Fallback to username-based balance (for backward compatibility)
      const username = req.query.user || "guest";
      let balance = 0;
      
      // Mock: Check if user has played before (for demo purposes)
      if (rpsGames.has(username)) {
        balance = rpsGames.get(username).balance || 0;
      } else {
        // Mock balance for demo
        balance = Math.floor(Math.random() * 5000000); // 0-5M for testing
        rpsGames.set(username, { balance, lastPlay: 0 });
      }
      
      res.json({
        ok: true,
        balance: balance,
        minRequired: RPS_MIN_BALANCE,
        canPlay: balance >= RPS_MIN_BALANCE,
      });
    } catch (e) {
      log.error("[rps] Balance check error:", e);
      res.status(500).json({
        ok: false,
        error: e.message,
        message: "Failed to check balance",
      });
    }
  });

  /**
   * Get contract address (token mint address), buy link, and X/Twitter link
   * GET /luna/rps/contract-address
   */
  app.get("/luna/rps/contract-address", async (req, res) => {
    try {
      const mint = process.env.LUNA_TOKEN_MINT || "CbB4ivri6wLfqx4NwrWY3ArD7mXv1e91HeYeq3KBpump";
      const buyLink = process.env.LUNA_BUY_LINK || `https://pump.fun/${mint}`;
      const xLink = process.env.LUNA_X_LINK || "https://x.com/your_community";
      const liveLink =
        process.env.LUNA_LIVE_LINK ||
        process.env.LUNA_LIVE_URL ||
        "https://www.youtube.com/@LunaMoonAI/live";
      const githubLink =
        process.env.LUNA_GITHUB_LINK ||
        process.env.LUNA_GITHUB_URL ||
        "https://github.com/NOI56/Luna-moon";
      
      return res.json({
        ok: true,
        contractAddress: mint,
        buyLink: buyLink,
        xLink: xLink,
        liveLink: liveLink,
        githubLink: githubLink,
        message: "Contract address retrieved successfully"
      });
    } catch (e) {
      log.error("[rps] Contract address error:", e);
      res.status(500).json({
        ok: false,
        error: e.message,
        message: "Failed to get contract address",
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
   * Get leaderboard
   * GET /luna/rps/leaderboard?demo=true (optional - for testing with mock data)
   */
  app.get("/luna/rps/leaderboard", async (req, res) => {
    try {
      const isDemo = req.query.demo === 'true' || req.query.simulate === 'true';
      log.info(`[rps] Leaderboard request - demo: ${req.query.demo}, simulate: ${req.query.simulate}, isDemo: ${isDemo}`);
      
      let leaderboardArray;
      
      if (isDemo) {
        // Generate mock data for 50 players
        log.info("[rps] Generating demo leaderboard with 50 mock players");
        leaderboardArray = [];
        
        // Generate 50 players with varied stats
        for (let i = 0; i < 50; i++) {
          const rank = i + 1;
          // Top players have more wins, lower ranks have fewer wins
          const winsBase = Math.max(1, Math.floor(100 - (rank * 1.5)));
          const lossesBase = Math.max(0, Math.floor(Math.random() * (winsBase * 0.8)));
          const wins = winsBase + Math.floor(Math.random() * 20);
          const losses = lossesBase + Math.floor(Math.random() * 15);
          
          // Total won: Top players win more Luna
          // Rank 1: ~500K-1M Luna
          // Rank 50: ~10K-50K Luna
          const totalWonBase = 500000 - (rank * 10000);
          const totalWon = Math.max(5000, totalWonBase + Math.floor(Math.random() * 200000));
          
          // SOL won (approximately 0.00009 SOL per Luna)
          const totalSolWon = totalWon * 0.00009;
          
          leaderboardArray.push({
            wallet: generateMockWallet(i),
            wins: wins,
            losses: losses,
            totalWon: totalWon,
            totalSolWon: totalSolWon,
          });
        }
        
        // Sort by totalWon descending
        leaderboardArray.sort((a, b) => (b.totalWon || 0) - (a.totalWon || 0));
      } else {
        // Real data from rpsLeaderboard map
        leaderboardArray = Array.from(rpsLeaderboard.entries()).map(([wallet, stats]) => ({
          wallet: wallet,
          wins: stats.wins || 0,
          losses: stats.losses || 0,
          totalWon: stats.totalWon || 0,
          totalSolWon: stats.totalSolWon || 0,
        }));
        
        // Sort by total Luna won (descending)
        leaderboardArray.sort((a, b) => (b.totalWon || 0) - (a.totalWon || 0));
      }
      
      // Limit to Top 50
      const top50 = leaderboardArray.slice(0, 50);
      
      // Add rank to each entry
      top50.forEach((entry, index) => {
        entry.rank = index + 1;
      });
      
      return res.json({
        ok: true,
        leaderboard: top50,
        totalPlayers: leaderboardArray.length,
        message: isDemo ? "Demo leaderboard loaded successfully (Top 50 mock players)" : "Leaderboard loaded successfully (Top 50)"
      });
    } catch (e) {
      log.error("[rps] Leaderboard error:", e);
      res.status(500).json({
        ok: false,
        error: e.message,
        message: "Failed to load leaderboard",
      });
    }
  });

  /**
   * Get SOL balance for a wallet
   * GET /luna/rps/sol/balance?wallet=wallet_address
   */
  app.get("/luna/rps/sol/balance", async (req, res) => {
    try {
      const { wallet } = req.query || {};
      
      if (!wallet || typeof wallet !== "string") {
        return res.status(400).json({
          ok: false,
          error: "Invalid request",
          message: "Wallet address is required",
        });
      }
      
      const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
      let connection;
      
      try {
        connection = new Connection(rpcUrl, "confirmed");
        const walletPubKey = new PublicKey(wallet);
        const balance = await connection.getBalance(walletPubKey);
        const balanceInSol = balance / LAMPORTS_PER_SOL;
        
        return res.json({
          ok: true,
          wallet: wallet,
          balance: balanceInSol,
          balanceLamports: balance,
        });
      } catch (rpcError) {
        log.error("[rps] SOL balance check RPC error:", rpcError.message);
        throw new Error("Failed to fetch SOL balance: " + rpcError.message);
      }
    } catch (e) {
      log.error("[rps] SOL balance check error:", e);
      res.status(500).json({
        ok: false,
        error: e.message,
        message: "Failed to check SOL balance",
      });
    }
  });

  /**
   * Get match history for a wallet
   * GET /luna/rps/history?wallet=wallet_address
   */
  app.get("/luna/rps/history", async (req, res) => {
    try {
      const wallet = req.query.wallet;
      
      if (!wallet) {
        return res.status(400).json({
          ok: false,
          error: "Invalid request",
          message: "Wallet address is required",
        });
      }
      
      // Get match history from database
      const { getMatchHistory } = await import("../modules/db.js");
      const historyRecords = await getMatchHistory(wallet, 100);
      
      // Transform database records to API format
      const history = historyRecords.map(record => {
        // Determine if this wallet is player1 or player2
        const isPlayer1 = record.player1_wallet === wallet;
        const opponent = isPlayer1 ? record.player2_wallet : record.player1_wallet;
        const yourChoice = isPlayer1 ? record.player1_choice : record.player2_choice;
        const opponentChoice = isPlayer1 ? record.player2_choice : record.player1_choice;
        
        // Result is already from player1's perspective, so flip if this wallet is player2
        let result = record.result;
        if (!isPlayer1) {
          if (result === "win") result = "lose";
          else if (result === "lose") result = "win";
          // draw stays draw
        }
        
        return {
          timestamp: record.timestamp,
          date: new Date(record.timestamp).toISOString(),
          opponent: opponent,
          mode: record.mode,
          yourChoice: yourChoice,
          opponentChoice: opponentChoice,
          result: result,
          betAmount: record.bet_amount || 0,
          prizeAmount: isPlayer1 ? (record.prize_amount || 0) : (record.result === "lose" && isPlayer1 ? 0 : (record.bet_amount || 0))
        };
      });
      
      return res.json({
        ok: true,
        history: history,
        wallet: wallet,
        message: "Match history loaded successfully"
      });
    } catch (e) {
      log.error("[rps] History error:", e);
      res.status(500).json({
        ok: false,
        error: e.message,
        message: "Failed to load match history",
      });
    }
  });

  /**
   * Get player statistics
   * GET /luna/rps/stats?wallet=wallet_address
   */
  app.get("/luna/rps/stats", async (req, res) => {
    try {
      const wallet = req.query.wallet;
      
      if (!wallet) {
        return res.status(400).json({
          ok: false,
          error: "Invalid request",
          message: "Wallet address is required",
        });
      }
      
      // Get stats from rpsLeaderboard
      const playerStats = rpsLeaderboard.get(wallet);
      
      if (!playerStats) {
        // Player not found in leaderboard - return zero stats
        return res.json({
          ok: true,
          stats: {
            totalGames: 0,
            wins: 0,
            losses: 0,
            draws: 0,
            totalWon: 0,
          },
          wallet: wallet,
          message: "No statistics found for this wallet"
        });
      }
      
      // Calculate statistics
      const wins = playerStats.wins || 0;
      const losses = playerStats.losses || 0;
      const totalGames = wins + losses; // Note: draws are not currently tracked separately
      const draws = 0; // Draws not tracked in current implementation
      const totalWon = playerStats.totalWon || 0;
      
      return res.json({
        ok: true,
        stats: {
          totalGames: totalGames,
          wins: wins,
          losses: losses,
          draws: draws,
          totalWon: totalWon,
        },
        wallet: wallet,
        message: "Statistics loaded successfully"
      });
    } catch (e) {
      log.error("[rps] Stats error:", e);
      res.status(500).json({
        ok: false,
        error: e.message,
        message: "Failed to load statistics",
      });
    }
  });
}




