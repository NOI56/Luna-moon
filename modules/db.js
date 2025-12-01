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
        attachments TEXT,
        reward TEXT,
        timestamp INTEGER NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_group_chat_room_timestamp ON group_chat_messages(room_id, timestamp DESC)`);
      db.run("ALTER TABLE group_chat_messages ADD COLUMN attachments TEXT", (err) => {
        if (err && !String(err.message).includes("duplicate column name")) {
          console.warn("[db] migrate group_chat_messages attachments:", err.message);
        }
      });
      db.run(`CREATE TABLE IF NOT EXISTS luna_deposits (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        wallet TEXT NOT NULL,
        deposit_amount REAL NOT NULL,
        deposit_date INTEGER NOT NULL,
        withdraw_date INTEGER,
        status TEXT DEFAULT 'active',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        tx_signature TEXT,
        gross_amount REAL,
        block_time INTEGER,
        withdraw_signature TEXT,
        raw_amount TEXT,
        withdraw_intent_at INTEGER,
        pending_withdraw_signature TEXT,
        burn_amount REAL DEFAULT 0,
        min_requirement REAL DEFAULT 0,
        min_requirement_usd REAL DEFAULT 0
      )`);
      db.run(`CREATE INDEX IF NOT EXISTS idx_luna_deposits_wallet ON luna_deposits(wallet, status)`);
      db.run(`CREATE TABLE IF NOT EXISTS rps_match_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        player1_wallet TEXT NOT NULL,
        player2_wallet TEXT NOT NULL,
        mode TEXT NOT NULL,
        player1_choice TEXT,
        player2_choice TEXT,
        result TEXT NOT NULL,
        winner_wallet TEXT,
        bet_amount REAL DEFAULT 0,
        prize_amount REAL DEFAULT 0,
        timestamp INTEGER NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )`);
      
      const alterStatements = [
        "ALTER TABLE luna_deposits ADD COLUMN tx_signature TEXT",
        "ALTER TABLE luna_deposits ADD COLUMN gross_amount REAL",
        "ALTER TABLE luna_deposits ADD COLUMN block_time INTEGER",
        "ALTER TABLE luna_deposits ADD COLUMN withdraw_signature TEXT",
        "ALTER TABLE luna_deposits ADD COLUMN raw_amount TEXT",
        "ALTER TABLE luna_deposits ADD COLUMN withdraw_intent_at INTEGER",
        "ALTER TABLE luna_deposits ADD COLUMN pending_withdraw_signature TEXT",
        "ALTER TABLE luna_deposits ADD COLUMN burn_amount REAL DEFAULT 0",
        "ALTER TABLE luna_deposits ADD COLUMN min_requirement REAL DEFAULT 0",
        "ALTER TABLE luna_deposits ADD COLUMN min_requirement_usd REAL DEFAULT 0"
      ];
      alterStatements.forEach((sql) => {
        db.run(sql, (err) => {
          if (err && !String(err.message).includes("duplicate column name")) {
            console.warn("[db] migrate luna_deposits:", err.message);
          }
        });
      });
    });
    
    // Run migration for rps_match_history timestamp column (after serialize completes)
    await new Promise((resolve) => {
      db.run("ALTER TABLE rps_match_history ADD COLUMN timestamp INTEGER", (err) => {
        if (err && !String(err.message).includes("duplicate column name")) {
          console.warn("[db] migrate rps_match_history timestamp:", err.message);
        }
        // Create indexes after migration
        db.run(`CREATE INDEX IF NOT EXISTS idx_rps_match_history_player1 ON rps_match_history(player1_wallet, timestamp DESC)`, (err) => {
          if (err && !String(err.message).includes("no such column")) {
            console.warn("[db] index player1:", err.message);
          }
        });
        db.run(`CREATE INDEX IF NOT EXISTS idx_rps_match_history_player2 ON rps_match_history(player2_wallet, timestamp DESC)`, (err) => {
          if (err && !String(err.message).includes("no such column")) {
            console.warn("[db] index player2:", err.message);
          }
        });
        db.run(`CREATE INDEX IF NOT EXISTS idx_rps_match_history_timestamp ON rps_match_history(timestamp DESC)`, (err) => {
          if (err && !String(err.message).includes("no such column")) {
            console.warn("[db] index timestamp:", err.message);
          }
          resolve();
        });
      });
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
      attachments TEXT,
      reward TEXT,
      timestamp BIGINT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`);
    await pg.query(`CREATE INDEX IF NOT EXISTS idx_group_chat_room_timestamp ON group_chat_messages(room_id, timestamp DESC)`);
    await pg.query(`ALTER TABLE group_chat_messages ADD COLUMN IF NOT EXISTS attachments TEXT`);
    await pg.query(`CREATE TABLE IF NOT EXISTS luna_deposits (
      id SERIAL PRIMARY KEY,
      wallet TEXT NOT NULL,
      deposit_amount REAL NOT NULL,
      deposit_date BIGINT NOT NULL,
      withdraw_date BIGINT,
      status TEXT DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      tx_signature TEXT,
      gross_amount REAL,
      block_time BIGINT,
      withdraw_signature TEXT,
      raw_amount TEXT,
      withdraw_intent_at BIGINT,
      pending_withdraw_signature TEXT,
      burn_amount REAL DEFAULT 0,
      min_requirement REAL DEFAULT 0,
      min_requirement_usd REAL DEFAULT 0
    )`);
    await pg.query(`CREATE INDEX IF NOT EXISTS idx_luna_deposits_wallet ON luna_deposits(wallet, status)`);
    await pg.query(`CREATE TABLE IF NOT EXISTS rps_match_history (
      id SERIAL PRIMARY KEY,
      player1_wallet TEXT NOT NULL,
      player2_wallet TEXT NOT NULL,
      mode TEXT NOT NULL,
      player1_choice TEXT,
      player2_choice TEXT,
      result TEXT NOT NULL,
      winner_wallet TEXT,
      bet_amount REAL DEFAULT 0,
      prize_amount REAL DEFAULT 0,
      timestamp BIGINT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )`);
    await pg.query(`CREATE INDEX IF NOT EXISTS idx_rps_match_history_player1 ON rps_match_history(player1_wallet, timestamp DESC)`);
    await pg.query(`CREATE INDEX IF NOT EXISTS idx_rps_match_history_player2 ON rps_match_history(player2_wallet, timestamp DESC)`);
    await pg.query(`CREATE INDEX IF NOT EXISTS idx_rps_match_history_timestamp ON rps_match_history(timestamp DESC)`);
    await pg.query(`ALTER TABLE rps_match_history ADD COLUMN IF NOT EXISTS timestamp BIGINT`);
    await pg.query(`ALTER TABLE luna_deposits ADD COLUMN IF NOT EXISTS tx_signature TEXT`);
    await pg.query(`ALTER TABLE luna_deposits ADD COLUMN IF NOT EXISTS gross_amount REAL`);
    await pg.query(`ALTER TABLE luna_deposits ADD COLUMN IF NOT EXISTS block_time BIGINT`);
    await pg.query(`ALTER TABLE luna_deposits ADD COLUMN IF NOT EXISTS withdraw_signature TEXT`);
    await pg.query(`ALTER TABLE luna_deposits ADD COLUMN IF NOT EXISTS raw_amount TEXT`);
    await pg.query(`ALTER TABLE luna_deposits ADD COLUMN IF NOT EXISTS withdraw_intent_at BIGINT`);
    await pg.query(`ALTER TABLE luna_deposits ADD COLUMN IF NOT EXISTS pending_withdraw_signature TEXT`);
    await pg.query(`ALTER TABLE luna_deposits ADD COLUMN IF NOT EXISTS burn_amount REAL DEFAULT 0`);
    await pg.query(`ALTER TABLE luna_deposits ADD COLUMN IF NOT EXISTS min_requirement REAL DEFAULT 0`);
    await pg.query(`ALTER TABLE luna_deposits ADD COLUMN IF NOT EXISTS min_requirement_usd REAL DEFAULT 0`);
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
  const { id, roomId, wallet, username, message: msgText, badge, mentions, attachments, timestamp } = message;
  
  const badgeStr = badge ? JSON.stringify(badge) : null;
  const mentionsStr = mentions && mentions.length > 0 ? JSON.stringify(mentions) : null;
  const attachmentsStr = attachments && attachments.length > 0 ? JSON.stringify(attachments) : null;
  const rewardStr = null;
  
  if (driver === "sqlite" && db) {
    return new Promise((resolve, reject) => {
      db.run(
        "INSERT OR REPLACE INTO group_chat_messages(id, room_id, wallet, username, message, badge, mentions, attachments, reward, timestamp) VALUES(?,?,?,?,?,?,?,?,?,?)",
        [id, roomId, wallet, username || null, msgText, badgeStr, mentionsStr, attachmentsStr, rewardStr, timestamp],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });
  } else if (driver === "postgres" && pg) {
    await pg.query(
      "INSERT INTO group_chat_messages(id, room_id, wallet, username, message, badge, mentions, attachments, reward, timestamp) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (id) DO UPDATE SET message=$5, badge=$6, mentions=$7, attachments=$8",
      [id, roomId, wallet, username || null, msgText, badgeStr, mentionsStr, attachmentsStr, rewardStr, timestamp]
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
              attachments: row.attachments ? JSON.parse(row.attachments) : []
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
      attachments: row.attachments ? JSON.parse(row.attachments) : []
    })).reverse();
  }
  return [];
}

