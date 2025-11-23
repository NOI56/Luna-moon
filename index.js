// index.js
// Luna v10 - Streamer Core + Emotion Engine + Sleepy Lock + Talk-React + Breathing

import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { Connection, PublicKey } from "@solana/web3.js";

import { callModel, callSimpleModel, isComplexQuestion } from "./modules/ai.js";
import { initDB, logChat } from "./modules/db.js";
import { getUserMemory, updateUserMemory } from "./modules/memory.js";
import { shouldRespondHeuristic, classifyEmotion, calculateEmotionIntensity, classifyMixedEmotions, classifyEmotionContext } from "./modules/classifier.js";
import { startSolanaWatcher } from "./modules/solana.js";
import { startPumpFunWatcher } from "./modules/pumpfun.js";

import {
  startVTS,
  startIdleLoop,
  startTalkReact,
  startBreathingLoop,
  setBreathingMode,
  triggerForBigBuy,
  triggerForSoftEmotion,
  triggerForPassionEmotion,
  triggerForEmotion,
  clearExpressions,
  setFaceAngle,
  triggerEmotion,
  vtsStatus,
  getVTSParameters,
} from "./modules/vts.js";

import { generateTTS, speak, ambientMurmur } from "./modules/tts.js";

// TTS enabled check
const TTS_ENABLED = process.env.TTS_ENABLED !== "false";
import { decayPersonality } from "./modules/personality.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ----------------------
// Configuration Validation
// ----------------------

function validateConfig() {
  const errors = [];
  const warnings = [];

  // Required for basic functionality
  if (!process.env.OPENAI_KEY && !process.env.OPENROUTER_KEY) {
    errors.push("Missing AI API key: OPENAI_KEY or OPENROUTER_KEY required");
  }

  // VTS configuration
  if (process.env.VTS_ENABLED === "true") {
    if (!process.env.VTS_AUTH_TOKEN) {
      warnings.push("VTS_ENABLED=true but VTS_AUTH_TOKEN is missing. Run 'node vts-auth.cjs' to get token.");
    }
  }

  // TTS configuration
  if (process.env.TTS_ENABLED !== "false") {
    if (!process.env.ELEVEN_KEY) {
      warnings.push("TTS enabled but ELEVEN_KEY is missing. TTS will not work.");
    }
  }

  // Log errors and warnings
  if (errors.length > 0) {
    console.error("[config] ❌ Configuration errors:");
    errors.forEach(err => console.error(`  - ${err}`));
    console.error("[config] Please fix these errors before starting the server.");
    process.exit(1);
  }

  if (warnings.length > 0) {
    console.warn("[config] ⚠️  Configuration warnings:");
    warnings.forEach(warn => console.warn(`  - ${warn}`));
  } else {
    console.log("[config] ✅ Configuration validated");
  }
}

validateConfig();

// ----------------------
// Express + WebSocket
// ----------------------

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 8787;

// ----------------------
// CORS Configuration
// ----------------------
app.use((req, res, next) => {
  const allowedOrigins = process.env.CORS_ORIGINS 
    ? process.env.CORS_ORIGINS.split(",").map(o => o.trim())
    : ["*"]; // Default: allow all
  
  const origin = req.headers.origin;
  if (allowedOrigins.includes("*") || (origin && allowedOrigins.includes(origin))) {
    res.header("Access-Control-Allow-Origin", origin || "*");
  }
  
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, x-purchase-secret");
  res.header("Access-Control-Allow-Credentials", "true");
  
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json({ limit: "2mb" }));

// RPS Routes (must be before static files to avoid 404)
// PvP Matching Queue
const rpsMatchQueue = new Map(); // Map<wallet, { timestamp, choice, matchedWith }>
const rpsActiveMatches = new Map(); // Map<matchId, { player1, player2, choices, timestamp, isBot }>
const MATCH_TIMEOUT = 15000; // 15 seconds (15,000ms)

// Betting Rooms
const rpsBettingRooms = new Map(); // Map<roomId, { creator, betAmount, player2, choices, timestamp }>
const RPS_BETTING_ROOM_TIMEOUT = 300000; // 5 minutes (300,000ms) - rooms expire after 5 minutes

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

      return res.json({
        ok: true,
        matched: true,
        matchId: matchId,
        opponent: matchedPlayer,
        message: "Match found!",
      });
    }

    // No match found, wait for timeout
    console.log(`[rps] Player ${wallet} added to queue, waiting ${MATCH_TIMEOUT}ms for opponent...`);
    setTimeout(() => {
      console.log(`[rps] Timeout reached for ${wallet}, checking if still in queue...`);
      if (rpsMatchQueue.has(wallet)) {
        const queueData = rpsMatchQueue.get(wallet);
        console.log(`[rps] Queue data for ${wallet}:`, queueData);
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
          console.log(`[rps] ✅ Bot match created: ${matchId} for wallet ${wallet}`);
          console.log(`[rps] Active WebSocket clients: ${clients.size}`);
          const broadcastMsg = {
            type: "rps_match_found",
            matchId: matchId,
            player1: wallet,
            player2: botWallet,
            isBot: true,
          };
          broadcast(broadcastMsg);
          console.log(`[rps] ✅ Bot match broadcasted:`, JSON.stringify(broadcastMsg));
        } else {
          console.log(`[rps] ⚠️ Player ${wallet} already matched with ${queueData.matchedWith}`);
        }
      } else {
        console.log(`[rps] ⚠️ Player ${wallet} not found in queue (may have been matched or removed)`);
      }
    }, MATCH_TIMEOUT);

    return res.json({
      ok: true,
      inQueue: true,
      message: "Waiting for opponent...",
      timeout: MATCH_TIMEOUT,
    });
  } catch (e) {
    console.error("[rps] Queue error:", e);
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

    console.log(`[rps] Checking match for wallet: ${wallet}`);
    console.log(`[rps] Active matches: ${rpsActiveMatches.size}, Queue: ${rpsMatchQueue.size}`);

    // Check if wallet has an active match
    for (const [matchId, match] of rpsActiveMatches.entries()) {
      if (match.player1 === wallet || match.player2 === wallet) {
        console.log(`[rps] ✅ Found active match: ${matchId} for wallet ${wallet}`);
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
      console.log(`[rps] Wallet ${wallet} still in queue (${queueTime}ms)`);
      return res.json({
        ok: true,
        hasMatch: false,
        inQueue: true,
        queueTime: queueTime,
      });
    }

    console.log(`[rps] ⚠️ Wallet ${wallet} not found in queue or active matches`);
    return res.json({
      ok: true,
      hasMatch: false,
      inQueue: false,
    });
  } catch (e) {
    console.error("[rps] Match check error:", e);
    res.status(500).json({
      ok: false,
      error: e.message,
      message: "Failed to check match",
    });
  }
});

/**
 * Create a betting room
 * POST /luna/rps/betting/create
 */
