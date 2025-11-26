// modules/db.js
// Simple DB abstraction with SQLite (default) and optional Postgres.

import fs from "fs";
import path from "path";

let driver = (process.env.DB_DRIVER || "sqlite").toLowerCase();
let sqlite = null;
let pg = null;
let db = null;

export async function initDB() {
  if (driver === "sqlite") {
    const sqlite3 = (await import("sqlite3")).default || (await import("sqlite3")).verbose();
    const file = process.env.DB_SQLITE_PATH || path.join(process.cwd(), "tmp", "luna.db");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const Database = sqlite3.Database || sqlite3;
    db = new Database(file);
    db.serialize(() => {
      db.run(`CREATE TABLE IF NOT EXISTS memory_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT,
        emotion TEXT,
        traits TEXT,
        ts TEXT
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS chat_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT,
        message TEXT,
        reply TEXT,
        ts TEXT
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS event_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT,
        payload TEXT,
        ts TEXT
      )`);
      db.run(`CREATE TABLE IF NOT EXISTS group_chat_messages (
        id TEXT PRIMARY KEY,
        room_id TEXT NOT NULL,
        wallet TEXT NOT NULL,
        username TEXT,
        message TEXT NOT NULL,
        badge TEXT,
        mentions TEXT,
        reward TEXT,
        timestamp INTEGER NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_group_chat_room_timestamp ON group_chat_messages(room_id, timestamp DESC)`);
      db.run(`CREATE TABLE IF NOT EXISTS luna_deposits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        wallet TEXT NOT NULL,
        deposit_amount REAL NOT NULL,
        deposit_date INTEGER NOT NULL,
        withdraw_date INTEGER,
        status TEXT DEFAULT 'active',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_luna_deposits_wallet ON luna_deposits(wallet, status)`);
    });
    console.log("[db] SQLite ready at", file);
  } else if (driver === "postgres") {
    const { Client } = await import("pg");
    pg = new Client({ connectionString: process.env.DB_URL });
    await pg.connect();
    await pg.query(`CREATE TABLE IF NOT EXISTS memory_log (
      id SERIAL PRIMARY KEY,
      username TEXT,
      emotion TEXT,
      traits TEXT,
      ts TIMESTAMPTZ
    )`);
    await pg.query(`CREATE TABLE IF NOT EXISTS chat_log (
      id SERIAL PRIMARY KEY,
      username TEXT,
      message TEXT,
      reply TEXT,
      ts TIMESTAMPTZ
    )`);
    await pg.query(`CREATE TABLE IF NOT EXISTS event_log (
      id SERIAL PRIMARY KEY,
      type TEXT,
      payload TEXT,
      ts TIMESTAMPTZ
    )`);
    await pg.query(`CREATE TABLE IF NOT EXISTS group_chat_messages (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      wallet TEXT NOT NULL,
      username TEXT,
      message TEXT NOT NULL,
      badge TEXT,
      mentions TEXT,
      reward TEXT,
      timestamp BIGINT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`);
    await pg.query(`CREATE INDEX IF NOT EXISTS idx_group_chat_room_timestamp ON group_chat_messages(room_id, timestamp DESC)`);
    await pg.query(`CREATE TABLE IF NOT EXISTS luna_deposits (
      id SERIAL PRIMARY KEY,
      wallet TEXT NOT NULL,
      deposit_amount REAL NOT NULL,
      deposit_date BIGINT NOT NULL,
      withdraw_date BIGINT,
      status TEXT DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`);
    await pg.query(`CREATE INDEX IF NOT EXISTS idx_luna_deposits_wallet ON luna_deposits(wallet, status)`);
    console.log("[db] Postgres ready");
  } else {
    console.log("[db] driver disabled (DB_DRIVER=none)");
  }
}

export function logMemory(username, emotion, traits) {
  const ts = new Date().toISOString();
  const traitsStr = JSON.stringify(traits || []);
  if (driver === "sqlite" && db) {
    db.run("INSERT INTO memory_log(username,emotion,traits,ts) VALUES(?,?,?,?)",
      [username || "", emotion || "", traitsStr, ts]);
  } else if (driver === "postgres" && pg) {
    pg.query("INSERT INTO memory_log(username,emotion,traits,ts) VALUES($1,$2,$3,$4)",
      [username || "", emotion || "", traitsStr, ts]);
  }
}

export function logChat(username, message, reply) {
  const ts = new Date().toISOString();
  if (driver === "sqlite" && db) {
    db.run("INSERT INTO chat_log(username,message,reply,ts) VALUES(?,?,?,?)",
      [username || "", message || "", reply || "", ts]);
  } else if (driver === "postgres" && pg) {
    pg.query("INSERT INTO chat_log(username,message,reply,ts) VALUES($1,$2,$3,$4)",
      [username || "", message || "", reply || "", ts]);
  }
}

export function logEvent(type, payload = {}) {
  const ts = new Date().toISOString();
  if (driver === "sqlite" && db) {
    db.run("INSERT INTO event_log(type,payload,ts) VALUES(?,?,?)",
      [type || "", JSON.stringify(payload || {}), ts]);
  } else if (driver === "postgres" && pg) {
    pg.query("INSERT INTO event_log(type,payload,ts) VALUES($1,$2,$3)",
      [type || "", JSON.stringify(payload || {}), ts]);
  } else {
    console.log("[event]", type, payload);
  }
}


export async function getCommunityMoodSummary() {
  // Simple stub: real implementation can aggregate from DB, here just neutral.
  return {
    dominant: "neutral",
    counts: { sad: 0, happy: 0, angry: 0, excited: 0, neutral: 1 }
  };
}

/**
 * Save group chat message to database
 */
