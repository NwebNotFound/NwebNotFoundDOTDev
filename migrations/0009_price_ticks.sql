-- Live-Preispunkte: ein Eintrag pro Preisänderung (Kauf/Verkauf) beim Ingest, 90 Tage Aufbewahrung. Rein additiv.
CREATE TABLE IF NOT EXISTS mc_price_ticks (item TEXT NOT NULL, ts INTEGER NOT NULL, buy_price REAL NOT NULL, sell_price REAL NOT NULL, buy_locked INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (item, ts));
CREATE INDEX IF NOT EXISTS idx_mc_pt_ts ON mc_price_ticks(ts);
