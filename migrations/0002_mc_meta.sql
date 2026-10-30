-- Key/Value-Metadaten für den MC-Hub (z.B. price_reset_at aus dem Ingest). Idempotent.
CREATE TABLE IF NOT EXISTS mc_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL);
