# คู่มือการอัปโหลดรูปภาพ (Image Upload Guide)
## สำหรับ Luna AI v10

---

## 📋 สรุป

ระบบ Luna AI v10 รองรับการอัปโหลดรูปภาพผ่าน API endpoint `/luna/chat/upload` สำหรับใช้ใน Group Chat

---

## 🔧 สิ่งที่ต้องใช้

### 1. **API Endpoint**

```
POST /luna/chat/upload
```

**Base URL:**
- Local: `http://localhost:8787`
- Production: `https://site--lunamoon--xwnj5s5p9mkb.code.run`

### 2. **Request Headers**

```javascript
{
  'Content-Type': 'application/json'
}
```

### 3. **Request Body (JSON)**

```javascript
{
  "roomId": "group_chat",           // ต้องเป็น "group_chat"
  "wallet": "YOUR_WALLET_ADDRESS",  // Solana wallet address (ต้อง valid)
  "fileName": "image.png",          // ชื่อไฟล์
  "mimeType": "image/png",           // MIME type ของไฟล์
  "data": "data:image/png;base64,..." // Base64 encoded image data
}
```

### 4. **Response (Success)**

```javascript
{
  "ok": true,
  "url": "/uploads/chat/1234567890-abc123-image.png",
  "mimeType": "image/png",
  "size": 123456,  // ขนาดไฟล์ใน bytes
  "name": "image.png"
}
```

### 5. **Response (Error)**

```javascript
{
  "ok": false,
  "error": "Error message here"
}
```

---

## 📝 รายละเอียด Parameters

### **roomId** (Required)
- **Type:** String
- **Value:** ต้องเป็น `"group_chat"` เท่านั้น
- **Description:** Room ID สำหรับ chat

### **wallet** (Required)
- **Type:** String
- **Format:** Solana wallet address (base58)
- **Validation:** ต้องเป็น valid Solana wallet address
- **Example:** `"CbB4ivri6wLfqx4NwrWY3ArD7mXv1e91HeYeq3KBpump"`

### **fileName** (Required)
- **Type:** String
- **Max Length:** 100 characters
- **Allowed Characters:** `a-zA-Z0-9._-`
- **Example:** `"my-image.png"`, `"photo.jpg"`

### **mimeType** (Required)
- **Type:** String
- **Allowed Types:**
  - `image/png`
  - `image/jpeg`
  - `image/jpg`
  - `image/gif`
  - `image/webp`
- **Example:** `"image/png"`

### **data** (Required)
- **Type:** String
- **Format:** Base64 encoded image data
- **Format Options:**
  - `data:image/png;base64,<base64_data>` (with data URI prefix)
  - `<base64_data>` (without prefix - จะถูกตัดออกอัตโนมัติ)
- **Max Size:** 5 MB (5,242,880 bytes)
- **Example:** `"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."`

---

## 🔒 ข้อจำกัดและข้อกำหนด

### **File Size Limit**
- **Maximum:** 5 MB (5,242,880 bytes)
- **Error Message:** `"File too large. Max 5.0 MB"`

### **Allowed File Types**
- ✅ PNG (`image/png`)
- ✅ JPEG (`image/jpeg`, `image/jpg`)
- ✅ GIF (`image/gif`)
- ✅ WebP (`image/webp`)
- ❌ อื่นๆ (จะได้ error: `"Unsupported file type"`)

### **File Name Sanitization**
- ตัวอักษรพิเศษจะถูกลบออกอัตโนมัติ
- เก็บเฉพาะ: `a-zA-Z0-9._-`
- ชื่อไฟล์จะถูกตัดให้เหลือ 100 characters

### **Unique File Names**
- ระบบจะเพิ่ม timestamp และ random string ให้อัตโนมัติ
- Format: `<timestamp>-<random>-<sanitized_filename>`
- Example: `1701234567890-abc123-my-image.png`

---

## 💻 ตัวอย่างโค้ด

### **JavaScript (Frontend)**

