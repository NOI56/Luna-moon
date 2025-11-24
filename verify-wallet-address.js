/**
 * Script สำหรับตรวจสอบ Wallet Address จาก Private Key
 * 
 * วิธีใช้:
 * 1. รัน: node verify-wallet-address.js
 * 2. เปรียบเทียบ Wallet Address ที่ได้กับ wallet ใน Phantom Wallet
 */

import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

// อ่าน Private Key จาก .env
import dotenv from 'dotenv';
dotenv.config();

const privateKey = process.env.REWARD_SENDER_PRIVATE_KEY;

if (!privateKey || privateKey === 'your_private_key_here') {
  console.error('❌ ไม่พบ REWARD_SENDER_PRIVATE_KEY ใน .env');
  console.log('\n💡 กรุณาใส่ Private Key ใน .env ก่อน');
  process.exit(1);
}

try {
  console.log('\n🔍 กำลังตรวจสอบ Wallet Address...\n');
  
  // Decode private key
  const secretKey = bs58.decode(privateKey);
  const keypair = Keypair.fromSecretKey(secretKey);
  const publicKey = keypair.publicKey.toString();
  
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📍 Wallet Address จาก Private Key:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(publicKey);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n📋 วิธีตรวจสอบ:');
  console.log('1. เปิด Phantom Wallet');
  console.log('2. ดู Wallet Address (คลิกที่ "Account 1" หรือ copy icon)');
  console.log('3. เปรียบเทียบกับ Wallet Address ด้านบน');
  console.log('\n✅ ถ้าตรงกัน → ใช้ได้เลย!');
  console.log('❌ ถ้าไม่ตรง → ควรสร้าง wallet ใหม่ (ใช้ generate-reward-wallet.js)');
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
} catch (error) {
  console.error('❌ เกิดข้อผิดพลาด:', error.message);
  console.log('\n💡 ตรวจสอบว่า:');
  console.log('- Private Key ใน .env ถูกต้อง');
  console.log('- Private Key เป็น Base58 format');
  process.exit(1);
}

