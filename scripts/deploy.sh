#!/usr/bin/env bash
# Deploy mit Cache-Busting: Hash über public/mc -> src/asset-version.js
set -euo pipefail
cd "$(dirname "$0")/.."
node scripts/sync-changelog.mjs || echo "WARN: Changelog-Sync fehlgeschlagen, nutze gebündelte Version"
# Inhalte (content/writing) vor dem Deploy bauen. Anders als der Changelog ist das rein lokal und
# deterministisch: eine ungültige Front-Matter-Datei bricht den Deploy ab (set -e), statt alte
# Inhalte stillschweigend weiter auszuliefern.
node scripts/build-content.mjs
AV=$(find public/mc -type f -print0 | sort -z | xargs -0 sha1sum | sha1sum | cut -c1-10)
echo "export const AV = \"$AV\";" > src/asset-version.js
echo "Asset-Version $AV"
# Vor dem Deploy prüfen, ob die Live-D1 alle Migrationen hat (sonst scheitert z. B. jedes Gebot/jede
# Bestellung am fehlenden ip_hash). Bewusst nur Prüfen statt `d1 migrations apply`: Begründung in
# scripts/schema-check.sh. Notfalls überspringen mit SKIP_SCHEMA_CHECK=1.
if [ "${SKIP_SCHEMA_CHECK:-0}" != "1" ]; then scripts/schema-check.sh --remote; else echo "WARN: Schema-Check übersprungen (SKIP_SCHEMA_CHECK=1)"; fi
npx wrangler deploy "$@"
