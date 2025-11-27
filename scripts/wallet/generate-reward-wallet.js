/**
 * Script สำหรับสร้าง Wallet ใหม่สำหรับส่งรางวัล
 * 
 * วิธีใช้:
 * 1. รัน: node generate-reward-wallet.js
 * 2. คัดลอก Private Key (Base58) ไปใส่ใน .env
 * 3. ส่ง SOL ไปที่ Wallet Address ที่สร้างขึ้นมา
 */

import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

console.log('\n🎁 สร้าง Wallet สำหรับส่งรางวัล\n');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

// สร้าง Wallet ใหม่
const newKeypair = Keypair.generate();
const privateKeyBase58 = bs58.encode(newKeypair.secretKey);
const publicKey = newKeypair.publicKey.toString();

console.log('✅ Wallet ใหม่ถูกสร้างแล้ว!\n');
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
console.log('- ส่ง SOL ไปที่ wallet address นี้เพื่อใช้ส่งรางวัล');
console.log(`- Wallet Address: ${publicKey}`);
console.log('\n💡 ขั้นตอนต่อไป:');
console.log('1. คัดลอก Private Key ไปใส่ใน .env');
console.log('2. ส่ง SOL ไปที่ Wallet Address นี้ (ใช้ Phantom Wallet)');
console.log('3. Wallet นี้จะใช้สำหรับส่งรางวัลอัตโนมัติ');
console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('✅ เสร็จสิ้น!');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

