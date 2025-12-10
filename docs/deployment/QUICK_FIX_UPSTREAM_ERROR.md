# 🔧 Quick Fix: Upstream Connection Error

## ⚠️ Error Message
```
upstream connect error or disconnect/reset before headers. 
retried and the latest reset reason: remote connection failure, 
transport failure reason: delayed connect error: Connection refused
```

## 🎯 สาเหตุหลัก
Server ไม่ start หรือ crash ก่อนที่จะรับ request

## ✅ วิธีแก้ไข (ทำตามลำดับ)

### 1️⃣ ตรวจสอบ Northflank Logs (สำคัญที่สุด!)

1. **ไปที่ Northflank Dashboard:**
   ```
   https://app.northflank.com/t/lunamoons-team/project/luna/services/lunamoon
   ```

2. **คลิกแท็บ "Logs"**

3. **ดู error messages ล่าสุด:**
   - ❌ `[config] ❌ Configuration errors:` → Missing environment variables
   - ❌ `ERR_MODULE_NOT_FOUND` → Missing dependencies
   - ❌ `Cannot find package` → npm install failed
   - ❌ `Port ... is already in use` → Port conflict
   - ❌ `EADDRINUSE` → Port already in use
   - ❌ `ECONNREFUSED` → Database connection failed

### 2️⃣ ตรวจสอบ Environment Variables

1. **ไปที่ Service Settings → "Run" → "Environment"**

2. **ตรวจสอบ Required Variables:**
   ```env
   # ต้องมีอย่างน้อย 1 ตัว
   OPENAI_KEY=sk-... หรือ
   OPENROUTER_KEY=sk-...
   
   # Port (ถ้าไม่ระบุ Northflank จะ auto-assign)
   PORT=8787
   
   # Environment
   NODE_ENV=production
   ```

3. **ถ้าใช้ VTS หรือ TTS:**
   ```env
   VTS_ENABLED=false  # ถ้าไม่ใช้ VTS
   TTS_ENABLED=false  # ถ้าไม่ใช้ TTS
   ```

### 3️⃣ ตรวจสอบ Build Status

1. **ไปที่ "Code" → "Builds"**

2. **ดู Build ล่าสุด:**
   - ✅ Green = Build สำเร็จ
   - ❌ Red = Build ล้มเหลว → ดู error message

### 4️⃣ Restart Service

1. **ไปที่ Service Dashboard**

2. **คลิก "Restart" หรือ "Redeploy"**

3. **รอให้ service start (ประมาณ 1-2 นาที)**

4. **ตรวจสอบ Logs อีกครั้ง** ว่ามี error หรือไม่

### 5️⃣ ตรวจสอบ Health Check

1. **ไปที่ "Health checks"**

2. **ตรวจสอบว่า Health Check Path ถูกต้อง:**
   ```
   /luna/health
   ```

3. **ทดสอบ Health Check:**
   ```
   https://site--lunamoon--xwnj5s5p9mkb.code.run/luna/health
   ```
   
   **ถ้าได้ response:** Server ทำงานแล้ว ✅
   **ถ้าไม่ได้ response:** Server ยังไม่ start ❌

## 🔍 Common Issues และวิธีแก้

### Issue 1: Missing Environment Variables
**Error:** `[config] ❌ Configuration errors:`
**Fix:** เพิ่ม environment variables ที่ขาดใน Northflank Dashboard

### Issue 2: Port Configuration
**Error:** `Port ... is already in use` หรือ `EADDRINUSE`
**Fix:** 
- ลบ `PORT` environment variable (ให้ Northflank auto-assign)
- หรือเปลี่ยนเป็น port อื่น

### Issue 3: Database Connection Failed
**Error:** `ECONNREFUSED` หรือ database errors
**Fix:** 
- ตรวจสอบ database connection string
- ถ้าใช้ SQLite อาจเป็น permission issue

### Issue 4: Module Not Found
**Error:** `ERR_MODULE_NOT_FOUND` หรือ `Cannot find package`
**Fix:**
- ตรวจสอบ `package.json` dependencies
- Rebuild service

## 📞 ถ้ายังแก้ไม่ได้

1. **Copy error message จาก Logs**
2. **ตรวจสอบว่า environment variables ครบหรือไม่**
3. **ลอง Redeploy service ใหม่**

## ✅ Checklist

- [ ] ตรวจสอบ Northflank Logs
- [ ] ตรวจสอบ Environment Variables
- [ ] ตรวจสอบ Build Status
- [ ] Restart Service
- [ ] ทดสอบ Health Check (`/luna/health`)
- [ ] ทดสอบหน้าเว็บ












