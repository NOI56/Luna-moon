// routes/vts.js
// VTube Studio Routes (Expression, Parameters)

import { log } from "../modules/logger.js";
import { triggerForEmotion, vtsStatus, getVTSParameters } from "../modules/vts.js";

export function setupVtsRoutes(app, dependencies) {
  // ----------------------
  // Expression Test API
  // ----------------------

  /**
   * Test emotion expression
   * GET /luna/expression?emo=angry
   */
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
      log.error("[/Luna/expression] error:", err);
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
  // VTS Parameters API
  // ----------------------

  /**
   * Get VTS parameters
   * GET /luna/vts/parameters
   */
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
}






























