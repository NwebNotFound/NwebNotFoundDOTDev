-- PvP-Statistik (Bot-Ingest pvp_stats). Vollständiger Snapshot, uuid ohne Bindestriche, lowercase. Rein additiv.
CREATE TABLE IF NOT EXISTS mc_pvp_stats (uuid TEXT PRIMARY KEY, name TEXT NOT NULL, wins INTEGER NOT NULL, losses INTEGER NOT NULL, draws INTEGER NOT NULL, matches INTEGER NOT NULL, winrate_pct INTEGER, favorite_kit TEXT, updated_at INTEGER NOT NULL);
