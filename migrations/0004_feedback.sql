-- Feedback (Bug/Idee/Sonstiges) von /feedback auf nwebnotfound.dev und mc.nwebnotfound.dev.
-- Keine IP-Speicherung; Limit 3/Tag pro Discord-ID (im Worker, atomar). Ersetzt den nie live angewandten Entwurf 0001_feedback.sql.
-- Vorher prüfen: npx wrangler d1 execute DB --remote --command "SELECT sql FROM sqlite_master WHERE name='feedback'"
--   (muss leer sein; falls eine alte feedback-Tabelle aus 0001 existiert, erst mit Nils klären, NICHT einfach löschen)
-- Live anwenden (nur nach Freigabe): npx wrangler d1 execute DB --remote --file migrations/0004_feedback.sql
CREATE TABLE IF NOT EXISTS feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, discord_id TEXT NOT NULL, mc_uuid TEXT, mc_name TEXT, category TEXT NOT NULL CHECK (category IN ('bug','idea','other')), text TEXT NOT NULL CHECK (length(text) <= 2000), location TEXT, status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','done','rejected')), created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status, created_at);
CREATE INDEX IF NOT EXISTS idx_feedback_discord ON feedback(discord_id, created_at);
