# nwebnotfound.dev – Creative Hub Plan ("creative minds")

Status: **plan only.** No code, no deploy, no secrets. Folds in the lofi radio plan (PR #49) and builds on the design system in PR #44 (`DESIGN.md`).

## 0. Decisions so far (Nils, 2026-11-03)
These answer open questions 1, 4, 8, 9, 10 and 17 (see §10) and override anything older in this document.
- **Mascot:** Nils draws it himself. Until then the site uses SVG placeholder shapes.
- **Languages:** German and English, both **automatically translated** (§8, "Languages").
- **Guestbook:** **automatic moderation**, no manual approval queue by default (§8, "Guestbook").
- **Storage:** uploads live on **Nils' own PC** for now (later maybe a mini-PC), not on R2 and not on Cloudflare Stream. Cloudflare only holds the code, the database and small thumbnails (§5a, §6).
- **Video: none.** No hosted or embedded video and no motion/video section. Nils shares videos on YouTube himself; the hub does not need them.
- **Focus:** this is Nils' little corner of the internet. The core is **stories (a new story that Nils is going to write), music, the blog and reviews.** Photos, the tools page and study mode come after and can be cut or postponed without hurting the core (§9).
- **Photos stay** (real life and virtual photography).
- **Discord Activity is cut.** The lofi radio from PR #49 can still come to the website as a single-player feature, but nothing is built for Discord.
- **Export:** stories (and later research papers) can be downloaded as **EPUB or PDF** (§8, "Export"). Blog posts and reviews get **no** download buttons; nobody needs an EPUB of a blog post, and the browser's print function still works.
- **Research (new, later):** a place to publish scientific work such as papers, reports and theses, with PDF, math, citations and optional DOIs (§8, "Research & publications").
- **Feeds:** blog, stories, reviews and music each get an **RSS/Atom feed** (§8, "Feeds").
- **Look:** a **pixel-art anime** blend: soft anime summer skies with pixel-art details and a pixel mascot (§7).
- **No AI writes the stories.** AI is used only for moderation and translation. The studio has no "generate story" feature.
- **Hermes MCP server:** planned separately in `ai-panel/docs/mcp-server-plan.md`, not part of this hub.
- **Tools page (new):** online tools run in the visitor's browser; local tools (apps, games) are downloaded from **GitHub Releases**. No public self-hosted git server (§8, "Tools & downloads").

### Decisions, round 3 (Nils, 2026-11-03) - these override anything older in this document
- **Discord Activity and video stay cut.** The lofi radio / study mode is single-player on the website only (late phase).
- **`/motion` is now Nils' own element library** (JS, CSS, animations, UI components): every element has a live, beautiful preview next to its code, plus a **machine-readable index** (JSON manifest and a plain-text listing) so AI agents can read the code and the intent. Static, no paid service. It replaces the dropped video/motion showcase.
- **Theme:** "summer day" (light) is the default, "summer night" is the dark mode.
- **Writing:** **one content type `writing`** with a `kind` of `story` or `blog` (stories get series and chapters, blog posts do not). Shared tags and editor.
- **Music:** **no paid Cloudflare plan, ever, unless Nils asks.** Tracks are small MP3/Opus files shipped as static assets (free), so they play even when the PC is off; keep each file well below the 25 MiB asset limit. Full-size photos stay on the home origin.
- **Samples and sound design (new):** a `/samples` section where visitors can **download samples and sound-design packs**. Packs are zip files published as **GitHub Releases** (free, versioned, outside Cloudflare traffic); the site only links to them and plays short preview clips (small static files). Licence line: **free to use in your own projects, including commercial ones; no resale or redistribution as sample packs.**
- **Reviews:** **5-star scale.**
- **EPUB/PDF rights line:** "(c) Nils, personal reading only."
- **Studio login: Discord.** Cloudflare Access has no Discord identity provider, so the studio reuses the Worker's existing Discord OAuth (as the AI panel does) with an **allowlist of Discord user IDs** (a Worker secret, only Nils). Every write endpoint checks the session and the allowlist, the public host exposes no write endpoints, and `create.` is a custom domain of the **same Worker** (option A of §5a). No Access app is required; this keeps the studio free.
- Defaults I use unless Nils objects: scheduling granularity 15 minutes; story feeds carry an excerpt plus link, blog and reviews carry full text; translations show a "show original" link; photos start clean (no EXIF display).

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
| `/c/:collection` | Generic page for any future interest collection |
| `/reviews` | Movies, anime, books, light novels, games; filter by medium, rating, tag |
| `/reviews/:slug` | Review with cover, rating, verdict, spoiler blocks |
| `/guestbook` | Revamped guestbook (Turnstile stays, automatic moderation) |
| `/tools` | Tools & downloads: online tools and local apps/games, filter by kind and platform |
| `/tools/:slug` | Tool page: description, screenshots, "Open" (online) or "Download" (GitHub Release), version, size, SHA-256, changelog |
| `/about` | Who Nils is, quirks, "currently into", tools (FL Studio, photo mode, …), links |
| `/admin/*` | Admin UI, **Cloudflare Access only** (Nils' account) |
| `/feed.xml` and per-section feeds | RSS 2.0 and Atom for everything, writing, stories (per series), reviews and music, per language (§8, "Feeds") |
| `/downloads/…` | Pre-built EPUB and PDF files for published stories (§8, "Export") |

Global nav (mobile: bottom tab bar): Home · Music · Photos · Writing · ⋯ (Tools, Research, Reviews, Guestbook, About, other collections). A DE/EN switch sits in the header and footer. Footer: GitHub (github.com/NwebNotFound), X profile, Discord, RSS, mc.nwebnotfound.dev.

## 4. Content model
Principle: **text content as Markdown in the repo** (versioned, reviewable in PRs, free), **dynamic/user data in D1**, **media files** on Nils' own PC behind a tunnel (§5a), with small thumbnails on Cloudflare so pages never look empty when the PC is off. R2 and Stream are not used unless Nils changes his mind.

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
media(id, kind /*image|audio*/, path_or_url, provider /*home|cf-assets*/, width, height, duration_s, blurhash, thumb_path, alt, created_at)  -- shared media library
photos(id, media_id, category /*real|virtual*/, album, game?, path, width, height, blurhash, caption, exif_json, taken_at, sort, status)
tools(id, slug, title, kind /*online|local*/, platform /*web|windows|linux|macos|android*/, summary, description_md, repo /*owner/name*/, online_url, icon_media_id, status, sort)
tool_releases(tool_id, tag, name, published_at, asset_name, asset_url, size_bytes, sha256, prerelease)  -- cache of GitHub Releases, refreshed by cron
collections(slug, title, icon, color_token, description, sort, template /*grid|list|timeline*/)
items(id, collection_slug, title, slug, media_id?, body_md?, meta_json, published_at, status)  -- generic entries for new interests
tags(slug, label) ; item_tags(target_type, target_id, tag_slug)  -- shared tags across all sections
albums(slug, category, title, description, cover_photo_id, sort)
guestbook  -- existing table, add: sticker, color, mood, reply (Nils' reply), pinned,
              status /*pending|approved|hidden*/, mod_verdict, mod_reason, orig_lang, body_de, body_en
reactions(target_type, target_id, emoji, count)   -- anonymous hearts/sparkles, rate-limited
todos(user_id, id, text, done, created_at)       -- study mode, Discord login
```
Music and photos live in D1 (not Markdown) because Nils uploads them via the admin UI. Text that needs both languages stores them side by side (`*_de`, `*_en`, `orig_lang`, `auto_translated`), see §8.

### 4.3 Collections & cross-linking
- Every section (music, photos, writing, reviews) is a built-in collection; new interests are added as rows in `collections` and use the generic `items` table + templates.
- Shared tags work across everything (`/tags/:tag` shows photos, tracks, posts, reviews together).
- **Embeds in posts/stories** via shortcodes in Markdown, resolved at build/render time from the media library:
  `{{photo id=123}}`, `{{gallery album=tokyo-2026}}`, `{{track slug=sunny-loop}}` (inline mini player), `{{review slug=frieren}}` (card).
- Admin gets a **media picker** that inserts these shortcodes; posts list their linked items, and linked items show "featured in" back-links.

## 5. Admin / editing flow (Nils only)
- `/admin` protected by **Cloudflare Access** (free, email/GitHub login) + Worker checks the `Cf-Access-Jwt-Assertion` header. No public sign-up, no passwords in the repo.
- **Music:** upload WAV/MP3 export from FL Studio → set title, cover, BPM, loop points (drag on waveform preview), playlist → publish.
- **Photos:** drag in images → album, caption, optional EXIF keep/strip (strip GPS always).
- **Media library:** one shared view of all images and audio with copy-shortcode button.
- **Collections:** add a new interest category (title, icon, colour, template) without code.
- **Guestbook:** review what the automatic moderation held back or hid, override its verdict, pin, reply.
- **Writing & reviews:** edited as Markdown in the repo (VS Code / GitHub web editor / Hermes), merged via PR → auto deploy. Optional later: a simple admin Markdown editor that opens a PR via GitHub API.
- Review helper: enter a title → admin fetches cover + metadata from TMDB (movies/series), AniList GraphQL (anime/manga/LN), Open Library (books). API keys (TMDB) as Worker secrets only.

## 5a. Creator studio – `create.nwebnotfound.dev`
A private studio where Nils uploads pictures, stories and music and writes blog posts. Published items show up on the public hub at `nwebnotfound.dev`.

**Hosting options**
- **A (recommended): same Worker.** The `create.` hostname is added as a custom domain to the existing Worker, which routes by `Host`. One deploy, one shared D1, and no CORS.
- **B: sibling Worker** (`nweb-studio`) bound to the **same D1 database**. Keeps studio code and bundle separate, with a separate deploy. The public Worker only reads.

**Access protection (free tier)**
- A Cloudflare Access self-hosted app on `create.nwebnotfound.dev/*` with a policy allowing only Nils' email (One-time PIN or GitHub login). Free for up to 50 users.
- The Worker also verifies the `Cf-Access-Jwt-Assertion` JWT (team domain + AUD) on every studio request and API write, and returns 403 otherwise (defense in depth). The public host never exposes write endpoints.
- Existing `/admin` (section 5) moves into the studio.

**Upload flows**
- **Pictures:** drag & drop (multi) → client-side resize to AVIF/WebP in 480/1080/2048 + blurhash, GPS always stripped → pick album, real-life or game, caption, tags → full sizes go to the home storage origin, the 480 px thumbnail and blurhash are stored on Cloudflare → saved as a `media` row.
- **Music:** WAV/MP3 from FL Studio → client-side encode/check size (192 kbps MP3/Opus) → title, cover, BPM, key, loop points on a waveform, playlist.
- **Stories / blog posts:** Markdown editor (split view with live preview in the summer theme), front-matter form (title, slug, tags, cover, collection), **media picker** (search the library and insert shortcodes such as `{{photo id}}`, `{{gallery album}}`, `{{track id}}`, `{{review id}}`), and paste/drag an image to upload it and embed it inline. Autosave of drafts to D1.
- **Reviews:** title search via TMDB/AniList/Open Library → cover + metadata prefilled.

**Drafts, scheduling, publish**
- `status`: `draft` → `scheduled` (`publish_at`) → `published` → `archived`. Only `published` (and `publish_at <= now`) items are visible on the public hub.
- A Cron Trigger (free) runs every 15 min and flips due scheduled items. The public site also filters by `publish_at` so nothing leaks early.
- Preview link: open the draft rendered in the public theme, inside the studio (Access-protected).
- Revision history: the last N versions per post in D1, with restore.

**Storage (decided: own PC, no R2, no Stream)**
| Layer | Where | Notes |
|---|---|---|
| Metadata, Markdown, drafts, thumbnails | D1 (free tier) | Always on. Thumbnails (480 px AVIF/WebP, roughly 20–60 KB) and blurhash are stored here or as static assets so every page renders when the PC is off |
| Full-size photos, longer audio, other uploads | **Nils' PC** (later maybe a mini-PC), served from a media hostname such as `media.nwebnotfound.dev` through a **Cloudflare Tunnel**, nothing exposed on the home IP, no port forwarding | The studio Worker pushes uploads to a small upload receiver on the PC, authenticated with a shared secret (same pattern as `ai-panel/origin-proxy`). Reads are public and read-only |
| R2 / Stream | not used | Would need a payment method on the account; revisit only if Nils asks |

**Consequences of the home origin (accepted by Nils, listed so nobody is surprised)**
- If the PC is off, full-size images and anything served from the origin are unavailable; thumbnails still show. The studio shows "storage offline" and blocks new uploads instead of failing halfway.
- Cloudflare's free-plan terms discourage serving large amounts of media traffic through its network without its media products. A personal site with a few photos and tracks is far from that, but it is why no video is hosted. If traffic ever grows, move the media origin to a small VPS or R2.
- Public availability of the music showcase is a design choice, see open question 20.
- No originals are overwritten: the origin stores new files under content hashes, so a bad upload never replaces a good one.

The studio uses a storage interface (`putMedia/getMedia`) with a `home` backend first, so moving to a VPS, R2 or repo commits later is a config change.

**DNS note**
- `create.nwebnotfound.dev` gets added as a Worker **custom domain** (Cloudflare creates the proxied DNS record + certificate automatically). Nothing points to the home IP and there is no port forwarding.
- Access app must exist **before** the custom domain goes live. No DNS changes are made as part of this plan PR.

## 6. Hosting
- **Cloudflare (free tier):** Worker + static assets for HTML/CSS/JS, illustrations and thumbnails; D1 for metadata, guestbook, reactions, todos, tool-release cache. Static asset limit is 25 MiB per file, 20,000 files.
- **Nils' PC via Tunnel:** full-size photos and other uploads (§5a). Not a requirement for the site to load, only for full-size media.
- **Images:** pre-generate AVIF/WebP in 3 sizes (480/1080/2048) + blurhash **at upload time** in the browser or with a script (sharp), since Cloudflare Images/transformations aren't free. Lazy-load, `srcset`.
- **Audio streaming:** HTTP range requests; no transcoding on the server. Where tracks are served from is open question 20.
- **Video:** none. The hub does not host or embed video.
- **Downloads:** GitHub Releases (free, versioned, outside Cloudflare traffic). The Worker only links to them and caches release metadata.
- **AI features:** Workers AI on the free allocation for guestbook moderation and translation (§8). Check current model availability and free-tier limits before building; fall back to "held for review" if the allocation is used up.
- **R2:** not used. Needs billing on the account; only if Nils asks.
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

**Fonts** (self-hosted, free, all open-licence; check each licence when adding): headings and short labels in a **pixel font** such as **"Pixelify Sans"** or **"DotGothic16"** (Japanese flavour), body text in a rounded sans (**"Nunito"** or **"Inter"**), **story reader mode in a serif ("Literata")** because long chapters must stay comfortable to read. The Minecraft area keeps Monocraft, so the hub deliberately uses a different pixel font and the two do not look identical.

**Shape & detail:** big radii (20–28px), soft shadows, sticker-like badges with white outlines, hand-drawn underline squiggles, little kaomoji in empty states (`(◕‿◕)`).

**Pixel-art anime blend (decided).** Think a cozy visual-novel / 16-bit RPG UI sitting under a Shinkai sky:
- Soft gradient skies with **dithered** pixel clouds and a pixel sun; sunflowers, furin and a train crossing as small sprite scenes.
- A **pixel mascot** (Nils draws it; 32×32 or 64×64 sprites are small enough to draw by hand) with a few frames per section: idle, headphones, camera, pen, wave. Sprites render with `image-rendering: pixelated` at whole-number scales.
- UI chrome in stepped 2 px "pixel" borders and corner notches instead of smooth shadows; buttons press down one pixel; focus rings stay clearly visible.
- **Dialogue-box cards** (visual-novel textbox with a name tag) for the guestbook, pull quotes in stories and review verdicts; a blinking "▼" continue marker.
- Tiny pixel icons for sections, ratings as pixel hearts or sunflowers, pixel sparkle on reactions.
- Hero and covers stay smooth illustration; the pixel language is the interface and the mascot, not every image.
- Accessibility rules from DESIGN.md still win: AA contrast, `prefers-reduced-motion` turns off animation, and body text is never set in the pixel font.

**Motion** (CSS first, respects `prefers-reduced-motion`): drifting clouds parallax in hero, sun glint on hover, cards bounce in softly (spring easing), wind-chime sway on nav icon, sparkle burst on reactions, vinyl/cassette spin while playing, page transitions via View Transitions API. 60fps, no layout shift.

**Illustration ideas:** a chibi mascot (Nils' own design) that appears per section – DJ with headphones on Music, camera on Photos, pen on Writing, popcorn on Reviews, waving on Guestbook. **Decided: Nils draws it himself.** The layout reserves a mascot slot per section; SVG placeholder shapes fill it until the drawing exists.

**Section flavours:** Music = cassette/walkman player on a windowsill; Photos = polaroids on a string / film strip (Cyberpunk album gets a neon-at-dusk variant); Writing = notebook paper; Reviews = ticket stubs & manga-style rating stars; Guestbook = summer festival wall of ema plaques / postcards.

## 8. Section details
### Music (rebrand of PR #49)
- Persistent mini player across pages (no reload thanks to client-side nav or View Transitions), queue, shuffle, repeat, **gapless/perfect loop** via Web Audio API using stored loop points.
- Playlists as "stations" (e.g. *Sunny Mornings*, *Late Night Beats*, *Focus*). Only Nils' tracks by default; the vetted free tracks from PR #49 stay an optional fallback station.
- Study mode: ambient mixer (rain, café, wind, typewriter – CC0 Freesound list in PR #49), Pomodoro, to-dos (Discord login). Website = single-player.
- **Portfolio angle:** his own FL Studio lofi loops & beats as a showcase – per track BPM/key, "made in FL Studio", optional loop/stem previews and short process notes/screenshots, "beat tape" releases. Linked from About as part of his portfolio.
- Media Session API for lock-screen controls on mobile.
- Availability of the audio files when the PC is off: open question 20.

### Photography
- Two categories with own albums: **Real life** (his own camera/phone photos) and **Virtual photography** (Cyberpunk 2077 photo mode and other games). Same lightbox; virtual shots get a neon-dusk frame variant.
- Masonry/justified grid, albums, lightbox with swipe, pinch-zoom, keyboard nav, optional EXIF panel (camera, lens; for photo mode: game, location/district). GPS stripped.

### Writing
- Posts and stories can embed or link photos, galleries, tracks and reviews (shortcodes, §4.3).
- **Stories are a first-class section, not a side feature.** A serial story is published as a series with chapters, a series page (cover, blurb, status ongoing/complete, chapter list), previous/next navigation, reading progress and a comfortable reader mode (font size, light/night). Blog posts are the shorter, dated form.
- Chapters are Markdown files (`content/writing/<series>/<nn>-<slug>.md`), so a whole story is versioned in git. Each chapter can be written in German or English and gets the automatic translation described above.
- **Where stories come from (decided):** Nils writes **something new for the hub**. **Nothing from Harutronic or HaruReader is imported**; those projects stay separate and are never read by the site. Content is Markdown written in the studio editor or committed to the repo, and anything marked `draft` stays hidden.
- The section has no content yet, so it launches with the first chapter Nils decides to publish; an empty state ("coming soon", with the mascot) covers the time until then.

### Export (EPUB and PDF)
- Each published story, chapter and series has **"Download EPUB"** and **"Download PDF"** buttons. Research papers get a PDF (and an EPUB only if Nils wants one). Blog posts, reviews and music pages have none.
- **Built at deploy time**, not on request: a GitHub Actions step converts the Markdown (EPUB 3 with pandoc; PDF from the same content with a print stylesheet, for example via pandoc plus a PDF engine; confirm the exact tools when building) and writes the files to `/downloads/…` as static assets. Files are only rebuilt when their source or translation changed (content hash).
- EPUB: cover, title page, table of contents, language metadata, author, the content warning page, and a short rights line. PDF: readable book layout (A5-style), page numbers, same front matter.
- One file per story and one for a whole series; German and English editions are separate files, and automatically translated editions are labelled as such on the title page.
- A print stylesheet on the reader page is the fallback ("Print / Save as PDF").
- Size is no issue: a 10,000-word story is a few hundred KB at most, far below the 25 MiB asset limit.
- The rights line is Nils' choice (open question 23).

### Feeds
- RSS 2.0 and Atom feeds with proper autodiscovery (`<link rel="alternate">`) on every page: **everything** (`/feed.xml`), **blog**, **stories** (new chapters, plus one feed per series), **reviews**, and **music** (new tracks), each in German and English (`/de/…`, `/en/…`).
- Blog posts and reviews: full text in the feed by default. Story chapters: title, summary and link by default, so the reader mode and downloads stay the main experience (open question 24).
- Feeds contain only `published` items whose `publish_at` has passed. Responses are cached for a short time and carry `ETag`/`Last-Modified`.
- No tracking parameters and no third-party feed service.

### Research & publications
A section for scientific and technical work that Nils wants to put online: papers, reports, theses, lab write-ups, notes. Route `/research` with `/research/:slug` per work; it appears in the feeds as its own feed.
- **Content:** Markdown in the repo (`content/research/<slug>/index.md` plus figures and a `.bib` file) or, alternatively, a finished PDF that Nils exports himself (LaTeX, Word, Typst) with the page generated from its metadata. Both work; the page is the same.
- **Front matter:** title, authors, abstract, keywords, date, **version** (v1, v2 with a short change note), `kind` (preprint, report, thesis, notes, poster), `status` label, language, license, optional DOI, optional code/data repository link.
- **Rendering:** math with KaTeX at build time, numbered figures, tables, footnotes, a references list generated from BibTeX, "cite this" box (BibTeX and plain text), table of contents. Reading view on the page and the **PDF as the primary download**, built at deploy time like the story exports (pandoc plus a PDF engine, or Typst; confirm when building).
- **Findability:** Google Scholar-style `citation_*` meta tags, a stable permalink per version, and a DOI where wanted. A free DOI is possible through **Zenodo** (it can archive a GitHub release automatically); DOIs are permanent and records cannot simply be deleted afterwards, so publish a DOI only for things Nils is sure about.
- **Honest labelling:** every work shows its status (for example "Preprint, not peer-reviewed", "Course report", "Thesis") so a visitor never mistakes a self-published page for a journal article.
- **Languages:** scientific text is **not auto-translated by default**, because a machine translation can change technical meaning. Nils can switch translation on per work; it is then labelled and links to the original.
- **Before publishing coursework or thesis material:** check the university's rules and any co-authors' or supervisors' consent, and whether the work contains material the university or a company owns (data, templates, logos). The hub cannot decide that for him.
- **Author details:** name, affiliation and contact are shown only if Nils chooses (open question 28).

### Reviews
- Card grid with cover art, medium icon, score (e.g. 8.5/10 shown as stars or a "sunflower meter"), tags, "currently watching/reading" shelf, yearly stats.

### Guestbook revamp
- Postcards/ema wall: pick a sticker + colour, short message, Turnstile kept, rate-limit, Nils can reply & pin. Reactions on entries. Existing entries migrate unchanged (status `approved`).
- **Automatic moderation, no manual approval by default.** Pipeline on submit:
  1. Cheap rules first: length, Turnstile, rate limit, link and repeated-text limits, blocklist.
  2. A Workers AI safety classifier (for example a Llama Guard model; confirm the model name and free limits at build time) returns allow / block with a reason.
  3. `allow` → published immediately (`approved`). `block` → `hidden`, the author sees a neutral "could not be posted" message, no details. Anything unsure, or any error or quota exhaustion → `pending` (held, not published).
  4. The studio lists `pending` and `hidden` entries with the verdict and reason. Nils can approve, hide or delete; his decision always wins and is stored.
- The classifier sees only the message text, never IP or Discord ID. Verdict and reason are stored for review; no extra personal data is kept.
- Failing closed is deliberate: a moderation outage delays entries instead of publishing unchecked ones.

### Languages (German and English, automatic)
- The site is available in **German and English**. Default follows `Accept-Language`, with a visible switch and a remembered choice; each language has its own URL prefix (`/de/…`, `/en/…`) and `hreflang` links so search engines and shared links stay correct.
- **Interface text** (navigation, buttons, labels): translated once, reviewed by Nils, kept in plain message files in the repo. Not machine-translated at runtime.
- **Content** (writing, reviews, guestbook, tool descriptions): Nils writes in whichever language he likes. A translation to the other language is generated **at save/publish time**, stored next to the original, and shown with a small "automatically translated" label plus a link to the original. Nothing is translated per page view.
- Translation uses Workers AI (for example an m2m100-style model; confirm availability at build time). Nils can edit any translation in the studio; an edited translation is no longer overwritten and loses the label.
- Names, tags, track titles, tool names and code stay untranslated.

### Tools & downloads
- A `/tools` page lists things Nils built, in two kinds:
  - **Online tools** run entirely **in the visitor's browser** (static HTML/JS). They are served from Cloudflare, do not need Nils' PC, and never send visitor input to a server of his.
  - **Local tools** (apps, games, scripts) are **downloaded from GitHub Releases** of the tool's repo. The Worker reads the releases through the GitHub API on a schedule, caches version, date, file name, size and SHA-256 in `tool_releases`, and links straight to the release asset. Downloads therefore do not go through Cloudflare or Nils' PC.
- Each tool page shows platform, version, size, SHA-256 and a short install note. Unsigned Windows programs trigger SmartScreen; the page says so and shows the checksum so people can verify the file.
- Candidate tools from Nils' existing public repos, to be confirmed by him: HaruReader, TaikoFX, EdgettsForKoodoReader, streamforge-local, sulfur, SpaceFight. Private repos are never listed.
- **Decided against** a public self-hosted git server (Forgejo/Gitea) as the download source: downloads would break whenever the PC is off, and a public git server is extra attack surface. A local Forgejo remains fine for private projects or as a mirror, outside this plan.
- Adding a tool is one row (`tools`) plus a repo name; releases appear without further work.

### About & links
- Quirks list, "currently into" (pulled from latest reviews / now playing), tools, GitHub + X + Discord links, small "made with Cloudflare Workers" colophon.

## 9. Phased rollout (one PR each, all reviewed by Claude Code / Codex)

### Core: the corner (stories, music, blog, reviews)
The core needs **no home server**: text lives in the repo/D1, tracks are small static files (default for open question 20), and the site is complete without photos.
1. **Design system + summer theme tokens** (builds on PR #44): palette, fonts, base components, light/dark, reduced-motion.
2. **Shell & home:** nav/tab bar, footer links, new home with hero and mascot placeholder; `/about`; **DE/EN routing and interface message files**. Minecraft + AI panel untouched (regression check).
3. **Writing:** stories (series, chapters, reader mode) and blog posts from Markdown, translation at publish, **EPUB/PDF export and feeds**.
4. **Reviews:** cards, rating, verdict, spoiler blocks, TMDB/AniList/Open Library helper script.
5. **Music v1:** tracks, playlists, persistent player, perfect loops, tracks served from Cloudflare static assets.
6. **Guestbook revamp** with automatic moderation and translation (Workers AI, fail-closed to `pending`).
7. **Studio:** skeleton (Discord OAuth + user-ID allowlist check, no Access app, `create.` custom domain with Nils' OK at deploy time, status/publish_at columns, cron publisher), then the editor (Markdown story/post editor with preview, autosave, scheduling, revisions, translation editing, moderation queue).

### Later (nice to have, cut or reorder freely)
8. **Media library + photography** (real life and virtual photography), shortcodes/embeds in writing, tags pages.
9. **Research & publications:** `/research`, front matter and BibTeX pipeline, KaTeX, PDF build, citation meta tags, versions, feed.
10. **Tools & downloads:** `/tools`, `tool_releases` cache, cron for GitHub Releases.
11. **Studio uploads for photos and longer audio:** home storage origin behind the tunnel, thumbnails on Cloudflare (§5a).
12. **Study mode** (ambient mixer, Pomodoro, to-dos) from PR #49, single-player website only.
13. **`/motion` element library:** Nils' own JS/CSS elements with live preview and code, plus a machine-readable index for AI agents (JSON manifest and plain-text listing). Static and free.
14. **`/samples`:** downloadable samples and sound-design packs (zips on GitHub Releases, preview clips as small static files, licence line from section 0).

Cut: Discord Activity, motion/video showcase.

## 10. Questions

### Answered (Nils, 2026-11-03)
1. Mascot: **draws it himself.**
4. Uploads: **own PC, no R2** (billing not needed). Same for 17.
8. Site language: **German and English, both automatically translated.**
9. Guestbook: **automatic moderation** instead of manual approval.
10. Video: **dropped entirely** (no hosting, no embeds, no motion section).
17. Storage at launch: **own PC** (see 4).

### Answered (Nils, 2026-11-03, second round)
- Photos: **yes.** Discord Activity: **skip.** Video: **no.** EPUB/PDF export: **yes.** Blog as RSS feed: **yes.** Look: **pixel-art anime blend.** Hermes MCP server: **wanted** (separate plan).

- Harutronic: **not imported**; Nils writes a new story for the hub. HaruReader is no longer a source (questions 5 and 25 are closed). mc-stack is a **beta for Nils and his friends**, not a public server.

### Answered (Nils, 2026-11-03, third round)
2. Theme: **summer day default, summer night dark mode.**
6. Reviews: **5 stars.**
15. Studio: **same Worker.**
16. Studio login: **Discord** (existing Worker OAuth + allowlist, see section 0).
19. **One `writing` type** with `kind` story or blog.
20. Music: **always playable** via small static MP3/Opus files; **no paid Cloudflare plan.**
23. Rights line: **"(c) Nils, personal reading only."**
Also decided: Discord Activity and video stay cut; `/motion` becomes the element library; `/samples` for downloadable samples and sound design (section 0).

### Still open
3. Music: only your tracks, or keep the free lofi station from PR #49 as filler until you have enough?
7. Which X handle should be linked?
11. Which other interests should get their own collection at launch (gaming, cosplay, cooking, …)?
12. Real-life photos: which albums/categories to start with?
13. Music portfolio: show stems/process notes, or just finished tracks?
14. Photos: show EXIF/game metadata, or keep it clean?
15. Studio: same Worker (simpler) or a sibling Worker sharing D1?
16. Access login: email one-time PIN or GitHub?
18. Scheduling: is a 15-minute granularity fine?
19. Should stories and blog posts be separate types or one "writing" type with tags?
20. Music availability: should your tracks always be playable, even when your PC is off (small MP3/Opus files committed as Cloudflare static assets, a few MB each), or is it fine that they only play while the PC is on? Recommendation: always-on for tracks, PC origin for photos.
21. Tools page: which of the candidate repos should be listed at launch, and should any of them also get an online (browser) version?
23. Rights line for the EPUB/PDF downloads: "© Nils, all rights reserved, personal reading only", a Creative Commons licence, or something else?
24. Feeds: full text or only an excerpt for story chapters? (Default: excerpt + link for stories, full text for blog and reviews.)
26. Research: which kinds of work do you want to publish first (course reports, a thesis, your own experiments), and should they be English, German or both?
27. DOIs: OK to use Zenodo (free, permanent) for the works you choose, or no DOIs at all for now?
28. Research author details: name only, or also affiliation (for example your university) and a contact address?
22. Translations: should the original language always stay visible next to the translation, or only via a "show original" link?
