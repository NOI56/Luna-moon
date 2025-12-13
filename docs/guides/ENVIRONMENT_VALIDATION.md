# ✅ Luna AI - Environment Validation Guide

คู่มือการใช้งาน Environment Validation System

## 🎯 Overview

Luna AI มีระบบตรวจสอบ environment variables อัตโนมัติก่อน start server เพื่อป้องกัน config errors และ runtime issues

### Features

- ✅ **Comprehensive Validation** - ตรวจสอบ env variables ครบถ้วน
- ✅ **Format Validation** - ตรวจสอบ format ของ values (URLs, wallet addresses, API keys)
- ✅ **Range Validation** - ตรวจสอบ numeric values (PORT, rates, limits)
- ✅ **Type Validation** - ตรวจสอบ boolean, string, number types
- ✅ **Placeholder Detection** - ตรวจจับ placeholder values (your_*, here)
- ✅ **Error Prevention** - แสดง error ชัดเจนก่อน start server

## 📋 Validation Rules

### Server Configuration

#### PORT
- **Type**: Number
- **Range**: 1 - 65535
- **Default**: 8787
- **Example**: `PORT=8787`

### AI / LLM Configuration

#### OPENAI_KEY
- **Type**: String
- **Format**: ต้องเริ่มด้วย `sk-`
- **Length**: อย่างน้อย 10 ตัวอักษร
- **Required**: ถ้าไม่มี OPENROUTER_KEY
- **Example**: `OPENAI_KEY=sk-...`

#### OPENROUTER_KEY
- **Type**: String
- **Format**: ต้องเริ่มด้วย `sk-or-v1-`
- **Length**: อย่างน้อย 10 ตัวอักษร
- **Required**: ถ้าไม่มี OPENAI_KEY
- **Example**: `OPENROUTER_KEY=sk-or-v1-...`

#### SIMPLE_MODEL / COMPLEX_MODEL
- **Type**: String
- **Length**: อย่างน้อย 3 ตัวอักษร
- **Example**: `SIMPLE_MODEL=gpt-4o-mini`

### VTube Studio Configuration

#### VTS_ENABLED
- **Type**: Boolean
- **Values**: `true` หรือ `false`
- **Example**: `VTS_ENABLED=true`

#### VTS_AUTH_TOKEN
- **Type**: String
- **Required**: ถ้า `VTS_ENABLED=true`
- **Length**: อย่างน้อย 10 ตัวอักษร
- **Example**: `VTS_AUTH_TOKEN=your_token_here`

#### VTS_PORT
- **Type**: Number
- **Range**: 1 - 65535
- **Default**: 8001
- **Example**: `VTS_PORT=8001`

#### VTS_HOST
- **Type**: String
- **Format**: IP address หรือ hostname
- **Example**: `VTS_HOST=127.0.0.1`

### ElevenLabs TTS Configuration

#### TTS_ENABLED
- **Type**: Boolean
- **Values**: `true` หรือ `false`
- **Example**: `TTS_ENABLED=true`

#### ELEVEN_KEY
- **Type**: String
- **Required**: ถ้า `TTS_ENABLED !== "false"`
- **Length**: อย่างน้อย 20 ตัวอักษร
- **Example**: `ELEVEN_KEY=your_api_key_here`

### Rate Limiting

#### RATE_LIMIT_MAX
- **Type**: Number
- **Range**: 1 - 1000
- **Default**: 30
- **Example**: `RATE_LIMIT_MAX=30`

### Logging Configuration

#### LOG_LEVEL
- **Type**: String
- **Values**: `error`, `warn`, `info`, `verbose`, `debug`, `silly`
- **Default**: `info`
- **Example**: `LOG_LEVEL=info`

#### LOG_CONSOLE
- **Type**: Boolean
- **Values**: `true` หรือ `false`
- **Default**: `true`
- **Example**: `LOG_CONSOLE=true`

#### LOG_VERBOSE
- **Type**: Boolean
- **Values**: `true` หรือ `false`
- **Default**: `false`
- **Example**: `LOG_VERBOSE=false`

### CORS Configuration

#### CORS_ORIGINS
- **Type**: String
- **Format**: URLs คั่นด้วย comma หรือ `*`
- **Example**: `CORS_ORIGINS=http://localhost:3000,https://example.com`
- **Example**: `CORS_ORIGINS=*`

