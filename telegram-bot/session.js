import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.SESSION_DB_PATH || path.join(__dirname, '..', 'data', 'sessions.db');

// Ensure directory exists
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_chat_id ON sessions(chat_id);
`);const MAX_MESSAGES = 40; // keep last 40 messages (~20 pairs)

export function getHistory(chatId) {
  const records = db.prepare(`
    SELECT role, content FROM (
      SELECT id, role, content FROM sessions WHERE chat_id = ? ORDER BY id DESC LIMIT ?
    ) ORDER BY id ASC
  `).all(String(chatId), MAX_MESSAGES);
  return records;
}

export function addMessage(chatId, role, content) {
  const insert = db.prepare('INSERT INTO sessions (chat_id, role, content) VALUES (?, ?, ?)');
  insert.run(String(chatId), role, content);

  // Keep only the last MAX_MESSAGES
  db.prepare(`
    DELETE FROM sessions WHERE chat_id = ? AND id NOT IN (
      SELECT id FROM (
        SELECT id FROM sessions WHERE chat_id = ? ORDER BY id DESC LIMIT ?
      )
    )
  `).run(String(chatId), String(chatId), MAX_MESSAGES);
}

export function clearHistory(chatId) {
  db.prepare('DELETE FROM sessions WHERE chat_id = ?').run(String(chatId));
}

export function closeDb() {
  db.close();
}
