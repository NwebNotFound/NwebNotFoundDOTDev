-- Sicherheits-Härtung: Gästebuch-Rate-Limit + gehashte IPs in den Handels-Warteschlangen.
-- Live anwenden (nur nach Freigabe, VOR dem Deploy des Codes): npx wrangler d1 execute DB --remote --file migrations/0003_security.sql
-- Rate-Limit-Zeilen fürs Gästebuch: nur SHA-256(Tagessalz|IP) und Discord-ID, keine Klartext-IP. Zeilen > 2 Tage werden beim Schreiben gelöscht.
CREATE TABLE IF NOT EXISTS gb_rate (id INTEGER PRIMARY KEY AUTOINCREMENT, ip_hash TEXT, discord_id TEXT, created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_gb_rate_ip ON gb_rate(ip_hash, created_at);
CREATE INDEX IF NOT EXISTS idx_gb_rate_discord ON gb_rate(discord_id, created_at);
CREATE INDEX IF NOT EXISTS idx_gb_rate_created ON gb_rate(created_at);
-- Neue Handels-Einträge speichern nur noch ip_hash; die alte Spalte ip bleibt (Altdaten, Löschung nur nach Freigabe).
ALTER TABLE mc_bids_pending ADD COLUMN ip_hash TEXT;
ALTER TABLE mc_shop_orders_pending ADD COLUMN ip_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_bids_iphash ON mc_bids_pending(ip_hash, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_iphash ON mc_shop_orders_pending(ip_hash, created_at);
