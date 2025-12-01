// config/constants.js
// Application constants configuration

/**
 * RPS Game Constants
 */
export const RPS_CONSTANTS = {
  // Match timeout
  MATCH_TIMEOUT: 15000, // 15 seconds (15,000ms)
  
  // Betting room timeout
  RPS_BETTING_ROOM_TIMEOUT: 300000, // 5 minutes (300,000ms)
  
  // Fee percentages
  FEE_PERCENTAGE: 0.03, // 3% fee for betting (default)
  BETTING_FEE_DEFAULT: 0.03, // 3% fee for betting (default)
  BETTING_FEE_3_DAYS: 0.02, // 2% fee after 3 days deposit
  BETTING_FEE_6_DAYS: 0.01, // 1% fee after 6 days deposit
  
  // Minimum balance
  RPS_MIN_BALANCE: 100000, // 100,000 Luna tokens minimum
};

/**
 * Deposit System Constants
 */
export const DEPOSIT_CONSTANTS = {
  DEPOSIT_MIN_BALANCE: 150000, // Minimum Luna balance required to deposit
  DEPOSIT_FEE_PERCENTAGE: 0.03, // 3% fee when depositing
  DEPOSIT_FEE_3_DAYS: 0.02, // 2% fee after 3 days
  DEPOSIT_FEE_6_DAYS: 0.01, // 1% fee after 6 days
};

/**
 * Anti-Abuse Constants
 */
export const ANTI_ABUSE_CONSTANTS = {
  SUSPICIOUS_PAIR_THRESHOLD: 5, // ถ้าเล่นกันเกิน 5 ครั้งใน 24 ชั่วโมง = น่าสงสัย
  SUSPICIOUS_PAIR_TIME_WINDOW: 24 * 60 * 60 * 1000, // 24 ชั่วโมง
  GAME_COOLDOWN: 60 * 1000, // 1 นาทีระหว่างเกม (60,000ms)
  IP_SELF_PLAY_THRESHOLD: 10, // ถ้า IP เดียวกันมี wallet หลายตัวเล่นกันเองเกิน 10 รอบ = ตัดสิทธิ์รับรางวัล
  MAX_SUSPICIOUS_LOG: 1000, // เก็บ log สูงสุด 1000 รายการ
};

/**
 * Chat System Constants
 */
export const CHAT_CONSTANTS = {
  CHAT_MESSAGE_LIMIT: 10000, // เพิ่ม limit เป็น 10,000 ข้อความ (เกือบไม่จำกัด)
  CHAT_MESSAGE_EXPIRY: null, // ปิดการลบข้อความตาม expiry (เก็บถาวร)
  BADGE_CACHE_TTL: 5 * 60 * 1000, // Cache badges for 5 minutes
};

/**
 * VIP Badge Thresholds (Luna balance)
 */
export const VIP_BADGES = {
  BRONZE: 100000,    // 🥉
  SILVER: 500000,   // 🥈
  GOLD: 1000000,    // 🥇
  DIAMOND: 5000000, // 💎
  LEGEND: 10000000  // 👑
};

/**
 * Message Rewards Configuration
 */
export const MESSAGE_REWARD_CONSTANTS = {
  MESSAGE_REWARD_CHANCE: 0.05, // 5% chance per message
  MESSAGE_REWARD_MIN: 1000,    // Minimum reward (Luna)
  MESSAGE_REWARD_MAX: 10000,   // Maximum reward (Luna)
  FIRST_MESSAGE_BONUS: 5000,   // Bonus for first message of the day
};

/**
 * Referral System Constants
 */
export const REFERRAL_CONSTANTS = {
  REFERRAL_REWARD_SIGNUP: 100, // รางวัลเมื่อเพื่อนลงทะเบียน (Luna)
  REFERRAL_REWARD_FIRST_GAME: 200, // รางวัลเมื่อเพื่อนเล่นเกมแรก (Luna)
  REFERRAL_REWARD_TOP10: 1000, // รางวัลเมื่อเพื่อนติด Top 10 (Luna)
};

/**
 * Cache TTL Constants
 */
export const CACHE_CONSTANTS = {
  PRICE_CACHE_TTL: 60000, // 1 minute cache
  BALANCE_CACHE_TTL: 30000, // 30 seconds cache
};

/**
 * Reward Distribution Constants
 */
export const REWARD_CONSTANTS = {
  REWARD_PERCENTAGES: {
    1: 0.20, // 20%
    2: 0.10, // 10%
    3: 0.05, // 5%
    4: 0.03, // 3%
    5: 0.02, // 2%
    remaining: 0.60 // 60% to distribution wallet
  }
};

/**
 * Solana Constants
 */
export const SOLANA_CONSTANTS = {
  SOL_MINT: "So11111111111111111111111111111111111111112", // Native SOL mint
};











