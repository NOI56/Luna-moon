# คู่มือ Debug Group Chat
## สำหรับ Luna AI v10

---

## 🔍 วิธีตรวจสอบว่า WebSocket Broadcast ทำงาน

### 1. ตรวจสอบ Server Logs

ดู Logs ใน Northflank หรือ local server:

```
[websocket] Client connected. Total clients: 2
[chat] Broadcasting message from x2u7u5dK... in room group_chat
[websocket] Broadcast chat_message to 2 clients (0 skipped, 2 total)
```

**สิ่งที่ต้องดู:**
- `Total clients: X` - ต้องมี client มากกว่า 1 (ถ้ามีคน 2 คน)
- `Broadcast chat_message to X clients` - ต้องส่งไปให้ทุก client
- `0 skipped` - ไม่ควรมี client ที่ถูก skip

### 2. ตรวจสอบ Browser Console

**ใน Browser Console ควรเห็น:**

```
[Group Chat] Connecting to WebSocket: ws://localhost:8787
[Group Chat] WebSocket connected successfully
[Group Chat] WebSocket readyState: 1 (1 = OPEN)
[Group Chat] WebSocket message received: { type: 'chat_message', roomId: 'group_chat', ... }
[Group Chat] Adding message from WebSocket: { ... }
[Group Chat] Message wallet: x2u7u5dK... Current wallet: 6gdHKntQ...
```

**สิ่งที่ต้องดู:**
- `WebSocket connected successfully` - WebSocket ต้องเชื่อมต่อ
- `WebSocket message received` - ต้องเห็น message จากคนอื่น
- `Message wallet` vs `Current wallet` - ต้องต่างกัน (ถ้าเป็นข้อความจากคนอื่น)

### 3. ตรวจสอบ Network Tab

**ใน Network Tab ควรเห็น:**
- WebSocket connection (Type: `websocket`)
- Status: `101 Switching Protocols` (เมื่อเชื่อมต่อสำเร็จ)

---

## 🐛 ปัญหาที่พบบ่อย

### ปัญหา 1: WebSocket ไม่เชื่อมต่อ

**อาการ:**
- Console ไม่แสดง "WebSocket connected successfully"
- Network tab ไม่มี WebSocket connection

**วิธีแก้:**
1. ตรวจสอบว่า server รันอยู่
2. ตรวจสอบ WebSocket URL
3. ตรวจสอบ firewall/CORS settings

### ปัญหา 2: Broadcast ไม่ส่ง message

**อาการ:**
- Server logs แสดง "Broadcast to 0 clients"
- หรือ "Broadcast to 1 clients" (แต่มีคน 2 คน)

**วิธีแก้:**
1. ตรวจสอบว่า clients ถูกเพิ่มเข้า Set
2. ตรวจสอบว่า WebSocket connection สำเร็จ
3. ตรวจสอบว่า clients.size > 1

### ปัญหา 3: Frontend ไม่รับ message

**อาการ:**
- Server logs แสดง "Broadcast to 2 clients"
- แต่ Console ไม่แสดง "WebSocket message received"

**วิธีแก้:**
1. ตรวจสอบว่า WebSocket connection ยังเปิดอยู่
2. ตรวจสอบว่า `ws.onmessage` handler ถูกตั้งค่า
3. ตรวจสอบว่า message format ถูกต้อง

### ปัญหา 4: Message Filter ผิด

**อาการ:**
- Console แสดง "WebSocket message received"
- แต่ไม่แสดง "Adding message from WebSocket"

**วิธีแก้:**
1. ตรวจสอบว่า `msg.roomId === GROUP_CHAT_ROOM_ID`
2. ตรวจสอบว่า `GROUP_CHAT_ROOM_ID === 'group_chat'`
3. ตรวจสอบว่า `msg.type === 'chat_message'`

---

## 🧪 วิธีทดสอบ

### 1. ทดสอบ WebSocket Connection

**ใน Browser Console:**
```javascript
// ตรวจสอบ WebSocket state
console.log('WebSocket state:', ws?.readyState);
// 1 = OPEN, 0 = CONNECTING, 2 = CLOSING, 3 = CLOSED

// ตรวจสอบ clients
// (ต้องดูใน server logs)
```

### 2. ทดสอบ Broadcast

**ใน Server Logs:**
```
[websocket] Client connected. Total clients: 2
[chat] Broadcasting message from x2u7u5dK... in room group_chat
[websocket] Broadcast chat_message to 2 clients (0 skipped, 2 total)
```

### 3. ทดสอบ Message Receiving

**ใน Browser Console:**
```
[Group Chat] WebSocket message received: { type: 'chat_message', ... }
[Group Chat] Adding message from WebSocket: { ... }
```

---

## 📋 Checklist

- [ ] WebSocket connected (ดู console logs)
- [ ] Server logs แสดง "Client connected" (มากกว่า 1 client)
- [ ] Server logs แสดง "Broadcasting message"
- [ ] Server logs แสดง "Broadcast to X clients" (X > 1)
- [ ] Console แสดง "WebSocket message received"
- [ ] Console แสดง "Adding message from WebSocket"
- [ ] Message wallet ต่างจาก Current wallet (ถ้าเป็นข้อความจากคนอื่น)

---

## 🆘 ถ้ายังแก้ไม่ได้

1. **ตรวจสอบ Logs ทั้งหมด:**
   - Browser Console
   - Server Logs
   - Network Tab

2. **ทดสอบใน Local:**
   - เปิด 2 browser windows
   - ส่งข้อความจาก window หนึ่ง
   - ดูว่า window อื่นเห็นข้อความหรือไม่

3. **ตรวจสอบ Configuration:**
   - Room ID
   - WebSocket URL
   - CORS settings

---

**Made with ❤️ for Luna AI Streamer**

