# คู่มือการทดสอบ Error Pages
## สำหรับ Luna AI v10

---

## 📋 วิธีทดสอบ Error Pages

### 1. ทดสอบ 404 Error (Page Not Found)

#### วิธีที่ 1: เข้าถึง URL ที่ไม่มีอยู่
```
http://localhost:8787/nonexistent-page
https://site--lunamoon--xwnj5s5p9mkb.code.run/nonexistent-page
```

**Expected Result:**
- แสดงหน้า `404.html`
- มีข้อความ "This page isn't available."
- มีปุ่ม "Play VS Luna" และ "Betting Rooms"

#### วิธีที่ 2: ใช้ Browser DevTools
1. เปิด Browser DevTools (F12)
2. ไปที่ Network tab
3. ไปที่ URL ที่ไม่มีอยู่
4. ดู Response status: `404`

---

### 2. ทดสอบ 500 Error (Server Error)

#### วิธีที่ 1: ใช้ Test Route (แนะนำ)

เพิ่ม route สำหรับทดสอบใน `index.js`:

```javascript
// Test route for 500 error (only in development)
if (process.env.NODE_ENV !== 'production') {
  app.get('/test/500', (req, res, next) => {
    const error = new Error('Test 500 Error');
    error.statusCode = 500;
    next(error);
  });
}
```

**วิธีใช้:**
```
http://localhost:8787/test/500
```

**Expected Result:**
- แสดงหน้า `500.html`
- มีข้อความ "Service Temporarily Unavailable"
- มี auto-retry countdown
- มีปุ่ม "Try Again" และ "View Guide"

#### วิธีที่ 2: หยุด Server

1. หยุด server (Ctrl+C)
2. ลองเข้าถึงเว็บไซต์
3. จะเห็น error (Connection refused)

**หมายเหตุ:** Error นี้จะแสดงที่ระดับ reverse proxy (Northflank) ไม่ใช่ Express

---

### 3. ทดสอบ 503 Error (Service Unavailable)

#### วิธีที่ 1: ใช้ Test Route

```javascript
// Test route for 503 error
if (process.env.NODE_ENV !== 'production') {
  app.get('/test/503', (req, res, next) => {
    const error = new Error('Test 503 Error');
    error.statusCode = 503;
    next(error);
  });
}
```

**วิธีใช้:**
```
http://localhost:8787/test/503
```

**Expected Result:**
- แสดงหน้า `500.html` (ใช้หน้าเดียวกัน)
- มีข้อความ "Service Temporarily Unavailable"

---

### 4. ทดสอบ Connection Error

#### วิธีที่ 1: หยุด Server

1. หยุด server
2. ลองเข้าถึงเว็บไซต์
3. จะเห็น "Connection refused" error

**หมายเหตุ:** Error นี้จะแสดงที่ระดับ reverse proxy (Northflank) ไม่ใช่ Express

#### วิธีที่ 2: ใช้ Browser Offline Mode

1. เปิด Browser DevTools (F12)
2. ไปที่ Network tab
3. ตั้งค่าเป็น "Offline"
4. ลองเข้าถึงเว็บไซต์
5. จะเห็น network error

---

### 5. ทดสอบ Auto-Retry System

#### วิธีทดสอบ:

1. เปิดหน้า error page (เช่น `/test/500`)
2. ดู countdown timer (ควรนับถอยหลังจาก 30)
3. ตรวจสอบว่า:
   - Countdown ทำงานถูกต้อง
   - Auto-reload เมื่อ countdown ถึง 0
   - Server status check ทำงานทุก 5 วินาที

#### วิธีทดสอบ Server Status Check:

1. เปิดหน้า error page
2. เปิด Browser DevTools → Network tab
3. ดู requests ไปที่ `/luna/health` ทุก 5 วินาที
4. เมื่อ server กลับมาใช้งานได้ → หน้าเว็บจะ reload อัตโนมัติ

---

## 🔧 สร้าง Test Routes

เพิ่ม test routes ใน `index.js`:

```javascript
// Test routes for error pages (only in development)
if (process.env.NODE_ENV !== 'production') {
  // Test 500 error
  app.get('/test/500', (req, res, next) => {
    const error = new Error('Test 500 Error');
    error.statusCode = 500;
    next(error);
  });

  // Test 503 error
  app.get('/test/503', (req, res, next) => {
    const error = new Error('Test 503 Error');
    error.statusCode = 503;
    next(error);
  });

  // Test 502 error
  app.get('/test/502', (req, res, next) => {
    const error = new Error('Test 502 Error');
    error.statusCode = 502;
    next(error);
  });

  // Test generic error
  app.get('/test/error', (req, res, next) => {
    throw new Error('Test Generic Error');
  });
}
```

