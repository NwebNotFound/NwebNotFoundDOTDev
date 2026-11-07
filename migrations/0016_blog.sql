-- Blog (roadmap Phase 4). Additive only: new tables, nothing existing changes. Apply manually
-- (Nils' rule): npx wrangler d1 execute nwebnotfound-guestbook --remote --file migrations/0016_blog.sql
-- Posts are written in the website editor (admin only); DE is required, EN optional (second tab).
CREATE TABLE IF NOT EXISTS blog_posts (
  id TEXT PRIMARY KEY,                 -- random UUID
  slug TEXT NOT NULL UNIQUE,           -- [a-z0-9-]{1,80}
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'withdrawn')),
  category TEXT NOT NULL CHECK (category IN ('bauen', 'server', 'musik', 'notizen')),
  tags TEXT NOT NULL DEFAULT '[]',     -- JSON array of strings
  title_de TEXT NOT NULL,
  summary_de TEXT NOT NULL DEFAULT '',
  body_de TEXT NOT NULL DEFAULT '',    -- Markdown, rendered (sanitised) on the server
  title_en TEXT,
  summary_en TEXT,
  body_en TEXT,
  preview_token TEXT,                  -- secret link for drafts (editor)
  author_id TEXT,                      -- discord id of the admin who wrote it
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  published_at INTEGER                 -- first publish, ms; NULL while never published
);
CREATE INDEX IF NOT EXISTS blog_posts_pub ON blog_posts (status, published_at);

-- Reactions: one per kind per account (toggle). Counts are public, who reacted is not.
CREATE TABLE IF NOT EXISTS blog_reactions (
  post_id TEXT NOT NULL,
  discord_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('heart', 'star')),
  created_at INTEGER NOT NULL,
  PRIMARY KEY (post_id, discord_id, kind)
);

-- Reading progress per signed-in account (private profile "Weiterlesen").
CREATE TABLE IF NOT EXISTS blog_reads (
  discord_id TEXT NOT NULL,
  post_id TEXT NOT NULL,
  pct INTEGER NOT NULL CHECK (pct BETWEEN 0 AND 100),
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (discord_id, post_id)
);
