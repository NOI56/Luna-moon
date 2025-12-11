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
import {
  initDB,
  logChat,
  saveGroupChatMessage,
  loadGroupChatMessages,
  clearAllDeposits,
  loadLeaderboardEntries,
  saveLeaderboardEntry,
  clearLeaderboardEntries,
  getLeaderboardEntry,
} from "./modules/db.js";
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
import { log } from "./modules/logger.js";
import { validateEnvironment } from "./modules/env-validator.js";
import { createBackup, listBackups, restoreBackup, getBackupStats, startAutoBackup } from "./modules/backup.js";
import { setupRpsRoutes } from "./routes/rps.js";
import { setupAdminRoutes } from "./routes/admin.js";
import { setupChatRoutes } from "./routes/chat.js";
import { setupStatusRoutes } from "./routes/status.js";
import { setupControlRoutes } from "./routes/control.js";
import { setupVtsRoutes } from "./routes/vts.js";
import { setupWebhookRoutes } from "./routes/webhook.js";
import { setupCsrfRoutes } from "./routes/csrf.js";
import { setupDepositRoutes } from "./routes/deposit.js";

// Utils
import { isValidWalletAddress, validateWalletAddress } from "./utils/validation.js";
import { estimateSpeechDurationMs, getClientIp, getAmericaHour, getNextMonday } from "./utils/helpers.js";
import { logError } from "./utils/errorHandler.js";

// Services
import { broadcast as broadcastMessage } from "./services/websocketService.js";
import { sendNotification as sendNotificationMessage } from "./services/notificationService.js";
import * as antiAbuseService from "./services/antiAbuseService.js";
import {
  fetchLunaPriceInSol as fetchLunaPriceInSolService,
  lunaToSol as lunaToSolService,
  getLunaPriceSync as getLunaPriceSyncService,
  getBettingFeePercentage as getBettingFeePercentageService,
  calculateFee as calculateFeeService,
  collectFee as collectFeeService
} from "./services/pricingService.js";
import {
  sendSol as sendSolService,
  sendLunaToken as sendLunaTokenService,
  distributeRewards as distributeRewardsService
} from "./services/solanaService.js";
import { getWalletBalance as getWalletBalanceService } from "./services/walletBalanceService.js";
import { initializeCompetition as initializeCompetitionService } from "./services/competitionService.js";

const {
  logSuspiciousActivity: logSuspiciousActivityService,
  getTotalUniquePlayers: getTotalUniquePlayersService,
  getWalletOpponentCount: getWalletOpponentCountService,
  getWalletTotalGames: getWalletTotalGamesService,
  getDynamicSuspiciousThreshold: getDynamicSuspiciousThresholdService,
  isSuspiciousWalletPair: isSuspiciousWalletPairService,
  recordWalletPairMatch: recordWalletPairMatchService,
  checkIpRateLimit: checkIpRateLimitService,
  updateIpActivity: updateIpActivityService,
  trackWalletIp: trackWalletIpService,
  validateGameRequest: validateGameRequestService,
} = antiAbuseService;

// Config
import {
  RPS_CONSTANTS,
  DEPOSIT_CONSTANTS,
  ANTI_ABUSE_CONSTANTS,
  CHAT_CONSTANTS,
  VIP_BADGES,
  MESSAGE_REWARD_CONSTANTS,
  REFERRAL_CONSTANTS,
  CACHE_CONSTANTS,
  REWARD_CONSTANTS,
  SOLANA_CONSTANTS
} from "./config/constants.js";

// State
import { initializeState } from "./state/state.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// #region agent log
const agentDebugSessionId = 'debug-session';
const agentDebugRunId = 'pre-fix-run1';
const agentLog = (hypothesisId, message, data = {}) => {
  fetch('http://127.0.0.1:7242/ingest/76e7b26c-011f-4a99-a9fd-9ede455768f0', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId: agentDebugSessionId,
      runId: agentDebugRunId,
      hypothesisId,
      location: 'index.js:startup',
      message,
      data,
      timestamp: Date.now()
    })
  }).catch(() => {});
};

agentLog('H1', 'envFlags', {
  debugEnvEnabled: process.env.DEBUG === 'true',
  nodeEnv: process.env.NODE_ENV || 'undefined'
});
agentLog('H2', 'execArgsInspect', {
  hasInspectFlag: process.execArgv.some(arg => arg.includes('inspect')),
  execArgv: process.execArgv
});
agentLog('H3', 'frontendDebugToggle', {
  forceDebugFrontEnd: process.env.ENABLE_DEBUG_UI === 'true',
  corsOriginsSet: Boolean(process.env.CORS_ORIGINS)
});
agentLog('H4', 'loggingConfig', {
  logLevel: process.env.LOG_LEVEL || 'info',
  logConsole: process.env.LOG_CONSOLE,
  logVerbose: process.env.LOG_VERBOSE,
  enhancedLogging: process.env.ENHANCED_LOGGING
});
agentLog('H5', 'featureFlags', {
  enableCsrf: process.env.ENABLE_CSRF,
  idleMonologue: process.env.IDLE_MONOLOGUE_ENABLED,
  ambientMurmur: process.env.AMBIENT_MURMUR_ENABLED,
  debugFlag: process.env.DEBUG
});
// #endregion agent log

// ----------------------
// Configuration Validation
// ----------------------
// Wallet validation functions are imported from utils/validation.js

