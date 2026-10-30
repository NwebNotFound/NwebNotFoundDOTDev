-- Feedback (Bug/Idee) von mc.nwebnotfound.dev/feedback. Keine IP-Speicherung; Limit 3/Tag pro Discord-Account.
-- Live anwenden (nur nach Freigabe): npx wrangler d1 execute DB --remote --file migrations/0001_feedback.sql
CREATE TABLE IF NOT EXISTS feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL CHECK (type IN ('bug','idea')), title TEXT NOT NULL, body TEXT NOT NULL, location TEXT, discord_id TEXT NOT NULL, mc_name TEXT, mc_uuid TEXT, status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','done','rejected')), admin_note TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status, created_at);
CREATE INDEX IF NOT EXISTS idx_feedback_discord ON feedback(discord_id, created_at);
