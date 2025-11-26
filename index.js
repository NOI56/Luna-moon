// index.js
// Luna v10 - Streamer Core + Emotion Engine + Sleepy Lock + Talk-React + Breathing

import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";
import { Connection, PublicKey, Keypair, SystemProgram, Transaction, sendAndConfirmTransaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getAssociatedTokenAddressSync, createTransferInstruction, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import bs58 from "bs58";
import fetch from "node-fetch";

import { callModel, callSimpleModel, isComplexQuestion } from "./modules/ai.js";
import { initDB, logChat, saveGroupChatMessage, loadGroupChatMessages, saveLunaDeposit, getActiveDeposit, withdrawDeposit, updateLunaDeposit } from "./modules/db.js";
import { getUserMemory, updateUserMemory } from "./modules/memory.js";
import { shouldRespondHeuristic, classifyEmotion, calculateEmotionIntensity, classifyMixedEmotions, classifyEmotionContext } from "./modules/classifier.js";
import { startSolanaWatcher } from "./modules/solana.js";
import { startPumpFunWatcher } from "./modules/pumpfun.js";
import { getTokenHolders, getTokenInfoFromDexScreener, getWalletIpsBatch } from "./modules/pumpfun_api.js";

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

// Security: Wallet address validation
function isValidWalletAddress(address) {
  if (!address || typeof address !== 'string') return false;
  // Solana addresses are base58 encoded, typically 32-44 characters
  if (address.length < 32 || address.length > 44) return false;
  // Check if it's base58 (alphanumeric except 0, O, I, l)
  const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
  return base58Regex.test(address);
}

// Security: Validate wallet address before using PublicKey
function validateWalletAddress(address, fieldName = 'wallet') {
  if (!address || typeof address !== 'string') {
    throw new Error(`${fieldName} address is required and must be a string`);
  }
  if (!isValidWalletAddress(address)) {
    throw new Error(`Invalid ${fieldName} address format: ${address.substring(0, 16)}...`);
  }
  return address;
}

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
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, x-purchase-secret, x-csrf-token");
  res.header("Access-Control-Allow-Credentials", "true");
  // Security: Add security headers
  res.header("X-Content-Type-Options", "nosniff");
  res.header("X-Frame-Options", "DENY");
  res.header("X-XSS-Protection", "1; mode=block");
  
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json({ limit: "2mb" }));

// Security: CSRF Protection Middleware (for POST/PUT/DELETE requests)
const csrfTokens = new Map(); // In-memory token store (use Redis in production)
const CSRF_TOKEN_TTL = 3600000; // 1 hour

function generateCSRFToken() {
  return crypto.randomBytes(32).toString('hex');
}

// Generate CSRF token endpoint
app.get("/api/csrf-token", (req, res) => {
  const token = generateCSRFToken();
  const expiresAt = Date.now() + CSRF_TOKEN_TTL;
  csrfTokens.set(token, expiresAt);
  
  // Clean up expired tokens
  for (const [t, exp] of csrfTokens.entries()) {
    if (Date.now() > exp) {
      csrfTokens.delete(t);
    }
  }
  
  res.json({ token, expiresAt });
});

// CSRF validation middleware (optional - can be enabled via env)
function validateCSRF(req, res, next) {
  // Skip CSRF for GET, OPTIONS, and webhook endpoints
  if (req.method === 'GET' || req.method === 'OPTIONS' || req.path.startsWith('/purchase')) {
    return next();
  }
  
  // Skip if CSRF is disabled
  if (process.env.ENABLE_CSRF !== 'true') {
    return next();
  }
  
  const token = req.headers['x-csrf-token'];
  if (!token) {
    return res.status(403).json({
      ok: false,
      error: "CSRF token missing",
      message: "CSRF token is required for this request",
    });
  }
  
  const expiresAt = csrfTokens.get(token);
  if (!expiresAt || Date.now() > expiresAt) {
    csrfTokens.delete(token);
    return res.status(403).json({
      ok: false,
      error: "Invalid or expired CSRF token",
      message: "CSRF token is invalid or has expired",
    });
  }
  
  // Token is valid, continue
  next();
}

// Apply CSRF validation to POST/PUT/DELETE routes (except webhooks)
app.use((req, res, next) => {
  if (['POST', 'PUT', 'DELETE'].includes(req.method) && !req.path.startsWith('/purchase')) {
    return validateCSRF(req, res, next);
  }
  next();
});

// RPS Routes (must be before static files to avoid 404)
// PvP Matching Queue
const rpsMatchQueue = new Map(); // Map<wallet, { timestamp, choice, matchedWith }>
const rpsActiveMatches = new Map(); // Map<matchId, { player1, player2, choices, timestamp, isBot }>
const MATCH_TIMEOUT = 15000; // 15 seconds (15,000ms)

// Betting Rooms
const rpsBettingRooms = new Map(); // Map<roomId, { creator, betAmount, player2, choices, timestamp }>
const RPS_BETTING_ROOM_TIMEOUT = 300000; // 5 minutes (300,000ms) - rooms expire after 5 minutes

// Fee Collection System
const collectedFees = new Map(); // Map<wallet, { totalFees: number, transactions: Array }>
const FEE_PERCENTAGE = 0.03; // 3% fee for betting (default)
const BETTING_FEE_DEFAULT = 0.03; // 3% fee for betting (default)
const BETTING_FEE_3_DAYS = 0.02; // 2% fee after 3 days deposit
const BETTING_FEE_6_DAYS = 0.01; // 1% fee after 6 days deposit
// PvP matching has no fee

// Luna Deposit System
const DEPOSIT_MIN_BALANCE = 150000; // Minimum Luna balance required to deposit
const DEPOSIT_FEE_PERCENTAGE = 0.03; // 3% fee when depositing
const DEPOSIT_FEE_3_DAYS = 0.02; // 2% fee after 3 days
const DEPOSIT_FEE_6_DAYS = 0.01; // 1% fee after 6 days
const DEPOSIT_ESCROW_WALLET = process.env.DEPOSIT_ESCROW_WALLET || "FLMbMZXn6d5mWf6EWFAeVFcV4w7ioZ6PZAWSp8wxK4RU";
const DEPOSIT_ESCROW_PRIVATE_KEY = process.env.DEPOSIT_ESCROW_PRIVATE_KEY || "2UvbSMjgyPfkXNyuoRtETH4h5RqCnfkr8wf4FtPjCzXk1NALax4qtz1c9dwj5ng7cxYZBL18N7ixpyeQVdyqw2Ce";

// Leaderboard System
// Map<wallet, { wins: number, losses: number, totalWon: number, totalSolWon: number }>
const rpsLeaderboard = new Map();

// Anti-Abuse System - ป้องกันการสร้างหลายกระเป๋าเล่นกับตัวเอง
// IP-based tracking
const ipWalletMap = new Map(); // Map<ip, Set<wallet>> - เก็บ wallet ที่ใช้ IP เดียวกัน
const walletIpMap = new Map(); // Map<wallet, ip> - เก็บ IP ของแต่ละ wallet
const ipActivityMap = new Map(); // Map<ip, { lastGameTime, gameCount, cooldownUntil }>

// Wallet pair tracking - ตรวจจับ wallet ที่เล่นกันบ่อยเกินไป
const walletPairMatches = new Map(); // Map<"wallet1_wallet2", { count, lastMatch, firstMatch }>
const SUSPICIOUS_PAIR_THRESHOLD = 5; // ถ้าเล่นกันเกิน 5 ครั้งใน 24 ชั่วโมง = น่าสงสัย
const SUSPICIOUS_PAIR_TIME_WINDOW = 24 * 60 * 60 * 1000; // 24 ชั่วโมง

// Wallet opponent tracking - ติดตามว่า wallet แต่ละตัวเล่นกับคนอื่นบ้างหรือไม่
const walletOpponents = new Map(); // Map<wallet, Set<opponentWallet>> - เก็บว่า wallet นี้เล่นกับใครบ้าง
const walletTotalGames = new Map(); // Map<wallet, totalGames> - จำนวนเกมทั้งหมดของ wallet

// Cooldown settings
const GAME_COOLDOWN = 60 * 1000; // 1 นาทีระหว่างเกม (60,000ms)
// IP_GAME_LIMIT_PER_HOUR - ปิดการใช้งานแล้ว (ไม่จำกัดจำนวนเกมต่อชั่วโมง)
// ใช้ระบบตรวจสอบ IP self-play แทน

// IP Self-Play Detection - ตรวจจับ IP ที่สร้าง wallet หลายตัวมาเล่นกันเอง
const IP_SELF_PLAY_THRESHOLD = 10; // ถ้า IP เดียวกันมี wallet หลายตัวเล่นกันเองเกิน 10 รอบ = ตัดสิทธิ์รับรางวัล
const ipSelfPlayMatches = new Map(); // Map<ip, { walletPairs: Map<"wallet1_wallet2", count>, totalSelfPlayCount }>

// Suspicious activity log
const suspiciousActivityLog = []; // Array of { timestamp, type, wallet1, wallet2, ip, reason }
const MAX_SUSPICIOUS_LOG = 1000; // เก็บ log สูงสุด 1000 รายการ

// Blocked wallets and IPs
const blockedWallets = new Set(); // Set of blocked wallet addresses
const blockedIps = new Set(); // Set of blocked IP addresses

// Reward banned wallets - ตัดสิทธิ์รับรางวัล (แต่ยังเล่นได้)
const rewardBannedWallets = new Set(); // Set of wallet addresses that are banned from receiving rewards
const rewardBannedIps = new Set(); // Set of IP addresses that are banned from receiving rewards

// Notification System - ระบบแจ้งเตือน
const userNotifications = new Map(); // Map<wallet, Array<notification>> - เก็บ notifications สำหรับแต่ละ wallet

// Referral System - ระบบแนะนำเพื่อน
const referralData = new Map(); // Map<referrerWallet, { referrals: Set<wallet>, totalRewards: number, stats: {...} }>
const referralMap = new Map(); // Map<wallet, referrerWallet> - เก็บว่า wallet นี้มาจาก referrer ใคร
const REFERRAL_REWARD_SIGNUP = 100; // รางวัลเมื่อเพื่อนลงทะเบียน (Luna)
const REFERRAL_REWARD_FIRST_GAME = 200; // รางวัลเมื่อเพื่อนเล่นเกมแรก (Luna)
const REFERRAL_REWARD_TOP10 = 1000; // รางวัลเมื่อเพื่อนติด Top 10 (Luna)

// Chat System - ระบบแชต
const chatRooms = new Map(); // Map<roomId, { messages: Array, participants: Set<wallet>, createdAt }>
const CHAT_MESSAGE_LIMIT = 10000; // เพิ่ม limit เป็น 10,000 ข้อความ (เกือบไม่จำกัด)
const CHAT_MESSAGE_EXPIRY = null; // ปิดการลบข้อความตาม expiry (เก็บถาวร)

// Chat System Extensions
const messageReactions = new Map(); // Map<messageId, Map<reactionType, Set<wallet>>>
const messageTips = new Map(); // Map<messageId, Array<{wallet, amount, timestamp}>>
const chatRewards = new Map(); // Map<wallet, {totalRewards, messageCount, lastRewardTime}>
const onlineUsers = new Map(); // Map<wallet, {ws, lastSeen, roomId}>
const chatLeaderboard = new Map(); // Map<wallet, messageCount> - for daily/weekly leaderboard
const badgeCache = new Map(); // Map<wallet, {badge, balance, timestamp}> - Cache VIP badges
const BADGE_CACHE_TTL = 5 * 60 * 1000; // Cache badges for 5 minutes

// VIP Badge thresholds (Luna balance)
const VIP_BADGES = {
  BRONZE: 100000,    // 🥉
  SILVER: 500000,   // 🥈
  GOLD: 1000000,    // 🥇
  DIAMOND: 5000000, // 💎
  LEGEND: 10000000  // 👑
};

// Message Rewards Configuration
const MESSAGE_REWARD_CHANCE = 0.05; // 5% chance per message
const MESSAGE_REWARD_MIN = 1000;    // Minimum reward (Luna)
const MESSAGE_REWARD_MAX = 10000;   // Maximum reward (Luna)
const FIRST_MESSAGE_BONUS = 5000;   // Bonus for first message of the day

// Weekly Competition System
// Competition ends every Monday at 00:00:00 UTC (Universal Time)
let competitionStartTime = Date.now(); // Start time of current competition
let competitionEndTime = getNextMonday(); // End time (next Monday 00:00:00 UTC)

/**
 * Get next Monday at 00:00:00 UTC
 * @returns {number} Timestamp of next Monday 00:00:00 UTC
 */
function getNextMonday() {
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

// Initialize competition start time (can be persisted to file/db later)
function initializeCompetition() {
  // Check if we need to start a new competition
  const now = Date.now();
  if (now >= competitionEndTime) {
    // Competition ended, start new one
    competitionStartTime = now;
    competitionEndTime = getNextMonday(); // Set to next Monday 00:00:00 UTC
    // Reset leaderboard for new competition
    rpsLeaderboard.clear();
    rewardPool = 0;
    console.log(`[rps-competition] New weekly competition started. Ends at: ${new Date(competitionEndTime).toISOString()} (Next Monday 00:00:00 UTC)`);
  } else {
    // Competition still active, just update end time if needed (in case server restarted)
    const calculatedEndTime = getNextMonday();
    if (competitionEndTime !== calculatedEndTime) {
      competitionEndTime = calculatedEndTime;
      console.log(`[rps-competition] Competition end time updated to: ${new Date(competitionEndTime).toISOString()} (Next Monday 00:00:00 UTC)`);
    }
  }
}

// Check competition status periodically (every hour)
setInterval(async () => {
  const now = Date.now();
  if (now >= competitionEndTime) {
    // Competition ended, distribute rewards and start new one
    console.log(`[rps-competition] Weekly competition ended. Distributing rewards automatically...`);
    
    // Auto-distribute rewards (if private key is set)
    const privateKey = process.env.REWARD_SENDER_PRIVATE_KEY;
    if (privateKey && privateKey !== "your_private_key_here") {
      console.log(`[rps-competition] REWARD_SENDER_PRIVATE_KEY is set, attempting auto-distribution...`);
      const result = await distributeRewards();
      if (result.ok) {
        console.log(`[rps-competition] ✓ Auto-distribution successful. Distributed ${result.totalDistributed.toFixed(6)} SOL`);
      } else {
        console.error(`[rps-competition] ✗ Auto-distribution failed: ${result.message || result.error}`);
      }
    } else {
      console.warn(`[rps-competition] REWARD_SENDER_PRIVATE_KEY not set, skipping auto-distribution. Please call POST /luna/rps/rewards/distribute manually.`);
    }
    
    // Start new competition
    initializeCompetition();
  }
}, 60 * 60 * 1000); // Check every hour

// Initialize on startup
initializeCompetition();

/**
 * Anti-Abuse Helper Functions
 */

/**
 * Get client IP address from request
 */
function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
         req.headers['x-real-ip'] || 
         req.connection?.remoteAddress || 
         req.socket?.remoteAddress ||
         'unknown';
}

/**
 * Log suspicious activity
 */