---

## 📝 Checklist การทดสอบ

### 404 Error
- [ ] แสดงหน้า `404.html`
- [ ] ข้อความถูกต้อง
- [ ] ปุ่มทำงาน (Play VS Luna, Betting Rooms)
- [ ] Responsive design ทำงาน

### 500/503 Error
- [ ] แสดงหน้า `500.html`
- [ ] ข้อความถูกต้อง
- [ ] Auto-retry countdown ทำงาน
- [ ] Server status check ทำงาน
- [ ] ปุ่มทำงาน (Try Again, View Guide)
- [ ] Auto-reload เมื่อ server กลับมาใช้งานได้

### Connection Error
- [ ] แสดง error message ที่เหมาะสม
- [ ] Auto-retry ทำงาน
- [ ] Server status check ทำงาน

### Auto-Retry System
- [ ] Countdown timer ทำงาน
- [ ] Auto-reload เมื่อ countdown ถึง 0
- [ ] Server status check ทุก 5 วินาที
- [ ] Auto-reload เมื่อ server กลับมาใช้งานได้

---

## 🧪 วิธีทดสอบแบบละเอียด

### 1. ทดสอบใน Local

```bash
# 1. Start server
npm start

# 2. ทดสอบ 404
curl http://localhost:8787/nonexistent-page

# 3. ทดสอบ 500 (ถ้ามี test route)
curl http://localhost:8787/test/500

# 4. หยุด server
# Ctrl+C

# 5. ทดสอบ connection error
curl http://localhost:8787/
```

### 2. ทดสอบใน Production

```
# 1. ทดสอบ 404
https://site--lunamoon--xwnj5s5p9mkb.code.run/nonexistent-page

# 2. ทดสอบ 500 (ถ้ามี test route)
https://site--lunamoon--xwnj5s5p9mkb.code.run/test/500

# 3. ทดสอบ connection error (หยุด server ใน Northflank)
# ไปที่ Northflank Dashboard → Stop service
# แล้วลองเข้าถึงเว็บไซต์
```

---

## 🔍 ตรวจสอบใน Browser

### 1. ตรวจสอบ Response Status

1. เปิด Browser DevTools (F12)
2. ไปที่ Network tab
3. ลองเข้าถึง URL ที่มี error
4. ดู Response status code:
   - `404` → 404.html
   - `500` → 500.html
   - `503` → 500.html
   - `502` → 500.html

### 2. ตรวจสอบ Console Logs

1. เปิด Browser DevTools → Console tab
2. ดู error messages
3. ตรวจสอบว่าไม่มี JavaScript errors

### 3. ตรวจสอบ Auto-Retry

1. เปิด Browser DevTools → Network tab
2. เปิดหน้า error page
3. ดู requests ไปที่ `/luna/health` ทุก 5 วินาที
4. ตรวจสอบว่า countdown timer ทำงาน

---

## 🆘 Troubleshooting

### ปัญหา: Error page ไม่แสดง

**วิธีแก้:**
1. ตรวจสอบว่าไฟล์อยู่ใน `public/`
2. ตรวจสอบว่า error handling middleware ถูกเพิ่มใน `index.js`
3. Restart server
4. ตรวจสอบ Logs

### ปัญหา: Auto-retry ไม่ทำงาน

**วิธีแก้:**
1. ตรวจสอบว่า JavaScript ทำงาน (ดู console)
2. ตรวจสอบว่า `/luna/health` endpoint ทำงาน
3. ตรวจสอบ network tab ใน browser dev tools

### ปัญหา: Server status check ไม่ทำงาน

**วิธีแก้:**
1. ตรวจสอบว่า `/luna/health` endpoint ทำงาน
2. ตรวจสอบ CORS settings
3. ตรวจสอบ network tab ใน browser dev tools

---

## 📚 เอกสารเพิ่มเติม

- [ERROR_PAGE_SYSTEM.md](./ERROR_PAGE_SYSTEM.md) - เอกสารระบบ error pages
- [404.html](../../public/404.html) - 404 error page
- [500.html](../../public/500.html) - 500/503 error page
- [offline.html](../../public/offline.html) - Connection error page

---

**Made with ❤️ for Luna AI Streamer**



