app.post("/luna/rps/betting/create", async (req, res) => {
  try {
    const { wallet, betAmount } = req.body || {};
    
    if (!wallet || typeof wallet !== "string") {
      return res.status(400).json({
        ok: false,
        error: "Invalid request",
        message: "Wallet address is required",
      });
    }
    
    if (!betAmount || typeof betAmount !== "number" || betAmount < 1) {
      return res.status(400).json({
        ok: false,
        error: "Invalid request",
        message: "Bet amount must be at least 1 Luna",
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
    
    const roomId = `betting_${wallet}_${Date.now()}`;
    rpsBettingRooms.set(roomId, {
      creator: wallet,
      betAmount: betAmount,
      player2: null,
      choices: {},
      timestamp: Date.now(),
    });
    
    // Auto-cleanup after timeout
    setTimeout(() => {
      if (rpsBettingRooms.has(roomId)) {
        const room = rpsBettingRooms.get(roomId);
        if (!room.player2) {
          rpsBettingRooms.delete(roomId);
          console.log(`[rps-betting] Room ${roomId} expired (no challenger)`);
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
    
    console.log(`[rps-betting] Room created: ${roomId} by ${wallet} with bet ${betAmount}`);
    
    return res.json({
      ok: true,
      roomId: roomId,
      message: "Room created successfully",
    });
  } catch (e) {
    console.error("[rps-betting] Create room error:", e);
    res.status(500).json({
      ok: false,
      error: e.message,
      message: "Failed to create room",
    });
  }
});

/**
 * Cancel a betting room
 * POST /luna/rps/betting/cancel
 */
app.post("/luna/rps/betting/cancel", async (req, res) => {
  try {
    console.log(`[rps-betting] Cancel room request received:`, req.body);
    const { wallet, roomId } = req.body || {};
    
    if (!wallet || typeof wallet !== "string") {
      console.log(`[rps-betting] Cancel room - invalid wallet:`, wallet);
      return res.status(400).json({
        ok: false,
        error: "Invalid request",
        message: "Wallet address is required",
      });
    }
    
    if (!roomId || typeof roomId !== "string") {
      console.log(`[rps-betting] Cancel room - invalid roomId:`, roomId);
      return res.status(400).json({
        ok: false,
        error: "Invalid request",
        message: "Room ID is required",
      });
    }
    
    const room = rpsBettingRooms.get(roomId);
    
    if (!room) {
      console.log(`[rps-betting] Cancel room - room not found:`, roomId);
      return res.status(404).json({
        ok: false,
        error: "Room not found",
        message: "This room no longer exists",
      });
    }
    
    // Check if user is the creator or player2
    if (room.creator !== wallet && room.player2 !== wallet) {
      console.log(`[rps-betting] Cancel room - not authorized:`, { wallet, creator: room.creator, player2: room.player2 });
      return res.status(403).json({
        ok: false,
        error: "Not authorized",
        message: "You are not a player in this room",
      });
    }
    
    // Only allow cancellation if game hasn't started (no choices submitted)
    if (room.choices && (room.choices.player1 || room.choices.player2)) {
      console.log(`[rps-betting] Cancel room - game in progress:`, room.choices);
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
    
    console.log(`[rps-betting] Room ${roomId} cancelled by ${wallet}`);
    
    return res.json({
      ok: true,
      message: "Room cancelled successfully",
    });
  } catch (e) {
    console.error("[rps-betting] Cancel room error:", e);
    res.status(500).json({
      ok: false,
      error: e.message,
      message: "Failed to cancel room",
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
    console.error("[rps-betting] Get rooms error:", e);
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
    
    if (!wallet || typeof wallet !== "string") {
      return res.status(400).json({
        ok: false,
        error: "Invalid request",
        message: "Wallet address is required",
      });
    }
    
    if (!roomId || typeof roomId !== "string") {
      return res.status(400).json({
        ok: false,
        error: "Invalid request",
        message: "Room ID is required",
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
    
    // Add player2
    room.player2 = wallet;
    room.choices = {};
    
    // Broadcast room joined
    broadcast({
      type: "rps_betting_room_joined",
      roomId: roomId,
      creator: room.creator,
      opponent: wallet,
      betAmount: room.betAmount,
    });
    
    console.log(`[rps-betting] Room ${roomId} joined by ${wallet}`);
    
    return res.json({
      ok: true,
      roomId: roomId,
      creator: room.creator,
      betAmount: room.betAmount,
      message: "Joined room successfully",
    });
  } catch (e) {
    console.error("[rps-betting] Join room error:", e);
    res.status(500).json({
      ok: false,
      error: e.message,
      message: "Failed to join room",
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
    
    if (!wallet || typeof wallet !== "string") {
      return res.status(400).json({
        ok: false,
        error: "Invalid request",
        message: "Wallet address is required",
      });
    }
    
    if (!roomId || typeof roomId !== "string") {
      return res.status(400).json({
        ok: false,
        error: "Invalid request",
        message: "Room ID is required",
      });
    }
    
    if (!choice || !["rock", "paper", "scissors"].includes(choice)) {
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
      room.choices.player1 = choice;
    } else {
      room.choices.player2 = choice;
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
      };
      
      broadcast(result);
      
      // Remove room after result
      setTimeout(() => {
        rpsBettingRooms.delete(roomId);
        console.log(`[rps-betting] Room ${roomId} removed after match`);
      }, 10000); // Keep room for 10 seconds to allow clients to see result
      
      console.log(`[rps-betting] Match result in room ${roomId}: ${p1Choice} vs ${p2Choice}, winner: ${winner}`);
      
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
    console.error("[rps-betting] Submit choice error:", e);
    res.status(500).json({
      ok: false,
      error: e.message,
      message: "Failed to submit choice",
    });
  }
});

// Serve RPS HTML files directly (for convenience)
app.get("/rps_game.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "rps_game.html"));
});

app.get("/rps_vs_luna.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "rps_vs_luna.html"));
});

app.get("/rps_betting.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "rps_betting.html"));
});

app.use("/public", express.static(path.join(__dirname, "public")));

const clients = new Set();
const clientReconnectAttempts = new Map(); // Track reconnect attempts per client

wss.on("connection", (ws, req) => {
  clients.add(ws);
  const clientId = req.headers["sec-websocket-key"] || `${Date.now()}-${Math.random()}`;
  clientReconnectAttempts.set(ws, 0);
  
  // Send welcome message
  try {
    ws.send(JSON.stringify({
      type: "connected",
      message: "Connected to Luna AI WebSocket",
      timestamp: Date.now()
    }));
  } catch (e) {
    // ignore
  }
  
  ws.on("close", (code, reason) => {
    clients.delete(ws);
    clientReconnectAttempts.delete(ws);
    console.log(`[ws] Client disconnected: code=${code}, reason=${reason?.toString() || "none"}`);
  });
  
  ws.on("error", (error) => {
    console.warn(`[ws] Client error:`, error.message);
    clients.delete(ws);
    clientReconnectAttempts.delete(ws);
  });
  
  // Heartbeat: ping every 30 seconds to keep connection alive
  const pingInterval = setInterval(() => {
    if (ws.readyState === ws.OPEN) {
      try {
        ws.ping();
      } catch (e) {
        clearInterval(pingInterval);
        clients.delete(ws);
        clientReconnectAttempts.delete(ws);
      }
    } else {
      clearInterval(pingInterval);
      clients.delete(ws);
      clientReconnectAttempts.delete(ws);
    }
  }, 30000);
  
  ws.on("close", () => {
    clearInterval(pingInterval);
  });
  
  console.log(`[ws] Client connected (total: ${clients.size})`);
});

function broadcast(obj) {
  const msg = JSON.stringify(obj);
  const deadClients = [];
  let sentCount = 0;
  
  for (const ws of clients) {
    try {
      if (ws.readyState === ws.OPEN) {
        ws.send(msg);
        sentCount++;
      } else {
        // Mark for removal if connection is not open
        deadClients.push(ws);
      }
    } catch (e) {
      // Connection is dead, mark for removal
      console.error(`[ws] Error sending message:`, e.message);
      deadClients.push(ws);
    }
  }
  
  // Clean up dead connections
  deadClients.forEach(ws => {
    clients.delete(ws);
    clientReconnectAttempts.delete(ws);
  });
  
  if (deadClients.length > 0) {
    console.log(`[ws] Cleaned up ${deadClients.length} dead connection(s)`);
  }
  
  if (obj.type === "rps_match_found") {
    console.log(`[ws] Broadcasted ${obj.type} to ${sentCount} client(s) (total clients: ${clients.size})`);
  }
}

// ----------------------
// Helper: ภาษา / เวลา / อารมณ์
// ----------------------

// ฟังเฉพาะภาษาอังกฤษเท่านั้น
function isEnglishOnly(text) {
  if (!text) return false;
  const s = text.toString();
  const hasLatin = /[a-zA-Z]/.test(s);
  if (!hasLatin) return false;

  // ถ้ามีตัวอักษรไทย ให้ตัดทิ้งเลย
  const hasThai = /[\u0E00-\u0E7F]/.test(s);
  if (hasThai) return false;

  return true;
}

// เวลาโซนอเมริกา (New York)
function getAmericaHour() {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: "America/New_York",
    });
    const hourStr = formatter.format(now);
    const hour = parseInt(hourStr, 10);
    return Number.isNaN(hour) ? 0 : hour;
  } catch {
    return 0;
  }
}

// เพิ่ม natural speech patterns (filler words, self-correction, repetition, stutter)
// isComplex: true = คำถามยาก (เพิ่มโอกาส), false = คำถามง่าย (ลดโอกาส)
function addNaturalSpeechPatterns(text, isComplex = false) {
  if (!text || text.length < 20) return text; // Too short, skip
  
  // ปรับโอกาสตามความยากของคำถาม
  // คำถามง่าย → ลดโอกาส, คำถามยาก → เพิ่มโอกาส
  const fillerChance = isComplex ? 0.15 : 0.08; // 15% vs 8%
  const selfCorrectionChance = isComplex ? 0.12 : 0.05; // 12% vs 5%
  const middleFillerChance = isComplex ? 0.08 : 0.03; // 8% vs 3%
  const repetitionChance = isComplex ? 0.15 : 0.04; // 15% vs 4%
  const stutterChance = isComplex ? 0.08 : 0.02; // 8% vs 2%
  
  // 10-15% chance to add filler words at the start (ปรับตามความยาก)
  if (Math.random() < fillerChance) {
    const fillers = ["Um", "Uh", "Well", "Hmm", "Like"];
    const filler = fillers[Math.floor(Math.random() * fillers.length)];
    text = `${filler}, ${text.toLowerCase()}`;
  }
  
  // 5-10% chance to add self-correction (ปรับตามความยาก)
  if (Math.random() < selfCorrectionChance) {
    const corrections = [
      "Wait, actually",
      "Hmm, let me think",
      "Actually, you know what",
      "Hmm, on second thought",
    ];
    const correction = corrections[Math.floor(Math.random() * corrections.length)];
    // Insert after first sentence or at start if no sentence break
    const firstSentenceEnd = text.match(/[.!?]/);
    if (firstSentenceEnd) {
      text = text.substring(0, firstSentenceEnd.index + 1) + ` ${correction.toLowerCase()}... ` + text.substring(firstSentenceEnd.index + 1);
    } else {
      text = `${correction}... ${text.toLowerCase()}`;
    }
  }
  
  // Occasionally add "you know" or "like" in the middle (ปรับตามความยาก)
  if (Math.random() < middleFillerChance && text.length > 30) {
    const words = text.split(" ");
    if (words.length > 3) {
      const insertPos = Math.floor(words.length / 2);
      const filler = Math.random() < 0.5 ? "like" : "you know";
      words.splice(insertPos, 0, filler);
      text = words.join(" ");
    }
  }
  
  // 5-10% chance to add repetition (speaking while thinking or excited) (ปรับตามความยาก)
  if (Math.random() < repetitionChance && text.length > 30) {
    const words = text.split(" ");
    if (words.length > 3) {
      // Find a word to repeat (usually at the start or after a comma)
      const repeatIndex = Math.random() < 0.5 ? 0 : Math.min(3, words.length - 1);
      const wordToRepeat = words[repeatIndex];
      // Only repeat if it's not too short and not punctuation
      if (wordToRepeat.length > 2 && !/[.!?,]/.test(wordToRepeat)) {
        words.splice(repeatIndex, 0, wordToRepeat + "...");
        text = words.join(" ");
      }
    }
  }
  
  // 3-5% chance to add stutter (when excited or thinking) (ปรับตามความยาก)
  if (Math.random() < stutterChance && text.length > 20) {
    const words = text.split(" ");
    if (words.length > 2) {
      // Find a word that starts with a consonant to stutter
      const stutterIndex = Math.floor(Math.random() * Math.min(3, words.length));
      const wordToStutter = words[stutterIndex];
      // Only stutter if it starts with a consonant and is not too short
      if (wordToStutter.length > 2 && /^[bcdfghjklmnpqrstvwxyz]/i.test(wordToStutter)) {
        const firstLetter = wordToStutter[0];
        words[stutterIndex] = `${firstLetter}-${wordToStutter}`;
        text = words.join(" ");
      }
    }
  }
  
  return text;
}

// แต่งประโยคตอบตามอารมณ์
// Helper function: คำนวณความคล้ายคลึงกันระหว่างข้อความ (0-1)
function calculateSimilarity(str1, str2) {
  if (!str1 || !str2) return 0;
  const longer = str1.length > str2.length ? str1 : str2;
  const shorter = str1.length > str2.length ? str2 : str1;
  if (longer.length === 0) return 1.0;
  const distance = levenshteinDistance(longer, shorter);
  return (longer.length - distance) / longer.length;
}

// Helper function: Levenshtein distance
function levenshteinDistance(str1, str2) {
  const matrix = [];
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[str2.length][str1.length];
}

function decorateReplyForEmotion(userText, baseReply, emotion, isComplex = false) {
  let reply = baseReply || "";

  // Add natural speech patterns (before emotion decoration)
  // ส่ง isComplex เพื่อปรับโอกาสตามความยากของคำถาม
  reply = addNaturalSpeechPatterns(reply, isComplex);

  if (!emotion || emotion === "neutral") return reply;

  if (emotion === "angry") {
    const prefixOptions = [
      "Hey, that’s kinda rude, you know? ",
      "Oi, don’t be mean like that… ",
      "H-hey, that wasn’t very nice… ",
    ];
    const prefix = prefixOptions[Math.floor(Math.random() * prefixOptions.length)];
    return prefix + reply;
  }

  if (emotion === "sad") {
    const prefixOptions = [
      "I’m really sorry you feel that way… ",
      "Hey, it’s okay to feel sad sometimes… ",
      "You’re not alone, okay? ",
    ];
    const prefix = prefixOptions[Math.floor(Math.random() * prefixOptions.length)];
    return prefix + reply;
  }

  if (emotion === "sleepy") {
    const prefixOptions = [
      "Mmm… I feel sleepy too~ ",
      "Hehe, maybe we both need some rest~ ",
      "Yaaawn… staying up late together, huh~ ",
    ];
    const prefix = prefixOptions[Math.floor(Math.random() * prefixOptions.length)];
    return prefix + reply;
  }

  if (emotion === "hype") {
    const prefixOptions = [
      "LET’S GOOO~!! ",
      "I’m so hyped with you right now!! ",
      "Waaah~ this energy is crazy!! ",
    ];
    const prefix = prefixOptions[Math.floor(Math.random() * prefixOptions.length)];
    return prefix + reply;
  }

  if (emotion === "soft") {
    const prefixOptions = [
      "E-eh… you’re making me blush… ",
      "Aww, you’re really sweet, you know~ ",
      "Hehe… I’m happy you feel that way~ ",
    ];
    const prefix = prefixOptions[Math.floor(Math.random() * prefixOptions.length)];
    return prefix + reply;
  }

  return reply;
}

// ประเมินเวลาพูด (ms) จากความยาวประโยค + โหมดเสียง (ใช้ทั้ง Talk-React + Auto-reset emotion)
// ปรับให้พูดช้าลงเหมือนคน (120-140 wpm แทน 160-190 wpm)
function estimateSpeechDurationMs(text, voiceMode) {
  const t = (text || "").toString().trim();
  if (!t) return 1200;

  const words = t.split(/\s+/).filter(Boolean).length || 1;

  let wpm;
  if (voiceMode === "reading") wpm = 90;   // อ่านเม้น - พูดช้ามาก (90 wpm)
  else if (voiceMode === "reading_quiet") wpm = 85;   // อ่านเม้นแบบเบา - พูดช้ากว่า (85 wpm)
  else if (voiceMode === "soft") wpm = 110;      // ลดจาก 130 เป็น 110 (พูดช้าลง)
  else if (voiceMode === "passion") wpm = 140;  // ลดจาก 190 เป็น 140 (พูดช้าลงมาก)
  else wpm = 125;                           // ลดจาก 160 เป็น 125 (พูดช้าลงเหมือนคน)

  const minutes = words / wpm;
  let ms = minutes * 60 * 1000;

  if (ms < 800) ms = 800;
  if (ms > 10000) ms = 10000;
  return ms;
}

let lastChatTs = Date.now();
let lastSpeechEndTime = 0; // Track เมื่อ Luna พูดเสร็จ (เพื่อป้องกัน idle แซก)
let sleepyMode = false;   // โหมดง่วงล็อกหน้า (ตามเวลา US)
let forceAwake = false;   // บังคับตื่น (override เวลา US)
let latestAudioLevel = 0; // 0..1

// ----------------------
// Energy & Physical State Tracking
// ----------------------
let lunaEnergy = 1.0; // 1.0 = สดใส, 0.0 = เหนื่อยมาก
let totalSpeechTime = 0; // ระยะเวลาที่พูดทั้งหมด (ms)
let lastBlinkTime = Date.now(); // เวลาที่กระพริบตาครั้งล่าสุด
let lastStretchTime = Date.now(); // เวลาที่ยืดตัวครั้งล่าสุด (ถ้าทำได้)
let consecutiveMessages = 0; // จำนวนข้อความต่อเนื่อง (เพื่อคำนวณพลังงาน)

// ----------------------
// Rate Limiting
// ----------------------
const RATE_LIMIT_MAX_REQUESTS = parseInt(process.env.RATE_LIMIT_MAX || "30", 10);
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute

// Track requests per user: Map<username, { count: number, resetAt: number }>
const rateLimitTracker = new Map();

function checkRateLimit(username) {
  const now = Date.now();
  const userLimit = rateLimitTracker.get(username);

  if (!userLimit || now >= userLimit.resetAt) {
    // Reset or initialize
    rateLimitTracker.set(username, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS,
    });
    return { allowed: true, resetAt: now + RATE_LIMIT_WINDOW_MS };
  }

  // Increment count
  userLimit.count++;

  if (userLimit.count > RATE_LIMIT_MAX_REQUESTS) {
    return { allowed: false, resetAt: userLimit.resetAt };
  }

  return { allowed: true, resetAt: userLimit.resetAt };
}

// Cleanup old entries periodically (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [username, limit] of rateLimitTracker.entries()) {
    if (now >= limit.resetAt) {
      rateLimitTracker.delete(username);
    }
  }
}, 5 * 60 * 1000);

// ----------------------
// Emotional Continuity Tracking
// ----------------------
let currentEmotion = "neutral";
let emotionStartTime = Date.now();
let emotionIntensity = 0.5; // 0.0 = อ่อน, 1.0 = แรง
const EMOTION_DURATION = 30 * 1000; // อารมณ์คงอยู่ 30 วินาที

// Emotion Decay: ลด intensity ตามเวลา (ทุก 10 วินาที)
let lastEmotionDecayTime = Date.now();
const EMOTION_DECAY_INTERVAL = 10 * 1000; // 10 วินาที
const EMOTION_DECAY_RATE = 0.1; // ลด 0.1 ต่อครั้ง

// ----------------------
// Social Awareness Tracking
// ----------------------
const activeUsers = new Set(); // ผู้ใช้ที่แชตใน session นี้
const userFirstSeen = new Map(); // จำเวลาที่เห็นผู้ใช้ครั้งแรก
let viewerCount = 0; // จำนวนผู้ชม (ถ้ามี)

// ----------------------
// Personal Habits & Quirks
// ----------------------
const catchphrases = [
  "Ehehe~",
  "Hehe~",
  "Aww~",
  "Mmm~",
  "Hmm~",
  "Oh~",
];
let lastCatchphraseTime = Date.now();
const CATCHPHRASE_INTERVAL = 5 * 60 * 1000; // ใช้ catchphrase ทุก 5 นาที

// ----------------------
// Conversation Flow Tracking
// ----------------------
let currentTopic = null; // หัวข้อปัจจุบัน
let topicStartTime = Date.now();
const TOPIC_DURATION = 10 * 60 * 1000; // เปลี่ยนหัวข้อทุก 10 นาที
let insideJokes = new Map(); // inside jokes กับผู้ใช้แต่ละคน

// ----------------------
// Negative Emotions Tracking (Annoyed/Bored)
// ----------------------
const recentMessages = []; // เก็บข้อความล่าสุด (เพื่อตรวจสอบข้อความซ้ำ)
const userMessageHistory = new Map(); // เก็บประวัติข้อความของผู้ใช้แต่ละคน
let boredCounter = 0; // นับจำนวนข้อความที่น่าเบื่อ
const BORED_THRESHOLD = 5; // ถ้ามีข้อความน่าเบื่อ 5 ข้อความ → เบื่อ

// ----------------------
// Chat Reading Queue (สำหรับอ่านเม้น)
// ----------------------
const chatReadingQueue = []; // เก็บข้อความที่รออ่าน (FIFO)
const MAX_QUEUE_SIZE = 10; // เก็บแค่ 10 ข้อความล่าสุด
const MAX_READ_LENGTH = 150; // ถ้าข้อความยาวเกิน 150 ตัวอักษร → พิมพ์แทนอ่าน
let isReadingChat = false; // Flag ว่ากำลังอ่านอยู่หรือไม่
let lastReadMessageIndex = -1; // Index ของข้อความที่อ่านล่าสุด

// ----------------------
// Statistics Tracking
// ----------------------
const stats = {
  messages: {
    total: 0,
    byUser: new Map(), // username -> count
    byEmotion: new Map(), // emotion -> count
    byModel: { simple: 0, complex: 0 },
  },
  performance: {
    avgResponseTime: 0,
    totalResponseTime: 0,
    responseCount: 0,
    errors: 0,
    cacheHits: 0,
    cacheMisses: 0,
  },
  system: {
    startTime: Date.now(),
    uptime: () => Date.now() - stats.system.startTime,
  },
};

// ----------------------
// Response Caching
// ----------------------
const responseCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCacheKey(text) {
  return text.toLowerCase().trim().substring(0, 100); // First 100 chars
}

function getCachedResponse(key) {
  const cached = responseCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    stats.performance.cacheHits++;
    return cached.response;
  }
  if (cached) {
    responseCache.delete(key); // Expired
  }
  stats.performance.cacheMisses++;
  return null;
}

function setCachedResponse(key, response) {
  responseCache.set(key, {
    response,
    timestamp: Date.now(),
  });
  // Cleanup old entries (keep max 1000 entries)
  if (responseCache.size > 1000) {
    const oldestKey = responseCache.keys().next().value;
    responseCache.delete(oldestKey);
  }
}

// ----------------------
// Error Tracking
// ----------------------
const errorLog = [];
const MAX_ERROR_LOG = 100;

function logError(error, context = {}) {
  const errorEntry = {
    timestamp: Date.now(),
    message: error.message || String(error),
    stack: error.stack,
    context,
  };
  errorLog.push(errorEntry);
  stats.performance.errors++;
  
  // Keep only last 100 errors
  if (errorLog.length > MAX_ERROR_LOG) {
    errorLog.shift();
  }
  
  // Log to console
  console.error(`[error] ${errorEntry.message}`, context);
}

// ----------------------
// health + overlay
// ----------------------

app.get("/_health", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

app.get("/overlay", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "overlay.html"));
});

// Luna Character (for OBS Browser Source)
app.get("/luna-character", (req, res) => {
  // Use VTS version if VTS is enabled, otherwise use web version
  const useVTS = process.env.VTS_ENABLED === "true";
  const filename = useVTS ? "luna_character_vts.html" : "luna_character.html";
  res.sendFile(path.join(__dirname, "public", filename));
});

// Rock Paper Scissors Game - PvP Mode
app.get("/rps_game.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "rps_game.html"));
});

// Rock Paper Scissors Game - VS Luna Mode
app.get("/rps_vs_luna.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "rps_vs_luna.html"));
});

