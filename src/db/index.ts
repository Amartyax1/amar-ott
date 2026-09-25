import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { env, isMock } from "@/lib/env";
import * as schema from "./schema";
import { seedDemo } from "./seed";

const MIGRATION = `
CREATE TABLE IF NOT EXISTS titles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  year INTEGER,
  overview TEXT,
  poster_url TEXT,
  backdrop_url TEXT,
  genres TEXT NOT NULL DEFAULT '[]',
  rating REAL,
  tmdb_id INTEGER,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE UNIQUE INDEX IF NOT EXISTS titles_kind_key ON titles(kind, key);

CREATE TABLE IF NOT EXISTS episodes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title_id INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  season INTEGER NOT NULL,
  episode INTEGER NOT NULL,
  name TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS episodes_title_se ON episodes(title_id, season, episode);

CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title_id INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  episode_id INTEGER REFERENCES episodes(id) ON DELETE CASCADE,
  telegram_file_id TEXT NOT NULL,
  telegram_file_unique_id TEXT NOT NULL,
  media_type TEXT NOT NULL,
  file_name TEXT,
  mime_type TEXT,
  size INTEGER,
  duration INTEGER,
  width INTEGER,
  height INTEGER,
  vault_chat_id INTEGER NOT NULL,
  vault_message_id INTEGER NOT NULL,
  caption TEXT,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);
CREATE UNIQUE INDEX IF NOT EXISTS files_unique_id ON files(telegram_file_unique_id);
CREATE UNIQUE INDEX IF NOT EXISTS files_vault_message ON files(vault_chat_id, vault_message_id);
CREATE INDEX IF NOT EXISTS files_title ON files(title_id);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT,
  username TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  last_seen_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
);

CREATE TABLE IF NOT EXISTS login_tokens (
  token TEXT PRIMARY KEY,
  browser_hash TEXT NOT NULL,
  invite_code TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  user_id INTEGER,
  reason TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS invites (
  code TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  used_by INTEGER,
  used_at INTEGER
);

CREATE TABLE IF NOT EXISTS sends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued',
  error TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  sent_at INTEGER
);
CREATE INDEX IF NOT EXISTS sends_status ON sends(status, id);
CREATE INDEX IF NOT EXISTS sends_user_time ON sends(user_id, created_at);
`;

export type DB = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

function open(): DB {
  const file = path.resolve(process.cwd(), env.databasePath);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  // Web app and bot are separate processes sharing this file.
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(MIGRATION);
  const db = drizzle(sqlite, { schema }) as DB;
  if (isMock) seedDemo(db);
  return db;
}

const globalForDb = globalThis as unknown as { __reelvaultDb?: DB };

export const db: DB = globalForDb.__reelvaultDb ?? open();
if (process.env.NODE_ENV !== "production") globalForDb.__reelvaultDb = db;

export { schema };
