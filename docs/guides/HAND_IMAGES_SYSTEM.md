# ระบบแสดงรูปมือ (Hand Images System)

## 📋 สรุป

ระบบแสดงรูปมือในเกม Rock Paper Scissors ใช้รูปภาพ PNG ที่เก็บไว้ใน `public/images/hands/` และมี emoji fallback เมื่อรูปภาพโหลดไม่สำเร็จ

## 🔧 ไฟล์ที่เกี่ยวข้อง

1. **`public/images/hands/rock.png`** - รูปมือกำ (Rock) ✅ มีอยู่
2. **`public/images/hands/paper.png`** - รูปมือเปิด (Paper) ✅ มีอยู่
3. **`public/images/hands/scissors.png`** - รูปมือชู 2 นิ้ว (Scissors) ✅ มีอยู่
4. **`public/rps_game.html`** - Play PvP! mode
5. **`public/rps_vs_luna.html`** - VS Luna mode
6. **`public/rps_betting.html`** - Betting Mode
7. **`public/rps_overlay.html`** - Overlay mode

## 🎯 คุณสมบัติหลัก

### 1. **Image Path System**
- ใช้ path: `/images/hands/{choice}.png`
- Express.js serve static files จาก `public/` directory โดยอัตโนมัติ
- **ไม่ต้องใส่ `/public` ใน path**

### 2. **Emoji Fallback**
- ถ้ารูปภาพโหลดไม่สำเร็จ → ใช้ emoji แทน
- Rock: 🪨
- Paper: 📄
- Scissors: ✂️
- Default: 👋

### 3. **Auto-Initialization**
- `initializeHands()` ถูกเรียกเมื่อหน้าโหลดเสร็จ
- ตั้งค่า default hand (rock) ให้กับ player และ opponent
- ตั้งค่ารูปมือให้กับปุ่มเลือก (rock, paper, scissors)

## 🔄 Flow การทำงาน

### **Step 1: กำหนด HAND_IMAGES**

```javascript
const HAND_IMAGES = {
  rock: '/images/hands/rock.png',      // ✅ ถูกต้อง (ไม่มี /public)
  paper: '/images/hands/paper.png',    // ✅ ถูกต้อง
  scissors: '/images/hands/scissors.png', // ✅ ถูกต้อง
  default: '/images/hands/rock.png'    // ✅ ถูกต้อง
};

const HAND_EMOJIS = {
  rock: '🪨',
  paper: '📄',
  scissors: '✂️',
  default: '👋'
};
```

### **Step 2: สร้าง getHandDisplay Function**

```javascript
function getHandDisplay(choice) {
  const img = document.createElement('img');
  img.src = HAND_IMAGES[choice] || HAND_IMAGES.default;
  img.alt = choice || 'default';
  img.onerror = function() {
    // Fallback to emoji if image fails to load
    this.parentElement.textContent = HAND_EMOJIS[choice] || HAND_EMOJIS.default;
  };
  return img;
}
```

### **Step 3: Initialize Hands เมื่อหน้าโหลด**

```javascript
document.addEventListener('DOMContentLoaded', async () => {
  // ... other initialization ...
  initializeHands();
});

function initializeHands() {
  const playerHand = document.getElementById('playerHand');
  const lunaHand = document.getElementById('lunaHand');
  const rockBtn = document.getElementById('rockBtn');
  const paperBtn = document.getElementById('paperBtn');
  const scissorsBtn = document.getElementById('scissorsBtn');
  
  // Set default hands (rock)
  if (playerHand) {
    playerHand.innerHTML = '';
    playerHand.appendChild(getHandDisplay('rock'));
  }
  if (lunaHand) {
    lunaHand.innerHTML = '';
    lunaHand.appendChild(getHandDisplay('rock'));
  }
  
  // Set button images
  if (rockBtn) {
    rockBtn.innerHTML = '';
    rockBtn.appendChild(getHandDisplay('rock'));
  }
  if (paperBtn) {
    paperBtn.innerHTML = '';
    paperBtn.appendChild(getHandDisplay('paper'));
  }
  if (scissorsBtn) {
    scissorsBtn.innerHTML = '';
    scissorsBtn.appendChild(getHandDisplay('scissors'));
  }
}
```

### **Step 4: อัปเดตรูปมือเมื่อผู้ใช้เลือก**

```javascript
// เมื่อผู้ใช้เลือกมือ
playerHand.innerHTML = '';
playerHand.appendChild(getHandDisplay(playerChoice));

// เมื่อ opponent เลือกมือ
lunaHand.innerHTML = '';
lunaHand.appendChild(getHandDisplay(opponentChoice));
```

## 📝 Code Structure

### **HAND_IMAGES Configuration**

```javascript
const HAND_IMAGES = {
  rock: '/images/hands/rock.png',      // ✅ ถูกต้อง (ไม่มี /public)
  paper: '/images/hands/paper.png',    // ✅ ถูกต้อง
  scissors: '/images/hands/scissors.png', // ✅ ถูกต้อง
  default: '/images/hands/rock.png'    // ✅ ถูกต้อง
};
```

**❌ ผิด:**
```javascript
rock: '/public/images/hands/rock.png'  // ❌ ผิด! Express serve จาก public/ แล้ว
```