// Rock Paper Scissors Overlay (for OBS Browser Source)
app.get("/rps_overlay.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "rps_overlay.html"));
});

// Serve Live2D models (CORS headers for Live2D)
app.use("/models", express.static(path.join(__dirname, "public", "models"), {
  setHeaders: (res, filePath) => {
    // Set Content-Type based on file extension
    if (filePath.endsWith('.json') || filePath.endsWith('.model3.json') || 
        filePath.endsWith('.motion3.json') || filePath.endsWith('.exp3.json') ||
        filePath.endsWith('.physics3.json') || filePath.endsWith('.cdi3.json') ||
        filePath.endsWith('.userdata3.json')) {
      res.setHeader('Content-Type', 'application/json');
    } else if (filePath.endsWith('.png')) {
      res.setHeader('Content-Type', 'image/png');
    } else if (filePath.endsWith('.moc3')) {
      res.setHeader('Content-Type', 'application/octet-stream');
    }
    
    // Allow CORS for Live2D (important!)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
}));

// ----------------------
// VTS Health Check
// ----------------------

app.get("/Luna/health/vts", (req, res) => {
  const status = vtsStatus();
  res.json(status);
});

// ----------------------
// Request Validation Middleware
// ----------------------
function validateMessageRequest(req, res, next) {
  const { text, user } = req.body || {};
  
  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return res.status(400).json({
      ok: false,
      error: "Invalid request",
      message: "Ehehe, I didn't quite understand that. Can you say something? 😊",
    });
  }
  
  if (text.length > 1000) {
    return res.status(400).json({
      ok: false,
      error: "Invalid request",
      message: "Whoa, that's a really long message! Can you make it shorter? 😅",
    });
  }
  
  if (user && (typeof user !== "string" || user.length > 100)) {
    return res.status(400).json({
      ok: false,
      error: "Invalid request",
      message: "Hmm, your name seems a bit too long. Can you use a shorter name? 😊",
    });
  }
  
  next();
}

function validatePurchaseRequest(req, res, next) {
  const { buyer, amount, currency } = req.body || {};
  
  if (!buyer || typeof buyer !== "string" || buyer.trim().length === 0) {
    return res.status(400).json({
      ok: false,
      error: "Invalid request",
      message: "Field 'buyer' is required and must be a non-empty string",
    });
  }
  
  if (amount !== undefined && (typeof amount !== "number" || amount < 0)) {
    return res.status(400).json({
      ok: false,
      error: "Invalid request",
      message: "Field 'amount' must be a non-negative number",
    });
  }
  
  if (currency && typeof currency !== "string") {
    return res.status(400).json({
      ok: false,
      error: "Invalid request",
      message: "Field 'currency' must be a string",
    });
  }
  
  next();
}

// ----------------------
// Audio React Endpoint
// ----------------------

app.post("/luna/audio-level", (req, res) => {
  try {
    let { level } = req.body || {};

    // Accept both string and number, then coerce to Number
    level = Number(level);
    if (!Number.isFinite(level)) {
      return res.status(400).json({ ok: false, error: "level must be a number" });
    }

    // Clamp 0..1
    if (level < 0) level = 0;
    if (level > 1) level = 1;
    
    // Physical Reaction: สะดุ้งเมื่อเสียงดัง (ถ้า level > 0.8 และเพิ่มขึ้นมาก)
    const previousLevel = latestAudioLevel;
    const levelIncrease = level - previousLevel;
    if (level > 0.8 && levelIncrease > 0.3 && process.env.VTS_ENABLED === "true") {
      try {
        // สะดุ้ง (ใช้ emotion_small_surprise)
        triggerForEmotion("hype"); // ใช้ hype เป็น temporary reaction
        setTimeout(() => {
          try {
            clearExpressions();
          } catch (e) {
            console.warn("[audio-react] clear failed:", e.message);
          }
        }, 500);
        console.log("[audio-react] 💥 Loud sound detected! Luna startled!");
      } catch (e) {
        console.warn("[audio-react] startle failed:", e.message);
      }
    }
    
    latestAudioLevel = level;

    // Broadcast to HUD clients
    const payload = {
      type: "audio_react",
      level,
      ts: Date.now(),
    };

    console.log("[audio-react] level =", level);
    broadcast(payload);

    return res.json({ ok: true, level });
  } catch (err) {
    console.error("[/luna/audio-level] error:", err);
    return res.status(500).json({ ok: false, error: "internal error" });
  }
});

// ----------------------
// 1) แชตหลักของ Luna
// ----------------------

async function handleLunaMessage(req, res) {
  const startTime = Date.now();
  let responseTime = 0;
  
  // Declare variables outside try block so they're accessible in catch
  let msg = "";
  let name = "guest";
  
  try {
    const { text, user } = req.body || {};
    msg = (text || "").toString();
    name = (user || "guest").toString();
    
    // ----------------------
    // Custom Commands: ตรวจจับคำสั่งพิเศษ
    // ----------------------
    if (msg.startsWith("/luna ")) {
      const command = msg.substring(6).trim().toLowerCase();
      
      // /luna dance
      if (command === "dance" || command === "dance!") {
        if (process.env.VTS_ENABLED === "true") {
          triggerForEmotion("hype");
          setTimeout(() => clearExpressions(), 2000);
        }
        const reply = "Ehehe~ Let me dance for you! 💃✨";
        const ttsId = await generateTTS(reply, "passion");
        broadcast({
          type: "luna_message",
          from: "Luna",
          text: reply,
          ttsUrl: ttsId ? `/public/tts/${ttsId}.mp3` : null,
          voiceMode: "passion",
        });
        return res.json({
          ok: true,
          reply,
          ttsUrl: ttsId ? `/public/tts/${ttsId}.mp3` : null,
          voiceMode: "passion",
          emotion: "hype",
          isCommand: true,
        });
      }
      
      // /luna mood
      if (command === "mood" || command === "emotion") {
        const reply = `I'm feeling ${currentEmotion} right now! ${emotionIntensity > 0.7 ? "It's pretty strong!" : emotionIntensity > 0.4 ? "It's moderate." : "It's pretty mild."} 😊`;
        const ttsId = await generateTTS(reply, "normal");
        broadcast({
          type: "luna_message",
          from: "Luna",
          text: reply,
          ttsUrl: ttsId ? `/public/tts/${ttsId}.mp3` : null,
          voiceMode: "normal",
        });
        return res.json({
          ok: true,
          reply,
          ttsUrl: ttsId ? `/public/tts/${ttsId}.mp3` : null,
          voiceMode: "normal",
          emotion: currentEmotion,
          emotionIntensity: emotionIntensity,
          isCommand: true,
        });
      }
      
      // /luna joke
      if (command === "joke" || command === "funny") {
        const jokes = [
          "Why did the crypto go to therapy? Because it had too many issues! 😂",
          "What do you call a crypto that's always late? A slow-coin! Ehehe~",
          "Why don't cryptos ever get cold? Because they're always in a hot wallet! 🔥",
        ];
        const joke = jokes[Math.floor(Math.random() * jokes.length)];
        const ttsId = await generateTTS(joke, "passion");
        broadcast({
          type: "luna_message",
          from: "Luna",
          text: joke,
          ttsUrl: ttsId ? `/public/tts/${ttsId}.mp3` : null,
          voiceMode: "passion",
        });
        return res.json({
          ok: true,
          reply: joke,
          ttsUrl: ttsId ? `/public/tts/${ttsId}.mp3` : null,
          voiceMode: "passion",
          emotion: "hype",
          isCommand: true,
        });
      }
      
      // /luna help
      if (command === "help" || command === "commands") {
        const helpText = "Available commands: /luna dance, /luna mood, /luna joke, /luna help! Try them out~ 😊";
        return res.json({
          ok: true,
          reply: helpText,
          ttsUrl: null,
          voiceMode: "none",
          isCommand: true,
          commands: ["/luna dance", "/luna mood", "/luna joke", "/luna help"],
        });
      }
      
      // ถ้าไม่ใช่ command ที่รู้จัก → ตอบปกติ (ลบ "/luna " ออก)
      msg = msg.substring(6).trim();
    }
    
    // Update statistics
    stats.messages.total++;
    const userCount = stats.messages.byUser.get(name) || 0;
    stats.messages.byUser.set(name, userCount + 1);
    
    // ----------------------
    // Social Awareness: ตรวจสอบผู้ใช้ใหม่
    // ----------------------
    const isNewUser = !activeUsers.has(name);
    if (isNewUser) {
      activeUsers.add(name);
      userFirstSeen.set(name, Date.now());
      console.log(`[social] 👋 New user detected: ${name}`);
      
      // Physical Reaction: หันไปดูเมื่อมีคนใหม่ (ถ้า VTS enabled)
      if (process.env.VTS_ENABLED === "true" && Math.random() < 0.7) {
        try {
          // หันหน้าเล็กน้อย (ใช้ setFaceAngle)
          const angle = Math.random() < 0.5 ? -15 : 15;
          setFaceAngle(angle, 0, 0);
          broadcast({
            type: 'face_angle',
            x: angle,
            y: 0,
            z: 0,
          });
          setTimeout(() => {
            try {
              setFaceAngle(0, 0, 0); // กลับมาหน้าเดิม
              broadcast({
                type: 'face_angle',
                x: 0,
                y: 0,
                z: 0,
              });
            } catch (e) {
              console.warn("[social] reset face angle failed:", e.message);
            }
          }, 1000);
        } catch (e) {
          console.warn("[social] look at new user failed:", e.message);
        }
      }
    }
    
    // ----------------------
    // Energy System: ลดพลังงานเมื่อพูดนาน
    // ----------------------
    consecutiveMessages++;
    const timeSinceLastChat = Date.now() - lastChatTs;
    
    // พลังงานลดลงเมื่อพูดต่อเนื่อง (ไม่มีพัก)
    if (consecutiveMessages > 5 && timeSinceLastChat < 60 * 1000) {
      lunaEnergy = Math.max(0.3, lunaEnergy - 0.05); // ลดพลังงาน
    } else if (timeSinceLastChat > 5 * 60 * 1000) {
      // พักนาน → พลังงานเพิ่มขึ้น
      lunaEnergy = Math.min(1.0, lunaEnergy + 0.1);
      consecutiveMessages = 0;
    }
    
    // พลังงานลดลงตามเวลาที่พูดทั้งหมด
    if (totalSpeechTime > 10 * 60 * 1000) { // พูดมากกว่า 10 นาที
      lunaEnergy = Math.max(0.4, lunaEnergy - 0.02);
    }
    
    // ----------------------
    // Physical Reaction: กระพริบตา (ทุก 3-5 วินาที)
    // ----------------------
    const timeSinceLastBlink = Date.now() - lastBlinkTime;
    if (timeSinceLastBlink > 3000 && Math.random() < 0.3 && process.env.VTS_ENABLED === "true") {
      try {
        // ใช้ emotion_small_surprise หรือ trigger อะไรก็ได้ที่ทำให้กระพริบตา
        // หรือใช้ setFaceAngle เล็กน้อยแล้วกลับ
        setFaceAngle(0, -5, 0); // เงยหน้าขึ้นเล็กน้อย (เหมือนกระพริบตา)
        broadcast({
          type: 'face_angle',
          x: 0,
          y: -5,
          z: 0,
        });
        setTimeout(() => {
          try {
            setFaceAngle(0, 0, 0);
            broadcast({
              type: 'face_angle',
              x: 0,
              y: 0,
              z: 0,
            });
          } catch (e) {
            console.warn("[physical] blink reset failed:", e.message);
          }
        }, 200);
        lastBlinkTime = Date.now();
        
        // Broadcast blink to character viewer
        broadcast({
          type: "blink",
        });
      } catch (e) {
        console.warn("[physical] blink failed:", e.message);
      }
    }
    
    // ----------------------
    // Rate Limiting
    // ----------------------
    const rateLimit = checkRateLimit(name);
    if (!rateLimit.allowed) {
      console.warn(`[rate-limit] User ${name} exceeded rate limit (${RATE_LIMIT_MAX_REQUESTS} req/min)`);
      return res.status(429).json({
        ok: false,
        error: "Rate limit exceeded",
        message: "Whoa, slow down there! I need a moment to catch up~ 😅",
        resetAt: rateLimit.resetAt,
        retryAfter: Math.ceil((rateLimit.resetAt - Date.now()) / 1000),
      });
    }
    
    lastChatTs = Date.now();

    // ----------------------
    // ระบบอ่านแชท: อ่านเม้นล่าสุดเสมอ + บางครั้งกลับไปอ่านเม้นก่อนหน้า
    // ----------------------
    
    // เพิ่มข้อความใหม่เข้า queue
    const messageEntry = {
      user: name,
      text: msg,
      timestamp: Date.now(),
      index: chatReadingQueue.length,
    };
    chatReadingQueue.push(messageEntry);
    if (chatReadingQueue.length > MAX_QUEUE_SIZE) {
      chatReadingQueue.shift(); // ลบข้อความเก่าที่สุด
      // อัปเดต index ของข้อความทั้งหมด
      chatReadingQueue.forEach((entry, idx) => {
        entry.index = idx;
      });
    }
    lastReadMessageIndex = chatReadingQueue.length - 1; // อัปเดต index ของข้อความล่าสุด
    
    // ตรวจสอบว่าข้อความยาวเกินไปหรือไม่ (ถ้ายาว → พิมพ์แทนอ่าน)
    const shouldTypeInstead = msg.length > MAX_READ_LENGTH;
    
    let shouldSkipNormalResponse = false; // Flag สำหรับกรณีอ่านผิด (ต้องรอให้อ่านคำที่ถูกต้องเสร็จก่อน)
    
    // ถ้าข้อความยาวเกินไป → พิมพ์แทนอ่าน
    if (shouldTypeInstead && TTS_ENABLED) {
      // Broadcast ว่าพิมพ์ข้อความ (ไม่ต้องอ่าน)
      broadcast({
        type: "luna_typing_message",
        from: name,
        text: msg,
        note: "Message too long, typing instead of reading",
      });
      console.log(`[read-chat] Message too long (${msg.length} chars), typing instead of reading`);
    } else if (TTS_ENABLED && !isReadingChat) {
      // อ่านเม้นล่าสุดเสมอ (ถ้ายังไม่กำลังอ่านอยู่)
      isReadingChat = true;
      
      // 30% โอกาสกลับไปอ่านเม้นก่อนหน้า 1 เม้น แล้วกลับมาอ่านล่าสุด
      const shouldReadPrevious = Math.random() < 0.3 && chatReadingQueue.length >= 2;
      
      if (shouldReadPrevious) {
        // อ่านเม้นก่อนหน้า 1 เม้นก่อน
        const previousIndex = chatReadingQueue.length - 2;
        const previousMessage = chatReadingQueue[previousIndex];
        await readChatMessage(previousMessage, false, null, null); // false = ไม่ใช่ข้อความล่าสุด
        
        // รอสักครู่แล้วกลับมาอ่านเม้นล่าสุด
        setTimeout(async () => {
          const latestMessage = chatReadingQueue[chatReadingQueue.length - 1];
          await readChatMessage(latestMessage, true, res, startTime); // true = ข้อความล่าสุด, ส่ง res และ startTime เพื่อตอบคำถาม
          isReadingChat = false;
        }, 2000); // รอ 2 วินาที
      } else {
        // อ่านเม้นล่าสุดเลย
        const latestMessage = chatReadingQueue[chatReadingQueue.length - 1];
        await readChatMessage(latestMessage, true, res, startTime); // ส่ง res และ startTime เพื่อตอบคำถาม
        isReadingChat = false;
      }
    }
    
    // ถ้าข้อความยาวเกินไป → ไม่ต้องอ่าน (พิมพ์แทน) แต่ยังตอบคำถาม
    // ถ้าอ่านผิด → ข้ามการตอบคำถามปกติ (จะตอบหลังจากอ่านคำที่ถูกต้องเสร็จ)
    if (shouldSkipNormalResponse) {
      return; // ออกจาก function แต่ไม่ส่ง response (จะส่งหลังจากอ่านคำที่ถูกต้องเสร็จ)
    }

    // เรียก function ตอบคำถาม (ถ้ายังไม่ได้อ่าน หรืออ่านเสร็จแล้ว)
    await handleLunaMessageResponse(msg, name, res, startTime);
  } catch (e) {
    logError(e, { endpoint: "/luna/message", user: name, message: msg });
    
    // Better Error Messages: ข้อความ error ที่เป็นมิตร
    const errorMessages = {
      "rate limit": "Whoa, slow down there! I need a moment to catch up~ 😅",
      "timeout": "Oops! That took too long. Let me try again~",
      "network": "Hmm, something's wrong with the connection. Can you try again?",
      "api": "Oh no! I'm having trouble connecting right now. Please wait a moment~",
      "validation": "Ehehe, I didn't quite understand that. Can you say it differently?",
      "default": "Oops! Something went wrong. Let me try again~ 😊",
    };
    
    const errorMessage = e.message || "Internal server error";
    let friendlyMessage = errorMessages.default;
    
    // ตรวจสอบประเภท error
    if (errorMessage.toLowerCase().includes("rate limit") || errorMessage.toLowerCase().includes("429")) {
      friendlyMessage = errorMessages["rate limit"];
    } else if (errorMessage.toLowerCase().includes("timeout")) {
      friendlyMessage = errorMessages.timeout;
    } else if (errorMessage.toLowerCase().includes("network") || errorMessage.toLowerCase().includes("connection")) {
      friendlyMessage = errorMessages.network;
    } else if (errorMessage.toLowerCase().includes("api") || errorMessage.toLowerCase().includes("openai") || errorMessage.toLowerCase().includes("claude")) {
      friendlyMessage = errorMessages.api;
    } else if (errorMessage.toLowerCase().includes("validation") || errorMessage.toLowerCase().includes("invalid")) {
      friendlyMessage = errorMessages.validation;
    }
    
    res.status(500).json({ 
      ok: false,
      error: errorMessage,
      message: friendlyMessage,
    });
  }
}

