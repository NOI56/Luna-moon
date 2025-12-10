# ปัญหา Escrow Wallet: ไม่สามารถส่ง SOL ได้

## 🔍 สาเหตุของปัญหา

กระเป๋า `FLMbMZXn6d5mWf6EWFAeVFcV4w7ioZ6PZAWSp8wxK4RU` เป็น **Nonce Account** (Durable Nonce Account) ไม่ใช่ wallet ธรรมดา

### ลักษณะของ Nonce Account:
- มี data 80 bytes (เก็บ nonce state)
- เป็น account พิเศษที่มี state
- **ไม่สามารถใช้ System Program transfer SOL ได้โดยตรง**
- Error: `"Transfer: 'from' must not carry data"`

## ✅ วิธีแก้ไข

### วิธีที่ 1: ใช้ Token Transfer เท่านั้น (แนะนำสำหรับระบบปัจจุบัน)

ระบบ deposit/withdraw ใช้ **Token Transfer** อยู่แล้ว ไม่ใช่ SOL transfer ดังนั้น:
- ✅ **Token transfers ทำงานได้ปกติ** (Luna token)
- ❌ **SOL transfers ไม่ทำงาน** (ถ้าพยายามส่ง SOL จากกระเป๋านี้)

**วิธีใช้งาน:**
- ใช้กระเป๋านี้สำหรับเก็บ Luna token เท่านั้น
- อย่าพยายามส่ง SOL จากกระเป๋านี้โดยตรง
- ระบบจะใช้ token transfer อัตโนมัติ

### วิธีที่ 2: เปลี่ยนไปใช้ Wallet ธรรมดา (แนะนำสำหรับการใช้งานทั่วไป)

ถ้าต้องการให้กระเป๋าสามารถส่ง SOL ได้ ต้องเปลี่ยนไปใช้ wallet ธรรมดา:

1. **สร้าง wallet ใหม่:**
   ```bash
   # ใช้ Solana CLI
   solana-keygen new --outfile escrow-keypair.json
   ```

2. **หรือใช้ Phantom wallet:**
   - สร้าง wallet ใหม่ใน Phantom
   - Export private key
   - ตั้งค่าใน `.env`:
     ```
     DEPOSIT_ESCROW_WALLET=<wallet_address>
     DEPOSIT_ESCROW_PRIVATE_KEY=<private_key_base58>
     ```

3. **ย้าย Luna token จากกระเป๋าเก่าไปกระเป๋าใหม่:**
   - ใช้ token transfer จาก Nonce Account ไป wallet ใหม่
   - หรือใช้ script `scripts/transfer-escrow-tokens.js`

## 🔧 การตรวจสอบ Account Type

ใช้ script `scripts/check-escrow-wallet.js` เพื่อตรวจสอบ:

```bash
node scripts/check-escrow-wallet.js
```

## 📝 หมายเหตุ

- **Nonce Account** ใช้สำหรับ durable transaction nonces (ป้องกัน transaction replay)
- ไม่เหมาะสำหรับใช้เป็น escrow wallet ธรรมดา
- ควรใช้ wallet ธรรมดาสำหรับ escrow wallet

## 🚨 ข้อควรระวัง

- อย่าพยายามส่ง SOL จาก Nonce Account โดยตรง
- ใช้ Token Transfer เท่านั้นสำหรับ Nonce Account
- ถ้าต้องการส่ง SOL ต้องใช้ wallet ธรรมดา



