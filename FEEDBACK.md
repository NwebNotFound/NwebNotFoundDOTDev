# Feedback (mc.nwebnotfound.dev/feedback)

Bug melden oder Idee einreichen.

## Wer darf senden
- Nur mit dem bestehenden Discord-Login der Website (Session-Cookie).
- Der Discord-Account muss mit einem **verifizierten** MC-Account verknüpft sein und die **Server-Rolle** haben (`mc_links.verified = 1 AND has_role = 1`).
- Keine neuen Secrets und keine signierten Links.

## Schutz
- Cloudflare Turnstile (`TURNSTILE_SECRET`, bereits vorhanden); Origin muss die Website sein.
- Limit: **3 Einreichungen pro 24 h pro Discord-Account** (429 danach).
- **Keine IP-Speicherung.** Gespeichert werden: Typ, Titel, Text, optional Ort, Discord-ID, MC-Name/UUID, Status, Zeitstempel.

## API
| Methode | Pfad | Auth | Zweck |
|---|---|---|---|
| GET | `/api/feedback` | Session | eigener Status, Restkontingent, letzte 10 Einreichungen |
| POST | `/api/feedback` | Session + Origin + Turnstile | `{type: "bug"\|"idea", title (3–100), body (10–2000), location?, token}` |
| GET | `/api/feedback/admin?status=&type=&limit=` | `Authorization: Bearer $FEEDBACK_ADMIN_TOKEN` | Liste (ohne Discord-ID) |
| PATCH | `/api/feedback/admin/<id>` | Bearer | `{status: open\|in_progress\|done\|rejected, admin_note?}` |

Beispiel (Token nie in Logs/Chats posten):
```sh
curl -H "Authorization: Bearer $FEEDBACK_ADMIN_TOKEN" https://mc.nwebnotfound.dev/api/feedback/admin?status=open
```

## Live schalten (nur nach Freigabe)
1. `npx wrangler secret put FEEDBACK_ADMIN_TOKEN` (zufälliger Wert, nur im Passwortmanager)
2. `npx wrangler d1 execute DB --remote --file migrations/0001_feedback.sql`
3. Deploy über `./scripts/deploy.sh`

Lokal: `node scripts/e2e.mjs` (Schema inkl. `feedback`-Tabelle, Turnstile-Testschlüssel, Abschnitt 6d).