// Function สำหรับอ่านข้อความแชท
async function readChatMessage(messageEntry, isLatest, res = null, startTime = null) {
  if (!messageEntry || !messageEntry.text) return;
  
  const msg = messageEntry.text;
  const name = messageEntry.user;
  
  try {
    // 7% โอกาสอ่านผิด (เฉพาะข้อความล่าสุด)
    const willMisread = isLatest && Math.random() < 0.07;
    let textToRead = msg;
    
    if (willMisread) {
      // สร้างการอ่านผิด (เปลี่ยนคำบางคำ, อ่านผิด, หรือเพิ่มคำ)
      const words = msg.split(/\s+/);
      if (words.length > 1) {
        // สลับคำ 2 คำ หรือเปลี่ยนคำ
        const swapIndex = Math.floor(Math.random() * (words.length - 1));
        const temp = words[swapIndex];
        words[swapIndex] = words[swapIndex + 1];
        words[swapIndex + 1] = temp;
        textToRead = words.join(" ");
      } else {
        // ถ้ามีคำเดียว อาจจะอ่านผิดเสียง
        textToRead = msg.replace(/([aeiou])/gi, (match, vowel) => {
          if (Math.random() < 0.3) {
            const vowels = "aeiou";
            return vowels[Math.floor(Math.random() * vowels.length)];
          }
          return match;
        });
      }
    }
    
    // อ่านเม้น (พูดช้าลง - ใช้ voice_speed ต่ำกว่า)
    // สุ่มว่าจะใช้เสียงเบาหรือเสียงปกติ (50-50) - ใช้เฉพาะตอนอ่านเม้นเท่านั้น
    const useQuietVoice = Math.random() < 0.5; // 50% โอกาสใช้เสียงเบา
    const readVoiceMode = useQuietVoice ? "reading_quiet" : "reading"; // สุ่มเสียงเบาหรือปกติ (เฉพาะอ่านเม้น)
    const readTtsId = await generateTTS(textToRead, readVoiceMode);
    
    if (readTtsId) {
      const readDuration = estimateSpeechDurationMs(textToRead, readVoiceMode);
      lastSpeechEndTime = Date.now() + readDuration + 1000;
      
      // Talk-React สำหรับอ่านเม้น
      try {
        startTalkReact(readDuration, readVoiceMode);
      } catch (e) {
        console.warn("[read-chat] talk-react failed:", e.message);
      }
      
      // Broadcast การอ่านเม้น
      broadcast({
        type: "luna_reading_comment",
        from: name,
        text: textToRead,
        originalText: msg,
        ttsUrl: `/public/tts/${readTtsId}.mp3`,
        voiceMode: readVoiceMode,
        misread: willMisread,
        isPrevious: !isLatest, // บอกว่าเป็นเม้นก่อนหน้าหรือไม่
      });
      
      // ถ้าอ่านผิด → พูดข้อความขำๆ แล้วอ่านต่อ แล้วตอบคำถาม
      if (willMisread && isLatest) {
        const apologyLines = [
          "Oh wait, I read that wrong! Haha~",
          "Oops, I messed that up! Ehehe~",
          "Ah, I read it wrong! Sorry~",
          "Wait, that's not right... Haha, my bad~",
          "Oh no, I misread that! Ehehe, silly me~",
          "Oops, I got that wrong! Hehe~",
        ];
        const apology = apologyLines[Math.floor(Math.random() * apologyLines.length)];
        
        // รอให้อ่านผิดเสร็จก่อน แล้วค่อยพูดข้อความขำๆ
        setTimeout(async () => {
          try {
            // 1. พูดข้อความเมื่ออ่านผิด
            const apologyTtsId = await generateTTS(apology, "soft");
            const apologyDuration = estimateSpeechDurationMs(apology, "soft");
            lastSpeechEndTime = Date.now() + apologyDuration + 1000;
            
            try {
              startTalkReact(apologyDuration, "soft");
            } catch (e) {
              console.warn("[read-chat] apology talk-react failed:", e.message);
            }
            
            broadcast({
              type: "luna_message",
              from: "Luna",
              text: apology,
              ttsUrl: apologyTtsId ? `/public/tts/${apologyTtsId}.mp3` : null,
              voiceMode: "soft",
            });
            
            // 2. หลังจากพูดข้อความเมื่ออ่านผิดเสร็จ → อ่านคำที่ถูกต้อง
            setTimeout(async () => {
              try {
                // สุ่มเสียงเบาหรือปกติสำหรับอ่านคำที่ถูกต้อง (50-50) - ใช้เฉพาะตอนอ่านเม้นเท่านั้น
                const useQuietForCorrect = Math.random() < 0.5;
                const correctReadVoiceMode = useQuietForCorrect ? "reading_quiet" : "reading";
                const correctReadTtsId = await generateTTS(msg, correctReadVoiceMode);
                if (correctReadTtsId) {
                  const correctReadDuration = estimateSpeechDurationMs(msg, correctReadVoiceMode);
                  lastSpeechEndTime = Date.now() + correctReadDuration + 1000;
                  
                  try {
                    startTalkReact(correctReadDuration, correctReadVoiceMode);
                  } catch (e) {
                    console.warn("[read-chat] correct read talk-react failed:", e.message);
                  }
                  
                  broadcast({
                    type: "luna_reading_comment",
                    from: name,
                    text: msg,
                    originalText: msg,
                    ttsUrl: `/public/tts/${correctReadTtsId}.mp3`,
                    voiceMode: correctReadVoiceMode,
                    misread: false,
                    isCorrection: true, // บอกว่าเป็นการอ่านแก้ไข
                  });
                }
              } catch (e) {
                console.warn("[read-chat] correct read failed:", e.message);
              }
            }, apologyDuration + 500);
          } catch (e) {
            console.warn("[read-chat] apology failed:", e.message);
          }
        }, readDuration + 500);
      }
    }
  } catch (e) {
    console.warn("[read-chat] failed to read message:", e.message);
  }
}

// Function สำหรับคิดก่อนตอบ (สุ่มคำคิด เช่น "Um", "Uh", "Hmm")
async function thinkBeforeRespond() {
  // ตรวจสอบว่า TTS เปิดอยู่หรือไม่
  if (!TTS_ENABLED) {
    return null; // ถ้า TTS ปิด → ไม่คิด
  }
  
  // 40% โอกาสคิดก่อนตอบ (ไม่จำเป็นต้องคิดทุกรอบ)
  const shouldThink = Math.random() < 0.4;
  if (!shouldThink) {
    return null; // ไม่คิด
  }
  
  // สุ่มคำคิด
  const thinkingWords = [
    "Um",
    "Uh",
    "Hmm",
    "Well",
    "Let me think",
    "Aaa",
    "Eee",
    "Hmm, let me see",
    "Oh",
    "Ah",
    "Erm",
    "Umm",
    "Hmm, well",
    "Let me think about that",
    "Aaa, well",
  ];
  
  const thinkingWord = thinkingWords[Math.floor(Math.random() * thinkingWords.length)];
  
  try {
    // สุ่มเสียงเบาหรือปกติ (50-50)
    const useQuietVoice = Math.random() < 0.5;
    const voiceMode = useQuietVoice ? "reading_quiet" : "reading";
    
    // สร้าง TTS สำหรับคำคิด
    const thinkingTtsId = await generateTTS(thinkingWord, voiceMode);
    if (thinkingTtsId) {
      const thinkingDuration = estimateSpeechDurationMs(thinkingWord, voiceMode);
      lastSpeechEndTime = Date.now() + thinkingDuration + 1000;
      
      // Talk-React สำหรับคิด
      try {
        startTalkReact(thinkingDuration, voiceMode);
      } catch (e) {
        console.warn("[think] talk-react failed:", e.message);
      }
      
      // Broadcast การคิด
      broadcast({
        type: "luna_thinking",
        text: thinkingWord,
        ttsUrl: `/public/tts/${thinkingTtsId}.mp3`,
        voiceMode: voiceMode,
      });
      
      console.log(`[think] Luna is thinking: "${thinkingWord}"`);
      
      // รอให้คิดเสร็จ
      await new Promise(resolve => setTimeout(resolve, thinkingDuration + 300));
      
      return thinkingDuration;
    }
  } catch (e) {
    console.warn("[think] failed to think:", e.message);
  }
  
  return null;
}

