-- Parkour-Icon pro Kurs (Minecraft-Item-ID, z. B. golden_boots). Befüllt über /api/mc-ingest (optionales Feld `course_icon` in `parkour`).
-- Rein additiv; NULL → Website zeigt `paper`.
-- Live anwenden (nur nach Freigabe): npx wrangler d1 execute DB --remote --file migrations/0008_parkour_course_icon.sql
ALTER TABLE mc_parkour_courses ADD COLUMN course_icon TEXT;
