# 🔍 ทำไมรู้ Balance ได้แม้ยังไม่ได้ใส่ LUNA_TOKEN_MINT ใน .env?

## ❓ คำถาม

**"ยังไม่ใส่ key ใน env เลยทำไมรู้ว่ามี 3.52M"**

---

## ✅ คำตอบ

**เพราะโค้ด hardcode mint address ไว้!**

### 1. ใน Backend (`index.js`)

```javascript
// บรรทัด 2729
const mint = req.query.mint || "CbB4ivri6wLfqx4NwrWY3ArD7mXv1e91HeYeq3KBpump";
```

**หมายความว่า:**
- ถ้ามี `mint` ใน query → ใช้ค่าใน query
- ถ้าไม่มี → ใช้ default `"CbB4ivri6wLfqx4NwrWY3ArD7mXv1e91HeYeq3KBpump"`

**ดังนั้น:** แม้ยังไม่ได้ใส่ `LUNA_TOKEN_MINT` ใน `.env` ระบบก็ยังใช้ default mint address ได้

---

### 2. ใน Frontend (HTML files)

```javascript
// rps_game.html, rps_betting.html, rps_vs_luna.html
const LUNA_TOKEN_MINT = "CbB4ivri6wLfqx4NwrWY3ArD7mXv1e91HeYeq3KBpump";
```

**หมายความว่า:**
- Frontend hardcode mint address ไว้ในโค้ด
- ไม่ได้อ่านจาก `.env` (เพราะ frontend อ่าน `.env` ไม่ได้)

---

## 🔧 วิธีแก้ไข

### 1. Backend - อ่านจาก `.env`

**แก้ไขแล้ว:**
```javascript
// ใช้ LUNA_TOKEN_MINT จาก .env หรือ query parameter หรือ default
const mint = req.query.mint || process.env.LUNA_TOKEN_MINT || "CbB4ivri6wLfqx4NwrWY3ArD7mXv1e91HeYeq3KBpump";
```

**ตอนนี้:**
- ถ้ามี `LUNA_TOKEN_MINT` ใน `.env` → ใช้ค่าจาก `.env`
- ถ้าไม่มี → ใช้ default

---

### 2. Frontend - อ่านจาก Backend API

**วิธีที่ 1: ส่ง mint address จาก backend**

```javascript
// ใน HTML
// เรียก API เพื่อ get mint address
fetch('/luna/rps/token-mint')
  .then(res => res.json())
  .then(data => {
    const LUNA_TOKEN_MINT = data.mint;
  });
```

**วิธีที่ 2: ใช้ query parameter**

```javascript
// ส่ง mint ใน query parameter
fetch(`/luna/rps/balance?wallet=${wallet}&mint=${LUNA_TOKEN_MINT}`)
```

---

## 📋 สรุป

### ทำไมรู้ Balance ได้?

**เพราะ:**
1. ✅ Backend hardcode default mint address ไว้
2. ✅ Frontend hardcode mint address ไว้ในโค้ด
3. ✅ ระบบใช้ default mint address `"CbB4ivri6wLfqx4NwrWY3ArD7mXv1e91HeYeq3KBpump"` ตรวจสอบ balance

### ควรทำอย่างไร?

**แนะนำ:**
1. ✅ ใส่ `LUNA_TOKEN_MINT` ใน `.env` (แก้ไขแล้ว - backend อ่านจาก `.env` แล้ว)
2. ⚠️ Frontend ยัง hardcode อยู่ (ต้องแก้ไขถ้าต้องการใช้ mint address จาก `.env`)

---

## 🎯 ข้อแนะนำ

### ถ้าต้องการใช้ Mint Address จาก `.env`:

1. **Backend:** ✅ แก้ไขแล้ว (อ่านจาก `.env` แล้ว)
2. **Frontend:** ⚠️ ยัง hardcode อยู่
   - ต้องแก้ไข HTML files
   - หรือใช้ API endpoint เพื่อ get mint address

### ถ้าใช้ Default Mint Address:

- ✅ ไม่ต้องทำอะไร
- ✅ ระบบจะใช้ `"CbB4ivri6wLfqx4NwrWY3ArD7mXv1e91HeYeq3KBpump"` อัตโนมัติ

---

**สรุป: รู้ Balance ได้เพราะ hardcode mint address ไว้ในโค้ด!** 🔍

