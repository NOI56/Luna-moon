/**
 * Script สำหรับ derive Private Key จาก Recovery Phrase (Seed Phrase)
 * 
 * วิธีใช้:
 * 1. ใส่ Recovery Phrase ในตัวแปร recoveryPhrase ด้านล่าง
 * 2. รัน: node derive-private-key-from-seed.js
 * 3. คัดลอก Private Key (Base58) ไปใส่ใน .env
 */

import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { createHash } from 'crypto';

/**
 * Derive private key from seed phrase (simplified method)
 * Note: This is a simplified derivation. For production, use proper BIP44 derivation.
 */
function deriveKeypairFromSeedPhrase(seedPhrase) {
  // Convert seed phrase to seed
  const seed = createHash('sha256').update(seedPhrase).digest();
  
  // Use first 32 bytes as private key
  const privateKey = seed.slice(0, 32);
  
  // Create keypair from private key
  const keypair = Keypair.fromSeed(privateKey);
  
  return keypair;
}

// ⚠️ ใส่ Recovery Phrase ของคุณตรงนี้ (12 คำ คั่นด้วยช่องว่าง)
const recoveryPhrase = "fox weapon doll identify danger hub since blood range slogan guitar damp";

if (!recoveryPhrase || recoveryPhrase.trim() === "") {
  console.error('❌ กรุณาใส่ Recovery Phrase ในไฟล์นี้ก่อน');
  console.log('\n📝 วิธีใช้:');
  console.log('1. เปิดไฟล์ derive-private-key-from-seed.js');
  console.log('2. ใส่ Recovery Phrase ในตัวแปร recoveryPhrase (บรรทัด 25)');
  console.log('3. รัน: node derive-private-key-from-seed.js');
  process.exit(1);
}

try {
  console.log('\n🔐 กำลัง derive Private Key จาก Recovery Phrase...\n');
  
  const keypair = deriveKeypairFromSeedPhrase(recoveryPhrase);
  const privateKeyBase58 = bs58.encode(keypair.secretKey);
  const publicKey = keypair.publicKey.toString();
  
  console.log('✅ สำเร็จ!\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📍 Public Key (Wallet Address):');
  console.log(publicKey);
  console.log('\n🔐 Private Key (Base58) - คัดลอกไปใส่ใน .env:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(privateKeyBase58);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n📋 ใส่ใน .env:');
  console.log(`REWARD_SENDER_PRIVATE_KEY=${privateKeyBase58}`);
  console.log('\n⚠️  ข้อควรระวัง:');
  console.log('- เก็บ private key นี้เป็นความลับ!');
  console.log('- อย่า commit ไฟล์ .env ลง Git!');
  console.log('- Wallet Address: ' + publicKey);
  console.log('\n💡 ตรวจสอบว่า Wallet Address ตรงกับ wallet ที่คุณต้องการใช้');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ เสร็จสิ้น!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
} catch (error) {
  console.error('❌ เกิดข้อผิดพลาด:', error.message);
  console.log('\n💡 ตรวจสอบว่า:');
  console.log('- Recovery Phrase ถูกต้อง (12 คำ)');
  console.log('- Recovery Phrase คั่นด้วยช่องว่าง');
  process.exit(1);
}





