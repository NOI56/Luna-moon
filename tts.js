// modules/tts.js
// ElevenLabs TTS with multiple voices and simple caching (non-streaming).

import fs from "fs";
import path from "path";
import fetch from "node-fetch";
import { v4 as uuidv4 } from "uuid";

const ELEVEN_KEY = process.env.ELEVEN_KEY || "";
const ELEVEN_VOICE = process.env.ELEVEN_VOICE || "alloy";
const ELEVEN_VOICE_NORMAL = process.env.ELEVEN_VOICE_NORMAL || "";
const ELEVEN_VOICE_SOFT = process.env.ELEVEN_VOICE_SOFT || "";
const ELEVEN_VOICE_PASSION = process.env.ELEVEN_VOICE_PASSION || "";
const ELEVEN_VOICE_CALM = process.env.ELEVEN_VOICE_CALM || "";

const TTS_DIR = path.join(process.cwd(), "public", "tts");
fs.mkdirSync(TTS_DIR, { recursive: true });

function resolveVoiceId(mode) {
  const candidates = [];
  if (mode === "soft") {
    if (ELEVEN_VOICE_SOFT) candidates.push(ELEVEN_VOICE_SOFT);
    if (ELEVEN_VOICE_CALM) candidates.push(ELEVEN_VOICE_CALM);
  } else if (mode === "passion") {
    if (ELEVEN_VOICE_PASSION) candidates.push(ELEVEN_VOICE_PASSION);
    if (ELEVEN_VOICE_NORMAL) candidates.push(ELEVEN_VOICE_NORMAL);
  } else if (mode === "calm") {
    if (ELEVEN_VOICE_CALM) candidates.push(ELEVEN_VOICE_CALM);
    if (ELEVEN_VOICE_SOFT) candidates.push(ELEVEN_VOICE_SOFT);
  } else {
    if (ELEVEN_VOICE_NORMAL) candidates.push(ELEVEN_VOICE_NORMAL);
    if (ELEVEN_VOICE_CALM) candidates.push(ELEVEN_VOICE_CALM);
  }
  if (!candidates.length) candidates.push(ELEVEN_VOICE);
  return candidates[Math.floor(Math.random() * candidates.length)];
}

const cache = new Map(); // key: mode + text -> filename

export async function generateTTS(text, mode = "normal") {
  if (!ELEVEN_KEY) {
    console.warn("[tts] no ELEVEN_KEY set");
    return null;
  }
  const trimmed = (text || "").trim();
  if (!trimmed) return null;
  const key = `${mode}::${trimmed}`;
  if (cache.has(key)) return cache.get(key);

  const voiceId = resolveVoiceId(mode);
  const filename = uuidv4() + ".mp3";
  const filepath = path.join(TTS_DIR, filename);

  const body = {
    text: trimmed,
    model_id: "eleven_multilingual_v2",
    voice_settings: { stability: 0.4, similarity_boost: 0.9 }
  };

  const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": ELEVEN_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  if (!resp.ok) {
    console.warn("[tts] elevenlabs error", resp.status);
    return null;
  }
  const buf = Buffer.from(await resp.arrayBuffer());
  fs.writeFileSync(filepath, buf);
  cache.set(key, filename);
  return filename;
}
