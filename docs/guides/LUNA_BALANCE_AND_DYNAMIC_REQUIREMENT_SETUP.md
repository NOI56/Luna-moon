# คู่มือตั้งค่าระบบเช็ค Luna Balance และ Dynamic Minimum Requirement
## สำหรับ Luna AI v10

---

## 🔍 สรุปปัญหา

ระบบเช็ค Luna balance และ Dynamic Minimum Requirement **ไม่ทำงาน** เพราะ:
- ❌ **`LUNA_TOKEN_MINT`** ไม่ได้ตั้งค่าใน Environment Variables
- ⚠️ `SOLANA_RPC_URL` อาจจะต้องตั้งค่า (ถ้า public RPC rate limit)

---

## ✅ สิ่งที่ต้องตั้งค่า

### 1. **LUNA_TOKEN_MINT** (จำเป็น!)

**Environment Variable:**
```
LUNA_TOKEN_MINT=CbB4ivri6wLfqx4NwrWY3ArD7mXv1e91HeYeq3KBpump
```

**วิธีหา Token Mint Address:**
1. ไปที่ https://pump.fun
2. ค้นหา token ของคุณ
3. คัดลอก **Mint Address** (จะเป็น string ยาวๆ เช่น `CbB4ivri6wLfqx4NwrWY3ArD7mXv1e91HeYeq3KBpump`)

**ตัวอย่าง:**
```
LUNA_TOKEN_MINT=CbB4ivri6wLfqx4NwrWY3ArD7mXv1e91HeYeq3KBpump
```

### 2. **SOLANA_RPC_URL** (Optional แต่แนะนำ)

**Default:**
```
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
```

**ถ้า Public RPC Rate Limit:**
- ใช้ QuickNode: `https://your-endpoint.quicknode.com/...`
- ใช้ Helius: `https://mainnet.helius-rpc.com/?api-key=YOUR_KEY`
- ใช้ Alchemy: `https://solana-mainnet.g.alchemy.com/v2/YOUR_KEY`

**ตัวอย่าง:**
```
SOLANA_RPC_URL=https://your-endpoint.quicknode.com/abc123
```

---

## ❌ ไม่ต้องเพิ่ม API Key

### DexScreener API
- ✅ **ไม่ต้องใช้ API key** - เป็น Public API
- URL: `https://api.dexscreener.com/latest/dex/tokens/{tokenMint}`
- ใช้สำหรับดึงราคา Luna token

### Jupiter API
- ✅ **ไม่ต้องใช้ API key** - เป็น Public API
- URL: `https://price.jup.ag/v4/price?ids={tokenMint}`
- ใช้สำหรับดึงราคา (fallback)

### Solana RPC (Public)
- ✅ **ไม่ต้องใช้ API key** - Public RPC
- URL: `https://api.mainnet-beta.solana.com`
- ใช้สำหรับเช็ค balance

---

## 🔧 วิธีตั้งค่าใน Northflank

### ขั้นตอนที่ 1: ไปที่ Environment Variables

1. ไปที่ Northflank Dashboard:
   ```
   https://app.northflank.com/t/lunamoons-team/project/luna/services/lunamoon
   ```

2. คลิกแท็บ **"Run"** → **"Environment"**

### ขั้นตอนที่ 2: เพิ่ม Environment Variables

#### 1. เพิ่ม `LUNA_TOKEN_MINT`

1. คลิก **"Add Variable"**
2. **Name:** `LUNA_TOKEN_MINT`
3. **Value:** `CbB4ivri6wLfqx4NwrWY3ArD7mXv1e91HeYeq3KBpump` (ใส่ mint address ของคุณ)
4. **Type:** `Plain` (ไม่ใช่ Secret)
5. คลิก **"Save"**

#### 2. เพิ่ม `SOLANA_RPC_URL` (Optional)

1. คลิก **"Add Variable"**
2. **Name:** `SOLANA_RPC_URL`
3. **Value:** 
   - `https://api.mainnet-beta.solana.com` (public, free)
   - หรือ RPC URL ของคุณ (ถ้ามี rate limit)
4. **Type:** `Plain`
5. คลิก **"Save"**

### ขั้นตอนที่ 3: Restart Service

1. ไปที่ Service Overview
2. คลิก **"Restart"** หรือ **"Redeploy"**
3. รอให้ restart เสร็จ

---

## ✅ Checklist

- [ ] `LUNA_TOKEN_MINT` ตั้งค่าแล้ว (ใส่ mint address ที่ถูกต้อง)
- [ ] `SOLANA_RPC_URL` ตั้งค่าแล้ว (optional)
- [ ] Service restart แล้ว
- [ ] ตรวจสอบ Logs ว่าไม่มี error

