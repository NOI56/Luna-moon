# ระบบ Connect Phantom Wallet

## 📋 สรุป

ระบบ Connect Phantom Wallet ถูกออกแบบให้ทำงานเหมือนกันทุกหน้า (Play PvP!, VS Luna, Group Chat) โดยใช้ระบบแบบ pump.fun ที่ต้อง sign message เพื่อ authentication

## 🔧 ไฟล์ที่เกี่ยวข้อง

1. **`public/rps_game.html`** - Play PvP! mode
2. **`public/rps_vs_luna.html`** - VS Luna mode
3. **`public/group_chat.html`** - Group Chat mode

## 🎯 คุณสมบัติหลัก

### 1. **Cancellation System**
- ผู้ใช้สามารถยกเลิกการเชื่อมต่อได้โดยการกดปุ่มอีกครั้งขณะกำลังเชื่อมต่อ
- ใช้ `isConnecting` flag และ `activeConnectAttemptId` เพื่อ track connection attempts
- ใช้ `isStaleAttempt()` เพื่อตรวจสอบว่า attempt ยัง valid หรือไม่

### 2. **Timeout Protection**
- `CONNECTION_TIMEOUT_MS = 8000` (8 วินาที) สำหรับ wallet connection
- `SIGN_TIMEOUT_MS = 8000` (8 วินาที) สำหรับ message signature
- ใช้ `withTimeout()` function เพื่อป้องกันการค้าง

### 3. **Persistent Connection**
- เก็บ signature ใน `localStorage` เพื่อ persistent connection
- Auto-reconnect เมื่อ refresh หน้า (ถ้ามี valid signature)

### 4. **State Management**
- ตรวจสอบ state mismatch ระหว่าง flags และ actual connection
- Reset state อัตโนมัติเมื่อพบ mismatch

## 🔄 Flow การทำงาน

### **Step 1: User กด Connect Button**

```
1. ตรวจสอบ isConnecting flag
   ├── ถ้า true → Cancel และ return
   └── ถ้า false → ตั้ง isConnecting = true

2. อัปเดตปุ่ม → "⏳ Connecting... (Click again to cancel)"

3. ตรวจสอบ state mismatch
   ├── ถ้ามี mismatch → Reset state
   └── ถ้าไม่มี → ต่อ

4. ตรวจสอบ already connected
   ├── ถ้า connected และ UI แสดง connected → Block duplicate popup
   └── ถ้าไม่ → ต่อ
```

### **Step 2: Disconnect First (Force Popup)**

```
1. Disconnect wallet (ถ้า connected)
2. รอ 300ms เพื่อ clear cached connection
3. ตรวจสอบ isStaleAttempt() → ถ้า cancelled return
```

### **Step 3: Connect Wallet**

```
1. เรียก window.solana.connect({ onlyIfTrusted: false })
2. ใช้ withTimeout() เพื่อป้องกันการค้าง
3. ตรวจสอบ isStaleAttempt() → ถ้า cancelled return
4. ตรวจสอบ response.publicKey
5. เก็บ walletPublicKey
```

### **Step 4: Sign Message (Authentication)**

```
1. สร้าง authentication message
   - Format: "Sign in to {hostname}: {timestamp}"
   - Encode เป็น Uint8Array

2. เรียก window.solana.request({ method: 'signMessage', ... })
   หรือ window.solana.signMessage()
3. ใช้ withTimeout() เพื่อป้องกันการค้าง
4. ตรวจสอบ isStaleAttempt() → ถ้า cancelled return
5. เก็บ signature ใน localStorage
```

### **Step 5: Update UI**

```
1. ตั้ง walletConnected = true
2. Reset isConnecting = false
3. อัปเดต UI:
   - ซ่อน connect button
   - แสดง disconnect button
   - แสดง wallet info
   - แสดง balance
```

### **Step 6: Error Handling**

```
1. ตรวจสอบ isStaleAttempt() → ถ้า cancelled ignore error
2. Reset isConnecting = false
3. อัปเดตปุ่ม → "🔗 Connect Phantom Wallet"
4. แสดง alert (ถ้าไม่ใช่ user cancellation)
```

## 📝 Code Structure

### **Variables**

```javascript
let walletConnected = false;
let isConnecting = false; // Prevent multiple connection attempts
let activeConnectAttemptId = 0; // Track connection attempts for cancellation
let walletPublicKey = null;

const CONNECTION_TIMEOUT_MS = 8000;
const SIGN_TIMEOUT_MS = 8000;
```

### **Helper Functions**