// Function สำหรับตอบคำถาม (แยกออกมาเพื่อเรียกใช้เมื่ออ่านคำที่ถูกต้องเสร็จ)
async function handleLunaMessageResponse(msg, name, res, startTime) {
  let responseTime = 0;
  
  try {
    // ✅ ฟังเฉพาะภาษาอังกฤษ
    if (!isEnglishOnly(msg)) {
      const reply =
        "Sorry, I can only understand English right now. Please type in English for me~ 💬";
      broadcast({
        type: "luna_message",
        from: name,
        text: reply,
        ttsUrl: null,
        voiceMode: "none",
      });
      responseTime = Date.now() - startTime;
      return res.json({
        ok: true,
        reply,
        ttsUrl: null,
        voiceMode: "none",
        emotion: "neutral",
        nonEnglish: true,
      });
    }

    // heuristic ว่าควรตอบไหม
    if (!shouldRespondHeuristic(msg)) {
      responseTime = Date.now() - startTime;
      return res.json({ ok: true, skipped: true });
    }

    // ----------------------
    // คิดก่อนตอบ (สุ่ม 40% โอกาส)
    // ----------------------
    await thinkBeforeRespond();

    // Check cache
    const cacheKey = getCacheKey(msg);
    const cached = getCachedResponse(cacheKey);
    let modelResult;
    let isCached = false;
    
    if (cached) {
      modelResult = cached;
      isCached = true;
      console.log(`[cache] Hit for message: ${msg.substring(0, 50)}...`);
    } else {
      // เดาอารมณ์ด้วย Emotion Engine (rule-based)
      const classifiedEmotion = classifyEmotion(msg); // angry / sad / sleepy / hype / soft / null
      
      // ----------------------
      // Mixed Emotions: ตรวจจับอารมณ์หลายตัวพร้อมกัน
      // ----------------------
      const mixedEmotions = classifyMixedEmotions(msg);
      const primaryEmotion = mixedEmotions.primary || classifiedEmotion;
      const secondaryEmotion = mixedEmotions.secondary;
      
      // ----------------------
      // Context-Aware Emotions: ตรวจจับบริบทของอารมณ์
      // ----------------------
      const emotionContext = classifyEmotionContext(msg); // financial, achievement, loss, health, relationship, work, null

      // ----------------------
      // Social Context Detection: ตรวจจับสถานการณ์สำหรับแสดงความขอบคุณ/ยินดี/เห็นอกเห็นใจ
      // ----------------------
      // ตรวจจับเมื่อผู้ใช้เศร้าหรือมีปัญหา (สำหรับแสดงความเห็นอกเห็นใจ/ห่วงใย)
      const isUserSad = classifiedEmotion === "sad" || 
        /(sad|depressed|lonely|hurt|pain|suffering|struggling|difficult|hard|tough|problem|issue|worry|worried|anxious|stress|stressed)/i.test(msg);
      
      // ตรวจจับเมื่อผู้ใช้มีความสุขหรือประสบความสำเร็จ (สำหรับแสดงความยินดี)
      const isUserHappy = classifiedEmotion === "excited" || classifiedEmotion === "happy" ||
        /(happy|excited|great|awesome|amazing|wonderful|fantastic|success|succeed|won|achieved|accomplished|celebrate|celebration|yay|woo|yes!)/i.test(msg);
      
      // ตรวจจับเมื่อผู้ใช้ทำอะไรให้ (ซื้อ, แชร์, ชม) (สำหรับแสดงความขอบคุณ)
      const userDidSomething = /(bought|purchased|bought|shared|share|support|helped|help|donated|donate|gifted|gift|subscribed|subscribe|followed|follow)/i.test(msg);
      
      // ตรวจจับข่าวดีหรือข่าวร้าย (สำหรับแสดงความประหลาดใจ)
      const hasNews = /(news|happened|happening|just|got|received|found|discovered|told|said)/i.test(msg) && msg.length > 20;

      // ----------------------
      // Negative Emotions Detection: หงุดหงิด/เบื่อ
      // ----------------------
      let isAnnoyed = false;
      let isBored = false;
      
      // ตรวจสอบข้อความซ้ำ (annoyed)
      const userHistory = userMessageHistory.get(name) || [];
      const isRepeatedMessage = userHistory.length > 0 && 
        userHistory.slice(-3).some(prevMsg => {
          const similarity = calculateSimilarity(msg.toLowerCase(), prevMsg.toLowerCase());
          return similarity > 0.8; // 80% เหมือนกัน
        });
      
      // ตรวจสอบ spam (annoyed)
      const recentFromSameUser = recentMessages.filter(m => m.user === name && m.time > Date.now() - 30 * 1000);
      const isSpam = recentFromSameUser.length > 3; // มากกว่า 3 ข้อความใน 30 วินาที
      
      // ตรวจสอบข้อความสั้น/น่าเบื่อ (bored)
      const isShortOrBoring = msg.length < 10 || 
        /^(hi|hello|hey|gm|gn|lol|haha|ok|yes|no|thanks|thx)$/i.test(msg.trim());
      
      if (isRepeatedMessage || isSpam) {
        isAnnoyed = true;
        console.log(`[emotion] 😤 Luna is annoyed: ${isRepeatedMessage ? 'repeated message' : 'spam detected'}`);
      }
      
      if (isShortOrBoring) {
        boredCounter++;
        if (boredCounter >= BORED_THRESHOLD) {
          isBored = true;
          console.log(`[emotion] 😑 Luna is bored: too many boring messages`);
        }
      } else {
        boredCounter = Math.max(0, boredCounter - 1); // ลด counter เมื่อมีข้อความน่าสนใจ
      }
      
      // เก็บประวัติข้อความ
      if (!userMessageHistory.has(name)) {
        userMessageHistory.set(name, []);
      }
      const history = userMessageHistory.get(name);
      history.push(msg);
      if (history.length > 10) history.shift(); // เก็บแค่ 10 ข้อความล่าสุด
      
      // เก็บข้อความล่าสุด (สำหรับตรวจสอบ spam)
      recentMessages.push({ user: name, message: msg, time: Date.now() });
      if (recentMessages.length > 20) recentMessages.shift(); // เก็บแค่ 20 ข้อความล่าสุด
      
      // เรียกสมองหลักของ Luna (โมเดล GPT ผ่าน ai.js)
      // ส่ง context เพิ่มเติม: energy, social awareness, etc.
      // Response Time Optimization: ใช้ Promise.all() สำหรับ parallel processing
      const [modelResult] = await Promise.all([
        callModel(msg, { 
          username: name,
          lunaEnergy: lunaEnergy,
          isNewUser: isNewUser,
          viewerCount: viewerCount,
          currentEmotion: currentEmotion,
          emotionIntensity: emotionIntensity,
          isAnnoyed: isAnnoyed,
          isBored: isBored,
          isUserSad: isUserSad,
          isUserHappy: isUserHappy,
          userDidSomething: userDidSomething,
          hasNews: hasNews,
          primaryEmotion: primaryEmotion,
          secondaryEmotion: secondaryEmotion,
          emotionContext: emotionContext,
        }),
      ]);
      
      // Track model usage (ใช้ isComplexQuestion จาก modules/ai.js เพื่อความสอดคล้อง)
      const isComplex = isComplexQuestion(msg);
      if (isComplex) {
        stats.messages.byModel.complex++;
      } else {
        stats.messages.byModel.simple++;
      }
      
      // Cache response
      setCachedResponse(cacheKey, modelResult);
    }
    
    let { reply, emotion: modelEmotion, traits } = modelResult;

    // ----------------------
    // Emotional Continuity: อารมณ์คงอยู่สักพัก
    // ----------------------
    const timeSinceEmotionChange = Date.now() - emotionStartTime;
    let finalEmotion = classifiedEmotion || modelEmotion || "neutral";
    
    // คำนวณความแรงของอารมณ์ (ถ้ามีอารมณ์)
    let detectedIntensity = 0.7; // Default
    if (finalEmotion && finalEmotion !== "neutral") {
      detectedIntensity = calculateEmotionIntensity(msg, finalEmotion);
    }
    
    // Emotion Decay: ลด intensity ตามเวลา (ทุก 10 วินาที)
    const now = Date.now();
    const timeSinceLastDecay = now - lastEmotionDecayTime;
    if (timeSinceLastDecay >= EMOTION_DECAY_INTERVAL && currentEmotion !== "neutral") {
      emotionIntensity = Math.max(0.0, emotionIntensity - EMOTION_DECAY_RATE);
      lastEmotionDecayTime = now;
      
      // ถ้า intensity ต่ำเกินไป (< 0.2) → กลับเป็น neutral
      if (emotionIntensity < 0.2) {
        currentEmotion = "neutral";
        emotionIntensity = 0.0;
        emotionStartTime = now;
        console.log(`[emotion] Decayed to neutral (intensity: ${emotionIntensity.toFixed(2)})`);
      } else {
        console.log(`[emotion] Decayed ${currentEmotion} (intensity: ${emotionIntensity.toFixed(2)})`);
      }
    }
    
    // Emotion Transition: ถ้ามี transition → ใช้ transition
    if (emotionTransition === "neutral") {
      // เปลี่ยนเป็น neutral ก่อน (1-2 วินาที)
      currentEmotion = "neutral";
      emotionIntensity = 0.4;
      emotionStartTime = Date.now();
      lastEmotionDecayTime = Date.now();
      
      // หลังจาก 1-2 วินาที → เปลี่ยนเป็นอารมณ์ใหม่
      setTimeout(() => {
        currentEmotion = finalEmotion;
        emotionIntensity = detectedIntensity;
        emotionStartTime = Date.now();
        lastEmotionDecayTime = Date.now();
        triggerForEmotion(finalEmotion);
        console.log(`[emotion] Transition complete: neutral → ${finalEmotion}`);
      }, 1000 + Math.random() * 1000); // 1-2 วินาที
    } else {
    // Emotion Transition: ถ้ามี transition → ใช้ transition
    if (emotionTransition === "neutral") {
      // เปลี่ยนเป็น neutral ก่อน (1-2 วินาที)
      currentEmotion = "neutral";
      emotionIntensity = 0.4;
      emotionStartTime = Date.now();
      lastEmotionDecayTime = Date.now();
      
      // หลังจาก 1-2 วินาที → เปลี่ยนเป็นอารมณ์ใหม่
      setTimeout(() => {
        currentEmotion = finalEmotion;
        emotionIntensity = detectedIntensity;
        emotionStartTime = Date.now();
        lastEmotionDecayTime = Date.now();
        triggerForEmotion(finalEmotion);
        console.log(`[emotion] Transition complete: neutral → ${finalEmotion}`);
      }, 1000 + Math.random() * 1000); // 1-2 วินาที
    } else {
      // ถ้าอารมณ์เปลี่ยนเร็วเกินไป (< 30 วินาที) → ใช้อารมณ์เดิม (ความต่อเนื่อง)
      if (timeSinceEmotionChange < EMOTION_DURATION && currentEmotion !== "neutral" && finalEmotion !== currentEmotion) {
        // 30% โอกาสเปลี่ยนอารมณ์ทันที (ถ้าอารมณ์ใหม่แรงมาก)
        const shouldChange = Math.random() < 0.3 || detectedIntensity > 0.8;
        if (!shouldChange) {
          finalEmotion = currentEmotion; // ใช้อารมณ์เดิม
          emotionIntensity = Math.max(0.3, emotionIntensity - 0.1); // ลดความแรง
        } else {
          currentEmotion = finalEmotion;
          emotionStartTime = Date.now();
          emotionIntensity = detectedIntensity; // ใช้ความแรงที่คำนวณได้
          lastEmotionDecayTime = Date.now(); // Reset decay timer
        }
      } else {
        // อารมณ์เปลี่ยนตามปกติ
        if (finalEmotion !== currentEmotion) {
          currentEmotion = finalEmotion;
          emotionStartTime = Date.now();
          emotionIntensity = detectedIntensity; // ใช้ความแรงที่คำนวณได้
          lastEmotionDecayTime = Date.now(); // Reset decay timer
        } else {
          // อารมณ์เดิม → ลดความแรงลง (ถ้ายังไม่ถึงเวล decay)
          if (timeSinceLastDecay < EMOTION_DECAY_INTERVAL) {
            emotionIntensity = Math.max(0.2, emotionIntensity - 0.05);
          }
        }
      }
    }
    }

    // ถ้าอยู่ในโหมดง่วง (และไม่ได้ forceAwake) → ทับเป็น sleepy เว้นแต่โกรธ/ฮายป์
    if (sleepyMode && !forceAwake && finalEmotion !== "angry" && finalEmotion !== "hype") {
      finalEmotion = "sleepy";
      currentEmotion = "sleepy";
    }

    // ----------------------
    // Natural Pauses: หยุดคิดก่อนตอบ (ถ้าคำถามยาก)
    // ----------------------
    const isComplex = isComplexQuestion(msg);
    let thinkingPause = 0;
    if (isComplex) {
      // คำถามยาก → หยุดคิด 1-3 วินาที
      thinkingPause = 1000 + Math.random() * 2000;
    } else if (lunaEnergy < 0.5) {
      // เหนื่อย → หยุดคิดนานขึ้น
      thinkingPause = 500 + Math.random() * 1000;
    }
    
    // ถ้ามี thinking pause → รอสักครู่ก่อนตอบ (simulate thinking)
    if (thinkingPause > 0) {
      await new Promise(resolve => setTimeout(resolve, thinkingPause));
    }

    // แต่งข้อความตอบให้เข้ากับอารมณ์
    // ส่ง isComplex เพื่อปรับโอกาสตามความยากของคำถาม
    reply = decorateReplyForEmotion(msg, reply, finalEmotion, isComplex);
    
    // ----------------------
    // Advanced Human-like Speech Patterns: เพิ่มการพูดซ้ำ, ติดอ่าง, เน้นคำ
    // ปรับโอกาสตามความยากของคำถาม: คำถามยาก → เพิ่มโอกาส, คำถามง่าย → ลดโอกาส
    // ----------------------
    // Word repetition chance: คำถามยาก 15%, คำถามง่าย 4%
    const repetitionChance = isComplex ? 0.15 : 0.04;
    if (reply && reply.length > 30 && Math.random() < repetitionChance) {
      const sentences = reply.split(/[.!?]+/).filter(s => s.trim().length > 0);
      if (sentences.length > 0) {
        const firstSentence = sentences[0].trim();
        const words = firstSentence.split(/\s+/);
        if (words.length > 2) {
          // Find a meaningful word to repeat (usually at the start)
          const repeatIndex = Math.min(2, words.length - 1);
          const wordToRepeat = words[repeatIndex];
          // Only repeat if it's not too short and not punctuation
          if (wordToRepeat.length > 3 && !/[.!?,]/.test(wordToRepeat)) {
            words.splice(repeatIndex, 0, wordToRepeat + "...");
            sentences[0] = words.join(" ");
            reply = sentences.join(". ") + (reply.match(/[.!?]$/) ? reply.slice(-1) : ".");
          }
        }
      }
    }
    
    // Stutter chance: คำถามยาก 8%, คำถามง่าย 2%
    const stutterChance = isComplex ? 0.08 : 0.02;
    if (reply && reply.length > 20 && Math.random() < stutterChance) {
      const words = reply.split(/\s+/);
      if (words.length > 2) {
        // Find a word that starts with a consonant to stutter (usually at the start)
        const stutterIndex = Math.floor(Math.random() * Math.min(3, words.length));
        const wordToStutter = words[stutterIndex];
        // Only stutter if it starts with a consonant and is not too short
        if (wordToStutter.length > 2 && /^[bcdfghjklmnpqrstvwxyz]/i.test(wordToStutter) && !/[.!?,]/.test(wordToStutter)) {
          const firstLetter = wordToStutter[0];
          words[stutterIndex] = `${firstLetter}-${wordToStutter}`;
          reply = words.join(" ");
        }
      }
    }
    
    // 10-15% chance to add emphasis (CAPS) to important words (when excited)
    if (reply && reply.length > 30 && Math.random() < 0.12 && (finalEmotion === "hype" || finalEmotion === "excited")) {
      const emphasisWords = ["so", "really", "very", "amazing", "incredible", "awesome", "cool", "great", "love", "excited"];
      const words = reply.split(/\s+/);
      for (let i = 0; i < words.length; i++) {
        const word = words[i].toLowerCase().replace(/[.!?,]/g, "");
        if (emphasisWords.includes(word) && Math.random() < 0.3) {
          // Capitalize the word (keep punctuation)
          const punctuation = words[i].match(/[.!?,]+$/);
          words[i] = word.toUpperCase() + (punctuation ? punctuation[0] : "");
        }
      }
      reply = words.join(" ");
    }
    
    // ----------------------
    // Natural Response Length: สุ่มตัดคำตอบให้สั้นลงบางครั้ง (ให้เหมือนคนจริง)
    // ----------------------
    // 30% โอกาสตัดคำตอบให้สั้นลง (ถ้าคำตอบยาวเกิน 100 ตัวอักษร)
    if (reply && reply.length > 100 && Math.random() < 0.3) {
      // หาประโยคแรกหรือสองประโยคแรก
      const sentences = reply.match(/[^.!?]+[.!?]+/g) || [];
      if (sentences.length > 1) {
        // 50% โอกาสใช้แค่ประโยคแรก, 50% โอกาสใช้ 2 ประโยคแรก
        const numSentences = Math.random() < 0.5 ? 1 : 2;
        reply = sentences.slice(0, numSentences).join(" ").trim();
        // ถ้ายังยาวเกินไป → ตัดให้เหลือแค่ประโยคแรก
        if (reply.length > 150) {
          reply = sentences[0].trim();
        }
        console.log(`[natural-length] Shortened reply to ${reply.length} chars (${numSentences} sentence(s))`);
      } else if (sentences.length === 1 && reply.length > 150) {
        // ถ้ามีแค่ประโยคเดียวแต่ยาวเกินไป → ตัดให้เหลือแค่ครึ่งแรก
        const words = reply.split(/\s+/);
        const halfWords = Math.floor(words.length / 2);
        reply = words.slice(0, halfWords).join(" ") + "...";
        console.log(`[natural-length] Shortened long single sentence to ${reply.length} chars`);
      }
    }
    
    // ----------------------
    // Negative Emotions: เพิ่ม prefix เมื่อหงุดหงิด/เบื่อ
    // ----------------------
    if (isAnnoyed) {
      const annoyedPrefixes = [
        "Hmm, you're asking that again? ",
        "Ugh, we just talked about this... ",
        "Okay, I'm getting a bit tired of this... ",
        "Seriously? Again? ",
        "Come on, you know I just said that... ",
      ];
      const prefix = annoyedPrefixes[Math.floor(Math.random() * annoyedPrefixes.length)];
      reply = prefix + reply;
    } else if (isBored) {
      const boredPrefixes = [
        "Hmm... ",
        "Okay... ",
        "Right... ",
        "I see... ",
        "Mmm... ",
      ];
      const prefix = boredPrefixes[Math.floor(Math.random() * boredPrefixes.length)];
      reply = prefix + reply;
      // ลดความยาวของ reply เมื่อเบื่อ (ให้สั้นลง)
      if (reply.length > 100) {
        const sentences = reply.split(/[.!?]+/).filter(s => s.trim().length > 0);
        if (sentences.length > 1) {
          reply = sentences[0] + ".";
        }
      }
    }
    
    // ----------------------
    // Personal Habits: เพิ่ม catchphrase บางครั้ง
    // ----------------------
    const timeSinceLastCatchphrase = Date.now() - lastCatchphraseTime;
    if (timeSinceLastCatchphrase > CATCHPHRASE_INTERVAL && Math.random() < 0.3) {
      const catchphrase = catchphrases[Math.floor(Math.random() * catchphrases.length)];
      reply = `${catchphrase} ${reply}`;
      lastCatchphraseTime = Date.now();
    }
    
    // ----------------------
    // Conversation Flow: เปลี่ยนหัวข้อเอง, inside jokes
    // ----------------------
    const timeSinceTopicChange = Date.now() - topicStartTime;
    const userMem = getUserMemory(name);
    const timesSeen = userMem?.timesSeen || 0;
    
    // เปลี่ยนหัวข้อเอง (ถ้าคุยเรื่องเดิมนานเกิน 10 นาที)
    if (timeSinceTopicChange > TOPIC_DURATION && Math.random() < 0.15) {
      const topicTransitions = [
        "Oh, that reminds me...",
        "Speaking of which...",
        "Hmm, random thought...",
        "By the way...",
      ];
      const transition = topicTransitions[Math.floor(Math.random() * topicTransitions.length)];
      reply = `${transition} ${reply}`;
      currentTopic = null;
      topicStartTime = Date.now();
    }
    
    // Inside jokes กับผู้ใช้ที่คุยบ่อย (มากกว่า 10 ครั้ง)
    if (timesSeen > 10 && Math.random() < 0.2) {
      const jokes = insideJokes.get(name) || [];
      if (jokes.length > 0) {
        const joke = jokes[Math.floor(Math.random() * jokes.length)];
        reply = `${joke} ${reply}`;
      } else {
        // สร้าง inside joke ใหม่
        const newJoke = "Ehehe, you know what I'm gonna say~";
        insideJokes.set(name, [newJoke]);
        reply = `${newJoke} ${reply}`;
      }
    }

    // อัปเดต memory
    const memPatch = {
      lastMessage: msg,
      lastReply: reply,
      lastEmotion: finalEmotion,
      traits,
    };
    updateUserMemory(name, memPatch);

    // ----------------------
    // Voice Variations: เสียงเปลี่ยนตามอารมณ์/พลังงาน/เวลา/จำนวนผู้ชม
    // ----------------------
    let voiceMode = "normal";
    
    // Base on emotion
    if (sleepyMode && !forceAwake) {
      voiceMode = "soft";
    } else if (finalEmotion === "sad" || finalEmotion === "soft") {
      voiceMode = "soft";
    } else if (finalEmotion === "hype" || finalEmotion === "excited") {
      voiceMode = "passion";
    } else if (finalEmotion === "angry") {
      voiceMode = "normal";
    }
    
    // Adjust based on energy level
    if (lunaEnergy < 0.4) {
      // เหนื่อยมาก → ใช้ soft voice (แม้จะปกติ)
      if (voiceMode === "normal") voiceMode = "soft";
    } else if (lunaEnergy > 0.8 && viewerCount > 20) {
      // พลังงานสูง + ผู้ชมเยอะ → ใช้ passion voice (แม้จะปกติ)
      if (voiceMode === "normal") voiceMode = "passion";
    }
    
    // Adjust based on time of day
    const hourUS = getAmericaHour();
    if (hourUS >= 22 || hourUS < 6) {
      // ดึก → ใช้ soft voice (แม้จะปกติ)
      if (voiceMode === "normal") voiceMode = "soft";
    }
    
    // หมายเหตุ: ไม่ใช้ reading_quiet ในการตอบคำถาม - ใช้เฉพาะตอนอ่านเม้นเท่านั้น

    // ----------------------
    // Inconsistency & Mistakes: บางครั้งไม่เข้าใจ, ตอบไม่ตรง, ลืม
    // ----------------------
    const willMisunderstand = Math.random() < 0.05; // 5% โอกาสไม่เข้าใจ
    const willForget = Math.random() < 0.08; // 8% โอกาสลืม
    const willAnswerWrong = Math.random() < 0.03; // 3% โอกาสตอบไม่ตรง
    
    if (willMisunderstand) {
      // ไม่เข้าใจ → ถามซ้ำ
      const confusionLines = [
        "Hmm, I'm not sure I understood that... could you say it again?",
        "Wait, what did you mean by that?",
        "Sorry, I think I missed something... can you clarify?",
      ];
      const confusion = confusionLines[Math.floor(Math.random() * confusionLines.length)];
      reply = `${confusion} ${reply}`;
    } else if (willForget) {
      // Get conversation history for forget check
      const { getUserMemory } = await import("./modules/memory.js");
      const userMem = getUserMemory(name);
      const convHistory = userMem?.conversationHistory || [];
      if (convHistory.length > 0) {
        // ลืม → บอกว่าลืม
        const forgetLines = [
          "Oh wait, what were we talking about again?",
          "Hmm, I think I forgot something...",
          "Sorry, my memory's a bit fuzzy right now...",
        ];
        const forget = forgetLines[Math.floor(Math.random() * forgetLines.length)];
        reply = `${forget} ${reply}`;
      }
    } else if (willAnswerWrong) {
      // ตอบไม่ตรง → บอกว่าอาจจะผิด
      const wrongLines = [
        "Hmm, I'm not 100% sure about this, but...",
        "I might be wrong, but I think...",
        "Let me think... actually, maybe...",
      ];
      const wrong = wrongLines[Math.floor(Math.random() * wrongLines.length)];
      reply = `${wrong} ${reply}`;
    }

    const ttsId = await generateTTS(reply, voiceMode);
    const speakDuration = estimateSpeechDurationMs(reply, voiceMode);
    
    // อัปเดตเวลาที่ Luna จะพูดเสร็จ (เพื่อป้องกัน idle แซก)
    lastSpeechEndTime = Date.now() + speakDuration + 1000; // +1 วินาที buffer
    
    // อัปเดต total speech time (สำหรับ energy system)
    totalSpeechTime += speakDuration;

    // Talk-React: ให้ปากขยับตามช่วงเวลาพูด
    try {
      startTalkReact(speakDuration, voiceMode);
    } catch (e) {
      console.warn("[talk-react] failed:", e.message);
    }

    broadcast({
      type: "luna_message",
      from: name,
      text: reply,
      ttsUrl: ttsId ? `/public/tts/${ttsId}.mp3` : null,
      voiceMode,
    });

    // Broadcast emotion update to character viewer
    broadcast({
      type: "emotion_update",
      emotion: finalEmotion,
      intensity: emotionIntensity,
    });
    
    // Broadcast energy update to character viewer
    broadcast({
      type: "energy_update",
      energy: lunaEnergy,
    });
    
    // Broadcast comprehensive character state update
    broadcast({
      type: "character_state",
      emotion: finalEmotion,
      energy: lunaEnergy,
      emotionIntensity: emotionIntensity,
    });

    // ⭐ Temporary Emotion System + baseline emotion_clear
    try {
      if (!sleepyMode || forceAwake) {
        // หน้า default ที่เราอยากให้ใช้ตลอดเวลา
        clearExpressions();

        if (finalEmotion && finalEmotion !== "neutral") {
          // แสดงหน้าอารมณ์เฉพาะตอนพูด
          triggerForEmotion(finalEmotion);

          // กลับหน้า default หลังพูดเสร็จ
          setTimeout(() => {
            try {
              clearExpressions();
            } catch (err) {
              console.warn("[vts] reset-to-clear failed:", err.message);
            }
          }, speakDuration + 400);
        }
        // ถ้า neutral → ปล่อยให้ emotion_clear อยู่เฉย ๆ
      } else {
        // ถ้าอยู่โหมดง่วงจริง ๆ (และไม่ได้ forceAwake) → ล็อกหน้า sleepy
        triggerForEmotion("sleepy");
      }

      // ขยับหน้าเล็กน้อยซ้าย/ขวาแบบสุ่ม
      const dir = Math.random() < 0.5 ? -10 : 10;
      setFaceAngle(dir, 0, 0);
      
      // Broadcast face angle to character viewer
      broadcast({
        type: 'face_angle',
        x: dir,
        y: 0,
        z: 0,
      });
    } catch (e) {
      console.warn("[vts] emotion trigger failed:", e.message);
    }

    try {
      logChat(name, msg, reply);
    } catch {
      // ignore
    }

    // Update statistics
    const emotionCount = stats.messages.byEmotion.get(finalEmotion) || 0;
    stats.messages.byEmotion.set(finalEmotion, emotionCount + 1);
    
    responseTime = Date.now() - startTime;
    stats.performance.totalResponseTime += responseTime;
    stats.performance.responseCount++;
    stats.performance.avgResponseTime = Math.round(
      stats.performance.totalResponseTime / stats.performance.responseCount
    );

    // ส่ง response (ถ้ายังไม่ได้ส่ง)
    if (!res.headersSent) {
      return res.json({
        ok: true,
        reply,
        ttsUrl: ttsId ? `/public/tts/${ttsId}.mp3` : null,
        voiceMode,
        emotion: finalEmotion,
      });
    }
  } catch (e) {
    logError(e, { endpoint: "/luna/message", user: name, message: msg });
    
    // Return user-friendly error message (ถ้ายังไม่ได้ส่ง)
    if (!res.headersSent) {
      const errorMessage = e.message || "Internal server error";
      res.status(500).json({ 
        ok: false,
        error: errorMessage,
        message: "Sorry, I encountered an error. Please try again later.",
      });
    }
  }
}

