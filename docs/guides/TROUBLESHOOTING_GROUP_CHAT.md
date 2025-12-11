# คู่มือแก้ไขปัญหา Group Chat
## สำหรับ Luna AI v10

---

## 🔴 ปัญหา: ส่งข้อความแต่ไม่เห็นข้อความที่ส่งกัน

### สาเหตุที่เป็นไปได้:

1. **WebSocket ไม่เชื่อมต่อ**
   - WebSocket connection ไม่สำเร็จ
   - WebSocket disconnected

2. **Room ID ไม่ตรงกัน**
   - Frontend ใช้ roomId ผิด
   - Backend ใช้ roomId ผิด

3. **Broadcast ไม่ทำงาน**
   - WebSocket clients ไม่ถูกเพิ่มเข้า Set
   - Broadcast function ไม่ถูกเรียก

4. **Message Filter ผิด**
   - Frontend filter message ด้วย roomId ผิด
   - Message ไม่ผ่าน filter

---

## ✅ วิธีแก้ไข

### ขั้นตอนที่ 1: ตรวจสอบ WebSocket Connection

1. **เปิด Browser DevTools (F12)**
2. **ไปที่ Console tab**
3. **ดู logs:**
   ```
   [Group Chat] Connecting to WebSocket: ws://localhost:8787
   [Group Chat] WebSocket connected successfully
   ```

4. **ถ้าไม่เห็น "WebSocket connected":**
   - ตรวจสอบว่า server รันอยู่
   - ตรวจสอบว่า WebSocket port ถูกต้อง
   - ตรวจสอบ network tab สำหรับ WebSocket connection

### ขั้นตอนที่ 2: ตรวจสอบ Room ID

1. **ตรวจสอบ Frontend:**
   ```javascript
   // ใน group_chat.html
   const GROUP_CHAT_ROOM_ID = 'group_chat';
   ```

2. **ตรวจสอบ Backend:**
   ```javascript
   // ใน routes/chat.js
   // ตรวจสอบว่า roomId === 'group_chat'
   ```

3. **ตรวจสอบ Console:**
   ```
   [Group Chat] WebSocket message received: { type: 'chat_message', roomId: 'group_chat', ... }
   ```

### ขั้นตอนที่ 3: ตรวจสอบ Broadcast

1. **ตรวจสอบ Server Logs:**
   ```
   [websocket] Broadcast error: ...
   ```

2. **ตรวจสอบว่า clients มีอยู่ใน Set:**
   - ดู Logs ว่า clients.add() ถูกเรียกหรือไม่
   - ตรวจสอบว่า broadcast() ถูกเรียกหรือไม่

### ขั้นตอนที่ 4: ตรวจสอบ Message Filter

1. **ตรวจสอบ Frontend Filter:**
   ```javascript
   // ใน group_chat.html
   if (msg.type === 'chat_message' && msg.roomId === GROUP_CHAT_ROOM_ID) {
     addMessage(msg.message);
   }
   ```

2. **ตรวจสอบ Console:**
   ```
   [Group Chat] WebSocket message received: { ... }
   [Group Chat] Adding message from WebSocket: { ... }
   ```

---

## 🔍 Debugging Steps

### 1. ตรวจสอบ WebSocket Connection

**ใน Browser Console:**
```javascript
// ตรวจสอบ WebSocket state
console.log('WebSocket state:', ws?.readyState);
// 1 = OPEN, 0 = CONNECTING, 2 = CLOSING, 3 = CLOSED
```

**ใน Server Logs:**
```
[websocket] Client connected
[websocket] Client error: ...
[websocket] Client disconnected
```

### 2. ตรวจสอบ Message Sending

**ใน Browser Console:**
```javascript
// ดู request ที่ส่งไป
// ไปที่ Network tab → ดู POST /luna/chat/send
```

**ตรวจสอบ Response:**
```json
{
  "ok": true,
  "message": { ... }
}
```

### 3. ตรวจสอบ Message Broadcasting

**ใน Server Logs:**
```
[chat] Broadcasting message to X clients
[websocket] Broadcast error: ...
```

### 4. ตรวจสอบ Message Receiving

**ใน Browser Console:**
```
[Group Chat] WebSocket message received: { ... }
[Group Chat] Adding message from WebSocket: { ... }
```

---

## 🛠️ Common Issues & Solutions

### ปัญหา 1: WebSocket ไม่เชื่อมต่อ

**สาเหตุ:**
- Server ไม่รัน
- WebSocket port ผิด
- Firewall block

**วิธีแก้:**
1. ตรวจสอบว่า server รันอยู่
2. ตรวจสอบ WebSocket URL
3. ตรวจสอบ firewall settings

### ปัญหา 2: Message ไม่ broadcast

**สาเหตุ:**
- Clients ไม่ถูกเพิ่มเข้า Set
- Broadcast function ไม่ถูกเรียก
- WebSocket connection ไม่สำเร็จ

**วิธีแก้:**
1. ตรวจสอบว่า `clients.add(ws)` ถูกเรียก
2. ตรวจสอบว่า `broadcast()` ถูกเรียก
3. ตรวจสอบ server logs

### ปัญหา 3: Message ไม่แสดงใน Frontend

**สาเหตุ:**
- Room ID ไม่ตรงกัน
- Message filter ผิด
- addMessage() ไม่ถูกเรียก

**วิธีแก้:**
1. ตรวจสอบว่า `GROUP_CHAT_ROOM_ID === 'group_chat'`
2. ตรวจสอบว่า `msg.roomId === GROUP_CHAT_ROOM_ID`
3. ตรวจสอบว่า `addMessage()` ถูกเรียก

### ปัญหา 4: Message แสดงแต่ไม่ real-time

**สาเหตุ:**
- WebSocket ไม่เชื่อมต่อ
- Broadcast ไม่ทำงาน
- Frontend ไม่รับ message

**วิธีแก้:**
1. ตรวจสอบ WebSocket connection
2. ตรวจสอบ broadcast
3. ตรวจสอบ frontend message handler

---

## 📋 Checklist

- [ ] WebSocket connected (ดู console logs)
- [ ] Room ID ตรงกัน (`group_chat`)
- [ ] Message ส่งสำเร็จ (ดู network tab)
- [ ] Broadcast ทำงาน (ดู server logs)
- [ ] Message รับได้ (ดู console logs)
- [ ] addMessage() ถูกเรียก
- [ ] updateMessages() ถูกเรียก

---

## 🧪 วิธีทดสอบ

### 1. ทดสอบ WebSocket Connection

```javascript
// ใน Browser Console
ws = new WebSocket('ws://localhost:8787');
ws.onopen = () => console.log('Connected!');
ws.onmessage = (e) => console.log('Message:', e.data);
```

### 2. ทดสอบ Message Sending

```javascript
// ส่ง test message
fetch('/luna/chat/send', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    roomId: 'group_chat',
    wallet: 'YOUR_WALLET',
    message: 'Test message'
  })
});
```

### 3. ทดสอบ Broadcast

**ใน Server:**
- ดู Logs ว่า broadcast ถูกเรียก
- ตรวจสอบว่า clients มีอยู่ใน Set

---

## 🆘 ถ้ายังแก้ไม่ได้

1. **ตรวจสอบ Logs ทั้งหมด:**
   - Browser Console
   - Server Logs
   - Network Tab

2. **ตรวจสอบ Configuration:**
   - Room ID
   - WebSocket URL
   - API endpoints

3. **ทดสอบใน Local:**
   - ทดสอบใน localhost ก่อน
   - ตรวจสอบว่า WebSocket ทำงาน

---

**Made with ❤️ for Luna AI Streamer**