```javascript
// 1. อ่านไฟล์เป็น Base64
function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// 2. อัปโหลดรูปภาพ
async function uploadImage(file, walletAddress) {
  try {
    // อ่านไฟล์เป็น Base64
    const base64 = await readFileAsBase64(file);
    
    // ส่งไปยัง API
    const response = await fetch(`${API_BASE}/luna/chat/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        roomId: 'group_chat',
        wallet: walletAddress,
        fileName: file.name,
        mimeType: file.type,
        data: base64
      })
    });
    
    const data = await response.json();
    
    if (data.ok) {
      console.log('Upload successful:', data.url);
      return data;
    } else {
      throw new Error(data.error || 'Upload failed');
    }
  } catch (error) {
    console.error('Upload error:', error);
    throw error;
  }
}

// 3. ใช้งาน
const fileInput = document.getElementById('imageInput');
fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  // ตรวจสอบประเภทไฟล์
  const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    alert('Invalid file type. Only images are allowed.');
    return;
  }
  
  // ตรวจสอบขนาดไฟล์
  if (file.size > 5 * 1024 * 1024) {
    alert('File too large. Max 5 MB.');
    return;
  }
  
  // อัปโหลด
  try {
    const walletAddress = 'YOUR_WALLET_ADDRESS'; // ต้องเป็น valid wallet
    const result = await uploadImage(file, walletAddress);
    console.log('Image URL:', result.url);
  } catch (error) {
    alert('Failed to upload image: ' + error.message);
  }
});
```

### **HTML Input**

```html
<input 
  type="file" 
  id="imageInput" 
  accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
  style="display: none;"
>
<button onclick="document.getElementById('imageInput').click()">
  Upload Image
</button>
```

### **cURL Example**

```bash
curl -X POST https://site--lunamoon--xwnj5s5p9mkb.code.run/luna/chat/upload \
  -H "Content-Type: application/json" \
  -d '{
    "roomId": "group_chat",
    "wallet": "YOUR_WALLET_ADDRESS",
    "fileName": "test.png",
    "mimeType": "image/png",
    "data": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
  }'
```

### **Python Example**

```python
import requests
import base64

def upload_image(image_path, wallet_address, api_base="https://site--lunamoon--xwnj5s5p9mkb.code.run"):
    # อ่านไฟล์และแปลงเป็น base64
    with open(image_path, 'rb') as f:
        image_data = f.read()
        base64_data = base64.b64encode(image_data).decode('utf-8')
        data_uri = f"data:image/png;base64,{base64_data}"
    
    # ส่ง request
    response = requests.post(
        f"{api_base}/luna/chat/upload",
        json={
            "roomId": "group_chat",
            "wallet": wallet_address,
            "fileName": image_path.split('/')[-1],
            "mimeType": "image/png",
            "data": data_uri
        }
    )
    
    return response.json()

