const WebSocket = require('ws');

const VTS_HOST = '127.0.0.1';
const VTS_PORT = 8001;

const ws = new WebSocket(`ws://${VTS_HOST}:${VTS_PORT}`);

ws.on('open', () => {
  console.log('[vts-auth] connected, requesting new token...');
  const msg = {
    apiName: 'VTubeStudioPublicAPI',
    apiVersion: '1.0',
    requestID: 'get-token',
    messageType: 'AuthenticationTokenRequest',
    data: {
      pluginName: 'LunaAI Streamer', // ต้องตรงกับใน modules/vts.js
      pluginDeveloper: 'Project Luna',   // ต้องตรงกับใน modules/vts.js
    },
  };
  ws.send(JSON.stringify(msg));
});

ws.on('message', (data) => {
  const text = data.toString();
  console.log('[vts-auth] raw response:', text);

  try {
    const res = JSON.parse(text);
    if (res.data && res.data.authenticationToken) {
      console.log('\n========== NEW VTS TOKEN ==========');
      console.log(res.data.authenticationToken);
      console.log('===================================\n');
      console.log('คัดลอก token นี้ไปใส่ในไฟล์ .env ที่ VTS_AUTH_TOKEN=');
    }
  } catch (e) {
    console.error('[vts-auth] parse error:', e);
  } finally {
    ws.close();
  }
});

ws.on('error', (err) => {
  console.error('[vts-auth] websocket error:', err);
});
