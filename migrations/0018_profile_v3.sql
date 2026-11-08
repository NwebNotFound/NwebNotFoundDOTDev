-- NwebOS "Mein Profil" v3 (mockups/nwebos/apps/profile-v3/notes.md): settings, game stats and badges per Discord account.
-- Additive only (three new tables, nothing dropped or rewritten). Applied by CF Deployer (rule 4):
--   npx wrangler d1 execute DB --remote --file migrations/0018_profile_v3.sql
CREATE TABLE IF NOT EXISTS user_prefs (
  discord_id TEXT PRIMARY KEY,
  lang TEXT,
  theme TEXT,
  sound INTEGER,
  boot INTEGER,
  reduced_motion INTEGER,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS game_stats (
  discord_id TEXT NOT NULL,
  game TEXT NOT NULL,
  variant TEXT NOT NULL,
  played INTEGER NOT NULL DEFAULT 0,
  won INTEGER NOT NULL DEFAULT 0,
  best INTEGER,
  streak INTEGER NOT NULL DEFAULT 0,
  best_streak INTEGER NOT NULL DEFAULT 0,
  dist TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (discord_id, game, variant)
);
CREATE TABLE IF NOT EXISTS user_badges (
  discord_id TEXT NOT NULL,
  badge TEXT NOT NULL,
  earned_at INTEGER NOT NULL,
  PRIMARY KEY (discord_id, badge)
);
