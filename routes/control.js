// routes/control.js
// Control Routes (Wake, Sleep)

import { log } from "../modules/logger.js";
import { setBreathingMode, clearExpressions, triggerForEmotion } from "../modules/vts.js";

export function setupControlRoutes(app, dependencies) {
  const {
    // Functions (for updating state)
    setSleepyMode,
    setForceAwake,
  } = dependencies;

  // ----------------------
  // Wake Override API
  // ----------------------

  /**
   * Force Luna to wake up
   * GET /luna/wake
   */
  app.get("/luna/wake", (req, res) => {
    setForceAwake(true);
    setSleepyMode(false);
    try {
      setBreathingMode("normal");
      clearExpressions();
      triggerForEmotion("soft");
    } catch (e) {
      log.warn("[wake] vts error:", e.message);
    }
    return res.json({
      ok: true,
      message: "Luna is now awake temporarily (override on).",
    });
  });

  // ----------------------
  // Allow Sleep API
  // ----------------------

  /**
   * Allow Luna to sleep again
   * GET /luna/allow-sleep
   */
  app.get("/luna/allow-sleep", (req, res) => {
    setForceAwake(false);
    return res.json({
      ok: true,
      message: "Sleepy behavior restored (override off).",
    });
  });
}

