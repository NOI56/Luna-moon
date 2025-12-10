# คู่มือการเพิ่ม Environment Variables ใน Northflank
## สำหรับ Luna AI v10

---

## 📋 วิธีเพิ่ม Environment Variables ใน Northflank

### ขั้นตอนที่ 1: เข้าไปที่ Environment Variables Settings

1. **ไปที่ Northflank Dashboard:**
   ```
   https://app.northflank.com/t/lunamoons-team/project/luna/services/lunamoon
   ```

2. **คลิกแท็บ "Run" (หรือ "Deploy")**

3. **คลิก "Environment" หรือ "Environment Variables"**

   หรือ

   - ไปที่เมนูด้านซ้าย → คลิก "Run" → "Environment"

---

## ➕ วิธีเพิ่ม Variable ใหม่

### วิธีที่ 1: เพิ่มทีละตัว (แนะนำ)

1. **คลิกปุ่ม "Add Variable" หรือ "+"**

2. **กรอกข้อมูล:**
   - **Name:** ชื่อตัวแปร (เช่น `PORT`, `OPENAI_KEY`)
   - **Value:** ค่าของตัวแปร (เช่น `8787`, `sk-...`)
   - **Type:** เลือก "Plain" (ปกติ) หรือ "Secret" (สำหรับข้อมูลลับ เช่น API keys)

3. **คลิก "Save" หรือ "Add"**

4. **ทำซ้ำสำหรับตัวแปรอื่นๆ**

### วิธีที่ 2: Import จากไฟล์ (ถ้ามี)

1. **คลิก "Import" หรือ "Import from file"**

2. **เลือกไฟล์ `.env` หรือ `.env.example`**

3. **ตรวจสอบและแก้ไขค่าตามต้องการ**

4. **คลิก "Save" หรือ "Import"**

---

## 🔐 Environment Variables ที่ควรเพิ่ม

### ⚠️ Required (จำเป็นต้องมี)

#### 1. Server Configuration
```
PORT=8787
NODE_ENV=production
```

#### 2. AI Configuration (เลือกอย่างใดอย่างหนึ่ง)
```
# ตัวเลือกที่ 1: ใช้ OpenAI API
OPENAI_KEY=sk-...

# ตัวเลือกที่ 2: ใช้ OpenRouter (แนะนำ)
OPENROUTER_KEY=sk-or-...
```

#### 3. Model Configuration
```
SIMPLE_MODEL=gpt-4o-mini
COMPLEX_MODEL=anthropic/claude-3-opus
FALLBACK_MODEL=gpt-4o-mini
```

---

### 📝 Optional (แนะนำให้เพิ่ม)

#### 1. CORS Configuration
```
CORS_ORIGINS=*
```

#### 2. Logging Configuration
```
LOG_LEVEL=info
LOG_CONSOLE=true
LOG_VERBOSE=false
```

#### 3. VTube Studio (ถ้าใช้)
```
VTS_ENABLED=false
VTS_HOST=127.0.0.1
VTS_PORT=8001
VTS_AUTH_TOKEN=your_vts_auth_token_here
```

#### 4. TTS / ElevenLabs (ถ้าใช้)
```
TTS_ENABLED=false
ELEVEN_KEY=your_elevenlabs_api_key_here
ELEVEN_VOICE_NORMAL=21m00Tcm4TlvDq8ikWAM
ELEVEN_VOICE_SOFT=21m00Tcm4TlvDq8ikWAM
ELEVEN_VOICE_PASSION=21m00Tcm4TlvDq8ikWAM
```

#### 5. Solana Configuration
```
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
LUNA_WALLET=your_solana_wallet_address_here
LUNA_TOKEN_MINT=CbB4ivri6wLfqx4NwrWY3ArD7mXv1e91HeYeq3KBpump
LUNA_BUY_LINK=https://pump.fun/CbB4ivri6wLfqx4NwrWY3ArD7mXv1e91HeYeq3KBpump
LUNA_X_LINK=https://x.com/your_community
LUNA_TO_SOL_RATE=0.00009
```

#### 6. Betting & Rewards Configuration
```
BETTING_FEE_WALLET=your_fee_wallet_address_here
REWARD_DISTRIBUTION_WALLET=your_reward_wallet_address_here
REWARD_SENDER_PRIVATE_KEY=your_base58_private_key_here
DEPOSIT_ESCROW_WALLET=your_escrow_wallet_address_here
DEPOSIT_ESCROW_PRIVATE_KEY=your_base58_private_key_here
DEPOSIT_BURN_WALLET=1nc1nerator11111111111111111111111111111111
```

#### 7. Cost Saving Features (แนะนำให้ปิด)
```
IDLE_MONOLOGUE_ENABLED=false
AMBIENT_MURMUR_ENABLED=false
```

