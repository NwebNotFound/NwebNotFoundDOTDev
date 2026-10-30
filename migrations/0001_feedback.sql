-- Feedback (Bug/Idee) von mc.nwebnotfound.dev/feedback. Anwenden: npx wrangler d1 execute DB --remote --file migrations/0001_feedback.sql
CREATE TABLE IF NOT EXISTS feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL CHECK (type IN ('bug','idea')), title TEXT NOT NULL, body TEXT NOT NULL, location TEXT, discord_id TEXT, mc_name TEXT, mc_uuid TEXT, ip_hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done')), created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status, created_at);
CREATE INDEX IF NOT EXISTS idx_feedback_ip ON feedback(ip_hash, created_at);
CREATE INDEX IF NOT EXISTS idx_feedback_discord ON feedback(discord_id, created_at);