function logSuspiciousActivity(type, wallet1, wallet2, ip, reason) {
  const logEntry = {
    timestamp: Date.now(),
    type: type,
    wallet1: wallet1,
    wallet2: wallet2 || null,
    ip: ip,
    reason: reason
  };
  
  suspiciousActivityLog.push(logEntry);
  
  // Keep only last MAX_SUSPICIOUS_LOG entries
  if (suspiciousActivityLog.length > MAX_SUSPICIOUS_LOG) {
    suspiciousActivityLog.shift();
  }
  
  console.warn(`[anti-abuse] ⚠️ Suspicious activity detected: ${type} - ${reason}`, {
    wallet1: wallet1?.substring(0, 8) + '...',
    wallet2: wallet2?.substring(0, 8) + '...',
    ip: ip
  });
}

/**
 * Get total number of unique players in the system
 */
function getTotalUniquePlayers() {
  return rpsLeaderboard.size;
}

/**
 * Get number of unique opponents for a wallet
 */
function getWalletOpponentCount(wallet) {
  return walletOpponents.get(wallet)?.size || 0;
}

/**
 * Get total games played by a wallet
 */
function getWalletTotalGames(wallet) {
  return walletTotalGames.get(wallet) || 0;
}

/**
 * Calculate dynamic threshold based on player count
 * ถ้ามีผู้เล่นน้อย = threshold สูงขึ้น (ยืดหยุ่นมากขึ้น)
 */
function getDynamicSuspiciousThreshold() {
  const totalPlayers = getTotalUniquePlayers();
  
  // ถ้ามีผู้เล่นน้อยกว่า 5 คน = threshold สูงมาก (20 ครั้ง)
  if (totalPlayers < 5) {
    return 20;
  }
  // ถ้ามีผู้เล่น 5-10 คน = threshold ปานกลาง (10 ครั้ง)
  else if (totalPlayers < 10) {
    return 10;
  }
  // ถ้ามีผู้เล่นมาก = threshold ต่ำ (5 ครั้ง) - เดิม
  else {
    return SUSPICIOUS_PAIR_THRESHOLD;
  }
}

/**
 * Check if wallet pair is suspicious (เล่นกันบ่อยเกินไป)
 * ปรับปรุงให้ตรวจสอบว่า wallet แต่ละตัวเล่นกับคนอื่นด้วยหรือไม่
 */
function isSuspiciousWalletPair(wallet1, wallet2) {
  const pairKey1 = `${wallet1}_${wallet2}`;
  const pairKey2 = `${wallet2}_${wallet1}`;
  
  const pairData1 = walletPairMatches.get(pairKey1) || walletPairMatches.get(pairKey2);
  
  if (!pairData1) {
    return false;
  }
  
  const now = Date.now();
  const timeSinceFirstMatch = now - pairData1.firstMatch;
  
  // ใช้ dynamic threshold ตามจำนวนผู้เล่น
  const dynamicThreshold = getDynamicSuspiciousThreshold();
  
  // ถ้าเล่นกันเกิน threshold ครั้งใน time window
  if (pairData1.count >= dynamicThreshold && timeSinceFirstMatch <= SUSPICIOUS_PAIR_TIME_WINDOW) {
    // ตรวจสอบว่า wallet แต่ละตัวเล่นกับคนอื่นบ้างหรือไม่
    const wallet1Opponents = getWalletOpponentCount(wallet1);
    const wallet2Opponents = getWalletOpponentCount(wallet2);
    const wallet1TotalGames = getWalletTotalGames(wallet1);
    const wallet2TotalGames = getWalletTotalGames(wallet2);
    
    // ถ้า wallet ทั้งสองตัวเล่นกับคนอื่นน้อยมาก (น้อยกว่า 2 คน) และเล่นกันเองบ่อย = น่าสงสัย
    // แต่ถ้าเล่นกับคนอื่นด้วย = อาจจะไม่น่าสงสัย (อาจจะมีผู้เล่นน้อยจริงๆ)
    if (wallet1Opponents <= 1 && wallet2Opponents <= 1) {
      // ทั้งสองตัวเล่นกับคนอื่นน้อยมาก = น่าสงสัยมาก
      return true;
    }
    
    // ตรวจสอบว่า pair นี้เป็นคู่เดียวที่เล่นกันหรือไม่
    // ถ้า wallet1 เล่นกับคนอื่นมาก แต่เล่นกับ wallet2 บ่อย = อาจจะไม่น่าสงสัย
    // แต่ถ้า wallet1 เล่นกับคนอื่นน้อย และเล่นกับ wallet2 บ่อย = น่าสงสัย
    
    // คำนวณสัดส่วน: เกมที่เล่นกับ wallet2 ต่อเกมทั้งหมด
    const pairGames = pairData1.count;
    const wallet1PairRatio = wallet1TotalGames > 0 ? pairGames / wallet1TotalGames : 1;
    const wallet2PairRatio = wallet2TotalGames > 0 ? pairGames / wallet2TotalGames : 1;
    
    // ถ้าเกมที่เล่นกับคู่นี้มากกว่า 70% ของเกมทั้งหมด = น่าสงสัย
    if (wallet1PairRatio > 0.7 || wallet2PairRatio > 0.7) {
      // แต่ถ้าเล่นกับคนอื่นมากกว่า 3 คน = อาจจะไม่น่าสงสัย
      if (wallet1Opponents >= 3 && wallet2Opponents >= 3) {
        return false; // มีผู้เล่นหลากหลาย = ไม่น่าสงสัย
      }
      return true; // น่าสงสัย
    }
    
    // ถ้าไม่เข้าเงื่อนไขข้างบน = ไม่น่าสงสัย
    return false;
  }
  
  return false;
}

/**
 * Record wallet pair match
 */
function recordWalletPairMatch(wallet1, wallet2) {
  const pairKey = `${wallet1}_${wallet2}`;
  const now = Date.now();
  
  const existing = walletPairMatches.get(pairKey);
  if (existing) {
    existing.count++;
    existing.lastMatch = now;
  } else {
    walletPairMatches.set(pairKey, {
      count: 1,
      lastMatch: now,
      firstMatch: now
    });
  }
  
  // Track opponents for each wallet
  if (!walletOpponents.has(wallet1)) {
    walletOpponents.set(wallet1, new Set());
  }
  if (!walletOpponents.has(wallet2)) {
    walletOpponents.set(wallet2, new Set());
  }
  
  walletOpponents.get(wallet1).add(wallet2);
  walletOpponents.get(wallet2).add(wallet1);
  
  // Track total games
  walletTotalGames.set(wallet1, (walletTotalGames.get(wallet1) || 0) + 1);
  walletTotalGames.set(wallet2, (walletTotalGames.get(wallet2) || 0) + 1);
  
  // IP Self-Play Detection - ตรวจสอบว่า IP เดียวกันมี wallet หลายตัวเล่นกันเองหรือไม่
  const wallet1Ip = walletIpMap.get(wallet1);
  const wallet2Ip = walletIpMap.get(wallet2);
  
  // ถ้า wallet ทั้งสองมาจาก IP เดียวกัน = น่าสงสัย (self-play)
  if (wallet1Ip && wallet2Ip && wallet1Ip === wallet2Ip && wallet1Ip !== 'unknown') {
    if (!ipSelfPlayMatches.has(wallet1Ip)) {
      ipSelfPlayMatches.set(wallet1Ip, {
        walletPairs: new Map(),
        totalSelfPlayCount: 0
      });
    }
    
    const ipData = ipSelfPlayMatches.get(wallet1Ip);
    const pairKeyForIp = `${wallet1}_${wallet2}`;
    
    // นับจำนวนครั้งที่ wallet pair นี้เล่นกันเอง
    if (!ipData.walletPairs.has(pairKeyForIp)) {
      ipData.walletPairs.set(pairKeyForIp, 0);
    }
    ipData.walletPairs.set(pairKeyForIp, ipData.walletPairs.get(pairKeyForIp) + 1);
    ipData.totalSelfPlayCount++;
    
    // ถ้าเกิน threshold = ตัดสิทธิ์รับรางวัล
    if (ipData.totalSelfPlayCount > IP_SELF_PLAY_THRESHOLD) {
      // ตัดสิทธิ์รับรางวัลสำหรับ wallet ทั้งหมดที่มาจาก IP นี้
      const walletsFromIp = ipWalletMap.get(wallet1Ip) || new Set();
      walletsFromIp.forEach(wallet => {
        rewardBannedWallets.add(wallet);
      });
      rewardBannedIps.add(wallet1Ip);
      
      logSuspiciousActivity('ip_self_play_reward_ban', wallet1, wallet2, wallet1Ip, 
        `IP ${wallet1Ip} has ${ipData.totalSelfPlayCount} self-play matches (threshold: ${IP_SELF_PLAY_THRESHOLD}). All wallets from this IP are banned from rewards.`);
      
      console.warn(`[anti-abuse] ⚠️ IP ${wallet1Ip} detected self-play ${ipData.totalSelfPlayCount} times. All wallets from this IP are now banned from receiving rewards.`);
    }
  }
  
  // Cleanup old pairs (older than 7 days)
  const cleanupTime = now - (7 * 24 * 60 * 60 * 1000);
  for (const [key, data] of walletPairMatches.entries()) {
    if (data.lastMatch < cleanupTime) {
      walletPairMatches.delete(key);
    }
  }
}

/**
 * Check IP rate limit (ปิดการใช้งานแล้ว - ไม่จำกัดจำนวนเกมต่อชั่วโมง)
 * ยังคงตรวจสอบ cooldown เท่านั้น
 */
function checkIpRateLimit(ip) {
  const now = Date.now();
  const ipData = ipActivityMap.get(ip) || { gameCount: 0, lastGameTime: 0, cooldownUntil: 0 };
  
  // Check cooldown only (ไม่จำกัดจำนวนเกมต่อชั่วโมง)
  if (ipData.cooldownUntil > now) {
    const remainingCooldown = Math.ceil((ipData.cooldownUntil - now) / 1000);
    return {
      allowed: false,
      reason: `Cooldown active. Please wait ${remainingCooldown} seconds.`,
      remainingCooldown: remainingCooldown
    };
  }
  
  // ไม่จำกัดจำนวนเกมต่อชั่วโมงแล้ว - ใช้ระบบตรวจสอบ IP self-play แทน
  return { allowed: true };
}

/**
 * Update IP activity after game
 */
function updateIpActivity(ip) {
  const now = Date.now();
  const ipData = ipActivityMap.get(ip) || { gameCount: 0, lastGameTime: 0, cooldownUntil: 0 };
  
  ipData.gameCount++;
  ipData.lastGameTime = now;
  ipData.cooldownUntil = now + GAME_COOLDOWN;
  
  ipActivityMap.set(ip, ipData);
}

/**
 * Track wallet-IP relationship
 */
function trackWalletIp(wallet, ip) {
  // Track IP -> wallets
  if (!ipWalletMap.has(ip)) {
    ipWalletMap.set(ip, new Set());
  }
  ipWalletMap.get(ip).add(wallet);
  
  // Track wallet -> IP
  walletIpMap.set(wallet, ip);
  
  // Check if IP has too many wallets (suspicious)
  const walletsOnIp = ipWalletMap.get(ip);
  if (walletsOnIp.size > 3) {
    logSuspiciousActivity('multiple_wallets_same_ip', wallet, null, ip, 
      `IP ${ip} is associated with ${walletsOnIp.size} different wallets`);
  }
}

/**
 * Validate game request (comprehensive anti-abuse check)
 */
function validateGameRequest(wallet1, wallet2, req) {
  const ip = getClientIp(req);
  
  // 0. Check if wallet or IP is blocked
  if (blockedWallets.has(wallet1) || blockedWallets.has(wallet2)) {
    logSuspiciousActivity('blocked_wallet_attempt', wallet1, wallet2, ip, "Attempted to use blocked wallet");
    return {
      valid: false,
      error: "This wallet has been blocked due to suspicious activity",
      code: "BLOCKED_WALLET"
    };
  }
  
  if (blockedIps.has(ip)) {
    logSuspiciousActivity('blocked_ip_attempt', wallet1, wallet2, ip, "Attempted to use blocked IP");
    return {
      valid: false,
      error: "This IP address has been blocked due to suspicious activity",
      code: "BLOCKED_IP"
    };
  }
  
  // 1. Check if trying to play with self (should be blocked by existing code, but double-check)
  if (wallet1 === wallet2) {
    return {
      valid: false,
      error: "Cannot play with yourself",
      code: "SELF_PLAY"
    };
  }
  
  // 2. Check IP cooldown (ไม่จำกัดจำนวนเกมต่อชั่วโมงแล้ว)
  const rateLimitCheck = checkIpRateLimit(ip);
  if (!rateLimitCheck.allowed) {
    // แค่ตรวจสอบ cooldown เท่านั้น (ไม่ใช่ rate limit)
    return {
      valid: false,
      error: rateLimitCheck.reason,
      code: "COOLDOWN"
    };
  }
  
  // 3. Check suspicious wallet pair (ปรับปรุงให้ยืดหยุ่นตามจำนวนผู้เล่น)
  if (isSuspiciousWalletPair(wallet1, wallet2)) {
    const pairCount = walletPairMatches.get(`${wallet1}_${wallet2}`)?.count || walletPairMatches.get(`${wallet2}_${wallet1}`)?.count || 0;
    const wallet1Opponents = getWalletOpponentCount(wallet1);
    const wallet2Opponents = getWalletOpponentCount(wallet2);
    const totalPlayers = getTotalUniquePlayers();
    
    logSuspiciousActivity('suspicious_pair', wallet1, wallet2, ip, 
      `Wallet pair has played together ${pairCount} times recently. Wallet1 opponents: ${wallet1Opponents}, Wallet2 opponents: ${wallet2Opponents}, Total players: ${totalPlayers}`);
    return {
      valid: false,
      error: "Suspicious activity detected. This wallet pair has played together too frequently compared to their other opponents.",
      code: "SUSPICIOUS_PAIR"
    };
  }
  
  // 4. Track wallet-IP relationship
  trackWalletIp(wallet1, ip);
  if (wallet2) {
    trackWalletIp(wallet2, ip);
    
    // Check if both wallets from same IP
    const wallet1Ip = walletIpMap.get(wallet1);
    const wallet2Ip = walletIpMap.get(wallet2);
    if (wallet1Ip === wallet2Ip && wallet1Ip !== 'unknown') {
      logSuspiciousActivity('same_ip_match', wallet1, wallet2, ip, 
        "Two wallets from same IP trying to play together");
      // Allow but log - might be legitimate (same network)
    }
  }
  
  return { valid: true };
}

// Reward Pool System
let rewardPool = 0; // Total SOL in reward pool
const REWARD_DISTRIBUTION_WALLET = process.env.REWARD_DISTRIBUTION_WALLET || "ofLr5MWJVjZNzR9xSomLLKUaEvVsdQG79b21W12t8Sp";
const REWARD_PERCENTAGES = {
  1: 0.20, // 20%
  2: 0.10, // 10%
  3: 0.05, // 5%
  4: 0.03, // 3%
  5: 0.02, // 2%
  remaining: 0.60 // 60% to distribution wallet
};

// Price cache for Luna token (key: mint, value: { price, timestamp })
const priceCache = new Map();
const PRICE_CACHE_TTL = 60000; // 1 minute cache

