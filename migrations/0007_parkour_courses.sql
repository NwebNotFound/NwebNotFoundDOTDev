-- Parkour-Anzeigenamen pro Kurs (z. B. cave_rush → „Cave Rush“). Befüllt über /api/mc-ingest (optionales Feld `course_name` in `parkour`).
-- Rein additiv, mc_parkour bleibt unverändert. Ohne Eintrag zeigt die Website die Kurs-ID (z. B. kurs1).
-- Live anwenden (nur nach Freigabe): npx wrangler d1 execute DB --remote --file migrations/0007_parkour_courses.sql
CREATE TABLE IF NOT EXISTS mc_parkour_courses (course TEXT PRIMARY KEY, course_name TEXT NOT NULL, updated_at TEXT NOT NULL);
