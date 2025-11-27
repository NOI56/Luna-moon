# 💾 Luna AI - Backup System Guide

คู่มือการใช้งาน Backup System

## 🎯 Overview

Luna AI มีระบบ backup อัตโนมัติและ manual สำหรับ database และ memory files เพื่อป้องกันข้อมูลหาย

### Features

- ✅ **Automatic Backups** - Backup อัตโนมัติตาม schedule
- ✅ **Manual Backups** - สร้าง backup เองได้ผ่าน API
- ✅ **Backup Rotation** - เก็บ backup เก่าไว้ (configurable)
- ✅ **Restore Functionality** - Restore จาก backup ได้
- ✅ **Backup Statistics** - ดูสถิติ backup

## 📁 Files Backed Up

ระบบจะ backup ไฟล์ต่อไปนี้:

1. **Database**: `tmp/luna.db` - SQLite database
2. **Memory**: `tmp/luna_memory.json` - User memory data
3. **Memory Log**: `tmp/luna_memory_log.jsonl` - Memory log file
4. **Personality**: `tmp/personality.json` - Personality data (optional)

## ⚙️ Configuration

### Environment Variables

เพิ่มใน `.env`:

```env
# เปิดใช้งาน auto-backup (true/false)
# Default: true
AUTO_BACKUP_ENABLED=true

# ระยะเวลาระหว่าง backup (milliseconds)
# Default: 3600000 (1 hour)
# ตัวอย่าง: 1800000 = 30 นาที, 86400000 = 24 ชั่วโมง
BACKUP_INTERVAL=3600000

# จำนวน backup ที่เก็บไว้ (ลบ backup เก่าอัตโนมัติ)
# Default: 10
MAX_BACKUPS=10
```

### Backup Directory

Backups จะถูกเก็บใน `backups/` directory:

```
backups/
├── backup-2024-01-01T12-00-00/
│   ├── luna.db
│   ├── luna_memory.json
│   ├── luna_memory_log.jsonl
│   ├── personality.json (optional)
│   └── backup-metadata.json
├── backup-2024-01-01T13-00-00/
│   └── ...
└── ...
```

## 🔄 Automatic Backups

### Enable Auto-Backup

Auto-backup จะทำงานอัตโนมัติเมื่อ:
1. `AUTO_BACKUP_ENABLED=true` (default)
2. Server start

### Backup Schedule

- **Initial Backup**: สร้าง backup ทันทีเมื่อ server start
- **Periodic Backups**: สร้าง backup ตาม `BACKUP_INTERVAL`

### ตัวอย่าง Schedule

```env
# Backup ทุก 30 นาที
BACKUP_INTERVAL=1800000

# Backup ทุก 6 ชั่วโมง
BACKUP_INTERVAL=21600000

# Backup ทุก 24 ชั่วโมง
BACKUP_INTERVAL=86400000
```

## 📡 API Endpoints

### Create Backup (Admin only)

```http
POST /luna/admin/backup/create
Headers:
  x-admin-secret: your_admin_secret
```

**Response:**
```json
{
  "ok": true,
  "message": "Backup created successfully",
  "backupPath": "backups/backup-2024-01-01T12-00-00",
  "backedUpFiles": 4
}
```

### List Backups (Admin only)

```http
GET /luna/admin/backup/list
Headers:
  x-admin-secret: your_admin_secret
```

**Response:**
```json
{
  "ok": true,
  "backups": [
    {
      "path": "backups/backup-2024-01-01T12-00-00",
      "name": "backup-2024-01-01T12-00-00",
      "timestamp": "2024-01-01T12:00:00.000Z",
      "files": ["luna.db", "luna_memory.json", "luna_memory_log.jsonl"],
      "backedUpFiles": 4
    }
  ],
  "count": 5
}
```

### Get Backup Statistics (Admin only)

```http
GET /luna/admin/backup/stats
Headers:
  x-admin-secret: your_admin_secret
```

**Response:**
```json
{
  "ok": true,
  "stats": {
    "totalBackups": 5,
    "totalSize": 5242880,
    "totalSizeMB": "5.00",
    "maxBackups": 10,
    "oldestBackup": "2024-01-01T00:00:00.000Z",
    "newestBackup": "2024-01-01T12:00:00.000Z"
  }
}
```

### Restore Backup (Admin only)

```http
POST /luna/admin/backup/restore
Headers:
  x-admin-secret: your_admin_secret
Content-Type: application/json

Body:
{
  "backupName": "backup-2024-01-01T12-00-00"
}
```

