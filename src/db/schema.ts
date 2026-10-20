import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const nowMs = sql`(extract(epoch from now()) * 1000)::bigint`;
const tgId = (name: string) => bigint(name, { mode: "number" });

export const titles = pgTable(
  "titles",
  {
    id: serial("id").primaryKey(),
    kind: text("kind", { enum: ["movie", "show"] }).notNull(),
    key: text("key").notNull(),
    name: text("name").notNull(),
    year: integer("year"),
    overview: text("overview"),
    posterUrl: text("poster_url"),
    backdropUrl: text("backdrop_url"),
    genres: jsonb("genres").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    rating: doublePrecision("rating"),
    tmdbId: integer("tmdb_id"),
    hidden: boolean("hidden").notNull().default(false),
    createdAt: tgId("created_at").notNull().default(nowMs),
    updatedAt: tgId("updated_at").notNull().default(nowMs),
  },
  (t) => [uniqueIndex("titles_kind_key").on(t.kind, t.key)],
);

export const episodes = pgTable(
  "episodes",
  {
    id: serial("id").primaryKey(),
    titleId: integer("title_id")
      .notNull()
      .references(() => titles.id, { onDelete: "cascade" }),
    season: integer("season").notNull(),
    episode: integer("episode").notNull(),
    name: text("name"),
  },
  (t) => [uniqueIndex("episodes_title_se").on(t.titleId, t.season, t.episode)],
);

export const files = pgTable(
  "files",
  {
    id: serial("id").primaryKey(),
    titleId: integer("title_id")
      .notNull()
      .references(() => titles.id, { onDelete: "cascade" }),
    episodeId: integer("episode_id").references(() => episodes.id, { onDelete: "cascade" }),
    telegramFileId: text("telegram_file_id").notNull(),
    telegramFileUniqueId: text("telegram_file_unique_id").notNull(),
    mediaType: text("media_type", { enum: ["video", "document"] }).notNull(),
    fileName: text("file_name"),
    mimeType: text("mime_type"),
    size: tgId("size"),
    duration: integer("duration"),
    width: integer("width"),
    height: integer("height"),
    vaultChatId: tgId("vault_chat_id").notNull(),
    vaultMessageId: integer("vault_message_id").notNull(),
    caption: text("caption"),
    hidden: boolean("hidden").notNull().default(false),
    createdAt: tgId("created_at").notNull().default(nowMs),
  },
  (t) => [
    uniqueIndex("files_unique_id").on(t.telegramFileUniqueId),
    uniqueIndex("files_vault_message").on(t.vaultChatId, t.vaultMessageId),
  ],
);

export const users = pgTable("users", {
  id: tgId("id").primaryKey(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name"),
  username: text("username"),
  createdAt: tgId("created_at").notNull().default(nowMs),
  lastSeenAt: tgId("last_seen_at").notNull().default(nowMs),
});

export const loginTokens = pgTable("login_tokens", {
  token: text("token").primaryKey(),
  browserHash: text("browser_hash").notNull(),
  inviteCode: text("invite_code"),
  status: text("status", { enum: ["pending", "confirmed", "denied", "consumed"] })
    .notNull()
    .default("pending"),
  userId: tgId("user_id"),
  reason: text("reason"),
  createdAt: tgId("created_at").notNull().default(nowMs),
  expiresAt: tgId("expires_at").notNull(),
});

export const invites = pgTable("invites", {
  code: text("code").primaryKey(),
  createdAt: tgId("created_at").notNull().default(nowMs),
  usedBy: tgId("used_by"),
  usedAt: tgId("used_at"),
});

export const sends = pgTable("sends", {
  id: serial("id").primaryKey(),
  userId: tgId("user_id").notNull(),
  fileId: integer("file_id")
    .notNull()
    .references(() => files.id, { onDelete: "cascade" }),
  status: text("status", { enum: ["queued", "sending", "sent", "failed"] })
    .notNull()
    .default("queued"),
  error: text("error"),
  createdAt: tgId("created_at").notNull().default(nowMs),
  sentAt: tgId("sent_at"),
});

export type Title = typeof titles.$inferSelect;
export type Episode = typeof episodes.$inferSelect;
export type FileRow = typeof files.$inferSelect;
export type User = typeof users.$inferSelect;
export type Send = typeof sends.$inferSelect;
