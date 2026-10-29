-- secret TURNSTILE_SECRET set via API (wrangler secret put TURNSTILE_SECRET)
CREATE TABLE IF NOT EXISTS entries (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, message TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
-- Phase 1 (Discord-Login): nicht-destruktive Erweiterungen
ALTER TABLE entries ADD COLUMN discord_id TEXT;
ALTER TABLE entries ADD COLUMN avatar TEXT;
CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, discord_id TEXT NOT NULL, username TEXT NOT NULL, global_name TEXT, avatar TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), expires_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS mc_snapshot (id INTEGER PRIMARY KEY CHECK (id = 1), data TEXT NOT NULL, updated_at INTEGER NOT NULL);
-- Phase 2 (Profile): verknüpfte Accounts + Spieler-Stats (vom Discord-Bot gepusht)
CREATE TABLE IF NOT EXISTS mc_links (discord_id TEXT PRIMARY KEY, mc_name TEXT NOT NULL, mc_uuid TEXT NOT NULL, has_role INTEGER NOT NULL DEFAULT 0, verified INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_mc_links_uuid ON mc_links(mc_uuid);
CREATE TABLE IF NOT EXISTS mc_player_stats (mc_uuid TEXT PRIMARY KEY, stats TEXT NOT NULL, updated_at INTEGER NOT NULL);
-- Phase 4 (Markt)
CREATE TABLE IF NOT EXISTS mc_market (item TEXT PRIMARY KEY, buy_price REAL NOT NULL, sell_price REAL NOT NULL, base_price REAL NOT NULL, volume_24h_qty REAL NOT NULL DEFAULT 0, volume_24h_cp REAL NOT NULL DEFAULT 0, trades_24h INTEGER NOT NULL DEFAULT 0, change_24h_pct REAL NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS mc_market_history (item TEXT NOT NULL, hour_ts INTEGER NOT NULL, avg_price REAL NOT NULL, min_price REAL NOT NULL, max_price REAL NOT NULL, volume_qty REAL NOT NULL DEFAULT 0, PRIMARY KEY (item, hour_ts));
CREATE INDEX IF NOT EXISTS idx_mc_mh_ts ON mc_market_history(hour_ts);
