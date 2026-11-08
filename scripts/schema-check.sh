#!/usr/bin/env bash
# Prüft, ob die D1-Datenbank alle Tabellen/Spalten hat, die der Worker-Code braucht (Stand bis
# migrations/0015). Jede Zeile ist ein SELECT … LIMIT 0: eine fehlende Tabelle oder Spalte ergibt
# "no such table/column" und damit einen Fehler, ohne Daten zu lesen oder zu ändern.
#
# Warum kein `wrangler d1 migrations apply`: die Migrationen wurden bisher von Hand mit
# `d1 execute --file` eingespielt, die Tabelle d1_migrations kennt sie also nicht. `migrations apply`
# würde alle erneut ausführen – inklusive des veralteten 0001 und des Tabellen-Umbaus 0006 (DROP +
# Neuanlage von mc_shop_orders_pending), und an den ALTER TABLE … ADD COLUMN (0008, 0014, 0015)
# scheitern. Neue Migrationen bitte weiterhin von Hand einspielen und hier eine Prüfzeile ergänzen.
#
# Aufruf: scripts/schema-check.sh --remote   (oder --local [--persist-to DIR] für Tests)
set -euo pipefail
cd "$(dirname "$0")/.."
DB="${D1_DB:-DB}"
CHECK="SELECT 1 FROM mc_meta LIMIT 0;
SELECT category FROM feedback LIMIT 0;
SELECT course FROM mc_parkour LIMIT 0;
SELECT type, listing_id FROM mc_shop_orders_pending LIMIT 0;
SELECT order_id FROM mc_order_hidden LIMIT 0;
SELECT course_name, course_icon FROM mc_parkour_courses LIMIT 0;
SELECT ts FROM mc_price_ticks LIMIT 0;
SELECT day FROM mc_economy_daily LIMIT 0;
SELECT rank FROM mc_player_ranks LIMIT 0;
SELECT wins FROM mc_pvp_stats LIMIT 0;
SELECT ip_hash FROM mc_bids_pending LIMIT 0;
SELECT ip_hash FROM mc_shop_orders_pending LIMIT 0;
SELECT ip_hash, world_type, settings FROM mc_vip_commands LIMIT 0;
SELECT expires_at FROM sessions LIMIT 0;
SELECT discord_id, lang, theme, sound, boot, reduced_motion FROM user_prefs LIMIT 0;
SELECT discord_id, game, variant, played, won, best, streak, best_streak, dist FROM game_stats LIMIT 0;
SELECT discord_id, badge, earned_at FROM user_badges LIMIT 0;
SELECT key, lang, json, version FROM site_blocks LIMIT 0;
SELECT id, sort, status, progress, href, icon, title_de, title_en, text_de, text_en, version FROM projects LIMIT 0;
SELECT id, day, area, title_de, title_en, text_de, text_en, status, sort, version FROM changelog LIMIT 0;
SELECT hidden, reported FROM entries LIMIT 0;
SELECT at, discord_id, section, item, action, before_json FROM admin_log LIMIT 0;
SELECT id, slug, title_de, title_en, status, sort, version FROM writing_series LIMIT 0;
SELECT id, series_id, kind, chapter, slug, title_de, title_en, body_de, body_en, tags, status, published_at, version FROM writing_items LIMIT 0;
SELECT source, edited, pr_url FROM changelog LIMIT 0;"
if out=$(npx wrangler d1 execute "$DB" "$@" --command "$CHECK" 2>&1); then
  echo "Schema-Check ok"
else
  echo "$out" | grep -iE "no such (table|column)|error" | head -5 >&2 || true
  echo "FEHLER: Der D1-Datenbank fehlen Tabellen/Spalten (siehe oben). Fehlende Migration aus migrations/ einspielen:" >&2
  echo "  npx wrangler d1 execute $DB $* --file migrations/<NNNN_name>.sql" >&2
  exit 1
fi