// รองรับทั้ง /luna/message และ /Luna/message
app.post("/luna/message", validateMessageRequest, handleLunaMessage);
app.post("/Luna/message", handleLunaMessage);

// ----------------------
// Rock Paper Scissors Game
// ----------------------

// Store game state (in production, use Redis or DB)
const rpsGames = new Map(); // Map<username, { balance: number, lastPlay: number }>

// PvP Matching Queue (moved to before static files - line ~125)
// Minimum balance required to play (1M Luna tokens)
const RPS_MIN_BALANCE = 1000000;

// Balance cache to reduce RPC requests (key: wallet+mint, value: { balance, timestamp })
const balanceCache = new Map();
const BALANCE_CACHE_TTL = 30000; // 30 seconds cache

/**
 * Check user's Luna token balance
 * GET /luna/rps/balance?user=username OR ?wallet=wallet_address&mint=token_mint
 */
app.get("/luna/rps/balance", async (req, res) => {
  try {
    const wallet = req.query.wallet;
    const mint = req.query.mint || "CbB4ivri6wLfqx4NwrWY3ArD7mXv1e91HeYeq3KBpump";
    
    // If wallet is provided, check balance from blockchain
    if (wallet) {
      const cacheKey = `${wallet}:${mint}`;
      const now = Date.now();
      
      // Check cache first
      if (balanceCache.has(cacheKey)) {
        const cached = balanceCache.get(cacheKey);
        if (now - cached.timestamp < BALANCE_CACHE_TTL) {
          console.log(`[rps] Using cached balance for ${wallet.substring(0, 8)}...: ${cached.balance}`);
          return res.json({
            ok: true,
            balance: cached.balance,
            minRequired: RPS_MIN_BALANCE,
            canPlay: cached.balance >= RPS_MIN_BALANCE,
            cached: true,
          });
        }
      }
      
      console.log(`[rps] Checking balance for wallet: ${wallet.substring(0, 8)}...${wallet.substring(wallet.length - 8)}, mint: ${mint}`);
      
      // Use multiple RPC endpoints for reliability
      const rpcEndpoints = [
        'https://api.mainnet-beta.solana.com',
        'https://solana-api.projectserum.com',
        'https://rpc.ankr.com/solana'
      ];
      
      let connection = null;
      let lastError = null;
      let rateLimited = false;
      
      // Try each endpoint until one works
      for (const endpoint of rpcEndpoints) {
        try {
          connection = new Connection(endpoint, 'confirmed');
          // Test connection
          await connection.getVersion();
          console.log(`[rps] Connected to RPC: ${endpoint}`);
          break;
        } catch (err) {
          lastError = err;
          // Check if it's a rate limit error
          if (err.message && (err.message.includes('429') || err.message.includes('Too Many Requests'))) {
            rateLimited = true;
            console.log(`[rps] Rate limited on ${endpoint}`);
            continue;
          }
          console.log(`[rps] Failed to connect to ${endpoint}: ${err.message}`);
          continue;
        }
      }
      
      if (!connection) {
        // If rate limited, return cached value if available
        if (rateLimited && balanceCache.has(cacheKey)) {
          const cached = balanceCache.get(cacheKey);
          console.log(`[rps] Rate limited, using stale cache for ${wallet.substring(0, 8)}...`);
          return res.json({
            ok: true,
            balance: cached.balance,
            minRequired: RPS_MIN_BALANCE,
            canPlay: cached.balance >= RPS_MIN_BALANCE,
            cached: true,
            warning: 'Rate limited, showing cached balance',
          });
        }
        throw new Error('Failed to connect to Solana RPC: ' + (lastError?.message || 'Unknown error'));
      }
      
      const mintPublicKey = new PublicKey(mint);
      const walletPubKey = new PublicKey(wallet);
      
      try {
        // Get token accounts
        const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
          walletPubKey,
          { mint: mintPublicKey }
        );
        
        let balance = 0;
        if (tokenAccounts.value && tokenAccounts.value.length > 0) {
          const tokenAccount = tokenAccounts.value[0];
          const tokenAmount = tokenAccount.account.data.parsed.info.tokenAmount;
          
          // Use uiAmountString for accurate balance, or calculate from amount and decimals
          if (tokenAmount.uiAmountString) {
            balance = parseFloat(tokenAmount.uiAmountString);
          } else if (tokenAmount.uiAmount !== null && tokenAmount.uiAmount !== undefined) {
            balance = tokenAmount.uiAmount;
          } else {
            // Calculate from raw amount and decimals
            const rawAmount = tokenAmount.amount;
            const decimals = tokenAmount.decimals || 0;
            balance = parseFloat(rawAmount) / Math.pow(10, decimals);
          }
          
          // Round to integer
          balance = Math.floor(balance);
          
          console.log(`[rps] Balance check for wallet ${wallet.substring(0, 8)}...: ${balance} (mint: ${mint})`);
        } else {
          console.log(`[rps] No token account found for wallet ${wallet.substring(0, 8)}... (mint: ${mint})`);
        }
        
        // Cache the result
        balanceCache.set(cacheKey, { balance, timestamp: now });
        
        return res.json({
          ok: true,
          balance: balance,
          minRequired: RPS_MIN_BALANCE,
          canPlay: balance >= RPS_MIN_BALANCE,
        });
      } catch (rpcError) {
        // Handle rate limiting errors
        if (rpcError.message && (rpcError.message.includes('429') || rpcError.message.includes('Too Many Requests'))) {
          // Return cached value if available
          if (balanceCache.has(cacheKey)) {
            const cached = balanceCache.get(cacheKey);
            console.log(`[rps] Rate limited during request, using cached balance for ${wallet.substring(0, 8)}...`);
            return res.json({
              ok: true,
              balance: cached.balance,
              minRequired: RPS_MIN_BALANCE,
              canPlay: cached.balance >= RPS_MIN_BALANCE,
              cached: true,
              warning: 'Rate limited, showing cached balance',
            });
          }
          throw new Error('Rate limited. Please try again in a few seconds.');
        }
        throw rpcError;
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
    console.error("[rps] Balance check error:", e);
    res.status(500).json({
      ok: false,
      error: e.message,
      message: "Failed to check balance",
    });
  }
});

// Route moved to before static files (line ~125)

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
    console.error("[rps] Submit error:", e);
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
    
    if (isTestMode) {
      // TEST MODE: Use mock balance (2M Luna)
      balance = 2000000;
      console.log(`[rps] TEST MODE: Using mock balance ${balance} for ${username}`);
    } else {
      // PRODUCTION MODE: Check balance from rpsGames or wallet
      let userData = rpsGames.get(username);
      if (!userData) {
        // If wallet address provided, we should check real balance
        // For now, use mock balance if no data exists
        balance = Math.floor(Math.random() * 5000000);
        userData = { balance, lastPlay: 0 };
        rpsGames.set(username, userData);
      } else {
        balance = userData.balance || 0;
      }
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
      let userData = rpsGames.get(username);
      if (!userData) {
        userData = { balance, lastPlay: 0 };
        rpsGames.set(username, userData);
      }
      
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
    console.log(`[rps] ${username} played ${playerChoice} vs Luna's ${lunaChoice} → ${result}`);
    
    res.json({
      ok: true,
      playerChoice: playerChoice,
      lunaChoice: lunaChoice,
      result: result,
      message: result === "win" ? "You win! 🎉" : result === "lose" ? "You lose! 😢" : "It's a tie! 🤝",
    });
  } catch (e) {
    console.error("[rps] Play error:", e);
    res.status(500).json({
      ok: false,
      error: e.message,
      message: "Game failed. Please try again~",
    });
  }
});

