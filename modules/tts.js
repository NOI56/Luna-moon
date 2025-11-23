// modules/tts.js
// ElevenLabs TTS integration for Luna (normal / soft / passion) + สวิตช์เปิด–ปิดเสียง

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

dotenv.config();

// ----------------------
// ENV & Voice IDs
// ----------------------

const ELEVEN_KEY = process.env.ELEVEN_KEY || "";

const ELEVEN_VOICE_NORMAL =
  process.env.ELEVEN_VOICE_NORMAL ||
  process.env.ELEVEN_VOICE ||
  "21m00Tcm4TlvDq8ikWAM"; // fallback

const ELEVEN_VOICE_SOFT =
  process.env.ELEVEN_VOICE_SOFT || ELEVEN_VOICE_NORMAL;

const ELEVEN_VOICE_PASSION =
  process.env.ELEVEN_VOICE_PASSION || ELEVEN_VOICE_NORMAL;

// ✅ สวิตช์เปิด–ปิด TTS จาก .env (ถ้าเป็น "false" จะไม่สร้างเสียง)
const TTS_ENABLED = process.env.TTS_ENABLED !== "false";

if (!ELEVEN_KEY) {
  console.log("[tts] no ELEVEN_KEY set");
}
console.log("[tts] TTS_ENABLED =", TTS_ENABLED);

// ----------------------
// path เก็บไฟล์เสียง
// ----------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TTS_DIR = path.join(__dirname, "..", "public", "tts");
if (!fs.existsSync(TTS_DIR)) {
  fs.mkdirSync(TTS_DIR, { recursive: true });
}

// ----------------------
// Anime-style voice settings
// ----------------------

const VOICE_SETTINGS = {
  // 🎀 ปกติ – เสียงคุยบนสตรีม (พูดช้าลงเหมือนคน)
  normal: {
    stability: 0.65,
    similarity_boost: 0.9,
    style: 0.3,
    use_speaker_boost: true,
    voice_speed: 0.85  // ลดจาก 1.0 เป็น 0.85 (พูดช้าลง 15%)
  },

  // 💞 อ้อน – นุ่ม ช้า เขิน
  soft: {
    stability: 0.18,
    similarity_boost: 0.98,
    style: 1.0,
    use_speaker_boost: true,
    voice_speed: 0.70  // ลดจาก 0.78 เป็น 0.70 (พูดช้าลงอีกนิด)
  },

  // 🔥 ลุย / hyped (ยังเร็วแต่ไม่เร็วเกินไป)
  passion: {
    stability: 0.4,
    similarity_boost: 0.95,
    style: 0.9,
    use_speaker_boost: true,
    voice_speed: 0.95  // ลดจาก 1.1 เป็น 0.95 (พูดช้าลงให้เหมือนคน)
  },
  
  // 📖 อ่านเม้น - พูดช้ากว่าปกติ
  reading: {
    stability: 0.5,
    similarity_boost: 0.9,
    style: 0.2,
    use_speaker_boost: true,
    voice_speed: 0.60  // พูดช้ามาก (60% ของความเร็วปกติ)
  },
  
  // 📖 อ่านเม้นแบบเบา - พูดช้าและเบากว่าปกติ
  reading_quiet: {
    stability: 0.4,
    similarity_boost: 0.85,
    style: 0.15,
    use_speaker_boost: false,  // ปิด speaker boost เพื่อให้เสียงเบาลง
    voice_speed: 0.55  // พูดช้ากว่า reading mode อีกนิด (55% ของความเร็วปกติ)
  }
};

function resolveVoice(mode) {
  if (mode === "soft") return ELEVEN_VOICE_SOFT;
  if (mode === "passion") return ELEVEN_VOICE_PASSION;
  if (mode === "reading" || mode === "reading_quiet") return ELEVEN_VOICE_SOFT; // ใช้ soft voice สำหรับอ่าน
  return ELEVEN_VOICE_NORMAL;
}

function resolveSettings(mode) {
  return VOICE_SETTINGS[mode] || VOICE_SETTINGS.normal;
}

// ----------------------
// preprocess ให้ฟังดูเป็น vtuber มากขึ้น
// ----------------------

