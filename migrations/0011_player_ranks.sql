-- Spielerränge (Bot-Ingest player_ranks aus v_player_rank). Vollständiger Snapshot, uuid ohne Bindestriche, lowercase. Rein additiv.
CREATE TABLE IF NOT EXISTS mc_player_ranks (uuid TEXT PRIMARY KEY, name TEXT NOT NULL, rank TEXT NOT NULL, color TEXT NOT NULL, weight INTEGER NOT NULL, updated_at INTEGER NOT NULL);
