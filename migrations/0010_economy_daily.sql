-- Tageswerte der Server-Economy (Bot-Ingest economy_daily aus v_economy_daily). Ein Eintrag pro Tag, Upsert. Rein additiv.
CREATE TABLE IF NOT EXISTS mc_economy_daily (day TEXT PRIMARY KEY, money_supply_cp INTEGER NOT NULL, minted_cp INTEGER, burned_cp INTEGER, net_cp INTEGER, updated_at INTEGER NOT NULL);
