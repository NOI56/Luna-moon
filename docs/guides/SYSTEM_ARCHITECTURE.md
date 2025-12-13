# ระบบ Luna AI v10 - สถาปัตยกรรมและการทำงาน

## 📋 สารบัญ
1. [ภาพรวมระบบ](#ภาพรวมระบบ)
2. [โครงสร้างไฟล์](#โครงสร้างไฟล์)
3. [การทำงานของระบบ](#การทำงานของระบบ)
4. [วิธีใช้งาน](#วิธีใช้งาน)
5. [การตั้งค่า](#การตั้งค่า)

---

## 🎯 ภาพรวมระบบ

Luna AI v10 เป็นระบบ AI Streamer ที่รวม:
- **AI Chat System** - ระบบแชตอัจฉริยะ
- **Emotion Engine** - ระบบอารมณ์
- **VTube Studio Integration** - เชื่อมต่อกับ VTube Studio
- **Text-to-Speech** - ระบบแปลงข้อความเป็นเสียง
- **RPS Game System** - เกมเป่ายิ้งฉุบ
- **Solana Integration** - เชื่อมต่อกับ Solana blockchain
- **Anti-Abuse System** - ระบบป้องกันการโกง

---

## 📁 โครงสร้างไฟล์

### Core Files
```
index.js                    # Main server file (1,214 lines)
├── Configuration          # การตั้งค่าและ validation
├── Express Setup          # Express app และ middleware
├── WebSocket Setup        # WebSocket server
├── Route Setup            # การตั้งค่า routes
└── Server Startup         # การเริ่มต้น server
```

### Modules (`/modules`)
```
modules/
├── ai.js                  # AI/LLM integration (GPT-4o, Claude)
├── vts.js                 # VTube Studio integration
├── tts.js                 # Text-to-Speech (ElevenLabs)
├── classifier.js          # Emotion classification
├── memory.js              # User memory system
├── personality.js         # Personality system
├── db.js                  # Database operations
├── solana.js              # Solana blockchain watcher
├── pumpfun.js             # Pump.fun integration
├── pumpfun_api.js         # Pump.fun API helpers
├── logger.js              # Logging system
├── env-validator.js       # Environment validation
└── backup.js              # Backup system
```

### Routes (`/routes`)
```
routes/
├── admin.js               # Admin endpoints
├── chat.js                # Chat, notification, referral routes
├── control.js             # Wake/sleep control
├── csrf.js                # CSRF token
├── deposit.js             # Deposit system
├── rps.js                 # RPS main router
├── rps-betting.js         # RPS betting routes
├── rps-competition.js     # RPS competition routes
├── rps-matchmaking.js     # RPS matchmaking routes
├── rps-rewards.js         # RPS rewards routes
├── rps-stats.js           # RPS statistics routes
├── status.js              # Status and health check
├── vts.js                 # VTS expression/parameters
└── webhook.js             # Purchase webhook
```

### Services (`/services`)
```
services/
├── websocketService.js    # WebSocket broadcast
├── notificationService.js # Notification system
├── antiAbuseService.js    # Anti-abuse functions (11 functions)
├── pricingService.js      # Price fetching and fee calculation
├── solanaService.js       # Solana transactions
└── competitionService.js  # Weekly competition management
```

### Utils (`/utils`)
```
utils/
├── validation.js          # Wallet address validation
├── helpers.js             # Helper functions
└── errorHandler.js        # Error logging
```

### Config (`/config`)
```
config/
└── constants.js           # Application constants
```

### State (`/state`)
```
state/
└── state.js               # Application state management
```

---

## ⚙️ การทำงานของระบบ

### 1. Server Startup Flow

```
1. Load Environment Variables (.env)
   ↓
2. Validate Configuration
   ↓
3. Initialize State (state/state.js)
   ↓
4. Setup Express App
   ↓
5. Setup Middleware (CORS, CSRF, JSON)
   ↓
6. Setup Routes (routes/*.js)
   ↓
7. Initialize Database
   ↓
8. Start Watchers (Solana, PumpFun)
   ↓
9. Start VTS Connection
   ↓
10. Start Background Loops
    - Idle monologue
    - Personality decay
    - Energy recovery
    - Sleepy mode check
    - Yawn loop
    - Price update
    - Competition check
   ↓
11. Start HTTP/WebSocket Server
```

### 2. Request Flow

```
Client Request
   ↓
Express Middleware
   ├── CORS Check
   ├── CSRF Validation (if enabled)
   └── JSON Parsing
   ↓
Route Handler (routes/*.js)
   ├── Validation
   ├── Business Logic (services/*.js)
   ├── Database Operations (modules/db.js)
   └── Response
   ↓
Client Response
```

### 3. WebSocket Flow

```
Client Connection
   ↓
WebSocket Server (wss)
   ↓
Add to clients Set
   ↓
Listen for Messages
   ├── Chat messages
   ├── Game actions
   └── System events
   ↓
Broadcast to All Clients (services/websocketService.js)
```

### 4. AI Chat Flow

```
User Message
   ↓
Route: POST /luna/chat/send
   ↓
Validate Request
   ├── Wallet address
   ├── Message length
   └── Balance check
   ↓
AI Processing (modules/ai.js)
   ├── Check if complex question
   ├── Use GPT-4o-mini (simple) or GPT-4o/Claude (complex)
   └── Generate response
   ↓
Emotion Classification (modules/classifier.js)
   ├── Classify emotion
   ├── Calculate intensity
   └── Trigger VTS expression
   ↓
TTS Generation (modules/tts.js)
   ├── Generate audio
   └── Return TTS URL
   ↓
Save to Database (modules/db.js)
   ↓
Broadcast via WebSocket
   ↓
Response to Client
```

### 5. RPS Game Flow

```
Player Action
   ↓
Route: POST /luna/rps/matchmaking/queue
   ↓
Anti-Abuse Check (services/antiAbuseService.js)
   ├── Validate game request
   ├── Check IP cooldown
   ├── Check suspicious pairs
   └── Track wallet-IP
   ↓
Matchmaking
   ├── Find opponent
   └── Create match
   ↓
Game Execution
   ├── Record choices
   ├── Calculate result
   └── Update leaderboard
   ↓
Fee Collection (services/pricingService.js)
   ├── Calculate fee
   ├── Convert Luna to SOL
   └── Collect fee
   ↓
Reward Distribution (services/solanaService.js)
   └── Send rewards to winners
```

### 6. State Management

```
State Initialization (state/state.js)
   ↓
State Accessors
   ├── Direct access (Maps, Sets)
   └── Getter/Setter (mutable values)
   ↓
State Updates
   ├── Direct mutation (Maps, Sets)
   └── Update functions (mutable values)
```

---

## 🚀 วิธีใช้งาน

### 1. การเริ่มต้น Server

```bash
# Install dependencies
npm install

# Setup environment variables
cp env.example .env
# แก้ไข .env ตามต้องการ

# Start server
npm start
# หรือ
node index.js
```

### 2. API Endpoints

#### Chat API
```javascript
// ส่งข้อความ
POST /luna/chat/send
Body: {
  "roomId": "group_chat",
  "wallet": "wallet_address",
  "message": "Hello Luna",
  "username": "username"
}

// ดูข้อความ
GET /luna/chat/messages?roomId=group_chat&limit=50

// ส่ง reaction
POST /luna/chat/reaction
Body: {
  "messageId": "message_id",
  "wallet": "wallet_address",
  "reactionType": "like"
}
```

#### RPS API
```javascript
// เข้าคิว matchmaking
POST /luna/rps/matchmaking/queue
Body: {
  "wallet": "wallet_address",
  "choice": "rock" // rock, paper, scissors
}

// สร้าง betting room
POST /luna/rps/betting/create
Body: {
  "wallet": "wallet_address",
  "betAmount": 100000 // Luna tokens
}

// ดู leaderboard
GET /luna/rps/leaderboard
```

#### Status API
```javascript
// ตรวจสอบสถานะ
GET /luna/status

// Health check
GET /luna/health

// สถิติ
GET /luna/stats
```

#### Admin API
```javascript
// ต้องส่ง header: x-admin-secret

// ดู error log
GET /luna/admin/errors?secret=your_secret

// Clear cache
GET /luna/admin/clear-cache?secret=your_secret

// Block wallet
POST /luna/admin/anti-abuse/block-wallet
Body: {
  "wallet": "wallet_address",
  "secret": "your_secret"
}
```

### 3. WebSocket Events

```javascript
// Connect to WebSocket
const ws = new WebSocket('ws://localhost:8787');

// Listen for messages
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  switch(data.type) {
    case 'luna_message':
      // Luna sent a message
      console.log(data.text);
      break;
    case 'notification':
      // Notification received
      console.log(data.notification);
      break;
    case 'game_update':
      // Game state update
      console.log(data.game);
      break;
  }
};
```

---

## ⚙️ การตั้งค่า

### Environment Variables (`.env`)

#### Required
```env
PORT=8787
LUNA_TOKEN_MINT=your_token_mint_address
SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
```

#### AI Configuration
```env
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key
```

#### VTS Configuration
```env
VTS_ENABLED=true
VTS_AUTH_TOKEN=your_vts_token
VTS_HOST=localhost
VTS_PORT=8001
```

#### TTS Configuration
```env
TTS_ENABLED=true
ELEVEN_KEY=your_elevenlabs_key
```

#### Security
```env
ADMIN_SECRET=your_admin_secret
ENABLE_CSRF=true
CORS_ORIGINS=http://localhost:8787,https://yourdomain.com
```

#### Solana/Rewards
```env
REWARD_SENDER_PRIVATE_KEY=your_private_key
REWARD_DISTRIBUTION_WALLET=your_wallet_address
BETTING_FEE_WALLET=your_fee_wallet
```

#### Deposit System
```env
DEPOSIT_ESCROW_WALLET=your_escrow_wallet
DEPOSIT_ESCROW_PRIVATE_KEY=your_escrow_private_key
```

---

## 🔄 การทำงานของแต่ละระบบ

### 1. AI Chat System

**Flow:**
1. User ส่งข้อความ → `/luna/chat/send`
2. ตรวจสอบ balance (ต้องมี 100,000+ Luna สำหรับ group chat)
3. ตรวจสอบ cache → ถ้ามี return ทันที
4. ตรวจสอบความซับซ้อน → เลือก model
   - Simple → GPT-4o-mini
   - Complex → GPT-4o หรือ Claude
5. สร้าง prompt → รวม memory, personality
6. เรียก AI → ได้ response
7. Classify emotion → ตรวจจับอารมณ์
8. Trigger VTS → แสดงอารมณ์
9. Generate TTS → สร้างเสียง
10. Save to DB → บันทึกข้อความ
11. Broadcast → ส่งผ่าน WebSocket
12. Update stats → อัปเดตสถิติ

**Files:**
- `routes/chat.js` - Chat routes
- `modules/ai.js` - AI processing
- `modules/classifier.js` - Emotion classification
- `modules/memory.js` - User memory
- `modules/personality.js` - Personality system

### 2. RPS Game System

**Flow:**
1. Player เข้าคิว → `/luna/rps/matchmaking/queue`
2. Anti-abuse check → ตรวจสอบการโกง
3. Matchmaking → หาคู่แข่ง
4. Game execution → เล่นเกม
5. Calculate result → คำนวณผล
6. Update leaderboard → อัปเดต leaderboard
7. Fee collection → เก็บค่าธรรมเนียม
8. Reward distribution → แจกรางวัล

**Files:**
- `routes/rps.js` - Main router
- `routes/rps-*.js` - Sub-routes
- `services/antiAbuseService.js` - Anti-abuse
- `services/pricingService.js` - Pricing
- `services/solanaService.js` - Transactions

### 3. Anti-Abuse System

**Features:**
- IP-based tracking
- Wallet pair detection
- Self-play detection
- Cooldown system
- Reward banning

**Files:**
- `services/antiAbuseService.js` - All anti-abuse functions

### 4. VTube Studio Integration

**Flow:**
1. Connect to VTS → `modules/vts.js`
2. Authenticate → ใช้ auth token
3. Listen for events → Hotkey triggers
4. Trigger expressions → ตามอารมณ์
5. Update parameters → Mouth, breathing, etc.

**Files:**
- `modules/vts.js` - VTS integration
- `routes/vts.js` - VTS routes

### 5. Background Loops

**Loops:**
- Idle monologue (ทุก 60 วินาที)
- Personality decay (ทุก 60 วินาที)
- Energy recovery (ทุก 60 วินาที)
- Sleepy mode check (ทุก 60 วินาที)
- Yawn loop (ทุก 15 นาที)
- Price update (ทุก 1 นาที)
- Competition check (ทุก 1 ชั่วโมง)

---

## 📊 State Management

### State Structure

```javascript
state = {
  // RPS State
  rpsMatchQueue: Map,
  rpsActiveMatches: Map,
  rpsBettingRooms: Map,
  rpsLeaderboard: Map,
  rpsGames: Map,
  collectedFees: Map,
  rewardPool: number,
  
  // Anti-Abuse State
  ipWalletMap: Map,
  walletIpMap: Map,
  ipActivityMap: Map,
  walletPairMatches: Map,
  walletOpponents: Map,
  walletTotalGames: Map,
  ipSelfPlayMatches: Map,
  suspiciousActivityLog: Array,
  blockedWallets: Set,
  blockedIps: Set,
  rewardBannedWallets: Set,
  rewardBannedIps: Set,
  
  // Chat State
  chatRooms: Map,
  messageReactions: Map,
  messageTips: Map,
  chatRewards: Map,
  onlineUsers: Map,
  chatLeaderboard: Map,
  badgeCache: Map,
  
  // Notification State
  userNotifications: Map,
  
  // Referral State
  referralData: Map,
  referralMap: Map,
  
  // Statistics
  stats: Object,
  
  // Cache
  responseCache: Map,
  priceCache: Map,
  balanceCache: Map,
  
  // Error log
  errorLog: Array,
  
  // System state (mutable)
  lastChatTs: number,
  sleepyMode: boolean,
  forceAwake: boolean,
  lastSpeechEndTime: number,
  totalSpeechTime: number,
  lunaEnergy: number,
  consecutiveMessages: number,
}
```

### State Access

```javascript
// Direct access (Maps, Sets, Arrays)
state.rpsLeaderboard.set(wallet, stats);
state.blockedWallets.add(wallet);

// Mutable values (use update functions)
updateLastChatTs(Date.now());
updateSleepyMode(true);
updateRewardPool(100);
```

---

## 🔧 การแก้ไขและขยายระบบ

### เพิ่ม Route ใหม่

1. สร้างไฟล์ใน `routes/`
```javascript
// routes/myRoute.js
export function setupMyRoutes(app, dependencies) {
  app.get("/my/endpoint", (req, res) => {
    // Your code
  });
}
```

2. Import และ setup ใน `index.js`
```javascript
import { setupMyRoutes } from "./routes/myRoute.js";

const myDependencies = {
  // Dependencies
};

setupMyRoutes(app, myDependencies);
```

### เพิ่ม Service ใหม่

1. สร้างไฟล์ใน `services/`
```javascript
// services/myService.js
export function myFunction(param1, param2) {
  // Your code
}
```

2. Import และใช้ใน routes
```javascript
import { myFunction } from "../services/myService.js";
```

### เพิ่ม Constant ใหม่

1. เพิ่มใน `config/constants.js`
```javascript
export const MY_CONSTANTS = {
  MY_VALUE: 100,
};
```

2. Import และใช้
```javascript
import { MY_CONSTANTS } from "./config/constants.js";
```

---

## 📝 หมายเหตุสำคัญ

1. **Protected Files** - อย่าแก้ไขไฟล์ที่อยู่ใน protected list
2. **State Management** - ใช้ update functions สำหรับ mutable values
3. **Error Handling** - ใช้ `logError` จาก `utils/errorHandler.js`
4. **Validation** - ใช้ `validateWalletAddress` จาก `utils/validation.js`
5. **Security** - อย่า hardcode private keys หรือ sensitive data

---

## 🎯 สรุป

ระบบ Luna AI v10 ถูกออกแบบให้:
- **Modular** - แยก modules, services, routes ชัดเจน
- **Maintainable** - โค้ดอ่านง่าย แก้ไขง่าย
- **Scalable** - เพิ่ม features ใหม่ได้ง่าย
- **Secure** - มี anti-abuse และ security measures

**index.js** ทำหน้าที่เป็น:
- Entry point
- Configuration
- Route setup
- Server initialization

**Business logic** อยู่ใน:
- `services/` - Services layer
- `modules/` - Core modules
- `routes/` - Route handlers





























