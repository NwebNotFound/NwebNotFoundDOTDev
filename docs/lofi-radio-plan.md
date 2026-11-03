# Lofi Radio / Study Activity – Plan

Status: **plan only.** No code, no deploy, no secrets. Replaces the cinema plan (closed PRs NwebNotFound#48, mc-stack#119).

## 1. Concept

A lofi/study radio for the Discord community with several genre **stations**, played in sync for everyone listening together:

| Station | Content |
|---|---|
| `lofi` | lofi hip-hop / study beats |
| `chill` | chillhop, jazzy, downtempo |
| `ambient` | ambient / drone / piano, no beats |
| `game` | game-music style (chiptune, orchestral "adventure", Minecraft-*inspired*, Riot creator-safe if cleared) |
| `focus` | no music, ambient layers only |

On top of the music: an animated **scene** (like *Spirit City: Lofi Sessions*) with mixable ambient sounds, a **Pomodoro timer** and personal **to-do lists**.

## 2. Surfaces

### 2.1 Primary: Discord Activity (multiplayer)
- Real Discord Activity built with the **Discord Embedded App SDK** (`@discord/embedded-app-sdk`), runs as an iframe inside a voice channel.
- Auth: `discordSdk.commands.authorize` → code exchanged in our Worker for a token → user identity (no extra login).
- **Shared per voice channel ("room")**: station, current track + position, scene/theme, Pomodoro phase and timer. Any participant can change station/scene (optional: only host / role holders, see open questions).
- **Presence**: participant list with avatars, who is in focus/break, optional "what I'm working on" line. Users who join the call see the activity and can hop in.
- **Personal per user**: ambient-layer mix and volumes, own to-do list, master volume.
- Needs its own app in the Discord Developer Portal (Activities enabled, URL mapping to our Worker). Requires Nils' Discord login in the 1:1 chat.

### 2.2 Fallback: bot in voice channel
- If the Activity is blocked/too much work: existing bot joins a VC and plays the selected station (`@discordjs/voice`), `/radio <station>`, `/radio stop`. Runs on PC-Nils in the mc-stack Docker stack. No scene/timer UI, music only.

### 2.3 Website (single-player)
- `radio.nwebnotfound.dev` (or `nwebnotfound.dev/radio`), **same code base** as the Activity, Activity-SDK calls behind an adapter (`platform = discord | web`).
- Single-player only: no rooms, no presence. Stations are still "live" (track/position computed from a shared server clock) so it feels like a radio.
- Optional Discord OAuth login on the site to load the same to-do list; works without login (localStorage).

## 3. Scene & ambient mixer
- Animated background per theme (CSS/canvas layers, parallax, day/night by local time, subtle rain on window etc.). Respect `prefers-reduced-motion`.
- Ambient layers, each with its own volume slider + mute: rain, thunder, wind, fire/fireplace, café chatter, typewriter, keyboard, birds, waves, city night, (Minecraft scenario: see 4).
- Web Audio API: one `GainNode` per layer, seamless loops (crossfaded OGG/Opus), presets ("Rainy café", "Night study").
- Mix is personal; not synced (everyone decides their own rain level).

## 4. Scenarios / themes
A scenario = background art + default station + default ambient preset + optional SFX.
- **Rainy city** (default), **Cozy cabin**, **Café**, **Space station**.
- **Blocky / Minecraft scenario**: voxel-style pixel background (own art), Minecraft-*style* SFX (own recordings or CC0: footsteps on gravel, cave drips, door creak, fire crackle, distant "mob" ambience) and the `game` station with CC-licensed "inspired by" tracks.
  - **No original Minecraft music (C418 / Lena Raine) and no ripped game sounds** – see §8.4.
  - Name it e.g. "Blocky Night" with secondary description "inspired by Minecraft"; footer disclaimer: *"NOT AN OFFICIAL MINECRAFT PRODUCT. NOT APPROVED BY OR ASSOCIATED WITH MOJANG OR MICROSOFT."*

## 5. Pomodoro & to-dos
- Pomodoro: 25/5 default, long break after 4, configurable. In the Activity the timer is **shared per room** (server-authoritative start timestamp in the Durable Object, clients render). Chime + optional soft "break" ambience.
- To-do lists tied to the **Discord user ID**, stored in D1. CRUD via Worker API, auth via session from Activity/OAuth. Optional: mark a task as "current focus" (shown in presence).
- Stats (optional later): focus minutes per day, streaks.

## 6. Architecture (Cloudflare Free)
- **Worker** (same project/site or separate `radio` Worker): static assets (app bundle, art, audio) + API.
- **D1**: `users(discord_id, name, avatar, created_at)`, `todos(id, discord_id, text, done, position, updated_at)`, `pomodoro_stats(discord_id, day, focus_minutes)`, `stations(id, name, playlist_json)`, `tracks(id, station, title, artist, source, license, attribution, url, duration_ms)`. All queries prepared/bound.
- **Durable Object per room** (key = Discord `instanceId`/channel ID), SQLite-backed (Free tier class), WebSocket Hibernation: holds station, track index + start time, scene, Pomodoro state, participants. Clients sync to server time (`Date.now()` offset via ping).
- **Radio sync**: no live encoding. Each station is a deterministic playlist; position = `(now - epoch) mod total_duration`. Clients fetch the track file and seek. This works for Activity and website and costs nothing extra.
- **Audio storage**: OGG/Opus ~96–128 kbps (≈1 MB per minute at 128 kbps; ~3–4 h per station ≈ 200 MB each). Options:
  1. **Workers static assets** (free, max 25 MiB per file, 20k files) – default; split long tracks if needed.
  2. **R2** (10 GB free, but needs a payment method on the account) – **only with Nils' explicit OK**.
  3. Self-hosted from PC-Nils via cloudflared – fallback, only when PC is on.
- Bandwidth: ~128 kbps per listener, 15 friends ≈ 2 Mbps; Workers static asset egress is free.
- **Security**: CSP enforcing (Activity requires Discord's proxy domains, `/.proxy/` paths), rate limits on API, input length limits on to-dos, output escaping (no XSS), secrets (`DISCORD_CLIENT_SECRET`) only via `wrangler secret`, never in the repo.

## 7. Design
Must follow the existing **`DESIGN.md` premium standard** (from the design-system PR #44): `--ds-*` tokens, one accent, mobile-first, glassy panels over the scene, focus-visible states, empty/error/loading states, reduced motion. Activity layout must work in Discord's small PIP/mobile frame.

## 8. Music & sound licensing

Rule: **only tracks whose license explicitly allows playing them in our own app/website.** Licenses saying "only on YouTube/Twitch/TikTok" do **not** cover us. Every track gets `source`, `license`, `attribution` in D1 and an on-screen "now playing + credit".

### 8.1 Music
| Source | Link | License | OK for our stream? | Attribution |
|---|---|---|---|---|
| Free Music Archive (filter CC-BY / CC0) | https://freemusicarchive.org/ | per track CC (BY, BY-SA, BY-NC, CC0) | **Yes** for CC0/CC-BY(-SA); BY-NC ok as long as we stay non-commercial | Yes for BY: artist, title, license link |
| Incompetech / Kevin MacLeod | https://incompetech.com/music/royalty-free/licenses/ | CC-BY 4.0 | **Yes** | Yes, required |
| Chosic (lofi collection) | https://www.chosic.com/free-music/lofi/ | per track, mostly CC-BY / CC-BY-SA | **Yes** (check each track) | Yes, as given per track |
| Pixabay Music | https://pixabay.com/music/ | Pixabay Content License | **Unclear** – allowed in projects, but not distributing tracks "standalone"; a pure music radio is close to that. Use only mixed with scene/ambient, or skip | Not required |
| StreamBeats (Harris Heller) | https://www.streambeats.com/ | StreamBeats license (free for creators) | **Unclear** – built for streams/videos; check whether own app/radio counts; ask | Not required (appreciated) |
| Riot Games creator-safe | https://www.riotgames.com/en/riot-music-creator-safe-guidelines | Legal Jibber Jabber + creator-safe guidelines | **Unclear/likely no** – for player content on streaming platforms; "re-distributing the music itself" is forbidden; a radio is that | "created under Riot Games' Legal Jibber Jabber…" |
| Lofi Girl | https://www.lofigirl.com/terms | Lofi Girl T&C | **No** without license – only YouTube, TikTok, Twitch, Instagram; own site needs the commercial license form | "Track provided by Lofi Girl" |
| NCS | https://ncs.io/usage-policy | NCS usage policy | **No** – online video platforms only, no standalone/radio use without license | Yes |
| Pretzel | https://www.pretzel.rocks/ | Pretzel terms | **No** – streamer app for Twitch/YouTube | – |
| YouTube Audio Library | https://support.google.com/youtube/answer/3376882 | YouTube terms | **No** in general (YouTube only); single tracks marked CC-BY are ok | for CC-BY tracks |
| Epidemic Sound | https://www.epidemicsound.com/ | paid subscription | **No** (costs) | – |

### 8.2 Ambient loops / SFX
| Source | Link | License | OK? | Attribution |
|---|---|---|---|---|
| Freesound (filter CC0 / CC-BY) | https://freesound.org/help/faq/ | CC0, CC-BY (avoid NC unless non-commercial) | **Yes** | CC-BY: author + link |
| Mixkit SFX | https://mixkit.co/license/ | Mixkit Sound Effects Free License | **Yes** (inside our app, not as a sound pack) | No |
| Sonniss GDC bundles | https://sonniss.com/gameaudiogdc | royalty-free, commercial ok, no resale of raw files | **Yes** | No |
| Pixabay sound effects | https://pixabay.com/sound-effects/ | Pixabay Content License | **Yes** (used inside the app) | No |
| OpenGameArt (CC0/CC-BY game sounds & music) | https://opengameart.org/ | per asset CC0/CC-BY/GPL | **Yes** (CC0/CC-BY) | as per asset |
| BBC Sound Effects | https://sound-effects.bbcrewind.co.uk/licensing | RemArc: personal, educational, research only | **No** (public site/app) | – |

### 8.3 Licensing hygiene
- Keep a `docs/radio-credits.md` / D1 table with source URL + license per file; download the license page snapshot.
- Prefer CC0/CC-BY; avoid ND/remix issues (we don't edit, only crossfade).
- If a rights holder complains: remove the track immediately.

### 8.4 Minecraft music & sounds – verdict
- Minecraft **assets** (incl. "sounds and other audio") belong to Mojang/Microsoft (C418's soundtrack is additionally owned by C418/his publisher). Mojang's Usage Guidelines (https://www.minecraft.net/en-us/usage-guidelines) treat *sharing anything* as "commercial use" even if free, forbid redistributing game files, and require permission from the audio owners for any music used. There is no permission to put the soundtrack or game SFX into our own radio/app.
- **Verdict: no original Minecraft music (C418, Lena Raine, Aaron Cherof …) and no extracted game sounds.** Not "in budget" either – there's no free license; only a formal deal with Mojang/the composers.
- **Legal alternative:** CC-licensed "Minecraft-inspired" piano/ambient tracks (FMA, OpenGameArt, Chosic, Incompetech-style), own-composed tracks, and own/CC0 recordings of similar sounds. Voxel art is our own. Use the name "Minecraft" only descriptively + disclaimer.

## 9. Milestones (follow-up PRs)
1. R1 – Static website prototype: one station, scene, ambient mixer (local files), Pomodoro, localStorage to-dos.
2. R2 – Station clock + playlists in D1, credits view.
3. R3 – Discord OAuth on site + D1 to-dos.
4. R4 – Discord Developer Portal app + Activity shell (SDK auth, URL mappings).
5. R5 – Durable Object rooms: synced station/scene/Pomodoro + presence.
6. R6 – Scenarios incl. "Blocky Night".
7. R7 (optional) – VC bot fallback in mc-stack.

## 10. Open questions for Nils
1. Subdomain `radio.nwebnotfound.dev` or page on the main site?
2. Who may change the station/scene in a room: everyone, host only, or a Discord role?
3. Activity only for members of our Discord server, or anyone who adds it?
4. Audio storage: Workers static assets (free, default) OK, or do you want R2 (needs a payment method, only with your OK)?
5. Ask Lofi Girl / StreamBeats for permission, or stick to CC music only?
6. Shared Pomodoro: one timer per room only, or allow a personal timer too?
7. Which scenarios first (rainy city, café, blocky night …)?
8. Keep the VC bot fallback in scope or drop it?
