/**
 * Script สำหรับตรวจสอบ Private Key และใส่ใน .env
 */

import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

const privateKey = process.argv[2] || "ZbZ6Y8isdAT5LVdhVGmhaRCHgbvkS6pezyQcMUQ1HHCWtyX64yM6KzCmGyxaqzPERhFPpKzLLETzv5CH6WNrjhv";

try {
  console.log('\n🔍 กำลังตรวจสอบ Private Key...\n');
  
  // Decode private key
  const secretKey = bs58.decode(privateKey);
  const keypair = Keypair.fromSecretKey(secretKey);
  const publicKey = keypair.publicKey.toString();
  
  console.log('✅ Private Key ถูกต้อง!\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📍 Wallet Address (Public Key):');
  console.log(publicKey);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('\n📋 Private Key (Base58):');
  console.log(privateKey);
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ พร้อมใส่ใน .env แล้ว!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  // Return wallet address for use in .env update
  process.stdout.write(publicKey);
  
} catch (error) {
  console.error('❌ เกิดข้อผิดพลาด:', error.message);
  console.log('\n💡 ตรวจสอบว่า:');
  console.log('- Private Key ถูกต้อง');
  console.log('- Private Key เป็น Base58 format');
  process.exit(1);
}