// ----------------------
// 2) Webhook ตอนมีคนซื้อเหรียญ
// ----------------------

app.post("/purchase", validatePurchaseRequest, async (req, res) => {
  try {
    const secretHeader = req.headers["x-purchase-secret"];
    const expectedSecret = process.env.PURCHASE_SECRET || "";

    if (expectedSecret && secretHeader !== expectedSecret) {
      return res.status(401).json({ ok: false, error: "invalid secret" });
    }

    const { buyer, amount, currency } = req.body || {};

    if (!buyer || amount == null) {
      return res.status(400).json({ ok: false, error: "missing buyer or amount" });
    }

    const numAmount = Number(amount);
    const coinName = process.env.COIN_NAME || "Luna";
    const bigBuyThreshold = Number(process.env.BIGBUY_SOL_THRESHOLD || 10);

    const isBigBuy = currency === "SOL" && numAmount >= bigBuyThreshold;

    console.log(
      `[purchase] ${buyer} bought ${numAmount} ${currency} (${isBigBuy ? "BIG" : "normal"})`
    );

    let line;

    if (isBigBuy) {
      const templates = [
        "Ehehe~ th-thank you sooo much, {buyer}... that buy was huge for {coin}~",
        "Mmm~ {buyer}, you’re really pushing {coin} to the moon for me, huh~?",
        "Aww~ that’s reaaally big, {buyer}... you’re spoiling me so much~",
        "U-uhm... {buyer}, are you trying to make my heart race with that buy~?",
      ];
      const t = templates[Math.floor(Math.random() * templates.length)];
      line = t.replace(/\{buyer\}/g, buyer).replace(/\{coin\}/g, coinName);

      const speakDuration = estimateSpeechDurationMs(line, "soft");
      lastSpeechEndTime = Date.now() + speakDuration + 1000; // อัปเดตเวลาพูดเสร็จ
      totalSpeechTime += speakDuration; // อัปเดต total speech time
      
      // Energy boost เมื่อมี big buy
      lunaEnergy = Math.min(1.0, lunaEnergy + 0.2);
      
      await speak(line, { voiceMode: "soft" });

      if (!sleepyMode || forceAwake) {
        try {
          triggerForBigBuy(numAmount);
        } catch (e) {
          console.warn("[vts] big buy trigger failed:", e.message);
        }
      }
    } else {
      const templates = [
        "Hehe~ thank you {buyer} for buying {coin}~",
        "Mmm~ appreciate your support, {buyer}~",
        "Ehehe~ every buy counts, thank you {buyer}~",
        "Aww~ thanks for joining the {coin} crew, {buyer}~",
      ];
      const t = templates[Math.floor(Math.random() * templates.length)];
      line = t.replace(/\{buyer\}/g, buyer).replace(/\{coin\}/g, coinName);

      const voiceMode = sleepyMode && !forceAwake ? "soft" : "normal";
      const speakDuration = estimateSpeechDurationMs(line, voiceMode);
      lastSpeechEndTime = Date.now() + speakDuration + 1000; // อัปเดตเวลาพูดเสร็จ
      totalSpeechTime += speakDuration; // อัปเดต total speech time
      
      // Energy boost เล็กน้อยเมื่อมีคนซื้อ
      lunaEnergy = Math.min(1.0, lunaEnergy + 0.05);
      
      await speak(line, { voiceMode });

      if (!sleepyMode || forceAwake) {
        try {
          triggerForEmotion("hype");
        } catch (e) {
          console.warn("[vts] normal buy emotion trigger failed:", e.message);
        }
      }
    }

    return res.json({ ok: true, line, big: isBigBuy });
  } catch (err) {
    console.error("[purchase] error", err);
    return res.status(500).json({ ok: false, error: "internal error" });
  }
});

// ----------------------
// 3) Idle monologue (พูดพึมพำตอนเงียบ)
// ----------------------

async function idleLoop() {
  // ⚠️ DISABLED: Idle monologue เพื่อประหยัด API calls
  // ปิดการใช้งานชั่วคราวเพราะเปลือง token มาก
  // ถ้าต้องการเปิดใช้: เปลี่ยน IDLE_MONOLOGUE_ENABLED เป็น true ใน .env
  
  const IDLE_MONOLOGUE_ENABLED = process.env.IDLE_MONOLOGUE_ENABLED === "true";
  
  if (!IDLE_MONOLOGUE_ENABLED) {
    // ไม่ทำอะไรเลย - ข้ามไปเลย
    setTimeout(idleLoop, 60 * 1000);
    return;
  }
  
  const now = Date.now();
  const idleMs = now - lastChatTs;
  
  // ตรวจสอบว่า Luna กำลังพูดหรือเพิ่งพูดเสร็จ (ภายใน 3 วินาที)
  const timeSinceLastSpeech = now - lastSpeechEndTime;
  const isSpeakingOrJustFinished = timeSinceLastSpeech < 3000; // 3 วินาที buffer
  
  if (idleMs > 20 * 1000 && !isSpeakingOrJustFinished) {
    console.log("[idle] no chat for", Math.round(idleMs / 1000), "seconds. Triggering idle monologue.");
    lastChatTs = Date.now();
    try {
      const prompt =
        "You are Luna, an AI streamer. There is no chat message right now. Say one short, cozy line as if you are thinking out loud on stream. Do not mention this prompt.";
      // ใช้ simpleModel สำหรับ idle monologue เพื่อประหยัดค่าใช้จ่าย
      const { reply } = await callSimpleModel(prompt, { username: "Luna_idle" });
      const ttsId = await generateTTS(reply, sleepyMode && !forceAwake ? "soft" : "calm");
      const duration = estimateSpeechDurationMs(reply, sleepyMode && !forceAwake ? "soft" : "normal");
      
      // อัปเดตเวลาที่ idle monologue จะพูดเสร็จ
      lastSpeechEndTime = Date.now() + duration + 1000; // +1 วินาที buffer

      try {
        startTalkReact(duration, sleepyMode && !forceAwake ? "soft" : "normal");
      } catch (e) {
        console.warn("[talk-react idle] failed:", e.message);
      }

      broadcast({
        type: "luna_message",
        from: "Luna",
        text: reply,
        ttsUrl: ttsId ? `/public/tts/${ttsId}.mp3` : null,
        voiceMode: sleepyMode && !forceAwake ? "soft" : "calm",
      });
    } catch (e) {
      console.warn("[idle] failed:", e.message);
    }
  } else if (isSpeakingOrJustFinished) {
    // ถ้า Luna กำลังพูดหรือเพิ่งพูดเสร็จ → ข้าม idle monologue ครั้งนี้
    console.log("[idle] skipped - Luna is speaking or just finished speaking");
  }
  setTimeout(idleLoop, 60 * 1000);
}

// personality decay
setInterval(() => {
  try {
    decayPersonality();
  } catch (e) {
    console.warn("[personality] decay failed:", e.message);
  }
}, 60 * 1000);

// ----------------------
// Energy Recovery Loop
// ----------------------
setInterval(() => {
  try {
    // พลังงานค่อยๆ ฟื้นตัวเมื่อพัก (ถ้าไม่ได้พูดต่อเนื่อง)
    const timeSinceLastChat = Date.now() - lastChatTs;
    if (timeSinceLastChat > 2 * 60 * 1000) { // พักมากกว่า 2 นาที
      lunaEnergy = Math.min(1.0, lunaEnergy + 0.02); // ฟื้นตัว 2% ต่อนาที
    }
    
    // Reset total speech time ทุก 30 นาที (เพื่อไม่ให้พลังงานลดลงเรื่อยๆ)
    if (totalSpeechTime > 30 * 60 * 1000) {
      totalSpeechTime = 0;
      console.log("[energy] Reset speech time counter");
    }
    
    // Reset consecutive messages ถ้าไม่ได้แชตนาน
    if (timeSinceLastChat > 5 * 60 * 1000) {
      consecutiveMessages = 0;
    }
  } catch (e) {
    console.warn("[energy] recovery loop failed:", e.message);
  }
}, 60 * 1000); // ตรวจสอบทุกนาที

// ----------------------
// 4) ระบบเวลาอเมริกา + Sleepy Lock + หาวทุก 15 นาที
// ----------------------

function checkSleepyTime() {
  // ถ้า override อยู่ ไม่ต้องยุ่งกับโหมดง่วง
  if (forceAwake) return;

  const hourUS = getAmericaHour();

  if (hourUS >= 0 && hourUS < 6) {
    if (!sleepyMode) {
      sleepyMode = true;
      console.log(`[luna] 🌙 enter sleepyMode (US hour = ${hourUS})`);
      try {
        setBreathingMode("sleepy");
        triggerForEmotion("sleepy");
      } catch (e) {
        console.warn("[vts] sleepy emotion trigger failed:", e.message);
      }
    }
  } else if (sleepyMode) {
    sleepyMode = false;
    console.log(`[luna] ☀️ leave sleepyMode (US hour = ${hourUS})`);
    try {
      setBreathingMode("normal");
      triggerForEmotion("soft");
    } catch (e) {
      console.warn("[vts] wake emotion trigger failed:", e.message);
    }
  }
}

setInterval(checkSleepyTime, 60 * 1000);

