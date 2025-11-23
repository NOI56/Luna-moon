// modules/classifier.js
// Heuristic สำหรับ "ควรตอบไหม" + Emotion Engine (pure, deterministic, rule-based)

// -----------------------------
// 1) shouldRespondHeuristic
// -----------------------------

const FORCE_KEYWORDS = [
  "luna",
  "moon",
  "pump",
  "fun",
  "help",
  "pls",
  "please",
  "love",
  "hate",
  "why",
  "gm",
  "gn",
  "good morning",
  "good night",
  "question",
  "?",
  "how",
  "what",
  "when",
  "where",
  "who",
];

export function shouldRespondHeuristic(text) {
  // Normalize the text
  const t = (text || "").toLowerCase().trim();

  // If text is empty → return false
  if (!t) return false;

  // If text length >= 120 characters → always respond
  if (t.length >= 120) return true;

  // Check for force keywords
  if (FORCE_KEYWORDS.some((keyword) => t.includes(keyword))) {
    return true;
  }

  // Ends with ? → likely a question
  if (t.endsWith("?")) return true;

  // Short messages → random response (keep existing behavior)
  if (t.length <= 3) return Math.random() < 0.2;
  if (t.length <= 10) return Math.random() < 0.4;

  // Default → 70% chance to respond
  return Math.random() < 0.7;
}

// -----------------------------
// 2) classifyEmotion (pure, deterministic, rule-based)
// -----------------------------

// Priority order matters: check stronger emotions first
const EMOTION_PATTERNS = {
  angry: [
    // Direct insults and profanity (highest priority)
    "fuck you",
    "fuck off",
    "shut up",
    "stupid",
    "idiot",
    "dumb",
    "retard",
    "trash",
    "scam",
    "rug",
    "rugged",
    // Anger indicators
    "angry",
    "mad",
    "pissed",
    "upset",
    "annoyed",
    "furious",
    "rage",
    "hate you",
    "i hate",
    "disgusting",
  ],
  sad: [
    // Sadness indicators
    "sad",
    "depressed",
    "lonely",
    "cry",
    "crying",
    "hurt",
    "heartbroken",
    "i feel bad",
    "i feel down",
    "i'm sad",
    "im sad",
    "feeling sad",
    // Financial loss (crypto context)
    "rekt",
    "broke",
    "lost everything",
    "ruined",
    "devastated",
  ],
  sleepy: [
    // Sleep indicators
    "sleepy",
    "tired",
    "exhausted",
    "going to bed",
    "need sleep",
    "yawning",
    "yawn",
    "i want to sleep",
    "i'm going to sleep",
    "im going to sleep",
    "going to sleep",
    "time to sleep",
    "bedtime",
    "zzz",
  ],
  hype: [
    // Excitement and hype
    "hype",
    "let's go",
    "lets go",
    "lfg",
    "to the moon",
    "moon",
    "send it",
    "moon mission",
    "pump",
    "pumping",
    // Positive excitement
    "so cool",
    "awesome",
    "amazing",
    "insane",
    "we're winning",
    "we are winning",
    "bullish",
    "pog",
    "poggers",
    "fire",
    "lit",
    "wow",
  ],
  soft: [
    // Affectionate and sweet
    "cute",
    "adorable",
    "sweet",
    "love you luna",
    "love you",
    "i love you",
    "thank you luna",
    "thank you so much",
    "thanks luna",
    "wholesome",
    "cozy",
    "i like you",
    "you're so nice",
    "you are so nice",
    "you're cute",
    "you are cute",
    "appreciate",
    "grateful",
  ],
};

// Pure, deterministic emotion classification
export function classifyEmotion(message) {
  if (!message || typeof message !== "string") {
    return null;
  }

  // Normalize: lowercase only (keep structure for phrase matching)
  const text = message.toLowerCase().trim();
  if (!text) return null;

  // Check emotions in priority order (angry → sad → sleepy → hype → soft)
  // This ensures stronger emotions override weaker ones
  const emotionOrder = ["angry", "sad", "sleepy", "hype", "soft"];

  for (const emotion of emotionOrder) {
    const patterns = EMOTION_PATTERNS[emotion];
    if (!patterns) continue;

    // Check if any pattern matches
    for (const pattern of patterns) {
      if (text.includes(pattern)) {
        return emotion;
      }
    }
  }

  // No emotion detected
  return null;
}

// -----------------------------
// 4) classifyMixedEmotions (อารมณ์ผสม)
// -----------------------------

/**
 * ตรวจจับอารมณ์หลายตัวพร้อมกัน
 * @param {string} message - ข้อความจากผู้ใช้
 * @returns {Object} - { primary: string, secondary: string | null }
 */
export function classifyMixedEmotions(message) {
  if (!message || typeof message !== "string") {
    return { primary: null, secondary: null };
  }

  const text = message.toLowerCase().trim();
  if (!text) return { primary: null, secondary: null };

  const detectedEmotions = [];
  const emotionOrder = ["angry", "sad", "sleepy", "hype", "soft"];

  // ตรวจจับอารมณ์ทั้งหมดที่พบ
  for (const emotion of emotionOrder) {
    const patterns = EMOTION_PATTERNS[emotion];
    if (!patterns) continue;

    for (const pattern of patterns) {
      if (text.includes(pattern)) {
        detectedEmotions.push(emotion);
        break; // หยุดเมื่อพบอารมณ์นี้แล้ว
      }
    }
  }

  if (detectedEmotions.length === 0) {
    return { primary: null, secondary: null };
  }

  if (detectedEmotions.length === 1) {
    return { primary: detectedEmotions[0], secondary: null };
  }

  // ถ้ามีหลายอารมณ์ → ใช้อารมณ์แรกเป็น primary, อารมณ์ที่สองเป็น secondary
  return {
    primary: detectedEmotions[0],
    secondary: detectedEmotions[1],
  };
}