### Solana Configuration

#### SOLANA_RPC_URL
- **Type**: String
- **Format**: Valid URL
- **Example**: `SOLANA_RPC_URL=https://api.mainnet-beta.solana.com`

#### LUNA_WALLET
- **Type**: String
- **Format**: Solana wallet address (base58, 32-44 characters)
- **Example**: `LUNA_WALLET=YourSolanaWalletAddressHere`

### Luna Token Configuration

#### LUNA_TOKEN_MINT
- **Type**: String
- **Format**: Solana wallet address (base58, 32-44 characters)
- **Example**: `LUNA_TOKEN_MINT=your_token_mint_address_from_pumpfun_here`

#### LUNA_TO_SOL_RATE
- **Type**: Number
- **Range**: 0 - 1
- **Example**: `LUNA_TO_SOL_RATE=0.00009`

#### LUNA_BUY_LINK
- **Type**: String
- **Format**: Valid URL
- **Example**: `LUNA_BUY_LINK=https://pump.fun/...`

#### LUNA_X_LINK
- **Type**: String
- **Format**: Valid URL
- **Example**: `LUNA_X_LINK=https://x.com/your_community`

### Wallet Addresses

#### BETTING_FEE_WALLET
- **Type**: String
- **Format**: Solana wallet address (base58, 32-44 characters)
- **Example**: `BETTING_FEE_WALLET=YourSolanaWalletAddressHere`

#### REWARD_DISTRIBUTION_WALLET
- **Type**: String
- **Format**: Solana wallet address (base58, 32-44 characters)
- **Example**: `REWARD_DISTRIBUTION_WALLET=YourSolanaWalletAddressHere`

#### DEPOSIT_ESCROW_WALLET
- **Type**: String
- **Format**: Solana wallet address (base58, 32-44 characters)
- **Example**: `DEPOSIT_ESCROW_WALLET=YourSolanaWalletAddressHere`

### Private Keys

#### REWARD_SENDER_PRIVATE_KEY
- **Type**: String
- **Format**: Base58 encoded private key
- **Length**: อย่างน้อย 40 ตัวอักษร
- **Security**: ⚠️ เก็บเป็นความลับ!
- **Example**: `REWARD_SENDER_PRIVATE_KEY=your_base58_private_key_here`

#### DEPOSIT_ESCROW_PRIVATE_KEY
- **Type**: String
- **Format**: Base58 encoded private key
- **Length**: อย่างน้อย 40 ตัวอักษร
- **Security**: ⚠️ เก็บเป็นความลับ!
- **Example**: `DEPOSIT_ESCROW_PRIVATE_KEY=your_base58_private_key_here`

### Admin Configuration

#### ADMIN_SECRET
- **Type**: String
- **Length**: อย่างน้อย 8 ตัวอักษร (แนะนำ)
- **Security**: ⚠️ เก็บเป็นความลับ!
- **Example**: `ADMIN_SECRET=your_secret_here`

#### PURCHASE_SECRET
- **Type**: String
- **Length**: อย่างน้อย 8 ตัวอักษร (แนะนำ)
- **Security**: ⚠️ เก็บเป็นความลับ!
- **Example**: `PURCHASE_SECRET=your_secret_here`

### Boolean Flags

#### ENABLE_CSRF
- **Type**: Boolean
- **Values**: `true` หรือ `false`
- **Example**: `ENABLE_CSRF=true`

#### IDLE_MONOLOGUE_ENABLED
- **Type**: Boolean
- **Values**: `true` หรือ `false`
- **Example**: `IDLE_MONOLOGUE_ENABLED=false`

#### AMBIENT_MURMUR_ENABLED
- **Type**: Boolean
- **Values**: `true` หรือ `false`
- **Example**: `AMBIENT_MURMUR_ENABLED=false`

#### ENHANCED_LOGGING
- **Type**: Boolean
- **Values**: `true` หรือ `false`
- **Example**: `ENHANCED_LOGGING=false`

#### DEBUG
- **Type**: Boolean
- **Values**: `true` หรือ `false`
- **Example**: `DEBUG=false`

## 🔍 Validation Process

### 1. Server Startup