function validateConfig() {
  // Use enhanced environment validator
  const { errors, warnings } = validateEnvironment();

  // Log errors and warnings
  if (errors.length > 0) {
    log.error("[config] ❌ Configuration errors:");
    errors.forEach(err => log.error(`  - ${err}`));
    log.error("[config] Please fix these errors before starting the server.");
    process.exit(1);
  }

  if (warnings.length > 0) {
    log.warn("[config] ⚠️  Configuration warnings:");
    warnings.forEach(warn => log.warn(`  - ${warn}`));
  } else {
    log.info("[config] ✅ Configuration validated");
  }
}

validateConfig();

// ----------------------
// Global Error Handlers (must be before everything else)
// ----------------------

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  log.error('[unhandledRejection] Unhandled Rejection at:', promise, 'reason:', reason);
  log.error('[unhandledRejection] Stack:', reason?.stack);
  // Don't exit - let the server continue running
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  log.error('[uncaughtException] Uncaught Exception:', error);
  log.error('[uncaughtException] Stack:', error?.stack);
  console.error('[uncaughtException]', error);
  if (error?.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});

log.info('[startup] Global error handlers registered');

// ----------------------
// Express + WebSocket
// ----------------------

log.info('[startup] Creating Express app...');
const app = express();
log.info('[startup] Creating HTTP server...');
const server = http.createServer(app);
log.info('[startup] Creating WebSocket server...');
const wss = new WebSocketServer({ server });
let isDatabaseReady = false;

const PORT = process.env.PORT || 8787;
log.info(`[startup] Server will listen on port ${PORT}`);

// Initialize application state
const state = initializeState();

// Extract state variables for easier access
const {
  rpsMatchQueue,
  rpsActiveMatches,
  rpsBettingRooms,
  rpsLeaderboard,
  rpsGames,
  collectedFees,
  rewardPool: rewardPoolState,
  ipWalletMap,
  walletIpMap,
  ipActivityMap,
  walletPairMatches,
  walletOpponents,
  walletTotalGames,
  ipSelfPlayMatches,
  suspiciousActivityLog,
  blockedWallets,
  blockedIps,
  rewardBannedWallets,
  rewardBannedIps,
  userNotifications,
  referralData,
  referralMap,
  chatRooms,
  messageReactions,
  messageTips,
  chatRewards,
  onlineUsers,
  chatLeaderboard,
  badgeCache,
  stats,
  responseCache,
  priceCache,
  balanceCache,
  errorLog,
  lastChatTs: lastChatTsState,
  sleepyMode: sleepyModeState,
  forceAwake: forceAwakeState,
  clients,
  lastSpeechEndTime: lastSpeechEndTimeState,
  totalSpeechTime: totalSpeechTimeState,
  lunaEnergy: lunaEnergyState,
  consecutiveMessages: consecutiveMessagesState,
} = state;

// Create state accessors (maintain backward compatibility)
// Use direct references to state objects for mutable values
const stateAccessors = {
  get lastChatTs() { return lastChatTsState.value; },
  set lastChatTs(v) { lastChatTsState.value = v; },
  get sleepyMode() { return sleepyModeState.value; },
  set sleepyMode(v) { sleepyModeState.value = v; },
  get forceAwake() { return forceAwakeState.value; },
  set forceAwake(v) { forceAwakeState.value = v; },
  get lastSpeechEndTime() { return lastSpeechEndTimeState.value; },
  set lastSpeechEndTime(v) { lastSpeechEndTimeState.value = v; },
  get totalSpeechTime() { return totalSpeechTimeState.value; },
  set totalSpeechTime(v) { totalSpeechTimeState.value = v; },
  get lunaEnergy() { return lunaEnergyState.value; },
  set lunaEnergy(v) { lunaEnergyState.value = v; },
  get consecutiveMessages() { return consecutiveMessagesState.value; },
  set consecutiveMessages(v) { consecutiveMessagesState.value = v; },
  get rewardPool() { return rewardPoolState.value; },
  set rewardPool(v) { rewardPoolState.value = v; },
};

// Create local variables that reference state (for backward compatibility)
let lastChatTs = stateAccessors.lastChatTs;
let sleepyMode = stateAccessors.sleepyMode;
let forceAwake = stateAccessors.forceAwake;
let lastSpeechEndTime = stateAccessors.lastSpeechEndTime;
let totalSpeechTime = stateAccessors.totalSpeechTime;
let lunaEnergy = stateAccessors.lunaEnergy;
let consecutiveMessages = stateAccessors.consecutiveMessages;
let rewardPool = stateAccessors.rewardPool;

// Sync function to update local variables from state
function syncState() {
  lastChatTs = stateAccessors.lastChatTs;
  sleepyMode = stateAccessors.sleepyMode;
  forceAwake = stateAccessors.forceAwake;
  lastSpeechEndTime = stateAccessors.lastSpeechEndTime;
  totalSpeechTime = stateAccessors.totalSpeechTime;
  lunaEnergy = stateAccessors.lunaEnergy;
  consecutiveMessages = stateAccessors.consecutiveMessages;
  rewardPool = stateAccessors.rewardPool;
}

// Helper functions to update state (use these instead of direct assignment)
function updateLastChatTs(value) {
  stateAccessors.lastChatTs = value;
  lastChatTs = value;
}
function updateSleepyMode(value) {
  stateAccessors.sleepyMode = value;
  sleepyMode = value;
}
function updateForceAwake(value) {
  stateAccessors.forceAwake = value;
  forceAwake = value;
}
function updateLastSpeechEndTime(value) {
  stateAccessors.lastSpeechEndTime = value;
  lastSpeechEndTime = value;
}
function updateTotalSpeechTime(value) {
  stateAccessors.totalSpeechTime = value;
  totalSpeechTime = value;
}
function updateLunaEnergy(value) {
  stateAccessors.lunaEnergy = value;
  lunaEnergy = value;
}
function updateConsecutiveMessages(value) {
  stateAccessors.consecutiveMessages = value;
  consecutiveMessages = value;
}
function updateRewardPool(value) {
  stateAccessors.rewardPool = value;
  rewardPool = value;
}

