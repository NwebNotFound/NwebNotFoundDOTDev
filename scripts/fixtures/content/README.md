# Test-Fixtures (nie im Build von `content/`)

Diese Markdown-Dateien sind **Platzhalter für Tests**: `scripts/content-unit.mjs`,
`scripts/markdown-unit.mjs`, `scripts/hub-unit.mjs` und `scripts/e2e.mjs` (über
`node scripts/build-content.mjs --fixtures`) bauen daraus den Index.

- Sie sind offensichtlich als Test-Platzhalter benannt (`TEST FIXTURE …`, Slug `test-fixture-*`).
- Sie liegen **nicht** unter `content/writing/` und landen daher nie in einem echten Deploy.
- `scripts/build-content.mjs` liest `content/writing/` als Quelle; nur der Schalter `--fixtures`
  (bzw. `--from scripts/fixtures/content`) liest diesen Ordner.
- Kein echter Inhalt, keine erfundenen Geschichten – genau wie in `content/writing/README.md`
  beschrieben.
