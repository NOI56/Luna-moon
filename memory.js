// modules/memory.js
// File-backed memory per user + JSONL log, plus DB mirror.

import fs from "fs";
import path from "path";
import { logMemory } from "./db.js";

const STATE_FILE = path.join(process.cwd(), "tmp", "luna_memory.json");
const LOG_FILE = path.join(process.cwd(), "tmp", "luna_memory_log.jsonl");

function loadAll() {
  try {
    if (!fs.existsSync(STATE_FILE)) return {};
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function saveAll(all) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(all, null, 2), "utf8");
}

function appendLog(username, state) {
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    username,
    state
  });
  fs.appendFileSync(LOG_FILE, line + "\n", "utf8");
}

export function getUserMemory(username) {
  const all = loadAll();
  return all[username] || null;
}

export function updateUserMemory(username, patch = {}) {
  if (!username) return;
  const all = loadAll();
  const prev = all[username] || {
    username,
    timesSeen: 0,
    createdAt: new Date().toISOString()
  };
  const updated = {
    ...prev,
    ...patch,
    timesSeen: (prev.timesSeen || 0) + 1,
    updatedAt: new Date().toISOString()
  };
  all[username] = updated;
  saveAll(all);
  appendLog(username, updated);
  try {
    logMemory(username, updated.lastEmotion || null, updated.traits || []);
  } catch (e) {
    console.warn("[memory] DB mirror failed:", e.message);
  }
  return updated;
}