---

## 🔍 ตรวจสอบว่าระบบทำงาน

### 1. ตรวจสอบ Logs

ไปที่ **"Observability"** → **"Logs"** และดูว่า:
- ✅ ไม่มี error: `"LUNA_TOKEN_MINT not set"`
- ✅ ไม่มี error: `"Invalid LUNA_TOKEN_MINT"`
- ✅ เห็น log: `"Fetched Luna price from DexScreener: ..."`

### 2. ทดสอบ API Endpoint

```bash
# ทดสอบ Dynamic Requirement
curl https://site--lunamoon--xwnj5s5p9mkb.code.run/luna/dynamic-requirement?context=deposit

# ทดสอบ Balance Check
curl "https://site--lunamoon--xwnj5s5p9mkb.code.run/luna/rps/balance?wallet=YOUR_WALLET_ADDRESS"
```

**Expected Response:**
```json
{
  "ok": true,
  "balance": 1234567,
  "minRequired": 150000,
  "canPlay": true
}
```

### 3. ทดสอบใน Frontend

1. เปิด `/rps_deposit.html`
2. เชื่อมต่อ wallet
3. ตรวจสอบว่า **Dynamic Minimum Requirement** แสดง (เช่น "You need at least 150,000 Luna")
4. ตรวจสอบว่า **Balance** แสดงถูกต้อง

---

## ⚠️ Troubleshooting

### ปัญหา 1: "LUNA_TOKEN_MINT not set"

**สาเหตุ:** Environment variable ไม่ได้ตั้งค่า

**วิธีแก้:**
1. ไปที่ Environment Variables
2. เพิ่ม `LUNA_TOKEN_MINT` พร้อม mint address ที่ถูกต้อง
3. Restart service

### ปัญหา 2: "Invalid LUNA_TOKEN_MINT"

**สาเหตุ:** Mint address ไม่ถูกต้อง

**วิธีแก้:**
1. ตรวจสอบว่า mint address ถูกต้อง (ต้องเป็น Solana address ที่ valid)
2. ตรวจสอบว่าไม่มี space หรือ special characters
3. ตรวจสอบว่า mint address ตรงกับ token ของคุณ

### ปัญหา 3: "Failed to fetch DexScreener data"

**สาเหตุ:** 
- DexScreener API rate limit
- Mint address ไม่มีใน DexScreener
- Network error

**วิธีแก้:**
1. รอสักครู่แล้วลองใหม่ (rate limit)
2. ตรวจสอบว่า token มี liquidity บน DEX
3. ระบบจะใช้ fallback amount อัตโนมัติ

### ปัญหา 4: "RPC rate limited"

**สาเหตุ:** Public Solana RPC rate limit

**วิธีแก้:**
1. ตั้งค่า `SOLANA_RPC_URL` เป็น RPC ของคุณเอง (QuickNode, Helius, etc.)
2. หรือรอสักครู่แล้วลองใหม่

### ปัญหา 5: Balance แสดง 0 แต่มี Luna

**สาเหตุ:** 
- Mint address ไม่ตรงกับ token ที่ wallet ถือ
- RPC error

**วิธีแก้:**
1. ตรวจสอบว่า `LUNA_TOKEN_MINT` ตรงกับ token ที่ wallet ถือ
2. ตรวจสอบ Logs ว่ามี RPC error หรือไม่
3. ลอง reconnect wallet

---

## 📋 Environment Variables ที่เกี่ยวข้อง

### Required
```env
LUNA_TOKEN_MINT=CbB4ivri6wLfqx4NwrWY3ArD7mXv1e91HeYeq3KBpump
```

### Optional (แต่แนะนำ)
```env
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
```

### Optional (สำหรับ Dynamic Pricing)
```env
DEPOSIT_BASE_MIN_USD=10
DEPOSIT_MIN_USD_FLOOR=5
DEPOSIT_MIN_USD_CAP=30
DEPOSIT_DYNAMIC_CACHE_MS=300000
```

---

## 🎯 สรุป

### ✅ ต้องทำ:
1. **ตั้งค่า `LUNA_TOKEN_MINT`** ใน Environment Variables
2. **Restart service**

### ❌ ไม่ต้องทำ:
- ❌ ไม่ต้องเพิ่ม API key (DexScreener, Jupiter เป็น public API)
- ❌ ไม่ต้องตั้งค่า `SOLANA_RPC_URL` (ถ้าใช้ public RPC)

### 🔍 ตรวจสอบ:
- ดู Logs ว่าไม่มี error
- ทดสอบ API endpoints
- ทดสอบใน Frontend

---

**Made with ❤️ for Luna AI Streamer**