/**
 * Save Luna deposit to database
 */
export async function saveLunaDeposit({
  wallet,
  depositAmount,
  depositDate,
  txSignature = null,
  grossAmount = null,
  blockTime = null,
  rawAmount = null,
  burnAmount = 0,
  minRequirement = null,
  minRequirementUsd = null,
}) {
  if (driver === "sqlite" && db) {
    return new Promise((resolve, reject) => {
      db.run(
        "INSERT INTO luna_deposits(wallet, deposit_amount, deposit_date, status, tx_signature, gross_amount, block_time, raw_amount, burn_amount, min_requirement, min_requirement_usd) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
        [
          wallet,
          depositAmount,
          depositDate,
          'active',
          txSignature,
          grossAmount ?? depositAmount,
          blockTime,
          rawAmount,
          burnAmount,
          minRequirement ?? depositAmount,
          minRequirementUsd ?? 0,
        ],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  } else if (driver === "postgres" && pg) {
    const result = await pg.query(
      "INSERT INTO luna_deposits(wallet, deposit_amount, deposit_date, status, tx_signature, gross_amount, block_time, raw_amount, burn_amount, min_requirement, min_requirement_usd) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id",
      [
        wallet,
        depositAmount,
        depositDate,
        'active',
        txSignature,
        grossAmount ?? depositAmount,
        blockTime,
        rawAmount,
        burnAmount,
        minRequirement ?? depositAmount,
        minRequirementUsd ?? 0,
      ]
    );
    return result.rows[0].id;
  }
  return null;
}

export async function getTotalBurnedLuna() {
  if (driver === "sqlite" && db) {
    return new Promise((resolve, reject) => {
      db.get(
        "SELECT SUM(burn_amount) AS total FROM luna_deposits",
        [],
        (err, row) => {
          if (err) reject(err);
          else resolve(Number(row?.total || 0));
        }
      );
    });
  } else if (driver === "postgres" && pg) {
    const result = await pg.query("SELECT COALESCE(SUM(burn_amount), 0) AS total FROM luna_deposits");
    return Number(result.rows[0]?.total || 0);
  }
  return 0;
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
export async function withdrawDeposit(wallet, withdrawDate, withdrawSignature = null) {
  if (driver === "sqlite" && db) {
    return new Promise((resolve, reject) => {
      db.run(
        "UPDATE luna_deposits SET status = 'withdrawn', withdraw_date = ?, withdraw_signature = ? WHERE wallet = ? AND status = 'active'",
        [withdrawDate, withdrawSignature, wallet],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes > 0);
        }
      );
    });
  } else if (driver === "postgres" && pg) {
    const result = await pg.query(
      "UPDATE luna_deposits SET status = 'withdrawn', withdraw_date = $1, withdraw_signature = $2 WHERE wallet = $3 AND status = 'active'",
      [withdrawDate, withdrawSignature, wallet]
    );
    return result.rowCount > 0;
  }
  return false;
}

/**
 * Find deposit by transaction signature
 */
export async function getDepositBySignature(signature) {
  if (!signature) return null;
  if (driver === "sqlite" && db) {
    return new Promise((resolve, reject) => {
      db.get(
        "SELECT * FROM luna_deposits WHERE tx_signature = ? LIMIT 1",
        [signature],
        (err, row) => {
          if (err) reject(err);
          else resolve(row || null);
        }
      );
    });
  } else if (driver === "postgres" && pg) {
    const result = await pg.query(
      "SELECT * FROM luna_deposits WHERE tx_signature = $1 LIMIT 1",
      [signature]
    );
    return result.rows[0] || null;
  }
  return null;
}

export async function setWithdrawIntent(wallet, intentTimestamp) {
  if (!wallet) return false;
  if (driver === "sqlite" && db) {
    return new Promise((resolve, reject) => {
      db.run(
        "UPDATE luna_deposits SET withdraw_intent_at = ?, pending_withdraw_signature = NULL WHERE wallet = ? AND status = 'active'",
        [intentTimestamp || Date.now(), wallet],
        function (err) {
          if (err) reject(err);
          else resolve(this.changes > 0);
        }
      );
    });
  } else if (driver === "postgres" && pg) {
    const result = await pg.query(
      "UPDATE luna_deposits SET withdraw_intent_at = $1, pending_withdraw_signature = NULL WHERE wallet = $2 AND status = 'active'",
      [intentTimestamp || Date.now(), wallet]
    );
    return result.rowCount > 0;
  }
  return false;
}

export async function clearWithdrawIntent(wallet) {
  if (!wallet) return false;
  if (driver === "sqlite" && db) {
    return new Promise((resolve, reject) => {
      db.run(
        "UPDATE luna_deposits SET withdraw_intent_at = NULL, pending_withdraw_signature = NULL WHERE wallet = ?",
        [wallet],
        function (err) {
          if (err) reject(err);
          else resolve(this.changes > 0);
        }
      );
    });
  } else if (driver === "postgres" && pg) {
    const result = await pg.query(
      "UPDATE luna_deposits SET withdraw_intent_at = NULL, pending_withdraw_signature = NULL WHERE wallet = $1",
      [wallet]
    );
    return result.rowCount > 0;
  }
  return false;
}

export async function getPendingWithdrawals(limit = 20) {
  if (driver === "sqlite" && db) {
    return new Promise((resolve, reject) => {
      db.all(
        "SELECT * FROM luna_deposits WHERE status = 'active' AND withdraw_intent_at IS NOT NULL ORDER BY withdraw_intent_at ASC LIMIT ?",
        [limit],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows || []);
        }
      );
    });
  } else if (driver === "postgres" && pg) {
    const result = await pg.query(
      "SELECT * FROM luna_deposits WHERE status = 'active' AND withdraw_intent_at IS NOT NULL ORDER BY withdraw_intent_at ASC LIMIT $1",
      [limit]
    );
    return result.rows || [];
  }
  return [];
}

