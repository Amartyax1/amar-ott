export const env = {
  botToken: process.env.BOT_TOKEN?.trim() || "",
  botUsername: (process.env.BOT_USERNAME ?? "").replace(/^@/, "").trim(),
  vaultChatId: process.env.VAULT_CHAT_ID ? Number(process.env.VAULT_CHAT_ID) : null,
  sessionSecret: process.env.SESSION_SECRET?.trim() || "",
  tmdbKey: process.env.TMDB_API_KEY?.trim() || "",
  siteUrl: process.env.SITE_URL?.trim() || "http://localhost:4317",
  databaseUrl: process.env.DATABASE_URL?.trim() || "",
  sendLimitPerHour: Number(process.env.SEND_LIMIT_PER_HOUR ?? 40),
};

/** Mock mode runs the whole app without Telegram: demo login, logged sends. */
export const isMock = !env.botToken;
