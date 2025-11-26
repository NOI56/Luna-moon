# แก้ไขปัญหา API Key Error 401

## ปัญหา
```
Error: 401 {"error":{"message":"User not found.","code":401}}
```

## สาเหตุ
- API key ของ OpenRouter ไม่ถูกต้อง
- Account ถูก suspend หรือลบ
- API key หมดอายุ
- Account ไม่มี credit

## วิธีแก้ไข

### วิธีที่ 1: ตรวจสอบและอัปเดต OpenRouter API Key

1. ไปที่ https://openrouter.ai/keys
2. ตรวจสอบ API keys ที่มีอยู่
3. สร้าง API key ใหม่ (ถ้าจำเป็น)
4. อัปเดตใน `.env`:
   ```
   OPENROUTER_KEY=sk-or-v1-xxxxxxxxxxxxx
   ```

### วิธีที่ 2: เปลี่ยนไปใช้ OpenAI API

1. ไปที่ https://platform.openai.com/api-keys
2. สร้าง API key ใหม่
3. อัปเดตใน `.env`:
   ```
   OPENAI_KEY=sk-xxxxxxxxxxxxx
   # หรือ comment OPENROUTER_KEY
   # OPENROUTER_KEY=...
   ```

### วิธีที่ 3: ตรวจสอบ Account Status

1. ไปที่ https://openrouter.ai/settings
2. ตรวจสอบ:
   - Account status
   - Credit balance
   - Usage limits

## ทดสอบ API Key

หลังจากอัปเดต API key แล้ว รัน:

```bash
node test-api-connection.js
```

ควรเห็น:
```
✅ Success!
```

## หมายเหตุ

- ต้องมี API key อย่างน้อย 1 ตัว (OPENAI_KEY หรือ OPENROUTER_KEY)
- ถ้าใช้ OpenRouter ต้องมี credit ใน account
- API key ต้องไม่หมดอายุ


