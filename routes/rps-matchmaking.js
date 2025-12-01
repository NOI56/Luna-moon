// routes/rps-matchmaking.js
// RPS Matchmaking Routes (Queue, Match, Submit, Play)

import { log } from "../modules/logger.js";
import { saveMatchHistory } from "../modules/db.js";

/**
 * Setup RPS Matchmaking routes
 * @param {Object} app - Express app instance
 * @param {Object} dependencies - Dependencies needed by routes
 */
export function setupRpsMatchmakingRoutes(app, dependencies) {
  const {
    rpsMatchQueue,
    rpsActiveMatches,
    rpsGames,
    clients,
    broadcast,
    sendNotification,
    MATCH_TIMEOUT,
    RPS_MIN_BALANCE,
    LUNA_TOKEN_MINT,
    getWalletBalance,
    validateWalletAddress,
  } = dependencies;

  const ACTIVE_LUNA_MINT =
    LUNA_TOKEN_MINT ||
    process.env.LUNA_TOKEN_MINT ||
    "CbB4ivri6wLfqx4NwrWY3ArD7mXv1e91HeYeq3KBpump";

  async function verifyWalletEligibility(wallet, { forceRefresh = false } = {}) {
    try {
      validateWalletAddress(wallet, "wallet");

      const result = await getWalletBalance({
        wallet,
        mint: ACTIVE_LUNA_MINT,
        forceRefresh,
      });

      const playerBalance =
        typeof result.balance === "number" ? result.balance : 0;

      if (playerBalance < RPS_MIN_BALANCE) {
        return {
          ok: false,
          code: "INSUFFICIENT_BALANCE",
          balance: playerBalance,
          message: `You need at least ${RPS_MIN_BALANCE.toLocaleString()} Luna tokens to play. Current balance: ${playerBalance.toLocaleString()}`,
        };
      }

      return {
        ok: true,
        balance: playerBalance,
      };
    } catch (error) {
      return {
        ok: false,
        code: "BALANCE_CHECK_FAILED",
        message: error.message || "Failed to verify wallet balance. Please reconnect your Phantom wallet.",
      };
    }
  }

  /**
   * Cancel matchmaking queue
   * DELETE /luna/rps/queue
   */
  app.delete("/luna/rps/queue", async (req, res) => {
    try {
      const { wallet } = req.body || req.query || {};
      
      if (!wallet || typeof wallet !== "string") {
        return res.status(400).json({
          ok: false,
          error: "Invalid request",
          message: "Wallet address is required",
        });
      }

      try {
        validateWalletAddress(wallet, "wallet");
      } catch (validationError) {
        return res.status(400).json({
          ok: false,
          error: "InvalidWallet",
          message: validationError.message,
        });
      }

      // Check if in queue
      if (!rpsMatchQueue.has(wallet)) {
        return res.json({
          ok: true,
          cancelled: false,
          message: "Not in queue",
        });
      }

      // Get queue data and clear timeout if exists
      const queueData = rpsMatchQueue.get(wallet);
      if (queueData && queueData.timeoutId) {
        clearTimeout(queueData.timeoutId);
      }

      // Remove from queue
      rpsMatchQueue.delete(wallet);

      log.info(`[rps] Player ${wallet} cancelled queue`);

      return res.json({
        ok: true,
        cancelled: true,
        message: "Queue cancelled",
      });
    } catch (error) {
      log.error("[rps] Cancel queue error:", error);
      return res.status(500).json({
        ok: false,
        error: error.message,
        message: "Failed to cancel queue",
      });
    }
  });

  /**
   * Join matchmaking queue
   * POST /luna/rps/queue
   */
  app.post("/luna/rps/queue", async (req, res) => {
    try {
      const { wallet } = req.body || {};
      
      if (!wallet || typeof wallet !== "string") {
        return res.status(400).json({
          ok: false,
          error: "Invalid request",
          message: "Wallet address is required",
        });
      }

      const eligibility = await verifyWalletEligibility(wallet);
      if (!eligibility.ok) {
        const statusCode = eligibility.code === "INSUFFICIENT_BALANCE" ? 403 : 502;
        return res.status(statusCode).json({
          ok: false,
          error: eligibility.code,
          message: eligibility.message,
          balance: eligibility.balance ?? null,
          minRequired: RPS_MIN_BALANCE,
        });
      }

      // Check if already in queue
      if (rpsMatchQueue.has(wallet)) {
        const queueData = rpsMatchQueue.get(wallet);
        return res.json({
          ok: true,
          inQueue: true,
          queueTime: Date.now() - queueData.timestamp,
          message: "Already in queue",
        });
      }

      // Add to queue
      rpsMatchQueue.set(wallet, {
        timestamp: Date.now(),
        choice: null,
        matchedWith: null,
        timeoutId: null, // Will be set after timeout is created
      });

      // Try to find a match
      let matchedPlayer = null;
      for (const [otherWallet, otherData] of rpsMatchQueue.entries()) {
        if (otherWallet !== wallet && !otherData.matchedWith) {
          matchedPlayer = otherWallet;
          break;
        }
      }

      if (matchedPlayer) {
        // Found a match!
        const matchId = `${wallet}_${matchedPlayer}_${Date.now()}`;
        const queueData1 = rpsMatchQueue.get(wallet);
        const queueData2 = rpsMatchQueue.get(matchedPlayer);
        
        queueData1.matchedWith = matchedPlayer;
        queueData2.matchedWith = wallet;
        
        rpsActiveMatches.set(matchId, {
          player1: wallet,
          player2: matchedPlayer,
          choices: {},
          timestamp: Date.now(),
        });

        // Remove from queue
        rpsMatchQueue.delete(wallet);
        rpsMatchQueue.delete(matchedPlayer);

        // Broadcast match found
        broadcast({
          type: "rps_match_found",
          matchId: matchId,
          player1: wallet,
          player2: matchedPlayer,
        });
        
        // Send notifications to both players
        sendNotification(wallet, 'match_found', 'Match Found!', 
          `You've been matched with ${matchedPlayer.substring(0, 8)}...`, 
          { matchId: matchId, opponent: matchedPlayer });
        
        sendNotification(matchedPlayer, 'match_found', 'Match Found!', 
          `You've been matched with ${wallet.substring(0, 8)}...`, 
          { matchId: matchId, opponent: wallet });

        return res.json({
          ok: true,
          matched: true,
          matchId: matchId,
          opponent: matchedPlayer,
          message: "Match found!",
        });
      }

      // No match found, wait for timeout
      log.info(`[rps] Player ${wallet} added to queue, waiting ${MATCH_TIMEOUT}ms for opponent...`);
      
      // Store timeout ID for cancellation
      const timeoutId = setTimeout(() => {
        log.info(`[rps] Timeout reached for ${wallet}, checking if still in queue...`);
        if (rpsMatchQueue.has(wallet)) {
          const queueData = rpsMatchQueue.get(wallet);
          log.info(`[rps] Queue data for ${wallet}:`, queueData);
          if (!queueData.matchedWith) {
            // Create bot opponent
            const botWallet = `Bot_${Math.random().toString(36).substring(2, 15)}`;
            const matchId = `${wallet}_${botWallet}_${Date.now()}`;
            
            rpsActiveMatches.set(matchId, {
              player1: wallet,
              player2: botWallet,
              isBot: true,
              choices: {},
              timestamp: Date.now(),
            });

            rpsMatchQueue.delete(wallet);

            // Broadcast bot match
            log.info(`[rps] ✅ Bot match created: ${matchId} for wallet ${wallet}`);
            log.info(`[rps] Active WebSocket clients: ${clients.size}`);
            const broadcastMsg = {
              type: "rps_match_found",
              matchId: matchId,
              player1: wallet,
              player2: botWallet,
              isBot: true,
            };
            broadcast(broadcastMsg);
            log.info(`[rps] ✅ Bot match broadcasted:`, JSON.stringify(broadcastMsg));
          } else {
            log.info(`[rps] ⚠️ Player ${wallet} already matched with ${queueData.matchedWith}`);
          }
        } else {
          log.info(`[rps] ⚠️ Player ${wallet} not found in queue (may have been matched or removed)`);
        }
      }, MATCH_TIMEOUT);
      
      // Store timeout ID in queue data for cancellation
      const queueData = rpsMatchQueue.get(wallet);
      if (queueData) {
        queueData.timeoutId = timeoutId;
      }

      return res.json({
        ok: true,
        inQueue: true,
        message: "Waiting for opponent...",
        timeout: MATCH_TIMEOUT,
      });
    } catch (e) {
      log.error("[rps] Queue error:", e);
      res.status(500).json({
        ok: false,
        error: e.message,
        message: "Failed to join queue",
      });
    }
  });

  /**
   * Check active match for a wallet
   * GET /luna/rps/match?wallet=wallet_address
   */
  app.get("/luna/rps/match", async (req, res) => {
    try {
      const { wallet } = req.query || {};
      
      if (!wallet || typeof wallet !== "string") {
        return res.status(400).json({
          ok: false,
          error: "Invalid request",
          message: "Wallet address is required",
        });
      }

      log.verbose(`[rps] Checking match for wallet: ${wallet}`);
      log.verbose(`[rps] Active matches: ${rpsActiveMatches.size}, Queue: ${rpsMatchQueue.size}`);

      // Check if wallet has an active match
      for (const [matchId, match] of rpsActiveMatches.entries()) {
        if (match.player1 === wallet || match.player2 === wallet) {
          log.verbose(`[rps] ✅ Found active match: ${matchId} for wallet ${wallet}`);
          return res.json({
            ok: true,
            hasMatch: true,
            matchId: matchId,
            player1: match.player1,
            player2: match.player2,
            isBot: match.isBot || false,
            choices: match.choices || {},
          });
        }
      }

      // Check if still in queue
      if (rpsMatchQueue.has(wallet)) {
        const queueData = rpsMatchQueue.get(wallet);
        const queueTime = Date.now() - queueData.timestamp;
        log.verbose(`[rps] Wallet ${wallet} still in queue (${queueTime}ms)`);
        return res.json({
          ok: true,
          hasMatch: false,
          inQueue: true,
          queueTime: queueTime,
        });
      }

      log.verbose(`[rps] ⚠️ Wallet ${wallet} not found in queue or active matches`);
      return res.json({
        ok: true,
        hasMatch: false,
        inQueue: false,
      });
    } catch (e) {
      log.error("[rps] Match check error:", e);
      res.status(500).json({
        ok: false,
        error: e.message,
        message: "Failed to check match",
      });
    }
  });

  /**
   * Submit choice for PvP match
   * POST /luna/rps/submit
   * Body: { matchId: "match_id", wallet: "wallet_address", choice: "rock" | "paper" | "scissors" }
   */
  app.post("/luna/rps/submit", async (req, res) => {
    try {
      const { matchId, wallet, choice } = req.body || {};
      
      if (!matchId || !wallet || !choice) {
        return res.status(400).json({
          ok: false,
          error: "Invalid request",
          message: "matchId, wallet, and choice are required",
        });
      }

      const validChoices = ["rock", "paper", "scissors"];
      if (!validChoices.includes(choice)) {
        return res.status(400).json({
          ok: false,
          error: "Invalid choice",
          message: "Choice must be: rock, paper, or scissors",
        });
      }

      const match = rpsActiveMatches.get(matchId);
      if (!match) {
        return res.status(404).json({
          ok: false,
          error: "Match not found",
          message: "Match does not exist or has expired",
        });
      }

      if (match.player1 !== wallet && match.player2 !== wallet) {
        return res.status(403).json({
          ok: false,
          error: "Unauthorized",
          message: "You are not part of this match",
        });
      }

      // Store choice
      const playerKey = match.player1 === wallet ? "player1" : "player2";
      match.choices[playerKey] = choice;

      // Check if both players have submitted
      if (match.choices.player1 && match.choices.player2) {
        // Both choices submitted, determine winner
        const p1Choice = match.choices.player1;
        const p2Choice = match.choices.player2;
        
        let result = "tie";
        if (p1Choice === "rock" && p2Choice === "scissors") result = "player1";
        else if (p1Choice === "paper" && p2Choice === "rock") result = "player1";
        else if (p1Choice === "scissors" && p2Choice === "paper") result = "player1";
        else if (p1Choice !== p2Choice) result = "player2";

        // Broadcast result
        broadcast({
          type: "rps_match_result",
          matchId: matchId,
          player1: match.player1,
          player2: match.player2,
          choice1: p1Choice,
          choice2: p2Choice,
          result: result,
        });

        // Save match history for both players
        try {
          const winnerWallet = result === "player1" ? match.player1 : result === "player2" ? match.player2 : null;
          const player1Result = result === "player1" ? "win" : result === "player2" ? "lose" : "draw";
          const player2Result = result === "player2" ? "win" : result === "player1" ? "lose" : "draw";
          
          // For player1
          await saveMatchHistory(
            match.player1,
            match.player2,
            "PvP",
            p1Choice,
            p2Choice,
            player1Result,
            winnerWallet,
            0,
            0
          );
          
          // For player2
          await saveMatchHistory(
            match.player2,
            match.player1,
            "PvP",
            p2Choice,
            p1Choice,
            player2Result,
            winnerWallet,
            0,
            0
          );
        } catch (historyErr) {
          log.error("[rps] Failed to save PvP match history:", historyErr);
          // Don't fail the match if history save fails
        }

        // Clean up
        rpsActiveMatches.delete(matchId);

        return res.json({
          ok: true,
          submitted: true,
          bothSubmitted: true,
          result: result,
          winner: result === "player1" ? match.player1 : result === "player2" ? match.player2 : null,
        });
      } else if (match.isBot && match.choices.player1) {
        // Bot match - bot chooses randomly
        const botChoice = validChoices[Math.floor(Math.random() * validChoices.length)];
        match.choices.player2 = botChoice;

        // Determine winner
        const p1Choice = match.choices.player1;
        const p2Choice = botChoice;
        
        let result = "tie";
        if (p1Choice === "rock" && p2Choice === "scissors") result = "player1";
        else if (p1Choice === "paper" && p2Choice === "rock") result = "player1";
        else if (p1Choice === "scissors" && p2Choice === "paper") result = "player1";
        else if (p1Choice !== p2Choice) result = "player2";

        // Broadcast result
        broadcast({
          type: "rps_match_result",
          matchId: matchId,
          player1: match.player1,
          player2: match.player2,
          choice1: p1Choice,
          choice2: p2Choice,
          result: result,
          isBot: true,
        });

        // Save match history for player (bot matches)
        try {
          const winnerWallet = result === "player1" ? match.player1 : result === "player2" ? match.player2 : null;
          const player1Result = result === "player1" ? "win" : result === "player2" ? "lose" : "draw";
          
          // For player1 only (bot is player2)
          await saveMatchHistory(
            match.player1,
            match.player2 + " (Bot)",
            "PvP",
            p1Choice,
            p2Choice,
            player1Result,
            winnerWallet,
            0,
            0
          );
        } catch (historyErr) {
          log.error("[rps] Failed to save Bot match history:", historyErr);
          // Don't fail the match if history save fails
        }

        // Clean up
        rpsActiveMatches.delete(matchId);

        return res.json({
          ok: true,
          submitted: true,
          bothSubmitted: true,
          result: result,
          opponentChoice: botChoice,
          winner: result === "player1" ? match.player1 : result === "player2" ? match.player2 : null,
        });
      }

      return res.json({
        ok: true,
        submitted: true,
        bothSubmitted: false,
        message: "Waiting for opponent...",
      });
    } catch (e) {
      log.error("[rps] Submit error:", e);
      res.status(500).json({
        ok: false,
        error: e.message,
        message: "Failed to submit choice",
      });
    }
  });

  /**
   * Play Rock Paper Scissors (Legacy - vs Luna)
   * POST /luna/rps/play
   * Body: { user: "username", choice: "rock" | "paper" | "scissors" }
   */
  app.post("/luna/rps/play", async (req, res) => {
    try {
      const { user, wallet, choice, testMode } = req.body || {};
      // Support both 'user' (old) and 'wallet' (new) for backward compatibility
      const username = wallet || user || "guest";
      const isTestMode = testMode === true || testMode === "true" || process.env.RPS_TEST_MODE === "true";
      
      // Validate choice
      const validChoices = ["rock", "paper", "scissors"];
      if (!choice || !validChoices.includes(choice.toLowerCase())) {
        return res.status(400).json({
          ok: false,
          error: "Invalid choice",
          message: "Choice must be: rock, paper, or scissors",
        });
      }
      
      // Check balance
      let balance = 0;
      let userData = rpsGames.get(username);
      if (!userData) {
        userData = { balance: 0, lastPlay: 0 };
        rpsGames.set(username, userData);
      }
      
      if (isTestMode) {
        // TEST MODE: Use mock balance (2M Luna)
        balance = 2000000;
        userData.balance = balance;
        log.info(`[rps] TEST MODE: Using mock balance ${balance} for ${username}`);
      } else {
        if (!wallet || typeof wallet !== "string") {
          return res.status(400).json({
            ok: false,
            error: "WalletRequired",
            message: "กรุณาเชื่อมต่อกระเป๋า Phantom ให้เรียบร้อยก่อนเล่นกับ Luna",
          });
        }

        try {
          validateWalletAddress(wallet, "wallet");
        } catch (validationError) {
          return res.status(400).json({
            ok: false,
            error: "InvalidWallet",
            message: validationError.message,
          });
        }

        const eligibility = await verifyWalletEligibility(wallet);
        if (!eligibility.ok) {
          const statusCode = eligibility.code === "INSUFFICIENT_BALANCE" ? 403 : 502;
          return res.status(statusCode).json({
            ok: false,
            error: eligibility.code,
            message: eligibility.message,
            balance: eligibility.balance ?? null,
            minRequired: RPS_MIN_BALANCE,
          });
        }

        balance = eligibility.balance;
        userData.balance = balance;
      }
      
      if (balance < RPS_MIN_BALANCE) {
        return res.status(403).json({
          ok: false,
          error: "Insufficient balance",
          message: `You need at least ${RPS_MIN_BALANCE.toLocaleString()} Luna tokens to play. Current: ${balance.toLocaleString()}`,
        });
      }
      
      // Rate limiting: Max 1 game per 3 seconds
      const now = Date.now();
      if (!isTestMode) {
        if (userData.lastPlay && now - userData.lastPlay < 3000) {
          return res.status(429).json({
            ok: false,
            error: "Rate limit",
            message: "Please wait a moment before playing again~",
          });
        }
        
        userData.lastPlay = now;
      }
      
      // Luna's choice (random)
      const lunaChoice = validChoices[Math.floor(Math.random() * validChoices.length)];
      const playerChoice = choice.toLowerCase();
      
      // Determine winner
      let result = "tie";
      if (playerChoice === "rock" && lunaChoice === "scissors") result = "win";
      else if (playerChoice === "paper" && lunaChoice === "rock") result = "win";
      else if (playerChoice === "scissors" && lunaChoice === "paper") result = "win";
      else if (playerChoice !== lunaChoice) result = "lose";
      
      // Broadcast game result to WebSocket clients (for stream overlay)
      broadcast({
        type: "rps_game",
        player: username,
        playerChoice: playerChoice,
        lunaChoice: lunaChoice,
        result: result,
        timestamp: now,
      });
      
      // Log game
      log.info(`[rps] ${username} played ${playerChoice} vs Luna's ${lunaChoice} → ${result}`);
      
      // Save match history
      try {
        await saveMatchHistory(
          wallet,
          "Luna",
          "VS Luna",
          playerChoice,
          lunaChoice,
          result,
          result === "win" ? wallet : (result === "lose" ? "Luna" : null),
          0,
          0
        );
      } catch (historyErr) {
        log.error("[rps] Failed to save VS Luna match history:", historyErr);
        // Don't fail the game if history save fails
      }
      
      res.json({
        ok: true,
        playerChoice: playerChoice,
        lunaChoice: lunaChoice,
        result: result,
        message: result === "win" ? "You win! 🎉" : result === "lose" ? "You lose! 😢" : "It's a tie! 🤝",
      });
    } catch (e) {
      log.error("[rps] Play error:", e);
      res.status(500).json({
        ok: false,
        error: e.message,
        message: "Game failed. Please try again~",
      });
    }
  });
}


