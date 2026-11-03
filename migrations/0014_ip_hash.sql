-- 0014: Klartext-IPs in den Warteschlangen durch ip_hash ersetzen.
-- Rein additiv: neue nullable Spalte ip_hash + Index analog zu idx_bids_ip/idx_orders_ip.
-- Keine Spalte wird gedroppt, keine bestehende Zeile geaendert oder geloescht, kein Backfill.
-- Altdaten behalten ihre Klartext-ip; nur neue Zeilen schreiben ip = NULL und ip_hash (HMAC-SHA-256).
-- Diese Migration wird NICHT automatisch angewendet; sie muss vor dem Deploy manuell laufen.
ALTER TABLE mc_bids_pending ADD COLUMN ip_hash TEXT;
ALTER TABLE mc_shop_orders_pending ADD COLUMN ip_hash TEXT;
ALTER TABLE mc_vip_commands ADD COLUMN ip_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_bids_ip_hash ON mc_bids_pending(ip_hash, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_ip_hash ON mc_shop_orders_pending(ip_hash, created_at);
CREATE INDEX IF NOT EXISTS idx_vip_cmd_ip_hash ON mc_vip_commands(ip_hash, created_at);