**Response:**
```json
{
  "ok": true,
  "message": "Backup restored successfully",
  "restoredFiles": 4
}
```

## 💻 การใช้งาน

### 1. สร้าง Backup Manual

```bash
curl -X POST http://localhost:8787/luna/admin/backup/create \
  -H "x-admin-secret: your_admin_secret"
```

### 2. ดู List Backups

```bash
curl http://localhost:8787/luna/admin/backup/list \
  -H "x-admin-secret: your_admin_secret"
```

### 3. ดู Backup Statistics

```bash
curl http://localhost:8787/luna/admin/backup/stats \
  -H "x-admin-secret: your_admin_secret"
```

### 4. Restore จาก Backup

```bash
curl -X POST http://localhost:8787/luna/admin/backup/restore \
  -H "x-admin-secret: your_admin_secret" \
  -H "Content-Type: application/json" \
  -d '{"backupName": "backup-2024-01-01T12-00-00"}'
```

## 🔧 Backup Rotation

### Automatic Cleanup

ระบบจะลบ backup เก่าอัตโนมัติเมื่อ:
- จำนวน backup เกิน `MAX_BACKUPS`
- ลบ backup เก่าที่สุดก่อน

### ตัวอย่าง

```env
# เก็บ backup ไว้ 10 ตัว (default)
MAX_BACKUPS=10

# เก็บ backup ไว้ 30 ตัว
MAX_BACKUPS=30

# เก็บ backup ไว้ 5 ตัว
MAX_BACKUPS=5
```

## 📊 Backup Metadata

แต่ละ backup มี metadata file (`backup-metadata.json`):

```json
{
  "timestamp": "2024-01-01T12:00:00.000Z",
  "files": [
    "luna.db",
    "luna_memory.json",
    "luna_memory_log.jsonl",
    "personality.json"
  ],
  "backedUpFiles": 4
}
```

## 🛠️ Troubleshooting

### Backup ไม่ทำงาน

**ตรวจสอบ:**
1. `AUTO_BACKUP_ENABLED=true` ใน `.env`
2. `backups/` directory มีสิทธิ์เขียน
3. ดู logs: `logs/combined.log` หรือ `logs/error.log`

### Backup ใหญ่เกินไป

**Solution:**
- ลด `MAX_BACKUPS` เพื่อเก็บ backup น้อยลง
- ลบ backup เก่าด้วยตัวเอง
- ตรวจสอบว่า database ไม่ใหญ่เกินไป

### Restore ไม่สำเร็จ

**ตรวจสอบ:**
1. Backup name ถูกต้อง
2. Backup directory มีอยู่
3. ไฟล์ใน backup ครบถ้วน
4. ดู error message ใน response

## 📚 Best Practices

### 1. ตั้งค่า Backup Schedule

```env
# Production: Backup ทุก 6 ชั่วโมง
BACKUP_INTERVAL=21600000
MAX_BACKUPS=30

# Development: Backup ทุก 1 ชั่วโมง
BACKUP_INTERVAL=3600000
MAX_BACKUPS=10
```

### 2. ตรวจสอบ Backups เป็นระยะ

```bash
# ดู list backups
curl http://localhost:8787/luna/admin/backup/list \
  -H "x-admin-secret: your_admin_secret"

# ดู statistics
curl http://localhost:8787/luna/admin/backup/stats \
  -H "x-admin-secret: your_admin_secret"
```

### 3. สร้าง Backup ก่อน Deploy

```bash
# สร้าง backup ก่อน deploy
curl -X POST http://localhost:8787/luna/admin/backup/create \
  -H "x-admin-secret: your_admin_secret"
```

### 4. Test Restore

```bash
# ทดสอบ restore จาก backup
curl -X POST http://localhost:8787/luna/admin/backup/restore \
  -H "x-admin-secret: your_admin_secret" \
  -H "Content-Type: application/json" \
  -d '{"backupName": "backup-2024-01-01T12-00-00"}'
```

### 5. Backup External Storage

สำหรับ production, ควร backup ไปยัง external storage:
- Cloud storage (AWS S3, Google Cloud Storage)
- Network drive
- External backup service

## 🔗 ข้อมูลเพิ่มเติม

- Environment Variables: `env.example`
- Logging System: `docs/guides/LOGGING_SYSTEM.md`
- API Documentation: `docs/guides/API_DOCUMENTATION.md`

---

**หมายเหตุ:** Backup System ทำงานอัตโนมัติและช่วยป้องกันข้อมูลหาย

