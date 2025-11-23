// modules/vts.js
// ระบบเชื่อมต่อ VTube Studio + Emotion + Idle + Talk-React + Breathing
// Enhanced with stable connection, backoff reconnection, and fail-soft functions

import WebSocket from "ws";
import dotenv from "dotenv";

dotenv.config();

const host = process.env.VTS_HOST || "127.0.0.1";
const port = process.env.VTS_PORT || 8001;
const token = process.env.VTS_AUTH_TOKEN || "";
const enabled = process.env.VTS_ENABLED === "true";

// Internal state object
const state = {
  ws: null,
  connected: false,
  authenticated: false,
  lastError: null,
};

let reconnectTimer = null;
let reconnectDelay = 3000; // Start with 3s, backoff to max 10s
let hasWarnedConnectionRefused = false;

const API_NAME = "VTubeStudioPublicAPI";
const API_VERSION = "1.0";
const MOUTH_PARAM_ID = "MouthOpen"; // ใช้ชื่อจริงจาก VTube Studio

function log(...args) {
  console.log("[vts]", ...args);
}

// Helper to check if VTS is ready
function ensureReady() {
  if (process.env.VTS_ENABLED !== "true") {
    return { ok: false, error: "VTS integration disabled (VTS_ENABLED=false)" };
  }
  if (!state.connected) {
    return { ok: false, error: "VTS socket not connected" };
  }
  if (!state.authenticated) {
    return { ok: false, error: "VTS plugin not authenticated yet" };
  }
  return { ok: true };
}

// Centralized safe send function
function safeSend(payload) {
  const ready = ensureReady();
  if (!ready.ok) {
    return false;
  }
  
  try {
    state.ws.send(JSON.stringify(payload));
    return true;
  } catch (e) {
    log("[error] send error:", e.message);
    state.lastError = e.message;
    return false;
  }
}

// Connection with backoff reconnection
function connectVTS() {
  if (!enabled) {
    return;
  }

  // Clean up existing connection if any
  if (state.ws) {
    try {
      state.ws.removeAllListeners();
      if (state.ws.readyState === WebSocket.OPEN || state.ws.readyState === WebSocket.CONNECTING) {
        state.ws.close();
      }
    } catch (e) {
      // ignore
    }
    state.ws = null;
  }

  const url = `ws://${host}:${port}`;

  try {
    state.ws = new WebSocket(url);

    state.ws.on("open", () => {
      log(`socket opened to ${url}`);
      state.connected = true;
      state.lastError = null;
      hasWarnedConnectionRefused = false;
      reconnectDelay = 3000; // Reset backoff on success
      
      // Send authentication request
      if (!token) {
        // Request authentication token if we don't have one
        const tokenRequest = {
          apiName: API_NAME,
          apiVersion: API_VERSION,
          requestID: "luna-token-request",
          messageType: "AuthenticationTokenRequest",
          data: {
            pluginName: "LunaAI Streamer",
            pluginDeveloper: "Project Luna",
          },
        };
        try {
          state.ws.send(JSON.stringify(tokenRequest));
          log("token request sent");
        } catch (e) {
          log("[error] failed to send token request:", e.message);
        }
      } else {
        sendAuthRequest();
      }
    });

    state.ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        handleMessage(msg);
      } catch (e) {
        log("[error] invalid message:", e.message);
        state.lastError = `Invalid message: ${e.message}`;
      }
    });

    state.ws.on("close", () => {
      state.connected = false;
      state.authenticated = false;
      state.lastError = "Connection closed";
      log("connection closed");
      scheduleReconnect();
    });

    state.ws.on("error", (err) => {
      const errMsg = err.message || String(err);
      state.lastError = errMsg;
      state.connected = false;
      state.authenticated = false;
      
      // Only log ECONNREFUSED once
      if (errMsg.includes("ECONNREFUSED") || errMsg.includes("connect ECONNREFUSED")) {
        if (!hasWarnedConnectionRefused) {
          hasWarnedConnectionRefused = true;
          log(`[error] waiting for VTube Studio at ${url} (ECONNREFUSED)`);
        }
      } else {
        log("[error] connection error:", errMsg);
      }
    });
  } catch (e) {
    state.lastError = e.message;
    log("[error] connect error:", e.message);
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    
    // Backoff: 3s → 5s → 10s (max 10s)
    if (reconnectDelay < 10000) {
      reconnectDelay = Math.min(10000, reconnectDelay + 2000);
    }
    
    connectVTS();
  }, reconnectDelay);
}