# ใช้งาน
result = upload_image("test.png", "YOUR_WALLET_ADDRESS")
print(result)
```

---

## 📂 ไฟล์ที่เก็บ

### **Storage Location**
- **Path:** `public/uploads/chat/`
- **Full Path:** `D:\LunaAI_v10_Project\public\uploads\chat\` (local)
- **URL Path:** `/uploads/chat/<filename>`

### **File Naming**
- Format: `<timestamp>-<random>-<sanitized_filename>`
- Example: `1701234567890-abc123-my-image.png`
- **Unique:** แต่ละไฟล์จะมีชื่อไม่ซ้ำกัน

---

## 🔍 Error Handling

### **Common Errors**

#### 1. Invalid Room
```json
{
  "ok": false,
  "error": "Invalid room"
}
```
**สาเหตุ:** `roomId` ไม่ใช่ `"group_chat"`

#### 2. Invalid Wallet
```json
{
  "ok": false,
  "error": "Valid wallet is required"
}
```
**สาเหตุ:** `wallet` ไม่ใช่ valid Solana wallet address

#### 3. Invalid Payload
```json
{
  "ok": false,
  "error": "Invalid upload payload"
}
```
**สาเหตุ:** `fileName`, `mimeType`, หรือ `data` ไม่ครบ

#### 4. Unsupported File Type
```json
{
  "ok": false,
  "error": "Unsupported file type"
}
```
**สาเหตุ:** `mimeType` ไม่ใช่ประเภทที่รองรับ

#### 5. File Too Large
```json
{
  "ok": false,
  "error": "File too large. Max 5.0 MB"
}
```
**สาเหตุ:** ไฟล์ใหญ่กว่า 5 MB

#### 6. Upload Failed
```json
{
  "ok": false,
  "error": "Failed to upload attachment"
}
```
**สาเหตุ:** Error ในการเขียนไฟล์ (server error)

---

## ✅ Checklist ก่อนอัปโหลด

- [ ] ไฟล์เป็นประเภทที่รองรับ (PNG, JPEG, GIF, WebP)
- [ ] ขนาดไฟล์ไม่เกิน 5 MB
- [ ] มี wallet address ที่ valid
- [ ] `roomId` เป็น `"group_chat"`
- [ ] ไฟล์ถูกแปลงเป็น Base64 แล้ว
- [ ] `mimeType` ตรงกับประเภทไฟล์จริง

---

## 🎯 Use Cases

### **1. Group Chat Image Upload**
- ผู้ใช้สามารถอัปโหลดรูปภาพใน Group Chat
- รูปภาพจะถูกแสดงใน chat message
- URL ของรูปภาพจะถูกส่งไปพร้อมกับ message

### **2. Profile Picture**
- สามารถใช้ endpoint นี้เพื่ออัปโหลด profile picture
- เก็บ URL ที่ได้จาก response
- ใช้ URL นี้แสดงรูปภาพใน profile

### **3. Custom Hand Images**
- สำหรับ RPS game สามารถอัปโหลดรูปมือ custom
- เก็บไฟล์ใน `public/images/hands/`
- ใช้ชื่อไฟล์: `rock.png`, `paper.png`, `scissors.png`

---

## 🔐 Security Considerations

### **1. File Validation**
- ✅ ตรวจสอบ MIME type
- ✅ ตรวจสอบขนาดไฟล์
- ✅ Sanitize ชื่อไฟล์
- ✅ จำกัดประเภทไฟล์ที่รองรับ

### **2. Wallet Validation**
- ✅ ตรวจสอบว่า wallet address ถูกต้อง
- ✅ ใช้ wallet address เพื่อระบุตัวตน

### **3. Rate Limiting**
- ⚠️ ควรเพิ่ม rate limiting ในอนาคต
- ⚠️ จำกัดจำนวนการอัปโหลดต่อ user

### **4. Storage**
- ⚠️ ไฟล์เก็บใน local storage (ไม่ใช่ cloud storage)
- ⚠️ ควรพิจารณาใช้ cloud storage (S3, Cloudinary) ในอนาคต

---

## 📚 References

- [FileReader API](https://developer.mozilla.org/en-US/docs/Web/API/FileReader)
- [Base64 Encoding](https://developer.mozilla.org/en-US/docs/Web/API/btoa)
- [Express.js File Upload](https://expressjs.com/en/resources/middleware/multer.html)
- [Solana Wallet Address Format](https://docs.solana.com/terminology#address)

---

## 🆘 Troubleshooting

### **ปัญหา: Upload ไม่สำเร็จ**

**วิธีแก้:**
1. ตรวจสอบว่า wallet address ถูกต้อง
2. ตรวจสอบว่า `roomId` เป็น `"group_chat"`
3. ตรวจสอบว่าไฟล์ไม่เกิน 5 MB
4. ตรวจสอบว่า MIME type ถูกต้อง
5. ดู error message ใน response

### **ปัญหา: ไฟล์ไม่แสดง**

**วิธีแก้:**
1. ตรวจสอบ URL ที่ได้จาก response
2. ตรวจสอบว่าไฟล์ถูกบันทึกใน `public/uploads/chat/`
3. ตรวจสอบว่า Express serve static files จาก `public/`
4. ตรวจสอบ network tab ใน browser dev tools

### **ปัญหา: Base64 encoding ไม่ถูกต้อง**

**วิธีแก้:**
1. ใช้ `FileReader.readAsDataURL()` สำหรับ JavaScript
2. ใช้ `base64.b64encode()` สำหรับ Python
3. ตรวจสอบว่า data URI format ถูกต้อง: `data:image/png;base64,<data>`

---

**Made with ❤️ for Luna AI Streamer**












