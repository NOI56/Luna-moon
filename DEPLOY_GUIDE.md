# 🚀 คู่มือ Deploy Luna RPS Game

## วิธี Deploy ไปยัง Cloud Hosting

### 1. Railway (แนะนำ - ง่ายที่สุด)

1. ไปที่ [railway.app](https://railway.app)
2. สร้างบัญชี (ใช้ GitHub login)
3. คลิก "New Project" → "Deploy from GitHub repo"
4. เลือก repository ของคุณ
5. Railway จะ detect `railway.json` และ deploy อัตโนมัติ
6. ตั้งค่า Environment Variables:
   - `PORT` = 8787 (หรือให้ Railway กำหนดเอง)
   - `NODE_ENV` = production
7. Railway จะให้ URL เช่น `https://your-app.railway.app`

**ข้อดี:**
- ฟรี $5/เดือน
- Deploy อัตโนมัติเมื่อ push code
- รองรับ WebSocket
- ไม่ต้องตั้งค่าเอง

---

### 2. Render

1. ไปที่ [render.com](https://render.com)
2. สร้างบัญชี
3. คลิก "New" → "Web Service"
4. เชื่อมต่อ GitHub repository
5. ตั้งค่า:
   - **Build Command:** `npm install`
   - **Start Command:** `node index.js`
   - **Environment:** Node
6. ตั้งค่า Environment Variables:
   - `PORT` = 8787
   - `NODE_ENV` = production
7. Render จะให้ URL เช่น `https://your-app.onrender.com`

**ข้อดี:**
- ฟรี (แต่ sleep หลังจากไม่ใช้งาน 15 นาที)
- รองรับ WebSocket
- Auto-deploy จาก GitHub

---

### 3. Fly.io

1. ติดตั้ง Fly CLI:
   ```bash
   powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"
   ```

2. Login:
   ```bash
   fly auth login
   ```

3. สร้าง app:
   ```bash
   fly launch
   ```

4. Deploy:
   ```bash
   fly deploy
   ```

**ข้อดี:**
- ฟรี (generous free tier)
- รองรับ WebSocket
- Global edge network

---

### 4. DigitalOcean App Platform

1. ไปที่ [digitalocean.com](https://digitalocean.com)
2. สร้าง App Platform
3. เชื่อมต่อ GitHub
4. ตั้งค่าเหมือน Render

**ข้อดี:**
- Stable และเร็ว
- รองรับ WebSocket
- ราคาเริ่มต้น $5/เดือน

---

## ⚠️ สิ่งที่ต้องระวัง

### 1. Environment Variables
ต้องตั้งค่าใน cloud hosting:
- `PORT` - Port ที่ hosting service กำหนด (มักจะเป็น environment variable)
- `NODE_ENV` = production
- Database: ถ้าใช้ SQLite จะเก็บใน `/tmp` (อาจหายเมื่อ restart)

### 2. WebSocket Support
- Railway: ✅ รองรับ
- Render: ✅ รองรับ
- Fly.io: ✅ รองรับ
- DigitalOcean: ✅ รองรับ

### 3. Database
- SQLite: เก็บใน `/tmp` (อาจหายเมื่อ restart)
- ควรใช้ Postgres สำหรับ production:
  - Railway: มี Postgres addon ฟรี
  - Render: มี Postgres addon ฟรี

### 4. Static Files
- ไฟล์ใน `public/` จะถูก serve อัตโนมัติ
- ไม่ต้องตั้งค่าเพิ่มเติม

---

## 🔧 การปรับแต่งสำหรับ Cloud

### 1. เปลี่ยน PORT ให้ใช้ Environment Variable
```javascript
const PORT = process.env.PORT || 8787;
```

### 2. ใช้ Postgres แทน SQLite (แนะนำ)
```bash
# ใน Railway/Render
# เพิ่ม Postgres database
# ตั้งค่า DB_DRIVER=postgres
# ตั้งค่า DB_URL=postgres://...
```

---

## 📝 วิธี Deploy แบบ Step-by-Step (Railway)

1. **Push code ไป GitHub:**
   ```bash
   git add .
   git commit -m "Ready for deploy"
   git push origin main
   ```

2. **ไปที่ Railway:**
   - Login ที่ railway.app
   - คลิก "New Project"
   - เลือก "Deploy from GitHub repo"
   - เลือก repository

3. **ตั้งค่า Environment Variables:**
   - `PORT` = 8787 (หรือให้ Railway กำหนดเอง)
   - `NODE_ENV` = production

4. **Deploy:**
   - Railway จะ deploy อัตโนมัติ
   - รอให้ deploy เสร็จ (ประมาณ 2-3 นาที)

5. **ได้ URL:**
   - Railway จะให้ URL เช่น `https://luna-rps.railway.app`
   - แชร์ URL นี้ให้คนอื่นได้เลย!

---

## 🌐 แชร์ URL ให้คนอื่น

หลังจาก deploy แล้ว:
- **Betting Mode:** `https://your-app.railway.app/rps_betting.html`
- **PvP Mode:** `https://your-app.railway.app/rps_game.html`
- **VS Luna Mode:** `https://your-app.railway.app/rps_vs_luna.html`

---

## 💡 Tips

1. **ใช้ Custom Domain:**
   - Railway/Render รองรับ custom domain
   - เพิ่ม domain ใน settings

2. **Auto-Deploy:**
   - เมื่อ push code ไป GitHub
   - Cloud service จะ deploy อัตโนมัติ

3. **Monitoring:**
   - ดู logs ใน dashboard
   - ตรวจสอบ errors

---

ลองเลือก service ที่ชอบและ deploy ดู! 🚀