```javascript
// Timeout helper
async function withTimeout(promise, timeoutMs, timeoutMessage) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });
  try {
    const result = await Promise.race([promise, timeoutPromise]);
    return result;
  } finally {
    clearTimeout(timeoutId);
  }
}

// Update buttons helper
const updateButtons = (disabled, text) => {
  const cursor = disabled ? 'not-allowed' : 'pointer';
  if (connectBtn) {
    connectBtn.disabled = disabled;
    connectBtn.style.cursor = cursor;
    connectBtn.textContent = text;
  }
  if (connectBtnFixed) {
    connectBtnFixed.disabled = disabled;
    connectBtnFixed.style.cursor = cursor;
    connectBtnFixed.textContent = text;
  }
};
```

### **Connect Handler Pattern**

```javascript
const connectHandler = async (e) => {
  // 1. Check if already connecting → Cancel
  if (isConnecting) {
    activeConnectAttemptId++;
    isConnecting = false;
    updateButtons(false, '🔗 Connect Phantom Wallet');
    try {
      if (window.solana && window.solana.isConnected) {
        await window.solana.disconnect();
      }
    } catch (cancelErr) {
      console.warn('Ignore disconnect error during manual cancel:', cancelErr);
    }
    return;
  }

  const attemptId = ++activeConnectAttemptId;
  const isStaleAttempt = () => attemptId !== activeConnectAttemptId;

  // 2. Set flag IMMEDIATELY
  isConnecting = true;
  updateButtons(true, '⏳ Connecting... (Click again to cancel)');

  // 3. Check state mismatch
  // 4. Check already connected
  // 5. Disconnect first
  // 6. Connect wallet
  // 7. Sign message
  // 8. Update UI
  // 9. Error handling
};
```

## 🎮 วิธีใช้งาน

### **สำหรับผู้ใช้**

1. **Connect Wallet**
   - กดปุ่ม "🔗 Connect Phantom Wallet"
   - อนุมัติการเชื่อมต่อใน Phantom wallet popup
   - อนุมัติการ sign message ใน Phantom wallet popup
   - Wallet จะเชื่อมต่อและเก็บ signature สำหรับ persistent connection

2. **Cancel Connection**
   - กดปุ่มอีกครั้งขณะกำลังเชื่อมต่อ
   - ระบบจะยกเลิกการเชื่อมต่อทันที

3. **Disconnect Wallet**
   - กดปุ่ม "🔌 Disconnect / Change Wallet"
   - Wallet จะถูก disconnect และ signature จะถูกลบ

### **สำหรับ Developer**

1. **เพิ่ม Wallet Connection ในหน้าใหม่**
   - Copy pattern จาก `rps_vs_luna.html`
   - เพิ่ม `withTimeout()` function
   - เพิ่ม timeout constants
   - ใช้ `isConnecting` และ `activeConnectAttemptId` flags
   - ใช้ `isStaleAttempt()` ในทุก async operation
   - ใช้ `updateButtons()` helper function

2. **แก้ไข Error Handling**
   - ตรวจสอบ `isStaleAttempt()` ก่อนแสดง error
   - Reset `isConnecting` flag ในทุก error case
   - แสดง alert เฉพาะเมื่อไม่ใช่ user cancellation

## ⚠️ ข้อควรระวัง

1. **State Management**
   - ตรวจสอบ state mismatch ระหว่าง flags และ actual connection
   - Reset state อัตโนมัติเมื่อพบ mismatch

2. **Cancellation**
   - ตรวจสอบ `isStaleAttempt()` ในทุก async operation
   - Return ทันทีเมื่อพบ stale attempt

3. **Error Handling**
   - ไม่แสดง alert เมื่อ user cancel
   - Reset flags ในทุก error case

4. **Timeout**
   - ใช้ `withTimeout()` สำหรับทุก async operation ที่อาจค้าง
   - ตั้ง timeout ที่เหมาะสม (8 วินาที)

## 🔍 Debugging

### **Console Logs**

ทุกไฟล์จะมี console logs ที่ชัดเจน:
- `[VS Luna]`, `[Game]`, `[Group Chat]` prefix
- `⚠️` สำหรับ warnings
- `✅` สำหรับ success
- `❌` สำหรับ errors

### **Common Issues**

1. **Popup ไม่แสดง**
   - ตรวจสอบว่า Phantom wallet ถูก unlock แล้ว
   - ตรวจสอบ browser popup blocker
   - ตรวจสอบว่า site อยู่ใน trusted apps หรือไม่

2. **Connection ค้าง**
   - ตรวจสอบ timeout settings
   - ตรวจสอบ network connection
   - ตรวจสอบ Phantom wallet status

3. **State Mismatch**
   - ตรวจสอบ console logs
   - Reset state manually (disconnect และ reconnect)

## 📚 References

- [Phantom Wallet API Documentation](https://docs.phantom.app/)
- [Solana Web3.js Documentation](https://solana-labs.github.io/solana-web3.js/)
- [pump.fun Wallet Connection Pattern](https://pump.fun/)























