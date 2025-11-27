# 📥 วิธีดาวน์โหลด pixi-live2d-display Library

## 🎯 เป้าหมาย

ดาวน์โหลด `pixi-live2d-display` library มาเก็บในโปรเจคเพื่อใช้ Live2D model จาก VTube Studio

---

## วิธีที่ 1: ใช้ npm (แนะนำ)

### ขั้นตอน:

1. **เปิด Terminal/PowerShell** ในโฟลเดอร์โปรเจค:
   ```
   D:\LunaAI_v10_Project
   ```

2. **ติดตั้ง package:**
   ```bash
   npm install pixi-live2d-display@0.5.0
   ```

3. **คัดลอกไฟล์ไปที่ public/libs:**
   ```bash
   copy node_modules\pixi-live2d-display\dist\index.min.js public\libs\pixi-live2d-display.min.js
   ```

   หรือใช้ PowerShell:
   ```powershell
   Copy-Item "node_modules\pixi-live2d-display\dist\index.min.js" -Destination "public\libs\pixi-live2d-display.min.js"
   ```

---

## วิธีที่ 2: ดาวน์โหลดโดยตรง

### ขั้นตอน:

1. **เปิด Browser** ไปที่:
   ```
   https://unpkg.com/pixi-live2d-display@0.5.0/dist/index.min.js
   ```

2. **Save As** (กด `Ctrl + S`)
   - บันทึกเป็น: `pixi-live2d-display.min.js`
   - เก็บไว้ที่: `D:\LunaAI_v10_Project\public\libs\`

---

## วิธีที่ 3: ใช้ wget หรือ curl

### Windows (PowerShell):

```powershell
Invoke-WebRequest -Uri "https://unpkg.com/pixi-live2d-display@0.5.0/dist/index.min.js" -OutFile "public\libs\pixi-live2d-display.min.js"
```

---

## ✅ หลังจากดาวน์โหลดเสร็จ

1. **ตรวจสอบว่าไฟล์อยู่ถูกที่:**
   ```
   D:\LunaAI_v10_Project\public\libs\pixi-live2d-display.min.js
   ```

2. **Restart Server:**
   - หยุด server (กด `Ctrl + C`)
   - รันใหม่: `node index.js`

3. **รีเฟรช Character Viewer:**
   - เปิด Browser: `http://localhost:8787/luna-character?model=Akari`
   - กด `Ctrl + Shift + R` (hard refresh)

---

## 🎯 ผลลัพธ์

- Character Viewer จะโหลด `pixi-live2d-display` จาก local file
- Live2D model (Akari) จะแสดงผลได้
- ไม่ต้องพึ่งพา CDN อีกต่อไป

---

## 🐛 ถ้ายังไม่ทำงาน

1. ตรวจสอบว่าไฟล์อยู่ถูกที่: `public/libs/pixi-live2d-display.min.js`
2. ตรวจสอบ Browser Console (F12) ดู error messages
3. ตรวจสอบ Network tab ว่าไฟล์โหลดสำเร็จหรือไม่






