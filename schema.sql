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
CREATE TABLE IF NOT EXISTS mc_player_stats (mc_uuid TEXT PRIMARY KEY, stats TEXT NOT NULL, updated_at INTEGER NOT NULL, details TEXT);
-- Phase 4 (Markt)
CREATE TABLE IF NOT EXISTS mc_market (item TEXT PRIMARY KEY, buy_price REAL NOT NULL, sell_price REAL NOT NULL, base_price REAL NOT NULL, volume_24h_qty REAL NOT NULL DEFAULT 0, volume_24h_cp REAL NOT NULL DEFAULT 0, trades_24h INTEGER NOT NULL DEFAULT 0, change_24h_pct REAL NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL, buy_locked INTEGER NOT NULL DEFAULT 0, sell_locked INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS mc_market_history (item TEXT NOT NULL, hour_ts INTEGER NOT NULL, avg_price REAL NOT NULL, min_price REAL NOT NULL, max_price REAL NOT NULL, volume_qty REAL NOT NULL DEFAULT 0, PRIMARY KEY (item, hour_ts));
CREATE INDEX IF NOT EXISTS idx_mc_mh_ts ON mc_market_history(hour_ts);
-- Phase 5: Spielershops, Auktionshaus, Website-Warteschlangen (Geld in Cent)
CREATE TABLE IF NOT EXISTS mc_blobs (kind TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS mc_bids_pending (id TEXT PRIMARY KEY, auction_id TEXT NOT NULL, bidder_uuid TEXT NOT NULL, bidder_name TEXT, discord_id TEXT, amount INTEGER NOT NULL, source TEXT NOT NULL, created_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', reason TEXT, acked_at INTEGER, ip TEXT);
CREATE INDEX IF NOT EXISTS idx_bids_status ON mc_bids_pending(status, created_at);
CREATE INDEX IF NOT EXISTS idx_bids_auction ON mc_bids_pending(auction_id);
CREATE INDEX IF NOT EXISTS idx_bids_discord ON mc_bids_pending(discord_id, created_at);
CREATE TABLE IF NOT EXISTS mc_shop_orders_pending (id TEXT PRIMARY KEY, shop_id TEXT, item TEXT NOT NULL, qty INTEGER NOT NULL, buyer_uuid TEXT NOT NULL, buyer_name TEXT, discord_id TEXT, unit_price INTEGER, source TEXT NOT NULL, created_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', reason TEXT, acked_at INTEGER, ip TEXT, listing_id TEXT, type TEXT NOT NULL DEFAULT 'shop');
CREATE INDEX IF NOT EXISTS idx_orders_status ON mc_shop_orders_pending(status, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_discord ON mc_shop_orders_pending(discord_id, created_at);
CREATE INDEX IF NOT EXISTS idx_bids_ip ON mc_bids_pending(ip, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_ip ON mc_shop_orders_pending(ip, created_at);
-- (nachgetragen) Bestenlisten + Detail-Stats
CREATE TABLE IF NOT EXISTS mc_leaderboards (kind TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL);
-- ALTER TABLE mc_player_stats ADD COLUMN details TEXT;

-- (Migration bestehender DBs, in CREATE enthalten) ALTER TABLE mc_shop_orders_pending ADD COLUMN listing_id TEXT;
-- (Migration bestehender DBs, in CREATE enthalten) ALTER TABLE mc_market ADD COLUMN buy_locked INTEGER NOT NULL DEFAULT 0;
-- (Migration bestehender DBs, in CREATE enthalten) ALTER TABLE mc_market ADD COLUMN sell_locked INTEGER NOT NULL DEFAULT 0;
-- Key/Value-Metadaten (price_reset_at aus dem Ingest, Vorrang vor env PRICE_RESET_AT)
CREATE TABLE IF NOT EXISTS mc_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, discord_id TEXT NOT NULL, mc_uuid TEXT, mc_name TEXT, category TEXT NOT NULL CHECK (category IN ('bug','idea','other')), text TEXT NOT NULL CHECK (length(text) <= 2000), location TEXT, status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','done','rejected')), created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status, created_at);
CREATE INDEX IF NOT EXISTS idx_feedback_discord ON feedback(discord_id, created_at);

-- 0006: Bank-Direktkauf (type='bank_buy') + ausgeblendete Bestellungen pro User
CREATE INDEX IF NOT EXISTS idx_orders_type ON mc_shop_orders_pending(type, status, created_at);
CREATE TABLE IF NOT EXISTS mc_order_hidden (discord_id TEXT NOT NULL, order_id TEXT NOT NULL, hidden_at INTEGER NOT NULL, PRIMARY KEY (discord_id, order_id));
