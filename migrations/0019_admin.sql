-- NwebOS Verwaltung (mockups/nwebos/apps/admin/notes.md): site texts, projects and site news move from code into D1,
-- guestbook moderation flags, and an admin action log. Additive only (new tables, two new columns with defaults,
-- nothing dropped or rewritten). Applied by CF Deployer (rule 4) BEFORE the deploy:
--   npx wrangler d1 execute nwebnotfound-guestbook --remote --file migrations/0019_admin.sql
-- Until rows exist the site keeps showing today's texts (the code fallback); the seed comes in its own migration.

-- One row per text block and language: home.hero, home.facts, about.text (lang de|en), home.xp (lang '*').
CREATE TABLE IF NOT EXISTS site_blocks (
  key TEXT NOT NULL,
  lang TEXT NOT NULL,
  json TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (key, lang)
);
-- The Projekte window, in `sort` order. status: live | neu | bald | idee; progress 0..10.
CREATE TABLE IF NOT EXISTS projects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sort INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'idee',
  progress INTEGER NOT NULL DEFAULT 0,
  href TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT 'about',
  title_de TEXT NOT NULL,
  title_en TEXT,
  text_de TEXT NOT NULL DEFAULT '',
  text_en TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);
-- Site news (Neuigkeiten). area: website | server | blog; status: draft | live. Server entries also keep coming
-- from mc-changelog.js.
CREATE TABLE IF NOT EXISTS changelog (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day TEXT NOT NULL,
  area TEXT NOT NULL DEFAULT 'website',
  title_de TEXT NOT NULL,
  title_en TEXT,
  text_de TEXT NOT NULL DEFAULT '',
  text_en TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  sort INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS changelog_day ON changelog (status, day DESC);
-- Guestbook moderation: hidden entries are not shown publicly (reversible); reported = flagged for a look.
ALTER TABLE entries ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0;
ALTER TABLE entries ADD COLUMN reported INTEGER NOT NULL DEFAULT 0;
-- Every admin write: who, what, and the row before (like vip_admin_log).
CREATE TABLE IF NOT EXISTS admin_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at INTEGER NOT NULL,
  discord_id TEXT NOT NULL,
  section TEXT NOT NULL,
  item TEXT NOT NULL,
  action TEXT NOT NULL,
  before_json TEXT
);
CREATE INDEX IF NOT EXISTS admin_log_at ON admin_log (at DESC);