// Helper functions are imported from utils/helpers.js and services/
// - estimateSpeechDurationMs: utils/helpers.js
// - broadcast: services/websocketService.js
// - sendNotification: services/notificationService.js

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
  res.header("X-Frame-Options", "SAMEORIGIN");
  res.header("X-XSS-Protection", "1; mode=block");
  
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json({ limit: "2mb" }));

// Add request timeout middleware to prevent hanging requests
app.use((req, res, next) => {
  // Set timeout for all requests (30 seconds)
  req.setTimeout(30000, () => {
    if (!res.headersSent) {
      log.warn(`[timeout] Request timeout: ${req.method} ${req.path}`);
      res.status(503).json({
        ok: false,
        error: "Request timeout - server is busy. Please try again later.",
        statusCode: 503
      });
    }
  });
  next();
});

// Add server status check middleware for API endpoints
app.use((req, res, next) => {
  // Only check for API endpoints
  if (req.path.startsWith('/luna/') || req.path.startsWith('/api/')) {
    // Check memory usage
    const memUsage = process.memoryUsage();
    const memoryUsageMB = memUsage.heapUsed / 1024 / 1024;
    const memoryLimitMB = 200; // 200 MB limit for 256 MB server (leave 56 MB buffer)
    
    if (memoryUsageMB > memoryLimitMB) {
      log.warn(`[memory] High memory usage: ${memoryUsageMB.toFixed(2)} MB / ${memoryLimitMB} MB`);
      // Don't block requests, just log warning
    }
  }
  next();
});

// Security: CSRF Protection Middleware (for POST/PUT/DELETE requests)
const csrfTokens = new Map(); // In-memory token store (use Redis in production)
const CSRF_TOKEN_TTL = 3600000; // 1 hour

function generateCSRFToken() {
  return crypto.randomBytes(32).toString('hex');
}

// CSRF token route has been moved to routes/csrf.js
// Old route removed - see routes/csrf.js for new modular route

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
// State variables are initialized from state/state.js above
// Constants are imported from config/constants.js

// Extract constants for easier access
const {
  MATCH_TIMEOUT,
  RPS_BETTING_ROOM_TIMEOUT,
  FEE_PERCENTAGE,
  BETTING_FEE_DEFAULT,
  BETTING_FEE_3_DAYS,
  BETTING_FEE_6_DAYS,
  RPS_MIN_BALANCE,
} = RPS_CONSTANTS;

const {
  DEPOSIT_MIN_BALANCE,
  DEPOSIT_FEE_PERCENTAGE,
  DEPOSIT_FEE_3_DAYS,
  DEPOSIT_FEE_6_DAYS,
} = DEPOSIT_CONSTANTS;

const {
  SUSPICIOUS_PAIR_THRESHOLD,
  SUSPICIOUS_PAIR_TIME_WINDOW,
  GAME_COOLDOWN,
  IP_SELF_PLAY_THRESHOLD,
  MAX_SUSPICIOUS_LOG,
} = ANTI_ABUSE_CONSTANTS;

const {
  CHAT_MESSAGE_LIMIT,
  CHAT_MESSAGE_EXPIRY,
  BADGE_CACHE_TTL,
} = CHAT_CONSTANTS;

const {
  MESSAGE_REWARD_CHANCE,
  MESSAGE_REWARD_MIN,
  MESSAGE_REWARD_MAX,
  FIRST_MESSAGE_BONUS,
} = MESSAGE_REWARD_CONSTANTS;

const {
  REFERRAL_REWARD_SIGNUP,
  REFERRAL_REWARD_FIRST_GAME,
  REFERRAL_REWARD_TOP10,
} = REFERRAL_CONSTANTS;

const {
  PRICE_CACHE_TTL,
  BALANCE_CACHE_TTL,
} = CACHE_CONSTANTS;

const {
  REWARD_PERCENTAGES,
} = REWARD_CONSTANTS;

const {
  SOL_MINT,
} = SOLANA_CONSTANTS;

// Security: Private keys and wallet addresses must come from environment variables only
// Never hardcode sensitive credentials in source code
const DEPOSIT_ESCROW_WALLET = process.env.DEPOSIT_ESCROW_WALLET;
const DEPOSIT_ESCROW_PRIVATE_KEY = process.env.DEPOSIT_ESCROW_PRIVATE_KEY;

// Warn if deposit system is not configured (but don't fail - system can still run)
if (!DEPOSIT_ESCROW_WALLET || !DEPOSIT_ESCROW_PRIVATE_KEY) {
  log.warn('[deposit] DEPOSIT_ESCROW_WALLET or DEPOSIT_ESCROW_PRIVATE_KEY not configured. Deposit withdrawal functionality will be disabled.');
}

// Weekly Competition System
// Competition ends every Monday at 00:00:00 UTC (Universal Time)
let competitionStartTime = Date.now(); // Start time of current competition
let competitionEndTime = getNextMonday(); // End time (next Monday 00:00:00 UTC)

// getNextMonday is imported from utils/helpers.js
// initializeCompetition is imported from services/competitionService.js

// Wrapper function for competition initialization
async function initializeCompetition() {
  const result = await initializeCompetitionService(
    rpsLeaderboard,
    rewardPoolState,
    competitionStartTime,
    competitionEndTime,
    distributeRewards,
    { clearPersistentLeaderboard }
  );
  competitionStartTime = result.competitionStartTime;
  competitionEndTime = result.competitionEndTime;
}

