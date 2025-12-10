# คู่มือตั้งค่าระบบอัปโหลดรูปภาพ
## สำหรับ Luna AI v10

---

## ✅ สิ่งที่มีอยู่แล้ว (ไม่ต้องเพิ่ม)

### 1. **Backend API**
- ✅ Endpoint: `POST /luna/chat/upload`
- ✅ Validation และ error handling
- ✅ File storage: `public/uploads/chat/`

### 2. **Frontend Code**
- ✅ UI สำหรับอัปโหลดรูปภาพ (ปุ่ม 📎)
- ✅ File input และ preview
- ✅ Upload function: `uploadPendingAttachments()`
- ✅ Base64 encoding: `readFileAsBase64()`

### 3. **File Storage**
- ✅ โฟลเดอร์: `public/uploads/chat/` (สร้างอัตโนมัติ)

---

## 🔧 สิ่งที่ต้องตรวจสอบ/ตั้งค่า

### 1. **Environment Variables** (ไม่จำเป็นต้องเพิ่ม)

ระบบอัปโหลดรูปภาพ **ไม่ต้องตั้งค่า environment variables เพิ่มเติม** เพราะ:
- ใช้ Express.js static file serving (มีอยู่แล้ว)
- ใช้ validation จาก code (ไม่ต้องตั้งค่าเพิ่ม)

### 2. **File Permissions** (ตรวจสอบ)

ตรวจสอบว่า server สามารถเขียนไฟล์ได้:

**Local (Windows):**
- ✅ ไม่มีปัญหา (Windows ให้ permission อัตโนมัติ)

**Production (Northflank):**
- ✅ Northflank จะสร้างโฟลเดอร์อัตโนมัติ
- ✅ Service มี permission เขียนไฟล์ใน container

### 3. **Storage Space** (ตรวจสอบ)

ตรวจสอบว่า disk space เพียงพอ:
- ไฟล์แต่ละไฟล์: สูงสุด 5 MB
- จำนวนไฟล์: ไม่จำกัด (แต่ควรลบไฟล์เก่าออกเป็นระยะ)

---

## 📋 Checklist: ตรวจสอบว่าระบบพร้อมใช้งาน

### Backend
- [x] API endpoint `/luna/chat/upload` ทำงาน
- [x] โฟลเดอร์ `public/uploads/chat/` มีอยู่
- [x] Express serve static files จาก `public/`

### Frontend
- [x] ปุ่มอัปโหลดรูปภาพ (📎) แสดงใน Group Chat
- [x] File input ทำงาน
- [x] Preview รูปภาพก่อนส่ง
- [x] Wallet connected (ต้องมี wallet เพื่ออัปโหลด)

### Testing
- [ ] ทดสอบอัปโหลดรูปภาพ PNG
- [ ] ทดสอบอัปโหลดรูปภาพ JPEG
- [ ] ทดสอบอัปโหลดรูปภาพ GIF
- [ ] ทดสอบอัปโหลดรูปภาพ WebP
- [ ] ทดสอบอัปโหลดหลายรูปพร้อมกัน
- [ ] ทดสอบขนาดไฟล์เกิน 5 MB (ควรได้ error)
- [ ] ทดสอบประเภทไฟล์ที่ไม่รองรับ (ควรได้ error)

---

## 🎯 วิธีใช้งาน

### สำหรับผู้ใช้

1. **เปิด Group Chat**
   - ไปที่ `/group_chat.html`
   - เชื่อมต่อ wallet

2. **อัปโหลดรูปภาพ**
   - คลิกปุ่ม 📎 (attachment button)
   - เลือกรูปภาพ (PNG, JPEG, GIF, WebP)
   - ดู preview
   - พิมพ์ข้อความ (optional)
   - คลิก "Send"

3. **ดูรูปภาพที่อัปโหลด**
   - รูปภาพจะแสดงใน chat message
   - คลิกที่รูปเพื่อดูขนาดเต็ม

### สำหรับ Developer

**ไม่ต้องทำอะไรเพิ่มเติม!** ระบบพร้อมใช้งานแล้ว

---

## 🔍 ตรวจสอบว่าระบบทำงาน

### 1. ตรวจสอบ Backend

```bash
# ตรวจสอบว่า endpoint ทำงาน
curl -X POST http://localhost:8787/luna/chat/upload \
  -H "Content-Type: application/json" \
  -d '{
    "roomId": "group_chat",
    "wallet": "YOUR_WALLET_ADDRESS",
    "fileName": "test.png",
    "mimeType": "image/png",
    "data": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
  }'
```

**Expected Response:**
```json
{
  "ok": true,
  "url": "/uploads/chat/1234567890-abc123-test.png",
  "mimeType": "image/png",
  "size": 123,
  "name": "test.png"
}
```

### 2. ตรวจสอบ Frontend

1. เปิด `/group_chat.html`
2. เชื่อมต่อ wallet
3. คลิกปุ่ม 📎
4. เลือกรูปภาพ
5. ตรวจสอบว่า preview แสดง
6. ส่งข้อความ
7. ตรวจสอบว่ารูปภาพแสดงใน chat

### 3. ตรวจสอบ File Storage

```bash
# ตรวจสอบว่าไฟล์ถูกบันทึก
ls public/uploads/chat/

# ควรเห็นไฟล์ที่อัปโหลด
# เช่น: 1701234567890-abc123-image.png
```

---

## ⚠️ ข้อควรระวัง

### 1. **File Size Limit**
- สูงสุด: 5 MB ต่อไฟล์
- ถ้าเกิน → จะได้ error: `"File too large. Max 5.0 MB"`

### 2. **File Types**
- รองรับ: PNG, JPEG, GIF, WebP เท่านั้น
- ถ้าไม่รองรับ → จะได้ error: `"Unsupported file type"`

### 3. **Wallet Required**
- ต้องเชื่อมต่อ wallet ก่อนอัปโหลด
- ถ้าไม่เชื่อมต่อ → จะได้ error: `"Connect wallet before sending media"`

### 4. **Storage Space**
- ไฟล์จะถูกเก็บใน `public/uploads/chat/`
- ควรลบไฟล์เก่าออกเป็นระยะ (หรือใช้ cron job)

---

## 🚀 Production Deployment

### Northflank

**ไม่ต้องตั้งค่าอะไรเพิ่มเติม!**

ระบบจะทำงานอัตโนมัติเพราะ:
- ✅ Express serve static files จาก `public/`
- ✅ โฟลเดอร์ `public/uploads/chat/` จะถูกสร้างอัตโนมัติ
- ✅ Service มี permission เขียนไฟล์

**หมายเหตุ:**
- ไฟล์จะถูกเก็บใน container (ไม่ใช่ persistent storage)
- ถ้า container restart → ไฟล์จะหาย (ควรใช้ cloud storage ในอนาคต)

---

## 📚 สรุป

### ✅ ไม่ต้องเพิ่มอะไร!

ระบบอัปโหลดรูปภาพพร้อมใช้งานแล้ว:
- Backend API ✅
- Frontend UI ✅
- File storage ✅
- Validation ✅

### 🎯 เพียงแค่:

1. **เชื่อมต่อ wallet** ใน Group Chat
2. **คลิกปุ่ม 📎** เพื่ออัปโหลดรูปภาพ
3. **เลือกไฟล์** (PNG, JPEG, GIF, WebP)
4. **ส่งข้อความ** พร้อมรูปภาพ

---

**Made with ❤️ for Luna AI Streamer**