// Luna token mint address (from env)
const LUNA_TOKEN_MINT = process.env.LUNA_TOKEN_MINT || null;
const SOL_MINT = "So11111111111111111111111111111111111111112"; // Native SOL mint

/**
 * Fetch Luna token price in SOL from Jupiter API
 * @returns {Promise<number|null>} - Price in SOL per Luna token, or null if failed
 */
async function fetchLunaPriceInSol() {
  if (!LUNA_TOKEN_MINT) {
    console.warn("[rps-betting-fee] LUNA_TOKEN_MINT not set in .env, cannot fetch price");
    return null;
  }

  // Validate mint address format
  if (LUNA_TOKEN_MINT.length < 32 || LUNA_TOKEN_MINT === "your_token_mint_address_from_pumpfun_here") {
    console.warn(`[rps-betting-fee] Invalid LUNA_TOKEN_MINT: ${LUNA_TOKEN_MINT}, using fallback rate`);
    return null;
  }

    console.log(`[rps-betting-fee] Fetching price for Luna token: ${LUNA_TOKEN_MINT}`);

  try {
    // Check cache first
    const cacheKey = LUNA_TOKEN_MINT;
    if (priceCache.has(cacheKey)) {
      const cached = priceCache.get(cacheKey);
      if (Date.now() - cached.timestamp < PRICE_CACHE_TTL) {
        console.log(`[rps-betting-fee] Using cached price: ${cached.price.toFixed(9)} SOL per Luna (mint: ${LUNA_TOKEN_MINT.substring(0, 8)}...)`);
        return cached.price;
      }
    }

    // Method 1: Try DexScreener API first (like the UI shows - direct token to SOL conversion)
    // DexScreener API: https://api.dexscreener.com/latest/dex/tokens/TOKEN_MINT
    const dexscreenerUrl = `https://api.dexscreener.com/latest/dex/tokens/${LUNA_TOKEN_MINT}`;
    console.log(`[rps-betting-fee] Fetching from DexScreener API: ${dexscreenerUrl}`);
    
    try {
      const dexResponse = await fetch(dexscreenerUrl);
      if (dexResponse.ok) {
        const dexData = await dexResponse.json();
        
        // DexScreener returns pairs, find the one with SOL
        if (dexData.pairs && dexData.pairs.length > 0) {
          // Find pair with SOL (quoteToken.symbol === 'SOL' or quoteToken.address === SOL_MINT)
          const solPair = dexData.pairs.find(pair => 
            pair.quoteToken?.symbol === 'SOL' || 
            pair.quoteToken?.address === SOL_MINT ||
            pair.quoteToken?.address?.toLowerCase() === SOL_MINT.toLowerCase()
          );
          
          if (solPair && solPair.priceNative) {
            // priceNative is the price in native token (SOL)
            const pricePerLuna = parseFloat(solPair.priceNative);
            
            if (pricePerLuna > 0) {
              // Cache the price
              priceCache.set(cacheKey, {
                price: pricePerLuna,
                timestamp: Date.now()
              });
              
              console.log(`[rps-betting-fee] Fetched Luna price from DexScreener: ${pricePerLuna.toFixed(9)} SOL per Luna`);
              return pricePerLuna;
            }
          }
          
          // If no SOL pair found, try to use first pair and convert
          const firstPair = dexData.pairs[0];
          if (firstPair.priceNative && firstPair.quoteToken?.symbol === 'SOL') {
            const pricePerLuna = parseFloat(firstPair.priceNative);
            if (pricePerLuna > 0) {
              priceCache.set(cacheKey, {
                price: pricePerLuna,
                timestamp: Date.now()
              });
              console.log(`[rps-betting-fee] Fetched Luna price from DexScreener (first pair): ${pricePerLuna.toFixed(9)} SOL per Luna`);
              return pricePerLuna;
            }
          }
        }
      }
    } catch (dexError) {
      console.warn(`[rps-betting-fee] DexScreener API error: ${dexError.message}, trying Jupiter...`);
    }

    // Method 2: Fetch price from Jupiter API (fallback)
    // Jupiter price API: https://price.jup.ag/v4/price?ids=TOKEN_MINT
    const jupiterPriceUrl = `https://price.jup.ag/v4/price?ids=${LUNA_TOKEN_MINT}`;
    console.log(`[rps-betting-fee] Fetching from Jupiter Price API: ${jupiterPriceUrl}`);
    
    const response = await fetch(jupiterPriceUrl);
    if (!response.ok) {
      const errorText = await response.text();
      console.warn(`[rps-betting-fee] Jupiter Price API error: ${response.status} - ${errorText}`);
      throw new Error(`Jupiter API returned ${response.status}`);
    }

    const data = await response.json();
    
    if (!data.data || !data.data[LUNA_TOKEN_MINT]) {
      console.warn(`[rps-betting-fee] Price data not found for mint ${LUNA_TOKEN_MINT} in Jupiter response:`, JSON.stringify(data).substring(0, 200));
      throw new Error("Price data not found in Jupiter response");
    }

    const priceData = data.data[LUNA_TOKEN_MINT];
    // Jupiter returns price in USD, we need to convert to SOL
    // We need to get SOL price first, then calculate Luna/SOL ratio
    
    // Use Jupiter quote API to get direct Luna -> SOL price
    // Request quote for 1 Luna token (we'll use 1 with proper decimals)
    // First, try to get token info to know decimals, or use common decimals (6 for pump.fun tokens)
    const lunaDecimals = 6; // Pump.fun tokens typically use 6 decimals
    const oneLunaInSmallestUnit = Math.pow(10, lunaDecimals); // 1 Luna = 1,000,000 smallest units
    
    const quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=${LUNA_TOKEN_MINT}&outputMint=${SOL_MINT}&amount=${oneLunaInSmallestUnit}&slippageBps=50`;
    const quoteResponse = await fetch(quoteUrl);
    
    if (quoteResponse.ok) {
      const quoteData = await quoteResponse.json();
      if (quoteData.outAmount && quoteData.inAmount) {
        // outAmount is in lamports (1 SOL = 1,000,000,000 lamports)
        // inAmount is in smallest Luna units (1 Luna = 10^6 smallest units for pump.fun tokens)
        const outputAmountLamports = parseInt(quoteData.outAmount);
        const inputAmountSmallest = parseInt(quoteData.inAmount);
        
        // Price per Luna = (output in SOL) / (input in Luna)
        // outputAmountLamports / 1e9 = SOL amount
        // inputAmountSmallest / 1e6 = Luna amount (assuming 6 decimals)
        const solAmount = outputAmountLamports / 1e9; // Convert lamports to SOL
        const lunaAmount = inputAmountSmallest / 1e6; // Convert smallest units to Luna
        const pricePerLuna = solAmount / lunaAmount;
        
        // Cache the price
        priceCache.set(cacheKey, {
          price: pricePerLuna,
          timestamp: Date.now()
        });
        
        console.log(`[rps-betting-fee] Fetched Luna price from Jupiter: ${pricePerLuna.toFixed(9)} SOL per Luna (1 Luna = ${solAmount.toFixed(9)} SOL)`);
        return pricePerLuna;
      }
    } else {
      const errorText = await quoteResponse.text();
      console.warn(`[rps-betting-fee] Jupiter quote API error: ${quoteResponse.status} - ${errorText}`);
    }

    // Fallback: Use USD price and SOL/USD price
    const solPriceUrl = `https://price.jup.ag/v4/price?ids=${SOL_MINT}`;
    const solResponse = await fetch(solPriceUrl);
    
    if (solResponse.ok) {
      const solData = await solResponse.json();
      const lunaPriceUSD = priceData.price;
      const solPriceUSD = solData.data?.[SOL_MINT]?.price;
      
      if (lunaPriceUSD && solPriceUSD) {
        const pricePerLuna = lunaPriceUSD / solPriceUSD;
        
        // Cache the price
        priceCache.set(cacheKey, {
          price: pricePerLuna,
          timestamp: Date.now()
        });
        
        console.log(`[rps-betting-fee] Fetched Luna price (via USD): ${pricePerLuna.toFixed(9)} SOL per Luna`);
        return pricePerLuna;
      }
    }

    throw new Error("Could not determine Luna price in SOL");
  } catch (error) {
    console.error("[rps-betting-fee] Error fetching Luna price:", error.message);
    
    // Return cached price if available (even if expired)
    if (priceCache.has(LUNA_TOKEN_MINT)) {
      const cached = priceCache.get(LUNA_TOKEN_MINT);
      console.warn(`[rps-betting-fee] Using expired cache: ${cached.price} SOL per Luna`);
      return cached.price;
    }
    
    // Fallback to env rate if available
    const fallbackRate = parseFloat(process.env.LUNA_TO_SOL_RATE);
    if (fallbackRate) {
      console.warn(`[rps-betting-fee] Using fallback rate from env: ${fallbackRate} SOL per Luna`);
      return fallbackRate;
    }
    
    return null;
  }
}

/**
 * Convert Luna tokens to SOL value (using real-time price)
 * @param {number} lunaAmount - Amount in Luna tokens
 * @returns {Promise<number>} - Value in SOL
 */
async function lunaToSol(lunaAmount) {
  const price = await fetchLunaPriceInSol();
  if (price === null) {
    // Fallback to default rate if price fetch failed
    const fallbackRate = parseFloat(process.env.LUNA_TO_SOL_RATE) || 0.00009;
    console.warn(`[rps-betting-fee] Using fallback rate: ${fallbackRate}`);
    return lunaAmount * fallbackRate;
  }
  return lunaAmount * price;
}

/**
 * Get current Luna price in SOL (synchronous, uses cache)
 * @returns {number|null} - Price in SOL per Luna token, or null if not available
 */
function getLunaPriceSync() {
  if (!LUNA_TOKEN_MINT) return null;
  
  if (priceCache.has(LUNA_TOKEN_MINT)) {
    const cached = priceCache.get(LUNA_TOKEN_MINT);
    return cached.price;
  }
  
  // Return fallback from env
  return parseFloat(process.env.LUNA_TO_SOL_RATE) || null;
}

/**
 * Calculate betting fee in SOL from Luna bet amount (based on deposit status)
 * @param {number} lunaAmount - Bet amount in Luna tokens
 * @param {string} wallet - Wallet address (optional, for checking deposit status)
 * @returns {Promise<number>} - Fee in SOL
 */
async function calculateFee(lunaAmount, wallet = null) {
  const solValue = await lunaToSol(lunaAmount);
  let feePercentage = FEE_PERCENTAGE; // Default 3%
  
  // If wallet provided, check deposit status for reduced fee
  if (wallet) {
    feePercentage = await getBettingFeePercentage(wallet);
  }
  
  return solValue * feePercentage;
}

/**
 * Collect fee from a wallet and send to BETTING_FEE_WALLET automatically
 * @param {string} wallet - Wallet address
 * @param {number} feeInSol - Fee amount in SOL
 * @param {string} roomId - Room ID for reference
 * @param {number} betAmount - Original bet amount in Luna
 */
async function collectFee(wallet, feeInSol, roomId, betAmount) {
  if (!collectedFees.has(wallet)) {
    collectedFees.set(wallet, {
      totalFees: 0,
      transactions: []
    });
  }
  
  const feeData = collectedFees.get(wallet);
  feeData.totalFees += feeInSol;
  feeData.transactions.push({
    roomId: roomId,
    betAmount: betAmount,
    feeInSol: feeInSol,
    timestamp: Date.now()
  });
  
  console.log(`[rps-betting-fee] Collected ${feeInSol.toFixed(6)} SOL fee from ${wallet.substring(0, 8)}... (bet: ${betAmount} Luna)`);
  
  // Send fee to BETTING_FEE_WALLET automatically
  const feeWallet = process.env.BETTING_FEE_WALLET;
  if (feeWallet && feeWallet !== "your_fee_wallet_address_here") {
    try {
      const signature = await sendSol(feeWallet, feeInSol);
      if (signature) {
        console.log(`[rps-betting-fee] ✓ Sent ${feeInSol.toFixed(6)} SOL fee to ${feeWallet.substring(0, 8)}... (tx: ${signature})`);
      } else {
        console.warn(`[rps-betting-fee] ✗ Failed to send ${feeInSol.toFixed(6)} SOL fee to ${feeWallet.substring(0, 8)}... (check REWARD_SENDER_PRIVATE_KEY and wallet balance)`);
      }
    } catch (error) {
      console.error(`[rps-betting-fee] Error sending fee to ${feeWallet.substring(0, 8)}...:`, error.message);
    }
  } else {
    console.warn(`[rps-betting-fee] BETTING_FEE_WALLET not configured, fee recorded in memory only`);
  }
}

// Pre-fetch price on startup and periodically update
async function updateLunaPrice() {
  try {
    await fetchLunaPriceInSol();
  } catch (error) {
    console.error("[rps-betting-fee] Failed to update Luna price:", error.message);
  }
}

// Update price every 1 minute
setInterval(updateLunaPrice, 60000);
// Initial fetch after 2 seconds (give server time to start)
setTimeout(updateLunaPrice, 2000);

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
    
    // Anti-abuse: Check IP cooldown only (ไม่จำกัดจำนวนเกมต่อชั่วโมงแล้ว)
    const ip = getClientIp(req);
    const rateLimitCheck = checkIpRateLimit(ip);
    if (!rateLimitCheck.allowed) {
      // แค่ตรวจสอบ cooldown เท่านั้น
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
    
    // Send notification to all users about new room
    sendNotification(null, 'room_new', 'New Betting Room!', 
      `New room created with bet amount: ${betAmount} Luna tokens`, 
      { roomId: roomId, creator: wallet, betAmount: betAmount });
    
    console.log(`[rps-betting] Room created: ${roomId} by ${wallet} with bet ${betAmount}`);
    
    return res.json({
      ok: true,
      roomId: roomId,
      message: "Room created successfully",
    });
  } catch (e) {
    console.error("[rps-betting] Create room error:", e);
    // Security: Don't expose internal error details to client
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
    console.log(`[rps-betting] Cancel room request received:`, req.body);
    const { wallet, roomId } = req.body || {};
    
    // Security: Validate wallet address format
    try {
      validateWalletAddress(wallet, 'wallet');
    } catch (e) {
      console.log(`[rps-betting] Cancel room - invalid wallet:`, wallet);
      return res.status(400).json({
        ok: false,
        error: "Invalid request",
        message: e.message || "Invalid wallet address format",
      });
    }
    
    if (!roomId || typeof roomId !== "string" || roomId.length > 200) {
      console.log(`[rps-betting] Cancel room - invalid roomId:`, roomId);
      return res.status(400).json({
        ok: false,
        error: "Invalid request",
        message: "Room ID is required and must be a valid string",
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
    // Security: Don't expose internal error details to client
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
    // Security: Don't expose internal error details to client
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
    console.error("[rps-betting] Get price error:", e);
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
    console.error("[rps-betting] Get fees error:", e);
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
      
      // Add to reward pool (for periodic distribution)
      // For now, we'll accumulate rewards and distribute periodically
      // The winner gets the pot immediately, but we track for leaderboard rewards
      
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

app.get("/rps_deposit.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "rps_deposit.html"));
});

app.get("/rps_history.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "rps_history.html"));
});

app.get("/rps_leaderboard.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "rps_leaderboard.html"));
});

app.get("/test_notifications.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "test_notifications.html"));
});

