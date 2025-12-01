// routes/webhook.js
// Webhook Routes (Purchase)

import { log } from "../modules/logger.js";
import { speak } from "../modules/tts.js";
import { triggerForBigBuy, triggerForEmotion } from "../modules/vts.js";

export function setupWebhookRoutes(app, dependencies) {
  const {
    // System State
    sleepyMode,
    forceAwake,
    
    // State getters/setters
    getLastSpeechEndTime,
    setLastSpeechEndTime,
    getTotalSpeechTime,
    setTotalSpeechTime,
    getLunaEnergy,
    setLunaEnergy,
    broadcast,
    estimateSpeechDurationMs,
  } = dependencies;

  // ----------------------
  // Purchase Webhook
  // ----------------------

  /**
   * Purchase webhook
   * POST /purchase
   * Headers: x-purchase-secret (optional)
   * Body: { buyer, amount, currency }
   */
  app.post("/purchase", async (req, res) => {
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

      log.info(`[purchase] ${buyer} bought ${numAmount} ${currency} (${isBigBuy ? "BIG" : "normal"})`);

      let line;

      if (isBigBuy) {
        const templates = [
          "Ehehe~ th-thank you sooo much, {buyer}... that buy was huge for {coin}~",
          "Mmm~ {buyer}, you're really pushing {coin} to the moon for me, huh~?",
          "Aww~ that's reaaally big, {buyer}... you're spoiling me so much~",
          "U-uhm... {buyer}, are you trying to make my heart race with that buy~?",
        ];
        const t = templates[Math.floor(Math.random() * templates.length)];
        line = t.replace(/\{buyer\}/g, buyer).replace(/\{coin\}/g, coinName);

        const speakDuration = estimateSpeechDurationMs(line, "soft");
        setLastSpeechEndTime(Date.now() + speakDuration + 1000); // อัปเดตเวลาพูดเสร็จ
        setTotalSpeechTime(getTotalSpeechTime() + speakDuration); // อัปเดต total speech time
        
        // Energy boost เมื่อมี big buy
        setLunaEnergy(Math.min(1.0, getLunaEnergy() + 0.2));
        
        await speak(line, { voiceMode: "soft" });

        if (!sleepyMode || forceAwake) {
          try {
            triggerForBigBuy(numAmount);
          } catch (e) {
            log.warn("[vts] big buy trigger failed:", e.message);
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
        setLastSpeechEndTime(Date.now() + speakDuration + 1000); // อัปเดตเวลาพูดเสร็จ
        setTotalSpeechTime(getTotalSpeechTime() + speakDuration); // อัปเดต total speech time
        
        // Energy boost เล็กน้อยเมื่อมีคนซื้อ
        setLunaEnergy(Math.min(1.0, getLunaEnergy() + 0.05));
        
        await speak(line, { voiceMode });

        if (!sleepyMode || forceAwake) {
          try {
            triggerForEmotion("hype");
          } catch (e) {
            log.warn("[vts] normal buy emotion trigger failed:", e.message);
          }
        }
      }

      return res.json({ ok: true, line, big: isBigBuy });
    } catch (err) {
      log.error("[purchase] error", err);
      return res.status(500).json({ ok: false, error: "internal error" });
    }
  });
}

