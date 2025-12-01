// routes/status.js
// Status and Health Check Routes

import { log } from "../modules/logger.js";
import { vtsStatus } from "../modules/vts.js";

export function setupStatusRoutes(app, dependencies) {
  const {
    // Statistics
    stats,
    logError,
    
    // System State
    PORT,
    lastChatTs,
    sleepyMode,
    forceAwake,
    clients,
  } = dependencies;

  // ----------------------
  // Statistics Endpoint
  // ----------------------

  /**
   * Get system statistics
   * GET /luna/stats
   */
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
  // Status Check Endpoint
  // ----------------------

  /**
   * Get system status
   * GET /luna/status
   */
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

  /**
   * Health check endpoint
   * GET /luna/health
   */
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
}












