// modules/memory.js
// File-backed memory per user + JSONL log, plus DB mirror.
// Enhanced with emotionHistory, emotionScore, and sessionTag for Luna v10.

import fs from "fs";
import path from "path";
import { logMemory } from "./db.js";

const STATE_FILE = path.join(process.cwd(), "tmp", "luna_memory.json");
const LOG_FILE = path.join(process.cwd(), "tmp", "luna_memory_log.jsonl");

// Generate session tag on module load
const SESSION_TAG = Math.random().toString(36).slice(2);

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

// Migrate old memory format to new format
function migrateMemory(oldMem) {
  if (!oldMem) return null;
  
  // If it already has sessionTag, it's already migrated (but check if session changed)
  if (oldMem.sessionTag) {
    // If sessionTag changed, reset emotionScore and emotionHistory
    if (oldMem.sessionTag !== SESSION_TAG) {
      return {
        ...oldMem,
        sessionTag: SESSION_TAG,
        emotionScore: 0,
        emotionHistory: [],
        conversationHistory: [],
      };
    }
    // Ensure all new fields exist
    return {
      ...oldMem,
      emotionHistory: oldMem.emotionHistory || [],
      emotionScore: oldMem.emotionScore ?? 0,
      conversationHistory: oldMem.conversationHistory || [],
      preferences: oldMem.preferences || [],
      sessionTag: SESSION_TAG,
    };
  }
  
  // Migrate from old format
  return {
    username: oldMem.username,
    timesSeen: oldMem.timesSeen || 0,
    createdAt: oldMem.createdAt || new Date().toISOString(),
    updatedAt: oldMem.updatedAt || new Date().toISOString(),
    lastMessage: oldMem.lastMessage || null,
    lastReply: oldMem.lastReply || null,
    lastEmotion: oldMem.lastEmotion || null,
    traits: oldMem.traits || [],
    emotionHistory: [],
    emotionScore: 0,
    conversationHistory: oldMem.conversationHistory || [],
    preferences: oldMem.preferences || [],
    sessionTag: SESSION_TAG,
  };
}

export function getUserMemory(username) {
  if (!username) return null;
  const all = loadAll();
  const mem = all[username];
  if (!mem) return null;
  return migrateMemory(mem);
}

export function updateUserMemory(username, patch = {}) {
  if (!username) return;
  
  const all = loadAll();
  const prev = all[username];
  
  // Initialize or migrate existing memory
  let base = prev ? migrateMemory(prev) : {
    username,
    timesSeen: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastMessage: null,
    lastReply: null,
    lastEmotion: null,
    traits: [],
    emotionHistory: [],
    emotionScore: 0,
    conversationHistory: [],
    preferences: [],
    sessionTag: SESSION_TAG,
  };
  
  // If sessionTag changed, reset emotionScore and emotionHistory
  if (base.sessionTag !== SESSION_TAG) {
    base.emotionScore = 0;
    base.emotionHistory = [];
    base.sessionTag = SESSION_TAG;
  }
  
  // Update emotionScore based on lastEmotion in patch
  let emotionScore = base.emotionScore ?? 0;
  if (patch.lastEmotion) {
    if (patch.lastEmotion === "soft" || patch.lastEmotion === "hype") {
      emotionScore += 1;
    } else if (patch.lastEmotion === "sad" || patch.lastEmotion === "angry") {
      emotionScore -= 1;
    }
    // Clamp between -10 and +10
    emotionScore = Math.max(-10, Math.min(10, emotionScore));
  }
  
  // Update emotionHistory
  let emotionHistory = base.emotionHistory || [];
  if (patch.lastMessage || patch.lastReply || patch.lastEmotion) {
    const historyEntry = {
      text: patch.lastMessage || null,
      reply: patch.lastReply || null,
      emotion: patch.lastEmotion || null,
      ts: new Date().toISOString(),
    };
    emotionHistory.push(historyEntry);
    // Keep only the last 10 entries
    if (emotionHistory.length > 10) {
      emotionHistory = emotionHistory.slice(-10);
    }
  }
  
  // Update conversation history (keep last 5 exchanges)
  let conversationHistory = base.conversationHistory || [];
  if (patch.lastMessage && patch.lastReply) {
    conversationHistory.push({
      user: patch.lastMessage,
      assistant: patch.lastReply,
      emotion: patch.lastEmotion || null,
      ts: new Date().toISOString(),
    });
    // Keep only last 5 exchanges
    if (conversationHistory.length > 5) {
      conversationHistory = conversationHistory.slice(-5);
    }
  }
  
  // Memory decay: Forget old preferences and old conversation history entries
  // Preferences older than 30 days get removed (simulate forgetting)
  const now = Date.now();
  const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
  
  // Decay preferences (remove old ones, keep recent)
  if (preferences.length > 5) {
    preferences = preferences.slice(-5); // Keep only last 5
  }
  
  // Decay conversation history (remove entries older than 7 days)
  if (conversationHistory.length > 0) {
    conversationHistory = conversationHistory.filter(entry => {
      const entryTime = new Date(entry.ts).getTime();
      return entryTime > (now - 7 * 24 * 60 * 60 * 1000); // Keep last 7 days
    });
  }
  
  // Decay emotion history (keep only last 7 entries instead of 10)
  if (emotionHistory.length > 7) {
    emotionHistory = emotionHistory.slice(-7);
  }
  
  // Update personal preferences (extract from messages)
  let preferences = base.preferences || [];
  if (patch.lastMessage) {
    const msg = patch.lastMessage.toLowerCase();
    // Extract preferences (simple keyword matching)
    if (/(like|love|favorite|prefer|enjoy).*(game|music|food|color|movie|show)/.test(msg)) {
      const match = msg.match(/(like|love|favorite|prefer|enjoy).*?(\w+)/);
      if (match && !preferences.includes(match[2])) {
        preferences.push(match[2]);
        if (preferences.length > 10) preferences = preferences.slice(-10);
      }
    }
  }
  
  // Build updated memory object
  const updated = {
    ...base,
    ...patch,
    timesSeen: (base.timesSeen || 0) + 1,
    updatedAt: new Date().toISOString(),
    emotionHistory,
    emotionScore,
    conversationHistory,
    preferences,
    sessionTag: SESSION_TAG,
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
