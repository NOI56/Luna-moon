# Luna AI v10 - System Overview
## ภาพรวมระบบและการทำงาน

---

## 📋 สารบัญ

1. [ภาพรวมระบบ](#ภาพรวมระบบ)
2. [สถาปัตยกรรมระบบ](#สถาปัตยกรรมระบบ)
3. [การทำงานของระบบ](#การทำงานของระบบ)
4. [วิธีใช้งาน](#วิธีใช้งาน)
5. [API Endpoints](#api-endpoints)
6. [โมดูลหลัก](#โมดูลหลัก)

---

## 🎯 ภาพรวมระบบ

**Luna AI v10** เป็น AI Streamer ที่สามารถ:
- 💬 **แชตกับผู้ชม** - ตอบคำถามด้วย AI (GPT-4o-mini / Claude-3-Opus)
- 🎭 **แสดงอารมณ์** - วิเคราะห์อารมณ์จากข้อความและแสดงผ่าน VTube Studio
- 🎤 **Text-to-Speech** - สร้างเสียงด้วย ElevenLabs
- 🎬 **VTube Studio Integration** - ควบคุม character อัตโนมัติ
- 🎮 **Rock Paper Scissors Game** - เกมเป่ายิงฉุบ 3 โหมด (PvP, VS Luna, Betting)
- 💰 **Solana Integration** - เชื่อมต่อกับ Solana blockchain และ Pump.fun
- 🧠 **Memory System** - จำผู้ใช้และประวัติการแชต
- 📊 **Statistics & Analytics** - ติดตามสถิติการใช้งาน

---

## 🏗️ สถาปัตยกรรมระบบ

### โครงสร้างไฟล์

```
LunaAI_v10_Project/
├── index.js              # Main server (Express + WebSocket)
├── package.json           # Dependencies และ scripts
├── env.example            # Template สำหรับ environment variables
│
├── modules/               # Core modules
│   ├── ai.js             # AI/LLM integration (GPT-4o-mini, Claude-3-Opus)
│   ├── vts.js            # VTube Studio integration
│   ├── tts.js            # Text-to-Speech (ElevenLabs)
│   ├── classifier.js     # Emotion classification
│   ├── memory.js         # User memory system
│   ├── personality.js    # Personality system
│   ├── db.js             # Database (SQLite)
│   ├── solana.js         # Solana integration
│   ├── pumpfun.js        # Pump.fun integration
│   ├── pumpfun_api.js    # Pump.fun API helpers
│   ├── logger.js         # Logging system
│   ├── env-validator.js  # Environment validation
│   └── backup.js         # Backup system
│
├── routes/                # API routes (modular)
│   ├── chat.js           # Chat endpoints
│   ├── status.js         # Status & health check
│   ├── vts.js            # VTube Studio endpoints
│   ├── control.js        # Control endpoints (wake, sleep)
│   ├── admin.js          # Admin endpoints
│   ├── rps.js            # RPS game routes
│   ├── rps-betting.js    # RPS betting routes
│   ├── rps-matchmaking.js # RPS matchmaking routes
│   ├── rps-rewards.js    # RPS rewards routes
│   ├── rps-stats.js      # RPS statistics routes
│   ├── deposit.js        # Deposit/withdraw routes
│   ├── webhook.js        # Webhook endpoints
│   └── csrf.js           # CSRF protection
│
├── services/              # Service layers
│   ├── websocketService.js    # WebSocket service
│   ├── solanaService.js        # Solana service
│   ├── notificationService.js  # Notification service
│   ├── pricingService.js       # Pricing service
│   ├── competitionService.js   # Competition service
│   └── antiAbuseService.js     # Anti-abuse service
│
├── public/                # Static files (HTML, CSS, JS)
│   ├── index.html        # Main page
│   ├── group_chat.html   # Group chat page
│   ├── rps_game.html     # RPS PvP mode
│   ├── rps_vs_luna.html  # RPS VS Luna mode
│   ├── rps_betting.html  # RPS Betting mode
│   └── ...
│
├── configs/               # Deployment configs
│   ├── northflank.yaml   # Northflank config
│   ├── render.yaml       # Render config
│   ├── railway.json      # Railway config
│   └── ...
│
└── docs/                  # Documentation
    ├── deployment/       # Deployment guides
    ├── guides/           # User guides
    └── ...
```

### เทคโนโลยีที่ใช้

- **Backend**: Node.js + Express.js
- **WebSocket**: ws (WebSocket Server)
- **Database**: SQLite3
- **AI**: OpenAI API / OpenRouter API
- **TTS**: ElevenLabs API
- **Blockchain**: Solana Web3.js
- **Logging**: Winston

---

## ⚙️ การทำงานของระบบ

### 1. Server Startup Flow

```
1. Load Environment Variables (.env)
   ↓
2. Validate Configuration (env-validator.js)
   ↓
3. Initialize Express App + HTTP Server + WebSocket Server
   ↓
4. Initialize Database (initDB)
   ↓
5. Load Group Chat Messages from Database
   ↓
6. Start Solana Watcher (monitor wallet transactions)
   ↓
7. Start PumpFun Watcher (monitor token transactions)
   ↓
8. Start VTube Studio Connection (if VTS_ENABLED=true)
   ↓
9. Start Breathing Loop (character breathing animation)
   ↓
10. Start Idle Loop (idle animations)
    ↓
11. Start Auto-Backup System
    ↓
12. Server Ready! Listen on PORT (default: 8787)
```

### 2. Chat Flow (เมื่อผู้ใช้ส่งข้อความ)

```
User sends message → POST /luna/message
   ↓
1. Validate Request (text, user)
   ↓
2. Get User Memory (getUserMemory)
   ↓
3. Classify Emotion (classifyEmotion)
   ↓
4. Determine Model (isComplexQuestion)
   - คำถามง่าย → GPT-4o-mini (SIMPLE_MODEL)
   - คำถามยาก → Claude-3-Opus (COMPLEX_MODEL)
   ↓
5. Call AI Model (callModel / callSimpleModel)
   ↓
6. Generate Response
   ↓
7. Update User Memory (updateUserMemory)
   ↓
8. Trigger Emotion Expression (triggerEmotion)
   ↓
9. Generate TTS (generateTTS) - if TTS_ENABLED=true
   ↓
10. Save Chat Log (logChat)
    ↓
11. Return Response to User
```

### 3. Emotion System Flow

```
User Message → Classify Emotion
   ↓
Emotion Types:
- angry (โกรธ)
- sad (เศร้า)
- sleepy (ง่วง)
- hype (ตื่นเต้น)
- soft (อ่อนโยน)
   ↓
Calculate Intensity (0.0 - 1.0)
   ↓
Trigger VTS Expression (triggerEmotion)
   ↓
VTS sends expression to character
   ↓
Character shows emotion animation
```

### 4. VTube Studio Integration Flow

```
Server → VTS API (WebSocket)
   ↓
VTS Commands:
- triggerEmotion() → Show emotion expression
- startTalkReact() → Move mouth while speaking
- startBreathingLoop() → Breathing animation
- startIdleLoop() → Idle animations
   ↓
VTS → Character Animation
```

### 5. RPS Game Flow

#### PvP Mode (Player vs Player)
```
Player 1 → Create Match → Wait for Player 2
   ↓
Player 2 → Join Match → Both players ready
   ↓
Both players submit choice (rock/paper/scissors)
   ↓
Server calculates winner
   ↓
Deduct tokens from loser, add to winner
   ↓
Update leaderboard
```

#### VS Luna Mode (Player vs AI)
```
Player → Create Match → Luna AI responds immediately
   ↓
Player submits choice
   ↓
Luna AI generates choice (random or strategic)
   ↓
Server calculates winner
   ↓
Deduct tokens from loser, add to winner
```

#### Betting Mode
```
Player → Create Room → Set bet amount
   ↓
Other players → Join Room → Match starts
   ↓
Both players submit choice
   ↓
Winner gets bet amount × 2
   ↓
Fee (1%) goes to fee wallet
```

### 6. Solana Integration Flow

```
Solana Watcher → Monitor Wallet Transactions
   ↓
Detect Luna Token Transfers
   ↓
Update User Balance (in-memory cache)
   ↓
Trigger Events (big buy → trigger emotion)
   ↓
Update Database (if needed)
```

---

## 🚀 วิธีใช้งาน

### 1. การติดตั้ง (Local Development)

```bash
# 1. Clone repository
git clone <repository-url>
cd LunaAI_v10_Project

# 2. ติดตั้ง dependencies
npm install

# 3. ตั้งค่า environment variables
cp env.example .env
# แก้ไข .env ตามที่ต้องการ

# 4. รัน server
npm start
```

### 2. การใช้งาน Chat API

#### ส่งข้อความไปหา Luna

```bash
POST http://localhost:8787/luna/message
Content-Type: application/json

{
  "text": "Hello Luna!",
  "user": "username"
}
```

**Response:**
```json
{
  "ok": true,
  "reply": "Hello! How can I help you today?",
  "emotion": "soft",
  "ttsUrl": "/tts/audio_12345.mp3"
}
```

### 3. การใช้งาน Web Interface

#### Group Chat
- URL: `http://localhost:8787/group_chat.html`
- ฟีเจอร์:
  - แชตกับ Luna แบบ real-time
  - เห็นข้อความของผู้ใช้คนอื่น
  - WebSocket connection สำหรับ live updates

#### RPS Game
- **PvP Mode**: `http://localhost:8787/rps_game.html`
- **VS Luna Mode**: `http://localhost:8787/rps_vs_luna.html`
- **Betting Mode**: `http://localhost:8787/rps_betting.html`

### 4. การใช้งาน Admin API

```bash
# ดู error logs
GET http://localhost:8787/luna/admin/errors?secret=your_admin_secret

# ลบ memory ของ user
GET http://localhost:8787/luna/admin/clear-memory?user=username&secret=your_admin_secret

# Reset statistics
GET http://localhost:8787/luna/admin/reset-stats?secret=your_admin_secret
```

---

## 📡 API Endpoints

### Chat Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/luna/message` | ส่งข้อความไปหา Luna |
| GET | `/luna/chat/history?user=username` | ดูประวัติการแชต |

### Status Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/luna/status` | ตรวจสอบสถานะระบบ |
| GET | `/luna/health` | Health check (สำหรับ monitoring) |
| GET | `/luna/stats` | สถิติการใช้งานระบบ |

### VTube Studio Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/luna/vts/parameters` | ดู parameters ที่มีใน VTS |
| GET | `/luna/expression?emo=angry` | ทดสอบ emotion expression |

### Control Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/luna/wake` | บังคับให้ Luna ตื่น (ปิด sleepy mode) |
| GET | `/luna/allow-sleep` | เปิดใช้งาน sleepy mode อีกครั้ง |

### RPS Game Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/luna/rps/create-match` | สร้าง match (PvP) |
| POST | `/luna/rps/join-match` | เข้าร่วม match |
| POST | `/luna/rps/submit-choice` | ส่ง choice (rock/paper/scissors) |
| GET | `/luna/rps/leaderboard` | ดู leaderboard |
| GET | `/luna/rps/stats` | สถิติ RPS game |

### RPS Betting Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/luna/rps/betting/create-room` | สร้างห้องเดิมพัน |
| POST | `/luna/rps/betting/join-room` | เข้าร่วมห้องเดิมพัน |
| GET | `/luna/rps/betting/rooms` | ดูห้องเดิมพันทั้งหมด |
| GET | `/luna/rps/betting/fees` | ดูค่าธรรมเนียมที่เก็บไว้ |

### Deposit/Withdraw Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/luna/deposit/create` | สร้าง deposit request |
| POST | `/luna/deposit/withdraw` | ถอน Luna tokens |
| GET | `/luna/deposit/balance` | ดู balance ที่ฝากไว้ |

### Admin Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/luna/admin/errors` | ดู error logs |
| GET | `/luna/admin/clear-memory` | ลบ memory ของ user |
| GET | `/luna/admin/reset-stats` | Reset statistics |
| GET | `/luna/admin/clear-cache` | ลบ response cache |

**หมายเหตุ:** Admin endpoints ต้องมี `ADMIN_SECRET` และส่ง header `x-admin-secret` หรือ query `?secret=...`

---

## 🔧 โมดูลหลัก

### 1. `modules/ai.js` - AI Integration

**หน้าที่:**
- เชื่อมต่อกับ OpenAI API หรือ OpenRouter API
- เลือก model อัตโนมัติตามความซับซ้อนของคำถาม
- Cache responses เพื่อประหยัด cost

**Functions:**
- `callModel(prompt, model)` - เรียก AI model
- `callSimpleModel(prompt)` - เรียก simple model (GPT-4o-mini)
- `isComplexQuestion(text)` - ตรวจสอบว่าคำถามซับซ้อนหรือไม่

### 2. `modules/vts.js` - VTube Studio Integration

**หน้าที่:**
- เชื่อมต่อกับ VTube Studio API
- ควบคุม character animations
- แสดง emotion expressions

**Functions:**
- `startVTS()` - เชื่อมต่อ VTS
- `triggerEmotion(emotion)` - แสดง emotion
- `startTalkReact()` - ขยับปากตามเวลาพูด
- `startBreathingLoop()` - หายใจอัตโนมัติ
- `startIdleLoop()` - idle animations

### 3. `modules/tts.js` - Text-to-Speech

**หน้าที่:**
- สร้างเสียงด้วย ElevenLabs API
- รองรับหลายโหมดเสียง (normal, soft, passion)

**Functions:**
- `generateTTS(text, voice)` - สร้างเสียง
- `speak(text, mode)` - พูดด้วยโหมดที่กำหนด
- `ambientMurmur(mode)` - พึมพำเองเป็นระยะ

### 4. `modules/classifier.js` - Emotion Classification

**หน้าที่:**
- วิเคราะห์อารมณ์จากข้อความ
- คำนวณความเข้มของอารมณ์

**Functions:**
- `classifyEmotion(text)` - วิเคราะห์อารมณ์
- `calculateEmotionIntensity(emotion, text)` - คำนวณความเข้ม
- `classifyMixedEmotions(text)` - วิเคราะห์อารมณ์ผสม
- `classifyEmotionContext(text)` - วิเคราะห์ context

### 5. `modules/memory.js` - Memory System

**หน้าที่:**
- จำผู้ใช้และประวัติการแชต
- เก็บ preferences และ emotion history
- Memory decay (ลืม memory เก่า)

**Functions:**
- `getUserMemory(user)` - ดึง memory ของ user
- `updateUserMemory(user, data)` - อัปเดต memory

### 6. `modules/personality.js` - Personality System

**หน้าที่:**
- จัดการบุคลิกภาพของ Luna
- เปลี่ยนแปลงตามอารมณ์

**Functions:**
- `decayPersonality()` - ลด personality ตามเวลา

### 7. `modules/db.js` - Database

**หน้าที่:**
- จัดการ SQLite database
- บันทึก chat logs, user data, deposits

**Functions:**
- `initDB()` - เริ่มต้น database
- `logChat(user, text, reply)` - บันทึก chat log
- `saveGroupChatMessage(room, user, text)` - บันทึก group chat message
- `saveLunaDeposit(user, amount)` - บันทึก deposit

### 8. `modules/solana.js` - Solana Integration

**หน้าที่:**
- Monitor Solana wallet transactions
- Update user balances

**Functions:**
- `startSolanaWatcher()` - เริ่ม monitor wallet

### 9. `modules/pumpfun.js` - Pump.fun Integration

**หน้าที่:**
- Monitor Pump.fun token transactions
- Detect big buys

**Functions:**
- `startPumpFunWatcher()` - เริ่ม monitor token transactions

---

## 📊 Data Flow

### Chat Request Flow

```
Client → Express Router → Chat Route Handler
   ↓
Validate Request → Get User Memory
   ↓
Classify Emotion → Determine Model
   ↓
Call AI Model → Generate Response
   ↓
Update Memory → Trigger Emotion → Generate TTS
   ↓
Save Log → Return Response → Client
```

### WebSocket Flow

```
Client → WebSocket Connection
   ↓
Server → Broadcast Messages
   ↓
All Connected Clients → Receive Updates
```

### Database Flow

```
Application → DB Module → SQLite Database
   ↓
Read/Write Operations → Transaction Log
   ↓
Backup System → Auto Backup (every hour)
```

---

## 🔒 Security Features

1. **CSRF Protection** - ป้องกัน CSRF attacks
2. **Rate Limiting** - จำกัดจำนวน requests ต่อ user
3. **Input Validation** - ตรวจสอบ input อัตโนมัติ
4. **Admin Secret** - ป้องกัน admin endpoints
5. **Environment Validation** - ตรวจสอบ environment variables

---

## 📈 Performance Features

1. **Response Caching** - Cache responses สำหรับคำถามซ้ำ
2. **Database Indexing** - เพิ่มความเร็วในการ query
3. **Connection Pooling** - จัดการ database connections
4. **Lazy Loading** - โหลดข้อมูลเมื่อจำเป็นเท่านั้น

---

## 🐛 Troubleshooting

### ปัญหาที่พบบ่อย

1. **VTS ไม่เชื่อมต่อ**
   - ตรวจสอบว่า VTube Studio เปิดอยู่
   - ตรวจสอบ VTS_AUTH_TOKEN
   - ตรวจสอบ network connection

2. **AI ไม่ตอบ**
   - ตรวจสอบ API key (OPENAI_KEY หรือ OPENROUTER_KEY)
   - ตรวจสอบ rate limits
   - ตรวจสอบ logs

3. **Database Error**
   - ตรวจสอบ disk space
   - ตรวจสอบ file permissions
   - ตรวจสอบ database file path

---

## 📚 เอกสารเพิ่มเติม

- [README.md](../README.md) - เอกสารหลัก
- [API Documentation](guides/API_DOCUMENTATION.md) - API endpoints แบบละเอียด
- [System Architecture](guides/SYSTEM_ARCHITECTURE.md) - สถาปัตยกรรมระบบ
- [Northflank Deployment](deployment/NORTHFLANK_DEPLOYMENT.md) - คู่มือ deploy บน Northflank

---

**Made with ❤️ for Luna AI Streamer**