// Check competition status periodically (every minute for auto-distribution)
setInterval(async () => {
  const now = Date.now();
  if (now >= competitionEndTime) {
    // Competition ended, distribute rewards and start new one (handled by initializeCompetition)
    log.info(`[rps-competition] Weekly competition ended. Initializing new competition with auto-distribution...`);
    
    // Initialize new competition (will auto-distribute if distributeRewards is provided)
    await initializeCompetition();
  }
}, 60 * 1000); // Check every minute for faster auto-distribution

// Initialize on startup
initializeCompetition();

/**
 * Anti-Abuse Helper Functions
 * All functions are imported from services/antiAbuseService.js
 * Wrapper functions are created below to maintain compatibility with existing code
 */

// Wrapper functions for anti-abuse service
function logSuspiciousActivity(type, wallet1, wallet2, ip, reason) {
  return logSuspiciousActivityService(suspiciousActivityLog, MAX_SUSPICIOUS_LOG, type, wallet1, wallet2, ip, reason);
}

function getTotalUniquePlayers() {
  return getTotalUniquePlayersService(rpsLeaderboard);
}

function getWalletOpponentCount(wallet) {
  return getWalletOpponentCountService(walletOpponents, wallet);
}

function getWalletTotalGames(wallet) {
  return getWalletTotalGamesService(walletTotalGames, wallet);
}

function getDynamicSuspiciousThreshold() {
  return getDynamicSuspiciousThresholdService(rpsLeaderboard, SUSPICIOUS_PAIR_THRESHOLD);
}

function isSuspiciousWalletPair(wallet1, wallet2) {
  return isSuspiciousWalletPairService(walletPairMatches, walletOpponents, walletTotalGames, rpsLeaderboard, wallet1, wallet2, SUSPICIOUS_PAIR_THRESHOLD, SUSPICIOUS_PAIR_TIME_WINDOW);
}

function recordWalletPairMatch(wallet1, wallet2) {
  return recordWalletPairMatchService(walletPairMatches, walletOpponents, walletTotalGames, walletIpMap, ipWalletMap, ipSelfPlayMatches, rewardBannedWallets, rewardBannedIps, suspiciousActivityLog, MAX_SUSPICIOUS_LOG, IP_SELF_PLAY_THRESHOLD, wallet1, wallet2);
}

function checkIpRateLimit(ip) {
  return checkIpRateLimitService(ipActivityMap, GAME_COOLDOWN, ip);
}

function updateIpActivity(ip, customCooldownMs) {
  return updateIpActivityService(ipActivityMap, GAME_COOLDOWN, ip, customCooldownMs);
}

function trackWalletIp(wallet, ip) {
  return trackWalletIpService(ipWalletMap, walletIpMap, suspiciousActivityLog, MAX_SUSPICIOUS_LOG, wallet, ip);
}

function validateGameRequest(wallet1, wallet2, req) {
  return validateGameRequestService(blockedWallets, blockedIps, walletPairMatches, walletOpponents, walletTotalGames, rpsLeaderboard, walletIpMap, ipActivityMap, ipWalletMap, suspiciousActivityLog, MAX_SUSPICIOUS_LOG, GAME_COOLDOWN, SUSPICIOUS_PAIR_THRESHOLD, SUSPICIOUS_PAIR_TIME_WINDOW, req, wallet1, wallet2);
}

// Reward Pool System
// rewardPool is managed through state.rewardPool (from state/state.js)
// Security: Reward distribution wallet should come from environment variables
const REWARD_DISTRIBUTION_WALLET = process.env.REWARD_DISTRIBUTION_WALLET;

if (!REWARD_DISTRIBUTION_WALLET) {
  log.warn('[reward] REWARD_DISTRIBUTION_WALLET not configured. Reward distribution functionality will be disabled.');
}

// REWARD_PERCENTAGES is imported from config/constants.js
// priceCache, balanceCache are from state/state.js
// PRICE_CACHE_TTL, BALANCE_CACHE_TTL are imported from config/constants.js
// RPS_MIN_BALANCE is imported from config/constants.js
// SOL_MINT is imported from config/constants.js

// Luna token mint address (from env)
const LUNA_TOKEN_MINT = process.env.LUNA_TOKEN_MINT || null;
const BETTING_ESCROW_WALLET = process.env.BETTING_ESCROW_WALLET || null;
const BETTING_ESCROW_PRIVATE_KEY = process.env.BETTING_ESCROW_PRIVATE_KEY || null;
const BETTING_FEE_WALLET = process.env.BETTING_FEE_WALLET || null;
const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com";

/**
 * Pricing and Solana Functions
 * All functions are imported from services/pricingService.js and services/solanaService.js
 * Wrapper functions are created below to maintain compatibility with existing code
 */

// Wrapper functions for pricing & balance services
async function getWalletBalance(options = {}) {
  return getWalletBalanceService({
    balanceCache,
    cacheTtl: BALANCE_CACHE_TTL,
    ...options,
  });
}

async function fetchLunaPriceInSol() {
  return fetchLunaPriceInSolService(priceCache, LUNA_TOKEN_MINT, SOL_MINT, PRICE_CACHE_TTL);
}

async function lunaToSol(lunaAmount) {
  return lunaToSolService(priceCache, LUNA_TOKEN_MINT, SOL_MINT, PRICE_CACHE_TTL, lunaAmount);
}

