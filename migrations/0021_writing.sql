-- NwebOS Verwaltung PR C (mockups/nwebos/apps/admin/notes.md): Texte & Kapitel move from content/writing/*.md (built
-- into src/generated/) into D1, so the Verwaltung can write and publish them. Additive only (two new tables).
-- Applied by CF Deployer (rule 4), after 0019 and 0020, BEFORE the deploy:
--   npx wrangler d1 execute nwebnotfound-guestbook --remote --file migrations/0021_writing.sql
-- No import step: content/writing/ holds no texts today (only its README), so there is nothing to copy. While the
-- tables have no published row the site keeps serving the built index (src/generated/content.js, feeds.js).

-- A series of chapters (a novel). status: draft | live
CREATE TABLE IF NOT EXISTS writing_series (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  title_de TEXT NOT NULL,
  title_en TEXT,
  status TEXT NOT NULL DEFAULT 'live',
  sort INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);
-- A chapter (kind story, series_id + chapter set) or a short text (kind short). status: draft | live | archived
-- (archived: off the lists, still reachable by its address — like `archived: true` in the old front matter).
CREATE TABLE IF NOT EXISTS writing_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  series_id INTEGER,
  kind TEXT NOT NULL DEFAULT 'story',
  chapter INTEGER,
  slug TEXT NOT NULL UNIQUE,
  title_de TEXT NOT NULL,
  title_en TEXT,
  body_de TEXT NOT NULL DEFAULT '',
  body_en TEXT,
  tags TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft',
  published_at INTEGER,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS writing_items_chapter ON writing_items (series_id, chapter) WHERE series_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS writing_items_status ON writing_items (status, published_at DESC);
