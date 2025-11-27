# 📋 รายการตรวจสอบระบบ rps_betting.html

## ✅ ฟีเจอร์หลักที่ต้องตรวจสอบ

### 1. Wallet Connection (Phantom Wallet)
- ✅ Connect Wallet Button
- ✅ Disconnect Wallet Button  
- ✅ Wallet Info Display
- ✅ Auto-connect if already connected

### 2. Balance Checking
- ✅ Luna Token Balance Check
- ✅ SOL Balance Display (Real-time)
- ✅ Real-time Balance Updates (ทุก 15 วินาที)
- ✅ Balance Validation before Create/Join Room

### 3. Contract Address & DEX Links
- ✅ Contract Address Display
- ✅ Copy Contract Address Button
- ✅ View on Solscan Button
- ✅ Buy Luna DEX Link
- ✅ Join Community (X/Twitter) Link

### 4. Competition Timer
- ✅ Weekly Competition Timer Display
- ✅ Real-time Countdown (Days, Hours, Minutes, Seconds)
- ✅ Auto-refresh every second
- ✅ API Endpoint: `/luna/rps/competition/time`

### 5. Total Fees Display
- ✅ Total Fees Collected Display (Real-time)
- ✅ Transaction Count
- ✅ Last Updated Timestamp
- ✅ Fee Wallet Address Display
- ✅ Auto-refresh every 5 seconds
- ✅ API Endpoint: `/luna/rps/betting/fees`

### 6. Create Room
- ✅ Bet Amount Input
- ✅ Fee Display (1% of bet value)
- ✅ Fee Calculation based on Luna Price
- ✅ Create Room Button
- ✅ Validation (minimum bet, balance check)
- ✅ API Endpoint: `/luna/rps/betting/create` (POST)
- ✅ CSRF Token Protection

### 7. Available Rooms List
- ✅ Display All Available Rooms
- ✅ Room Info (Bet Amount, Creator, Status)
- ✅ Fee Display per Room
- ✅ Join Room Button
- ✅ Cancel Room Button (for own room)
- ✅ Auto-refresh every 5 seconds
- ✅ API Endpoint: `/luna/rps/betting/rooms` (GET)

### 8. Join Room
- ✅ Join Room Functionality
- ✅ Balance Validation
- ✅ Auto-start Game when joined
- ✅ API Endpoint: `/luna/rps/betting/join` (POST)

### 9. Game Play
- ✅ Game Area Display
- ✅ Hand Icons (Rock, Paper, Scissors)
- ✅ Choice Buttons
- ✅ Countdown Animation (3-2-1)
- ✅ Hand Cycling Animation
- ✅ Result Display (Win/Lose/Tie)
- ✅ Sound Effects (Win/Lose/Tie/Countdown)
- ✅ Submit Choice
- ✅ API Endpoint: `/luna/rps/betting/submit` (POST)
- ✅ CSRF Token Protection

### 10. Cancel/Leave Room
- ✅ Cancel Room (for creator)
- ✅ Leave Room (for joiner)
- ✅ Confirmation Dialog
- ✅ API Endpoint: `/luna/rps/betting/cancel` (POST)
- ✅ CSRF Token Protection

### 11. WebSocket Real-time Updates
- ✅ WebSocket Connection
- ✅ Auto-reconnect on disconnect
- ✅ Room Created Notification (`rps_betting_room_created`)
- ✅ Room Joined Notification (`rps_betting_room_joined`)
- ✅ Room Cancelled Notification (`rps_betting_room_cancelled`)
- ✅ Room Removed Notification (`rps_betting_room_removed`)
- ✅ Match Result Notification (`rps_betting_match_result`)

### 12. Luna Price Fetching
- ✅ Fetch Luna Price from Backend
- ✅ Price Cache (1 minute TTL)
- ✅ Calculate Fee based on Current Price
- ✅ API Endpoint: `/luna/rps/betting/price` (GET)

### 13. Security Features
- ✅ CSRF Token Management
- ✅ CSRF Token Auto-refresh (every 30 minutes)
- ✅ HTML Sanitization
- ✅ Wallet Address Validation
- ✅ Input Validation

### 14. UI Components
- ✅ Navigation Links (all RPS pages)
- ✅ Neon Toggle Button
- ✅ Notifications System
- ✅ Referral System
- ✅ Chat System
- ✅ Loading Indicators
- ✅ Error Messages

### 15. API Endpoints Verification

#### Backend Endpoints (ต้องมีทั้งหมด):
- ✅ `POST /luna/rps/betting/create` - สร้างห้อง
- ✅ `POST /luna/rps/betting/join` - เข้าร่วมห้อง
- ✅ `POST /luna/rps/betting/submit` - ส่งการเลือก
- ✅ `POST /luna/rps/betting/cancel` - ยกเลิกห้อง
- ✅ `GET /luna/rps/betting/rooms` - ดึงรายการห้อง
- ✅ `GET /luna/rps/betting/price` - ดึงราคา Luna
- ✅ `GET /luna/rps/betting/fees` - ดึงข้อมูลค่า Fee
- ✅ `GET /luna/rps/competition/time` - เวลาแข่งขัน
- ✅ `GET /luna/rps/contract-address` - Contract Address
- ✅ `GET /luna/rps/balance` - ตรวจสอบยอด Luna
- ✅ `GET /luna/rps/sol/balance` - ตรวจสอบยอด SOL
- ✅ `GET /api/csrf-token` - ดึง CSRF Token

---

## ⚠️ สิ่งที่ต้องทดสอบ

### 1. Flow การใช้งานจริง:
1. Connect Wallet
2. Check Balance
3. Create Room (ถ้า balance เพียงพอ)
4. Join Room (ถ้ามี room ว่าง)
5. เล่นเกม (เลือก Rock/Paper/Scissors)
6. ดูผลลัพธ์
7. Cancel/Leave Room

### 2. Edge Cases:
- ✅ Balance ไม่เพียงพอ
- ✅ Room หมดเวลา (5 นาที)
- ✅ WebSocket Disconnect
- ✅ Network Error
- ✅ Invalid Input

### 3. Real-time Updates:
- ✅ Room List Auto-refresh
- ✅ Fees Display Auto-update
- ✅ Competition Timer Auto-update
- ✅ WebSocket Notifications

---

## 🔍 จุดที่ต้องระวัง

1. **CSRF Token**: ตรวจสอบว่ามีการ fetch token ก่อนใช้งาน POST requests
2. **Luna Price**: ตรวจสอบว่า price cache ทำงานถูกต้อง
3. **WebSocket**: ตรวจสอบว่า reconnect ทำงานเมื่อ disconnect
4. **Room Timeout**: ตรวจสอบว่า room หมดเวลา 5 นาที
5. **Balance Updates**: ตรวจสอบว่า balance update ทุก 15 วินาที

---

## 📝 สรุป

### ✅ ระบบพร้อมใช้งาน (ครบ):
- Wallet Connection
- Balance Checking
- Room Management (Create/Join/Cancel)
- Game Play
- Real-time Updates (WebSocket)
- Fees Display
- Competition Timer
- Security (CSRF Protection)

### ⚠️ ต้องทดสอบ:
- ทดสอบ flow การใช้งานจริง
- ทดสอบ edge cases
- ทดสอบ real-time updates
- ทดสอบ WebSocket reconnection

---

**สถานะ**: ✅ ระบบพร้อมใช้งาน - ต้องทดสอบการทำงานจริง


