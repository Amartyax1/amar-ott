import { sql } from "drizzle-orm";
import { integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const now = sql`(unixepoch() * 1000)`;

export const titles = sqliteTable(
  "titles",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    kind: text("kind", { enum: ["movie", "show"] }).notNull(),
    /** Normalized name (+ year for movies) used to group uploads into one title. */
    key: text("key").notNull(),
    name: text("name").notNull(),
    year: integer("year"),
    overview: text("overview"),
    posterUrl: text("poster_url"),
    backdropUrl: text("backdrop_url"),
    genres: text("genres", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
    rating: real("rating"),
    tmdbId: integer("tmdb_id"),
    hidden: integer("hidden", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at").notNull().default(now),
    updatedAt: integer("updated_at").notNull().default(now),
  },
  (t) => [uniqueIndex("titles_kind_key").on(t.kind, t.key)],
);

export const episodes = sqliteTable(
  "episodes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    titleId: integer("title_id")
      .notNull()
      .references(() => titles.id, { onDelete: "cascade" }),
    season: integer("season").notNull(),
    episode: integer("episode").notNull(),
    name: text("name"),
  },
  (t) => [uniqueIndex("episodes_title_se").on(t.titleId, t.season, t.episode)],
);

export const files = sqliteTable(
  "files",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    titleId: integer("title_id")
      .notNull()
      .references(() => titles.id, { onDelete: "cascade" }),
    episodeId: integer("episode_id").references(() => episodes.id, { onDelete: "cascade" }),
    telegramFileId: text("telegram_file_id").notNull(),
    telegramFileUniqueId: text("telegram_file_unique_id").notNull(),
    mediaType: text("media_type", { enum: ["video", "document"] }).notNull(),
    fileName: text("file_name"),
    mimeType: text("mime_type"),
    size: integer("size"),
    duration: integer("duration"),
    width: integer("width"),
    height: integer("height"),
    vaultChatId: integer("vault_chat_id").notNull(),
    vaultMessageId: integer("vault_message_id").notNull(),
    caption: text("caption"),
    hidden: integer("hidden", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [
    uniqueIndex("files_unique_id").on(t.telegramFileUniqueId),
    uniqueIndex("files_vault_message").on(t.vaultChatId, t.vaultMessageId),
  ],
);

export const users = sqliteTable("users", {
  /** Telegram user id; also the private chat id the bot sends to. */
  id: integer("id").primaryKey(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name"),
  username: text("username"),
  createdAt: integer("created_at").notNull().default(now),
  lastSeenAt: integer("last_seen_at").notNull().default(now),
});

export const loginTokens = sqliteTable("login_tokens", {
  token: text("token").primaryKey(),
  /** Hash of the browser-bound nonce cookie, so only the requesting browser can claim the session. */
  browserHash: text("browser_hash").notNull(),
  inviteCode: text("invite_code"),
  status: text("status", { enum: ["pending", "confirmed", "denied", "consumed"] })
    .notNull()
    .default("pending"),
  userId: integer("user_id"),
  reason: text("reason"),
  createdAt: integer("created_at").notNull().default(now),
  expiresAt: integer("expires_at").notNull(),
});

export const invites = sqliteTable("invites", {
  code: text("code").primaryKey(),
  createdAt: integer("created_at").notNull().default(now),
  usedBy: integer("used_by"),
  usedAt: integer("used_at"),
});

export const sends = sqliteTable("sends", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id").notNull(),
  fileId: integer("file_id")
    .notNull()
    .references(() => files.id, { onDelete: "cascade" }),
  status: text("status", { enum: ["queued", "sending", "sent", "failed"] })
    .notNull()
    .default("queued"),
  error: text("error"),
  createdAt: integer("created_at").notNull().default(now),
  sentAt: integer("sent_at"),
});

export type Title = typeof titles.$inferSelect;
export type Episode = typeof episodes.$inferSelect;
export type FileRow = typeof files.$inferSelect;
export type User = typeof users.$inferSelect;
export type Send = typeof sends.$inferSelect;
