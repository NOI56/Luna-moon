# ระบบแสดงข้อความเมื่อเว็บล่ม
## สำหรับ Luna AI v10

---

## 📋 สรุป

ระบบแสดงข้อความที่เป็นมิตรเมื่อเว็บล่มหรือมีปัญหา โดยมีหน้า error pages ที่สวยงามและเป็นมิตรแทนข้อความ error ที่ไม่เป็นมิตร

---

## 🎨 Error Pages ที่มี

### 1. **404.html** - Page Not Found
- แสดงเมื่อไม่พบหน้าเว็บ
- มีปุ่มนำทางไปยังหน้าอื่นๆ

### 2. **500.html** - Service Unavailable (ใหม่!)
- แสดงเมื่อ server ล่มหรือไม่สามารถเชื่อมต่อได้
- มี auto-retry countdown
- ตรวจสอบ server status อัตโนมัติทุก 5 วินาที
- มีปุ่ม "Try Again" และ "View Guide"

### 3. **offline.html** - Connection Error (ใหม่!)
- แสดงเมื่อไม่สามารถเชื่อมต่อกับ server ได้
- มีข้อความภาษาไทย
- มี auto-retry countdown
- ตรวจสอบ server status อัตโนมัติ

---

## 🔧 วิธีทำงาน

### Error Handling Middleware

ระบบมี error handling middleware ใน `index.js` ที่จะ:
1. จับ error ที่เกิดขึ้นใน Express
2. ตรวจสอบ status code
3. ส่งหน้า error page ที่เหมาะสม

```javascript
// Error Handling Middleware
app.use((err, req, res, next) => {
  const statusCode = err.statusCode || err.status || 500;
  
  if (statusCode === 503 || statusCode === 502) {
    res.status(statusCode).sendFile(path.join(__dirname, "public", "500.html"));
  } else if (statusCode === 500) {
    res.status(500).sendFile(path.join(__dirname, "public", "500.html"));
  } else {
    // Other errors
  }
});
```

### Auto-Retry System

หน้า error pages มี auto-retry system ที่:
1. แสดง countdown (30 วินาที)
2. ตรวจสอบ server status ทุก 5 วินาที
3. Reload หน้าเว็บอัตโนมัติเมื่อ server กลับมาใช้งานได้

```javascript
// Check server status every 5 seconds
setInterval(() => {
  fetch('/luna/health')
    .then(response => {
      if (response.ok) {
        window.location.reload(); // Server is back!
      }
    })
    .catch(() => {
      // Server still down
    });
}, 5000);
```

---

## 📝 Error Types ที่รองรับ

### 1. **500 - Internal Server Error**
- แสดงหน้า `500.html`
- เกิดเมื่อมี error ภายใน server

### 2. **502 - Bad Gateway**
- แสดงหน้า `500.html`
- เกิดเมื่อ reverse proxy ไม่สามารถเชื่อมต่อกับ server ได้

### 3. **503 - Service Unavailable**
- แสดงหน้า `500.html`
- เกิดเมื่อ server ไม่พร้อมให้บริการ

### 4. **404 - Not Found**
- แสดงหน้า `404.html`
- เกิดเมื่อไม่พบหน้าเว็บ

### 5. **Connection Refused** (Northflank Level)
- แสดงหน้า `offline.html` (ถ้า server ไม่สามารถเชื่อมต่อได้)
- เกิดเมื่อ reverse proxy ไม่สามารถเชื่อมต่อกับ server ได้

---

## 🎯 Features

### 1. **Auto-Retry**
- Countdown 30 วินาที
- Reload อัตโนมัติเมื่อ server กลับมาใช้งานได้

### 2. **Server Status Check**
- ตรวจสอบ `/luna/health` endpoint ทุก 5 วินาที
- Reload อัตโนมัติเมื่อ server กลับมาใช้งานได้

### 3. **User-Friendly Messages**
- ข้อความที่เป็นมิตรและเข้าใจง่าย
- มีคำอธิบายสาเหตุที่เป็นไปได้
- มีปุ่มนำทางไปยังหน้าอื่นๆ

### 4. **Responsive Design**
- รองรับ mobile และ desktop
- มี animation และ effects ที่สวยงาม

---

## 🔍 วิธีทดสอบ

### ทดสอบ 404 Error
```bash
# ไปที่ URL ที่ไม่มีอยู่
https://site--lunamoon--xwnj5s5p9mkb.code.run/nonexistent-page
```

### ทดสอบ 500 Error
```bash
# สร้าง route ที่ throw error
# หรือหยุด server แล้วลองเข้าถึง
```

### ทดสอบ Connection Error
```bash
# หยุด server แล้วลองเข้าถึง
# หรือใช้ curl เพื่อดู response
curl https://site--lunamoon--xwnj5s5p9mkb.code.run/
```

---

## 📋 Checklist

- [x] สร้างหน้า `500.html` สำหรับ server errors
- [x] สร้างหน้า `offline.html` สำหรับ connection errors
- [x] เพิ่ม error handling middleware
- [x] เพิ่ม auto-retry system
- [x] เพิ่ม server status check
- [x] เพิ่ม user-friendly messages
- [x] เพิ่ม responsive design

---

## 🆘 Troubleshooting

### ปัญหา: Error page ไม่แสดง

**วิธีแก้:**
1. ตรวจสอบว่าไฟล์ `500.html` และ `offline.html` อยู่ใน `public/`
2. ตรวจสอบว่า error handling middleware ถูกเพิ่มใน `index.js`
3. Restart server

### ปัญหา: Auto-retry ไม่ทำงาน

**วิธีแก้:**
1. ตรวจสอบว่า JavaScript ทำงาน (ดู console)
2. ตรวจสอบว่า `/luna/health` endpoint ทำงาน
3. ตรวจสอบ network tab ใน browser dev tools

---

## 📚 เอกสารเพิ่มเติม

- [404.html](../../public/404.html) - 404 error page
- [500.html](../../public/500.html) - 500/503 error page
- [offline.html](../../public/offline.html) - Connection error page

---

**Made with ❤️ for Luna AI Streamer**



















