import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { env } from "@/lib/env";
import * as schema from "./schema";

const MIGRATION = `
CREATE TABLE IF NOT EXISTS titles (
  id SERIAL PRIMARY KEY,
  kind TEXT NOT NULL,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  year INTEGER,
  overview TEXT,
  poster_url TEXT,
  backdrop_url TEXT,
  genres JSONB NOT NULL DEFAULT '[]'::jsonb,
  rating DOUBLE PRECISION,
  tmdb_id INTEGER,
  hidden BOOLEAN NOT NULL DEFAULT false,
  created_at BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint,
  updated_at BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint
);
CREATE UNIQUE INDEX IF NOT EXISTS titles_kind_key ON titles(kind, key);

CREATE TABLE IF NOT EXISTS episodes (
  id SERIAL PRIMARY KEY,
  title_id INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  season INTEGER NOT NULL,
  episode INTEGER NOT NULL,
  name TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS episodes_title_se ON episodes(title_id, season, episode);

CREATE TABLE IF NOT EXISTS files (
  id SERIAL PRIMARY KEY,
  title_id INTEGER NOT NULL REFERENCES titles(id) ON DELETE CASCADE,
  episode_id INTEGER REFERENCES episodes(id) ON DELETE CASCADE,
  telegram_file_id TEXT NOT NULL,
  telegram_file_unique_id TEXT NOT NULL,
  media_type TEXT NOT NULL,
  file_name TEXT,
  mime_type TEXT,
  size BIGINT,
  duration INTEGER,
  width INTEGER,
  height INTEGER,
  vault_chat_id BIGINT NOT NULL,
  vault_message_id INTEGER NOT NULL,
  caption TEXT,
  hidden BOOLEAN NOT NULL DEFAULT false,
  created_at BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint
);
CREATE UNIQUE INDEX IF NOT EXISTS files_unique_id ON files(telegram_file_unique_id);
CREATE UNIQUE INDEX IF NOT EXISTS files_vault_message ON files(vault_chat_id, vault_message_id);

CREATE TABLE IF NOT EXISTS users (
  id BIGINT PRIMARY KEY,
  first_name TEXT NOT NULL,
  last_name TEXT,
  username TEXT,
  created_at BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint,
  last_seen_at BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint
);

CREATE TABLE IF NOT EXISTS login_tokens (
  token TEXT PRIMARY KEY,
  browser_hash TEXT NOT NULL,
  invite_code TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  user_id BIGINT,
  reason TEXT,
  created_at BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint,
  expires_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS invites (
  code TEXT PRIMARY KEY,
  created_at BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint,
  used_by BIGINT,
  used_at BIGINT
);

CREATE TABLE IF NOT EXISTS sends (
  id SERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL,
  file_id INTEGER NOT NULL REFERENCES files(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'queued',
  error TEXT,
  created_at BIGINT NOT NULL DEFAULT (extract(epoch from now()) * 1000)::bigint,
  sent_at BIGINT
);
CREATE INDEX IF NOT EXISTS sends_status ON sends(status, id);
CREATE INDEX IF NOT EXISTS sends_user_time ON sends(user_id, created_at);
`;

const globalForDb = globalThis as unknown as {
  __reelvaultSql?: ReturnType<typeof postgres>;
  __reelvaultReady?: Promise<void>;
};

function connectionUrl() {
  const url = env.databaseUrl;
  if (!url) return "postgresql://127.0.0.1:9/unused";
  // postgres.js uses prepare:false for pgbouncer; the extra query param is a Drizzle-kit hint only.
  return url.replace(/[?&]pgbouncer=true\b/, "").replace(/\?$/, "");
}

// Don't connect at import time. A missing DATABASE_URL used to crash the bot
// before it could even poll Telegram, so /start never got a reply.
const sql =
  globalForDb.__reelvaultSql ??
  postgres(connectionUrl(), {
    prepare: false,
    max: 1,
    connect_timeout: 8,
    onnotice: () => {},
    ...(env.databaseUrl ? { ssl: "require" as const } : {}),
  });
if (process.env.NODE_ENV !== "production") globalForDb.__reelvaultSql = sql;

export const db = drizzle(sql, { schema });
export { schema };

export async function ensureSchema() {
  if (!env.databaseUrl) {
    throw new Error("DATABASE_URL is not set. Add the Supabase pooler URI to .env.");
  }
  if (!globalForDb.__reelvaultReady) {
    globalForDb.__reelvaultReady = (async () => {
      for (const statement of MIGRATION.split(";").map((s) => s.trim()).filter(Boolean)) {
        await sql.unsafe(statement);
      }
    })();
  }
  await globalForDb.__reelvaultReady;
}
