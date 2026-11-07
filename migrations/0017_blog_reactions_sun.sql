-- NwebOS blog reader (mockups/nwebos/apps): three reactions, Mag ich (heart) · Gelernt (star) · Gute Laune (sun).
-- 0016 allowed only heart/star in a CHECK, which SQLite can't alter in place: copy into a new table with the wider
-- CHECK, keeping every existing row, then swap. Apply manually (Nils' rule):
--   npx wrangler d1 execute DB --remote --file migrations/0017_blog_reactions_sun.sql
CREATE TABLE IF NOT EXISTS blog_reactions_v2 (
  post_id TEXT NOT NULL,
  discord_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('heart', 'star', 'sun')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (post_id, discord_id, kind)
);
INSERT OR IGNORE INTO blog_reactions_v2 (post_id, discord_id, kind, created_at) SELECT post_id, discord_id, kind, created_at FROM blog_reactions;
DROP TABLE blog_reactions;
ALTER TABLE blog_reactions_v2 RENAME TO blog_reactions;