เมื่อ start server, ระบบจะ:
1. โหลด environment variables จาก `.env`
2. ตรวจสอบทุก env variable ตาม rules
3. แสดง errors (ถ้ามี) และหยุด server
4. แสดง warnings (ถ้ามี) แต่ยัง start server ได้
5. แสดง success message ถ้าไม่มี errors

### 2. Error vs Warning

#### Errors (หยุด server)
- Missing required variables
- Invalid format ที่ทำให้ระบบไม่ทำงาน
- Invalid values ที่ทำให้เกิด runtime errors

#### Warnings (ยัง start ได้)
- Placeholder values (your_*, here)
- Invalid format ที่อาจทำให้เกิดปัญหา
- Missing optional variables
- Values ที่ไม่ตรงกับ best practices

## 📝 ตัวอย่าง Validation Output

### Success
```
[config] ✅ Configuration validated
```

### With Warnings
```
[config] ⚠️  Configuration warnings:
  - OPENAI_KEY appears to be a placeholder. Please set a valid API key.
  - VTS_ENABLED=true but VTS_AUTH_TOKEN is missing. Run 'node scripts/vts/vts-auth.cjs' to get token.
```

### With Errors
```
[config] ❌ Configuration errors:
  - Missing AI API key: OPENAI_KEY or OPENROUTER_KEY required
  - PORT must be a number between 1 and 65535, got: 99999
[config] Please fix these errors before starting the server.
```

## 🛠️ Troubleshooting

### Error: "Missing AI API key"

**Solution**: ตั้งค่า `OPENAI_KEY` หรือ `OPENROUTER_KEY` ใน `.env`

```env
OPENAI_KEY=sk-your_key_here
# หรือ
OPENROUTER_KEY=sk-or-v1-your_key_here
```

### Warning: "API key appears to be a placeholder"

**Solution**: เปลี่ยน placeholder value เป็น API key จริง

```env
# ❌ Bad
OPENAI_KEY=your_openai_api_key_here

# ✅ Good
OPENAI_KEY=sk-abc123...
```

### Warning: "Wallet address format may be invalid"

**Solution**: ตรวจสอบว่า wallet address เป็น Solana address ที่ถูกต้อง (base58, 32-44 characters)

```env
# ❌ Bad
LUNA_TOKEN_MINT=invalid_address

# ✅ Good
LUNA_TOKEN_MINT=CbB4ivri6wLfqx4NwrWY3ArD7mXv1e91HeYeq3KBpump
```

### Warning: "PORT must be a number between 1 and 65535"

**Solution**: ตั้งค่า PORT เป็นตัวเลขระหว่าง 1-65535

```env
# ❌ Bad
PORT=abc
PORT=99999

# ✅ Good
PORT=8787
```

### Warning: "LOG_LEVEL must be one of: error, warn, info, verbose, debug, silly"

**Solution**: ตั้งค่า LOG_LEVEL เป็นค่าที่ถูกต้อง

```env
# ❌ Bad
LOG_LEVEL=invalid

# ✅ Good
LOG_LEVEL=info
```

## 📚 Best Practices

### 1. ใช้ env.example เป็น Template

```bash
cp env.example .env
# แก้ไข .env ตามที่ต้องการ
```

### 2. ตรวจสอบ Validation ก่อน Deploy

```bash
# Start server และดู validation output
npm start
```

### 3. อย่าใช้ Placeholder Values

```env
# ❌ Bad
OPENAI_KEY=your_openai_api_key_here

# ✅ Good
OPENAI_KEY=sk-abc123...
```

### 4. ตรวจสอบ Wallet Addresses

```bash
# ใช้ Solana CLI หรือ explorer เพื่อตรวจสอบ
solana address --verify <wallet_address>
```

### 5. เก็บ Private Keys เป็นความลับ

- อย่า commit `.env` ลง Git
- ใช้ environment variables ใน production
- ใช้ secret management service (AWS Secrets Manager, etc.)

## 🔗 ข้อมูลเพิ่มเติม

- Environment Variables: `env.example`
- Logging System: `docs/guides/LOGGING_SYSTEM.md`
- API Documentation: `docs/guides/API_DOCUMENTATION.md`

---

**หมายเหตุ:** Environment Validation ทำงานอัตโนมัติเมื่อ start server และช่วยป้องกัน config errors ก่อน runtime






