export async function saveGroupChatMessage(message) {
  const { id, roomId, wallet, username, message: msgText, badge, mentions, reward, timestamp } = message;
  
  const badgeStr = badge ? JSON.stringify(badge) : null;
  const mentionsStr = mentions && mentions.length > 0 ? JSON.stringify(mentions) : null;
  const rewardStr = reward ? JSON.stringify(reward) : null;
  
  if (driver === "sqlite" && db) {
    return new Promise((resolve, reject) => {
      db.run(
        "INSERT OR REPLACE INTO group_chat_messages(id, room_id, wallet, username, message, badge, mentions, reward, timestamp) VALUES(?,?,?,?,?,?,?,?,?)",
        [id, roomId, wallet, username || null, msgText, badgeStr, mentionsStr, rewardStr, timestamp],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  } else if (driver === "postgres" && pg) {
    await pg.query(
      "INSERT INTO group_chat_messages(id, room_id, wallet, username, message, badge, mentions, reward, timestamp) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO UPDATE SET message=$5, badge=$6, mentions=$7, reward=$8",
      [id, roomId, wallet, username || null, msgText, badgeStr, mentionsStr, rewardStr, timestamp]
    );
  }
}

/**
 * Load group chat messages from database
 */
export async function loadGroupChatMessages(roomId, limit = 1000) {
  if (driver === "sqlite" && db) {
    return new Promise((resolve, reject) => {
      db.all(
        "SELECT * FROM group_chat_messages WHERE room_id = ? ORDER BY timestamp DESC LIMIT ?",
        [roomId, limit],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            const messages = rows.map(row => ({
              id: row.id,
              wallet: row.wallet,
              username: row.username || row.wallet.substring(0, 8) + '...',
              message: row.message,
              timestamp: row.timestamp,
              badge: row.badge ? JSON.parse(row.badge) : null,
              mentions: row.mentions ? JSON.parse(row.mentions) : [],
              reward: row.reward ? JSON.parse(row.reward) : null
            })).reverse(); // Reverse to get chronological order
            resolve(messages);
          }
        }
      );
    });
  } else if (driver === "postgres" && pg) {
    const result = await pg.query(
      "SELECT * FROM group_chat_messages WHERE room_id = $1 ORDER BY timestamp DESC LIMIT $2",
      [roomId, limit]
    );
    return result.rows.map(row => ({
      id: row.id,
      wallet: row.wallet,
      username: row.username || row.wallet.substring(0, 8) + '...',
      message: row.message,
      timestamp: parseInt(row.timestamp),
      badge: row.badge ? JSON.parse(row.badge) : null,
      mentions: row.mentions ? JSON.parse(row.mentions) : [],
      reward: row.reward ? JSON.parse(row.reward) : null
    })).reverse();
  }
  return [];
}

/**
 * Save Luna deposit to database
 */
export async function saveLunaDeposit(wallet, depositAmount, depositDate) {
  if (driver === "sqlite" && db) {
    return new Promise((resolve, reject) => {
      db.run(
        "INSERT INTO luna_deposits(wallet, deposit_amount, deposit_date, status) VALUES(?,?,?,?)",
        [wallet, depositAmount, depositDate, 'active'],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  } else if (driver === "postgres" && pg) {
    const result = await pg.query(
      "INSERT INTO luna_deposits(wallet, deposit_amount, deposit_date, status) VALUES($1,$2,$3,$4) RETURNING id",
      [wallet, depositAmount, depositDate, 'active']
    );
    return result.rows[0].id;
  }
  return null;
}

/**
 * Get active deposit for a wallet
 */
export async function getActiveDeposit(wallet) {
  if (driver === "sqlite" && db) {
    return new Promise((resolve, reject) => {
      db.get(
        "SELECT * FROM luna_deposits WHERE wallet = ? AND status = 'active' ORDER BY deposit_date DESC LIMIT 1",
        [wallet],
        (err, row) => {
          if (err) reject(err);
          else resolve(row || null);
        }
      );
    });
  } else if (driver === "postgres" && pg) {
    const result = await pg.query(
      "SELECT * FROM luna_deposits WHERE wallet = $1 AND status = 'active' ORDER BY deposit_date DESC LIMIT 1",
      [wallet]
    );
    return result.rows[0] || null;
  }
  return null;
}

/**
 * Update existing Luna deposit (add more amount)
 */
export async function updateLunaDeposit(wallet, additionalAmount) {
  if (driver === "sqlite" && db) {
    return new Promise((resolve, reject) => {
      db.run(
        "UPDATE luna_deposits SET deposit_amount = deposit_amount + ? WHERE wallet = ? AND status = 'active'",
        [additionalAmount, wallet],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes > 0);
        }
      );
    });
  } else if (driver === "postgres" && pg) {
    const result = await pg.query(
      "UPDATE luna_deposits SET deposit_amount = deposit_amount + $1 WHERE wallet = $2 AND status = 'active' RETURNING id",
      [additionalAmount, wallet]
    );
    return result.rowCount > 0;
  }
  return false;
}

/**
 * Withdraw deposit (mark as withdrawn)
 */
export async function withdrawDeposit(wallet, withdrawDate) {
  if (driver === "sqlite" && db) {
    return new Promise((resolve, reject) => {
      db.run(
        "UPDATE luna_deposits SET status = 'withdrawn', withdraw_date = ? WHERE wallet = ? AND status = 'active'",
        [withdrawDate, wallet],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes > 0);
        }
      );
    });
  } else if (driver === "postgres" && pg) {
    const result = await pg.query(
      "UPDATE luna_deposits SET status = 'withdrawn', withdraw_date = $1 WHERE wallet = $2 AND status = 'active'",
      [withdrawDate, wallet]
    );
    return result.rowCount > 0;
  }
  return false;
}