function getLunaPriceSync() {
  return getLunaPriceSyncService(priceCache, LUNA_TOKEN_MINT);
}

async function getBettingFeePercentage(wallet) {
  return getBettingFeePercentageService(wallet, BETTING_FEE_DEFAULT, BETTING_FEE_3_DAYS, BETTING_FEE_6_DAYS);
}

async function calculateFee(lunaAmount, wallet = null) {
  return calculateFeeService(priceCache, LUNA_TOKEN_MINT, SOL_MINT, PRICE_CACHE_TTL, FEE_PERCENTAGE, BETTING_FEE_DEFAULT, BETTING_FEE_3_DAYS, BETTING_FEE_6_DAYS, lunaAmount, wallet);
}

async function collectFee(wallet, feeInSol, roomId, betAmount, options = {}) {
  return collectFeeService(collectedFees, sendSol, wallet, feeInSol, roomId, betAmount, rewardPoolState, options);
}

async function persistLeaderboardEntry(wallet, stats) {
  if (!wallet || !isDatabaseReady) {
    return;
  }
  try {
    await saveLeaderboardEntry(wallet, stats);
  } catch (error) {
    const shortWallet = typeof wallet === "string" ? `${wallet.substring(0, 8)}...` : "";
    log.error(`[rps] Failed to persist leaderboard entry ${shortWallet}:`, error);
  }
}

async function clearPersistentLeaderboard() {
  if (!isDatabaseReady) {
    return;
  }
  try {
    await clearLeaderboardEntries();
  } catch (error) {
    log.error("[rps] Failed to clear persistent leaderboard storage:", error);
  }
}

async function getPersistedLeaderboardEntry(wallet) {
  if (!wallet || !isDatabaseReady) {
    return null;
  }
  try {
    return await getLeaderboardEntry(wallet);
  } catch (error) {
    const shortWallet = typeof wallet === "string" ? `${wallet.substring(0, 8)}...` : "";
    log.error(`[rps] Failed to load leaderboard entry ${shortWallet} from database:`, error);
    return null;
  }
}

// Wrapper functions for solana service
async function sendSol(toWallet, amountInSol) {
  return sendSolService(toWallet, amountInSol);
}

async function sendLunaToken(toWallet, amountInLuna, options = {}) {
  return sendLunaTokenService(toWallet, amountInLuna, LUNA_TOKEN_MINT, {
    rpcUrl: SOLANA_RPC_URL,
    ...options,
  });
}

