# 📝 Luna AI - Logging System Guide

คู่มือการใช้งาน Logging System ของ Luna AI

## 🎯 Overview

Luna AI ใช้ **Winston** เป็น logging library หลัก เพื่อจัดการ logs อย่างเป็นระบบ

### Features

- ✅ **Log Levels** - error, warn, info, verbose, debug, silly
- ✅ **File Logging** - บันทึก logs ลงไฟล์อัตโนมัติ
- ✅ **Log Rotation** - หมุนเวียนไฟล์ logs (max 10MB per file, 5 files)
- ✅ **Console Logging** - แสดง logs ใน console (configurable)
- ✅ **Error Tracking** - แยก error logs ออกมา
- ✅ **Exception Handling** - จัดการ exceptions และ unhandled rejections

## 📁 Log Files

Logs จะถูกบันทึกในโฟลเดอร์ `logs/`:

```
logs/
├── combined.log      # Logs ทั้งหมด (ทุก level)
├── error.log         # Error logs เท่านั้น
├── exceptions.log    # Unhandled exceptions
└── rejections.log    # Unhandled promise rejections
```

### Log File Settings

- **Max Size**: 10MB per file
- **Max Files**: 5 files (หมุนเวียนอัตโนมัติ)
- **Rotation**: อัตโนมัติเมื่อไฟล์เต็ม

## ⚙️ Configuration

### Environment Variables

เพิ่มใน `.env`:

```env
# Log level: error, warn, info, verbose, debug, silly
# Default: info
LOG_LEVEL=info

# Enable console logging (true/false)
# Default: true in development, false in production
LOG_CONSOLE=true

# Enable verbose logging (show metadata in console)
# Default: false
LOG_VERBOSE=false
```

### Log Levels

| Level | Priority | Usage |
|-------|----------|-------|
| **error** | 0 | Errors ที่ต้องแก้ไข |
| **warn** | 1 | Warnings ที่ควรระวัง |
| **info** | 2 | ข้อมูลทั่วไป (default) |
| **verbose** | 3 | ข้อมูลละเอียด |
| **debug** | 4 | ข้อมูลสำหรับ debugging |
| **silly** | 5 | ข้อมูลละเอียดมาก |

### ตัวอย่างการตั้งค่า

```env
# Production - แสดงเฉพาะ errors และ warnings
LOG_LEVEL=warn
LOG_CONSOLE=false

# Development - แสดงทุกอย่าง
LOG_LEVEL=debug
LOG_CONSOLE=true
LOG_VERBOSE=true
```

## 💻 การใช้งาน

### Import Logger

```javascript
import { log } from "./modules/logger.js";
```

### ใช้ Log Functions

```javascript
// Info - ข้อมูลทั่วไป
log.info("Server started successfully");
log.info(`User ${username} connected`);

// Warn - คำเตือน
log.warn("API rate limit approaching");
log.warn(`Suspicious activity detected: ${type}`);

// Error - ข้อผิดพลาด
log.error("Failed to connect to database");
log.error("Error processing request:", error);

// Debug - สำหรับ debugging
log.debug("Processing request:", { userId, action });
log.debug(`Cache hit rate: ${hitRate}%`);

// Verbose - ข้อมูลละเอียด
log.verbose("Detailed operation info:", metadata);

// Silly - ข้อมูลละเอียดมาก
log.silly("Very detailed debug info:", data);
```

### ตัวอย่าง Log Output

#### Console (with colors)
```
10:30:45 [info] Luna v10 server listening on http://0.0.0.0:8787
10:30:45 [info] 🌐 Server is accessible from other devices on your network!
10:30:46 [warn] [config] ⚠️  Configuration warnings:
10:30:46 [error] [rps-competition] ✗ Auto-distribution failed: Insufficient balance
```

