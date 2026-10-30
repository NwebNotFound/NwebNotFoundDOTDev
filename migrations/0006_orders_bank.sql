-- UX-Batch: Bank-Direktkauf über dieselbe Order-Queue (type='bank_buy', shop_id/listing_id NULL)
-- + pro User ausblendbare Bestellungen (nichts wird gelöscht). Tabelle wird neu aufgebaut, weil shop_id NOT NULL war; alle Zeilen werden kopiert.
CREATE TABLE mc_shop_orders_pending_new (id TEXT PRIMARY KEY, shop_id TEXT, item TEXT NOT NULL, qty INTEGER NOT NULL, buyer_uuid TEXT NOT NULL, buyer_name TEXT, discord_id TEXT, unit_price INTEGER, source TEXT NOT NULL, created_at INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', reason TEXT, acked_at INTEGER, ip TEXT, listing_id TEXT, type TEXT NOT NULL DEFAULT 'shop');
INSERT INTO mc_shop_orders_pending_new (id, shop_id, item, qty, buyer_uuid, buyer_name, discord_id, unit_price, source, created_at, status, reason, acked_at, ip, listing_id, type)
  SELECT id, shop_id, item, qty, buyer_uuid, buyer_name, discord_id, unit_price, source, created_at, status, reason, acked_at, ip, listing_id, 'shop' FROM mc_shop_orders_pending;
DROP TABLE mc_shop_orders_pending;
ALTER TABLE mc_shop_orders_pending_new RENAME TO mc_shop_orders_pending;
CREATE INDEX IF NOT EXISTS idx_orders_status ON mc_shop_orders_pending(status, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_discord ON mc_shop_orders_pending(discord_id, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_ip ON mc_shop_orders_pending(ip, created_at);
CREATE INDEX IF NOT EXISTS idx_orders_type ON mc_shop_orders_pending(type, status, created_at);
CREATE TABLE IF NOT EXISTS mc_order_hidden (discord_id TEXT NOT NULL, order_id TEXT NOT NULL, hidden_at INTEGER NOT NULL, PRIMARY KEY (discord_id, order_id));
