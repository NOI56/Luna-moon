# 🪰 Deploy ไป Fly.io - Step by Step

## ✅ สิ่งที่ต้องทำ

### ขั้นตอนที่ 1: Login Fly.io

```powershell
# เพิ่ม Fly CLI ไป PATH
$env:PATH += ";C:\Users\stopp\.fly\bin"

# Login Fly.io
flyctl auth login
```

**หมายเหตุ:** 
- จะเปิด browser ให้ login
- Login ด้วย GitHub หรือ Email

---

### ขั้นตอนที่ 2: Launch App

```powershell
# Launch app (สร้าง fly.toml)
flyctl launch
```

**คำถามที่ Fly จะถาม:**
- App name? → กด Enter (ใช้ชื่อ default) หรือพิมพ์ชื่อเอง
- Select region: → เลือก `sin` (Singapore - ใกล้ไทยที่สุด)
- Setup PostgreSQL? → `n` (ไม่ต้อง)
- Setup Redis? → `n` (ไม่ต้อง)

---

### ขั้นตอนที่ 3: ตั้งค่า Environment Variables

```powershell
# ตั้งค่า OPENROUTER_KEY
flyctl secrets set OPENROUTER_KEY=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
```

---

### ขั้นตอนที่ 4: Deploy

```powershell
# Deploy app
flyctl deploy
```

**ใช้เวลา:** 5-10 นาที

---

### ขั้นตอนที่ 5: ดู URL

```powershell
# ดู URL
flyctl status
```

**หรือ:**
```powershell
# ดู URL และ info
flyctl info
```

---

## 📋 Checklist

- [ ] ติดตั้ง Fly CLI ✅ (เสร็จแล้ว)
- [ ] Login Fly.io
- [ ] Launch app
- [ ] ตั้งค่า Environment Variables
- [ ] Deploy
- [ ] ดู URL
- [ ] ทดสอบเว็บ

---

## 🚀 คำสั่งทั้งหมด (รันทีเดียว)

```powershell
# เพิ่ม Fly CLI ไป PATH
$env:PATH += ";C:\Users\stopp\.fly\bin"

# Login
flyctl auth login

# Launch (สร้าง fly.toml)
flyctl launch

# ตั้งค่า Environment Variables
flyctl secrets set OPENROUTER_KEY=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

# Deploy
flyctl deploy

# ดู URL
flyctl status
```

---

## ⚠️ หมายเหตุ

1. **Login:** จะเปิด browser ให้ login
2. **Launch:** จะสร้างไฟล์ `fly.toml` อัตโนมัติ
3. **Secrets:** ใช้ `flyctl secrets set` แทน environment variables
4. **Deploy:** ใช้เวลา 5-10 นาที

---

**พร้อม Deploy แล้ว!** 🚀

