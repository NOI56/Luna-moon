# คู่มือตั้งค่า Environment Variables ครบถ้วน
## สำหรับ Luna AI v10 บน Northflank

---

## 📋 สารบัญ

1. [Required Variables (จำเป็นต้องมี)](#required-variables-จำเป็นต้องมี)
2. [Recommended Variables (แนะนำให้มี)](#recommended-variables-แนะนำให้มี)
3. [Optional Variables (ไม่จำเป็น)](#optional-variables-ไม่จำเป็น)
4. [Quick Setup Checklist](#quick-setup-checklist)

---

## ⚠️ Required Variables (จำเป็นต้องมี)

### 1. Server Configuration

```env
PORT=8787
NODE_ENV=production
```

**คำอธิบาย:**
- `PORT`: Port ที่ server จะรัน (หรือลบออกให้ Northflank auto-assign)
- `NODE_ENV`: ตั้งเป็น `production` สำหรับ production

---

### 2. AI / LLM Configuration (เลือกอย่างใดอย่างหนึ่ง)

**ตัวเลือกที่ 1: ใช้ OpenAI API**
```env
OPENAI_KEY=sk-...
SIMPLE_MODEL=gpt-4o-mini
COMPLEX_MODEL=gpt-4o
FALLBACK_MODEL=gpt-4o-mini
```

**ตัวเลือกที่ 2: ใช้ OpenRouter (แนะนำ)**
```env
OPENROUTER_KEY=sk-or-v1-...
SIMPLE_MODEL=gpt-4o-mini
COMPLEX_MODEL=anthropic/claude-3-opus
FALLBACK_MODEL=gpt-4o-mini
```

**หมายเหตุ:** ต้องมี `OPENAI_KEY` หรือ `OPENROUTER_KEY` อย่างใดอย่างหนึ่ง

---

### 3. Luna Token Configuration (จำเป็นสำหรับ RPS Game)

```env
LUNA_TOKEN_MINT=CbB4ivri6wLfqx4NwrWY3ArD7mXv1e91HeYeq3KBpump
```

**วิธีหา Token Mint Address:**
1. ไปที่ https://pump.fun
2. ค้นหา token ของคุณ
3. คัดลอก **Mint Address**

**หมายเหตุ:** จำเป็นสำหรับ:
- ระบบเช็ค Luna balance
- Dynamic Minimum Requirement
- ระบบ Betting และ Rewards

---

## ✅ Recommended Variables (แนะนำให้มี)

### 1. CORS Configuration

```env
CORS_ORIGINS=*
```

**คำอธิบาย:** อนุญาตให้ทุก origin เข้าถึง API (หรือระบุเฉพาะ origin ที่ต้องการ)

---

### 2. Logging Configuration

```env
LOG_LEVEL=info
LOG_CONSOLE=true
LOG_VERBOSE=false
```

**คำอธิบาย:** ตั้งค่า logging level และ console output

---

### 3. Solana Configuration

```env
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
```

**คำอธิบาย:** 
- ใช้ public RPC (free) หรือ RPC ของคุณเอง (ถ้ามี rate limit)
- ถ้าไม่ตั้งค่า → ใช้ default: `https://api.mainnet-beta.solana.com`

---

### 4. Luna Token Links

```env
LUNA_BUY_LINK=https://pump.fun/CbB4ivri6wLfqx4NwrWY3ArD7mXv1e91HeYeq3KBpump
LUNA_X_LINK=https://x.com/your_community
LUNA_TO_SOL_RATE=0.00009
```

**คำอธิบาย:**
- `LUNA_BUY_LINK`: ลิงก์สำหรับซื้อ token (ใช้ในปุ่ม "Buy Luna")
- `LUNA_X_LINK`: ลิงก์ X/Twitter community (ใช้ในปุ่ม "Join Community")
- `LUNA_TO_SOL_RATE`: อัตราแลกเปลี่ยน Luna/SOL (fallback ถ้าไม่สามารถดึงราคาจาก API)

---

### 5. Cost Saving Features (แนะนำให้ปิด)

```env
IDLE_MONOLOGUE_ENABLED=false
AMBIENT_MURMUR_ENABLED=false
```

**คำอธิบาย:** ปิดฟีเจอร์ที่เปลือง API calls เพื่อประหยัดค่าใช้จ่าย

---

### 6. Security Configuration

```env
ENABLE_CSRF=true
ADMIN_SECRET=your_secure_secret_here
```

**คำอธิบาย:**
- `ENABLE_CSRF`: เปิดใช้งาน CSRF protection
- `ADMIN_SECRET`: Secret key สำหรับ admin endpoints

---

## 📝 Optional Variables (ไม่จำเป็น)

### 1. VTube Studio (ถ้าใช้ VTS)

```env
VTS_ENABLED=false
VTS_HOST=127.0.0.1
VTS_PORT=8001
VTS_AUTH_TOKEN=your_vts_auth_token_here
```

**หมายเหตุ:** 
- ถ้าไม่ใช้ VTS → ตั้ง `VTS_ENABLED=false`
- ถ้าใช้ VTS → ต้องรัน `node scripts/vts/vts-auth.cjs` เพื่อขอ token

---

### 2. TTS / ElevenLabs (ถ้าใช้ TTS)

```env
TTS_ENABLED=false
ELEVEN_KEY=your_elevenlabs_api_key_here
ELEVEN_VOICE_NORMAL=21m00Tcm4TlvDq8ikWAM
ELEVEN_VOICE_SOFT=21m00Tcm4TlvDq8ikWAM
ELEVEN_VOICE_PASSION=21m00Tcm4TlvDq8ikWAM
```

**หมายเหตุ:** 
- ถ้าไม่ใช้ TTS → ตั้ง `TTS_ENABLED=false`
- ถ้าใช้ TTS → ต้องมี ElevenLabs API key

---

### 3. Betting & Rewards (ถ้าใช้ RPS Betting)

```env
BETTING_FEE_WALLET=your_fee_wallet_address_here
REWARD_DISTRIBUTION_WALLET=your_reward_wallet_address_here
REWARD_SENDER_PRIVATE_KEY=your_base58_private_key_here
```

**หมายเหตุ:** 
- จำเป็นเฉพาะถ้าใช้ระบบ Betting และ Rewards
- `REWARD_SENDER_PRIVATE_KEY`: ใช้สำหรับส่ง SOL อัตโนมัติ (⚠️ เก็บเป็นความลับ!)

---

### 4. Deposit System (ถ้าใช้ Deposit)

```env
DEPOSIT_ESCROW_WALLET=your_escrow_wallet_address_here
DEPOSIT_ESCROW_PRIVATE_KEY=your_base58_private_key_here
DEPOSIT_BURN_WALLET=1nc1nerator11111111111111111111111111111111
DEPOSIT_BASE_MIN_USD=10
DEPOSIT_MIN_USD_FLOOR=5
DEPOSIT_MIN_USD_CAP=30
DEPOSIT_DYNAMIC_CACHE_MS=300000
```

**หมายเหตุ:** 
- จำเป็นเฉพาะถ้าใช้ระบบ Deposit
- `DEPOSIT_ESCROW_PRIVATE_KEY`: ใช้สำหรับส่ง Luna tokens กลับให้ผู้ใช้ (⚠️ เก็บเป็นความลับ!)

---

### 5. Rate Limiting

```env
RATE_LIMIT_MAX=30
```

**คำอธิบาย:** จำนวน request สูงสุดต่อ user ต่อนาที (default: 30)

---

### 6. Backup Configuration

```env
AUTO_BACKUP_ENABLED=true
BACKUP_INTERVAL=3600000
MAX_BACKUPS=10
```

**คำอธิบาย:**
- `AUTO_BACKUP_ENABLED`: เปิดใช้งาน auto-backup
- `BACKUP_INTERVAL`: ระยะเวลาระหว่าง backup (milliseconds)
- `MAX_BACKUPS`: จำนวน backup ที่เก็บไว้

---

### 7. Other Optional

```env
LUNA_WALLET=your_solana_wallet_address_here
AXIOM_API_KEY=your_axiom_api_key_here
PUMPFUN_API_URL=your_pumpfun_api_url_here
PURCHASE_SECRET=your_purchase_secret_here
```

---

## 🎯 Quick Setup Checklist

### สำหรับ Production (ขั้นต่ำ)

- [ ] `PORT=8787` (หรือลบออก)
- [ ] `NODE_ENV=production`
- [ ] `OPENAI_KEY` หรือ `OPENROUTER_KEY` (อย่างใดอย่างหนึ่ง)
- [ ] `SIMPLE_MODEL` และ `COMPLEX_MODEL`
- [ ] `LUNA_TOKEN_MINT` (จำเป็นสำหรับ RPS Game)
- [ ] `CORS_ORIGINS=*`
- [ ] `VTS_ENABLED=false` (ถ้าไม่ใช้ VTS)
- [ ] `TTS_ENABLED=false` (ถ้าไม่ใช้ TTS)
- [ ] `IDLE_MONOLOGUE_ENABLED=false`
- [ ] `AMBIENT_MURMUR_ENABLED=false`

### สำหรับ Production (แนะนำ)

เพิ่มเติมจากขั้นต่ำ:
- [ ] `SOLANA_RPC_URL` (ถ้า public RPC rate limit)
- [ ] `LUNA_BUY_LINK`
- [ ] `LUNA_X_LINK`
- [ ] `LOG_LEVEL=info`
- [ ] `ENABLE_CSRF=true`
- [ ] `ADMIN_SECRET` (ถ้าใช้ admin endpoints)

### สำหรับ RPS Betting & Rewards

- [ ] `BETTING_FEE_WALLET`
- [ ] `REWARD_DISTRIBUTION_WALLET`
- [ ] `REWARD_SENDER_PRIVATE_KEY` (ถ้าต้องการส่ง SOL อัตโนมัติ)

### สำหรับ Deposit System

- [ ] `DEPOSIT_ESCROW_WALLET`
- [ ] `DEPOSIT_ESCROW_PRIVATE_KEY`
- [ ] `DEPOSIT_BURN_WALLET`
- [ ] `DEPOSIT_BASE_MIN_USD=10`
- [ ] `DEPOSIT_MIN_USD_FLOOR=5`
- [ ] `DEPOSIT_MIN_USD_CAP=30`

---

## 📋 ตัวอย่าง Environment Variables สำหรับ Production

### Minimal Setup (ขั้นต่ำ)

```env
# Server
PORT=8787
NODE_ENV=production

# AI
OPENROUTER_KEY=sk-or-v1-...
SIMPLE_MODEL=gpt-4o-mini
COMPLEX_MODEL=anthropic/claude-3-opus
FALLBACK_MODEL=gpt-4o-mini

# Luna Token
LUNA_TOKEN_MINT=CbB4ivri6wLfqx4NwrWY3ArD7mXv1e91HeYeq3KBpump
LUNA_BUY_LINK=https://pump.fun/CbB4ivri6wLfqx4NwrWY3ArD7mXv1e91HeYeq3KBpump
LUNA_X_LINK=https://x.com/your_community

# CORS & Security
CORS_ORIGINS=*
ENABLE_CSRF=true

# Cost Saving
IDLE_MONOLOGUE_ENABLED=false
AMBIENT_MURMUR_ENABLED=false
VTS_ENABLED=false
TTS_ENABLED=false

# Logging
LOG_LEVEL=info
LOG_CONSOLE=true
```

### Full Setup (ครบถ้วน)

```env
# Server
PORT=8787
NODE_ENV=production

# AI
OPENROUTER_KEY=sk-or-v1-...
SIMPLE_MODEL=gpt-4o-mini
COMPLEX_MODEL=anthropic/claude-3-opus
FALLBACK_MODEL=gpt-4o-mini

# Luna Token
LUNA_TOKEN_MINT=CbB4ivri6wLfqx4NwrWY3ArD7mXv1e91HeYeq3KBpump
LUNA_BUY_LINK=https://pump.fun/CbB4ivri6wLfqx4NwrWY3ArD7mXv1e91HeYeq3KBpump
LUNA_X_LINK=https://x.com/your_community
LUNA_TO_SOL_RATE=0.00009

# Solana
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com

# CORS & Security
CORS_ORIGINS=*
ENABLE_CSRF=true
ADMIN_SECRET=your_secure_secret_here

# Cost Saving
IDLE_MONOLOGUE_ENABLED=false
AMBIENT_MURMUR_ENABLED=false
VTS_ENABLED=false
TTS_ENABLED=false

# Logging
LOG_LEVEL=info
LOG_CONSOLE=true
LOG_VERBOSE=false

# Betting & Rewards
BETTING_FEE_WALLET=your_fee_wallet_address_here
REWARD_DISTRIBUTION_WALLET=your_reward_wallet_address_here
REWARD_SENDER_PRIVATE_KEY=your_base58_private_key_here

# Deposit
DEPOSIT_ESCROW_WALLET=your_escrow_wallet_address_here
DEPOSIT_ESCROW_PRIVATE_KEY=your_base58_private_key_here
DEPOSIT_BURN_WALLET=1nc1nerator11111111111111111111111111111111
DEPOSIT_BASE_MIN_USD=10
DEPOSIT_MIN_USD_FLOOR=5
DEPOSIT_MIN_USD_CAP=30
DEPOSIT_DYNAMIC_CACHE_MS=300000

# Backup
AUTO_BACKUP_ENABLED=true
BACKUP_INTERVAL=3600000
MAX_BACKUPS=10
```

---

## 🔐 Security Notes

### Variables ที่ควรเป็น "Secret" Type

ใน Northflank ควรตั้ง Type เป็น **"Secret"** สำหรับ:
- `OPENAI_KEY`
- `OPENROUTER_KEY`
- `ELEVEN_KEY`
- `VTS_AUTH_TOKEN`
- `REWARD_SENDER_PRIVATE_KEY`
- `DEPOSIT_ESCROW_PRIVATE_KEY`
- `ADMIN_SECRET`
- `PURCHASE_SECRET`
- `AXIOM_API_KEY`

### Variables ที่เป็น "Plain" Type

- `PORT`
- `NODE_ENV`
- `LUNA_TOKEN_MINT`
- `SOLANA_RPC_URL`
- `CORS_ORIGINS`
- และอื่นๆ ที่ไม่ใช่ข้อมูลลับ

---

## 🆘 Troubleshooting

### ปัญหา: "Missing AI API key"

**วิธีแก้:**
- เพิ่ม `OPENAI_KEY` หรือ `OPENROUTER_KEY` (อย่างใดอย่างหนึ่ง)

### ปัญหา: "LUNA_TOKEN_MINT not set"

**วิธีแก้:**
- เพิ่ม `LUNA_TOKEN_MINT` พร้อม mint address ที่ถูกต้อง

### ปัญหา: "Configuration errors"

**วิธีแก้:**
- ดู Logs เพื่อดูว่า missing variable อะไร
- เพิ่ม missing variables
- Restart service

---

## 📚 เอกสารเพิ่มเติม

- [ADD_ENV_VARIABLES.md](./ADD_ENV_VARIABLES.md) - วิธีเพิ่ม Environment Variables ใน Northflank
- [NORTHFLANK_DEPLOYMENT.md](./NORTHFLANK_DEPLOYMENT.md) - คู่มือ deployment
- [env.example](../../env.example) - Template สำหรับ environment variables

---

**Made with ❤️ for Luna AI Streamer**













