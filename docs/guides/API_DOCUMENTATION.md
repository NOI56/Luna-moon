# 📡 Luna AI - API Documentation Guide

คู่มือการใช้งาน API Documentation

## 🌐 วิธีเข้าถึง

### 1. เปิดใน Browser

```
http://localhost:8787/api-docs.html
```

หรือ

```
https://your-domain.com/api-docs.html
```

### 2. ดู OpenAPI JSON

```
http://localhost:8787/api-docs.json
```

## 📋 สิ่งที่อยู่ใน API Documentation

### ✅ API Endpoints ทั้งหมด

1. **Health & Status**
   - `GET /_health` - Basic health check
   - `GET /luna/status` - System status
   - `GET /luna/health` - Detailed health check
   - `GET /luna/stats` - System statistics

2. **Chat**
   - `POST /luna/message` - Send message to Luna
   - `GET /luna/wake` - Wake Luna
   - `GET /luna/allow-sleep` - Allow sleep mode

3. **VTube Studio**
   - `GET /luna/expression?emo=angry` - Test emotion expression
   - `GET /luna/vts/parameters` - Get VTS parameters
   - `POST /luna/audio-level` - Send audio level

4. **Rock Paper Scissors**
   - `GET /luna/rps/balance` - Get token balance
   - `GET /luna/rps/contract-address` - Get contract address
   - `GET /luna/rps/leaderboard` - Get leaderboard
   - `POST /luna/rps/queue` - Queue for PvP match
   - `GET /luna/rps/match` - Get match status
   - `POST /luna/rps/submit` - Submit RPS choice
   - `POST /luna/rps/betting/create` - Create betting room
   - `GET /luna/rps/betting/rooms` - Get betting rooms
   - `POST /luna/rps/betting/join` - Join betting room
   - `POST /luna/rps/betting/submit` - Submit betting choice

5. **Notifications**
   - `GET /luna/notifications` - Get notifications
   - `POST /luna/notifications/read` - Mark as read

6. **Referral**
   - `GET /luna/referral/link` - Get referral link
   - `GET /luna/referral/stats` - Get referral stats
   - `POST /luna/referral/register` - Register referral

7. **Chat Room**
   - `POST /luna/chat/send` - Send chat message
   - `GET /luna/chat/messages` - Get chat messages

8. **Admin** (requires ADMIN_SECRET)
   - `GET /luna/admin/clear-memory` - Clear user memory
   - `GET /luna/admin/reset-personality` - Reset personality
   - `GET /luna/admin/clear-cache` - Clear response cache
   - `GET /luna/admin/errors` - Get error logs
   - `GET /luna/admin/reset-stats` - Reset statistics

9. **Purchase**
   - `POST /purchase` - Purchase webhook

## 🎯 วิธีใช้งาน

### 1. เปิด API Documentation

เปิด browser ไปที่:
```
http://localhost:8787/api-docs.html
```

### 2. ทดสอบ API

1. เลือก endpoint ที่ต้องการ
2. คลิก "Try it out"
3. กรอกข้อมูล (ถ้ามี)
4. คลิก "Execute"
5. ดูผลลัพธ์

### 3. ดู Request/Response Examples

API Documentation มีตัวอย่าง:
- Request body format
- Response format
- Error responses
- Query parameters

## 🔐 Security

### Admin Endpoints

Admin endpoints ต้องมี `ADMIN_SECRET` ใน `.env` และส่ง header:

```
x-admin-secret: your_secret_here
```

หรือใช้ query parameter:

```
?secret=your_secret_here
```

### Purchase Webhook

Purchase webhook ต้องมี `PURCHASE_SECRET` ใน `.env` และส่ง header:

```
x-purchase-secret: your_secret_here
```

## 📝 ตัวอย่างการใช้งาน

### ส่งข้อความไปหา Luna

```bash
curl -X POST http://localhost:8787/luna/message \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Hello Luna!",
    "user": "username"
  }'
```

### ตรวจสอบสถานะระบบ

```bash
curl http://localhost:8787/luna/status
```

### ดู Token Balance

```bash
curl "http://localhost:8787/luna/rps/balance?wallet=YOUR_WALLET_ADDRESS"
```

## 🎨 Features

- ✅ **Interactive UI** - ทดสอบ API ได้เลยใน browser
- ✅ **Request/Response Examples** - มีตัวอย่างครบถ้วน
- ✅ **Schema Definitions** - ดูโครงสร้างข้อมูลได้
- ✅ **Try it out** - ทดสอบ API ได้ทันที
- ✅ **Download Spec** - ดาวน์โหลด OpenAPI JSON ได้

## 📚 ข้อมูลเพิ่มเติม

- OpenAPI 3.0 Specification
- Swagger UI Integration
- Complete endpoint coverage
- Request/Response schemas
- Error handling documentation

## 🔗 Links

- API Docs: `http://localhost:8787/api-docs.html`
- OpenAPI JSON: `http://localhost:8787/api-docs.json`
- Main README: `README.md`

---

**หมายเหตุ:** API Documentation ใช้ Swagger UI และ OpenAPI 3.0 specification























