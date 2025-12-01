// routes/rps-betting.js
// RPS Betting Routes

import { log } from "../modules/logger.js";
import { saveMatchHistory } from "../modules/db.js";

/**
 * Setup RPS Betting routes
 * @param {Object} app - Express app instance
 * @param {Object} dependencies - Dependencies needed by routes
 */
export function setupRpsBettingRoutes(app, dependencies) {
  const {
    rpsBettingRooms,
    rpsLeaderboard,
    collectedFees,
    walletIpMap,
    broadcast,
    sendNotification,
    validateWalletAddress,
    getClientIp,
    checkIpRateLimit,
    updateIpActivity,
    validateGameRequest,
    recordWalletPairMatch,
    fetchLunaPriceInSol,
    lunaToSol,
    calculateFee,
    collectFee,
    RPS_BETTING_ROOM_TIMEOUT,
    LUNA_TOKEN_MINT,
    PRICE_CACHE_TTL,
    priceCache,
  } = dependencies;

  /**
   * Create a betting room
   * POST /luna/rps/betting/create
   */
  app.post("/luna/rps/betting/create", async (req, res) => {
    try {
      const { wallet, betAmount } = req.body || {};
      
      // Security: Validate wallet address format
      try {
        validateWalletAddress(wallet, 'wallet');
      } catch (e) {
        return res.status(400).json({
          ok: false,
          error: "Invalid request",
          message: e.message || "Invalid wallet address format",
        });
      }
      
      if (!betAmount || typeof betAmount !== "number" || betAmount < 1) {
        return res.status(400).json({
          ok: false,
          error: "Invalid request",
          message: "Bet amount must be at least 1 Luna",
        });
      }
      
      // Security: Limit maximum bet amount to prevent abuse
      const MAX_BET_AMOUNT = 1000000000; // 1 billion Luna
      if (betAmount > MAX_BET_AMOUNT) {
        return res.status(400).json({
          ok: false,
          error: "Invalid request",
          message: "Bet amount exceeds maximum limit",
        });
      }
      
      // Check if user already has an active room
      for (const [roomId, room] of rpsBettingRooms.entries()) {
        if (room.creator === wallet && !room.player2) {
          return res.json({
            ok: true,
            roomId: roomId,
            message: "You already have an active room",
          });
        }
      }
      
      // Anti-abuse: Check IP cooldown only
      const ip = getClientIp(req);
      const rateLimitCheck = checkIpRateLimit(ip);
      if (!rateLimitCheck.allowed) {
        return res.status(429).json({
          ok: false,
          error: "Cooldown active",
          message: rateLimitCheck.reason,
          code: "COOLDOWN"
        });
      }
      
      const roomId = `betting_${wallet}_${Date.now()}`;
      rpsBettingRooms.set(roomId, {
        creator: wallet,
        betAmount: betAmount,
        player2: null,
        choices: {},
        timestamp: Date.now(),
      });
      
      // Collect betting fee in SOL from creator (3% default, reduced if deposited)
      const feeInSol = await calculateFee(betAmount, wallet);
      await collectFee(wallet, feeInSol, roomId, betAmount);
      
      // Auto-cleanup after timeout
      setTimeout(() => {
        if (rpsBettingRooms.has(roomId)) {
          const room = rpsBettingRooms.get(roomId);
          if (!room.player2) {
            rpsBettingRooms.delete(roomId);
            log.info(`[rps-betting] Room ${roomId} expired (no challenger)`);
            broadcast({
              type: "rps_betting_room_removed",
              roomId: roomId,
            });
          }
        }
      }, RPS_BETTING_ROOM_TIMEOUT);
      
      // Broadcast new room
      broadcast({
        type: "rps_betting_room_created",
        roomId: roomId,
        creator: wallet,
        betAmount: betAmount,
      });
      
      // Send notification to all users about new room
      sendNotification(null, 'room_new', 'New Betting Room!', 
        `New room created with bet amount: ${betAmount} Luna tokens`, 
        { roomId: roomId, creator: wallet, betAmount: betAmount });
      
      log.info(`[rps-betting] Room created: ${roomId} by ${wallet} with bet ${betAmount}`);
      
      return res.json({
        ok: true,
        roomId: roomId,
        message: "Room created successfully",
      });
    } catch (e) {
      log.error("[rps-betting] Create room error:", e);
      res.status(500).json({
        ok: false,
        error: "Internal server error",
        message: "Failed to create room. Please try again later.",
      });
    }
  });

  /**
   * Cancel a betting room
   * POST /luna/rps/betting/cancel
   */
  app.post("/luna/rps/betting/cancel", async (req, res) => {
    try {
      log.info(`[rps-betting] Cancel room request received:`, req.body);
      const { wallet, roomId } = req.body || {};
      
      // Security: Validate wallet address format
      try {
        validateWalletAddress(wallet, 'wallet');
      } catch (e) {
        return res.status(400).json({
          ok: false,
          error: "Invalid request",
          message: e.message || "Invalid wallet address format",
        });
      }
      
      if (!roomId || typeof roomId !== "string" || roomId.length > 200) {
        return res.status(400).json({
          ok: false,
          error: "Invalid request",
          message: "Room ID is required and must be a valid string",
        });
      }
      
      const room = rpsBettingRooms.get(roomId);
      
      if (!room) {
        return res.status(404).json({
          ok: false,
          error: "Room not found",
          message: "This room no longer exists",
        });
      }
      
      // Check if user is the creator or player2
      if (room.creator !== wallet && room.player2 !== wallet) {
        return res.status(403).json({
          ok: false,
          error: "Not authorized",
          message: "You are not a player in this room",
        });
      }
      
      // Only allow cancellation if game hasn't started (no choices submitted)
      if (room.choices && (room.choices.player1 || room.choices.player2)) {
        return res.status(400).json({
          ok: false,
          error: "Game in progress",
          message: "Cannot cancel room while game is in progress",
        });
      }
      
      // Remove room
      rpsBettingRooms.delete(roomId);
      
      // Broadcast room cancellation
      broadcast({
        type: "rps_betting_room_cancelled",
        roomId: roomId,
        cancelledBy: wallet,
      });
      
      log.info(`[rps-betting] Room ${roomId} cancelled by ${wallet}`);
      
      return res.json({
        ok: true,
        message: "Room cancelled successfully",
      });
    } catch (e) {
      log.error("[rps-betting] Cancel room error:", e);
      res.status(500).json({
        ok: false,
        error: "Internal server error",
        message: "Failed to cancel room. Please try again later.",
      });
    }
  });

  /**
   * Get all available betting rooms
   * GET /luna/rps/betting/rooms
   */
  app.get("/luna/rps/betting/rooms", async (req, res) => {
    try {
      const rooms = [];
      
      // Clean up expired rooms
      const now = Date.now();
      for (const [roomId, room] of rpsBettingRooms.entries()) {
        if (now - room.timestamp > RPS_BETTING_ROOM_TIMEOUT && !room.player2) {
          rpsBettingRooms.delete(roomId);
          continue;
        }
        
        rooms.push({
          roomId: roomId,
          creator: room.creator,
          betAmount: room.betAmount,
          player2: room.player2,
          timestamp: room.timestamp,
        });
      }
      
      // Sort by timestamp (newest first)
      rooms.sort((a, b) => b.timestamp - a.timestamp);
      
      return res.json({
        ok: true,
        rooms: rooms,
      });
    } catch (e) {
      log.error("[rps-betting] Get rooms error:", e);
      res.status(500).json({
        ok: false,
        error: e.message,
        message: "Failed to get rooms",
      });
    }
  });

  /**
   * Join a betting room
   * POST /luna/rps/betting/join
   */
  app.post("/luna/rps/betting/join", async (req, res) => {
    try {
      const { wallet, roomId } = req.body || {};
      
      // Security: Validate wallet address format
      try {
        validateWalletAddress(wallet, 'wallet');
      } catch (e) {
        return res.status(400).json({
          ok: false,
          error: "Invalid request",
          message: e.message || "Invalid wallet address format",
        });
      }
      
      if (!roomId || typeof roomId !== "string" || roomId.length > 200) {
        return res.status(400).json({
          ok: false,
          error: "Invalid request",
          message: "Room ID is required and must be a valid string",
        });
      }
      
      const room = rpsBettingRooms.get(roomId);
      
      if (!room) {
        return res.status(404).json({
          ok: false,
          error: "Room not found",
          message: "This room no longer exists",
        });
      }
      
      if (room.creator === wallet) {
        return res.status(400).json({
          ok: false,
          error: "Cannot join own room",
          message: "You cannot join your own room",
        });
      }
      
      if (room.player2) {
        return res.status(400).json({
          ok: false,
          error: "Room full",
          message: "This room already has a challenger",
        });
      }
      
      // Anti-abuse: Validate game request
      const validation = validateGameRequest(room.creator, wallet, req);
      if (!validation.valid) {
        return res.status(403).json({
          ok: false,
          error: validation.error,
          code: validation.code,
          message: validation.error
        });
      }
      
      // Add player2
      room.player2 = wallet;
      room.choices = {};
      
      // Collect betting fee in SOL from player2 (challenger) (3% default, reduced if deposited)
      const feeInSol = await calculateFee(room.betAmount, wallet);
      await collectFee(wallet, feeInSol, roomId, room.betAmount);
      
      // Broadcast room joined
      broadcast({
        type: "rps_betting_room_joined",
        roomId: roomId,
        creator: room.creator,
        opponent: wallet,
        betAmount: room.betAmount,
      });
      
      log.info(`[rps-betting] Room ${roomId} joined by ${wallet}`);
      
      return res.json({
        ok: true,
        roomId: roomId,
        creator: room.creator,
        betAmount: room.betAmount,
        message: "Joined room successfully",
      });
    } catch (e) {
      log.error("[rps-betting] Join room error:", e);
      res.status(500).json({
        ok: false,
        error: "Internal server error",
        message: "Failed to join room. Please try again later.",
      });
    }
  });

  /**
   * Get current Luna price in SOL
   * GET /luna/rps/betting/price
   */
  app.get("/luna/rps/betting/price", async (req, res) => {
    try {
      const price = await fetchLunaPriceInSol();
      const cached = priceCache.get(LUNA_TOKEN_MINT);
      
      if (price === null) {
        return res.status(503).json({
          ok: false,
          error: "Price not available",
          message: "Could not fetch Luna price. Please check LUNA_TOKEN_MINT in .env",
        });
      }
      
      return res.json({
        ok: true,
        price: price,
        pricePerLuna: price,
        cached: cached ? Date.now() - cached.timestamp < PRICE_CACHE_TTL : false,
        cacheAge: cached ? Date.now() - cached.timestamp : null,
        mint: LUNA_TOKEN_MINT,
      });
    } catch (e) {
      log.error("[rps-betting] Get price error:", e);
      res.status(500).json({
        ok: false,
        error: e.message,
        message: "Failed to get price",
      });
    }
  });

  /**
   * Get collected fees (admin endpoint)
   * GET /luna/rps/betting/fees?wallet=wallet_address (optional - if not provided, returns all fees)
   */
  app.get("/luna/rps/betting/fees", async (req, res) => {
    try {
      const { wallet } = req.query || {};
      const feeWallet = process.env.BETTING_FEE_WALLET || null;
      
      if (wallet && typeof wallet === "string") {
        // Get fees for specific wallet
        const feeData = collectedFees.get(wallet);
        if (!feeData) {
          return res.json({
            ok: true,
            wallet: wallet,
            totalFees: 0,
            transactions: [],
            feeWallet: feeWallet,
            note: feeWallet ? `Fees should be sent to: ${feeWallet}` : "No fee wallet configured"
          });
        }
        
        return res.json({
          ok: true,
          wallet: wallet,
          totalFees: feeData.totalFees,
          transactions: feeData.transactions,
          feeWallet: feeWallet,
          note: feeWallet ? `Fees should be sent to: ${feeWallet}` : "No fee wallet configured"
        });
      } else {
        // Get all fees
        const allFees = {};
        let totalAllFees = 0;
        
        for (const [walletAddr, feeData] of collectedFees.entries()) {
          allFees[walletAddr] = {
            totalFees: feeData.totalFees,
            transactionCount: feeData.transactions.length
          };
          totalAllFees += feeData.totalFees;
        }
        
        return res.json({
          ok: true,
          totalCollectedFees: totalAllFees,
          feeBreakdown: allFees,
          feeWallet: feeWallet,
          note: feeWallet ? `All fees should be sent to: ${feeWallet}` : "No fee wallet configured. Fees are tracked in memory only."
        });
      }
    } catch (e) {
      log.error("[rps-betting] Get fees error:", e);
      res.status(500).json({
        ok: false,
        error: e.message,
        message: "Failed to get fees",
      });
    }
  });

  /**
   * Submit choice in betting match
   * POST /luna/rps/betting/submit
   */
  app.post("/luna/rps/betting/submit", async (req, res) => {
    try {
      const { wallet, roomId, choice } = req.body || {};
      
      // Security: Validate wallet address format
      try {
        validateWalletAddress(wallet, 'wallet');
      } catch (e) {
        return res.status(400).json({
          ok: false,
          error: "Invalid request",
          message: e.message || "Invalid wallet address format",
        });
      }
      
      if (!roomId || typeof roomId !== "string" || roomId.length > 200) {
        return res.status(400).json({
          ok: false,
          error: "Invalid request",
          message: "Room ID is required and must be a valid string",
        });
      }
      
      // Security: Validate choice (case-insensitive, trim whitespace)
      const normalizedChoice = choice ? choice.toLowerCase().trim() : '';
      if (!normalizedChoice || !["rock", "paper", "scissors"].includes(normalizedChoice)) {
        return res.status(400).json({
          ok: false,
          error: "Invalid request",
          message: "Valid choice (rock, paper, scissors) is required",
        });
      }
      
      const room = rpsBettingRooms.get(roomId);
      
      if (!room) {
        return res.status(404).json({
          ok: false,
          error: "Room not found",
          message: "This room no longer exists",
        });
      }
      
      if (room.creator !== wallet && room.player2 !== wallet) {
        return res.status(403).json({
          ok: false,
          error: "Not a player in this room",
          message: "You are not a player in this room",
        });
      }
      
      if (!room.player2) {
        return res.status(400).json({
          ok: false,
          error: "Room not ready",
          message: "Waiting for opponent to join",
        });
      }
      
      // Store choice
      if (wallet === room.creator) {
        room.choices.player1 = normalizedChoice;
      } else {
        room.choices.player2 = normalizedChoice;
      }
      
      // Check if both players have submitted
      if (room.choices.player1 && room.choices.player2) {
        // Determine winner
        const p1Choice = room.choices.player1;
        const p2Choice = room.choices.player2;
        
        let winner = null;
        if (p1Choice === p2Choice) {
          winner = "draw";
        } else if (
          (p1Choice === "rock" && p2Choice === "scissors") ||
          (p1Choice === "paper" && p2Choice === "rock") ||
          (p1Choice === "scissors" && p2Choice === "paper")
        ) {
          winner = room.creator; // Player 1 wins
        } else {
          winner = room.player2; // Player 2 wins
        }
        
        // Update leaderboard and calculate rewards
        const betAmountInSol = await lunaToSol(room.betAmount);
        const totalPot = betAmountInSol * 2; // Both players bet the same amount
        
        // Anti-abuse: Record wallet pair match
        recordWalletPairMatch(room.creator, room.player2);
        
        // Anti-abuse: Update IP activity (both players)
        const creatorIp = walletIpMap.get(room.creator) || getClientIp(req);
        const player2Ip = walletIpMap.get(room.player2) || getClientIp(req);
        updateIpActivity(creatorIp);
        updateIpActivity(player2Ip);
        
        // Update leaderboard stats
        if (!rpsLeaderboard.has(room.creator)) {
          rpsLeaderboard.set(room.creator, { wins: 0, losses: 0, totalWon: 0, totalSolWon: 0 });
        }
        if (!rpsLeaderboard.has(room.player2)) {
          rpsLeaderboard.set(room.player2, { wins: 0, losses: 0, totalWon: 0, totalSolWon: 0 });
        }
        
        const creatorStats = rpsLeaderboard.get(room.creator);
        const player2Stats = rpsLeaderboard.get(room.player2);
        
        if (winner === "draw") {
          // Draw - return bets (no winner, no loser)
          // No leaderboard update needed for draws
        } else if (winner === room.creator) {
          creatorStats.wins++;
          creatorStats.totalWon += room.betAmount * 2; // Win both bets
          creatorStats.totalSolWon += totalPot;
          player2Stats.losses++;
        } else {
          player2Stats.wins++;
          player2Stats.totalWon += room.betAmount * 2;
          player2Stats.totalSolWon += totalPot;
          creatorStats.losses++;
        }
        
        // Save match history for both players
        try {
          // For creator
          const creatorResult = winner === "draw" ? "draw" : (winner === room.creator ? "win" : "lose");
          const creatorPrize = winner === room.creator ? totalPot : 0;
          await saveMatchHistory(
            room.creator,
            room.player2,
            "Betting",
            p1Choice,
            p2Choice,
            creatorResult,
            winner === "draw" ? null : winner,
            room.betAmount,
            creatorPrize
          );
          
          // For player2
          const player2Result = winner === "draw" ? "draw" : (winner === room.player2 ? "win" : "lose");
          const player2Prize = winner === room.player2 ? totalPot : 0;
          await saveMatchHistory(
            room.player2,
            room.creator,
            "Betting",
            p2Choice,
            p1Choice,
            player2Result,
            winner === "draw" ? null : winner,
            room.betAmount,
            player2Prize
          );
        } catch (historyErr) {
          log.error("[rps-betting] Failed to save match history:", historyErr);
          // Don't fail the match if history save fails
        }
        
        // Broadcast result
        const result = {
          type: "rps_betting_match_result",
          roomId: roomId,
          player1Wallet: room.creator,
          player2Wallet: room.player2,
          player1Choice: p1Choice,
          player2Choice: p2Choice,
          winner: winner,
          betAmount: room.betAmount,
          betAmountInSol: betAmountInSol,
          totalPotInSol: totalPot,
        };
        
        broadcast(result);
        
        // Remove room after result
        setTimeout(() => {
          rpsBettingRooms.delete(roomId);
          log.info(`[rps-betting] Room ${roomId} removed after match`);
        }, 10000); // Keep room for 10 seconds to allow clients to see result
        
        log.info(`[rps-betting] Match result in room ${roomId}: ${p1Choice} vs ${p2Choice}, winner: ${winner}`);
        
        return res.json({
          ok: true,
          result: result,
          message: "Choice submitted, match result determined",
        });
      }
      
      return res.json({
        ok: true,
        message: "Choice submitted, waiting for opponent",
      });
    } catch (e) {
      log.error("[rps-betting] Submit choice error:", e);
      res.status(500).json({
        ok: false,
        error: e.message,
        message: "Failed to submit choice",
      });
    }
  });
}









