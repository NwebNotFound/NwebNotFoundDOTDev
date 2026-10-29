-- secret TURNSTILE_SECRET set via API (wrangler secret put TURNSTILE_SECRET)
CREATE TABLE IF NOT EXISTS entries (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, message TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
-- Phase 1 (Discord-Login): nicht-destruktive Erweiterungen
ALTER TABLE entries ADD COLUMN discord_id TEXT;
ALTER TABLE entries ADD COLUMN avatar TEXT;
CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, discord_id TEXT NOT NULL, username TEXT NOT NULL, global_name TEXT, avatar TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), expires_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS mc_snapshot (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL, updated_at INTEGER NOT NULL);
