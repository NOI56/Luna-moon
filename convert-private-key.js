/**
 * Script สำหรับแปลง Private Key จาก Phantom Wallet เป็น Base58
 * 
 * วิธีใช้:
 * 1. คัดลอก private key array จาก Phantom Wallet
 * 2. วางในตัวแปร privateKeyArray ด้านล่าง
 * 3. รัน: node convert-private-key.js
 * 4. คัดลอกผลลัพธ์ไปใส่ใน .env
 */

const bs58 = require('bs58');

// ⚠️ วาง private key array จาก Phantom Wallet ตรงนี้
// ตัวอย่าง: [123, 45, 67, 89, ...]
const privateKeyArray = [/* วาง private key array จาก Phantom Wallet ตรงนี้ */];

if (!privateKeyArray || privateKeyArray.length === 0) {
  console.error('❌ กรุณาใส่ private key array ในไฟล์นี้ก่อน');
  console.log('\n📝 วิธีใช้:');
  console.log('1. เปิด Phantom Wallet → Settings → Security & Privacy → Export Private Key');
  console.log('2. คัดลอก private key array (เช่น [123, 45, 67, ...])');
  console.log('3. วางในตัวแปร privateKeyArray ในไฟล์นี้');
  console.log('4. รัน: node convert-private-key.js');
  process.exit(1);
}

try {
  // แปลง array เป็น Buffer
  const privateKeyBuffer = Buffer.from(privateKeyArray);
  
  // แปลงเป็น Base58
  const base58PrivateKey = bs58.encode(privateKeyBuffer);
  
  console.log('\n✅ Private Key (Base58):');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(base58PrivateKey);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n📋 คัดลอกค่าไปใส่ใน .env:');
  console.log(`REWARD_SENDER_PRIVATE_KEY=${base58PrivateKey}`);
  console.log('\n⚠️  ข้อควรระวัง:');
  console.log('- เก็บ private key นี้เป็นความลับ!');
  console.log('- อย่า commit ไฟล์ .env ลง Git!');
  console.log('- ใช้ wallet แยกต่างหากสำหรับส่งรางวัล (ไม่ใช่ wallet หลัก)');
  
} catch (error) {
  console.error('❌ เกิดข้อผิดพลาด:', error.message);
  console.log('\n💡 ตรวจสอบว่า:');
  console.log('- Private key array ถูกต้อง');
  console.log('- ติดตั้ง bs58: npm install bs58');
}