/**
 * Clear any active deposit records (used for testing/migration)
 */
export async function clearAllDeposits() {
  if (driver === "sqlite" && db) {
    return new Promise((resolve, reject) => {
      db.run(
        "DELETE FROM luna_deposits",
        [],
        function(err) {
          if (err) reject(err);
          else resolve(true);
        }
      );
    });
  } else if (driver === "postgres" && pg) {
    await pg.query("DELETE FROM luna_deposits");
    return true;
  }
  return false;
}

/**
 * Save RPS match history to database
 */
export async function saveMatchHistory(
  player1Wallet,
  player2Wallet,
  mode,
  player1Choice,
  player2Choice,
  result,
  winnerWallet,
  betAmount = 0,
  prizeAmount = 0
) {
  const timestamp = Date.now();
  
  if (driver === "sqlite" && db) {
    return new Promise((resolve, reject) => {
      db.run(
        "INSERT INTO rps_match_history(player1_wallet, player2_wallet, mode, player1_choice, player2_choice, result, winner_wallet, bet_amount, prize_amount, timestamp) VALUES(?,?,?,?,?,?,?,?,?,?)",
        [player1Wallet, player2Wallet, mode, player1Choice, player2Choice, result, winnerWallet, betAmount, prizeAmount, timestamp],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  } else if (driver === "postgres" && pg) {
    const result = await pg.query(
      "INSERT INTO rps_match_history(player1_wallet, player2_wallet, mode, player1_choice, player2_choice, result, winner_wallet, bet_amount, prize_amount, timestamp) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id",
      [player1Wallet, player2Wallet, mode, player1Choice, player2Choice, result, winnerWallet, betAmount, prizeAmount, timestamp]
    );
    return result.rows[0].id;
  }
  return null;
}

/**
 * Fetch recent match history for a wallet
 */
export async function getMatchHistory(wallet, limit = 100) {
  if (!wallet) {
    return [];
  }
  const normalizedLimit = Math.max(1, Math.min(Number(limit) || 100, 500));

  if (driver === "sqlite" && db) {
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT *
         FROM rps_match_history
         WHERE player1_wallet = ? OR player2_wallet = ?
         ORDER BY CASE
           WHEN timestamp IS NULL OR timestamp = '' THEN 0
           ELSE timestamp
         END DESC
         LIMIT ?`,
        [wallet, wallet, normalizedLimit],
        (err, rows) => {
          if (err) {
            reject(err);
          } else {
            resolve(rows || []);
          }
        }
      );
    });
  } else if (driver === "postgres" && pg) {
    const result = await pg.query(
      `SELECT *
       FROM rps_match_history
       WHERE player1_wallet = $1 OR player2_wallet = $1
       ORDER BY COALESCE(timestamp, EXTRACT(EPOCH FROM created_at) * 1000) DESC
       LIMIT $2`,
      [wallet, normalizedLimit]
    );
    return result.rows || [];
  }

  return [];
}
