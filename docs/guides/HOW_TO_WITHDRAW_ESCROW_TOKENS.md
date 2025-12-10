# วิธีถอนเหรียญ Luna จาก Escrow Wallet

## 📋 ข้อมูลที่ต้องมี

1. **DEPOSIT_ESCROW_PRIVATE_KEY** - Private key ของ escrow wallet (ใน `.env`)
2. **LUNA_TOKEN_MINT** - Luna token mint address (ใน `.env`)
3. **Destination Wallet** - Wallet address ที่ต้องการส่ง token ไป

## 🔍 ขั้นตอนที่ 1: ตรวจสอบยอด Token

```bash
node scripts/check-escrow-balance.js
```

จะแสดง:
- ยอด Luna token ใน escrow wallet
- SOL balance (สำหรับ transaction fees)
- Token account address

## 💸 ขั้นตอนที่ 2: ถอน Token

### วิธีที่ 1: ใช้ Command Line Argument

```bash
node scripts/withdraw-escrow-tokens.js <destination_wallet_address>
```

**ตัวอย่าง:**
```bash
node scripts/withdraw-escrow-tokens.js 2b7wNjkNuCw5WVSoczA2xTrgkAv2ccDwCKee4z4Hacvr
```

### วิธีที่ 2: ตั้งค่าใน .env

เพิ่มในไฟล์ `.env`:
```
WITHDRAW_DESTINATION_WALLET=<destination_wallet_address>
```

แล้วรัน:
```bash
node scripts/withdraw-escrow-tokens.js
```

## ⚠️ ข้อควรระวัง

1. **ต้องมี Private Key**: ต้องมี `DEPOSIT_ESCROW_PRIVATE_KEY` ใน `.env`
2. **ต้องมี SOL**: Escrow wallet ต้องมี SOL เพียงพอสำหรับ transaction fees (อย่างน้อย 0.000005 SOL)
3. **จะถอนทั้งหมด**: Script จะถอน **ALL tokens** ใน escrow wallet
4. **5 วินาที countdown**: Script จะรอ 5 วินาทีก่อนส่ง transaction (กด Ctrl+C เพื่อยกเลิก)

## 📝 ตัวอย่างการใช้งาน

### 1. ตรวจสอบยอดก่อน
```bash
$ node scripts/check-escrow-balance.js

🔍 Checking Escrow Wallet Balance...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Escrow Wallet: FLMbMZXn6d5mWf6EWFAeVFcV4w7ioZ6PZAWSp8wxK4RU
Luna Token Mint: HEyVD4SKDLCLNRcUfFLqmAQQiZQWvBJcQskngvERpump
Token Account (ATA): HC3SN3vREAMgb2pWBaUuRc9EPPgvF2M7zVsHfdZxJXDz
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💰 Token Balance:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Raw Amount: 1000000000
UI Amount: 1,000 Luna
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Escrow wallet has 1,000 Luna tokens
```

### 2. ถอน Token
```bash
$ node scripts/withdraw-escrow-tokens.js 2b7wNjkNuCw5WVSoczA2xTrgkAv2ccDwCKee4z4Hacvr

🔍 Checking token balances...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Escrow Wallet: FLMbMZXn6d5mWf6EWFAeVFcV4w7ioZ6PZAWSp8wxK4RU
Destination Wallet: 2b7wNjkNuCw5WVSoczA2xTrgkAv2ccDwCKee4z4Hacvr
...

📋 Withdrawal Details:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Amount: 1,000 Luna
From: FLMbMZXn6d5mWf6EWFAeVFcV4w7ioZ6PZAWSp8wxK4RU
To: 2b7wNjkNuCw5WVSoczA2xTrgkAv2ccDwCKee4z4Hacvr
...

⚠️  Are you sure you want to withdraw ALL tokens?
   Press Ctrl+C to cancel, or wait 5 seconds to continue...

🚀 Sending withdrawal transaction...

✅ Withdrawal completed successfully!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Transaction: 5KJ7x...
Amount: 1,000 Luna
From: FLMbMZXn6d5mWf6EWFAeVFcV4w7ioZ6PZAWSp8wxK4RU
To: 2b7wNjkNuCw5WVSoczA2xTrgkAv2ccDwCKee4z4Hacvr
View on Solscan: https://solscan.io/tx/5KJ7x...
```

## 🔧 Troubleshooting

### Error: "Token account does not exist"
- **สาเหตุ**: Token account (ATA) ยังไม่ได้ถูกสร้าง หรือไม่มี token
- **แก้ไข**: ตรวจสอบว่ามี token ใน escrow wallet หรือไม่

### Error: "Insufficient SOL"
- **สาเหตุ**: Escrow wallet ไม่มี SOL เพียงพอสำหรับ transaction fees
- **แก้ไข**: ส่ง SOL ไปที่ escrow wallet (อย่างน้อย 0.001 SOL)

### Error: "Invalid private key"
- **สาเหตุ**: `DEPOSIT_ESCROW_PRIVATE_KEY` ไม่ถูกต้อง
- **แก้ไข**: ตรวจสอบว่า private key เป็น base58 encoded และถูกต้อง

### Error: "Private key does not match wallet"
- **สาเหตุ**: Private key ไม่ตรงกับ escrow wallet address
- **แก้ไข**: ตรวจสอบว่า `DEPOSIT_ESCROW_PRIVATE_KEY` ตรงกับ `DEPOSIT_ESCROW_WALLET`

## 📚 ข้อมูลเพิ่มเติม

- Token Transfer ใช้ Token Program (ไม่ใช่ System Program)
- ทำงานได้กับ Nonce Account (escrow wallet ของคุณ)
- จะสร้าง destination token account (ATA) อัตโนมัติถ้ายังไม่มี



