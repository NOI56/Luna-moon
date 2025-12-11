# Token Transfer vs SOL Transfer - ความแตกต่างและวิธีใช้งาน

## 📚 ความแตกต่างพื้นฐาน

### 🔵 SOL Transfer (System Program Transfer)
- **คืออะไร**: การส่ง SOL (Solana's native currency) จาก wallet หนึ่งไปอีก wallet หนึ่ง
- **ใช้โปรแกรม**: System Program (`11111111111111111111111111111111`)
- **ข้อจำกัด**: 
  - ❌ **ไม่สามารถใช้กับ account ที่มี data ได้** (เช่น Nonce Account)
  - ❌ Error: `"Transfer: 'from' must not carry data"`
- **ตัวอย่าง**: ส่ง 0.1 SOL จาก wallet A ไป wallet B

### 🟢 Token Transfer (Token Program Transfer)
- **คืออะไร**: การส่ง Token (เช่น Luna token) จาก token account หนึ่งไปอีก token account หนึ่ง
- **ใช้โปรแกรม**: Token Program หรือ Token-2022 Program
- **ข้อดี**: 
  - ✅ **สามารถใช้กับ account ใดๆ ได้** (รวมถึง Nonce Account)
  - ✅ ไม่มีข้อจำกัดเรื่อง account data
- **ตัวอย่าง**: ส่ง 1000 Luna token จาก token account A ไป token account B

## 🏗️ โครงสร้างใน Solana

### SOL Account (Wallet)
```
Wallet Address: FLMbMZXn6d5mWf6EWFAeVFcV4w7ioZ6PZAWSp8wxK4RU
├── Owner: System Program
├── Data: (empty หรือมี data สำหรับ Nonce Account)
└── Balance: SOL (lamports)
```

### Token Account (ATA - Associated Token Account)
```
Token Account Address: <calculated from mint + owner>
├── Owner: Token Program
├── Data: Token account data (mint, owner, amount, etc.)
├── Mint: Luna Token Mint Address
└── Balance: Token amount
```

## 💻 ตัวอย่างโค้ด

### ❌ SOL Transfer (ไม่ทำงานกับ Nonce Account)
```javascript
import { SystemProgram, Transaction } from "@solana/web3.js";

// ❌ จะ error ถ้า escrow wallet เป็น Nonce Account
const transferInstruction = SystemProgram.transfer({
  fromPubkey: escrowPublicKey,  // Nonce Account - มี data!
  toPubkey: destinationPublicKey,
  lamports: amountInLamports,
});

// Error: "Transfer: 'from' must not carry data"
```

### ✅ Token Transfer (ทำงานได้กับทุก account)
```javascript
import { createTransferInstruction } from "@solana/spl-token";

// ✅ ทำงานได้แม้ escrow wallet เป็น Nonce Account
const transferInstruction = createTransferInstruction(
  escrowTokenAccount,      // Token account (ATA) ของ escrow
  destinationTokenAccount,  // Token account (ATA) ของปลายทาง
  escrowPublicKey,         // Authority (owner ของ token account)
  amountInTokens           // จำนวน token
);

// ✅ สำเร็จ!
```

## 🔍 ในระบบ Luna AI

### ระบบ Deposit/Withdraw ใช้ Token Transfer

ดูโค้ดใน `routes/deposit.js`:

#### 1. การ Withdraw (ส่ง Luna token กลับให้ user)
```javascript:886:893:routes/deposit.js
transaction.add(
  createTransferInstruction(
    escrowTokenAccount,    // จาก escrow token account
    userTokenAccount,       // ไป user token account
    escrowPublicKey,       // Authority
    Number(rawAmount)       // จำนวน Luna token
  )
);
```

#### 2. การ Burn Fee (ส่ง Luna token ไป burn wallet)
```javascript:560:567:routes/deposit.js
instructions.push(
  createTransferInstruction(
    escrowTokenAccount,    // จาก escrow token account
    destinationAta,        // ไป burn token account
    escrowPublicKey,       // Authority
    Number(rawAmount)      // จำนวน Luna token
  )
);
```

## 📊 ตารางเปรียบเทียบ

| คุณสมบัติ | SOL Transfer | Token Transfer |
|---------|-------------|----------------|
| **โปรแกรมที่ใช้** | System Program | Token Program |
| **ส่งอะไร** | SOL (native currency) | Token (เช่น Luna) |
| **ใช้กับ Nonce Account** | ❌ ไม่ได้ | ✅ ได้ |
| **ใช้กับ Wallet ธรรมดา** | ✅ ได้ | ✅ ได้ |
| **Account ที่ต้องมี** | Wallet account | Token account (ATA) |
| **Transaction Fee** | ใช้ SOL | ใช้ SOL (แต่ส่ง token) |

## 🎯 ทำไมระบบใช้ Token Transfer?

1. **ระบบทำงานกับ Luna Token** ไม่ใช่ SOL
   - User ฝาก Luna token
   - System เก็บ Luna token ใน escrow
   - System ส่ง Luna token กลับเมื่อ withdraw

2. **Token Transfer ทำงานได้กับทุก account type**
   - ✅ Wallet ธรรมดา
   - ✅ Nonce Account
   - ✅ Program Derived Account (PDA)

3. **ไม่มีข้อจำกัดเรื่อง account data**
   - Token account เป็น account แยกต่างหาก
   - ไม่เกี่ยวกับ data ใน wallet account

## ⚠️ ข้อควรระวัง

### ถ้าต้องการส่ง SOL จาก Nonce Account:
- ❌ **ไม่สามารถทำได้** ด้วย System Program transfer
- ✅ **ต้องใช้ wallet ธรรมดา** แทน

### ถ้าต้องการส่ง Token:
- ✅ **ใช้ Token Transfer ได้เสมอ** ไม่ว่าจะเป็น account type ไหน

## 🔧 วิธีตรวจสอบ Account Type

ใช้ script `scripts/check-escrow-wallet.js`:

```bash
node scripts/check-escrow-wallet.js
```

จะแสดง:
- Account owner (System Program หรือ Program อื่น)
- Data length (0 bytes = wallet ธรรมดา, >0 bytes = มี data)
- Account type (wallet, Nonce Account, PDA, etc.)

## 📝 สรุป

- **Token Transfer** = ส่ง Token (เช่น Luna) ผ่าน Token Program
- **SOL Transfer** = ส่ง SOL ผ่าน System Program
- **ระบบ Luna AI ใช้ Token Transfer** เพราะทำงานกับ Luna token
- **Token Transfer ทำงานได้กับทุก account type** รวมถึง Nonce Account
- **SOL Transfer ไม่ทำงานกับ Nonce Account** เพราะมี data