#### 8. Backup Configuration
```
AUTO_BACKUP_ENABLED=true
BACKUP_INTERVAL=3600000
MAX_BACKUPS=10
```

#### 9. Admin Configuration
```
ADMIN_SECRET=your_admin_secret_here
ENABLE_CSRF=true
```

#### 10. Deposit Dynamic Pricing
```
DEPOSIT_BASE_MIN_USD=10
DEPOSIT_MIN_USD_FLOOR=5
DEPOSIT_MIN_USD_CAP=30
DEPOSIT_DYNAMIC_CACHE_MS=300000
```

---

## 🔒 Security: Secret Variables

สำหรับข้อมูลลับ (API keys, Private keys) ควรตั้งเป็น **"Secret"**:

1. **เมื่อเพิ่ม Variable:**
   - เลือก Type: **"Secret"** แทน "Plain"
   - ค่าจะถูกเข้ารหัสและไม่แสดงใน logs

2. **ตัวอย่าง Variables ที่ควรเป็น Secret:**
   - `OPENAI_KEY`
   - `OPENROUTER_KEY`
   - `ELEVEN_KEY`
   - `VTS_AUTH_TOKEN`
   - `REWARD_SENDER_PRIVATE_KEY`
   - `DEPOSIT_ESCROW_PRIVATE_KEY`
   - `ADMIN_SECRET`

---

## ✏️ วิธีแก้ไข Variable ที่มีอยู่

1. **ไปที่ Environment Variables**

2. **คลิกที่ Variable ที่ต้องการแก้ไข**

3. **แก้ไข Value**

4. **คลิก "Save"**

5. **Service จะ restart อัตโนมัติ** (ถ้าเปิด auto-restart)

---

## 🗑️ วิธีลบ Variable

1. **ไปที่ Environment Variables**

2. **คลิกที่ Variable ที่ต้องการลบ**

3. **คลิก "Delete" หรือ "Remove"**

4. **ยืนยันการลบ**

5. **Service จะ restart อัตโนมัติ**

---

## 🔄 หลังจากเพิ่ม/แก้ไข Variables

### วิธีที่ 1: Auto-Restart (แนะนำ)

- Northflank จะ restart service อัตโนมัติเมื่อแก้ไข environment variables
- รอประมาณ 1-2 นาที

### วิธีที่ 2: Manual Restart

1. **ไปที่ Service Overview**

2. **คลิก "Restart" หรือ "Redeploy"**

3. **รอให้ restart เสร็จ**

---

## ✅ Checklist: ตรวจสอบ Variables

หลังจากเพิ่ม variables แล้ว ตรวจสอบว่า:

- [ ] `PORT` ตั้งค่าแล้ว (หรือลบออกให้ Northflank auto-assign)
- [ ] `NODE_ENV=production` ตั้งค่าแล้ว
- [ ] `OPENAI_KEY` หรือ `OPENROUTER_KEY` ตั้งค่าแล้ว (อย่างใดอย่างหนึ่ง)
- [ ] `SIMPLE_MODEL` และ `COMPLEX_MODEL` ตั้งค่าแล้ว
- [ ] `CORS_ORIGINS` ตั้งค่าแล้ว (แนะนำ: `*`)
- [ ] Variables ที่เป็น Secret ตั้งเป็น Type: "Secret" แล้ว
- [ ] ตรวจสอบ Logs ว่าไม่มี error เกี่ยวกับ missing variables

---

## 🆘 Troubleshooting

### ปัญหา: Service ไม่ restart หลังเพิ่ม variables

**วิธีแก้:**
1. ไปที่ Service Overview
2. คลิก "Restart" หรือ "Redeploy"
3. ตรวจสอบ Logs ว่า restart สำเร็จ

### ปัญหา: Variables ไม่ถูกใช้

**วิธีแก้:**
1. ตรวจสอบว่า Variable Name ถูกต้อง (case-sensitive)
2. ตรวจสอบว่าไม่มี space หรือ special characters
3. Restart service
4. ตรวจสอบ Logs

### ปัญหา: "Configuration errors" ใน Logs

**วิธีแก้:**
1. ดู error message ใน Logs ว่า missing variable อะไร
2. เพิ่ม missing variable
3. Restart service

---

## 📚 เอกสารเพิ่มเติม

- [env.example](../../env.example) - Template สำหรับ environment variables
- [NORTHFLANK_DEPLOYMENT.md](./NORTHFLANK_DEPLOYMENT.md) - คู่มือ deployment
- [TROUBLESHOOTING_DEPLOYMENT.md](./TROUBLESHOOTING_DEPLOYMENT.md) - แก้ไขปัญหา

---

**Made with ❤️ for Luna AI Streamer**












