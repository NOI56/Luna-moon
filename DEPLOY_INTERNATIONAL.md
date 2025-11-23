# 🌍 Deploy Luna RPS Game ไปยัง Cloud Hosting ต่างประเทศ

## 🎯 เป้าหมาย
Deploy เว็บไปยัง cloud hosting ต่างประเทศ เพื่อให้คนอื่นเข้าถึงได้โดยไม่ต้องรัน `node index.js` เอง

---

## 🚀 วิธี Deploy (แนะนำตามความง่าย)

### 1. Railway.app (แนะนำที่สุด - ง่ายและฟรี)

**ทำไมเลือก Railway:**
- ✅ ฟรี $5/เดือน (generous free tier)
- ✅ Deploy ง่ายมาก (คลิกเดียว)
- ✅ รองรับ WebSocket
- ✅ Auto-deploy จาก GitHub
- ✅ มี SSL/HTTPS ฟรี
- ✅ Server อยู่ต่างประเทศ (US/EU)

**ขั้นตอน:**

1. **Push code ไป GitHub:**
   ```bash
   git init
   git add .
   git commit -m "Ready for deploy"
   git remote add origin YOUR_GITHUB_REPO_URL
   git push -u origin main
   ```

2. **ไปที่ Railway:**
   - เปิด [railway.app](https://railway.app)
   - คลิก "Start a New Project"
   - เลือก "Deploy from GitHub repo"
   - Login ด้วย GitHub
   - เลือก repository ของคุณ

3. **Railway จะ deploy อัตโนมัติ:**
   - รอประมาณ 2-3 นาที
   - Railway จะ detect `railway.json` และ deploy ให้

4. **ตั้งค่า Environment Variables (ถ้าจำเป็น):**
   - `PORT` = 8787 (หรือให้ Railway กำหนดเอง)
   - `NODE_ENV` = production

5. **ได้ URL:**
   - Railway จะให้ URL เช่น: `https://luna-rps-production.up.railway.app`
   - URL นี้สามารถแชร์ให้คนอื่นได้เลย!

**แชร์ URL:**
- Betting Mode: `https://your-app.railway.app/rps_betting.html`
- PvP Mode: `https://your-app.railway.app/rps_game.html`
- VS Luna Mode: `https://your-app.railway.app/rps_vs_luna.html`

---

### 2. Render.com (ฟรี แต่ sleep หลังจากไม่ใช้งาน)

**ทำไมเลือก Render:**
- ✅ ฟรี (แต่ sleep หลังจากไม่ใช้งาน 15 นาที)
- ✅ รองรับ WebSocket
- ✅ Auto-deploy จาก GitHub
- ✅ มี SSL/HTTPS ฟรี

**ขั้นตอน:**

1. **Push code ไป GitHub** (เหมือน Railway)

2. **ไปที่ Render:**
   - เปิด [render.com](https://render.com)
   - สร้างบัญชี
   - คลิก "New" → "Web Service"
   - เชื่อมต่อ GitHub repository

3. **ตั้งค่า:**
   - **Name:** luna-rps-game
   - **Environment:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `node index.js`
   - **Plan:** Free

4. **ตั้งค่า Environment Variables:**
   - `PORT` = 8787
   - `NODE_ENV` = production

5. **Deploy:**
   - Render จะ deploy อัตโนมัติ
   - ได้ URL เช่น: `https://luna-rps-game.onrender.com`

---

### 3. Fly.io (ฟรีและเร็ว)

**ทำไมเลือก Fly.io:**
- ✅ ฟรี (generous free tier)
- ✅ รองรับ WebSocket
- ✅ Global edge network (เร็ว)
- ✅ เลือก region ได้ (US, EU, Asia)

**ขั้นตอน:**

1. **ติดตั้ง Fly CLI:**
   ```powershell
   # Windows PowerShell
   iwr https://fly.io/install.ps1 -useb | iex
   ```

2. **Login:**
   ```bash
   fly auth login
   ```

3. **Launch app:**
   ```bash
   fly launch
   ```
   - เลือก region (แนะนำ: `sin` สำหรับ Asia หรือ `iad` สำหรับ US)

4. **Deploy:**
   ```bash
   fly deploy
   ```

5. **ได้ URL:**
   - เช่น: `https://luna-rps-game.fly.dev`

---

### 4. DigitalOcean App Platform ($5/เดือน)

**ทำไมเลือก DigitalOcean:**
- ✅ Stable และเร็ว
- ✅ ไม่ sleep
- ✅ รองรับ WebSocket
- ✅ ราคา $5/เดือน

**ขั้นตอน:**

1. **ไปที่ DigitalOcean:**
   - เปิด [digitalocean.com](https://digitalocean.com)
   - สร้าง App Platform
   - เชื่อมต่อ GitHub

2. **ตั้งค่าเหมือน Render**

3. **ได้ URL:**
   - เช่น: `https://luna-rps-game.ondigitalocean.app`

---

## 📋 Checklist ก่อน Deploy

- [ ] Push code ไป GitHub
- [ ] ตรวจสอบว่า `railway.json` หรือ `render.yaml` มีอยู่
- [ ] ตั้งค่า Environment Variables
- [ ] ตรวจสอบว่า PORT ใช้ `process.env.PORT` (มีอยู่แล้ว)
- [ ] ทดสอบ deploy
- [ ] แชร์ URL ให้คนอื่น

---

## 🌐 Regions ที่แนะนำ

- **Asia:** Singapore (`sin`) - ใกล้ไทยที่สุด
- **US:** Virginia (`iad`) หรือ Oregon (`sjc`)
- **EU:** Frankfurt (`fra`) หรือ London (`lhr`)

---

## ⚠️ สิ่งที่ต้องระวัง

1. **Database:**
   - SQLite เก็บใน `/tmp` (อาจหายเมื่อ restart)
   - ควรใช้ Postgres สำหรับ production
   - Railway/Render มี Postgres addon ฟรี

2. **Environment Variables:**
   - ตั้งค่าใน cloud hosting dashboard
   - ไม่ควร commit `.env` ไป GitHub

3. **WebSocket:**
   - ทุก service รองรับ WebSocket แล้ว
   - ไม่ต้องตั้งค่าเพิ่มเติม

4. **Static Files:**
   - ไฟล์ใน `public/` จะถูก serve อัตโนมัติ
   - ไม่ต้องตั้งค่าเพิ่มเติม

---

## 🎉 หลังจาก Deploy

1. **ได้ Public URL:**
   - เช่น: `https://luna-rps-game.railway.app`

2. **แชร์ให้คนอื่น:**
   - Betting Mode: `https://your-app.railway.app/rps_betting.html`
   - PvP Mode: `https://your-app.railway.app/rps_game.html`
   - VS Luna Mode: `https://your-app.railway.app/rps_vs_luna.html`

3. **Auto-Deploy:**
   - เมื่อ push code ไป GitHub
   - Cloud service จะ deploy อัตโนมัติ

---

## 💡 Tips

1. **ใช้ Custom Domain:**
   - Railway/Render รองรับ custom domain
   - เพิ่ม domain ใน settings

2. **Monitoring:**
   - ดู logs ใน dashboard
   - ตรวจสอบ errors

3. **Backup:**
   - Database ควร backup เป็นระยะ
   - ใช้ Postgres addon เพื่อ backup อัตโนมัติ

---

ลองเลือก service ที่ชอบและ deploy ดู! 🚀

**แนะนำ: เริ่มจาก Railway เพราะง่ายที่สุด!**


