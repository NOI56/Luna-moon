// modules/vts.js
// VTube Studio integration: hotkeys + time-of-day mood.

import WebSocket from "ws";

const VTS_ENABLED = process.env.VTS_ENABLED === "true";
const VTS_URL = process.env.VTS_URL || "ws://127.0.0.1:8001";
const VTS_AUTH_TOKEN = process.env.VTS_AUTH_TOKEN || "";

let vtsSocket = null;
let connected = false;
let lastRequestId = 0;
let lastTimeMood = null;

function nextRequestId(prefix = "luna") {
  lastRequestId += 1;
  return `${prefix}_${Date.now()}_${lastRequestId}`;
}

function send(data) {
  if (!vtsSocket || vtsSocket.readyState !== 1) return;
  vtsSocket.send(JSON.stringify(data));
}

function authenticate() {
  if (!VTS_AUTH_TOKEN) {
    console.log("[vts] no auth token set (VTS_AUTH_TOKEN). If your VTS requires auth, set it.");
    return;
  }
  const msg = {
    apiName: "VTubeStudioPublicAPI",
    apiVersion: "1.0",
    requestID: nextRequestId("auth"),
    messageType: "AuthenticationRequest",
    data: {
      pluginName: "LunaAI Streamer",
      pluginDeveloper: "YourName",
      authenticationToken: VTS_AUTH_TOKEN
    }
  };
  send(msg);
}

function getTimeOfDayMood() {
  try {
    const hourStr = new Date().toLocaleString("en-US", {
      timeZone: "America/New_York",
      hour: "2-digit",
      hour12: false
    });
    const hour = parseInt(hourStr, 10);
    if (Number.isNaN(hour)) return null;
    if (hour >= 5 && hour < 12) return "morning";
    if (hour >= 12 && hour < 18) return "energetic";
    if (hour >= 18 && hour < 22) return "evening";
    return "sleepy";
  } catch (e) {
    console.warn("[vts] time-of-day error:", e.message);
    return null;
  }
}

function maybeTriggerTimeMood() {
  if (!VTS_ENABLED) return;
  if (!connected || !vtsSocket || vtsSocket.readyState !== 1) return;
  const mood = getTimeOfDayMood();
  if (!mood || mood === lastTimeMood) return;
  lastTimeMood = mood;

  let hk = "";
  if (mood === "morning") hk = process.env.VTS_HOTKEY_HAPPY || "";
  else if (mood === "energetic") hk = process.env.VTS_HOTKEY_PASSION || "";
  else if (mood === "evening") hk = process.env.VTS_HOTKEY_SOFT || "";
  else if (mood === "sleepy") hk = process.env.VTS_HOTKEY_SLEEPY || process.env.VTS_HOTKEY_SOFT || "";

  if (!hk) return;
  triggerHotkey(hk);
}

export function startVTS() {
  if (!VTS_ENABLED) {
    console.log("[vts] disabled");
    return;
  }
  console.log("[vts] connecting to", VTS_URL);
  vtsSocket = new WebSocket(VTS_URL);

  vtsSocket.on("open", () => {
    connected = true;
    console.log("[vts] connected");
    authenticate();
    const hello = {
      apiName: "VTubeStudioPublicAPI",
      apiVersion: "1.0",
      requestID: nextRequestId("hello"),
      messageType: "APIStateRequest",
      data: {}
    };
    send(hello);
    maybeTriggerTimeMood();
  });

  vtsSocket.on("close", () => {
    connected = false;
    console.log("[vts] disconnected");
    setTimeout(() => startVTS(), 5000);
  });

  vtsSocket.on("error", (err) => {
    console.warn("[vts] error:", err.message);
  });

  vtsSocket.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.messageType === "AuthenticationTokenResponse") {
        console.log("[vts] received auth token (save as VTS_AUTH_TOKEN):", msg.data?.authenticationToken);
      }
    } catch (e) {
      console.warn("[vts] parse error:", e.message);
    }
  });

  setInterval(() => {
    try {
      maybeTriggerTimeMood();
    } catch (e) {
      console.warn("[vts] mood interval error:", e.message);
    }
  }, 5 * 60 * 1000);
}

export function triggerHotkey(hotkeyName) {
  if (!VTS_ENABLED) return;
  if (!connected || !vtsSocket || vtsSocket.readyState !== 1) return;
  if (!hotkeyName) return;
  const msg = {
    apiName: "VTubeStudioPublicAPI",
    apiVersion: "1.0",
    requestID: nextRequestId("hotkey"),
    messageType: "HotkeyTriggerRequest",
    data: {
      hotkeyID: hotkeyName,
      hotkeyName: hotkeyName
    }
  };
  send(msg);
}

export function triggerForBigBuy() {
  const hk = process.env.VTS_HOTKEY_BIGBUY || "";
  if (!hk) return;
  triggerHotkey(hk);
}

export function triggerForSoftEmotion() {
  const hk = process.env.VTS_HOTKEY_SOFT || "";
  if (!hk) return;
  triggerHotkey(hk);
}

export function triggerForPassionEmotion() {
  const hk = process.env.VTS_HOTKEY_PASSION || "";
  if (!hk) return;
  triggerHotkey(hk);
}

export function triggerForEmotion(emotion) {
  if (!VTS_ENABLED || !emotion) return;
  const e = String(emotion).toLowerCase();
  let hk = "";
  if (e === "sad") hk = process.env.VTS_HOTKEY_SAD || "";
  else if (e === "happy") hk = process.env.VTS_HOTKEY_HAPPY || "";
  else if (e === "angry") hk = process.env.VTS_HOTKEY_ANGRY_CUTE || "";
  else if (e === "excited") hk = process.env.VTS_HOTKEY_EXCITED || "";
  if (!hk) return;
  triggerHotkey(hk);
}

export function setFaceAngle(yaw = 0, pitch = 0, roll = 0) {
  if (!VTS_ENABLED) return;
  if (!connected || !vtsSocket || vtsSocket.readyState !== 1) return;
  const msg = {
    apiName: "VTubeStudioPublicAPI",
    apiVersion: "1.0",
    requestID: nextRequestId("face"),
    messageType: "InjectParameterDataRequest",
    data: {
      parameterValues: [
        { id: "FaceAngleYaw", value: yaw },
        { id: "FaceAnglePitch", value: pitch },
        { id: "FaceAngleRoll", value: roll }
      ]
    }
  };
  send(msg);
}
