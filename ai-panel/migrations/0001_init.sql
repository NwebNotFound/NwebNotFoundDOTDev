-- KI-Panel. Zeiten in Millisekunden. Keine Prompt-Inhalte, keine Schlüssel im Klartext.
CREATE TABLE IF NOT EXISTS ai_sessions (
  id TEXT PRIMARY KEY,
  discord_id TEXT NOT NULL,
  username TEXT,
  global_name TEXT,
  avatar TEXT,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS ai_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  session_id TEXT,
  bot TEXT,
  path TEXT NOT NULL,
  status INTEGER NOT NULL,
  tokens_in INTEGER,
  tokens_out INTEGER,
  cost_usd REAL,
  model TEXT
);
CREATE INDEX IF NOT EXISTS idx_ai_log_at ON ai_log(at);
CREATE INDEX IF NOT EXISTS idx_ai_log_session ON ai_log(session_id, at);
CREATE TABLE IF NOT EXISTS ai_bots (
  name TEXT PRIMARY KEY,
  key_enc TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