async function distributeRewards(totalRewardPool = null) {
  const result = await distributeRewardsService(rpsLeaderboard, rewardPoolState, rewardBannedWallets, REWARD_DISTRIBUTION_WALLET, REWARD_PERCENTAGES, sendSol, totalRewardPool);
  // Reset reward pool if using accumulated pool
  if (totalRewardPool === null && result.ok) {
    updateRewardPool(0);
  }
  return result;
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

// Store game state (in production, use Redis or DB)
// rpsGames is initialized from state/state.js above

// ----------------------
// Missing Functions for RPS Dependencies
// ----------------------

// Pricing and Solana functions are imported from services/
// Wrapper functions are defined above

// Setup RPS routes using modular route files
const rpsDependencies = {
  // Shared state
  rpsMatchQueue,
  rpsActiveMatches,
  rpsBettingRooms,
  rpsLeaderboard,
  collectedFees,
  rewardPool: rewardPoolState,
  rewardBannedWallets,
  rewardBannedIps,
  blockedWallets,
  blockedIps,
  priceCache,
  balanceCache,
  rpsGames,
  clients,
  walletIpMap,
  competitionStartTime,
  competitionEndTime,
  
  // Functions
  broadcast: (data) => broadcastMessage(clients, data),
  sendNotification: (wallet, type, title, message, data) => sendNotificationMessage(userNotifications, clients, wallet, type, title, message, data),
  validateWalletAddress,
  getClientIp,
  checkIpRateLimit,
  updateIpActivity,
  trackWalletIp,
  validateGameRequest,
  recordWalletPairMatch,
  fetchLunaPriceInSol: () => fetchLunaPriceInSol(),
  lunaToSol: (lunaAmount) => lunaToSol(lunaAmount),
  calculateFee: (lunaAmount, wallet) => calculateFee(lunaAmount, wallet),
  collectFee: (wallet, feeInSol, roomId, betAmount, options) => collectFee(wallet, feeInSol, roomId, betAmount, options),
  getBettingFeePercentage: (wallet) => getBettingFeePercentage(wallet),
  getWalletBalance: (options) => getWalletBalance(options),
  sendSol: (toWallet, amountInSol) => sendSol(toWallet, amountInSol),
  sendLunaToken: (toWallet, amountInLuna, options) => sendLunaToken(toWallet, amountInLuna, options),
  distributeRewards: (totalRewardPool) => distributeRewards(totalRewardPool),
  saveLeaderboardEntry: (wallet, stats) => persistLeaderboardEntry(wallet, stats),
  getLeaderboardEntry: (wallet) => getPersistedLeaderboardEntry(wallet),
  generateTTSClip: (text, mode) => generateTTS(text, mode),
  
  // Constants
  MATCH_TIMEOUT,
  RPS_BETTING_ROOM_TIMEOUT,
  FEE_PERCENTAGE,
  BETTING_FEE_DEFAULT,
  BETTING_FEE_3_DAYS,
  BETTING_FEE_6_DAYS,
  BETTING_FEE_WALLET,
  REWARD_DISTRIBUTION_WALLET,
  LUNA_TOKEN_MINT,
  SOL_MINT,
  RPS_MIN_BALANCE,
  BALANCE_CACHE_TTL,
  PRICE_CACHE_TTL,
  REWARD_PERCENTAGES,
  BETTING_ESCROW_WALLET,
  BETTING_ESCROW_PRIVATE_KEY,
  SOLANA_RPC_URL,
};

setupRpsRoutes(app, rpsDependencies);

// Admin Routes Dependencies
const adminDependencies = {
  // Statistics & Cache
  stats,
  responseCache,
  errorLog,
  
  // Anti-Abuse System
  blockedWallets,
  blockedIps,
  suspiciousActivityLog,
  walletPairMatches,
  walletOpponents,
  rewardBannedWallets,
  rewardBannedIps,
  ipSelfPlayMatches,
  ipWalletMap,
  
  // Helper Functions
  logError: (error, context) => logError(errorLog, error, context),
  logSuspiciousActivity,
  getClientIp,
  getTotalUniquePlayers,
  getWalletOpponentCount,
  getWalletTotalGames,
  getDynamicSuspiciousThreshold,
  isSuspiciousWalletPair,
  
  // Constants
  SUSPICIOUS_PAIR_THRESHOLD,
  SUSPICIOUS_PAIR_TIME_WINDOW,
  IP_SELF_PLAY_THRESHOLD,
};

setupAdminRoutes(app, adminDependencies);

// Chat Routes Dependencies
const chatDependencies = {
  // WebSocket
  wss,
  clients, // Shared WebSocket clients Set
  
  // Chat System State
  chatRooms,
  messageReactions,
  messageTips,
  chatRewards,
  onlineUsers,
  chatLeaderboard,
  badgeCache,
  
  // Notification System State
  userNotifications,
  
  // Referral System State
  referralData,
  referralMap,
  
  // Helper Functions
  isValidWalletAddress,
  validateWalletAddress,
  
  // Constants
  CHAT_MESSAGE_LIMIT,
  CHAT_MESSAGE_EXPIRY,
  BADGE_CACHE_TTL,
  VIP_BADGES,
  MESSAGE_REWARD_CHANCE,
  MESSAGE_REWARD_MIN,
  MESSAGE_REWARD_MAX,
  FIRST_MESSAGE_BONUS,
  REFERRAL_REWARD_SIGNUP,
  REFERRAL_REWARD_FIRST_GAME,
  REFERRAL_REWARD_TOP10,
};

setupChatRoutes(app, chatDependencies);

// Status Routes Dependencies
const statusDependencies = {
  // Statistics
  stats,
  logError,
  
  // System State
  PORT,
  lastChatTs,
  sleepyMode,
  forceAwake,
  clients,
};

setupStatusRoutes(app, statusDependencies);

// Control Routes Dependencies (Wake, Sleep)
const controlDependencies = {
  // Functions (for updating state)
  setSleepyMode: (value) => { updateSleepyMode(value); },
  setForceAwake: (value) => { updateForceAwake(value); },
};

setupControlRoutes(app, controlDependencies);

// VTS Routes Dependencies (Expression, Parameters)
setupVtsRoutes(app, {});

// Deposit Routes Dependencies
const depositDependencies = {
  DEPOSIT_ESCROW_WALLET,
  DEPOSIT_ESCROW_PRIVATE_KEY,
  DEPOSIT_MIN_BALANCE,
  LUNA_TOKEN_MINT,
  SOLANA_RPC_URL: process.env.SOLANA_RPC_URL,
  isValidWalletAddress,
  DEPOSIT_BURN_WALLET: process.env.DEPOSIT_BURN_WALLET,
};

setupDepositRoutes(app, depositDependencies);

// Webhook Routes Dependencies (Purchase)
const webhookDependencies = {
  // System State
  sleepyMode,
  forceAwake,
  
  // State getters/setters
  getLastSpeechEndTime: () => lastSpeechEndTime,
  setLastSpeechEndTime: (value) => { updateLastSpeechEndTime(value); },
  getTotalSpeechTime: () => totalSpeechTime,
  setTotalSpeechTime: (value) => { updateTotalSpeechTime(value); },
  getLunaEnergy: () => lunaEnergy,
  setLunaEnergy: (value) => { updateLunaEnergy(value); },
  broadcast: (data) => broadcastMessage(clients, data),
  estimateSpeechDurationMs,
};

setupWebhookRoutes(app, webhookDependencies);

// CSRF Routes Dependencies
const csrfDependencies = {
  csrfTokens,
  CSRF_TOKEN_TTL,
  generateCSRFToken,
};

setupCsrfRoutes(app, csrfDependencies);

// Legacy RPS routes have been moved to routes/rps-*.js files
// Old routes removed - see routes/ directory for new modular routes
// Chat, Notification, and Referral routes have been moved to routes/chat.js
// Control, VTS, Webhook, and CSRF routes have been moved to routes/control.js, routes/vts.js, routes/webhook.js, routes/csrf.js

// ----------------------
// 2) Webhook ตอนมีคนซื้อเหรียญ
// ----------------------
// Purchase webhook has been moved to routes/webhook.js
// Old route removed - see routes/webhook.js for new modular route

// Purchase webhook route has been moved to routes/webhook.js
// Old route removed - see routes/webhook.js for new modular route

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
    updateLastChatTs(Date.now());
    try {
      const prompt =
        "You are Luna, an AI streamer. There is no chat message right now. Say one short, cozy line as if you are thinking out loud on stream. Do not mention this prompt.";
      // ใช้ simpleModel สำหรับ idle monologue เพื่อประหยัดค่าใช้จ่าย
      const { reply } = await callSimpleModel(prompt, { username: "Luna_idle" });
      const ttsId = await generateTTS(reply, sleepyMode && !forceAwake ? "soft" : "calm");
      const duration = estimateSpeechDurationMs(reply, sleepyMode && !forceAwake ? "soft" : "normal");
      
      // อัปเดตเวลาที่ idle monologue จะพูดเสร็จ
      updateLastSpeechEndTime(Date.now() + duration + 1000); // +1 วินาที buffer

      try {
        startTalkReact(duration, sleepyMode && !forceAwake ? "soft" : "normal");
      } catch (e) {
        console.warn("[talk-react idle] failed:", e.message);
      }

      broadcastMessage(clients, {
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
    log.warn("[personality] decay failed:", e.message);
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
      updateLunaEnergy(Math.min(1.0, lunaEnergy + 0.02)); // ฟื้นตัว 2% ต่อนาที
    }
    
    // Reset total speech time ทุก 30 นาที (เพื่อไม่ให้พลังงานลดลงเรื่อยๆ)
    if (totalSpeechTime > 30 * 60 * 1000) {
      updateTotalSpeechTime(0);
      console.log("[energy] Reset speech time counter");
    }
    
    // Reset consecutive messages ถ้าไม่ได้แชตนาน
    if (timeSinceLastChat > 5 * 60 * 1000) {
      updateConsecutiveMessages(0);
    }
  } catch (e) {
    console.warn("[energy] recovery loop failed:", e.message);
  }
}, 60 * 1000); // ตรวจสอบทุกนาที

