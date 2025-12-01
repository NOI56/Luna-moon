# Northflank Deployment Guide
## คู่มือการ Deploy Luna AI v10 บน Northflank

---

## 📋 สารบัญ

1. [ข้อกำหนดเบื้องต้น](#ข้อกำหนดเบื้องต้น)
2. [การตั้งค่า Northflank](#การตั้งค่า-northflank)
3. [การตั้งค่า Environment Variables](#การตั้งค่า-environment-variables)
4. [การ Deploy](#การ-deploy)
5. [การตรวจสอบและ Troubleshooting](#การตรวจสอบและ-troubleshooting)
6. [การอัปเดต](#การอัปเดต)

---

## ✅ ข้อกำหนดเบื้องต้น

### 1. สิ่งที่ต้องมี

- ✅ บัญชี Northflank (https://northflank.com)
- ✅ GitHub repository ที่มีโค้ด Luna AI v10
- ✅ API Keys:
  - OpenAI API Key หรือ OpenRouter API Key
  - ElevenLabs API Key (ถ้าใช้ TTS)
  - VTube Studio Auth Token (ถ้าใช้ VTS)

### 2. ตรวจสอบไฟล์ที่จำเป็น

- ✅ `package.json` - มี dependencies ทั้งหมด
- ✅ `index.js` - entry point ของแอป
- ✅ `env.example` - template สำหรับ environment variables
- ✅ `configs/northflank.yaml` - config file สำหรับ Northflank

---

## 🚀 การตั้งค่า Northflank

### ขั้นตอนที่ 1: สร้าง Project และ Service

1. เข้าสู่ระบบ Northflank Dashboard
2. สร้าง Project ใหม่ (ถ้ายังไม่มี)
3. คลิก "Add Service" → เลือก "Git Repository"
4. เชื่อมต่อ GitHub repository:
   - เลือก repository: `NO156/Luna-moon` (หรือ repository ของคุณ)
   - เลือก branch: `main`
   - เลือก build type: **"Dockerfile"** หรือ **"Buildpack"** (แนะนำ: Buildpack)

### ขั้นตอนที่ 2: ตั้งค่า Build Configuration

1. ไปที่ Service Settings → **Build**
2. ตั้งค่า Build Command:
   ```
   npm install
   ```
3. ตั้งค่า Start Command:
   ```
   node index.js
   ```
4. ตั้งค่า Node.js Version:
   - เลือก **Node.js 18+** (Northflank จะ auto-detect จาก package.json)

### ขั้นตอนที่ 3: ตั้งค่า Port และ Health Check

1. ไปที่ Service Settings → **Deploy**
2. ตั้งค่า Port:
   - ถ้าไม่ระบุ → Northflank จะ auto-assign port
   - หรือตั้งเป็น `8787` (ตามที่กำหนดใน .env)
3. ตั้งค่า Health Check Path:
   ```
   /luna/health
   ```
4. ตั้งค่า Restart Policy:
   - Type: **ON_FAILURE**
   - Max Retries: **10**

### ขั้นตอนที่ 4: ตั้งค่า Resources

1. ไปที่ Service Settings → **Resources**
2. แนะนำ Resource Limits:
   - **CPU**: 0.1-0.5 vCPU
   - **Memory**: 256-512 MB
   - **Disk**: 1-2 GB (สำหรับ database และ logs)

---

## 🔐 การตั้งค่า Environment Variables

### ขั้นตอนที่ 1: เปิด Environment Variables

1. ไปที่ Service Settings → **Environment Variables**
2. คลิก "Add Variable" เพื่อเพิ่มแต่ละตัวแปร

### ขั้นตอนที่ 2: เพิ่ม Required Variables

#### Server Configuration
```
PORT=8787
NODE_ENV=production
```

#### AI Configuration (เลือกอย่างใดอย่างหนึ่ง)
```
# ตัวเลือกที่ 1: ใช้ OpenAI API
OPENAI_KEY=sk-...

# ตัวเลือกที่ 2: ใช้ OpenRouter (แนะนำ)
OPENROUTER_KEY=sk-or-...
```

#### Model Configuration
```
SIMPLE_MODEL=gpt-4o-mini
COMPLEX_MODEL=anthropic/claude-3-opus
FALLBACK_MODEL=gpt-4o-mini
```

#### VTube Studio Configuration (ถ้าใช้)
```
VTS_ENABLED=true
VTS_HOST=127.0.0.1
VTS_PORT=8001
VTS_AUTH_TOKEN=your_vts_auth_token_here
```

#### TTS Configuration (ถ้าใช้)
```
TTS_ENABLED=true
ELEVEN_KEY=your_elevenlabs_api_key_here
ELEVEN_VOICE_NORMAL=21m00Tcm4TlvDq8ikWAM
ELEVEN_VOICE_SOFT=21m00Tcm4TlvDq8ikWAM
ELEVEN_VOICE_PASSION=21m00Tcm4TlvDq8ikWAM
```

### ขั้นตอนที่ 3: เพิ่ม Optional Variables

#### CORS Configuration
```
CORS_ORIGINS=*
```

#### Admin Configuration
```
ADMIN_SECRET=your_admin_secret_here
```

#### Logging Configuration
```
LOG_LEVEL=info
LOG_CONSOLE=true
LOG_VERBOSE=false
```

#### Solana Configuration (ถ้าใช้)
```
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
LUNA_WALLET=your_solana_wallet_address_here
LUNA_TOKEN_MINT=your_token_mint_address_here
LUNA_BUY_LINK=https://pump.fun/your_token_mint_address_here
LUNA_X_LINK=https://x.com/your_community
LUNA_TO_SOL_RATE=0.00009
```

#### Betting & Rewards Configuration (ถ้าใช้ RPS Betting)
```
BETTING_FEE_WALLET=your_fee_wallet_address_here
REWARD_DISTRIBUTION_WALLET=your_reward_wallet_address_here
REWARD_SENDER_PRIVATE_KEY=your_base58_private_key_here
DEPOSIT_ESCROW_WALLET=your_escrow_wallet_address_here
DEPOSIT_ESCROW_PRIVATE_KEY=your_base58_private_key_here
```

#### Cost Saving Features
```
IDLE_MONOLOGUE_ENABLED=false
AMBIENT_MURMUR_ENABLED=false
```

#### Backup Configuration
```
AUTO_BACKUP_ENABLED=true
BACKUP_INTERVAL=3600000
MAX_BACKUPS=10
```

**📝 หมายเหตุ:** ดูรายละเอียดเพิ่มเติมใน `env.example`

---

## 🚀 การ Deploy

### ขั้นตอนที่ 1: Deploy ครั้งแรก

1. ตรวจสอบว่าตั้งค่าทั้งหมดเรียบร้อยแล้ว
2. คลิก "Deploy" หรือ "Save & Deploy"
3. รอให้ build และ deploy เสร็จ (ประมาณ 2-5 นาที)
4. ตรวจสอบ logs เพื่อดูว่ามี error หรือไม่

### ขั้นตอนที่ 2: ตรวจสอบ Deployment

1. ไปที่ Service → **Logs**
2. ตรวจสอบว่าไม่มี error:
   - ✅ ไม่มี `ERR_MODULE_NOT_FOUND`
   - ✅ ไม่มี `Cannot find package 'express'`
   - ✅ Server start สำเร็จ: `Server running on port...`
3. ไปที่ Service → **Metrics**
4. ตรวจสอบว่า service รันอยู่ (Status: **Running**)

### ขั้นตอนที่ 3: ทดสอบ Health Check

1. ไปที่ Service → **Overview**
2. คลิกที่ URL ของ service (เช่น `https://your-service.northflank.app`)
3. ทดสอบ Health Check:
   ```
   GET https://your-service.northflank.app/luna/health
   ```
4. ควรได้ response:
   ```json
   {
     "ok": true,
     "status": "healthy",
     "checks": {...}
   }
   ```

---

## 🔍 การตรวจสอบและ Troubleshooting

### ปัญหาที่พบบ่อย

#### 1. Error: `ERR_MODULE_NOT_FOUND: Cannot find package 'express'`

**สาเหตุ:** ไม่ได้รัน `npm install` ก่อน start

**วิธีแก้:**
1. ตรวจสอบว่า Build Command ตั้งเป็น `npm install`
2. ตรวจสอบว่า `package.json` มี `express` ใน dependencies
3. Rebuild service:
   - ไปที่ Service → **Deployments**
   - คลิก "Redeploy" หรือ "Rebuild"

#### 2. Service รีสตาร์ทซ้ำๆ (Restart Loop)

**สาเหตุ:**
- Environment variables ไม่ครบ
- Port configuration ไม่ถูกต้อง
- Database initialization ล้มเหลว

**วิธีแก้:**
1. ตรวจสอบ Logs เพื่อดู error message
2. ตรวจสอบ Environment Variables ว่าครบถ้วน
3. ตรวจสอบ Health Check Path ว่าถูกต้อง

#### 3. VTS ไม่เชื่อมต่อ

**สาเหตุ:**
- VTube Studio ไม่ได้รันบน server เดียวกัน
- VTS_AUTH_TOKEN ไม่ถูกต้อง
- Network configuration ไม่ถูกต้อง

**วิธีแก้:**
- ถ้า VTS รันบน local machine → ใช้ ngrok หรือ tunnel
- ตรวจสอบ VTS_AUTH_TOKEN ว่าถูกต้อง
- ตั้ง `VTS_ENABLED=false` ถ้าไม่ใช้ VTS บน cloud

#### 4. Database Error

**สาเหตุ:**
- Disk space ไม่พอ
- File permissions ไม่ถูกต้อง

**วิธีแก้:**
1. เพิ่ม Disk space ใน Resources
2. ตรวจสอบว่า service มี permission เขียนไฟล์

### การตรวจสอบ Logs

1. ไปที่ Service → **Logs**
2. ใช้ Filter เพื่อค้นหา error:
   - `stderr` - error messages
   - `ERR_` - Node.js errors
   - `[ERROR]` - application errors

### การตรวจสอบ Metrics

1. ไปที่ Service → **Metrics**
2. ตรวจสอบ:
   - **CPU Usage** - ไม่ควรเกิน 80%
   - **Memory Usage** - ไม่ควรเกิน 80%
   - **Request Rate** - จำนวน requests ต่อวินาที
   - **Error Rate** - ควรเป็น 0%

---

## 🔄 การอัปเดต

### วิธีที่ 1: Auto-Deploy (แนะนำ)

1. Push code ใหม่ไปที่ GitHub repository
2. Northflank จะ auto-detect และ deploy อัตโนมัติ (ถ้าเปิดใช้งาน)
3. ตรวจสอบ Logs เพื่อดูว่า deploy สำเร็จ

### วิธีที่ 2: Manual Deploy

1. ไปที่ Service → **Deployments**
2. คลิก "Redeploy" หรือ "Deploy Latest"
3. รอให้ build และ deploy เสร็จ

### วิธีที่ 3: Rollback

1. ไปที่ Service → **Deployments**
2. เลือก deployment ที่ต้องการ rollback
3. คลิก "Rollback"
4. รอให้ rollback เสร็จ

---

## 📚 เอกสารเพิ่มเติม

- [README.md](../../README.md) - เอกสารหลักของโปรเจค
- [env.example](../../env.example) - Template สำหรับ environment variables
- [API Documentation](../../docs/guides/API_DOCUMENTATION.md) - API endpoints
- [System Architecture](../../docs/guides/SYSTEM_ARCHITECTURE.md) - สถาปัตยกรรมระบบ

---

## 🆘 Support

ถ้ามีปัญหาหรือคำถาม:
1. ตรวจสอบ Logs ใน Northflank Dashboard
2. ตรวจสอบ Health Check endpoint
3. ดูเอกสาร Troubleshooting ใน README.md
4. ตรวจสอบ Environment Variables ว่าครบถ้วน

---

**Made with ❤️ for Luna AI Streamer**