function sendAuthRequest() {
  if (!token) {
    log("no VTS_AUTH_TOKEN provided, cannot authenticate");
    return;
  }
  
  if (!state.connected || !state.ws || state.ws.readyState !== WebSocket.OPEN) {
    log("[error] cannot send auth request: socket not ready");
    return;
  }
  
  const msg = {
    apiName: API_NAME,
    apiVersion: API_VERSION,
    requestID: "luna-auth",
    messageType: "AuthenticationRequest",
    data: {
      pluginName: "LunaAI Streamer",
      pluginDeveloper: "Project Luna",
      authenticationToken: token,
    },
  };
  
  try {
    state.ws.send(JSON.stringify(msg));
    log("authentication request sent");
  } catch (e) {
    log("[error] failed to send auth request:", e.message);
    state.lastError = `Auth send failed: ${e.message}`;
  }
}

function handleMessage(msg) {
  const { messageType, data } = msg;

  if (messageType === "AuthenticationTokenResponse") {
    if (data && data.authenticationToken) {
      log("Authentication token received. Please paste this into .env as VTS_AUTH_TOKEN:");
      log(data.authenticationToken);
      state.lastError = "Authentication token received - please add to .env";
    } else {
      log("[error] Authentication token request failed:", data && data.reason);
      state.lastError = `Token request failed: ${data && data.reason}`;
    }
  } else if (messageType === "AuthenticationResponse") {
    if (data && data.authenticated) {
      state.authenticated = true;
      state.lastError = null;
      log("✅ authenticated with VTS");
    } else {
      state.authenticated = false;
      const reason = data && data.reason ? data.reason : "unknown";
      state.lastError = `Authentication failed: ${reason}`;
      log("[error] ❌ authentication failed:", reason);
      log("[error] Full response:", JSON.stringify(data));
    }
  }
}

// Export status function
export function vtsStatus() {
  return {
    enabled: process.env.VTS_ENABLED === "true",
    connected: state.connected,
    authenticated: state.authenticated,
    lastError: state.lastError,
  };
}

// Get available parameters from VTS
export function getVTSParameters() {
  return new Promise((resolve) => {
    if (!state.connected || !state.authenticated || !state.ws) {
      resolve({ ok: false, error: "VTS not ready" });
      return;
    }

    const requestID = `luna-get-params-${Date.now()}`;
    const msg = {
      apiName: API_NAME,
      apiVersion: API_VERSION,
      requestID,
      messageType: "InputParameterListRequest",
      data: {},
    };

    const timeout = setTimeout(() => {
      resolve({ ok: false, error: "Timeout waiting for parameters" });
    }, 5000);

    const messageHandler = (data) => {
      try {
        const response = JSON.parse(data.toString());
        if (response.requestID === requestID) {
          clearTimeout(timeout);
          state.ws.removeListener("message", messageHandler);
          resolve({
            ok: true,
            parameters: response.data?.defaultParameters || [],
            customParameters: response.data?.customParameters || [],
          });
        }
      } catch (e) {
        // ignore
      }
    };

    state.ws.on("message", messageHandler);

    try {
      state.ws.send(JSON.stringify(msg));
    } catch (e) {
      clearTimeout(timeout);
      state.ws.removeListener("message", messageHandler);
      resolve({ ok: false, error: e.message });
    }
  });
}

// ----------------------
// Public API (all fail-soft)
// ----------------------

export function startVTS() {
  if (!enabled) {
    return;
  }
  connectVTS();
}