// -----------------------------
// 3) calculateEmotionIntensity (ความแรงของอารมณ์)
// -----------------------------

// คำศัพท์ที่แรงมาก (intensity: 0.9-1.0)
const STRONG_EMOTION_PATTERNS = {
  angry: [
    "fuck you",
    "fuck off",
    "shut up",
    "stupid",
    "idiot",
    "retard",
    "disgusting",
    "hate you",
    "i hate you",
  ],
  sad: [
    "heartbroken",
    "lost everything",
    "ruined",
    "devastated",
    "i want to die",
    "kill myself",
  ],
  hype: [
    "let's go",
    "lfg",
    "to the moon",
    "moon mission",
    "we're winning",
    "bullish",
  ],
  soft: [
    "love you luna",
    "i love you",
    "thank you so much",
    "you're so nice",
  ],
};

// คำศัพท์ที่อ่อน (intensity: 0.3-0.5)
const WEAK_EMOTION_PATTERNS = {
  angry: [
    "annoyed",
    "upset",
    "a bit mad",
  ],
  sad: [
    "a bit sad",
    "feeling down",
    "kinda sad",
  ],
  hype: [
    "pretty cool",
    "nice",
    "good",
  ],
  soft: [
    "cute",
    "sweet",
    "nice",
  ],
};

/**
 * คำนวณความแรงของอารมณ์ (0.0 - 1.0)
 * @param {string} message - ข้อความจากผู้ใช้
 * @param {string} emotion - อารมณ์ที่ตรวจจับได้
 * @returns {number} - intensity (0.0 - 1.0)
 */
export function calculateEmotionIntensity(message, emotion) {
  if (!message || !emotion) return 0.7; // Default intensity

  const text = message.toLowerCase().trim();
  if (!text) return 0.7;

  // ตรวจสอบคำศัพท์ที่แรงมาก
  const strongPatterns = STRONG_EMOTION_PATTERNS[emotion] || [];
  for (const pattern of strongPatterns) {
    if (text.includes(pattern)) {
      return 0.9 + Math.random() * 0.1; // 0.9 - 1.0
    }
  }

  // ตรวจสอบคำศัพท์ที่อ่อน
  const weakPatterns = WEAK_EMOTION_PATTERNS[emotion] || [];
  for (const pattern of weakPatterns) {
    if (text.includes(pattern)) {
      return 0.3 + Math.random() * 0.2; // 0.3 - 0.5
    }
  }

  // Default: ปานกลาง
  return 0.6 + Math.random() * 0.2; // 0.6 - 0.8
}

// -----------------------------
// 5) classifyEmotionContext (อารมณ์ตามบริบท)
// -----------------------------

// บริบทต่างๆ ที่ตรวจจับได้
const EMOTION_CONTEXTS = {
  financial: [
    "money", "lost", "broke", "rich", "poor", "bought", "sold", "price", "profit", "loss",
    "investment", "invest", "trade", "trading", "wallet", "balance", "crypto", "token",
    "coin", "sol", "solana", "rekt", "rug", "pump", "dump", "moon", "crash"
  ],
  achievement: [
    "promoted", "promotion", "won", "win", "achieved", "accomplished", "success",
    "succeed", "victory", "champion", "first place", "award", "prize"
  ],
  loss: [
    "died", "death", "lost", "gone", "missing", "left", "abandoned", "betrayed",
    "cheated", "lied", "broken", "heartbroken"
  ],
  health: [
    "sick", "ill", "pain", "hurt", "injured", "hospital", "doctor", "medicine",
    "cure", "heal", "recover", "better", "worse"
  ],
  relationship: [
    "girlfriend", "boyfriend", "wife", "husband", "friend", "family", "parent",
    "divorce", "breakup", "together", "marry", "marriage", "love", "hate"
  ],
  work: [
    "work", "job", "boss", "colleague", "fired", "hired", "promoted", "salary",
    "office", "meeting", "project", "deadline", "stress", "pressure"
  ],
};

/**
 * ตรวจจับบริบทของอารมณ์
 * @param {string} message - ข้อความจากผู้ใช้
 * @returns {string | null} - บริบทที่ตรวจจับได้
 */
export function classifyEmotionContext(message) {
  if (!message || typeof message !== "string") {
    return null;
  }

  const text = message.toLowerCase().trim();
  if (!text) return null;

  // ตรวจสอบบริบทต่างๆ
  for (const [context, keywords] of Object.entries(EMOTION_CONTEXTS)) {
    for (const keyword of keywords) {
      if (text.includes(keyword)) {
        return context;
      }
    }
  }

  return null;
}

export function isClearlyNegativeMessage(text) {
  const t = (text || "").toLowerCase();
  if (!t) return false;

  const NEGATIVE_WORDS = [
    "you are so bad",
    "so bad",
    "hate you",
    "i hate you",
    "stupid",
    "idiot",
    "trash",
    "disgusting",
    "ugly",
  ];

  return NEGATIVE_WORDS.some((w) => t.includes(w));
}
