// services/antiAbuseService.js
// Anti-Abuse System Service

import { log } from "../modules/logger.js";
import { getClientIp } from "../utils/helpers.js";

/**
 * Log suspicious activity
 * @param {Array} suspiciousActivityLog - Array to store suspicious activity logs
 * @param {number} MAX_SUSPICIOUS_LOG - Maximum log entries
 * @param {string} type - Activity type
 * @param {string} wallet1 - Wallet address 1
 * @param {string|null} wallet2 - Wallet address 2 (optional)
 * @param {string} ip - IP address
 * @param {string} reason - Reason for logging
 */
export function logSuspiciousActivity(suspiciousActivityLog, MAX_SUSPICIOUS_LOG, type, wallet1, wallet2, ip, reason) {
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
  
  log.warn(`[anti-abuse] ⚠️ Suspicious activity detected: ${type} - ${reason}`, {
    wallet1: wallet1?.substring(0, 8) + '...',
    wallet2: wallet2?.substring(0, 8) + '...',
    ip: ip
  });
}

/**
 * Get total number of unique players in the system
 * @param {Map} rpsLeaderboard - RPS leaderboard map
 * @returns {number} - Total unique players
 */
export function getTotalUniquePlayers(rpsLeaderboard) {
  return rpsLeaderboard.size;
}

/**
 * Get number of unique opponents for a wallet
 * @param {Map} walletOpponents - Wallet opponents map
 * @param {string} wallet - Wallet address
 * @returns {number} - Number of unique opponents
 */
export function getWalletOpponentCount(walletOpponents, wallet) {
  return walletOpponents.get(wallet)?.size || 0;
}

/**
 * Get total games played by a wallet
 * @param {Map} walletTotalGames - Wallet total games map
 * @param {string} wallet - Wallet address
 * @returns {number} - Total games played
 */
export function getWalletTotalGames(walletTotalGames, wallet) {
  return walletTotalGames.get(wallet) || 0;
}

/**
 * Calculate dynamic threshold based on player count
 * ถ้ามีผู้เล่นน้อย = threshold สูงขึ้น (ยืดหยุ่นมากขึ้น)
 * @param {Map} rpsLeaderboard - RPS leaderboard map
 * @param {number} SUSPICIOUS_PAIR_THRESHOLD - Default suspicious pair threshold
 * @returns {number} - Dynamic threshold
 */