// ส่ง hotkey โดยใช้ชื่อ hotkeyID ใน VTS
export async function triggerEmotion(name) {
  const ready = ensureReady();
  if (!ready.ok) {
    return { ok: false, error: ready.error };
  }

  console.log("[vts] triggerEmotion", name);

  const msg = {
    apiName: API_NAME,
    apiVersion: API_VERSION,
    requestID: `luna-emotion-${Date.now()}`,
    messageType: "HotkeyTriggerRequest",
    data: { hotkeyID: name },
  };

  const sent = safeSend(msg);
  return sent ? { ok: true } : { ok: false, error: "send failed" };
}

// map อารมณ์ → hotkeyID ใน VTS
const EMOTION_HOTKEY_MAP = {
  angry: "emotion_angry",
  sad: "emotion_sad",
  sleepy: "emotion_sleepy",
  hype: "emotion_hype",
  excited: "emotion_hype",
  soft: "emotion_soft",
  happy: "emotion_soft",

  clear: "emotion_clear", // ⭐ หน้า default ปกติ
};

// ใช้ชื่ออารมณ์สูง ๆ (angry / sad / sleepy / hype / soft / clear)
export function triggerForEmotion(emotion) {
  try {
    const key = (emotion || "").toLowerCase();
    const hotkeyId = EMOTION_HOTKEY_MAP[key];
    if (!hotkeyId) {
      return;
    }
    triggerEmotion(hotkeyId);
  } catch (e) {
    // Silent fail
  }
}

// เคลียร์ expression ทั้งหมด (กลับหน้า default)
export function clearExpressions() {
  try {
    const hotkeyId = EMOTION_HOTKEY_MAP.clear;
    if (!hotkeyId) return;
    triggerEmotion(hotkeyId);
  } catch (e) {
    // Silent fail
  }
}

// ใช้ตอนโหมดอ้อน soft
export function triggerForSoftEmotion() {
  try {
    triggerForEmotion("soft");
  } catch (e) {
    // Silent fail
  }
}

// ใช้ตอน hype / passion
export function triggerForPassionEmotion() {
  try {
    triggerForEmotion("hype");
  } catch (e) {
    // Silent fail
  }
}

// ใช้ตอนมี Big Buy (10 SOL+)
export function triggerForBigBuy(amount) {
  try {
    if (amount >= 10) {
      triggerForEmotion("hype");
    } else {
      triggerForEmotion("soft");
    }
  } catch (e) {
    // Silent fail
  }
}

// ขยับหน้ากล้องเล็กน้อย (หมุนหัว) ไม่ยุ่งกับ expression
export function setFaceAngle(x, y, z) {
  const ready = ensureReady();
  if (!ready.ok) {
    return;
  }

  const msg = {
    apiName: API_NAME,
    apiVersion: API_VERSION,
    requestID: `luna-face-${Date.now()}`,
    messageType: "InjectParameterDataRequest",
    data: {
      parameterValues: [
        { id: "FaceAngleX", value: x || 0 },
        { id: "FaceAngleY", value: y || 0 },
        { id: "FaceAngleZ", value: z || 0 },
      ],
    },
  };

  safeSend(msg);
}

// ----------------------
// Idle loop (no emotion_blink_fast)
// ----------------------

let idleTimer = null;

// hotkey พวกนี้ต้องไปตั้งใน VTS ให้ตรงชื่อ
const IDLE_HOTKEYS = [
  "emotion_look_away",
  "emotion_tilt_left",
  "emotion_tilt_right",
  "emotion_small_surprise",
  "emotion_hum",
  "emotion_moment_sad",
];

// Helper function to get US hour (same as index.js)
function getAmericaHour() {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hour12: false,
      timeZone: "America/New_York",
    });
    const hourStr = formatter.format(now);
    const hour = parseInt(hourStr, 10);
    return Number.isNaN(hour) ? now.getHours() : hour;
  } catch {
    return new Date().getHours();
  }
}

