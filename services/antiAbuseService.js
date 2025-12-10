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
  
  log.warn(`[anti-abuse] โ ๏ธ Suspicious activity detected: ${type} - ${reason}`, {
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
 * เธ–เนเธฒเธกเธตเธเธนเนเน€เธฅเนเธเธเนเธญเธข = threshold เธชเธนเธเธเธถเนเธ (เธขเธทเธ”เธซเธขเธธเนเธเธกเธฒเธเธเธถเนเธ)
 * @param {Map} rpsLeaderboard - RPS leaderboard map
 * @param {number} SUSPICIOUS_PAIR_THRESHOLD - Default suspicious pair threshold
 * @returns {number} - Dynamic threshold
 */
export function getDynamicSuspiciousThreshold(rpsLeaderboard, SUSPICIOUS_PAIR_THRESHOLD) {
  const totalPlayers = getTotalUniquePlayers(rpsLeaderboard);
  
  // เธ–เนเธฒเธกเธตเธเธนเนเน€เธฅเนเธเธเนเธญเธขเธเธงเนเธฒ 5 เธเธ = threshold เธชเธนเธเธกเธฒเธ (20 เธเธฃเธฑเนเธ)
  if (totalPlayers < 5) {
    return 20;
  }
  // เธ–เนเธฒเธกเธตเธเธนเนเน€เธฅเนเธ 5-10 เธเธ = threshold เธเธฒเธเธเธฅเธฒเธ (10 เธเธฃเธฑเนเธ)
  else if (totalPlayers < 10) {
    return 10;
  }
  // เธ–เนเธฒเธกเธตเธเธนเนเน€เธฅเนเธเธกเธฒเธ = threshold เธ•เนเธณ (5 เธเธฃเธฑเนเธ) - เน€เธ”เธดเธก
  else {
    return SUSPICIOUS_PAIR_THRESHOLD;
  }
}

/**
 * Check if wallet pair is suspicious (เน€เธฅเนเธเธเธฑเธเธเนเธญเธขเน€เธเธดเธเนเธ)
 * เธเธฃเธฑเธเธเธฃเธธเธเนเธซเนเธ•เธฃเธงเธเธชเธญเธเธงเนเธฒ wallet เนเธ•เนเธฅเธฐเธ•เธฑเธงเน€เธฅเนเธเธเธฑเธเธเธเธญเธทเนเธเธ”เนเธงเธขเธซเธฃเธทเธญเนเธกเน
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
  
  // เนเธเน dynamic threshold เธ•เธฒเธกเธเธณเธเธงเธเธเธนเนเน€เธฅเนเธ
  const dynamicThreshold = getDynamicSuspiciousThreshold(rpsLeaderboard, SUSPICIOUS_PAIR_THRESHOLD);
  
  // เธ–เนเธฒเน€เธฅเนเธเธเธฑเธเน€เธเธดเธ threshold เธเธฃเธฑเนเธเนเธ time window
  if (pairData1.count >= dynamicThreshold && timeSinceFirstMatch <= SUSPICIOUS_PAIR_TIME_WINDOW) {
    // เธ•เธฃเธงเธเธชเธญเธเธงเนเธฒ wallet เนเธ•เนเธฅเธฐเธ•เธฑเธงเน€เธฅเนเธเธเธฑเธเธเธเธญเธทเนเธเธเนเธฒเธเธซเธฃเธทเธญเนเธกเน
    const wallet1Opponents = getWalletOpponentCount(walletOpponents, wallet1);
    const wallet2Opponents = getWalletOpponentCount(walletOpponents, wallet2);
    const wallet1TotalGames = getWalletTotalGames(walletTotalGames, wallet1);
    const wallet2TotalGames = getWalletTotalGames(walletTotalGames, wallet2);
    
    // เธ–เนเธฒ wallet เธ—เธฑเนเธเธชเธญเธเธ•เธฑเธงเน€เธฅเนเธเธเธฑเธเธเธเธญเธทเนเธเธเนเธญเธขเธกเธฒเธ (เธเนเธญเธขเธเธงเนเธฒ 2 เธเธ) เนเธฅเธฐเน€เธฅเนเธเธเธฑเธเน€เธญเธเธเนเธญเธข = เธเนเธฒเธชเธเธชเธฑเธข
    // เนเธ•เนเธ–เนเธฒเน€เธฅเนเธเธเธฑเธเธเธเธญเธทเนเธเธ”เนเธงเธข = เธญเธฒเธเธเธฐเนเธกเนเธเนเธฒเธชเธเธชเธฑเธข (เธญเธฒเธเธเธฐเธกเธตเธเธนเนเน€เธฅเนเธเธเนเธญเธขเธเธฃเธดเธเน)
    if (wallet1Opponents <= 1 && wallet2Opponents <= 1) {
      // เธ—เธฑเนเธเธชเธญเธเธ•เธฑเธงเน€เธฅเนเธเธเธฑเธเธเธเธญเธทเนเธเธเนเธญเธขเธกเธฒเธ = เธเนเธฒเธชเธเธชเธฑเธขเธกเธฒเธ
      return true;
    }
    
    // เธ•เธฃเธงเธเธชเธญเธเธงเนเธฒ pair เธเธตเนเน€เธเนเธเธเธนเนเน€เธ”เธตเธขเธงเธ—เธตเนเน€เธฅเนเธเธเธฑเธเธซเธฃเธทเธญเนเธกเน
    // เธ–เนเธฒ wallet1 เน€เธฅเนเธเธเธฑเธเธเธเธญเธทเนเธเธกเธฒเธ เนเธ•เนเน€เธฅเนเธเธเธฑเธ wallet2 เธเนเธญเธข = เธญเธฒเธเธเธฐเนเธกเนเธเนเธฒเธชเธเธชเธฑเธข
    // เนเธ•เนเธ–เนเธฒ wallet1 เน€เธฅเนเธเธเธฑเธเธเธเธญเธทเนเธเธเนเธญเธข เนเธฅเธฐเน€เธฅเนเธเธเธฑเธ wallet2 เธเนเธญเธข = เธเนเธฒเธชเธเธชเธฑเธข
    
    // เธเธณเธเธงเธ“เธชเธฑเธ”เธชเนเธงเธ: เน€เธเธกเธ—เธตเนเน€เธฅเนเธเธเธฑเธ wallet2 เธ•เนเธญเน€เธเธกเธ—เธฑเนเธเธซเธกเธ”
    const pairGames = pairData1.count;
    const wallet1PairRatio = wallet1TotalGames > 0 ? pairGames / wallet1TotalGames : 1;
    const wallet2PairRatio = wallet2TotalGames > 0 ? pairGames / wallet2TotalGames : 1;
    
    // เธ–เนเธฒเน€เธเธกเธ—เธตเนเน€เธฅเนเธเธเธฑเธเธเธนเนเธเธตเนเธกเธฒเธเธเธงเนเธฒ 70% เธเธญเธเน€เธเธกเธ—เธฑเนเธเธซเธกเธ” = เธเนเธฒเธชเธเธชเธฑเธข
    if (wallet1PairRatio > 0.7 || wallet2PairRatio > 0.7) {
      // เนเธ•เนเธ–เนเธฒเน€เธฅเนเธเธเธฑเธเธเธเธญเธทเนเธเธกเธฒเธเธเธงเนเธฒ 3 เธเธ = เธญเธฒเธเธเธฐเนเธกเนเธเนเธฒเธชเธเธชเธฑเธข
      if (wallet1Opponents >= 3 && wallet2Opponents >= 3) {
        return false; // เธกเธตเธเธนเนเน€เธฅเนเธเธซเธฅเธฒเธเธซเธฅเธฒเธข = เนเธกเนเธเนเธฒเธชเธเธชเธฑเธข
      }
      return true; // เธเนเธฒเธชเธเธชเธฑเธข
    }
    
    // เธ–เนเธฒเนเธกเนเน€เธเนเธฒเน€เธเธทเนเธญเธเนเธเธเนเธฒเธเธเธ = เนเธกเนเธเนเธฒเธชเธเธชเธฑเธข
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
  
  // IP Self-Play Detection - เธ•เธฃเธงเธเธชเธญเธเธงเนเธฒ IP เน€เธ”เธตเธขเธงเธเธฑเธเธกเธต wallet เธซเธฅเธฒเธขเธ•เธฑเธงเน€เธฅเนเธเธเธฑเธเน€เธญเธเธซเธฃเธทเธญเนเธกเน
  const wallet1Ip = walletIpMap.get(wallet1);
  const wallet2Ip = walletIpMap.get(wallet2);
  
  // เธ–เนเธฒ wallet เธ—เธฑเนเธเธชเธญเธเธกเธฒเธเธฒเธ IP เน€เธ”เธตเธขเธงเธเธฑเธ = เธเนเธฒเธชเธเธชเธฑเธข (self-play)
  if (wallet1Ip && wallet2Ip && wallet1Ip === wallet2Ip && wallet1Ip !== 'unknown') {
    if (!ipSelfPlayMatches.has(wallet1Ip)) {
      ipSelfPlayMatches.set(wallet1Ip, {
        walletPairs: new Map(),
        totalSelfPlayCount: 0
      });
    }
    
    const ipData = ipSelfPlayMatches.get(wallet1Ip);
    const pairKeyForIp = `${wallet1}_${wallet2}`;
    
    // เธเธฑเธเธเธณเธเธงเธเธเธฃเธฑเนเธเธ—เธตเน wallet pair เธเธตเนเน€เธฅเนเธเธเธฑเธเน€เธญเธ
    if (!ipData.walletPairs.has(pairKeyForIp)) {
      ipData.walletPairs.set(pairKeyForIp, 0);
    }
    ipData.walletPairs.set(pairKeyForIp, ipData.walletPairs.get(pairKeyForIp) + 1);
    ipData.totalSelfPlayCount++;
    
    // เธ–เนเธฒเน€เธเธดเธ threshold = เธ•เธฑเธ”เธชเธดเธ—เธเธดเนเธฃเธฑเธเธฃเธฒเธเธงเธฑเธฅ
    if (ipData.totalSelfPlayCount > IP_SELF_PLAY_THRESHOLD) {
      // เธ•เธฑเธ”เธชเธดเธ—เธเธดเนเธฃเธฑเธเธฃเธฒเธเธงเธฑเธฅเธชเธณเธซเธฃเธฑเธ wallet เธ—เธฑเนเธเธซเธกเธ”เธ—เธตเนเธกเธฒเธเธฒเธ IP เธเธตเน
      const walletsFromIp = ipWalletMap.get(wallet1Ip) || new Set();
      walletsFromIp.forEach(wallet => {
        rewardBannedWallets.add(wallet);
      });
      rewardBannedIps.add(wallet1Ip);
      
      logSuspiciousActivity(suspiciousActivityLog, MAX_SUSPICIOUS_LOG, 'ip_self_play_reward_ban', wallet1, wallet2, wallet1Ip, 
        `IP ${wallet1Ip} has ${ipData.totalSelfPlayCount} self-play matches (threshold: ${IP_SELF_PLAY_THRESHOLD}). All wallets from this IP are banned from rewards.`);
      
      log.warn(`[anti-abuse] โ ๏ธ IP ${wallet1Ip} detected self-play ${ipData.totalSelfPlayCount} times. All wallets from this IP are now banned from receiving rewards.`);
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
 * Check IP rate limit (เธเธดเธ”เธเธฒเธฃเนเธเนเธเธฒเธเนเธฅเนเธง - เนเธกเนเธเธณเธเธฑเธ”เธเธณเธเธงเธเน€เธเธกเธ•เนเธญเธเธฑเนเธงเนเธกเธ)
 * เธขเธฑเธเธเธเธ•เธฃเธงเธเธชเธญเธ cooldown เน€เธ—เนเธฒเธเธฑเนเธ
 * @param {Map} ipActivityMap - IP activity map
 * @param {number} GAME_COOLDOWN - Game cooldown in milliseconds
 * @param {string} ip - IP address
 * @returns {Object} - { allowed: boolean, reason?: string, remainingCooldown?: number }
 */
export function checkIpRateLimit(ipActivityMap, GAME_COOLDOWN, ip) {
  const now = Date.now();
  const ipData = ipActivityMap.get(ip) || { gameCount: 0, lastGameTime: 0, cooldownUntil: 0 };
  
  // Check cooldown only (เนเธกเนเธเธณเธเธฑเธ”เธเธณเธเธงเธเน€เธเธกเธ•เนเธญเธเธฑเนเธงเนเธกเธ)
  if (ipData.cooldownUntil > now) {
    const remainingCooldown = Math.ceil((ipData.cooldownUntil - now) / 1000);
    return {
      allowed: false,
      reason: `Cooldown active. Please wait ${remainingCooldown} seconds.`,
      remainingCooldown: remainingCooldown
    };
  }
  
  // เนเธกเนเธเธณเธเธฑเธ”เธเธณเธเธงเธเน€เธเธกเธ•เนเธญเธเธฑเนเธงเนเธกเธเนเธฅเนเธง - เนเธเนเธฃเธฐเธเธเธ•เธฃเธงเธเธชเธญเธ IP self-play เนเธ—เธ
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
  
  // 2. Check IP cooldown (เนเธกเนเธเธณเธเธฑเธ”เธเธณเธเธงเธเน€เธเธกเธ•เนเธญเธเธฑเนเธงเนเธกเธเนเธฅเนเธง)
  const rateLimitCheck = checkIpRateLimit(ipActivityMap, GAME_COOLDOWN, ip);
  if (!rateLimitCheck.allowed) {
    // เนเธเนเธ•เธฃเธงเธเธชเธญเธ cooldown เน€เธ—เนเธฒเธเธฑเนเธ (เนเธกเนเนเธเน rate limit)
    return {
      valid: false,
      error: rateLimitCheck.reason,
      code: "COOLDOWN"
    };
  }
  
  // 3. Check suspicious wallet pair (เธเธฃเธฑเธเธเธฃเธธเธเนเธซเนเธขเธทเธ”เธซเธขเธธเนเธเธ•เธฒเธกเธเธณเธเธงเธเธเธนเนเน€เธฅเนเธ)
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












