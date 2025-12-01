# 📊 Stats Page - การทำงานและอธิบาย

## ✅ สถานะ: ทำงานได้

หน้า Stats (`rps_stats.html`) **ทำงานได้** และแสดงสถิติการเล่นเกมของผู้เล่น

## 🔍 การทำงาน (How It Works)

### 1. Frontend (`public/rps_stats.html`)

#### 1.1 Wallet Connection
- ต้องเชื่อมต่อ Phantom Wallet ก่อน
- ใช้ `phantom-helper.js` สำหรับ auto-connect
- ถ้ายังไม่เชื่อมต่อ จะแสดงข้อความ "Please connect your wallet to view stats"

#### 1.2 API Call
เมื่อเชื่อมต่อ wallet แล้ว จะเรียก:
```
GET /luna/rps/stats?wallet={wallet_address}
```

#### 1.3 Display Stats
แสดงสถิติในรูปแบบ Grid Cards:
- **Total Games**: จำนวนเกมทั้งหมดที่เล่น
- **Wins**: จำนวนครั้งที่ชนะ
- **Losses**: จำนวนครั้งที่แพ้
- **Draws**: จำนวนครั้งที่เสมอ (ปัจจุบันยังไม่ track)
- **Win Rate**: อัตราการชนะ (%) = (Wins / Total Games) × 100
- **Total Won**: จำนวน Luna tokens ที่ชนะมา

### 2. Backend (`routes/rps-stats.js`)

#### 2.1 API Endpoint
```
GET /luna/rps/stats?wallet=wallet_address
```

#### 2.2 Data Source
ดึงข้อมูลจาก `rpsLeaderboard` Map:
```javascript
const playerStats = rpsLeaderboard.get(wallet);
```

#### 2.3 Response Format
```json
{
  "ok": true,
  "stats": {
    "totalGames": 50,
    "wins": 30,
    "losses": 20,
    "draws": 0,
    "totalWon": 500000
  },
  "wallet": "wallet_address",
  "message": "Statistics loaded successfully"
}
```

### 3. Data Flow

```
User เชื่อมต่อ Wallet
    ↓
Frontend เรียก API: GET /luna/rps/stats?wallet=...
    ↓
Backend ดึงข้อมูลจาก rpsLeaderboard Map
    ↓
คำนวณ: totalGames = wins + losses
    ↓
ส่งกลับ JSON response
    ↓
Frontend แสดงผลใน Grid Cards
```

## 📊 ข้อมูลที่แสดง

### Stat Cards (6 ใบ)

1. **Total Games** 
   - คำนวณจาก: `wins + losses`
   - แสดง: จำนวนเกมทั้งหมด

2. **Wins**
   - จาก: `rpsLeaderboard[wallet].wins`
   - แสดง: จำนวนครั้งที่ชนะ

3. **Losses**
   - จาก: `rpsLeaderboard[wallet].losses`
   - แสดง: จำนวนครั้งที่แพ้

4. **Draws**
   - ปัจจุบัน: `0` (ยังไม่ track)
   - แสดง: จำนวนครั้งที่เสมอ

5. **Win Rate**
   - คำนวณจาก: `(wins / totalGames) × 100`
   - แสดง: อัตราการชนะ (%)

6. **Total Won**
   - จาก: `rpsLeaderboard[wallet].totalWon`
   - แสดง: จำนวน Luna tokens ที่ชนะมา

## ⚠️ ข้อจำกัด (Limitations)

### 1. ข้อมูลมาจาก Betting Mode เท่านั้น
- `rpsLeaderboard` จะอัพเดทเฉพาะเมื่อเล่น **Betting Mode**
- การเล่น VS Luna หรือ PvP Matchmaking **ยังไม่ถูกบันทึก** ใน leaderboard

### 2. Draws ไม่ได้ Track
- ปัจจุบันยังไม่มีการ track draws แยกต่างหาก
- ถ้ามี draw จะไม่นับเป็น win หรือ loss

### 3. ข้อมูลอยู่ใน Memory
- `rpsLeaderboard` เก็บข้อมูลใน memory (Map)
- ถ้า server restart ข้อมูลจะหาย (ยกเว้น Betting Mode ที่มีการบันทึก)

## 🔧 การอัพเดท Stats

Stats จะถูกอัพเดทเมื่อ:
- ✅ **Betting Mode**: เมื่อมีการจบ match และมีผลแพ้ชนะ
  - Location: `routes/rps-betting.js` → `POST /luna/rps/betting/submit`
  - อัพเดท: `wins++`, `losses++`, `totalWon += betAmount * 2`

Stats **ยังไม่ถูกอัพเดท** เมื่อ:
- ❌ **VS Luna**: การเล่นกับ Luna โดยตรง
- ❌ **PvP Matchmaking**: การเล่น PvP

## 📝 สรุป

### ✅ สิ่งที่ทำงานได้:
1. Frontend page พร้อมใช้งาน
2. API endpoint ทำงานได้
3. ดึงข้อมูลจาก `rpsLeaderboard` ได้
4. แสดงผลสถิติได้ถูกต้อง

### ⚠️ สิ่งที่ต้องระวัง:
1. ข้อมูลจะแสดงเฉพาะผู้ที่เล่น Betting Mode
2. ถ้ายังไม่เคยเล่น Betting Mode จะแสดง 0 ทั้งหมด
3. Draws ยังไม่ track

### 💡 คำแนะนำ:
ถ้าต้องการให้ Stats ครบถ้วน ควรเพิ่มการอัพเดท `rpsLeaderboard` ใน:
- VS Luna endpoint (`POST /luna/rps/play`)
- PvP Matchmaking endpoint (`POST /luna/rps/submit`)