// ----------------------
// 4) ระบบเวลาอเมริกา + Sleepy Lock + หาวทุก 15 นาที
// ----------------------

// getAmericaHour is imported from utils/helpers.js

function checkSleepyTime() {
  // ถ้า override อยู่ ไม่ต้องยุ่งกับโหมดง่วง
  if (forceAwake) return;

  const hourUS = getAmericaHour();

  if (hourUS >= 0 && hourUS < 6) {
    if (!sleepyMode) {
      updateSleepyMode(true);
      console.log(`[luna] 🌙 enter sleepyMode (US hour = ${hourUS})`);
      try {
        setBreathingMode("sleepy");
        triggerForEmotion("sleepy");
      } catch (e) {
        console.warn("[vts] sleepy emotion trigger failed:", e.message);
      }
    }
  } else if (sleepyMode) {
    updateSleepyMode(false);
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
      updateLastSpeechEndTime(Date.now() + speakDuration + 1000); // อัปเดตเวลาพูดเสร็จ
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
// Admin Endpoints
// ----------------------
// Admin routes have been moved to routes/admin.js
// Old admin routes removed - see routes/admin.js for new modular routes

// ----------------------
// Notification, Referral, and Chat Routes
// ----------------------
// Routes have been moved to routes/chat.js
// Old routes removed - see routes/chat.js for new modular routes

// ----------------------
// Status and Health Routes
// ----------------------
// Routes have been moved to routes/status.js
// Old routes removed - see routes/status.js for new modular routes

// ----------------------
// Static Files (must be before 404 handler)
// ----------------------
app.use((req, res, next) => {
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  next();
});

// Serve static files (including offline.html for connection errors)
app.use(express.static(path.join(__dirname, "public")));

// Fallback route for connection errors - serve offline.html for any upstream errors
// This helps when server is starting up or experiencing issues
app.use((req, res, next) => {
  // If request has an error header from upstream, serve offline page
  if (req.headers['x-upstream-error'] || req.headers['x-envoy-upstream-service-time'] === undefined) {
    // This is a fallback - actual errors should be caught by error handler
    return next();
  }
  next();
});

// Explicit favicon route for better compatibility with Phantom Wallet
// Phantom Wallet reads favicon from browser tab, so this must work correctly
app.get('/favicon.ico', (req, res) => {
  const faviconPath = path.join(__dirname, "public", "favicon.ico");
  
  // Set proper headers for favicon
  res.setHeader('Content-Type', 'image/x-icon');
  res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour (shorter for testing)
  res.setHeader('Access-Control-Allow-Origin', '*'); // Allow CORS
  
  // Try to send favicon.ico, fallback to PNG if not found
  res.sendFile(faviconPath, (err) => {
    if (err) {
      log.warn('[favicon] favicon.ico not found, trying PNG fallback:', err.message);
      // Fallback to PNG favicon
      const pngFaviconPath = path.join(__dirname, "public", "images", "logo", "favicon-32x32.png");
      res.setHeader('Content-Type', 'image/png');
      res.sendFile(pngFaviconPath, (err2) => {
        if (err2) {
          log.error('[favicon] Failed to serve favicon:', err2.message);
          res.status(404).end();
        } else {
          log.info('[favicon] Served PNG favicon as fallback');
        }
      });
    } else {
      log.info('[favicon] Served favicon.ico successfully');
    }
  });
});

// ----------------------
// Test Routes for Error Pages
// ----------------------
// Test 500 error
app.get('/test/500', (req, res, next) => {
  const error = new Error('Test 500 Error - Internal Server Error');
  error.statusCode = 500;
  next(error);
});

// Test 503 error
app.get('/test/503', (req, res, next) => {
  const error = new Error('Test 503 Error - Service Unavailable');
  error.statusCode = 503;
  next(error);
});

// Test 502 error
app.get('/test/502', (req, res, next) => {
  const error = new Error('Test 502 Error - Bad Gateway');
  error.statusCode = 502;
  next(error);
});

// Test generic error
app.get('/test/error', (req, res, next) => {
  throw new Error('Test Generic Error');
});

// ----------------------
// Root Redirect (redirect / to /rps_stats.html)
// ----------------------
app.get('/', (req, res) => {
  res.redirect('/luna_guide.html');
});

// ----------------------
// Error Handling Middleware (must be before 404 handler)
// ----------------------
app.use((err, req, res, next) => {
  log.error("[error] Server error:", err);
  
  // Don't send error page if headers already sent
  if (res.headersSent) {
    return next(err);
  }

  const statusCode = err.statusCode || err.status || 500;
  
  // Send appropriate error page
  if (statusCode === 503 || statusCode === 502) {
    // Service Unavailable or Bad Gateway - use offline.html for connection errors
    res.status(statusCode).sendFile(path.join(__dirname, "public", "offline.html"));
  } else if (statusCode === 500) {
    // Internal Server Error
    res.status(500).sendFile(path.join(__dirname, "public", "500.html"));
  } else {
    // Other errors - send JSON response for API, HTML for pages
    if (req.path.startsWith('/luna/') || req.path.startsWith('/api/')) {
      res.status(statusCode).json({
        ok: false,
        error: err.message || "Internal server error",
        statusCode: statusCode
      });
    } else {
      res.status(statusCode).sendFile(path.join(__dirname, "public", "500.html"));
    }
  }
});

// 404 Handler (must be after all routes)
// ----------------------
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, "public", "404.html"));
});

