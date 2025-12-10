# 🎁 Reward System Analysis - Leaderboard

## ✅ สรุป: ระบบแจกรางวัลจากค่าธรรมเนียมเดิมพัน

### 1. ระบบที่มีอยู่ (Existing Systems)

#### ✅ ระบบเก็บค่าธรรมเนียม (`collectedFees`)
- **Location**: `services/pricingService.js` → `collectFee()`
- **Function**: เก็บค่าธรรมเนียมจากเดิมพัน (3% default, ลดลงตาม tier ถ้ามี deposit)
- **Storage**: เก็บใน memory (Map `collectedFees`)
- **API Endpoint**: `GET /luna/rps/betting/fees`
- **Status**: ✅ ทำงานได้ แต่เก็บเฉพาะข้อมูล (ไม่ส่ง SOL จริง)

#### ✅ ระบบ Reward Pool (`rewardPool`)
- **Location**: `services/solanaService.js` → `distributeRewards()`
- **Function**: แจกรางวัลให้ Top 5 players ตาม leaderboard
- **Distribution**:
  - Rank 1: 20%
  - Rank 2: 10%
  - Rank 3: 5%
  - Rank 4: 3%
  - Rank 5: 2%
  - Remaining 60% → `REWARD_DISTRIBUTION_WALLET`
- **API Endpoints**:
  - `GET /luna/rps/rewards/pool` - ดู reward pool และ distribution plan
  - `POST /luna/rps/rewards/distribute` - แจกรางวัลอัตโนมัติ
- **Status**: ✅ ทำงานได้ แต่ต้องเติม `rewardPool` ด้วยตัวเอง (manual)

#### ✅ ระบบ Leaderboard
- **Location**: `routes/rps-stats.js` → `GET /luna/rps/leaderboard`
- **Function**: แสดง Top 50 players ตาม `totalWon` (Luna won)
- **Data Source**: `rpsLeaderboard` Map
- **Status**: ✅ ทำงานได้

### 2. ❌ ปัญหาที่พบ (Issues)

#### ⚠️ ไม่มีการเชื่อมต่ออัตโนมัติ
1. **`collectedFees` ไม่ได้อัพเดท `rewardPool` อัตโนมัติ**
   - ค่าธรรมเนียมที่เก็บได้ (`collectedFees`) เก็บแยกต่างหาก
   - `rewardPool` ต้องเติมเงินเอง (ไม่มีการ auto-sync)

2. **หน้า Leaderboard ไม่แสดง Reward Pool**
   - ไม่มีการแสดง reward pool status
   - ไม่มีการแสดง distribution plan
   - ไม่มีการแสดงว่ามีรางวัลเท่าไหร่รอแจก

3. **ไม่มีระบบ Auto-Distribution**
   - ต้องเรียก API manual (`POST /luna/rps/rewards/distribute`)
   - ไม่มีการแจกอัตโนมัติเมื่อ competition หมดเวลา

### 3. 📊 Flow ปัจจุบัน (Current Flow)

```
User พนัน → collectFee() → collectedFees (memory)
                                    ↓
                          [NO AUTOMATIC CONNECTION]
                                    ↓
rewardPool ← [MANUAL FILL] ← Admin/Manual Process
                                    ↓
                     distributeRewards() → Top 5 + Distribution Wallet
```

### 4. ✅ Flow ที่ควรเป็น (Recommended Flow)

```
User พนัน → collectFee() → collectedFees (memory)
                                    ↓
                          [AUTO-SYNC] (option 1)
                                    ↓
rewardPool += feeAmount (accumulate automatically)
                                    ↓
Weekly Competition End → Auto-distribute → Top 5 + Distribution Wallet
```

## 🔧 คำแนะนำ (Recommendations)

### Option 1: Auto-Sync Fees to Reward Pool
เพิ่มการอัพเดท `rewardPool` อัตโนมัติเมื่อมีการเก็บค่าธรรมเนียม:

```javascript
// ใน collectFee() function
async function collectFee(collectedFees, sendSol, wallet, feeInSol, roomId, betAmount) {
  // ... existing code ...
  
  // Auto-add to reward pool
  rewardPool.value += feeInSol;
  log.info(`[rps] Fee ${feeInSol} SOL added to reward pool. Total: ${rewardPool.value} SOL`);
}
```

### Option 2: Manual Transfer (Current)
Admin ต้อง:
1. ดูค่าธรรมเนียมทั้งหมด: `GET /luna/rps/betting/fees`
2. ส่ง SOL ไปที่ `REWARD_SENDER_WALLET` (manual)
3. อัพเดท `rewardPool` ผ่าน API หรือ database

### Option 3: Auto-Distribution เมื่อ Competition หมดเวลา
เพิ่ม cron job หรือ scheduled task:
- ตรวจสอบทุกนาทีว่าถึงเวลาจบ competition หรือยัง
- ถ้าใช่ → เรียก `distributeRewards()` อัตโนมัติ

## 🎯 สรุป

### คำตอบ: "Leaderboard มีระบบแจกค่าธรรมเนียมไหม?"

**ตอบ**: 
- ✅ **มีระบบแจกรางวัล** (`POST /luna/rps/rewards/distribute`)
- ✅ **มีระบบเก็บค่าธรรมเนียม** (`collectedFees`)
- ❌ **แต่ไม่เชื่อมกันอัตโนมัติ**
- ❌ **หน้า Leaderboard ไม่แสดง Reward Pool**
- ❌ **ไม่มีการแจกอัตโนมัติเมื่อ competition หมดเวลา**

### สิ่งที่ต้องทำ:
1. **เพิ่มการแสดง Reward Pool บนหน้า Leaderboard**
2. **เพิ่ม Auto-Sync จาก `collectedFees` ไป `rewardPool`** (optional)
3. **เพิ่ม Auto-Distribution เมื่อ competition หมดเวลา** (optional)














