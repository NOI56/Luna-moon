// test-vts.cjs
// สคริปต์เอาไว้ขอ VTS_AUTH_TOKEN ใหม่จาก VTube Studio

const WebSocket = require("ws");

// ตั้งค่าให้ตรงกับ vts.js
const PLUGIN_NAME = "LunaAI Streamer";
const PLUGIN_DEV  = "Project Luna";

const host = "127.0.0.1";
const port = 8001;
const url  = `ws://${host}:${port}`;

console.log("[vts-test] connecting to", url);
const ws = new WebSocket(url);

ws.on("open", () => {
  console.log("[vts-test] connected, sending AuthenticationTokenRequest");

  const msg = {
    apiName: "VTubeStudioPublicAPI",
    apiVersion: "1.0",
    requestID: "luna-token-1",
    messageType: "AuthenticationTokenRequest",
    data: {
      pluginName: PLUGIN_NAME,
      pluginDeveloper: PLUGIN_DEV,
    },
  };

  ws.send(JSON.stringify(msg));
});

ws.on("message", raw => {
  let msg;
  try {
    msg = JSON.parse(raw.toString());
  } catch {
    return;
  }

  console.log("[vts-test] message:", msg);

  if (msg.messageType === "AuthenticationTokenResponse") {
    const token = msg.data?.authenticationToken;
    if (!token) {
      console.log("[vts-test] ❌ no token in response");
      return;
    }

    console.log("\n[vts-test] ✅ GOT TOKEN:");
    console.log(token);
    console.log(
      "\nคัดลอก token นี้ไปใส่ในไฟล์ .env ในบรรทัด\nVTS_AUTH_TOKEN=... \nแล้วเซฟครับ"
    );
    ws.close();
  } else if (msg.messageType === "APIError") {
    console.log("[vts-test] ❌ APIError:", msg.data);
  }
});

ws.on("error", err => {
  console.log("[vts-test] error:", err.message);
});

ws.on("close", () => {
  console.log("[vts-test] connection closed");
});