// ----------------------
// 5) Start server + watchers
// ----------------------

log.info(`[startup] Attempting to start server on port ${PORT}...`);
log.info(`[startup] Environment: ${process.env.NODE_ENV || 'development'}`);
log.info(`[startup] PORT: ${PORT}`);

// Add error handler for server listen errors
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    log.error(`[startup] ❌ Port ${PORT} is already in use!`);
    log.error(`[startup] Please change PORT environment variable or stop the process using port ${PORT}`);
    process.exit(1);
  } else {
    log.error(`[startup] ❌ Server error:`, error);
    process.exit(1);
  }
});

server.listen(PORT, '0.0.0.0', async () => {
  const host = process.env.HOST || '0.0.0.0';
  log.info(`✅ Luna v10 server listening on http://${host}:${PORT}`);
  log.info(`🌐 Server is accessible from other devices on your network!`);
  log.info(`   Local: http://localhost:${PORT}`);
  log.info(`   Network: http://[YOUR_IP]:${PORT}`);
  log.info(`[startup] Starting server initialization...`);
  
  try {
    log.info(`[startup] Initializing database...`);
    await initDB();
    log.info(`[startup] Database initialized successfully`);
    isDatabaseReady = true;
    
    // Load leaderboard entries from database
    try {
      const persistedLeaderboard = await loadLeaderboardEntries();
      if (persistedLeaderboard.length > 0) {
        persistedLeaderboard.forEach((entry) => {
          if (!entry.wallet) {
            return;
          }
          rpsLeaderboard.set(entry.wallet, {
            wins: entry.wins || 0,
            losses: entry.losses || 0,
            totalWon: entry.totalWon || 0,
            totalSolWon: entry.totalSolWon || 0,
          });
        });
        log.info(`[rps] Loaded ${persistedLeaderboard.length} leaderboard entries from database`);
      } else {
        log.info("[rps] No persisted leaderboard entries found in database");
      }
    } catch (leaderboardLoadError) {
      log.error("[rps] Failed to load leaderboard entries from database:", leaderboardLoadError);
    }
    
    // Load group chat messages from database
    try {
      const groupChatMessages = await loadGroupChatMessages('group_chat', 1000);
      if (groupChatMessages.length > 0) {
        // Get or create chat room
        if (!chatRooms.has('group_chat')) {
          chatRooms.set('group_chat', {
            messages: [],
            participants: new Set(),
            createdAt: Date.now()
          });
        }
        const room = chatRooms.get('group_chat');
        room.messages = groupChatMessages;
        log.info(`[chat] Loaded ${groupChatMessages.length} messages from database for group_chat`);
      }
    } catch (dbError) {
      log.error('[chat] Failed to load messages from database on startup:', dbError);
    }
    
    log.info(`[startup] Starting Solana watcher...`);
    startSolanaWatcher();
    log.info(`[startup] Starting PumpFun watcher...`);
    startPumpFunWatcher();
    
    if (process.env.VTS_ENABLED === "true") {
      log.info("[vts] VTube Studio integration enabled, connecting...");
      startVTS();
    } else {
      log.info("[vts] VTube Studio integration disabled (VTS_ENABLED=false)");
    }
    
    log.info(`[startup] Starting breathing loop...`);
    startBreathingLoop();
    log.info(`[startup] Starting idle loop...`);
    startIdleLoop();
    log.info(`[startup] Running initial idle loop...`);
    await idleLoop();
    
    // Start auto-backup
    log.info(`[startup] Starting auto-backup...`);
    startAutoBackup();
    
    log.info(`[startup] Server initialization completed successfully!`);
  } catch (error) {
    log.error('[startup] Error during server startup:', error);
    log.error('[startup] Error stack:', error.stack);
    process.exit(1);
  }
});

// Error handling for server
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    log.error(`[server] Port ${PORT} is already in use. Please stop the other process or change PORT in .env`);
  } else {
    log.error('[server] Server error:', error);
  }
  process.exit(1);
});

// Control routes have been moved to routes/control.js
// Old routes removed - see routes/control.js for new modular routes

// Status and Health routes have been moved to routes/status.js
// Old routes removed - see routes/status.js for new modular routes

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

// VTS routes have been moved to routes/vts.js
// Old routes removed - see routes/vts.js for new modular routes
