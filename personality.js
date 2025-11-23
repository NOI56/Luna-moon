// modules/personality.js
// Global lightweight personality state for Luna.

import fs from "fs";
import path from "path";

const FILE = path.join(process.cwd(), "tmp", "personality.json");

function load() {
  try {
    if (!fs.existsSync(FILE)) {
      return { energy: 0.5, sadness: 0.0, lastReset: new Date().toISOString() };
    }
    return JSON.parse(fs.readFileSync(FILE, "utf8"));
  } catch {
    return { energy: 0.5, sadness: 0.0, lastReset: new Date().toISOString() };
  }
}

function save(state) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(state, null, 2), "utf8");
}

export function updatePersonalityFromEmotion(emotion) {
  const s = load();
  if (emotion === "excited" || emotion === "happy") {
    s.energy = Math.min(1, s.energy + 0.05);
    s.sadness = Math.max(0, s.sadness - 0.02);
  } else if (emotion === "sad") {
    s.sadness = Math.min(1, s.sadness + 0.06);
    s.energy = Math.max(0, s.energy - 0.03);
  } else if (emotion === "angry") {
    s.energy = Math.min(1, s.energy + 0.02);
  }
  s.lastReset = new Date().toISOString();
  save(s);
}

export function decayPersonality() {
  const s = load();
  s.energy += (0.5 - s.energy) * 0.06;
  s.sadness += (0.0 - s.sadness) * 0.12;
  s.lastReset = new Date().toISOString();
  save(s);
}

export function getPersonalitySnapshot() {
  return load();
}
