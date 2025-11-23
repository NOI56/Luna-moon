# 🔧 แก้ไข Error: "Non-base58 character"

## ❌ ปัญหา

**Error:** `Error checking balance: Non-base58 character`

**สาเหตุ:**
- ค่า `LUNA_TOKEN_MINT` ใน `.env` ยังเป็น placeholder text
- ไม่ใช่ mint address จริงจาก Pump.fun

---

## ✅ วิธีแก้ไข

### ขั้นตอนที่ 1: ตรวจสอบค่าใน `.env`

```bash
# ตรวจสอบค่า LUNA_TOKEN_MINT
Get-Content .env | Select-String "LUNA_TOKEN_MINT"
```

**ถ้าเห็น:**
```
LUNA_TOKEN_MINT=your_token_mint_address_from_pumpfun_here
```

**หมายความว่า:** ยังไม่ได้ใส่ mint address จริง

---

### ขั้นตอนที่ 2: ใส่ Mint Address จริง

**1. สร้าง Token บน Pump.fun:**
   - ไปที่ [pump.fun](https://pump.fun)
   - สร้าง token
   - คัดลอก Token Mint Address

**2. แก้ไข `.env`:**
   ```env
   # แก้ไขจาก
   LUNA_TOKEN_MINT=your_token_mint_address_from_pumpfun_here
   
   # เป็น mint address จริง (ตัวอย่าง)
   LUNA_TOKEN_MINT=CbB4ivri6wLfqx4NwrWY3ArD7mXv1e91HeYeq3KBpump
   ```

**⚠️ หมายเหตุ:** แทน `CbB4ivri6wLfqx4NwrWY3ArD7mXv1e91HeYeq3KBpump` ด้วย mint address จริงของคุณ

---

### ขั้นตอนที่ 3: Restart Server

```bash
# หยุด server (Ctrl+C)
# รันใหม่
node index.js
```

---

## 🔍 วิธีตรวจสอบว่า Mint Address ถูกต้อง

### 1. Format ที่ถูกต้อง

**Mint Address ควรเป็น:**
- Base58 format (ตัวอักษรและตัวเลข)
- ความยาวประมาณ 32-44 ตัวอักษร
- ตัวอย่าง: `CbB4ivri6wLfqx4NwrWY3ArD7mXv1e91HeYeq3KBpump`

### 2. ตรวจสอบบน Solana Explorer

**ไปที่:** https://solscan.io/token/MINT_ADDRESS

**ถ้าเจอ token → ถูกต้อง**  
**ถ้าไม่เจอ → ผิด**

---

## ⚠️ ข้อผิดพลาดที่พบบ่อย

### 1. ใช้ Placeholder Text

**❌ ผิด:**
```env
LUNA_TOKEN_MINT=your_token_mint_address_from_pumpfun_here
```

**✅ ถูก:**
```env
LUNA_TOKEN_MINT=CbB4ivri6wLfqx4NwrWY3ArD7mXv1e91HeYeq3KBpump
```

---

### 2. มี Space หรือ Newline

**❌ ผิด:**
```env
LUNA_TOKEN_MINT= CbB4ivri6wLfqx4NwrWY3ArD7mXv1e91HeYeq3KBpump 
```

**✅ ถูก:**
```env
LUNA_TOKEN_MINT=CbB4ivri6wLfqx4NwrWY3ArD7mXv1e91HeYeq3KBpump
```

---

### 3. ใช้ Wallet Address แทน Mint Address

**❌ ผิด:**
```env
LUNA_TOKEN_MINT=HyQ59jGd...iK42xrKx  # นี่คือ wallet address
```

**✅ ถูก:**
```env
LUNA_TOKEN_MINT=CbB4ivri6wLfqx4NwrWY3ArD7mXv1e91HeYeq3KBpump  # นี่คือ token mint address
```

---

## 📋 Checklist

- [ ] ตรวจสอบค่า `LUNA_TOKEN_MINT` ใน `.env`
- [ ] แก้ไขเป็น mint address จริงจาก Pump.fun
- [ ] ตรวจสอบว่าไม่มี space หรือ newline
- [ ] Restart server
- [ ] ทดสอบว่า balance ทำงาน

---

## 🎯 สรุป

**Error "Non-base58 character" = ค่าใน `.env` ยังเป็น placeholder**

**แก้ไข:**
1. ใส่ mint address จริงจาก Pump.fun
2. Restart server
3. ทดสอบใหม่

---

**แก้ไขแล้วควรทำงานได้!** ✅

