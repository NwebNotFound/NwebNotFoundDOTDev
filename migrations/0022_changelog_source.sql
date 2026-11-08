-- Automatic changelogs (Nils 08.11.: "Please make the changelogs automatically"): a merged PR's "## Changelog" block
-- becomes a live row via POST /api/changelog/ingest (GitHub Action, src/changelog-ingest.js). Additive only.
-- Applied by CF Deployer (rule 4) after 0021, BEFORE the deploy:
--   npx wrangler d1 execute nwebnotfound-guestbook --remote --file migrations/0022_changelog_source.sql
-- source  = where an automatic row came from ("NwebNotFound/NwebNotFoundDOTDev#141", "import:mc-12"): one row per
--           source, so a re-sent event or a re-run import adds nothing.
-- edited  = 1 once Nils changed the row in the Verwaltung: the automation never overwrites it again.
-- pr_url  = link to the PR (shown nowhere yet; for the Verwaltung list).
ALTER TABLE changelog ADD COLUMN source TEXT;
ALTER TABLE changelog ADD COLUMN edited INTEGER NOT NULL DEFAULT 0;
ALTER TABLE changelog ADD COLUMN pr_url TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS changelog_source ON changelog (source) WHERE source IS NOT NULL;
