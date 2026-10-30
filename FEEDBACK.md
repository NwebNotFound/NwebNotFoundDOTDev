# Feedback (nwebnotfound.dev/feedback und mc.nwebnotfound.dev/feedback)

Bug melden, Idee oder Sonstiges einreichen. Gleiches MC-Design auf beiden Domains.

## Wer darf senden
- Nur mit dem bestehenden Discord-Login der Website (Session-Cookie).
- Der Discord-Account muss mit einem **verifizierten** MC-Account verknüpft sein und die **Server-Rolle** haben (`mc_links.verified = 1 AND has_role = 1`).
- Keine signierten Links. Einziges neues Secret: `FEEDBACK_ADMIN_TOKEN` (nur für die Admin-API; als Worker-Secret setzen, nie ausgeben).

## Schutz
- Cloudflare Turnstile (`TURNSTILE_SECRET`, bereits vorhanden); Origin muss die Website sein.
- Limit: **3 Einreichungen pro 24 h pro Discord-Account** (429 danach). Atomar per `INSERT … SELECT … WHERE count < 3`, daher auch bei parallelen Anfragen exakt.
- Turnstile-Antwort muss `success` sein **und** `hostname` = `nwebnotfound.dev` bzw. `mc.nwebnotfound.dev`.
- **Keine IP-Speicherung.** Gespeichert werden: Kategorie, Text, optional Item/Ort, Discord-ID, MC-Name/UUID, Status, Zeitstempel.

## API
| Methode | Pfad | Auth | Zweck |
|---|---|---|---|
| GET | `/api/feedback` | Session | eigener Status, Restkontingent, letzte 10 Einreichungen |
| POST | `/api/feedback` | Session + Origin + Turnstile | `{category: "bug"\|"idea"\|"other", text (10–2000), location?, token}` |
| GET | `/api/feedback/admin?status=&category=&limit=` | `Authorization: Bearer $FEEDBACK_ADMIN_TOKEN` | Liste (ohne Discord-ID) |
| PATCH | `/api/feedback/admin/<id>` | Bearer | `{status: open\|in_progress\|done\|rejected}` |

Beispiel (Token nie in Logs/Chats posten):
```sh
curl -H "Authorization: Bearer $FEEDBACK_ADMIN_TOKEN" https://mc.nwebnotfound.dev/api/feedback/admin?status=open
```

## Live schalten (nur nach Freigabe)
1. `npx wrangler secret put FEEDBACK_ADMIN_TOKEN` (Wert liegt auf der Box in `/workspace/.secrets/feedback_admin_token`, nie ins Repo/Chat)
2. `npx wrangler d1 execute DB --remote --file migrations/0004_feedback.sql`
3. Deploy über `./scripts/deploy.sh`

Lokal: `node scripts/e2e.mjs` (Schema inkl. `feedback`-Tabelle, Turnstile-Testschlüssel, Abschnitt 6d).