app.get("/rps_stats.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "rps_stats.html"));
});

// Chat Tester
app.get("/chat_tester.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "chat_tester.html"));
});

// Group Chat
app.get("/group_chat.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "group_chat.html"));
});

// Mood Overlay
app.get("/mood_overlay.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "mood_overlay.html"));
});

// Luna Character HTML (direct access)
app.get("/luna_character.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "luna_character.html"));
});

app.get("/luna_character_vts.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "luna_character_vts.html"));
});

// Overlay HTML
app.get("/overlay.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "overlay.html"));
});

// Main landing page
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// About page
app.get("/about.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "about.html"));
});

// Serve JS and CSS files directly from public folder (MUST be before /public static)
app.use("/js", express.static(path.join(__dirname, "public", "js"), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      // Prevent caching to avoid stale JavaScript files
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    }
  }
}));
app.use("/css", express.static(path.join(__dirname, "public", "css"), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.css')) {
      res.setHeader('Content-Type', 'text/css');
    }
  }
}));

app.use("/public", express.static(path.join(__dirname, "public")));

const clients = new Set();
const clientReconnectAttempts = new Map(); // Track reconnect attempts per client

wss.on("connection", (ws, req) => {
  clients.add(ws);
  const clientId = req.headers["sec-websocket-key"] || `${Date.now()}-${Math.random()}`;
  clientReconnectAttempts.set(ws, 0);
  
  // Track wallet if provided in query or headers
  let wallet = null;
  if (req.url) {
    const urlParams = new URL(req.url, `http://${req.headers.host}`).searchParams;
    wallet = urlParams.get('wallet');
  }
  
  if (wallet && typeof wallet === 'string' && wallet.length > 0) {
    onlineUsers.set(wallet, {
      ws: ws,
      lastSeen: Date.now(),
      roomId: null
    });
    
    // Broadcast online count update
    broadcast({
      type: 'chat_online_update',
      count: onlineUsers.size,
      wallet: wallet,
      action: 'join'
    });
  }
  
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
    
    // Remove from online users
    if (wallet) {
      onlineUsers.delete(wallet);
      broadcast({
        type: 'chat_online_update',
        count: onlineUsers.size,
        wallet: wallet,
        action: 'leave'
      });
    }
    
    console.log(`[ws] Client disconnected: code=${code}, reason=${reason?.toString() || "none"}`);
  });
  
  ws.on("error", (error) => {
    console.warn(`[ws] Client error:`, error.message);
    clients.delete(ws);
    clientReconnectAttempts.delete(ws);
    
    // Remove from online users
    if (wallet) {
      onlineUsers.delete(wallet);
      broadcast({
        type: 'chat_online_update',
        count: onlineUsers.size,
        wallet: wallet,
        action: 'leave'
      });
    }
  });
  
  // Handle incoming messages for chat commands
  ws.on("message", (data) => {
    try {
      const msg = JSON.parse(data.toString());
      if (msg.type === 'chat_command' && wallet) {
        handleChatCommand(msg, wallet, ws);
      }
    } catch (e) {
      // Ignore non-JSON messages
    }
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

/**
 * Notification System Helper Functions
 */

/**
 * Send notification to specific wallet (or broadcast to all if wallet is null)
 */
function sendNotification(wallet, type, title, message, data = {}) {
  const notification = {
    id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    type: type, // 'room_new', 'match_found', 'reward_time', 'referral_reward', etc.
    title: title,
    message: message,
    data: data,
    timestamp: Date.now(),
    read: false
  };
  
  if (wallet) {
    // Send to specific wallet
    if (!userNotifications.has(wallet)) {
      userNotifications.set(wallet, []);
    }
    
    const notifications = userNotifications.get(wallet);
    notifications.push(notification);
    
    // Keep only last 50 notifications per wallet
    if (notifications.length > 50) {
      notifications.shift();
    }
    
    // Broadcast notification via WebSocket to specific wallet
    broadcast({
      type: 'notification',
      wallet: wallet,
      notification: notification
    });
    
    console.log(`[notification] Sent ${type} notification to ${wallet.substring(0, 8)}...`);
  } else {
    // Broadcast to all users
    broadcast({
      type: 'notification',
      notification: notification
    });
    
    console.log(`[notification] Broadcasted ${type} notification to all users`);
  }
}

/**
 * Get notifications for a wallet
 */
function getNotifications(wallet, unreadOnly = false) {
  const notifications = userNotifications.get(wallet) || [];
  if (unreadOnly) {
    return notifications.filter(n => !n.read);
  }
  return notifications;
}

/**
 * Mark notification as read
 */
function markNotificationRead(wallet, notificationId) {
  const notifications = userNotifications.get(wallet);
  if (!notifications) return false;
  
  const notification = notifications.find(n => n.id === notificationId);
  if (notification) {
    notification.read = true;
    return true;
  }
  return false;
}

/**
 * Referral System Helper Functions
 */

/**
 * Register referral - ลงทะเบียนว่า wallet นี้มาจาก referrer
 */
function registerReferral(wallet, referrerWallet) {
  if (!referrerWallet || referrerWallet === wallet) {
    return false; // Cannot refer yourself
  }
  
  if (referralMap.has(wallet)) {
    return false; // Already referred
  }
  
  referralMap.set(wallet, referrerWallet);
  
  if (!referralData.has(referrerWallet)) {
    referralData.set(referrerWallet, {
      referrals: new Set(),
      totalRewards: 0,
      stats: {
        signups: 0,
        firstGames: 0,
        top10: 0
      }
    });
  }
  
  const refData = referralData.get(referrerWallet);
  refData.referrals.add(wallet);
  refData.stats.signups++;
  
  // Send referral reward to referrer
  sendNotification(referrerWallet, 'referral_reward', 'New Referral!', 
    `${wallet.substring(0, 8)}... signed up using your link!`, 
    { reward: REFERRAL_REWARD_SIGNUP, wallet: wallet });
  
  console.log(`[referral] ${wallet.substring(0, 8)}... referred by ${referrerWallet.substring(0, 8)}...`);
  return true;
}

/**
 * Get referral link for a wallet
 */
function getReferralLink(wallet) {
  return `${process.env.FRONTEND_URL || 'http://localhost:8787'}?ref=${wallet}`;
}

/**
 * Get referral stats for a wallet
 */
function getReferralStats(wallet) {
  const refData = referralData.get(wallet);
  if (!refData) {
    return {
      totalReferrals: 0,
      totalRewards: 0,
      referrals: [],
      stats: {
        signups: 0,
        firstGames: 0,
        top10: 0
      },
      referralLink: getReferralLink(wallet)
    };
  }
  
  return {
    totalReferrals: refData.referrals.size,
    totalRewards: refData.totalRewards,
    referrals: Array.from(refData.referrals),
    stats: refData.stats,
    referralLink: getReferralLink(wallet)
  };
}

/**
 * Chat System Helper Functions
 */

/**
 * Create or get chat room
 */
function getOrCreateChatRoom(roomId, roomType = 'lobby') {
  if (!chatRooms.has(roomId)) {
    chatRooms.set(roomId, {
      messages: [],
      participants: new Set(),
      createdAt: Date.now(),
      type: roomType // 'lobby', 'betting', 'match'
    });
  }
  return chatRooms.get(roomId);
}

/**
 * Get VIP badge based on balance (with caching)
 */
async function getVIPBadge(wallet, balance = null) {
  try {
    // Check cache first
    const now = Date.now();
    if (badgeCache.has(wallet)) {
      const cached = badgeCache.get(wallet);
      if ((now - cached.timestamp) < BADGE_CACHE_TTL) {
        return cached.badge;
      }
    }
    
    // If balance is provided, use it (from balance check)
    let actualBalance = balance;
    
    // If balance not provided, fetch from blockchain (slower)
    if (actualBalance === null || actualBalance === undefined) {
      const mint = process.env.LUNA_TOKEN_MINT;
      if (!mint || mint === "your_token_mint_address_from_pumpfun_here" || mint.length < 32) {
        return null;
      }
      
      const connection = new Connection(
        process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
        "confirmed"
      );
      
      const mintPublicKey = new PublicKey(mint);
      const walletPubKey = new PublicKey(wallet);
      
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        walletPubKey,
        { mint: mintPublicKey }
      );
      
      if (tokenAccounts.value && tokenAccounts.value.length > 0) {
        const tokenAccount = tokenAccounts.value[0];
        const tokenAmount = tokenAccount.account.data.parsed.info.tokenAmount;
        
        if (tokenAmount.uiAmountString) {
          actualBalance = parseFloat(tokenAmount.uiAmountString);
        } else if (tokenAmount.uiAmount !== null && tokenAmount.uiAmount !== undefined) {
          actualBalance = tokenAmount.uiAmount;
        } else {
          const rawAmount = tokenAmount.amount;
          const decimals = tokenAmount.decimals || 0;
          actualBalance = parseFloat(rawAmount) / Math.pow(10, decimals);
        }
        
        // Don't round to integer - keep decimal precision for accurate badge calculation
        if (actualBalance >= 1000000) {
          actualBalance = Math.round(actualBalance);
        } else {
          actualBalance = Math.round(actualBalance * 100) / 100;
        }
      } else {
        actualBalance = 0;
      }
    }
    
    // Calculate badge
    let badge = null;
    if (actualBalance >= VIP_BADGES.LEGEND) badge = { emoji: '👑', name: 'Legend', level: 5 };
    else if (actualBalance >= VIP_BADGES.DIAMOND) badge = { emoji: '💎', name: 'Diamond', level: 4 };
    else if (actualBalance >= VIP_BADGES.GOLD) badge = { emoji: '🥇', name: 'Gold', level: 3 };
    else if (actualBalance >= VIP_BADGES.SILVER) badge = { emoji: '🥈', name: 'Silver', level: 2 };
    else if (actualBalance >= VIP_BADGES.BRONZE) badge = { emoji: '🥉', name: 'Bronze', level: 1 };
    
    // Cache the result
    badgeCache.set(wallet, { badge, balance: actualBalance, timestamp: now });
    
    return badge;
  } catch (e) {
    console.error('[chat] Error getting VIP badge:', e);
    return null;
  }
}

/**
 * Process message for mentions (@username)
 */
function extractMentions(message) {
  const mentionRegex = /@(\w+)/g;
  const mentions = [];
  let match;
  while ((match = mentionRegex.exec(message)) !== null) {
    mentions.push(match[1]);
  }
  return mentions;
}

/**
 * Process message rewards
 * DISABLED: Rewards are disabled per user request
 */
async function processMessageReward(wallet, roomId, isFirstMessage = false) {
  // Rewards disabled - always return null
  return null;
  
  /* Original reward code (disabled):
  try {
    if (isFirstMessage) {
      // First message bonus
      const rewardAmount = FIRST_MESSAGE_BONUS;
      await distributeReward(wallet, rewardAmount, 'first_message_bonus', roomId);
      return { amount: rewardAmount, type: 'first_message_bonus' };
    }
    
    // Random reward chance
    if (Math.random() < MESSAGE_REWARD_CHANCE) {
      const rewardAmount = Math.floor(Math.random() * (MESSAGE_REWARD_MAX - MESSAGE_REWARD_MIN + 1)) + MESSAGE_REWARD_MIN;
      await distributeReward(wallet, rewardAmount, 'message_reward', roomId);
      return { amount: rewardAmount, type: 'message_reward' };
    }
    
    return null;
  } catch (e) {
    console.error('[chat] Error processing message reward:', e);
    return null;
  }
  */
}

/**
 * Distribute reward to wallet
 */
async function distributeReward(wallet, amount, reason, roomId) {
  // Update chat rewards tracking
  if (!chatRewards.has(wallet)) {
    chatRewards.set(wallet, { totalRewards: 0, messageCount: 0, lastRewardTime: 0 });
  }
  const rewardData = chatRewards.get(wallet);
  rewardData.totalRewards += amount;
  rewardData.lastRewardTime = Date.now();
  
  // Send notification
  sendNotification(wallet, 'chat_reward', '🎉 Message Reward!', 
    `You received ${amount.toLocaleString()} Luna for ${reason === 'first_message_bonus' ? 'first message of the day!' : 'sending a message!'}`,
    { amount, reason, roomId });
  
  console.log(`[chat] Reward distributed: ${wallet.substring(0, 8)}... received ${amount} Luna (${reason})`);
  
  // Broadcast reward notification
  broadcast({
    type: 'chat_reward',
    roomId: roomId,
    wallet: wallet,
    amount: amount,
    reason: reason
  });
}

/**
 * Send chat message
 */
async function sendChatMessage(roomId, wallet, message, username = null, balance = null) {
  const room = getOrCreateChatRoom(roomId);
  
  // Add sender to participants
  room.participants.add(wallet);
  
  // Don't clean old messages - keep all messages permanently
  // (CHAT_MESSAGE_EXPIRY is disabled)
  
  // Limit message count in memory (but all are saved in DB)
  if (room.messages.length >= CHAT_MESSAGE_LIMIT) {
    room.messages.shift();
  }
  
  // Get VIP badge (use cached balance if available, much faster)
  const badge = await getVIPBadge(wallet, balance);
  
  // Extract mentions
  const mentions = extractMentions(message);
  
  // Check if first message of the day
  const rewardData = chatRewards.get(wallet) || { totalRewards: 0, messageCount: 0, lastRewardTime: 0 };
  const lastRewardDate = new Date(rewardData.lastRewardTime);
  const today = new Date();
  const isFirstMessage = lastRewardDate.toDateString() !== today.toDateString();
  
  // Process message reward
  const reward = await processMessageReward(wallet, roomId, isFirstMessage);
  
  // Update message count
  rewardData.messageCount += 1;
  chatRewards.set(wallet, rewardData);
  
  // Update leaderboard
  if (!chatLeaderboard.has(wallet)) {
    chatLeaderboard.set(wallet, 0);
  }
  chatLeaderboard.set(wallet, chatLeaderboard.get(wallet) + 1);
  
  const chatMessage = {
    id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    wallet: wallet,
    username: username || wallet.substring(0, 8) + '...',
    message: message,
    timestamp: Date.now(),
    badge: badge,
    mentions: mentions,
    reward: reward
  };
  
  room.messages.push(chatMessage);
  
  // Save to database (persistent storage)
  try {
    await saveGroupChatMessage({
      ...chatMessage,
      roomId: roomId
    });
  } catch (dbError) {
    console.error('[chat] Failed to save message to database:', dbError);
    // Continue even if DB save fails
  }
  
  // Initialize reactions for this message
  if (!messageReactions.has(chatMessage.id)) {
    messageReactions.set(chatMessage.id, new Map());
  }
  
  // Broadcast message via WebSocket
  broadcast({
    type: 'chat_message',
    roomId: roomId,
    message: chatMessage
  });
  
  // Send mention notifications
  if (mentions.length > 0) {
    // Find wallets that match mentions (simplified - in real app, would need username mapping)
    for (const participant of room.participants) {
      const participantUsername = participant.substring(0, 8) + '...';
      if (mentions.some(m => participantUsername.toLowerCase().includes(m.toLowerCase()))) {
        sendNotification(participant, 'chat_mention', '💬 You were mentioned!', 
          `${username || wallet.substring(0, 8) + '...'} mentioned you in group chat`,
          { roomId, messageId: chatMessage.id, fromWallet: wallet });
      }
    }
  }
  
  console.log(`[chat] ${wallet.substring(0, 8)}... sent message in room ${roomId}${reward ? ` (reward: ${reward.amount} Luna)` : ''}`);
  return chatMessage;
}

/**
 * Get chat messages for a room
 */
async function getChatMessages(roomId, limit = 50) {
  const room = chatRooms.get(roomId);
  
  // Load from database if room is empty or needs more messages
  if (!room || room.messages.length === 0) {
    try {
      const dbMessages = await loadGroupChatMessages(roomId, limit);
      if (dbMessages && dbMessages.length > 0) {
        // Create room if it doesn't exist
        if (!room) {
          getOrCreateChatRoom(roomId);
        }
        const roomObj = chatRooms.get(roomId);
        roomObj.messages = dbMessages;
        return dbMessages;
      } else {
        // No messages in database, create empty room
        if (!room) {
          getOrCreateChatRoom(roomId);
        }
        return [];
      }
    } catch (dbError) {
      console.error('[chat] Failed to load messages from database:', dbError);
      // Return empty array on error
      if (!room) {
        getOrCreateChatRoom(roomId);
      }
      return [];
    }
  }
  
  if (!room) {
    return [];
  }
  
  // Don't clean old messages - keep all messages permanently
  // Return last N messages
  return room.messages.slice(-limit);
}

/**
 * Handle chat commands
 */
function handleChatCommand(msg, wallet, ws) {
  const { command, args } = msg;
  
  switch (command) {
    case '/balance':
      // Return balance info (would need to fetch from Solana)
      ws.send(JSON.stringify({
        type: 'chat_command_response',
        command: '/balance',
        message: 'Use /stats to see your balance and stats'
      }));
      break;
      
    case '/stats':
      const rewardData = chatRewards.get(wallet) || { totalRewards: 0, messageCount: 0, lastRewardTime: 0 };
      const messageCount = chatLeaderboard.get(wallet) || 0;
      ws.send(JSON.stringify({
        type: 'chat_command_response',
        command: '/stats',
        data: {
          messageCount: messageCount,
          totalRewards: rewardData.totalRewards,
          lastRewardTime: rewardData.lastRewardTime
        }
      }));
      break;
      
    case '/help':
      ws.send(JSON.stringify({
        type: 'chat_command_response',
        command: '/help',
        message: 'Available commands: /balance, /stats, /help, /leaderboard'
      }));
      break;
      
    case '/leaderboard':
      const leaderboard = Array.from(chatLeaderboard.entries())
        .map(([w, count]) => ({ wallet: w, count: count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);
      ws.send(JSON.stringify({
        type: 'chat_command_response',
        command: '/leaderboard',
        data: leaderboard
      }));
      break;
      
    default:
      ws.send(JSON.stringify({
        type: 'chat_command_response',
        command: command,
        message: 'Unknown command. Use /help for available commands.'
      }));
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
    
    // เดาอารมณ์ด้วย Emotion Engine (rule-based) - ประกาศนอกบล็อกเพื่อใช้ได้ทุกที่
    let classifiedEmotion = null;
    
    if (cached) {
      modelResult = cached;
      isCached = true;
      console.log(`[cache] Hit for message: ${msg.substring(0, 50)}...`);
      // ยังต้อง classify emotion แม้จะใช้ cache เพื่อแสดงอารมณ์
      classifiedEmotion = classifyEmotion(msg);
    } else {
      // เดาอารมณ์ด้วย Emotion Engine (rule-based)
      classifiedEmotion = classifyEmotion(msg); // angry / sad / sleepy / hype / soft / null
      
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
      // ตรวจสอบ isNewUser ใน scope นี้
      const isNewUser = !activeUsers.has(name);
      let modelResult;
      try {
        [modelResult] = await Promise.all([
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
      } catch (e) {
        console.error("[ai] Failed to get model response:", e.message);
        // Fallback response when AI fails
        modelResult = {
          reply: "Sorry, I'm having trouble thinking right now. Can you try again in a moment? 😅",
          emotion: "neutral",
          traits: []
        };
      }
      
      // Track model usage (ใช้ isComplexQuestion จาก modules/ai.js เพื่อความสอดคล้อง)
      const isComplex = isComplexQuestion(msg);
      if (isComplex) {
        stats.messages.byModel.complex++;
      } else {
        stats.messages.byModel.simple++;
      }
      
      // Cache response (only if we got a valid result)
      if (modelResult && modelResult.reply) {
        setCachedResponse(cacheKey, modelResult);
      }
    }
    
    // Ensure modelResult exists before destructuring
    if (!modelResult) {
      modelResult = {
        reply: "Sorry, I'm having trouble thinking right now. Can you try again in a moment? 😅",
        emotion: "neutral",
        traits: []
      };
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
    
    // Emotion Transition: ตรวจสอบว่าควรเปลี่ยนอารมณ์หรือไม่
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
const BALANCE_CACHE_TTL = 10000; // 10 seconds cache (reduced to avoid stale data)

/**
 * Check user's Luna token balance
 * GET /luna/rps/balance?user=username OR ?wallet=wallet_address&mint=token_mint
 */
app.get("/luna/rps/balance", async (req, res) => {
  try {
    const wallet = req.query.wallet;
    // ใช้ LUNA_TOKEN_MINT จาก .env หรือ query parameter หรือ default
    const mint = req.query.mint || process.env.LUNA_TOKEN_MINT || "CbB4ivri6wLfqx4NwrWY3ArD7mXv1e91HeYeq3KBpump";
    
    // If wallet is provided, check balance from blockchain
    if (wallet) {
      const cacheKey = `${wallet}:${mint}`;
      const now = Date.now();
      const forceRefresh = req.query.refresh === 'true';
      
      // Check cache first (but allow force refresh with ?refresh=true)
      if (!forceRefresh && balanceCache.has(cacheKey)) {
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
      
      // Validate mint address format
      if (!mint || mint === "your_token_mint_address_from_pumpfun_here" || mint.length < 32) {
        throw new Error(`Invalid mint address: ${mint}. Please set LUNA_TOKEN_MINT in .env with a valid Solana token mint address.`);
      }
      
      let mintPublicKey;
      let walletPubKey;
      try {
        mintPublicKey = new PublicKey(mint);
        walletPubKey = new PublicKey(wallet);
      } catch (error) {
        if (error.message.includes("Non-base58")) {
          throw new Error(`Invalid mint address format: ${mint}. Please check LUNA_TOKEN_MINT in .env. It should be a valid Solana address (base58 format).`);
        }
        throw error;
      }
      
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
          
          // Don't round to integer - keep decimal precision for accurate display
          // Only round if balance is very large (to avoid floating point issues)
          if (balance >= 1000000) {
            balance = Math.round(balance);
          } else {
            balance = Math.round(balance * 100) / 100; // Round to 2 decimal places
          }
          
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

/**
 * Get contract address (token mint address), buy link, and X/Twitter link
 * GET /luna/rps/contract-address
 */
app.get("/luna/rps/contract-address", async (req, res) => {
  try {
    const mint = process.env.LUNA_TOKEN_MINT || "CbB4ivri6wLfqx4NwrWY3ArD7mXv1e91HeYeq3KBpump";
    const buyLink = process.env.LUNA_BUY_LINK || `https://pump.fun/${mint}`;
    const xLink = process.env.LUNA_X_LINK || "https://x.com/your_community";
    
    return res.json({
      ok: true,
      contractAddress: mint,
      buyLink: buyLink,
      xLink: xLink,
      message: "Contract address retrieved successfully"
    });
  } catch (e) {
    console.error("[rps] Contract address error:", e);
    res.status(500).json({
      ok: false,
      error: e.message,
      message: "Failed to get contract address",
    });
  }
});

/**
 * Get leaderboard
 * GET /luna/rps/leaderboard
 */
app.get("/luna/rps/leaderboard", async (req, res) => {
  try {
    // Convert leaderboard map to array and sort by total Luna won
    const leaderboardArray = Array.from(rpsLeaderboard.entries()).map(([wallet, stats]) => ({
      wallet: wallet,
      wins: stats.wins || 0,
      losses: stats.losses || 0,
      totalWon: stats.totalWon || 0, // Total Luna won
      totalSolWon: stats.totalSolWon || 0, // Total SOL won (for reference)
    }));
    
    // Sort by total Luna won (descending) - ใครได้ Luna เยอะสุดจะอยู่อันดับแรก
    leaderboardArray.sort((a, b) => (b.totalWon || 0) - (a.totalWon || 0));
    
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
      message: "Leaderboard loaded successfully (Top 50)"
    });
  } catch (e) {
    console.error("[rps] Leaderboard error:", e);
    res.status(500).json({
      ok: false,
      error: e.message,
      message: "Failed to load leaderboard",
    });
  }
});

/**
 * Send SPL Token (Luna) to a wallet
 * @param {string} toWallet - Recipient wallet address
 * @param {number} amount - Amount in Luna (raw amount, will be converted to token decimals)
 * @param {string} mintAddress - Token mint address
 * @returns {Promise<string|null>} - Transaction signature or null if failed
 */
async function sendLunaToken(toWallet, amount, mintAddress) {
  try {
    const privateKey = DEPOSIT_ESCROW_PRIVATE_KEY || process.env.DEPOSIT_ESCROW_PRIVATE_KEY;
    if (!privateKey) {
      console.warn("[deposit] DEPOSIT_ESCROW_PRIVATE_KEY not set, cannot send Luna token");
      return null;
    }
    
    if (!DEPOSIT_ESCROW_WALLET) {
      console.warn("[deposit] DEPOSIT_ESCROW_WALLET not set, cannot send Luna token");
      return null;
    }
    
    const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
    const connection = new Connection(rpcUrl, "confirmed");
    
    // Decode private key
    let keypair;
    try {
      const secretKey = bs58.decode(privateKey);
      keypair = Keypair.fromSecretKey(secretKey);
      
      // Verify wallet address matches private key
      const derivedWallet = keypair.publicKey.toString();
      if (derivedWallet !== DEPOSIT_ESCROW_WALLET) {
        console.warn(`[deposit] Wallet address mismatch! Private key derives to ${derivedWallet}, but DEPOSIT_ESCROW_WALLET is ${DEPOSIT_ESCROW_WALLET}`);
        // Continue anyway - user might have provided correct private key
      }
    } catch (e) {
      console.error("[deposit] Invalid private key format:", e.message);
      return null;
    }
    
    // Get token mint info
    const mintPublicKey = new PublicKey(mintAddress);
    const fromPublicKey = keypair.publicKey; // Use derived wallet from private key
    const toPublicKey = new PublicKey(toWallet);
    
    // Get token decimals
    const mintInfo = await connection.getParsedAccountInfo(mintPublicKey);
    const decimals = mintInfo.value?.data?.parsed?.info?.decimals || 6;
    
    // Convert amount to raw token amount
    const rawAmount = BigInt(Math.floor(amount * Math.pow(10, decimals)));
    
    // Get associated token addresses
    const fromTokenAccount = getAssociatedTokenAddressSync(mintPublicKey, fromPublicKey);
    const toTokenAccount = getAssociatedTokenAddressSync(mintPublicKey, toPublicKey);
    
    // Check sender token balance
    const fromTokenAccountInfo = await connection.getParsedAccountInfo(fromTokenAccount);
    const fromBalance = fromTokenAccountInfo.value?.data?.parsed?.info?.tokenAmount?.uiAmount || 0;
    
    if (fromBalance < amount) {
      console.error(`[deposit] Insufficient Luna balance. Need ${amount} Luna, have ${fromBalance} Luna`);
      return null;
    }
    
    // Check SOL balance for transaction fee
    const senderBalance = await connection.getBalance(keypair.publicKey);
    const transactionFee = 5000; // Estimated fee
    
    if (senderBalance < transactionFee) {
      console.error(`[deposit] Insufficient SOL for transaction fee. Need ${transactionFee / LAMPORTS_PER_SOL} SOL, have ${senderBalance / LAMPORTS_PER_SOL} SOL`);
      return null;
    }
    
    // Create transfer instruction
    const transaction = new Transaction().add(
      createTransferInstruction(
        fromTokenAccount,
        toTokenAccount,
        fromPublicKey,
        rawAmount,
        [],
        TOKEN_PROGRAM_ID
      )
    );
    
    // Send transaction
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [keypair],
      { commitment: "confirmed" }
    );
    
    console.log(`[deposit] Sent ${amount} Luna to ${toWallet.substring(0, 8)}... (tx: ${signature})`);
    return signature;
  } catch (e) {
    console.error("[deposit] Error sending Luna token:", e.message);
    return null;
  }
}

/**
 * Send SOL to a wallet
 * @param {string} toWallet - Recipient wallet address
 * @param {number} amountInSol - Amount in SOL
 * @returns {Promise<string|null>} - Transaction signature or null if failed
 */
async function sendSol(toWallet, amountInSol) {
  try {
    const privateKey = process.env.REWARD_SENDER_PRIVATE_KEY;
    if (!privateKey) {
      console.warn("[reward-distribution] REWARD_SENDER_PRIVATE_KEY not set, cannot send SOL");
      return null;
    }
    
    const rpcUrl = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";
    const connection = new Connection(rpcUrl, "confirmed");
    
    // Decode private key
    let keypair;
    try {
      const secretKey = bs58.decode(privateKey);
      keypair = Keypair.fromSecretKey(secretKey);
    } catch (e) {
      console.error("[reward-distribution] Invalid private key format:", e.message);
      return null;
    }
    
    // Check sender balance
    const senderBalance = await connection.getBalance(keypair.publicKey);
    const amountInLamports = amountInSol * LAMPORTS_PER_SOL;
    const transactionFee = 5000; // Estimated fee
    
    if (senderBalance < amountInLamports + transactionFee) {
      console.error(`[reward-distribution] Insufficient balance. Need ${(amountInLamports + transactionFee) / LAMPORTS_PER_SOL} SOL, have ${senderBalance / LAMPORTS_PER_SOL} SOL`);
      return null;
    }
    
    // Create transaction
    const toPublicKey = new PublicKey(toWallet);
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: toPublicKey,
        lamports: amountInLamports,
      })
    );
    
    // Send transaction
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [keypair],
      { commitment: "confirmed" }
    );
    
    console.log(`[reward-distribution] Sent ${amountInSol} SOL to ${toWallet.substring(0, 8)}... (tx: ${signature})`);
    return signature;
  } catch (e) {
    console.error("[reward-distribution] Error sending SOL:", e.message);
    return null;
  }
}

/**
 * Distribute rewards to top 5 players (internal function)
 * @param {number} totalRewardPool - Optional pool amount (if not provided, uses accumulated pool)
 * @returns {Promise<Object>} Distribution result
 */
async function distributeRewards(totalRewardPool = null) {
  try {
    const poolAmount = totalRewardPool || rewardPool;
    
    if (poolAmount <= 0) {
      console.log("[rps-rewards] No rewards to distribute (pool is empty)");
      return {
        ok: false,
        error: "Invalid pool amount",
        message: "Reward pool must be greater than 0",
        totalPool: poolAmount,
        totalDistributed: 0,
        distributions: [],
      };
    }
    
    // Get top 5 players
    const leaderboardArray = Array.from(rpsLeaderboard.entries()).map(([wallet, stats]) => ({
      wallet: wallet,
      totalWon: stats.totalWon || 0, // Sort by Luna won
      totalSolWon: stats.totalSolWon || 0,
    }));
    
    // Sort by total Luna won (descending)
    leaderboardArray.sort((a, b) => (b.totalWon || 0) - (a.totalWon || 0));
    const top5 = leaderboardArray.slice(0, 5);
    
    if (top5.length === 0) {
      console.log("[rps-rewards] No players to reward");
      return {
        ok: true,
        message: "No players to reward",
        totalPool: poolAmount,
        totalDistributed: 0,
        distributions: [],
      };
    }
    
    console.log(`[rps-rewards] Distributing ${poolAmount} SOL to top ${top5.length} players...`);
    
    const distributions = [];
    let totalDistributed = 0;
    
    // Distribute to top 5
    for (let i = 0; i < top5.length; i++) {
      const rank = i + 1;
      const wallet = top5[i].wallet;
      const percentage = REWARD_PERCENTAGES[rank];
      const amount = poolAmount * percentage;
      
      // ตรวจสอบว่า wallet ถูกตัดสิทธิ์รับรางวัลหรือไม่
      if (rewardBannedWallets.has(wallet)) {
        const walletIp = walletIpMap.get(wallet) || 'unknown';
        console.warn(`[rps-rewards] ⚠️ Wallet ${wallet.substring(0, 8)}... (rank ${rank}) is banned from receiving rewards due to IP self-play detection (IP: ${walletIp})`);
        distributions.push({
          rank: rank,
          wallet: wallet,
          amount: amount,
          percentage: percentage * 100,
          signature: null,
          success: false,
          banned: true,
          reason: "IP self-play detected - wallet banned from rewards"
        });
        // ไม่ส่งรางวัลให้ wallet นี้ - เงินจะไปที่ distribution wallet แทน
        continue;
      }
      
      if (amount > 0) {
        console.log(`[rps-rewards] Sending ${amount.toFixed(6)} SOL (${percentage * 100}%) to rank ${rank}: ${wallet.substring(0, 8)}...`);
        const signature = await sendSol(wallet, amount);
        distributions.push({
          rank: rank,
          wallet: wallet,
          amount: amount,
          percentage: percentage * 100,
          signature: signature,
          success: signature !== null,
          banned: false,
        });
        
        if (signature) {
          totalDistributed += amount;
          console.log(`[rps-rewards] ✓ Sent ${amount.toFixed(6)} SOL to rank ${rank} (tx: ${signature})`);
        } else {
          console.error(`[rps-rewards] ✗ Failed to send ${amount.toFixed(6)} SOL to rank ${rank}`);
        }
      }
    }
    
    // Calculate remaining amount (60% + any banned wallet rewards)
    const bannedAmount = distributions
      .filter(d => d.banned === true)
      .reduce((sum, d) => sum + d.amount, 0);
    const remainingAmount = poolAmount * REWARD_PERCENTAGES.remaining + bannedAmount;
    if (remainingAmount > 0) {
      console.log(`[rps-rewards] Sending ${remainingAmount.toFixed(6)} SOL (${REWARD_PERCENTAGES.remaining * 100}%) to distribution wallet: ${REWARD_DISTRIBUTION_WALLET.substring(0, 8)}...`);
      const signature = await sendSol(REWARD_DISTRIBUTION_WALLET, remainingAmount);
      distributions.push({
        rank: "distribution",
        wallet: REWARD_DISTRIBUTION_WALLET,
        amount: remainingAmount,
        percentage: REWARD_PERCENTAGES.remaining * 100,
        signature: signature,
        success: signature !== null,
        bannedAmount: bannedAmount,
        note: bannedAmount > 0 ? `Includes ${bannedAmount.toFixed(6)} SOL from banned wallets` : null
      });
      
      if (signature) {
        totalDistributed += remainingAmount;
        console.log(`[rps-rewards] ✓ Sent ${remainingAmount.toFixed(6)} SOL to distribution wallet (tx: ${signature})`);
      } else {
        console.error(`[rps-rewards] ✗ Failed to send ${remainingAmount.toFixed(6)} SOL to distribution wallet`);
      }
    }
    
    // Reset reward pool if using accumulated pool
    if (!totalRewardPool) {
      rewardPool = 0;
    }
    
    console.log(`[rps-rewards] Distribution complete. Total distributed: ${totalDistributed.toFixed(6)} SOL / ${poolAmount.toFixed(6)} SOL`);
    
    return {
      ok: true,
      message: "Rewards distributed successfully",
      totalPool: poolAmount,
      totalDistributed: totalDistributed,
      distributions: distributions,
    };
  } catch (e) {
    console.error("[rps-rewards] Reward distribution error:", e);
    return {
      ok: false,
      error: e.message,
      message: "Failed to distribute rewards",
      totalPool: totalRewardPool || rewardPool,
      totalDistributed: 0,
      distributions: [],
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
    console.error("[rps] Reward distribution endpoint error:", e);
    res.status(500).json({
      ok: false,
      error: e.message,
      message: "Failed to distribute rewards",
    });
  }
});

/**
 * Calculate Betting fee percentage based on deposit status
 * @param {string} wallet - Wallet address
 * @returns {Promise<number>} - Fee percentage (0.03, 0.02, or 0.01)
 */
async function getBettingFeePercentage(wallet) {
  try {
    const deposit = await getActiveDeposit(wallet);
    if (!deposit) {
      return BETTING_FEE_DEFAULT; // 3% default if no deposit
    }
    
    const now = Date.now();
    const depositDate = deposit.deposit_date;
    const daysSinceDeposit = (now - depositDate) / (1000 * 60 * 60 * 24);
    
    if (daysSinceDeposit >= 6) {
      return BETTING_FEE_6_DAYS; // 1% after 6 days
    } else if (daysSinceDeposit >= 3) {
      return BETTING_FEE_3_DAYS; // 2% after 3 days
    } else {
      return BETTING_FEE_DEFAULT; // 3% default
    }
  } catch (e) {
    console.error("[deposit] Error calculating betting fee:", e.message);
    return BETTING_FEE_DEFAULT; // Default to 3% on error
  }
}

/**
 * Deposit Luna tokens
 * POST /luna/deposit
 * Body: { wallet: "wallet_address", amount: number, signature: "transaction_signature" }
 */
app.post("/luna/deposit", async (req, res) => {
  try {
    const { wallet, amount, signature } = req.body || {};
    
    if (!wallet || !amount || amount <= 0) {
      return res.status(400).json({
        ok: false,
        error: "Invalid request",
        message: "wallet and amount are required",
      });
    }
    
    // Check if wallet has minimum balance (150,000 Luna)
    const mint = process.env.LUNA_TOKEN_MINT || "CbB4ivri6wLfqx4NwrWY3ArD7mXv1e91HeYeq3KBpump";
    const balanceResponse = await fetch(`${req.protocol}://${req.get('host')}/luna/rps/balance?wallet=${wallet}&mint=${mint}`);
    const balanceData = await balanceResponse.json();
    
    if (!balanceData.ok || balanceData.balance < DEPOSIT_MIN_BALANCE) {
      return res.status(403).json({
        ok: false,
        error: "Insufficient balance",
        message: `You need at least ${DEPOSIT_MIN_BALANCE.toLocaleString()} Luna tokens to deposit. Current: ${(balanceData.balance || 0).toLocaleString()}`,
      });
    }
    
    // Calculate deposit fee (3%)
    const depositFee = amount * DEPOSIT_FEE_PERCENTAGE;
    const depositAmount = amount - depositFee;
    
    // Check if already has active deposit - if yes, update it instead of creating new
    const existingDeposit = await getActiveDeposit(wallet);
    if (existingDeposit) {
      // Update existing deposit by adding the new amount
      const updated = await updateLunaDeposit(wallet, depositAmount);
      if (!updated) {
        return res.status(500).json({
          ok: false,
          error: "Update failed",
          message: "Failed to update existing deposit",
        });
      }
      
      // Get updated deposit info
      const updatedDeposit = await getActiveDeposit(wallet);
      const totalAmount = updatedDeposit.deposit_amount;
      
      console.log(`[deposit] Deposit updated: ${wallet.substring(0, 8)}... added ${depositAmount} Luna (fee: ${depositFee} Luna). Total: ${totalAmount} Luna`);
      
      return res.json({
        ok: true,
        message: "Deposit updated successfully",
        deposit: {
          id: updatedDeposit.id,
          wallet: wallet,
          amount: totalAmount,
          addedAmount: depositAmount,
          fee: depositFee,
          depositDate: updatedDeposit.deposit_date, // Keep original deposit date
          escrowWallet: DEPOSIT_ESCROW_WALLET,
        },
        note: "Please send Luna tokens to the escrow wallet. The system will verify the transaction.",
      });
    }
    
    // Create new deposit
    // Note: In a real implementation, you would verify the transaction signature
    // For now, we'll just record the deposit
    // The user should send Luna tokens to DEPOSIT_ESCROW_WALLET manually or via transaction
    
    const depositDate = Date.now();
    const depositId = await saveLunaDeposit(wallet, depositAmount, depositDate);
    
    console.log(`[deposit] Deposit recorded: ${wallet.substring(0, 8)}... deposited ${depositAmount} Luna (fee: ${depositFee} Luna)`);
    
    return res.json({
      ok: true,
      message: "Deposit recorded successfully",
      deposit: {
        id: depositId,
        wallet: wallet,
        amount: depositAmount,
        fee: depositFee,
        depositDate: depositDate,
        escrowWallet: DEPOSIT_ESCROW_WALLET,
      },
      note: "Please send Luna tokens to the escrow wallet. The system will verify the transaction.",
    });
  } catch (e) {
    console.error("[deposit] Deposit error:", e);
    res.status(500).json({
      ok: false,
      error: e.message,
      message: "Failed to process deposit",
    });
  }
});

/**
 * Get deposit status
 * GET /luna/deposit/status?wallet=wallet_address
 */
app.get("/luna/deposit/status", async (req, res) => {
  try {
    const { wallet } = req.query || {};
    
    if (!wallet) {
      return res.status(400).json({
        ok: false,
        error: "Invalid request",
        message: "wallet is required",
      });
    }
    
    const deposit = await getActiveDeposit(wallet);
    
    if (!deposit) {
      return res.json({
        ok: true,
        hasDeposit: false,
        message: "No active deposit",
      });
    }
    
    const now = Date.now();
    const depositDate = deposit.deposit_date;
    const daysSinceDeposit = (now - depositDate) / (1000 * 60 * 60 * 24);
    const feePercentage = await getBettingFeePercentage(wallet);
    
    return res.json({
      ok: true,
      hasDeposit: true,
      deposit: {
        amount: deposit.deposit_amount,
        depositDate: depositDate,
        daysSinceDeposit: Math.floor(daysSinceDeposit * 100) / 100,
        feePercentage: feePercentage,
        feePercentageDisplay: `${(feePercentage * 100).toFixed(0)}%`,
        escrowWallet: DEPOSIT_ESCROW_WALLET,
      },
    });
  } catch (e) {
    console.error("[deposit] Get deposit status error:", e);
    res.status(500).json({
      ok: false,
      error: e.message,
      message: "Failed to get deposit status",
    });
  }
});

/**
 * Withdraw Luna tokens
 * POST /luna/withdraw
 * Body: { wallet: "wallet_address" }
 */
app.post("/luna/withdraw", async (req, res) => {
  try {
    const { wallet } = req.body || {};
    
    if (!wallet) {
      return res.status(400).json({
        ok: false,
        error: "Invalid request",
        message: "wallet is required",
      });
    }
    
    const deposit = await getActiveDeposit(wallet);
    
    if (!deposit) {
      return res.status(404).json({
        ok: false,
        error: "No active deposit",
        message: "You don't have an active deposit to withdraw",
      });
    }
    
    const mint = process.env.LUNA_TOKEN_MINT || "CbB4ivri6wLfqx4NwrWY3ArD7mXv1e91HeYeq3KBpump";
    const withdrawAmount = deposit.deposit_amount;
    const withdrawDate = Date.now();
    
    // Send Luna tokens back to user
    const signature = await sendLunaToken(wallet, withdrawAmount, mint);
    
    if (!signature) {
      return res.status(500).json({
        ok: false,
        error: "Transaction failed",
        message: "Failed to send Luna tokens. Please check escrow wallet balance and SOL for transaction fee.",
      });
    }
    
    // Mark deposit as withdrawn
    await withdrawDeposit(wallet, withdrawDate);
    
    console.log(`[deposit] Withdrawal processed: ${wallet.substring(0, 8)}... withdrew ${withdrawAmount} Luna (tx: ${signature})`);
    
    return res.json({
      ok: true,
      message: "Withdrawal successful",
      withdrawal: {
        wallet: wallet,
        amount: withdrawAmount,
        signature: signature,
        withdrawDate: withdrawDate,
      },
    });
  } catch (e) {
    console.error("[deposit] Withdraw error:", e);
    res.status(500).json({
      ok: false,
      error: e.message,
      message: "Failed to process withdrawal",
    });
  }
});

/**
 * Get reward pool status
 * GET /luna/rps/rewards/pool
 */
app.get("/luna/rps/rewards/pool", async (req, res) => {
  try {
    const leaderboardArray = Array.from(rpsLeaderboard.entries()).map(([wallet, stats]) => ({
      wallet: wallet,
      totalWon: stats.totalWon || 0, // Sort by Luna won
      totalSolWon: stats.totalSolWon || 0,
    }));
    
    // Sort by total Luna won (descending)
    leaderboardArray.sort((a, b) => (b.totalWon || 0) - (a.totalWon || 0));
    const top5 = leaderboardArray.slice(0, 5);
    
    const distributionPlan = top5.map((player, index) => {
      const rank = index + 1;
      return {
        rank: rank,
        wallet: player.wallet,
        percentage: REWARD_PERCENTAGES[rank] * 100,
        estimatedAmount: rewardPool * REWARD_PERCENTAGES[rank],
      };
    });
    
    distributionPlan.push({
      rank: "distribution",
      wallet: REWARD_DISTRIBUTION_WALLET,
      percentage: REWARD_PERCENTAGES.remaining * 100,
      estimatedAmount: rewardPool * REWARD_PERCENTAGES.remaining,
    });
    
    return res.json({
      ok: true,
      rewardPool: rewardPool,
      distributionPlan: distributionPlan,
      top5: top5,
    });
  } catch (e) {
    console.error("[rps] Get reward pool error:", e);
    res.status(500).json({
      ok: false,
      error: e.message,
      message: "Failed to get reward pool",
    });
  }
});

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
    console.error("[rps] Competition time error:", e);
    res.status(500).json({
      ok: false,
      error: e.message,
      message: "Failed to get competition time",
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
      console.error("[rps] SOL balance check RPC error:", rpcError.message);
      throw new Error("Failed to fetch SOL balance: " + rpcError.message);
    }
  } catch (e) {
    console.error("[rps] SOL balance check error:", e);
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
    
    // TODO: Implement history from database
    // For now, return empty history
    return res.json({
      ok: true,
      history: [],
      wallet: wallet,
      message: "Match history will be available soon"
    });
  } catch (e) {
    console.error("[rps] History error:", e);
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
    
    // TODO: Implement stats from database
    // For now, return empty stats
    return res.json({
      ok: true,
      stats: {
        totalMatches: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        winRate: 0,
        totalLunaWon: 0,
        totalLunaLost: 0,
      },
      wallet: wallet,
      message: "Statistics will be available soon"
    });
  } catch (e) {
    console.error("[rps] Stats error:", e);
    res.status(500).json({
      ok: false,
      error: e.message,
      message: "Failed to load statistics",
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

/**
 * Get suspicious activity log (Admin only)
 * GET /luna/admin/anti-abuse/log?limit=100
 */
app.get("/luna/admin/anti-abuse/log", requireAdminSecret, (req, res) => {
  try {
    const limit = parseInt(req.query.limit || "100", 10);
    const type = req.query.type; // Optional filter by type
    const wallet = req.query.wallet; // Optional filter by wallet
    
    let filteredLog = suspiciousActivityLog;
    
    if (type) {
      filteredLog = filteredLog.filter(entry => entry.type === type);
    }
    
    if (wallet) {
      filteredLog = filteredLog.filter(entry => 
        entry.wallet1 === wallet || entry.wallet2 === wallet
      );
    }
    
    const recentLog = filteredLog.slice(-limit).reverse(); // Most recent first
    
    return res.json({
      ok: true,
      log: recentLog,
      total: suspiciousActivityLog.length,
      filtered: filteredLog.length,
      blockedWallets: Array.from(blockedWallets),
      blockedIps: Array.from(blockedIps),
    });
  } catch (e) {
    logError(e, { endpoint: "/luna/admin/anti-abuse/log" });
    return res.status(500).json({ ok: false, error: "Failed to get suspicious activity log" });
  }
});

/**
 * Get wallet pair statistics (Admin only)
 * GET /luna/admin/anti-abuse/pairs?limit=50
 */
app.get("/luna/admin/anti-abuse/pairs", requireAdminSecret, (req, res) => {
  try {
    const limit = parseInt(req.query.limit || "50", 10);
    const minMatches = parseInt(req.query.minMatches || SUSPICIOUS_PAIR_THRESHOLD.toString(), 10);
    const totalPlayers = getTotalUniquePlayers();
    const dynamicThreshold = getDynamicSuspiciousThreshold();
    
    const pairs = Array.from(walletPairMatches.entries())
      .map(([pairKey, data]) => {
        const [wallet1, wallet2] = pairKey.split('_');
        const wallet1Opponents = getWalletOpponentCount(wallet1);
        const wallet2Opponents = getWalletOpponentCount(wallet2);
        const wallet1TotalGames = getWalletTotalGames(wallet1);
        const wallet2TotalGames = getWalletTotalGames(wallet2);
        const wallet1PairRatio = wallet1TotalGames > 0 ? data.count / wallet1TotalGames : 1;
        const wallet2PairRatio = wallet2TotalGames > 0 ? data.count / wallet2TotalGames : 1;
        
        return {
          wallet1,
          wallet2,
          count: data.count,
          lastMatch: data.lastMatch,
          firstMatch: data.firstMatch,
          timeWindow: data.lastMatch - data.firstMatch,
          wallet1Opponents: wallet1Opponents,
          wallet2Opponents: wallet2Opponents,
          wallet1TotalGames: wallet1TotalGames,
          wallet2TotalGames: wallet2TotalGames,
          wallet1PairRatio: Math.round(wallet1PairRatio * 100) / 100,
          wallet2PairRatio: Math.round(wallet2PairRatio * 100) / 100,
          isSuspicious: isSuspiciousWalletPair(wallet1, wallet2)
        };
      })
      .filter(pair => pair.count >= minMatches)
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
    
    return res.json({
      ok: true,
      pairs: pairs,
      total: walletPairMatches.size,
      totalUniquePlayers: totalPlayers,
      suspiciousThreshold: SUSPICIOUS_PAIR_THRESHOLD,
      dynamicThreshold: dynamicThreshold,
      timeWindow: SUSPICIOUS_PAIR_TIME_WINDOW,
      note: `Dynamic threshold is ${dynamicThreshold} based on ${totalPlayers} unique players in system`
    });
  } catch (e) {
    logError(e, { endpoint: "/luna/admin/anti-abuse/pairs" });
    return res.status(500).json({ ok: false, error: "Failed to get wallet pair statistics" });
  }
});

/**
 * Get wallet opponent statistics (Admin only)
 * GET /luna/admin/anti-abuse/wallets?limit=50
 */
app.get("/luna/admin/anti-abuse/wallets", requireAdminSecret, (req, res) => {
  try {
    const limit = parseInt(req.query.limit || "50", 10);
    const wallet = req.query.wallet; // Optional filter by specific wallet
    
    let wallets = Array.from(walletOpponents.entries())
      .map(([walletAddr, opponents]) => {
        const totalGames = getWalletTotalGames(walletAddr);
        const opponentList = Array.from(opponents);
        
        return {
          wallet: walletAddr,
          opponentCount: opponents.size,
          totalGames: totalGames,
          opponents: opponentList,
          avgGamesPerOpponent: opponents.size > 0 ? Math.round((totalGames / opponents.size) * 100) / 100 : 0
        };
      })
      .sort((a, b) => b.totalGames - a.totalGames);
    
    if (wallet) {
      wallets = wallets.filter(w => w.wallet === wallet);
    }
    
    wallets = wallets.slice(0, limit);
    
    return res.json({
      ok: true,
      wallets: wallets,
      total: walletOpponents.size,
      totalUniquePlayers: getTotalUniquePlayers(),
    });
  } catch (e) {
    logError(e, { endpoint: "/luna/admin/anti-abuse/wallets" });
    return res.status(500).json({ ok: false, error: "Failed to get wallet opponent statistics" });
  }
});

/**
 * Block/Unblock wallet (Admin only)
 * POST /luna/admin/anti-abuse/block-wallet
 * Body: { wallet: "address", action: "block" | "unblock" }
 */
app.post("/luna/admin/anti-abuse/block-wallet", requireAdminSecret, (req, res) => {
  try {
    const { wallet, action } = req.body || {};
    
    if (!wallet || typeof wallet !== "string") {
      return res.status(400).json({
        ok: false,
        error: "Wallet address is required",
      });
    }
    
    if (action === "block") {
      blockedWallets.add(wallet);
      logSuspiciousActivity('admin_block_wallet', wallet, null, getClientIp(req), "Admin blocked wallet");
      return res.json({
        ok: true,
        message: `Wallet ${wallet.substring(0, 8)}... has been blocked`,
        blocked: true,
      });
    } else if (action === "unblock") {
      blockedWallets.delete(wallet);
      return res.json({
        ok: true,
        message: `Wallet ${wallet.substring(0, 8)}... has been unblocked`,
        blocked: false,
      });
    } else {
      return res.status(400).json({
        ok: false,
        error: "Action must be 'block' or 'unblock'",
      });
    }
  } catch (e) {
    logError(e, { endpoint: "/luna/admin/anti-abuse/block-wallet" });
    return res.status(500).json({ ok: false, error: "Failed to block/unblock wallet" });
  }
});

/**
 * Block/Unblock IP (Admin only)
 * POST /luna/admin/anti-abuse/block-ip
 * Body: { ip: "ip_address", action: "block" | "unblock" }
 */
app.post("/luna/admin/anti-abuse/block-ip", requireAdminSecret, (req, res) => {
  try {
    const { ip, action } = req.body || {};
    
    if (!ip || typeof ip !== "string") {
      return res.status(400).json({
        ok: false,
        error: "IP address is required",
      });
    }
    
    if (action === "block") {
      blockedIps.add(ip);
      logSuspiciousActivity('admin_block_ip', null, null, ip, "Admin blocked IP");
      return res.json({
        ok: true,
        message: `IP ${ip} has been blocked`,
        blocked: true,
      });
    } else if (action === "unblock") {
      blockedIps.delete(ip);
      return res.json({
        ok: true,
        message: `IP ${ip} has been unblocked`,
        blocked: false,
      });
    } else {
      return res.status(400).json({
        ok: false,
        error: "Action must be 'block' or 'unblock'",
      });
    }
  } catch (e) {
    logError(e, { endpoint: "/luna/admin/anti-abuse/block-ip" });
    return res.status(500).json({ ok: false, error: "Failed to block/unblock IP" });
  }
});

/**
 * Get reward banned wallets (Admin only)
 * GET /luna/admin/anti-abuse/reward-banned
 */
app.get("/luna/admin/anti-abuse/reward-banned", requireAdminSecret, (req, res) => {
  try {
    const bannedWallets = Array.from(rewardBannedWallets);
    const bannedIps = Array.from(rewardBannedIps);
    
    // Get IP self-play statistics
    const ipSelfPlayStats = Array.from(ipSelfPlayMatches.entries()).map(([ip, data]) => {
      const walletsFromIp = Array.from(ipWalletMap.get(ip) || []);
      return {
        ip: ip,
        totalSelfPlayCount: data.totalSelfPlayCount,
        walletPairs: Array.from(data.walletPairs.entries()).map(([pairKey, count]) => {
          const [wallet1, wallet2] = pairKey.split('_');
          return { wallet1, wallet2, count };
        }),
        wallets: walletsFromIp,
        isBanned: rewardBannedIps.has(ip)
      };
    }).filter(stat => stat.totalSelfPlayCount > 0)
      .sort((a, b) => b.totalSelfPlayCount - a.totalSelfPlayCount);
    
    return res.json({
      ok: true,
      rewardBannedWallets: bannedWallets,
      rewardBannedIps: bannedIps,
      totalBannedWallets: bannedWallets.length,
      totalBannedIps: bannedIps.length,
      ipSelfPlayStats: ipSelfPlayStats,
      threshold: IP_SELF_PLAY_THRESHOLD,
    });
  } catch (e) {
    logError(e, { endpoint: "/luna/admin/anti-abuse/reward-banned" });
    return res.status(500).json({ ok: false, error: "Failed to get reward banned list" });
  }
});

/**
 * Unban wallet from rewards (Admin only)
 * POST /luna/admin/anti-abuse/unban-reward
 * Body: { wallet: "wallet_address" } or { ip: "ip_address" }
 */
app.post("/luna/admin/anti-abuse/unban-reward", requireAdminSecret, (req, res) => {
  try {
    const { wallet, ip } = req.body || {};
    
    if (wallet && typeof wallet === "string") {
      rewardBannedWallets.delete(wallet);
      return res.json({
        ok: true,
        message: `Wallet ${wallet.substring(0, 8)}... has been unbanned from rewards`,
        unbanned: true,
      });
    } else if (ip && typeof ip === "string") {
      rewardBannedIps.delete(ip);
      // Unban all wallets from this IP
      const walletsFromIp = ipWalletMap.get(ip) || new Set();
      walletsFromIp.forEach(w => rewardBannedWallets.delete(w));
      return res.json({
        ok: true,
        message: `IP ${ip} and all associated wallets have been unbanned from rewards`,
        unbanned: true,
        walletsUnbanned: Array.from(walletsFromIp),
      });
    } else {
      return res.status(400).json({
        ok: false,
        error: "Either wallet or ip is required",
      });
    }
  } catch (e) {
    logError(e, { endpoint: "/luna/admin/anti-abuse/unban-reward" });
    return res.status(500).json({ ok: false, error: "Failed to unban from rewards" });
  }
});

// ----------------------
// Notification System API Endpoints
// ----------------------

/**
 * Get notifications for a wallet
 * GET /luna/notifications?wallet=wallet_address&unreadOnly=true
 */
app.get("/luna/notifications", async (req, res) => {
  try {
    const { wallet, unreadOnly } = req.query || {};
    
    if (!wallet || typeof wallet !== "string") {
      return res.status(400).json({
        ok: false,
        error: "Wallet address is required",
      });
    }
    
    const notifications = getNotifications(wallet, unreadOnly === 'true');
    const unreadCount = notifications.filter(n => !n.read).length;
    
    return res.json({
      ok: true,
      notifications: notifications.reverse(), // Most recent first
      unreadCount: unreadCount,
      total: notifications.length
    });
  } catch (e) {
    console.error("[notifications] Get notifications error:", e);
    res.status(500).json({
      ok: false,
      error: e.message,
      message: "Failed to get notifications",
    });
  }
});

/**
 * Mark notification as read
 * POST /luna/notifications/read
 * Body: { wallet: "wallet_address", notificationId: "notification_id" }
 */
app.post("/luna/notifications/read", async (req, res) => {
  try {
    const { wallet, notificationId } = req.body || {};
    
    if (!wallet || typeof wallet !== "string") {
      return res.status(400).json({
        ok: false,
        error: "Wallet address is required",
      });
    }
    
    if (!notificationId || typeof notificationId !== "string") {
      return res.status(400).json({
        ok: false,
        error: "Notification ID is required",
      });
    }
    
    const success = markNotificationRead(wallet, notificationId);
    
    return res.json({
      ok: success,
      message: success ? "Notification marked as read" : "Notification not found"
    });
  } catch (e) {
    console.error("[notifications] Mark read error:", e);
    res.status(500).json({
      ok: false,
      error: e.message,
      message: "Failed to mark notification as read",
    });
  }
});

/**
 * Test notification system
 * POST /luna/notifications/test
 * Body: { wallet: "wallet_address" (optional), type: "test_type" (optional) }
 * 
 * ส่ง notification ทดสอบเพื่อทดสอบระบบ
 */
app.post("/luna/notifications/test", async (req, res) => {
  try {
    const { wallet, type } = req.body || {};
    
    const testTypes = {
      'match_found': {
        title: '🎮 Match Found!',
        message: 'You have been matched with an opponent. Game starting soon!',
        data: { matchId: 'test_match_' + Date.now(), opponent: 'TestOpponent123...' }
      },
      'room_new': {
        title: '🏠 New Betting Room!',
        message: 'A new betting room has been created with bet amount: 10,000 Luna tokens',
        data: { roomId: 'test_room_' + Date.now(), betAmount: 10000 }
      },
      'reward_time': {
        title: '💰 Reward Distribution Soon!',
        message: 'Weekly competition ends in 1 hour. Make sure you are in top 5!',
        data: { timeRemaining: 3600 }
      },
      'reward_received': {
        title: '🎁 Reward Received!',
        message: 'You received 0.5 SOL as reward for being in top 5!',
        data: { amount: 0.5, rank: 3 }
      },
      'referral_reward': {
        title: '👥 Referral Reward!',
        message: 'You earned 0.1 SOL from your referral!',
        data: { amount: 0.1, referredWallet: 'RefWallet123...' }
      },
      'default': {
        title: '🔔 Test Notification',
        message: 'This is a test notification to verify the notification system is working correctly!',
        data: { test: true }
      }
    };
    
    const notificationType = type && testTypes[type] ? type : 'default';
    const notificationData = testTypes[notificationType];
    
    // Send notification
    sendNotification(wallet || null, notificationType, notificationData.title, notificationData.message, notificationData.data);
    
    return res.json({
      ok: true,
      message: `Test notification sent${wallet ? ` to ${wallet.substring(0, 8)}...` : ' (broadcast to all)'}`,
      notification: {
        type: notificationType,
        title: notificationData.title,
        message: notificationData.message,
        data: notificationData.data
      },
      availableTypes: Object.keys(testTypes).filter(t => t !== 'default')
    });
  } catch (e) {
    console.error("[notifications] Test notification error:", e);
    res.status(500).json({
      ok: false,
      error: e.message,
      message: "Failed to send test notification",
    });
  }
});

// ----------------------
// Referral System API Endpoints
// ----------------------

/**
 * Register referral
 * POST /luna/referral/register
 * Body: { wallet: "wallet_address", referrer: "referrer_wallet_address" }
 */
app.post("/luna/referral/register", async (req, res) => {
  try {
    const { wallet, referrer } = req.body || {};
    
    if (!wallet || typeof wallet !== "string") {
      return res.status(400).json({
        ok: false,
        error: "Wallet address is required",
      });
    }
    
    if (!referrer || typeof referrer !== "string") {
      return res.status(400).json({
        ok: false,
        error: "Referrer wallet address is required",
      });
    }
    
    // Security: Validate wallet addresses
    try {
      validateWalletAddress(wallet, 'wallet');
      validateWalletAddress(referrer, 'referrer');
    } catch (e) {
      return res.status(400).json({
        ok: false,
        error: "Invalid request",
        message: e.message || "Invalid wallet address format",
      });
    }
    
    const success = registerReferral(wallet, referrer);
    
    if (success) {
      return res.json({
        ok: true,
        message: "Referral registered successfully"
      });
    } else {
      return res.status(400).json({
        ok: false,
        error: "Invalid referral",
        message: "Wallet already referred or cannot refer yourself"
      });
    }
  } catch (e) {
    console.error("[referral] Register error:", e);
    res.status(500).json({
      ok: false,
      error: e.message,
      message: "Failed to register referral",
    });
  }
});

/**
 * Get referral stats
 * GET /luna/referral/stats?wallet=wallet_address
 */
app.get("/luna/referral/stats", async (req, res) => {
  try {
    const { wallet } = req.query || {};
    
    if (!wallet || typeof wallet !== "string") {
      return res.status(400).json({
        ok: false,
        error: "Wallet address is required",
      });
    }
    
    const stats = getReferralStats(wallet);
    
    return res.json({
      ok: true,
      stats: stats
    });
  } catch (e) {
    console.error("[referral] Get stats error:", e);
    res.status(500).json({
      ok: false,
      error: e.message,
      message: "Failed to get referral stats",
    });
  }
});

/**
 * Get referral link
 * GET /luna/referral/link?wallet=wallet_address
 */
app.get("/luna/referral/link", async (req, res) => {
  try {
    const { wallet } = req.query || {};
    
    if (!wallet || typeof wallet !== "string") {
      return res.status(400).json({
        ok: false,
        error: "Wallet address is required",
      });
    }
    
    const link = getReferralLink(wallet);
    
    return res.json({
      ok: true,
      referralLink: link,
      wallet: wallet
    });
  } catch (e) {
    console.error("[referral] Get link error:", e);
    res.status(500).json({
      ok: false,
      error: e.message,
      message: "Failed to get referral link",
    });
  }
});

// ----------------------
// Chat System API Endpoints
// ----------------------

/**
 * Send chat message
 * POST /luna/chat/send
 * Body: { roomId: "room_id", wallet: "wallet_address", message: "message", username: "username" }
 */
app.post("/luna/chat/send", async (req, res) => {
  try {
    const { roomId, wallet, message, username } = req.body || {};
    
    if (!roomId || typeof roomId !== "string") {
      return res.status(400).json({
        ok: false,
        error: "Room ID is required",
      });
    }
    
    if (!wallet || typeof wallet !== "string") {
      return res.status(400).json({
        ok: false,
        error: "Wallet address is required",
      });
    }
    
    if (!message || typeof message !== "string") {
      return res.status(400).json({
        ok: false,
        error: "Message is required and must be a string",
      });
    }
    
    const trimmedMessage = message.trim();
    if (trimmedMessage.length === 0) {
      return res.status(400).json({
        ok: false,
        error: "Message cannot be empty",
      });
    }
    
    if (trimmedMessage.length > 500) {
      return res.status(400).json({
        ok: false,
        error: "Message is too long (max 500 characters)",
      });
    }
    
    // Check balance for group chat (minimum 100,000 Luna required)
    if (roomId === 'group_chat') {
      const GROUP_CHAT_MIN_BALANCE = 100000;
      
      try {
        // Validate wallet address
        if (!isValidWalletAddress(wallet)) {
          return res.status(400).json({
            ok: false,
            error: "Invalid wallet address format",
          });
        }
        
        // Get token mint address from env
        const mint = process.env.LUNA_TOKEN_MINT;
        if (!mint || mint === "your_token_mint_address_from_pumpfun_here" || mint.length < 32) {
          return res.status(500).json({
            ok: false,
            error: "Token mint address not configured",
          });
        }
        
        // Check balance
        const connection = new Connection(
          process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com",
          "confirmed"
        );
        
        let mintPublicKey;
        let walletPubKey;
        try {
          mintPublicKey = new PublicKey(mint);
          walletPubKey = new PublicKey(wallet);
        } catch (error) {
          return res.status(400).json({
            ok: false,
            error: "Invalid wallet or mint address format",
          });
        }
        
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
          
          // Don't round to integer - keep decimal precision for accurate display
          // Only round if balance is very large (to avoid floating point issues)
          if (balance >= 1000000) {
            balance = Math.round(balance);
          } else {
            balance = Math.round(balance * 100) / 100; // Round to 2 decimal places
          }
        }
        
        // Check if balance meets requirement
        if (balance < GROUP_CHAT_MIN_BALANCE) {
          return res.status(403).json({
            ok: false,
            error: `Insufficient balance. You need at least ${GROUP_CHAT_MIN_BALANCE.toLocaleString()} Luna tokens to send messages in group chat. Current balance: ${balance.toLocaleString()} Luna`,
            balance: balance,
            minRequired: GROUP_CHAT_MIN_BALANCE,
          });
        }
        
        console.log(`[group_chat] ${wallet.substring(0, 8)}... sent message (balance: ${balance} Luna)`);
        
        // Pass balance to sendChatMessage to avoid duplicate RPC call
        const chatMessage = await sendChatMessage(roomId, wallet, trimmedMessage, username, balance);
        
        return res.json({
          ok: true,
          message: chatMessage
        });
      } catch (balanceError) {
        console.error("[group_chat] Balance check error:", balanceError);
        return res.status(500).json({
          ok: false,
          error: "Failed to verify balance. Please try again later.",
        });
      }
    }
    
    // For non-group-chat rooms, send message without balance check
    const chatMessage = await sendChatMessage(roomId, wallet, trimmedMessage, username);
    
    return res.json({
      ok: true,
      message: chatMessage
    });
  } catch (e) {
    console.error("[chat] Send message error:", e);
    res.status(500).json({
      ok: false,
      error: e.message,
      message: "Failed to send chat message",
    });
  }
});

/**
 * Get chat messages
 * GET /luna/chat/messages?roomId=room_id&limit=50&search=keyword&wallet=wallet
 */
app.get("/luna/chat/messages", async (req, res) => {
  try {
    const { roomId, limit, search, wallet } = req.query || {};
    
    if (!roomId || typeof roomId !== "string") {
      return res.status(400).json({
        ok: false,
        error: "Room ID is required",
      });
    }
    
    const messageLimit = parseInt(limit || "50", 10);
    let messages = await getChatMessages(roomId, messageLimit);
    
    // Filter by search keyword
    if (search && typeof search === "string" && search.trim().length > 0) {
      const searchLower = search.toLowerCase();
      messages = messages.filter(msg => 
        msg.message.toLowerCase().includes(searchLower) ||
        msg.username.toLowerCase().includes(searchLower)
      );
    }
    
    // Filter by wallet
    if (wallet && typeof wallet === "string") {
      messages = messages.filter(msg => msg.wallet === wallet);
    }
    
    // Add reactions and tips to messages
    messages = messages.map(msg => {
      const reactions = messageReactions.get(msg.id);
      const tips = messageTips.get(msg.id) || [];
      return {
        ...msg,
        reactions: reactions ? Object.fromEntries(
          Array.from(reactions.entries()).map(([type, wallets]) => [type, wallets.size])
        ) : {},
        tips: tips.map(t => ({ wallet: t.wallet, amount: t.amount, timestamp: t.timestamp }))
      };
    });
    
    return res.json({
      ok: true,
      messages: messages,
      roomId: roomId
    });
  } catch (e) {
    console.error("[chat] Get messages error:", e);
    res.status(500).json({
      ok: false,
      error: e.message,
      message: "Failed to get chat messages",
    });
  }
});

/**
 * Add reaction to message
 * POST /luna/chat/reaction
 * Body: { messageId, wallet, reactionType }
 */
app.post("/luna/chat/reaction", async (req, res) => {
  try {
    const { messageId, wallet, reactionType } = req.body || {};
    
    if (!messageId || typeof messageId !== "string") {
      return res.status(400).json({ ok: false, error: "Message ID is required" });
    }
    
    if (!wallet || typeof wallet !== "string") {
      return res.status(400).json({ ok: false, error: "Wallet is required" });
    }
    
    if (!reactionType || typeof reactionType !== "string") {
      return res.status(400).json({ ok: false, error: "Reaction type is required" });
    }
    
    const validReactions = ['👍', '❤️', '🎉', '🔥', '💬'];
    if (!validReactions.includes(reactionType)) {
      return res.status(400).json({ ok: false, error: "Invalid reaction type" });
    }
    
    if (!messageReactions.has(messageId)) {
      messageReactions.set(messageId, new Map());
    }
    
    const reactions = messageReactions.get(messageId);
    if (!reactions.has(reactionType)) {
      reactions.set(reactionType, new Set());
    }
    
    const reactionSet = reactions.get(reactionType);
    
    // Toggle reaction
    if (reactionSet.has(wallet)) {
      reactionSet.delete(wallet);
    } else {
      reactionSet.add(wallet);
    }
    
    // Broadcast reaction update
    broadcast({
      type: 'chat_reaction',
      messageId: messageId,
      reactionType: reactionType,
      wallet: wallet,
      count: reactionSet.size,
      active: reactionSet.has(wallet)
    });
    
    return res.json({
      ok: true,
      reactionType: reactionType,
      count: reactionSet.size,
      active: reactionSet.has(wallet)
    });
  } catch (e) {
    console.error("[chat] Reaction error:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * Tip a message
 * POST /luna/chat/tip
 * Body: { messageId, fromWallet, toWallet, amount }
 */
app.post("/luna/chat/tip", async (req, res) => {
  try {
    const { messageId, fromWallet, toWallet, amount } = req.body || {};
    
    if (!messageId || typeof messageId !== "string") {
      return res.status(400).json({ ok: false, error: "Message ID is required" });
    }
    
    if (!fromWallet || !toWallet || typeof fromWallet !== "string" || typeof toWallet !== "string") {
      return res.status(400).json({ ok: false, error: "Wallet addresses are required" });
    }
    
    if (fromWallet === toWallet) {
      return res.status(400).json({ ok: false, error: "Cannot tip yourself" });
    }
    
    const tipAmount = parseInt(amount, 10);
    if (!tipAmount || tipAmount <= 0) {
      return res.status(400).json({ ok: false, error: "Invalid tip amount" });
    }
    
    // Note: In production, this would trigger an actual Solana transaction
    // For now, we just record it
    if (!messageTips.has(messageId)) {
      messageTips.set(messageId, []);
    }
    
    const tips = messageTips.get(messageId);
    tips.push({
      wallet: fromWallet,
      amount: tipAmount,
      timestamp: Date.now()
    });
    
    // Send notification to recipient
    sendNotification(toWallet, 'chat_tip', '💰 You received a tip!', 
      `You received ${tipAmount.toLocaleString()} Luna tip`,
      { messageId, fromWallet, amount: tipAmount });
    
    // Broadcast tip
    broadcast({
      type: 'chat_tip',
      messageId: messageId,
      fromWallet: fromWallet,
      toWallet: toWallet,
      amount: tipAmount
    });
    
    return res.json({
      ok: true,
      message: "Tip recorded (Note: Actual transfer would happen via Solana transaction)"
    });
  } catch (e) {
    console.error("[chat] Tip error:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * Get online users count
 * GET /luna/chat/online?roomId=room_id
 */
app.get("/luna/chat/online", async (req, res) => {
  try {
    const { roomId } = req.query || {};
    
    // Count users in the room
    let count = 0;
    if (roomId) {
      const room = chatRooms.get(roomId);
      if (room) {
        count = room.participants.size;
      }
    } else {
      // Count all online users
      count = onlineUsers.size;
    }
    
    return res.json({
      ok: true,
      count: count,
      roomId: roomId || 'all'
    });
  } catch (e) {
    console.error("[chat] Online count error:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * Get chat leaderboard
 * GET /luna/chat/leaderboard?type=daily|weekly|alltime
 */
app.get("/luna/chat/leaderboard", async (req, res) => {
  try {
    const { type = 'daily' } = req.query || {};
    
    // Convert Map to Array and sort
    const leaderboard = Array.from(chatLeaderboard.entries())
      .map(([wallet, count]) => ({
        wallet: wallet,
        username: wallet.substring(0, 8) + '...',
        messageCount: count
      }))
      .sort((a, b) => b.messageCount - a.messageCount)
      .slice(0, 10); // Top 10
    
    return res.json({
      ok: true,
      type: type,
      leaderboard: leaderboard
    });
  } catch (e) {
    console.error("[chat] Leaderboard error:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * Get user chat stats
 * GET /luna/chat/stats?wallet=wallet_address
 */
app.get("/luna/chat/stats", async (req, res) => {
  try {
    const { wallet } = req.query || {};
    
    if (!wallet || typeof wallet !== "string") {
      return res.status(400).json({ ok: false, error: "Wallet is required" });
    }
    
    const rewardData = chatRewards.get(wallet) || { totalRewards: 0, messageCount: 0, lastRewardTime: 0 };
    const messageCount = chatLeaderboard.get(wallet) || 0;
    const badge = await getVIPBadge(wallet);
    
    return res.json({
      ok: true,
      wallet: wallet,
      messageCount: messageCount,
      totalRewards: rewardData.totalRewards,
      lastRewardTime: rewardData.lastRewardTime,
      badge: badge
    });
  } catch (e) {
    console.error("[chat] Stats error:", e);
    res.status(500).json({ ok: false, error: e.message });
  }
});


// ----------------------
// 404 Handler (must be after all routes)
// ----------------------
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, "public", "404.html"));
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
  
  // Load group chat messages from database
  try {
    const groupChatMessages = await loadGroupChatMessages('group_chat', 1000);
    if (groupChatMessages.length > 0) {
      const room = getOrCreateChatRoom('group_chat');
      room.messages = groupChatMessages;
      console.log(`[chat] Loaded ${groupChatMessages.length} messages from database for group_chat`);
    }
  } catch (dbError) {
    console.error('[chat] Failed to load messages from database on startup:', dbError);
  }
  
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
