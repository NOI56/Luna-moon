# คู่มือแก้ไขปัญหา Deployment บน Northflank
## สำหรับ Luna AI v10

---

## 🔴 ปัญหา: "Connection refused" หลังจาก Deploy

### สาเหตุที่เป็นไปได้:

1. **Environment Variables ไม่ครบ**
   - `validateEnvironment()` จะ exit ถ้า required variables ไม่ครบ
   - Server จะไม่ start

2. **Server Crash หลัง Start**
   - Error ใน code ที่ทำให้ server crash
   - Database initialization ล้มเหลว

3. **Port Configuration ไม่ถูกต้อง**
   - Northflank อาจจะ auto-assign port
   - แต่ code อาจจะใช้ PORT environment variable

---

## ✅ วิธีแก้ไข

### ขั้นตอนที่ 1: ตรวจสอบ Logs

1. **ไปที่ Northflank Dashboard:**
   ```
   https://app.northflank.com/t/lunamoons-team/project/luna/services/lunamoon
   ```

2. **คลิกแท็บ "Logs" หรือ "Observability" → "Logs"**

3. **ดู error messages:**
   - หา `[config] ❌ Configuration errors:`
   - หา `ERR_MODULE_NOT_FOUND`
   - หา `Cannot find package`
   - หา `Port ... is already in use`

### ขั้นตอนที่ 2: ตรวจสอบ Environment Variables

1. **ไปที่ Service Settings → "Run" → "Environment"**

2. **ตรวจสอบ Required Variables:**
   ```env
   # Required
   PORT=8787 (หรือให้ Northflank auto-assign)
   NODE_ENV=production
   OPENAI_KEY หรือ OPENROUTER_KEY (อย่างใดอย่างหนึ่ง)
   
   # Optional แต่แนะนำ
   VTS_ENABLED=false (ถ้าไม่ใช้ VTS)
   TTS_ENABLED=false (ถ้าไม่ใช้ TTS)
   ```

3. **ตรวจสอบว่าไม่มี Missing Variables:**
   - ดู error ใน logs ว่า missing อะไร

### ขั้นตอนที่ 3: ตรวจสอบ Build Status

1. **ไปที่ "Code" → "Builds"**

2. **ดูว่า Build สำเร็จหรือไม่:**
   - ✅ Green checkmark = Build สำเร็จ
   - ❌ Red X = Build ล้มเหลว

3. **ถ้า Build ล้มเหลว:**
   - ดู error message
   - ตรวจสอบ `package.json` dependencies
   - ตรวจสอบ `Dockerfile` (ถ้าใช้)

### ขั้นตอนที่ 4: ตรวจสอบ Health Check

1. **ไปที่ "Health checks"**

2. **ตรวจสอบว่า Health Check Path ถูกต้อง:**
   ```
   /luna/health
   ```

3. **ทดสอบ Health Check:**
   ```bash
   curl https://site--lunamoon--xwnj5s5p9mkb.code.run/luna/health
   ```

---

## 🔧 แก้ไขปัญหาเฉพาะ

### ปัญหา 1: "Configuration errors" ใน Logs

**สาเหตุ:** Environment variables ไม่ครบ

**วิธีแก้:**
1. ดู error message ใน logs ว่า missing อะไร
2. เพิ่ม missing variables ใน Environment Settings
3. Rebuild/Redeploy service

### ปัญหา 2: "ERR_MODULE_NOT_FOUND"

**สาเหตุ:** Dependencies ไม่ได้ install

**วิธีแก้:**
1. ตรวจสอบ `package.json` ว่ามี dependencies ครบ
2. ตรวจสอบ Build Command: `npm install`
3. Rebuild service

### ปัญหา 3: "Port ... is already in use"

**สาเหตุ:** Port conflict

**วิธีแก้:**
1. ตั้ง `PORT` environment variable เป็นค่าอื่น
2. หรือให้ Northflank auto-assign port (ลบ PORT variable)

### ปัญหา 4: Server Start แล้วแต่ Connection Refused

**สาเหตุ:** 
- Server listen ที่ wrong interface
- Health check ไม่ผ่าน

**วิธีแก้:**
1. ตรวจสอบว่า server listen ที่ `0.0.0.0` (ไม่ใช่ `localhost`)
2. ตรวจสอบ Health Check endpoint
3. ตรวจสอบ Networking settings

---

## 📋 Checklist ก่อน Deploy

- [ ] Environment Variables ครบถ้วน
- [ ] Build สำเร็จ (ไม่มี error)
- [ ] Health Check Path ถูกต้อง (`/luna/health`)
- [ ] Port Configuration ถูกต้อง
- [ ] Dependencies ครบใน `package.json`
- [ ] Logs ไม่มี error

---

## 🆘 ถ้ายังแก้ไม่ได้

1. **ดู Logs ทั้งหมด:**
   - ไปที่ "Observability" → "Logs"
   - Filter: `stderr` หรือ `ERROR`

2. **ตรวจสอบ Metrics:**
   - ไปที่ "Observability" → "Metrics"
   - ดู CPU, Memory usage
   - ดูว่า service รันอยู่หรือไม่

3. **ลอง Rebuild:**
   - ไปที่ "Code" → "Builds"
   - คลิก "Rebuild" ที่ commit ล่าสุด

4. **ลอง Rollback:**
   - ไปที่ "Deployments"
   - Rollback ไป commit เก่าที่ทำงานได้

---

**Made with ❤️ for Luna AI Streamer**