#### File (JSON format)
```
2024-01-01 10:30:45 [INFO] Luna v10 server listening on http://0.0.0.0:8787
2024-01-01 10:30:45 [INFO] 🌐 Server is accessible from other devices on your network!
2024-01-01 10:30:46 [WARN] [config] ⚠️  Configuration warnings:
2024-01-01 10:30:46 [ERROR] [rps-competition] ✗ Auto-distribution failed: Insufficient balance
```

## 🔍 การดู Logs

### ดู Logs แบบ Real-time

```bash
# ดู logs ทั้งหมด
tail -f logs/combined.log

# ดู error logs เท่านั้น
tail -f logs/error.log

# ดู logs พร้อม filter
tail -f logs/combined.log | grep "error"
```

### ดู Logs แบบ Filter

```bash
# หา error logs
grep "ERROR" logs/combined.log

# หา logs ของ module หนึ่ง
grep "\[rps-competition\]" logs/combined.log

# นับจำนวน errors
grep -c "ERROR" logs/combined.log
```

## 📊 Log Analysis

### วิเคราะห์ Logs

```bash
# นับ logs ตาม level
grep -c "\[INFO\]" logs/combined.log
grep -c "\[WARN\]" logs/combined.log
grep -c "\[ERROR\]" logs/combined.log

# หา errors ที่เกิดขึ้นบ่อย
grep "ERROR" logs/combined.log | sort | uniq -c | sort -rn

# ดู logs ของวันนี้
grep "$(date +%Y-%m-%d)" logs/combined.log
```

## 🛠️ Best Practices

### 1. ใช้ Log Levels อย่างเหมาะสม

```javascript
// ✅ Good
log.info("User logged in");
log.warn("Rate limit approaching");
log.error("Database connection failed", error);

// ❌ Bad
log.error("User logged in"); // ควรเป็น info
log.info("Database connection failed"); // ควรเป็น error
```

### 2. เพิ่ม Context ใน Logs

```javascript
// ✅ Good
log.info(`[rps-competition] Competition started`, { 
  endTime: competitionEndTime,
  participants: participantCount 
});

// ❌ Bad
log.info("Competition started"); // ไม่มี context
```

### 3. ใช้ Debug สำหรับ Detailed Info

```javascript
// ✅ Good
log.debug("Processing request", { 
  userId, 
  action, 
  timestamp: Date.now() 
});

// ❌ Bad
log.info("Processing request", { userId, action, timestamp }); // ควรเป็น debug
```

### 4. อย่า Log Sensitive Data

```javascript
// ❌ Bad - อย่าทำ!
log.info("User credentials", { username, password });
log.debug("Private key:", privateKey);

// ✅ Good
log.info("User authenticated", { username });
log.debug("Transaction signed", { txHash });
```

## 🔧 Troubleshooting

### Logs ไม่แสดงใน Console

ตรวจสอบว่า `LOG_CONSOLE=true` ใน `.env`

### Logs ไม่ถูกบันทึกลงไฟล์

ตรวจสอบว่า:
1. โฟลเดอร์ `logs/` มีอยู่และมีสิทธิ์เขียน
2. Disk space เพียงพอ
3. File permissions ถูกต้อง

### Logs ใหญ่เกินไป

- ตั้งค่า `LOG_LEVEL=warn` หรือ `LOG_LEVEL=error`
- ไฟล์จะหมุนเวียนอัตโนมัติเมื่อถึง 10MB

### ต้องการ Logs ละเอียดขึ้น

- ตั้งค่า `LOG_LEVEL=debug` หรือ `LOG_LEVEL=silly`
- ตั้งค่า `LOG_VERBOSE=true` เพื่อแสดง metadata

## 📚 ข้อมูลเพิ่มเติม

- Winston Documentation: https://github.com/winstonjs/winston
- Log Levels: https://github.com/winstonjs/winston#logging-levels
- Log Rotation: https://github.com/winstonjs/winston-daily-rotate-file

---

**หมายเหตุ:** Logging System ใช้ Winston และรองรับ log rotation, file logging, และ console logging












