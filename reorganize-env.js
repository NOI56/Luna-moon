/**
 * Script สำหรับจัดเรียงไฟล์ .env ให้เรียบร้อย
 */

import { readFileSync, writeFileSync } from 'fs';

const envContent = readFileSync('.env', 'utf-8');
const lines = envContent.split('\n');

const newLines = [];
let i = 0;

while (i < lines.length) {
  const line = lines[i];
  
  // จัดเรียง Betting Fee Wallet
  if (line.match(/^# Betting Fee Wallet/)) {
    newLines.push('');
    newLines.push('# ============================================');
    newLines.push('# Betting Fee Collection Configuration');
    newLines.push('# ============================================');
    newLines.push('# Wallet Address สำหรับรับค่าธรรมเนียมจากการเดิมพัน (ส่งอัตโนมัติ)');
    i++;
    if (i < lines.length && lines[i].match(/^BETTING_FEE_WALLET=/)) {
      newLines.push('BETTING_FEE_WALLET=EvQ1xAkmhLJviWBcZAiQaZVw31P3egeJeeBeX6mS6FVW');
      i++;
    }
    newLines.push('');
    continue;
  }
  
  // จัดเรียง Reward Distribution Configuration
  if (line.match(/^# Reward Distribution Configuration/)) {
    newLines.push('# ============================================');
    newLines.push('# Reward Distribution Configuration');
    newLines.push('# ============================================');
    newLines.push('# Wallet Address สำหรับรับ 60% ของรางวัลที่เหลือ (หลังแจก Top 5)');
    i++;
    if (i < lines.length && lines[i].match(/^REWARD_DISTRIBUTION_WALLET=/)) {
      newLines.push('REWARD_DISTRIBUTION_WALLET=ofLr5MWJVjZNzR9xSomLLKUaEvVsdQG79b21W12t8Sp');
      i++;
    }
    
    // เพิ่ม Private Key section
    if (i < lines.length && lines[i].match(/^REWARD_SENDER_PRIVATE_KEY=/)) {
      newLines.push('');
      newLines.push('# Private Key สำหรับส่ง SOL อัตโนมัติ');
      newLines.push('# Wallet Address: EvQ1xAkmhLJviWBcZAiQaZVw31P3egeJeeBeX6mS6FVW (ตรงกับ BETTING_FEE_WALLET)');
      newLines.push('# ใช้สำหรับ: ส่งค่าธรรมเนียม + ส่งรางวัลให้ Top 5 + ส่ง 60% ไปที่ REWARD_DISTRIBUTION_WALLET');
      newLines.push('REWARD_SENDER_PRIVATE_KEY=ZbZ6Y8isdAT5LVdhVGmhaRCHgbvkS6pezyQcMUQ1HHCWtyX64yM6KzCmGyxaqzPERhFPpKzLLETzv5CH6WNrjhv');
      i++;
    }
    newLines.push('');
    continue;
  }
  
  // ข้ามบรรทัดที่ซ้ำ
  if (line.match(/^BETTING_FEE_WALLET=/) || 
      line.match(/^REWARD_DISTRIBUTION_WALLET=/) || 
      line.match(/^REWARD_SENDER_PRIVATE_KEY=/)) {
    i++;
    continue;
  }
  
  newLines.push(line);
  i++;
}

writeFileSync('.env', newLines.join('\n'), 'utf-8');
console.log('✅ จัดเรียงไฟล์ .env แล้ว!');





