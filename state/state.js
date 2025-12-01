// state/state.js
// Application state management

/**
 * Initialize all application state
 * @returns {Object} State object containing all state variables
 */
export function initializeState() {
  // RPS Game State
  const rpsMatchQueue = new Map(); // Map<wallet, { timestamp, choice, matchedWith }>
  const rpsActiveMatches = new Map(); // Map<matchId, { player1, player2, choices, timestamp, isBot }>
  const rpsBettingRooms = new Map(); // Map<roomId, { creator, betAmount, player2, choices, timestamp }>
  const rpsLeaderboard = new Map(); // Map<wallet, { wins: number, losses: number, totalWon: number, totalSolWon: number }>
  const rpsGames = new Map(); // Map<username, { balance: number, lastPlay: number }>
  
  // Fee Collection System
  const collectedFees = new Map(); // Map<wallet, { totalFees: number, transactions: Array }>
  let rewardPool = 0; // Total SOL in reward pool
  
  // Anti-Abuse System State
  const ipWalletMap = new Map(); // Map<ip, Set<wallet>> - เก็บ wallet ที่ใช้ IP เดียวกัน
  const walletIpMap = new Map(); // Map<wallet, ip> - เก็บ IP ของแต่ละ wallet
  const ipActivityMap = new Map(); // Map<ip, { lastGameTime, gameCount, cooldownUntil }>
  const walletPairMatches = new Map(); // Map<"wallet1_wallet2", { count, lastMatch, firstMatch }>
  const walletOpponents = new Map(); // Map<wallet, Set<opponentWallet>> - เก็บว่า wallet นี้เล่นกับใครบ้าง
  const walletTotalGames = new Map(); // Map<wallet, totalGames> - จำนวนเกมทั้งหมดของ wallet
  const ipSelfPlayMatches = new Map(); // Map<ip, { walletPairs: Map<"wallet1_wallet2", count>, totalSelfPlayCount }>
  const suspiciousActivityLog = []; // Array of { timestamp, type, wallet1, wallet2, ip, reason }
  const blockedWallets = new Set(); // Set of blocked wallet addresses
  const blockedIps = new Set(); // Set of blocked IP addresses
  const rewardBannedWallets = new Set(); // Set of wallet addresses that are banned from receiving rewards
  const rewardBannedIps = new Set(); // Set of IP addresses that are banned from receiving rewards
  
  // Notification System State
  const userNotifications = new Map(); // Map<wallet, Array<notification>> - เก็บ notifications สำหรับแต่ละ wallet
  
  // Referral System State
  const referralData = new Map(); // Map<referrerWallet, { referrals: Set<wallet>, totalRewards: number, stats: {...} }>
  const referralMap = new Map(); // Map<wallet, referrerWallet> - เก็บว่า wallet นี้มาจาก referrer ใคร
  
  // Chat System State
  const chatRooms = new Map(); // Map<roomId, { messages: Array, participants: Set<wallet>, createdAt }>
  const messageReactions = new Map(); // Map<messageId, Map<reactionType, Set<wallet>>>
  const messageTips = new Map(); // Map<messageId, Array<{wallet, amount, timestamp}>>
  const chatRewards = new Map(); // Map<wallet, {totalRewards, messageCount, lastRewardTime}>
  const onlineUsers = new Map(); // Map<wallet, {ws, lastSeen, roomId}>
  const chatLeaderboard = new Map(); // Map<wallet, messageCount> - for daily/weekly leaderboard
  const badgeCache = new Map(); // Map<wallet, {badge, balance, timestamp}> - Cache VIP badges
  
  // Statistics
  const stats = {
    messages: {
      total: 0,
      byUser: new Map(), // Map<user, count>
      byEmotion: new Map(), // Map<emotion, count>
      byModel: { simple: 0, complex: 0 }
    },
    performance: {
      totalResponseTime: 0,
      responseCount: 0,
      avgResponseTime: 0,
      errors: 0,
      cacheHits: 0,
      cacheMisses: 0
    },
    system: {
      startTime: Date.now(),
      uptime: function() {
        return Date.now() - this.startTime;
      }
    }
  };
  
  // Cache
  const responseCache = new Map(); // Map<cacheKey, cachedResponse>
  const priceCache = new Map(); // Map<mint, { price, timestamp }>
  const balanceCache = new Map(); // Map<"wallet:mint", { balance, timestamp }>
  
  // Error log
  const errorLog = []; // Array of { timestamp, message, error, endpoint?, ... }
  
  // System state
  let lastChatTs = Date.now(); // Last chat timestamp
  let sleepyMode = false; // Sleepy mode state
  let forceAwake = false; // Force awake override
  const clients = new Set(); // WebSocket clients Set
  
  // Speech and energy state
  let lastSpeechEndTime = 0; // Last speech end time
  let totalSpeechTime = 0; // Total speech time
  let lunaEnergy = 1.0; // Luna energy level (0.0 - 1.0)
  let consecutiveMessages = 0; // Consecutive messages count
  
  return {
    // RPS State
    rpsMatchQueue,
    rpsActiveMatches,
    rpsBettingRooms,
    rpsLeaderboard,
    rpsGames,
    collectedFees,
    rewardPool: {
      get value() { return rewardPool; },
      set value(v) { rewardPool = v; }
    },
    
    // Anti-Abuse State
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
    
    // Notification State
    userNotifications,
    
    // Referral State
    referralData,
    referralMap,
    
    // Chat State
    chatRooms,
    messageReactions,
    messageTips,
    chatRewards,
    onlineUsers,
    chatLeaderboard,
    badgeCache,
    
    // Statistics
    stats,
    
    // Cache
    responseCache,
    priceCache,
    balanceCache,
    
    // Error log
    errorLog,
    
    // System state
    lastChatTs: {
      get value() { return lastChatTs; },
      set value(v) { lastChatTs = v; }
    },
    sleepyMode: {
      get value() { return sleepyMode; },
      set value(v) { sleepyMode = v; }
    },
    forceAwake: {
      get value() { return forceAwake; },
      set value(v) { forceAwake = v; }
    },
    clients,
    
    // Speech and energy state
    lastSpeechEndTime: {
      get value() { return lastSpeechEndTime; },
      set value(v) { lastSpeechEndTime = v; }
    },
    totalSpeechTime: {
      get value() { return totalSpeechTime; },
      set value(v) { totalSpeechTime = v; }
    },
    lunaEnergy: {
      get value() { return lunaEnergy; },
      set value(v) { lunaEnergy = v; }
    },
    consecutiveMessages: {
      get value() { return consecutiveMessages; },
      set value(v) { consecutiveMessages = v; }
    },
  };
}











