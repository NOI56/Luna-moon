# วิธีถอน Luna Token ไปที่ Wallet: 8agtQAy5ADEpztWeU4KiQ9tWQMW1S2xAYHqcZ4vfjqFU

## 📋 ข้อมูล

- **Destination Wallet**: `8agtQAy5ADEpztWeU4KiQ9tWQMW1S2xAYHqcZ4vfjqFU`
- **Token Account (ATA)**: `CS6vWacJDPYXFouV2j8sb8u6HfyqvXDLfwf4i4ozWJjB`
- **Luna Token Mint**: `HEyVD4SKDLCLNRcUfFLqmAQQiZQWvBJcQskngvERpump`
- **Token Program**: Token-2022

## 🔧 ขั้นตอนการถอน

### ขั้นตอนที่ 1: สร้าง Token Account

**วิธีที่ 1: ใช้ Phantom Wallet (แนะนำ)**
1. เปิด Phantom wallet
2. ไปที่ wallet `8agtQAy5ADEpztWeU4KiQ9tWQMW1S2xAYHqcZ4vfjqFU`
3. คลิก "Receive" หรือ "Add Token"
4. เพิ่ม Luna token โดยใส่ mint address:
   ```
   HEyVD4SKDLCLNRcUfFLqmAQQiZQWvBJcQskngvERpump
   ```

**วิธีที่ 2: ส่ง Luna เล็กน้อย**
- ส่ง Luna เล็กน้อย (เช่น 0.000001) ไปที่ wallet นี้
- จะสร้าง token account อัตโนมัติ

### ขั้นตอนที่ 2: ตรวจสอบ Token Account

```bash
node scripts/create-destination-ata.js 8agtQAy5ADEpztWeU4KiQ9tWQMW1S2xAYHqcZ4vfjqFU
```

ควรเห็น: `✅ Token account already exists!`

### ขั้นตอนที่ 3: ถอน Token

```bash
node scripts/withdraw-escrow-tokens.js 8agtQAy5ADEpztWeU4KiQ9tWQMW1S2xAYHqcZ4vfjqFU
```

## ⚠️ หมายเหตุ

- Escrow wallet เป็น Nonce Account จึงไม่สามารถสร้าง token account อัตโนมัติได้
- ต้องสร้าง destination token account ก่อนถึงจะถอน token ได้
- จำนวนที่จะถอน: **5,410,242.627 Luna** (ทั้งหมดใน escrow wallet)