export function startIdleLoop() {
  if (idleTimer) return;

  const tick = () => {
    const ready = ensureReady();
    if (!ready.ok) {
      idleTimer = setTimeout(tick, 15000);
      return;
    }

    const hourUS = getAmericaHour(); // ใช้เวลา US เหมือน Sleepy Mode
    let hotkey;

    // 00:00–06:00 (US time) → บังคับง่วง
    if (hourUS >= 0 && hourUS < 6) {
      hotkey = "emotion_sleepy";
    } else {
      hotkey = IDLE_HOTKEYS[Math.floor(Math.random() * IDLE_HOTKEYS.length)];
    }

    triggerEmotion(hotkey);

    const delay = 20000 + Math.random() * 25000; // 20–45 วิ
    idleTimer = setTimeout(tick, delay);
  };

  idleTimer = setTimeout(tick, 15000);
}

export function stopIdleLoop() {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
}

// ----------------------
// Talk-React (ขยับปากตามเวลาพูด โดยใช้ pattern wave)
// ----------------------

let talkTimer = null;

function setMouthOpen(value) {
  const ready = ensureReady();
  if (!ready.ok) {
    return;
  }

  const clamped = Math.max(0, Math.min(1, Number(value) || 0));
  console.log("[vts] setMouthOpen", clamped);

  const msg = {
    apiName: API_NAME,
    apiVersion: API_VERSION,
    requestID: `luna-mouth-${Date.now()}`,
    messageType: "InjectParameterDataRequest",
    data: {
      parameterValues: [
        { id: MOUTH_PARAM_ID, value: clamped },
      ],
    },
  };

  safeSend(msg);
}

export function startTalkReact(durationMs = 1500, mode = "normal") {
  try {
    if (talkTimer) {
      clearInterval(talkTimer);
      talkTimer = null;
    }

    const start = Date.now();
    const m = (mode || "normal").toLowerCase();
    const speedFactor = m === "soft" ? 0.8 : m === "passion" ? 1.2 : 1.0;

    talkTimer = setInterval(() => {
      const elapsed = Date.now() - start;
      if (elapsed > durationMs) {
        clearInterval(talkTimer);
        talkTimer = null;
        setMouthOpen(0);
        return;
      }

      const cycle = (elapsed / 120) * speedFactor;
      const phase = cycle % 1.0;

      let open = 0;
      if (phase < 0.4) {
        open = phase / 0.4;
      } else if (phase < 0.8) {
        open = (0.8 - phase) / 0.4;
      } else {
        open = 0;
      }

      if (m === "soft") open *= 0.6;
      else if (m === "passion") open = Math.min(1, open * 1.3);

      setMouthOpen(open);
    }, 60);
  } catch (e) {
    // Silent fail
  }
}

export function stopTalkReact() {
  try {
    if (talkTimer) {
      clearInterval(talkTimer);
      talkTimer = null;
    }
    setMouthOpen(0);
  } catch (e) {
    // Silent fail
  }
}

// ----------------------
// Breathing Motion (หายใจ)
// ----------------------

let breathTimer = null;
let breathPhase = 0;
let breathMode = "normal"; // "normal" | "sleepy" | "hype"

export function setBreathingMode(mode) {
  if (!mode) return;
  breathMode = mode;
}

export function startBreathingLoop() {
  if (breathTimer) return;
  breathPhase = 0;

  const tick = () => {
    const ready = ensureReady();
    if (!ready.ok) {
      breathTimer = setTimeout(tick, 2000);
      return;
    }

    let speed;
    let amp;
    if (breathMode === "sleepy") {
      speed = 0.03;
      amp = 0.7;
    } else if (breathMode === "hype") {
      speed = 0.09;
      amp = 1.0;
    } else {
      speed = 0.055;
      amp = 0.8;
    }

    breathPhase += speed;
    const v = Math.sin(breathPhase) * amp * 0.5 + 0.5; // 0–1

    const msg = {
      apiName: API_NAME,
      apiVersion: API_VERSION,
      requestID: `luna-breath-${Date.now()}`,
      messageType: "InjectParameterDataRequest",
      data: {
        parameterValues: [{ id: "Breath", value: v }],
      },
    };

    safeSend(msg);

    breathTimer = setTimeout(tick, 80);
  };

  breathTimer = setTimeout(tick, 1500);
}

export function stopBreathingLoop() {
  if (breathTimer) {
    clearTimeout(breathTimer);
    breathTimer = null;
  }
}
