// routes/admin.js
// Admin Routes

import { log } from "../modules/logger.js";
import { createBackup, listBackups, restoreBackup, getBackupStats } from "../modules/backup.js";

/**
 * Setup Admin routes
 * @param {Object} app - Express app instance
 * @param {Object} dependencies - Dependencies needed by routes
 */
export function setupAdminRoutes(app, dependencies) {
  const {
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
  } = dependencies;

  /**
   * Admin Secret Middleware
   */
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

  /**
   * Clear user memory
   * GET /luna/admin/clear-memory?user=username
   */
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
      log.error(`[admin] Failed to clear memory: ${e.message}`, { endpoint: "/luna/admin/clear-memory", error: e });
      return res.status(500).json({ ok: false, error: "Failed to clear memory" });
    }
  });

  /**
   * Reset personality
   * GET /luna/admin/reset-personality
   */
  app.get("/luna/admin/reset-personality", requireAdminSecret, async (req, res) => {
    try {
      const { resetPersonality } = await import("../modules/personality.js");
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
      log.error(e, { endpoint: "/luna/admin/reset-personality" });
      return res.status(500).json({ ok: false, error: "Failed to reset personality" });
    }
  });

  /**
   * Clear response cache
   * GET /luna/admin/clear-cache
   */
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
      log.error(e, { endpoint: "/luna/admin/clear-cache" });
      return res.status(500).json({ ok: false, error: "Failed to clear cache" });
    }
  });

  /**
   * Get error logs
   * GET /luna/admin/errors?limit=50
   */
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
      log.error(e, { endpoint: "/luna/admin/errors" });
      return res.status(500).json({ ok: false, error: "Failed to get errors" });
    }
  });

  /**
   * Reset statistics
   * GET /luna/admin/reset-stats
   */
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
      log.error(e, { endpoint: "/luna/admin/reset-stats" });
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
      log.error(e, { endpoint: "/luna/admin/anti-abuse/log" });
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
      log.error(e, { endpoint: "/luna/admin/anti-abuse/pairs" });
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
      log.error(e, { endpoint: "/luna/admin/anti-abuse/wallets" });
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
      log.error(e, { endpoint: "/luna/admin/anti-abuse/block-wallet" });
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
      log.error(e, { endpoint: "/luna/admin/anti-abuse/block-ip" });
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
      log.error(e, { endpoint: "/luna/admin/anti-abuse/reward-banned" });
      return res.status(500).json({ ok: false, error: "Failed to get reward banned list" });
    }
  });

  /**
   * Create backup (Admin only)
   * POST /luna/admin/backup/create
   */
  app.post("/luna/admin/backup/create", requireAdminSecret, async (req, res) => {
    try {
      const result = await createBackup();
      if (result.success) {
        return res.json({
          ok: true,
          message: "Backup created successfully",
          backupPath: result.backupPath,
          backedUpFiles: result.backedUpFiles,
          errors: result.errors
        });
      } else {
        return res.status(500).json({
          ok: false,
          error: result.error || "Failed to create backup"
        });
      }
    } catch (e) {
      log.error(e, { endpoint: "/luna/admin/backup/create" });
      return res.status(500).json({ ok: false, error: "Failed to create backup" });
    }
  });

  /**
   * List backups (Admin only)
   * GET /luna/admin/backup/list
   */
  app.get("/luna/admin/backup/list", requireAdminSecret, (req, res) => {
    try {
      const backups = listBackups();
      return res.json({
        ok: true,
        backups,
        count: backups.length
      });
    } catch (e) {
      log.error(e, { endpoint: "/luna/admin/backup/list" });
      return res.status(500).json({ ok: false, error: "Failed to list backups" });
    }
  });

  /**
   * Get backup statistics (Admin only)
   * GET /luna/admin/backup/stats
   */
  app.get("/luna/admin/backup/stats", requireAdminSecret, (req, res) => {
    try {
      const stats = getBackupStats();
      return res.json({
        ok: true,
        stats
      });
    } catch (e) {
      log.error(e, { endpoint: "/luna/admin/backup/stats" });
      return res.status(500).json({ ok: false, error: "Failed to get backup stats" });
    }
  });

  /**
   * Restore from backup (Admin only)
   * POST /luna/admin/backup/restore
   * Body: { backupName: "backup-2024-01-01T12-00-00" }
   */
  app.post("/luna/admin/backup/restore", requireAdminSecret, async (req, res) => {
    try {
      const { backupName } = req.body;
      
      if (!backupName) {
        return res.status(400).json({
          ok: false,
          error: "backupName is required"
        });
      }
      
      const result = await restoreBackup(backupName);
      if (result.success) {
        return res.json({
          ok: true,
          message: "Backup restored successfully",
          restoredFiles: result.restoredFiles,
          errors: result.errors
        });
      } else {
        return res.status(500).json({
          ok: false,
          error: result.error || "Failed to restore backup"
        });
      }
    } catch (e) {
      log.error(e, { endpoint: "/luna/admin/backup/restore" });
      return res.status(500).json({ ok: false, error: "Failed to restore backup" });
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
      log.error(e, { endpoint: "/luna/admin/anti-abuse/unban-reward" });
      return res.status(500).json({ ok: false, error: "Failed to unban from rewards" });
    }
  });
}

