# nwebnotfound.dev – Creative Hub Plan ("creative minds")

Status: **plan only.** No code, no deploy, no secrets. Folds in the lofi radio plan (PR #49) and builds on the design system in PR #44 (`DESIGN.md`).

## 1. Goal
Turn nwebnotfound.dev from a near-empty start page + guestbook into Nils' personal creative hub: **his own music, photography, writing, reviews, guestbook, about** – with a cute, happy **anime summer** look and Apple-level polish, mobile-first (390px target, per DESIGN.md §0).

Out of scope / must keep working: `mc.nwebnotfound.dev` (Minecraft status, parkour, economy), `/api/mc-ingest`, `/api/mc-data`, Discord login (`/auth/discord/*`, `/api/me`), AI panel (`ai.nwebnotfound.dev`).

**Guiding principle:** the hub shows *everything Nils is into* and shares it with the world. New interests must be cheap to add: a generic **collections + tags** model (§4.3) means a new category (e.g. cooking, cosplay, gaming clips) is one config row plus content, not a new page type.

## 2. Current state (fits into)
- One Worker `nwebnotfound-site` (`src/worker.js`, server-rendered HTML), static assets from `public/` (`ASSETS` binding).
- D1 `nwebnotfound-guestbook` (binding `DB`), migrations in `migrations/`.
- Guestbook with Turnstile (`TURNSTILE_SECRET` as Worker secret, public sitekey in code).
- Design tokens (`--ds-*`, shadcn-style semantics) proposed in PR #44.

The hub stays in **this one Worker + D1**. New pages are server-rendered like today; heavy interactive bits (player, lightbox) are small vanilla JS islands in `public/`. No framework, no build step (matches DESIGN.md).

## 3. Information architecture & routes
| Route | Content |
|---|---|
| `/` | Hero (sunny sky scene, name, one-liner), "now playing" mini player, latest photo / post / review cards, links |
| `/music` | Streaming-like player: tracks, playlists ("stations"), album/EP pages |
| `/music/:slug` | Track page (cover, waveform, credits, loop toggle, share) |
| `/music/study` | Study mode: looped playlist + optional ambient mixer + Pomodoro (from PR #49) |
| `/photos` | Gallery grid, categories **Real life** (travel, nature, city, people…) and **Virtual photography** (Cyberpunk 2077 photo mode, other games), albums within each |
| `/photos/:album` / `/photos/:album/:id` | Album grid / lightbox deep link |
| `/writing` | Blog + stories, filter by type/tag |
| `/writing/:slug` | Post/story reader (comfortable typography, reading time, chapters for series) |
| `/writing/archive` | Optional: old Harutronic pieces, unlisted from home, marked "archive" |
| `/motion` | Motion design & video edits showcase |
| `/motion/:slug` | Project page: video embed, thumbnail, project notes (tools, idea, process) |
| `/c/:collection` | Generic page for any future interest collection |
| `/reviews` | Movies, anime, books, light novels, games; filter by medium, rating, tag |
| `/reviews/:slug` | Review with cover, rating, verdict, spoiler blocks |
| `/guestbook` | Revamped guestbook (Turnstile stays) |
| `/about` | Who Nils is, quirks, "currently into", tools (FL Studio, photo mode, …), links |
| `/admin/*` | Admin UI, **Cloudflare Access only** (Nils' account) |
| `/feed.xml` | RSS for writing + reviews |

Global nav (mobile: bottom tab bar): Home · Music · Photos · Writing · ⋯ (Motion, Reviews, Guestbook, About, other collections). Footer: GitHub (github.com/NwebNotFound), X profile, Discord, RSS, mc.nwebnotfound.dev.

## 4. Content model
Principle: **text content as Markdown in the repo** (versioned, reviewable in PRs, free), **dynamic/user data in D1**, **media files** in Workers static assets as long as they fit, R2 only with Nils' explicit OK.

### 4.1 Markdown in repo (`content/`)
- `content/writing/*.md` – frontmatter: `title, slug, type (post|story|chapter), series?, tags[], date, draft, archived, cover?`
- `content/reviews/*.md` – `title, slug, medium (movie|anime|book|light-novel|manga|game|series), rating (0–10, half steps), verdict, tags[], date, external {tmdb|anilist|openlibrary id}, cover, spoilers`
- `content/about.md`
- A tiny script (`scripts/build-content`) turns Markdown into a JSON index + HTML at deploy time, so the Worker serves prebuilt pages (no runtime parsing cost).

### 4.2 D1 tables (new migrations)
```sql
tracks(id, slug, title, bpm, key, duration_s, loop_start_ms, loop_end_ms, cover_path, audio_path, released_at, status /*draft|public*/, plays)
playlists(id, slug, title, description, cover_path, sort)
playlist_tracks(playlist_id, track_id, pos)
media(id, kind /*image|audio|video|embed*/, path_or_url, provider /*self|youtube|x|stream*/, width, height, duration_s, blurhash, thumb_path, alt, created_at)  -- shared media library
photos(id, media_id, category /*real|virtual*/, album, game?, path, width, height, blurhash, caption, exif_json, taken_at, sort, status)
videos(id, slug, media_id, title, kind /*motion|edit|clip*/, tools, notes_md, thumb_media_id, published_at, status)
collections(slug, title, icon, color_token, description, sort, template /*grid|list|timeline*/)
items(id, collection_slug, title, slug, media_id?, body_md?, meta_json, published_at, status)  -- generic entries for new interests
tags(slug, label) ; item_tags(target_type, target_id, tag_slug)  -- shared tags across all sections
albums(slug, category, title, description, cover_photo_id, sort)
guestbook  -- existing table, add: sticker, color, mood, reply (Nils' reply), pinned
reactions(target_type, target_id, emoji, count)   -- anonymous hearts/sparkles, rate-limited
todos(user_id, id, text, done, created_at)       -- study mode, Discord login
```
Music, photos and videos live in D1 (not Markdown) because Nils uploads them via the admin UI.

### 4.3 Collections & cross-linking
- Every section (music, photos, motion, writing, reviews) is a built-in collection; new interests are added as rows in `collections` and use the generic `items` table + templates.
- Shared tags work across everything (`/tags/:tag` shows photos, tracks, posts, reviews together).
- **Embeds in posts/stories** via shortcodes in Markdown, resolved at build/render time from the media library:
  `{{photo id=123}}`, `{{gallery album=tokyo-2026}}`, `{{track slug=sunny-loop}}` (inline mini player), `{{video slug=edit-01}}`, `{{review slug=frieren}}` (card).
- Admin gets a **media picker** that inserts these shortcodes; posts list their linked items, and linked items show "featured in" back-links.

## 5. Admin / editing flow (Nils only)
- `/admin` protected by **Cloudflare Access** (free, email/GitHub login) + Worker checks the `Cf-Access-Jwt-Assertion` header. No public sign-up, no passwords in the repo.
- **Music:** upload WAV/MP3 export from FL Studio → set title, cover, BPM, loop points (drag on waveform preview), playlist → publish.
- **Photos:** drag in images → album, caption, optional EXIF keep/strip (strip GPS always).
- **Videos:** paste a YouTube/X URL (or upload to Stream if enabled) → thumbnail, tools, project notes.
- **Media library:** one shared view of all images/audio/videos with copy-shortcode button.
- **Collections:** add a new interest category (title, icon, colour, template) without code.
- **Guestbook:** approve/hide, pin, reply.
- **Writing & reviews:** edited as Markdown in the repo (VS Code / GitHub web editor / Hermes), merged via PR → auto deploy. Optional later: a simple admin Markdown editor that opens a PR via GitHub API.
- Review helper: enter a title → admin fetches cover + metadata from TMDB (movies/series), AniList GraphQL (anime/manga/LN), Open Library (books). API keys (TMDB) as Worker secrets only.

## 6. Hosting on the free tier
- **Workers + static assets:** HTML/CSS/JS, illustrations, optimized images and (initially) audio. Static asset limit is 25 MiB per file, 20,000 files – fine for a few dozen tracks as 128–192 kbps Opus/MP3 (~3–6 MB each).
- **Images:** pre-generate AVIF/WebP in 3 sizes (480/1080/2048) + blurhash **at upload/commit time** with a script (sharp), since Cloudflare Images/transformations aren't free. Lazy-load, `srcset`.
- **D1:** metadata, guestbook, reactions, todos (well within free limits).
- **Audio streaming:** HTTP range requests from static assets; no transcoding on the server.
- **Video:** embeds from YouTube / X by default (free, no bandwidth on our side). **Cloudflare Stream** (paid, per minute stored/delivered) only with Nils' explicit OK on costs. Short loops/previews (<25 MiB) may be self-hosted as static assets.
- **R2:** only if the media library outgrows static assets, and **only with Nils' explicit OK** (R2 has a free tier but requires billing on the account).
- **Upload path without R2:** admin upload commits the file to the repo via GitHub API → redeploy. Slower, but free. Decide in open questions.
- Caching: long `Cache-Control` for hashed assets (`asset-version.js` already exists), short for HTML.

## 7. Aesthetic direction – "anime summer"
Mood: the first warm day of summer vacation – bright sky, cumulus clouds, sunflowers, cicadas, ramune, wind chimes (furin), a train station by the sea. Cute and happy, but clean and premium, never cluttered.

**References:** *Your Name* / *Weathering With You* skies (Makoto Shinkai), *Summer Time Rendering*, Studio Ghibli summer scenes, *Spirit City: Lofi Sessions*, Lofi Girl, Apple's product pages for layout restraint, Nintendo's playful UI motion.

**Palette** (as `--ds-*` tokens from PR #44, light theme first):
| Token | Colour | Use |
|---|---|---|
| sky | `#8FD3FF` → `#DDF3FF` gradient | hero, backgrounds |
| cloud | `#FFFFFF` / `#F7FBFF` | cards |
| ink | `#1F2A44` | text |
| sunflower | `#FFD45E` | primary accent, buttons |
| peach | `#FFB8A8` | highlights, hearts |
| sakura | `#FFC8DD` | tags, stickers |
| ramune | `#7FE0D3` | music, links |
| lavender | `#C9B8FF` | writing |
Dark theme = "summer night": deep navy `#141B33`, fireflies, stars, lanterns; same accents slightly muted. Contrast ≥ WCAG AA.

**Fonts** (self-hosted, free): headings **"M PLUS Rounded 1c"** or **"Nunito"** (soft rounded), body **"Inter"**, accents/JP flavour **"Zen Maru Gothic"**; reader mode for stories: **"Literata"**.

**Shape & detail:** big radii (20–28px), soft shadows, sticker-like badges with white outlines, hand-drawn underline squiggles, little kaomoji in empty states (`(◕‿◕)`).

**Motion** (CSS first, respects `prefers-reduced-motion`): drifting clouds parallax in hero, sun glint on hover, cards bounce in softly (spring easing), wind-chime sway on nav icon, sparkle burst on reactions, vinyl/cassette spin while playing, page transitions via View Transitions API. 60fps, no layout shift.

**Illustration ideas:** a chibi mascot (Nils' avatar? a cat with headphones?) that appears per section – DJ with headphones on Music, camera on Photos, pen on Writing, popcorn on Reviews, waving on Guestbook. Commission or self-drawn; placeholder with SVG shapes until then.

**Section flavours:** Music = cassette/walkman player on a windowsill; Photos = polaroids on a string / film strip (Cyberpunk album gets a neon-at-dusk variant); Writing = notebook paper; Reviews = ticket stubs & manga-style rating stars; Guestbook = summer festival wall of ema plaques / postcards.

## 8. Section details
### Music (rebrand of PR #49)
- Persistent mini player across pages (no reload thanks to client-side nav or View Transitions), queue, shuffle, repeat, **gapless/perfect loop** via Web Audio API using stored loop points.
- Playlists as "stations" (e.g. *Sunny Mornings*, *Late Night Beats*, *Focus*). Only Nils' tracks by default; the vetted free tracks from PR #49 stay an optional fallback station.
- Study mode: ambient mixer (rain, café, wind, typewriter – CC0 Freesound list in PR #49), Pomodoro, to-dos (Discord login). Website = single-player.
- Later: Discord Activity (Embedded App SDK) reusing the same player, synced per voice channel – as planned in PR #49.
- **Portfolio angle:** his own FL Studio lofi loops & beats as a showcase – per track BPM/key, "made in FL Studio", optional loop/stem previews and short process notes/screenshots, "beat tape" releases. Linked from About as part of his portfolio.
- Media Session API for lock-screen controls on mobile.

### Photography
- Two categories with own albums: **Real life** (his own camera/phone photos) and **Virtual photography** (Cyberpunk 2077 photo mode and other games). Same lightbox; virtual shots get a neon-dusk frame variant.
- Masonry/justified grid, albums, lightbox with swipe, pinch-zoom, keyboard nav, optional EXIF panel (camera, lens; for photo mode: game, location/district). GPS stripped.

### Writing
- Posts and stories can embed or link photos, galleries, tracks, videos and reviews (shortcodes, §4.3).
- Blog posts and stories; series with chapters; reading progress bar; estimated reading time; table of contents. Fresh start – Harutronic works only in `/writing/archive` if Nils wants them public at all.

### Motion design & video edits
- Showcase grid with hover-preview thumbnails, filter by kind (motion design, edits, clips) and tools (After Effects, Premiere, DaVinci, Blender…).
- Project page: embed, project notes (idea, process, breakdown), linked music if he scored it himself.

### Reviews
- Card grid with cover art, medium icon, score (e.g. 8.5/10 shown as stars or a "sunflower meter"), tags, "currently watching/reading" shelf, yearly stats.

### Guestbook revamp
- Postcards/ema wall: pick a sticker + colour, short message, Turnstile kept, rate-limit, Nils can reply & pin. Reactions on entries. Existing entries migrate unchanged.

### About & links
- Quirks list, "currently into" (pulled from latest reviews / now playing), tools, GitHub + X + Discord links, small "made with Cloudflare Workers" colophon.

## 9. Phased rollout (one PR each, all reviewed by Claude Code / Codex)
1. **Design system + summer theme tokens** (builds on PR #44): palette, fonts, base components, light/dark, reduced-motion.
2. **Shell & home:** nav/tab bar, footer links, new home with hero and placeholders; `/about`. Minecraft + AI panel untouched (regression check).
3. **Guestbook revamp** (D1 migration adds columns, Turnstile unchanged).
4. **Writing + reviews** from Markdown, RSS, TMDB/AniList/Open Library helper script.
5. **Media library + photography** (shared `media` table, real-life & virtual categories, image pipeline).
5b. **Shortcodes/embeds** in writing (photos, galleries, tracks, videos, reviews) + tags pages.
6. **Music v1:** tracks, playlists, persistent player, perfect loops (assets committed manually).
6b. **Motion & video** showcase (YouTube/X embeds).
7. **Admin** (incl. media picker, collections manager) behind Cloudflare Access: music/photo upload, guestbook moderation.
8. **Study mode** (ambient mixer, Pomodoro, to-dos) from PR #49.
9. **Discord Activity** (needs Nils' Discord Developer Portal login).

## 10. Open questions for Nils
1. Mascot: your own avatar, a cat with headphones, or something else? Draw it yourself or commission?
2. Light "summer day" as default with "summer night" dark mode – okay?
3. Music: only your tracks, or keep the free lofi station from PR #49 as filler until you have enough?
4. Uploads: free GitHub-commit route (slower) or enable R2 (needs billing on the Cloudflare account)?
5. Harutronic: archive publicly, keep private, or remove?
6. Review scale: 0–10 with halves, 5 stars, or a custom "sunflower" scale?
7. Which X handle should be linked?
8. Site language: English, German, or both?
9. Should guestbook entries need approval before showing up, or show instantly?
10. Video: YouTube/X embeds only, or budget for Cloudflare Stream?
11. Which other interests should get their own collection at launch (gaming, cosplay, cooking, …)?
12. Real-life photos: which albums/categories to start with?
13. Music portfolio: show stems/process notes, or just finished tracks?
14. Photos: show EXIF/game metadata, or keep it clean?
