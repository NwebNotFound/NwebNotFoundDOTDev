-- Parkour-Bestzeiten (Lobby): pro Kurs und Spieler nur die beste (niedrigste) Zeit. Befüllt über /api/mc-ingest (Feld `parkour`, mc-stack PR #13).
-- Nummer 0005: 0003 = offener PR #6 (security), 0004 = feedback.
-- Live anwenden (nur nach Freigabe): npx wrangler d1 execute DB --remote --file migrations/0005_parkour.sql
CREATE TABLE IF NOT EXISTS mc_parkour (course TEXT NOT NULL, mc_uuid TEXT NOT NULL, mc_name TEXT, time_ms INTEGER NOT NULL, set_at TEXT NOT NULL, PRIMARY KEY (course, mc_uuid));
CREATE INDEX IF NOT EXISTS idx_mc_parkour_course_time ON mc_parkour(course, time_ms);
