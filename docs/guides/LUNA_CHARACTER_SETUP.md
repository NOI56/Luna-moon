# Luna Character Viewer Setup Guide

## 📖 ภาพรวม

Luna Character Viewer เป็นระบบแสดงตัวละคร Luna แบบ Web-based ที่สามารถใช้ใน OBS Browser Source ได้ โดยไม่ต้องพึ่ง VTube Studio

## 🎯 ฟีเจอร์

- ✅ **การเคลื่อนไหวอัตโนมัติ**
  - กระพริบตา (ทุก 3-7 วินาที)
  - หายใจ (breathing animation)
  - Micro-movements (ขยับเล็กน้อย)
  - Eye movement (มองไปทางอื่น)

- ✅ **การควบคุมผ่านโค้ด**
  - ขยับปากตามการพูด
  - แสดงอารมณ์ (emotion)
  - หันหน้า (face angle)
  - ระดับพลังงาน (energy level)

- ✅ **เชื่อมต่อกับ Luna AI**
  - รับข้อมูลผ่าน WebSocket
  - อัปเดตแบบ real-time
  - ควบคุมอัตโนมัติตามสถานะ Luna

## 🚀 วิธีใช้งาน

### 1. เปิด Character Viewer

เปิดใน Browser:
```
http://localhost:8787/luna-character
```

หรือใช้ใน OBS Browser Source:
1. เพิ่ม **Browser Source** ใน OBS
2. URL: `http://localhost:8787/luna-character`
3. Width: `1920` (หรือตามต้องการ)
4. Height: `1080` (หรือตามต้องการ)
5. ✅ **Transparent background** (ถ้าต้องการ)

### 2. Debug Mode

เพิ่ม `?debug=true` ใน URL เพื่อดูข้อมูล debug:
```
http://localhost:8787/luna-character?debug=true
```

## 🎨 การปรับแต่ง

### ขนาดตัวละคร

แก้ไขใน `public/luna_character.html`:
```javascript
const scale = Math.min(canvas.width, canvas.height) / 800; // ปรับตัวเลข 800 เพื่อเปลี่ยนขนาด
```

### ความเร็ว Animation

แก้ไขใน `public/luna_character.html`:
```javascript
// Breathing speed
const breathingSpeed = 0.001; // ปรับตัวเลขนี้

// Blink interval
const blinkInterval = 3000 + Math.random() * 4000; // ปรับช่วงเวลา

// Micro-movement interval
if (timeSinceLastMove > 5000 + Math.random() * 10000) { // ปรับช่วงเวลา
```

## 🔧 การพัฒนาต่อ

### เพิ่มโมเดลจริง

ตอนนี้ใช้ placeholder character (วงกลม + หูกระต่าย) คุณสามารถ:

1. **ใช้ Live2D Model:**
   - เพิ่ม Live2D SDK
   - โหลดโมเดล `.model3.json`
   - แทนที่ `drawPlaceholderCharacter()` ด้วย Live2D rendering

2. **ใช้ 3D Model (VRM):**
   - เพิ่ม Three.js + @pixiv/three-vrm
   - โหลดโมเดล `.vrm`
   - แทนที่ Canvas rendering ด้วย 3D rendering

3. **ใช้ 2D Sprite Animation:**
   - โหลด sprite sheets
   - ใช้ Canvas หรือ WebGL
   - แทนที่ `drawPlaceholderCharacter()` ด้วย sprite animation

### เพิ่มการควบคุม

เพิ่มการควบคุมใหม่ใน `index.js`:
```javascript
// Broadcast ข้อมูลไปยัง character viewer
broadcast({
  type: "custom_animation",
  animation: "wave",
  duration: 2000,
});
```

รับข้อมูลใน `luna_character.html`:
```javascript
case 'custom_animation':
  // ทำ animation ตามที่ต้องการ
  break;
```

## 📡 WebSocket Messages

Character viewer รับข้อมูลผ่าน WebSocket:

### `emotion_update`
```json
{
  "type": "emotion_update",
  "emotion": "happy",
  "intensity": 0.7
}
```

### `energy_update`
```json
{
  "type": "energy_update",
  "energy": 0.8
}
```

### `face_angle`
```json
{
  "type": "face_angle",
  "x": 10,
  "y": 0,
  "z": 0
}
```

### `blink`
```json
{
  "type": "blink"
}
```

### `mouth_animation`
```json
{
  "type": "mouth_animation",
  "duration": 2000,
  "text": "Hello!"
}
```

### `luna_message`
```json
{
  "type": "luna_message",
  "text": "Hello!",
  "ttsUrl": "/public/tts/xxx.mp3"
}
```

### `luna_reading_comment`
```json
{
  "type": "luna_reading_comment",
  "text": "User comment",
  "ttsUrl": "/public/tts/xxx.mp3"
}
```

## 🐛 Troubleshooting

### Character ไม่แสดง
- ตรวจสอบว่า server ทำงานอยู่ (`http://localhost:8787/_health`)
- ตรวจสอบ WebSocket connection ใน browser console
- เปิด debug mode (`?debug=true`) เพื่อดูสถานะ

### Animation ไม่ทำงาน
- ตรวจสอบว่า WebSocket รับข้อมูลได้
- ดู console log ใน browser
- ตรวจสอบว่า broadcast ข้อมูลถูกต้อง

### Character ใหญ่/เล็กเกินไป
- ปรับ `scale` ใน `drawCharacter()`
- ปรับขนาด Browser Source ใน OBS

## 📝 หมายเหตุ

- ตอนนี้ใช้ placeholder character (จะต้องแทนที่ด้วยโมเดลจริง)
- ระบบนี้ทำงานควบคู่กับ VTube Studio (ไม่แทนที่)
- สามารถปิด VTube Studio และใช้ระบบนี้แทนได้

## 🔮 แผนการพัฒนาต่อ

- [ ] เพิ่ม Live2D model support
- [ ] เพิ่ม 3D model (VRM) support
- [ ] เพิ่มการควบคุมมือ/แขน
- [ ] เพิ่ม idle animations หลากหลาย
- [ ] เพิ่ม reaction animations (สะดุ้ง, หัวเราะ, ฯลฯ)
- [ ] เพิ่ม lip-sync ที่แม่นยำขึ้น