export function getDynamicSuspiciousThreshold(rpsLeaderboard, SUSPICIOUS_PAIR_THRESHOLD) {
  const totalPlayers = getTotalUniquePlayers(rpsLeaderboard);
  
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
 * @param {Map} walletPairMatches - Wallet pair matches map
 * @param {Map} walletOpponents - Wallet opponents map
 * @param {Map} walletTotalGames - Wallet total games map
 * @param {Map} rpsLeaderboard - RPS leaderboard map
 * @param {string} wallet1 - Wallet address 1
 * @param {string} wallet2 - Wallet address 2
 * @param {number} SUSPICIOUS_PAIR_THRESHOLD - Default suspicious pair threshold
 * @param {number} SUSPICIOUS_PAIR_TIME_WINDOW - Time window in milliseconds
 * @returns {boolean} - True if suspicious
 */
export function isSuspiciousWalletPair(
  walletPairMatches,
  walletOpponents,
  walletTotalGames,
  rpsLeaderboard,
  wallet1,
  wallet2,
  SUSPICIOUS_PAIR_THRESHOLD,
  SUSPICIOUS_PAIR_TIME_WINDOW
) {
  const pairKey1 = `${wallet1}_${wallet2}`;
  const pairKey2 = `${wallet2}_${wallet1}`;
  
  const pairData1 = walletPairMatches.get(pairKey1) || walletPairMatches.get(pairKey2);
  
  if (!pairData1) {
    return false;
  }
  
  const now = Date.now();
  const timeSinceFirstMatch = now - pairData1.firstMatch;
  
  // ใช้ dynamic threshold ตามจำนวนผู้เล่น
  const dynamicThreshold = getDynamicSuspiciousThreshold(rpsLeaderboard, SUSPICIOUS_PAIR_THRESHOLD);
  
  // ถ้าเล่นกันเกิน threshold ครั้งใน time window
  if (pairData1.count >= dynamicThreshold && timeSinceFirstMatch <= SUSPICIOUS_PAIR_TIME_WINDOW) {
    // ตรวจสอบว่า wallet แต่ละตัวเล่นกับคนอื่นบ้างหรือไม่
    const wallet1Opponents = getWalletOpponentCount(walletOpponents, wallet1);
    const wallet2Opponents = getWalletOpponentCount(walletOpponents, wallet2);
    const wallet1TotalGames = getWalletTotalGames(walletTotalGames, wallet1);
    const wallet2TotalGames = getWalletTotalGames(walletTotalGames, wallet2);
    
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
 * @param {Map} walletPairMatches - Wallet pair matches map
 * @param {Map} walletOpponents - Wallet opponents map
 * @param {Map} walletTotalGames - Wallet total games map
 * @param {Map} walletIpMap - Wallet IP map
 * @param {Map} ipWalletMap - IP wallet map
 * @param {Map} ipSelfPlayMatches - IP self-play matches map
 * @param {Set} rewardBannedWallets - Reward banned wallets set
 * @param {Set} rewardBannedIps - Reward banned IPs set
 * @param {Array} suspiciousActivityLog - Suspicious activity log array
 * @param {number} MAX_SUSPICIOUS_LOG - Maximum log entries
 * @param {number} IP_SELF_PLAY_THRESHOLD - IP self-play threshold
 * @param {string} wallet1 - Wallet address 1
 * @param {string} wallet2 - Wallet address 2
 */
export function recordWalletPairMatch(
  walletPairMatches,
  walletOpponents,
  walletTotalGames,
  walletIpMap,
  ipWalletMap,
  ipSelfPlayMatches,
  rewardBannedWallets,
  rewardBannedIps,
  suspiciousActivityLog,
  MAX_SUSPICIOUS_LOG,
  IP_SELF_PLAY_THRESHOLD,
  wallet1,
  wallet2
) {
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
      
      logSuspiciousActivity(suspiciousActivityLog, MAX_SUSPICIOUS_LOG, 'ip_self_play_reward_ban', wallet1, wallet2, wallet1Ip, 
        `IP ${wallet1Ip} has ${ipData.totalSelfPlayCount} self-play matches (threshold: ${IP_SELF_PLAY_THRESHOLD}). All wallets from this IP are banned from rewards.`);
      
      log.warn(`[anti-abuse] ⚠️ IP ${wallet1Ip} detected self-play ${ipData.totalSelfPlayCount} times. All wallets from this IP are now banned from receiving rewards.`);
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
 * @param {Map} ipActivityMap - IP activity map
 * @param {number} GAME_COOLDOWN - Game cooldown in milliseconds
 * @param {string} ip - IP address
 * @returns {Object} - { allowed: boolean, reason?: string, remainingCooldown?: number }
 */
export function checkIpRateLimit(ipActivityMap, GAME_COOLDOWN, ip) {
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
 * @param {Map} ipActivityMap - IP activity map
 * @param {number} GAME_COOLDOWN - Game cooldown in milliseconds
 * @param {string} ip - IP address
 */
export function updateIpActivity(ipActivityMap, GAME_COOLDOWN, ip) {
  const now = Date.now();
  const ipData = ipActivityMap.get(ip) || { gameCount: 0, lastGameTime: 0, cooldownUntil: 0 };
  
  ipData.gameCount++;
  ipData.lastGameTime = now;
  ipData.cooldownUntil = now + GAME_COOLDOWN;
  
  ipActivityMap.set(ip, ipData);
}

/**
 * Track wallet-IP relationship
 * @param {Map} ipWalletMap - IP wallet map
 * @param {Map} walletIpMap - Wallet IP map
 * @param {Array} suspiciousActivityLog - Suspicious activity log array
 * @param {number} MAX_SUSPICIOUS_LOG - Maximum log entries
 * @param {string} wallet - Wallet address
 * @param {string} ip - IP address
 */
export function trackWalletIp(ipWalletMap, walletIpMap, suspiciousActivityLog, MAX_SUSPICIOUS_LOG, wallet, ip) {
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
    logSuspiciousActivity(suspiciousActivityLog, MAX_SUSPICIOUS_LOG, 'multiple_wallets_same_ip', wallet, null, ip, 
      `IP ${ip} is associated with ${walletsOnIp.size} different wallets`);
  }
}

/**
 * Validate game request (comprehensive anti-abuse check)
 * @param {Set} blockedWallets - Blocked wallets set
 * @param {Set} blockedIps - Blocked IPs set
 * @param {Map} walletPairMatches - Wallet pair matches map
 * @param {Map} walletOpponents - Wallet opponents map
 * @param {Map} walletTotalGames - Wallet total games map
 * @param {Map} rpsLeaderboard - RPS leaderboard map
 * @param {Map} walletIpMap - Wallet IP map
 * @param {Map} ipActivityMap - IP activity map
 * @param {Map} ipWalletMap - IP wallet map
 * @param {Array} suspiciousActivityLog - Suspicious activity log array
 * @param {number} MAX_SUSPICIOUS_LOG - Maximum log entries
 * @param {number} GAME_COOLDOWN - Game cooldown in milliseconds
 * @param {number} SUSPICIOUS_PAIR_THRESHOLD - Default suspicious pair threshold
 * @param {number} SUSPICIOUS_PAIR_TIME_WINDOW - Time window in milliseconds
 * @param {Object} req - Express request object
 * @param {string} wallet1 - Wallet address 1
 * @param {string} wallet2 - Wallet address 2
 * @returns {Object} - { valid: boolean, error?: string, code?: string }
 */
export function validateGameRequest(
  blockedWallets,
  blockedIps,
  walletPairMatches,
  walletOpponents,
  walletTotalGames,
  rpsLeaderboard,
  walletIpMap,
  ipActivityMap,
  ipWalletMap,
  suspiciousActivityLog,
  MAX_SUSPICIOUS_LOG,
  GAME_COOLDOWN,
  SUSPICIOUS_PAIR_THRESHOLD,
  SUSPICIOUS_PAIR_TIME_WINDOW,
  req,
  wallet1,
  wallet2
) {
  const ip = getClientIp(req);
  
  // 0. Check if wallet or IP is blocked
  if (blockedWallets.has(wallet1) || blockedWallets.has(wallet2)) {
    logSuspiciousActivity(suspiciousActivityLog, MAX_SUSPICIOUS_LOG, 'blocked_wallet_attempt', wallet1, wallet2, ip, "Attempted to use blocked wallet");
    return {
      valid: false,
      error: "This wallet has been blocked due to suspicious activity",
      code: "BLOCKED_WALLET"
    };
  }
  
  if (blockedIps.has(ip)) {
    logSuspiciousActivity(suspiciousActivityLog, MAX_SUSPICIOUS_LOG, 'blocked_ip_attempt', wallet1, wallet2, ip, "Attempted to use blocked IP");
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
  const rateLimitCheck = checkIpRateLimit(ipActivityMap, GAME_COOLDOWN, ip);
  if (!rateLimitCheck.allowed) {
    // แค่ตรวจสอบ cooldown เท่านั้น (ไม่ใช่ rate limit)
    return {
      valid: false,
      error: rateLimitCheck.reason,
      code: "COOLDOWN"
    };
  }
  
  // 3. Check suspicious wallet pair (ปรับปรุงให้ยืดหยุ่นตามจำนวนผู้เล่น)
  if (isSuspiciousWalletPair(walletPairMatches, walletOpponents, walletTotalGames, rpsLeaderboard, wallet1, wallet2, SUSPICIOUS_PAIR_THRESHOLD, SUSPICIOUS_PAIR_TIME_WINDOW)) {
    const pairCount = walletPairMatches.get(`${wallet1}_${wallet2}`)?.count || walletPairMatches.get(`${wallet2}_${wallet1}`)?.count || 0;
    const wallet1Opponents = getWalletOpponentCount(walletOpponents, wallet1);
    const wallet2Opponents = getWalletOpponentCount(walletOpponents, wallet2);
    const totalPlayers = getTotalUniquePlayers(rpsLeaderboard);
    
    logSuspiciousActivity(suspiciousActivityLog, MAX_SUSPICIOUS_LOG, 'suspicious_pair', wallet1, wallet2, ip, 
      `Wallet pair has played together ${pairCount} times recently. Wallet1 opponents: ${wallet1Opponents}, Wallet2 opponents: ${wallet2Opponents}, Total players: ${totalPlayers}`);
    return {
      valid: false,
      error: "Suspicious activity detected. This wallet pair has played together too frequently compared to their other opponents.",
      code: "SUSPICIOUS_PAIR"
    };
  }
  
  // 4. Track wallet-IP relationship
  trackWalletIp(ipWalletMap, walletIpMap, suspiciousActivityLog, MAX_SUSPICIOUS_LOG, wallet1, ip);
  if (wallet2) {
    trackWalletIp(ipWalletMap, walletIpMap, suspiciousActivityLog, MAX_SUSPICIOUS_LOG, wallet2, ip);
    
    // Check if both wallets from same IP
    const wallet1Ip = walletIpMap.get(wallet1);
    const wallet2Ip = walletIpMap.get(wallet2);
    if (wallet1Ip === wallet2Ip && wallet1Ip !== 'unknown') {
      logSuspiciousActivity(suspiciousActivityLog, MAX_SUSPICIOUS_LOG, 'same_ip_match', wallet1, wallet2, ip, 
        "Two wallets from same IP trying to play together");
      // Allow but log - might be legitimate (same network)
    }
  }
  
  return { valid: true };
}











