# Backend Systems Test Guide

คู่มือการทดสอบระบบ Notification, Referral, และ Chat System

## วิธีรันการทดสอบ

### 1. เริ่มต้น Server ก่อน

```bash
npm start
```

หรือ

```bash
node index.js
```

Server จะรันที่ `http://localhost:8787` (หรือ port ที่ตั้งใน `.env`)

### 2. รันการทดสอบ

เปิด terminal ใหม่และรัน:

```bash
npm run test:backend
```

หรือ

```bash
node test-backend-systems.js
```

## สิ่งที่ทดสอบ

### 1. Notification System (ระบบแจ้งเตือน)

- ✅ ดึง notifications สำหรับ wallet
- ✅ ทำเครื่องหมาย notification ว่าอ่านแล้ว
- ✅ ตรวจสอบ error handling

**API Endpoints ที่ทดสอบ:**
- `GET /luna/notifications?wallet={wallet}`
- `POST /luna/notifications/read`

### 2. Referral System (ระบบแนะนำเพื่อน)

- ✅ สร้าง referral link
- ✅ ดู referral stats
- ✅ ลงทะเบียน referral
- ✅ ป้องกัน duplicate referral
- ✅ ป้องกัน self-referral
- ✅ ตรวจสอบ stats หลังลงทะเบียน

**API Endpoints ที่ทดสอบ:**
- `GET /luna/referral/link?wallet={wallet}`
- `GET /luna/referral/stats?wallet={wallet}`
- `POST /luna/referral/register`

### 3. Chat System (ระบบแชต)

- ✅ สร้างห้องแชตอัตโนมัติ
- ✅ ส่งข้อความ
- ✅ ดึงข้อความจากห้อง
- ✅ รองรับหลายห้อง
- ✅ ป้องกันข้อความว่าง
- ✅ ตรวจสอบ error handling

**API Endpoints ที่ทดสอบ:**
- `POST /luna/chat/send`
- `GET /luna/chat/messages?roomId={roomId}`

## ผลลัพธ์ที่คาดหวัง

### ✅ Success Cases
- ทุก API endpoint ควร return `{ ok: true, ... }`
- Referral registration ควรทำงานได้
- Chat messages ควรส่งและดึงได้

### ⚠️ Expected Failures (ปกติ)
- การลงทะเบียน referral ซ้ำ → ควร return `{ ok: false }`
- การ refer ตัวเอง → ควร return `{ ok: false }`
- ข้อความว่าง → ควร return `{ ok: false }`

## การตั้งค่า

ถ้า server รันที่ port อื่น หรือ URL อื่น สามารถตั้งค่าได้:

```bash
API_BASE=http://localhost:3000 node test-backend-systems.js
```

## Troubleshooting

### Error: Cannot connect to server
- ตรวจสอบว่า server กำลังรันอยู่
- ตรวจสอบว่า port ถูกต้อง
- ตรวจสอบ firewall settings

### Error: Module not found
- รัน `npm install` เพื่อติดตั้ง dependencies
- ตรวจสอบว่า `node-fetch` ติดตั้งแล้ว

### Tests fail but server is running
- ตรวจสอบ console logs ของ server
- ตรวจสอบว่า API endpoints ถูกต้อง
- ตรวจสอบว่าไม่มี syntax errors ใน `index.js`

## หมายเหตุ

- Test wallets เป็น test data เท่านั้น ไม่ใช่ wallet จริง
- ข้อมูลที่สร้างในการทดสอบจะถูกเก็บใน memory (จะหายเมื่อ restart server)
- สำหรับ production ควรใช้ database เพื่อเก็บข้อมูลถาวร