function preprocessTextForMode(text, mode = "normal") {
  let t = (text || "").toString().trim();
  if (!t) return "";

  const loveWords = ["thank", "love", "support", "cute", "sweet", "miss"];
  const lower = t.toLowerCase();
  const isLoveContext = loveWords.some((w) => lower.includes(w));

  const softPrefixes = [
    "Mmm~ ",
    "Aww~ ",
    "Ehehe~ ",
    "Hehe~ ",
    "U-uhm... ",
    "E-eh? ",
    "Nnh~ ",
    "Ehehe, "
  ];

  const hypePrefixes = [
    "Let’s goo~ ",
    "Yatta~! ",
    "Waaah~ ",
    "Ehehe, ",
    "Oho~ ",
    "Hehe, "
  ];

  let prefix = "";

  if (mode === "soft") {
    prefix = softPrefixes[Math.floor(Math.random() * softPrefixes.length)];
  } else if (mode === "passion") {
    if (Math.random() < 0.7) {
      prefix = hypePrefixes[Math.floor(Math.random() * hypePrefixes.length)];
    }
  }

  if (mode === "soft") {
    if (isLoveContext) {
      t = t
        .replace(/\byou\b/i, "y-you")
        .replace(/\bthank\b/i, "th-thank")
        .replace(/\blove\b/i, "l-love")
        .replace(/\bsupport\b/i, "su-support");
    }

    t = t
      .replace(/\breally\b/gi, "reaaally")
      .replace(/\bso\b/gi, "soo")
      .replace(/\bvery\b/gi, "veery");
  }

  const softEndings = [
    " okay~?",
    "~",
    " alright~?",
    " you know~?",
    " mm~",
    " really~",
    " for me~?"
  ];
  const hypeEndings = ["!!", "~!!", "!! ✨", "!! 🚀", "~!"];

  let ending = "";

  if (mode === "soft") {
    if (!/[!?~]$/.test(t)) {
      ending = softEndings[Math.floor(Math.random() * softEndings.length)];
    }
  } else if (mode === "passion") {
    if (!/[!?~]$/.test(t)) {
      ending = hypeEndings[Math.floor(Math.random() * hypeEndings.length)];
    }
  }

  return `${prefix}${t}${ending}`;
}

// ----------------------
// main TTS function
// ----------------------

export async function speak(text, options = {}) {
  // 🔇 ถ้า TTS ถูกปิด → ไม่สร้างเสียง แต่ยังส่งข้อความตัวหนังสือได้ตามปกติ
  if (!TTS_ENABLED) {
    console.log("[tts] disabled (TTS_ENABLED=false), skip audio for:", text);
    return null;
  }

  try {
    const mode =
      typeof options === "string" ? options : options.voiceMode || "normal";

    const voiceId = resolveVoice(mode);
    const settings = resolveSettings(mode);

    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
    const processedText = preprocessTextForMode(text, mode);

    const body = JSON.stringify({
      text: processedText,
      model_id: "eleven_multilingual_v2",
      voice_settings: settings
    });

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": ELEVEN_KEY,
        "Content-Type": "application/json"
      },
      body
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error("[tts] API request failed:", res.status, errorText);
      
      // Retry once for 5xx errors
      if (res.status >= 500 && res.status < 600) {
        console.log("[tts] Retrying after 1 second...");
        await new Promise(resolve => setTimeout(resolve, 1000));
        const retryRes = await fetch(url, {
          method: "POST",
          headers: {
            "xi-api-key": ELEVEN_KEY,
            "Content-Type": "application/json"
          },
          body
        });
        if (retryRes.ok) {
          const buffer = Buffer.from(await retryRes.arrayBuffer());
          const id = crypto.randomUUID();
          const filename = `${id}.mp3`;
          const outputPath = path.join(TTS_DIR, filename);
          fs.writeFileSync(outputPath, buffer);
          console.log("[tts] ✅ Retry successful, saved", outputPath);
          return id;
        }
      }
      return null;
    }

    const buffer = Buffer.from(await res.arrayBuffer());

    const id = crypto.randomUUID();
    const filename = `${id}.mp3`;
    const outputPath = path.join(TTS_DIR, filename);

    fs.writeFileSync(outputPath, buffer);
    console.log("[tts] saved", outputPath);

    // คืนค่าเป็น id อย่างเดียว ให้ index.js ไปต่อเป็น /public/tts/{id}.mp3
    return id;
  } catch (err) {
    console.error("[tts] Error generating TTS:", err);
    return null;
  }
}

// --- alias สำหรับโค้ดเดิมที่ใช้ชื่อ generateTTS ---
export async function generateTTS(text, voiceMode = "normal") {
  return speak(text, { voiceMode });
}

// 🌙 ระบบพึมพำเบา ๆ / ถอนหายใจ / hype mood
export async function ambientMurmur(mode = "soft") {
  const moodLines = {
    soft: [
      "Ehehe~ you guys are too sweet sometimes~",
      "Mmm~ feels cozy tonight~",
      "Hehe... wonder if you’re still watching~",
      "Sigh~ it’s so quiet here... maybe everyone’s sleeping~",
      "E-eh? No one’s here? Aww... that’s okay~ Luna will wait~",
      "Hehe~ I’m just stretching a bit... been sitting too long~"
    ],
    passion: [
      "Waaah~ everyone’s so hyped tonight!!",
      "Ehehe~ I can feel the Luna energy rising~!!",
      "Let’s goo~ this stream is on fire!!",
      "Hmm~ maybe I should sing something...?",
      "Oho~ this vibe... I love it~!"
    ]
  };

  const list = moodLines[mode] || moodLines.soft;
  const text = list[Math.floor(Math.random() * list.length)];

  console.log(`[mood] Luna murmuring: ${text}`);
  return await speak(text, { voiceMode: mode === "passion" ? "passion" : "soft" });
}
