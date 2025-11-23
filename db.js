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