async function yawnLoop() {
  try {
    if (sleepyMode && !forceAwake) {
      const lines = [
        "Haaah~ *yawn*... I'm getting sleepy, but I'll stay with you guys a bit longer~",
        "Mmm... it's so late in America... I could almost fall asleep on stream~",
        "*Yaaawn*... don't worry, I'm still here watching over chat~",
      ];
      const line = lines[Math.floor(Math.random() * lines.length)];
      const speakDuration = estimateSpeechDurationMs(line, "soft");
      lastSpeechEndTime = Date.now() + speakDuration + 1000; // อัปเดตเวลาพูดเสร็จ
      await speak(line, { voiceMode: "soft" });
      try {
        triggerForEmotion("sleepy");
      } catch (e) {
        console.warn("[vts] sleepy emotion trigger failed (yawn):", e.message);
      }
    }
  } catch (e) {
    console.warn("[yawn] failed:", e.message);
  } finally {
    setTimeout(yawnLoop, 15 * 60 * 1000);
  }
}
yawnLoop();

// ----------------------
// Statistics Endpoint
// ----------------------
app.get("/luna/stats", (req, res) => {
  try {
    const emotionStats = {};
    for (const [emotion, count] of stats.messages.byEmotion.entries()) {
      emotionStats[emotion] = count;
    }
    
    const userStats = {};
    const topUsers = Array.from(stats.messages.byUser.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    for (const [user, count] of topUsers) {
      userStats[user] = count;
    }
    
    return res.json({
      ok: true,
      messages: {
        total: stats.messages.total,
        byEmotion: emotionStats,
        byModel: stats.messages.byModel,
        topUsers: userStats,
      },
      performance: {
        avgResponseTime: stats.performance.avgResponseTime,
        totalResponses: stats.performance.responseCount,
        errors: stats.performance.errors,
        cacheHitRate: stats.performance.cacheHits + stats.performance.cacheMisses > 0
          ? Math.round((stats.performance.cacheHits / (stats.performance.cacheHits + stats.performance.cacheMisses)) * 100)
          : 0,
        cacheHits: stats.performance.cacheHits,
        cacheMisses: stats.performance.cacheMisses,
      },
      system: {
        uptime: stats.system.uptime(),
        startTime: new Date(stats.system.startTime).toISOString(),
      },
    });
  } catch (e) {
    logError(e, { endpoint: "/luna/stats" });
    return res.status(500).json({ ok: false, error: "Failed to get statistics" });
  }
});

// ----------------------
// Admin Endpoints
// ----------------------
function requireAdminSecret(req, res, next) {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    return res.status(503).json({
      ok: false,
      error: "Admin endpoints not configured",
      message: "ADMIN_SECRET not set in environment",
    });
  }
  
  const providedSecret = req.headers["x-admin-secret"] || req.query.secret;
  if (providedSecret !== adminSecret) {
    return res.status(401).json({
      ok: false,
      error: "Unauthorized",
      message: "Invalid admin secret",
    });
  }
  
  next();
}

app.get("/luna/admin/clear-memory", requireAdminSecret, async (req, res) => {
  try {
    const { user } = req.query;
    if (user) {
      // Clear specific user memory
      stats.messages.byUser.delete(user);
      return res.json({
        ok: true,
        message: `Memory cleared for user: ${user}`,
      });
    } else {
      // Clear all user statistics
      stats.messages.byUser.clear();
      return res.json({
        ok: true,
        message: "All user statistics cleared",
      });
    }
  } catch (e) {
    logError(e, { endpoint: "/luna/admin/clear-memory" });
    return res.status(500).json({ ok: false, error: "Failed to clear memory" });
  }
});

app.get("/luna/admin/reset-personality", requireAdminSecret, async (req, res) => {
  try {
    const { resetPersonality } = await import("./modules/personality.js");
    if (resetPersonality) {
      resetPersonality();
      return res.json({
        ok: true,
        message: "Personality reset successfully",
      });
    } else {
      return res.status(501).json({
        ok: false,
        error: "Personality reset not available",
      });
    }
  } catch (e) {
    logError(e, { endpoint: "/luna/admin/reset-personality" });
    return res.status(500).json({ ok: false, error: "Failed to reset personality" });
  }
});

app.get("/luna/admin/clear-cache", requireAdminSecret, (req, res) => {
  try {
    const beforeSize = responseCache.size;
    responseCache.clear();
    return res.json({
      ok: true,
      message: "Response cache cleared",
      clearedEntries: beforeSize,
    });
  } catch (e) {
    logError(e, { endpoint: "/luna/admin/clear-cache" });
    return res.status(500).json({ ok: false, error: "Failed to clear cache" });
  }
});

app.get("/luna/admin/errors", requireAdminSecret, (req, res) => {
  try {
    const limit = parseInt(req.query.limit || "50", 10);
    const errors = errorLog.slice(-limit).reverse(); // Most recent first
    return res.json({
      ok: true,
      errors,
      total: errorLog.length,
    });
  } catch (e) {
    logError(e, { endpoint: "/luna/admin/errors" });
    return res.status(500).json({ ok: false, error: "Failed to get errors" });
  }
});

app.get("/luna/admin/reset-stats", requireAdminSecret, (req, res) => {
  try {
    stats.messages.total = 0;
    stats.messages.byUser.clear();
    stats.messages.byEmotion.clear();
    stats.messages.byModel = { simple: 0, complex: 0 };
    stats.performance.totalResponseTime = 0;
    stats.performance.responseCount = 0;
    stats.performance.avgResponseTime = 0;
    stats.performance.errors = 0;
    stats.performance.cacheHits = 0;
    stats.performance.cacheMisses = 0;
    stats.system.startTime = Date.now();
    
    return res.json({
      ok: true,
      message: "Statistics reset successfully",
    });
  } catch (e) {
    logError(e, { endpoint: "/luna/admin/reset-stats" });
    return res.status(500).json({ ok: false, error: "Failed to reset statistics" });
  }
});

// ----------------------
// 5) Start server + watchers
// ----------------------

server.listen(PORT, '0.0.0.0', async () => {
  const host = process.env.HOST || '0.0.0.0';
  console.log(`Luna v10 server listening on http://${host}:${PORT}`);
  console.log(`🌐 Server is accessible from other devices on your network!`);
  console.log(`   Local: http://localhost:${PORT}`);
  console.log(`   Network: http://[YOUR_IP]:${PORT}`);
  await initDB();
  startSolanaWatcher();
  startPumpFunWatcher();
  
  if (process.env.VTS_ENABLED === "true") {
    console.log("[vts] VTube Studio integration enabled, connecting...");
    startVTS();
  } else {
    console.log("[vts] VTube Studio integration disabled (VTS_ENABLED=false)");
  }
  
  startBreathingLoop();
  startIdleLoop();
  idleLoop();
});

// ----------------------
// 6) Wake override APIs
// ----------------------

app.get("/luna/wake", (req, res) => {
  forceAwake = true;
  sleepyMode = false;
  try {
    setBreathingMode("normal");
    clearExpressions();
    triggerForEmotion("soft");
  } catch (e) {
    console.warn("[wake] vts error:", e.message);
  }
  return res.json({
    ok: true,
    message: "Luna is now awake temporarily (override on).",
  });
});

app.get("/luna/allow-sleep", (req, res) => {
  forceAwake = false;
  return res.json({
    ok: true,
    message: "Sleepy behavior restored (override off).",
  });
});

// ----------------------
// 7) Status check API
// ----------------------

app.get("/luna/status", (req, res) => {
  const vts = vtsStatus();
  const ttsEnabled = process.env.TTS_ENABLED !== "false";
  const elevenKey = process.env.ELEVEN_KEY ? "SET" : "MISSING";
  const openaiKey = process.env.OPENAI_KEY ? "SET" : "MISSING";
  const openrouterKey = process.env.OPENROUTER_KEY ? "SET" : "MISSING";
  
  return res.json({
    ok: true,
    server: {
      port: PORT,
      running: true,
    },
    vts: {
      enabled: vts.enabled,
      connected: vts.connected,
      authenticated: vts.authenticated,
      lastError: vts.lastError,
      status: vts.authenticated ? "READY" : vts.connected ? "CONNECTED_NOT_AUTH" : "NOT_CONNECTED",
    },
    tts: {
      enabled: ttsEnabled,
      elevenKey: elevenKey,
    },
    ai: {
      openaiKey: openaiKey,
      openrouterKey: openrouterKey,
      hasKey: !!(process.env.OPENAI_KEY || process.env.OPENROUTER_KEY),
    },
    idle: {
      lastChatTs: lastChatTs,
      idleSeconds: Math.round((Date.now() - lastChatTs) / 1000),
      willTriggerIn: Math.max(0, 20 - Math.round((Date.now() - lastChatTs) / 1000)),
    },
    sleepy: {
      mode: sleepyMode,
      forceAwake: forceAwake,
    },
  });
});

// ----------------------
// Health Check Endpoint
// ----------------------

// ----------------------
// Health Check Endpoint (Improved)
// ----------------------
app.get("/luna/health", (req, res) => {
  try {
    const vts = vtsStatus();
    const hasAIKey = !!(process.env.OPENAI_KEY || process.env.OPENROUTER_KEY);
    const hasTTSKey = !!process.env.ELEVEN_KEY;
    
    // Check database connectivity
    let dbHealthy = true;
    try {
      // Database is initialized at startup, assume OK if no errors
      dbHealthy = true;
    } catch (e) {
      dbHealthy = false;
    }
    
    // Enhanced memory tracking
    const memUsage = process.memoryUsage();
    const memoryUsageMB = memUsage.heapUsed / 1024 / 1024;
    const memoryLimitMB = 1000; // 1GB limit
    const memoryPercentage = (memUsage.heapUsed / memUsage.heapTotal) * 100;
    
    // Health checks
    const checks = {
      server: true,
      database: dbHealthy,
      vts: process.env.VTS_ENABLED === "true" ? vts.authenticated : true, // OK if disabled
      ai: hasAIKey,
      tts: process.env.TTS_ENABLED === "false" ? true : hasTTSKey, // OK if disabled
      memory: memoryUsageMB < memoryLimitMB, // Less than 1GB
      memoryWarning: memoryPercentage > 80, // Warning if using > 80% of heap
      websocket: clients.size < 100, // OK if less than 100 clients
    };
    
    // Filter out warning checks (memoryWarning, websocket) from health status
    const criticalChecks = {
      server: checks.server,
      database: checks.database,
      vts: checks.vts,
      ai: checks.ai,
      tts: checks.tts,
      memory: checks.memory,
    };
    
    const allHealthy = Object.values(criticalChecks).every(v => v === true);
    const status = allHealthy ? "healthy" : "degraded";
    
    return res.status(allHealthy ? 200 : 503).json({
      ok: allHealthy,
      status,
      timestamp: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
      checks,
      issues: Object.entries(checks)
        .filter(([_, ok]) => !ok)
        .map(([name]) => `${name} is not ready`),
      resources: {
        memory: {
          heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024), // MB
          heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024), // MB
          rss: Math.round(memUsage.rss / 1024 / 1024), // MB
          external: Math.round(memUsage.external / 1024 / 1024), // MB
          arrayBuffers: Math.round(memUsage.arrayBuffers / 1024 / 1024), // MB
          percentage: Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100), // %
        },
        uptime: stats.system.uptime(),
        websocket: {
          connectedClients: clients.size,
        },
      },
    });
  } catch (e) {
    logError(e, { endpoint: "/luna/health" });
    return res.status(500).json({
      ok: false,
      status: "error",
      error: "Health check failed",
    });
  }
});

// ----------------------
// 7) ambient murmur (Luna พึมพำเองเป็นระยะ)
// ----------------------

function scheduleAmbientMurmur() {
  // ⚠️ DISABLED: Ambient murmur เพื่อประหยัด API calls
  // ปิดการใช้งานชั่วคราวเพราะเปลือง token มาก
  // ถ้าต้องการเปิดใช้: เปลี่ยน AMBIENT_MURMUR_ENABLED เป็น true ใน .env
  
  const AMBIENT_MURMUR_ENABLED = process.env.AMBIENT_MURMUR_ENABLED === "true";
  
  if (!AMBIENT_MURMUR_ENABLED) {
    return; // ไม่ทำอะไรเลย
  }
  
  const min = 180000; // 3 นาที
  const max = 300000; // 5 นาที
  const delay = Math.floor(Math.random() * (max - min) + min);

  setTimeout(async () => {
    const modes = ["soft", "passion"];
    const mode = modes[Math.random() < 0.7 ? 0 : 1];
    await ambientMurmur(mode);
    scheduleAmbientMurmur();
  }, delay);
}

// เปิดใช้ ambient murmur เฉพาะเมื่อเปิดใช้งาน
if (process.env.AMBIENT_MURMUR_ENABLED === "true") {
  scheduleAmbientMurmur();
} else {
  console.log("[ambient] Ambient murmur disabled (set AMBIENT_MURMUR_ENABLED=true to enable)");
}

// ----------------------
// 8) API ทดสอบ expression โดยตรง
// ----------------------

app.get("/Luna/expression", async (req, res) => {
  try {
    const emo = (req.query.emo || "").toLowerCase();
    if (!emo) {
      return res.status(400).json({ ok: false, error: "Missing emo parameter" });
    }

    // Use triggerForEmotion so we can pass soft/angry/sleepy/hype/clear
    triggerForEmotion(emo);

    return res.json({ ok: true, emotion: emo });
  } catch (err) {
    console.error("[/Luna/expression] error:", err);
    return res.status(500).json({ ok: false, error: err.message });
  }
});

// Mirror lowercase endpoint
app.get("/luna/expression", async (req, res) => {
  req.url =
    "/Luna/expression" +
    (req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "");
  app._router.handle(req, res, () => {});
});

// ----------------------
// 9) API ตรวจสอบ Parameters ใน VTS
// ----------------------

app.get("/luna/vts/parameters", async (req, res) => {
  try {
    const vts = vtsStatus();
    if (!vts.authenticated) {
      return res.json({
        ok: false,
        error: "VTS not authenticated",
        vts,
      });
    }

    const result = await getVTSParameters();
    
    if (!result.ok) {
      return res.json(result);
    }

    // หา ParamMouthOpen
    const allParams = [
      ...(result.parameters || []),
      ...(result.customParameters || []),
    ];
    
    const mouthParam = allParams.find(
      (p) => p.name === "ParamMouthOpen" || 
             p.name?.toLowerCase().includes("mouth") ||
             p.name?.toLowerCase().includes("open")
    );

    return res.json({
      ok: true,
      expectedParameter: "ParamMouthOpen",
      foundMouthParam: mouthParam ? {
        name: mouthParam.name,
        min: mouthParam.min,
        max: mouthParam.max,
        defaultValue: mouthParam.defaultValue,
      } : null,
      allParameters: allParams.map(p => p.name),
      note: mouthParam 
        ? `Found parameter: ${mouthParam.name} (should be "ParamMouthOpen")`
        : "ParamMouthOpen not found. Please create it in VTube Studio → Parameters",
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message });
  }
});