### **getHandDisplay Function**

```javascript
function getHandDisplay(choice) {
  // 1. สร้าง img element
  const img = document.createElement('img');
  
  // 2. ตั้งค่า src จาก HAND_IMAGES
  img.src = HAND_IMAGES[choice] || HAND_IMAGES.default;
  img.alt = choice || 'default';
  
  // 3. ตั้งค่า onerror handler สำหรับ fallback
  img.onerror = function() {
    // ถ้าโหลดรูปไม่สำเร็จ → ใช้ emoji แทน
    this.parentElement.textContent = HAND_EMOJIS[choice] || HAND_EMOJIS.default;
  };
  
  return img;
}
```

### **initializeHands Function**

```javascript
function initializeHands() {
  // 1. Get elements
  const playerHand = document.getElementById('playerHand');
  const lunaHand = document.getElementById('lunaHand');
  const rockBtn = document.getElementById('rockBtn');
  const paperBtn = document.getElementById('paperBtn');
  const scissorsBtn = document.getElementById('scissorsBtn');
  
  // 2. Set default hands (rock)
  if (playerHand) {
    playerHand.innerHTML = '';
    playerHand.appendChild(getHandDisplay('rock'));
  }
  if (lunaHand) {
    lunaHand.innerHTML = '';
    lunaHand.appendChild(getHandDisplay('rock'));
  }
  
  // 3. Set button images
  if (rockBtn) {
    rockBtn.innerHTML = '';
    rockBtn.appendChild(getHandDisplay('rock'));
  }
  if (paperBtn) {
    paperBtn.innerHTML = '';
    paperBtn.appendChild(getHandDisplay('paper'));
  }
  if (scissorsBtn) {
    scissorsBtn.innerHTML = '';
    scissorsBtn.appendChild(getHandDisplay('scissors'));
  }
}
```

## 🎮 วิธีใช้งาน

### **สำหรับผู้ใช้**

1. **ดูรูปมือ**
   - รูปมือจะแสดงอัตโนมัติเมื่อหน้าโหลด
   - ถ้ารูปมือไม่แสดง → ระบบจะใช้ emoji แทน (🪨 📄 ✂️)

2. **เลือกมือ**
   - กดปุ่ม Rock (🪨), Paper (📄), หรือ Scissors (✂️)
   - รูปมือจะอัปเดตตามที่เลือก

### **สำหรับ Developer**

1. **เพิ่มรูปมือใหม่**
   - ใส่ไฟล์ PNG ใน `public/images/hands/`
   - ชื่อไฟล์ต้องตรงกับ: `rock.png`, `paper.png`, `scissors.png`
   - ขนาดแนะนำ: 200x200px ขึ้นไป
   - พื้นหลังโปร่งใส (transparent)

2. **แก้ไข Path**
   - ใช้ `/images/hands/{choice}.png` (ไม่มี `/public`)
   - Express.js serve static files จาก `public/` โดยอัตโนมัติ

3. **แก้ไข Emoji Fallback**
   - แก้ไข `HAND_EMOJIS` object
   - เปลี่ยน emoji ตามต้องการ

## ⚠️ ข้อควรระวัง

1. **Path ต้องถูกต้อง**
   - ✅ ถูก: `/images/hands/rock.png`
   - ❌ ผิด: `/public/images/hands/rock.png`

2. **ไฟล์ต้องมีอยู่จริง**
   - ตรวจสอบว่าไฟล์ PNG อยู่ใน `public/images/hands/`
   - ถ้าไม่มี → ระบบจะใช้ emoji fallback

3. **Image Loading**
   - รูปภาพจะโหลดเมื่อ `getHandDisplay()` ถูกเรียก
   - ถ้าโหลดไม่สำเร็จ → `onerror` handler จะใช้ emoji แทน

4. **Initialization**
   - `initializeHands()` ต้องถูกเรียกเมื่อหน้าโหลด
   - ตรวจสอบว่าเรียกใน `DOMContentLoaded` event

## 🔍 Debugging

### **Console Logs**

ตรวจสอบ console logs:
- ถ้าเห็น `404` error → path ผิด หรือไฟล์ไม่มี
- ถ้าเห็น emoji แสดง → รูปภาพโหลดไม่สำเร็จ (ใช้ fallback)

### **Common Issues**

1. **มือไม่แสดง**
   - ตรวจสอบ path ใน `HAND_IMAGES`
   - ตรวจสอบว่าไฟล์ PNG มีอยู่จริง
   - ตรวจสอบ console logs สำหรับ errors

2. **แสดง emoji แทนรูปภาพ**
   - รูปภาพโหลดไม่สำเร็จ
   - ตรวจสอบ path และไฟล์
   - ตรวจสอบ network tab ใน browser dev tools

3. **รูปภาพแสดงแต่ผิดขนาด**
   - ตรวจสอบ CSS สำหรับ `.hand-icon img`
   - ปรับ `width` และ `height` ตามต้องการ

## 📚 References

- [Express.js Static Files](https://expressjs.com/en/starter/static-files.html)
- [HTML Image Element](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/img)
- [Image onerror Event](https://developer.mozilla.org/en-US/docs/Web/API/HTMLImageElement/error_event)
