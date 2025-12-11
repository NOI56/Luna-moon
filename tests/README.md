# 🧪 Luna AI - Testing Guide

คู่มือการทดสอบระบบ Luna AI

## 📋 สารบัญ

- [ประเภทการทดสอบ](#ประเภทการทดสอบ)
- [วิธีรันการทดสอบ](#วิธีรันการทดสอบ)
- [โครงสร้างไฟล์ Test](#โครงสร้างไฟล์-test)
- [เขียน Test ใหม่](#เขียน-test-ใหม่)

## 📊 ประเภทการทดสอบ

### 1. Unit Tests (ทดสอบทีละส่วน)
ทดสอบฟังก์ชันหรือ module เดียวๆ

**ตำแหน่ง:** `tests/unit/`

**ตัวอย่าง:**
- `classifier.test.js` - ทดสอบ emotion classification
- `ai.test.js` - ทดสอบ AI functions
- `memory.test.js` - ทดสอบ memory system

### 2. Integration Tests (ทดสอบหลายส่วนร่วมกัน)
ทดสอบหลาย modules ทำงานร่วมกัน

**ตำแหน่ง:** `tests/integration/`

**ตัวอย่าง:**
- `api.test.js` - ทดสอบ API endpoints

### 3. System Tests (ทดสอบทั้งระบบ)
ทดสอบระบบทั้งหมดจากมุมมองผู้ใช้

**ตำแหน่ง:** `tests/`

**ตัวอย่าง:**
- `test-all-systems.js` - ทดสอบระบบทั้งหมด
- `test-backend-systems.js` - ทดสอบ backend systems

## 🚀 วิธีรันการทดสอบ

### รัน Unit Tests ทั้งหมด

```bash
npm test
```

หรือ

```bash
npm run test:unit
```

### รัน Unit Tests แบบละเอียด

```bash
node tests/test-runner.js
```

### รัน Unit Test ไฟล์เดียว

```bash
node --test tests/unit/classifier.test.js
```

### รัน Integration Tests

```bash
node --test tests/integration/api.test.js
```

### รัน System Tests

```bash
npm run test:all
```

### รัน Backend Tests

```bash
npm run test:backend
```

### รัน Tests พร้อม Coverage (Experimental)

```bash
npm run test:coverage
```

## 📁 โครงสร้างไฟล์ Test

```
tests/
├── unit/                    # Unit tests
│   ├── classifier.test.js   # Emotion classification tests
│   ├── ai.test.js          # AI functions tests
│   └── memory.test.js      # Memory system tests
│
├── integration/             # Integration tests
│   └── api.test.js         # API endpoints tests
│
├── test-runner.js          # Test runner script
├── test-all-systems.js     # System tests
├── test-backend-systems.js # Backend tests
├── test-vts.cjs            # VTS connection test
├── test-env.cjs            # Environment test
├── check-api-key.js        # API key check
└── check-system-status.js  # System status check
```

## ✍️ เขียน Test ใหม่

### ตัวอย่าง Unit Test

```javascript
// tests/unit/example.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import { myFunction } from '../../modules/example.js';

test('myFunction - should return expected value', () => {
  const result = myFunction('input');
  assert.strictEqual(result, 'expected', 'Should return expected value');
});

test('myFunction - should handle edge cases', () => {
  assert.strictEqual(myFunction(''), 'default', 'Should handle empty string');
  assert.strictEqual(myFunction(null), 'default', 'Should handle null');
});
```

### ตัวอย่าง Integration Test

```javascript
// tests/integration/example.test.js
import { test } from 'node:test';
import assert from 'node:assert';
import fetch from 'node-fetch';

test('API endpoint - should return correct response', async () => {
  const response = await fetch('http://localhost:8787/api/endpoint');
  const data = await response.json();
  
  assert.strictEqual(response.status, 200, 'Should return 200');
  assert.ok('data' in data, 'Should have data property');
});
```

## 📝 Best Practices

### 1. ตั้งชื่อ Test ให้ชัดเจน
```javascript
// ✅ ดี
test('classifyEmotion - angry messages should return angry', () => {});

// ❌ ไม่ดี
test('test1', () => {});
```

### 2. Test ควรเป็นอิสระจากกัน
```javascript
// ✅ ดี - แต่ละ test เป็นอิสระ
test('test 1', () => {
  const result = myFunction('input');
  assert.strictEqual(result, 'expected');
});

test('test 2', () => {
  const result = myFunction('another input');
  assert.strictEqual(result, 'another expected');
});
```

### 3. Test Edge Cases
```javascript
test('should handle empty input', () => {
  assert.strictEqual(myFunction(''), 'default');
});

test('should handle null input', () => {
  assert.strictEqual(myFunction(null), 'default');
});

test('should handle undefined input', () => {
  assert.strictEqual(myFunction(undefined), 'default');
});
```

### 4. ใช้ Assertions ที่เหมาะสม
```javascript
// ✅ ดี
assert.strictEqual(a, b, 'message');
assert.ok(condition, 'message');
assert.deepStrictEqual(obj1, obj2, 'message');

// ❌ ไม่ดี
if (a !== b) throw new Error('fail');
```

## 🔧 Troubleshooting

### Test ไม่ผ่าน

1. **ตรวจสอบว่า server ทำงานอยู่** (สำหรับ integration tests)
   ```bash
   npm start
   ```

2. **ตรวจสอบ environment variables**
   ```bash
   node tests/test-env.cjs
   ```

3. **รัน test แบบละเอียด**
   ```bash
   node --test --test-reporter=verbose tests/unit/classifier.test.js
   ```

### Test ช้า

- Integration tests อาจช้ากว่า unit tests (ต้องเชื่อมต่อ API)
- ใช้ `--test-timeout` เพื่อเพิ่ม timeout
  ```bash
  node --test --test-timeout=10000 tests/integration/api.test.js
  ```

## 📊 Test Coverage

ตอนนี้ยังไม่มี test coverage tool แต่สามารถใช้:
- `--experimental-test-coverage` (Node.js experimental feature)
- หรือใช้ Jest, Mocha + Istanbul สำหรับ coverage ที่ดีกว่า

## 🎯 สรุป

- **Unit Tests** - ทดสอบฟังก์ชันเดียว
- **Integration Tests** - ทดสอบหลายส่วนร่วมกัน
- **System Tests** - ทดสอบทั้งระบบ

รัน `npm test` เพื่อทดสอบทั้งหมด!
























