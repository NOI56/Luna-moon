# คู่มือการจัดการเวอร์ชั่นและการ Rollback
## สำหรับ Luna AI v10 บน Northflank

---

## 📋 สารบัญ

1. [การ Rollback เวอร์ชั่นก่อนหน้า](#การ-rollback-เวอร์ชั่นก่อนหน้า)
2. [การจัดการเวอร์ชั่นด้วย Git Tags](#การจัดการเวอร์ชั่นด้วย-git-tags)
3. [การทดสอบก่อน Deploy](#การทดสอบก่อน-deploy)
4. [การสร้าง Staging Environment](#การสร้าง-staging-environment)
5. [Workflow แนะนำ](#workflow-แนะนำ)

---

## 🔄 การ Rollback เวอร์ชั่นก่อนหน้า

### วิธีที่ 1: Rollback ผ่าน Northflank Dashboard (ง่ายที่สุด)

1. **เข้าไปที่ Northflank Dashboard:**
   ```
   https://app.northflank.com/t/lunamoons-team/project/luna/services/lunamoon
   ```

2. **ไปที่แท็บ "Deployments" หรือ "Commits":**
   - จะเห็นรายการ deployments ทั้งหมดที่เคย deploy
   - แต่ละ deployment จะมี commit hash และ timestamp

3. **เลือก Deployment ที่ต้องการ Rollback:**
   - คลิกที่ deployment ที่ต้องการ (เวอร์ชั่นก่อนหน้า)
   - ดู commit hash และวันที่ deploy

4. **คลิก "Rollback" หรือ "Redeploy":**
   - Northflank จะ deploy กลับไปใช้โค้ดจาก commit นั้น
   - รอให้ build และ deploy เสร็จ (ประมาณ 2-5 นาที)

5. **ตรวจสอบว่า Rollback สำเร็จ:**
   - ไปที่ Logs เพื่อดูว่า service รันปกติ
   - ทดสอบ Health Check endpoint

### วิธีที่ 2: Rollback ผ่าน Git (แนะนำสำหรับการจัดการระยะยาว)

#### ขั้นตอนที่ 1: ดู Commit History

```bash
# ดู commit history
git log --oneline -20

# ดู commit รายละเอียด
git log --oneline --graph --all -20
```

#### ขั้นตอนที่ 2: สร้าง Tag สำหรับเวอร์ชั่นที่ Stable

```bash
# สร้าง tag สำหรับเวอร์ชั่นปัจจุบัน (v1.0.0)
git tag -a v1.0.0 -m "Version 1.0.0 - Stable Release"
git push origin v1.0.0

# สร้าง tag สำหรับเวอร์ชั่นใหม่ที่กำลังทดสอบ (v2.0.0-beta)
git tag -a v2.0.0-beta -m "Version 2.0.0 - Beta Testing"
git push origin v2.0.0-beta
```

#### ขั้นตอนที่ 3: Rollback ไปใช้ Tag เก่า

```bash
# ดู tags ทั้งหมด
git tag -l

# Checkout ไปใช้ tag เก่า (v1.0.0)
git checkout v1.0.0

# สร้าง branch ใหม่สำหรับ rollback
git checkout -b rollback-v1.0.0

# Push ไป GitHub
git push origin rollback-v1.0.0

# หรือ merge กลับไป main
git checkout main
git merge rollback-v1.0.0
git push origin main
```

---

## 🏷️ การจัดการเวอร์ชั่นด้วย Git Tags

### สร้าง Tag สำหรับเวอร์ชั่น Stable

```bash
# สร้าง annotated tag (แนะนำ)
git tag -a v1.0.0 -m "Version 1.0.0 - Production Stable"
git push origin v1.0.0

# สร้าง tag สำหรับเวอร์ชั่นทดสอบ
git tag -a v2.0.0-beta -m "Version 2.0.0 - Beta Testing"
git push origin v2.0.0-beta
```

### ดู Tags ทั้งหมด

```bash
# ดู tags ทั้งหมด
git tag -l

# ดู tags พร้อม commit messages
git tag -l -n9
```

### Deploy จาก Tag เฉพาะ

1. **ใน Northflank Dashboard:**
   - ไปที่ Service Settings → **Source**
   - เปลี่ยน Branch/Tag จาก `main` เป็น `v1.0.0` (หรือ tag ที่ต้องการ)
   - คลิก "Save & Deploy"

2. **หรือใช้ Git:**
   ```bash
   # Checkout tag ที่ต้องการ
   git checkout v1.0.0
   
   # สร้าง branch จาก tag
   git checkout -b deploy-v1.0.0
   
   # Push ไป GitHub
   git push origin deploy-v1.0.0
   ```

---

## 🧪 การทดสอบก่อน Deploy

### วิธีที่ 1: สร้าง Staging Branch

```bash
# สร้าง branch สำหรับทดสอบ
git checkout -b staging-v2.0.0

# Push ไป GitHub
git push origin staging-v2.0.0
```

**ใน Northflank:**
1. สร้าง Service ใหม่ชื่อ `lunamoon-staging`
2. ตั้งค่า Source Branch เป็น `staging-v2.0.0`
3. ใช้ Environment Variables เหมือนกับ production (หรือแยกต่างหาก)
4. ทดสอบเวอร์ชั่นใหม่บน staging ก่อน
5. เมื่อพร้อมแล้ว ค่อย merge กลับไป `main` และ deploy production

### วิธีที่ 2: ใช้ Git Tags สำหรับ Testing

```bash
# สร้าง tag สำหรับ testing
git tag -a v2.0.0-test -m "Version 2.0.0 - Testing"
git push origin v2.0.0-test

# ใน Northflank: เปลี่ยน Source Tag เป็น v2.0.0-test
# ทดสอบเสร็จแล้ว ค่อยเปลี่ยนกลับเป็น main หรือ v1.0.0
```

### วิธีที่ 3: Deploy ไป Staging Environment แยก

1. **สร้าง Service ใหม่ใน Northflank:**
   - Service Name: `lunamoon-staging`
   - Source Branch: `staging` หรือ `develop`
   - Environment: แยกจาก production

2. **ทดสอบบน Staging:**
   - ทดสอบฟีเจอร์ใหม่ทั้งหมด
   - ตรวจสอบ logs และ errors
   - ทดสอบ performance

3. **เมื่อพร้อมแล้ว:**
   - Merge `staging` → `main`
   - Deploy production service

---

## 🏗️ การสร้าง Staging Environment

### ขั้นตอนที่ 1: สร้าง Staging Branch

```bash
# สร้าง branch สำหรับ staging
git checkout -b staging
git push origin staging
```

### ขั้นตอนที่ 2: สร้าง Service ใหม่ใน Northflank

1. **ไปที่ Project Dashboard:**
   ```
   https://app.northflank.com/t/lunamoons-team/project/luna
   ```

2. **คลิก "Add Service" → "Git Repository"**

3. **ตั้งค่า Service:**
   - **Service Name:** `lunamoon-staging`
   - **Source Repository:** `NOI56/Luna-moon`
   - **Branch:** `staging`
   - **Build Command:** `npm install`
   - **Start Command:** `node index.js`

4. **ตั้งค่า Environment Variables:**
   - ใช้เหมือนกับ production (หรือแยกต่างหาก)
   - อาจจะใช้ API keys แยกสำหรับ testing

5. **ตั้งค่า Resources:**
   - อาจจะใช้ resources น้อยกว่า production (เพื่อประหยัดค่าใช้จ่าย)

### ขั้นตอนที่ 3: Workflow การใช้งาน

```bash
# 1. พัฒนาและทดสอบบน staging branch
git checkout staging
# ... ทำการแก้ไข ...
git add .
git commit -m "Add new feature X"
git push origin staging
# → Northflank จะ auto-deploy ไป staging environment

# 2. ทดสอบบน staging environment
# → ตรวจสอบ logs, errors, performance

# 3. เมื่อพร้อมแล้ว merge ไป main
git checkout main
git merge staging
git push origin main
# → Northflank จะ auto-deploy ไป production
```

---

## 🔄 Workflow แนะนำ

### Workflow สำหรับการทดสอบก่อน Deploy

```
┌─────────────────────────────────────────────────────────┐
│ 1. พัฒนา Feature ใหม่                                    │
│    git checkout -b feature/new-feature                  │
│    ... ทำการแก้ไข ...                                    │
│    git commit -m "Add new feature"                      │
│    git push origin feature/new-feature                  │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ 2. Merge ไป Staging Branch                              │
│    git checkout staging                                 │
│    git merge feature/new-feature                        │
│    git push origin staging                              │
│    → Auto-deploy ไป Staging Environment                 │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ 3. ทดสอบบน Staging Environment                          │
│    - ทดสอบฟีเจอร์ใหม่                                    │
│    - ตรวจสอบ logs และ errors                            │
│    - ทดสอบ performance                                  │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ 4. เมื่อพร้อมแล้ว Merge ไป Main                         │
│    git checkout main                                    │
│    git merge staging                                    │
│    git tag -a v2.0.0 -m "Version 2.0.0"               │
│    git push origin main --tags                          │
│    → Auto-deploy ไป Production                          │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ 5. ถ้ามีปัญหา → Rollback                                 │
│    - ไปที่ Northflank Dashboard                        │
│    - เลือก Deployment เก่า (v1.0.0)                    │
│    - คลิก "Rollback"                                    │
└─────────────────────────────────────────────────────────┘
```

### Workflow สำหรับการเปิดเวอร์ชั่น 1 ก่อน แล้วค่อยเปิดเวอร์ชั่น 2

```
┌─────────────────────────────────────────────────────────┐
│ สถานะปัจจุบัน: Production = v1.0.0 (Stable)              │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ 1. พัฒนา v2.0.0 บน Branch แยก                           │
│    git checkout -b release/v2.0.0                       │
│    ... พัฒนาและแก้ไข ...                                 │
│    git commit -m "Version 2.0.0 features"              │
│    git push origin release/v2.0.0                       │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ 2. Deploy v2.0.0 ไป Staging Environment                 │
│    - สร้าง Service: lunamoon-staging                    │
│    - Source Branch: release/v2.0.0                      │
│    - ทดสอบบน staging ก่อน                                │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ 3. Production ยังใช้ v1.0.0 อยู่                        │
│    - Service: lunamoon (Production)                     │
│    - Source Branch: main (v1.0.0)                       │
│    - ผู้ใช้ยังใช้เวอร์ชั่น 1.0.0 ตามปกติ                  │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ 4. เมื่อ v2.0.0 พร้อมแล้ว                                │
│    git checkout main                                    │
│    git merge release/v2.0.0                             │
│    git tag -a v2.0.0 -m "Version 2.0.0 Release"        │
│    git push origin main --tags                          │
│    → Auto-deploy v2.0.0 ไป Production                   │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│ 5. ถ้ามีปัญหา → Rollback กลับ v1.0.0                     │
│    - ไปที่ Northflank Dashboard                        │
│    - Service: lunamoon                                  │
│    - Deployments → เลือก v1.0.0 → Rollback              │
└─────────────────────────────────────────────────────────┘
```

---

## 📝 คำสั่ง Git ที่มีประโยชน์

### ดู Commit History

```bash
# ดู commit history แบบย่อ
git log --oneline -20

# ดู commit history พร้อม graph
git log --oneline --graph --all -20

# ดู commit history พร้อมวันที่
git log --pretty=format:"%h - %an, %ar : %s" -10
```

### ดู Tags

```bash
# ดู tags ทั้งหมด
git tag -l

# ดู tags พร้อม commit messages
git tag -l -n9

# ดู commit ของ tag
git show v1.0.0
```

### Rollback ไป Commit เก่า

```bash
# ดู commit hash
git log --oneline

# Checkout ไป commit เก่า (ดูอย่างเดียว)
git checkout <commit-hash>

# สร้าง branch จาก commit เก่า
git checkout -b rollback-<commit-hash> <commit-hash>

# Push ไป GitHub
git push origin rollback-<commit-hash>
```

---

## 🎯 สรุป: วิธีที่แนะนำสำหรับการทดสอบก่อน Deploy

### สำหรับกรณีของคุณ (เปิด v1 ก่อน แล้วค่อยเปิด v2)

1. **ตอนนี้:**
   - Production ใช้ `main` branch (v1.0.0)
   - สร้าง tag: `git tag -a v1.0.0 -m "Version 1.0.0 Stable"`

2. **พัฒนา v2.0.0:**
   - สร้าง branch: `git checkout -b release/v2.0.0`
   - พัฒนาและ commit บน branch นี้
   - Push: `git push origin release/v2.0.0`

3. **ทดสอบ v2.0.0:**
   - สร้าง Staging Service ใน Northflank
   - ตั้งค่า Source Branch = `release/v2.0.0`
   - ทดสอบบน staging

4. **เมื่อพร้อมแล้ว:**
   - Merge: `git checkout main && git merge release/v2.0.0`
   - Tag: `git tag -a v2.0.0 -m "Version 2.0.0"`
   - Push: `git push origin main --tags`
   - Production จะ auto-deploy v2.0.0

5. **ถ้ามีปัญหา:**
   - Rollback ผ่าน Northflank Dashboard
   - เลือก deployment v1.0.0 → Rollback

---

## 🆘 Troubleshooting

### ปัญหา: Rollback แล้วยังใช้โค้ดใหม่

**วิธีแก้:**
1. ตรวจสอบว่า rollback สำเร็จใน Logs
2. ลอง Clear Cache หรือ Hard Refresh
3. ตรวจสอบว่า Service ใช้ Branch/Tag ที่ถูกต้อง

### ปัญหา: ไม่เห็น Deployment เก่าใน Northflank

**วิธีแก้:**
1. ตรวจสอบว่าเคย deploy commit นั้นจริงๆ
2. ใช้ Git เพื่อดู commit history
3. Deploy manual จาก commit hash

---

**Made with ❤️ for Luna AI Streamer**

