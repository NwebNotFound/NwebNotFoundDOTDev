// "Mein Profil" v3 (mockups/nwebos/apps/profile-v3/notes.md): settings, game stats and badges per Discord account.
// Tables from migrations/0018_profile_v3.sql (additive). Every handler acts only for the session owner; writes are
// same-origin POSTs from nwebnotfound.dev. Each write touches at most a couple of rows (D1 free tier, #126).

/** Badge set 1 (ids are stored; labels and art live in src/nwebos-apps.js). */
export const BADGES = ["gruss", "leseratte", "fuenf5", "minen", "pixel", "ohrwurm", "nacht"];
const GAMES = { mines: ["9x9"], five: ["de", "en"] };
const THEMES = ["day", "night", "auto"];

const int = (v, lo, hi) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n >= lo && n <= hi ? n : null; };
const bool01 = (v) => (v === true || v === 1 ? 1 : v === false || v === 0 ? 0 : null);

/** The client's prefs body → a clean row (unknown/invalid fields become null = "not set"). */
export function cleanPrefs(b) {
  if (!b || typeof b !== "object") return null;
  return {
    lang: b.lang === "de" || b.lang === "en" ? b.lang : null,
    theme: THEMES.includes(b.theme) ? b.theme : null,
    sound: bool01(b.sound), boot: bool01(b.boot), reduced_motion: bool01(b.reduced_motion),
  };
}

/** One finished game → the new stats row (pure; `row` = current row or null). Returns { row, award: [badge…] }. */
export function applyRun(row, run) {
  const r = row ? { ...row } : { played: 0, won: 0, best: null, streak: 0, best_streak: 0, dist: null };
  r.played += 1;
  const award = [];
  if (run.won) {
    r.won += 1;
    if (run.game === "mines" && run.time_s != null) r.best = r.best == null ? run.time_s : Math.min(r.best, run.time_s);
    if (run.game === "five") {
      r.streak += 1; r.best_streak = Math.max(r.best_streak, r.streak);
      const d = Array.isArray(r.dist) ? r.dist.slice(0, 6) : [0, 0, 0, 0, 0, 0];
      while (d.length < 6) d.push(0);
      if (run.guesses) d[run.guesses - 1] += 1;
      r.dist = d;
      if (r.streak >= 5) award.push("fuenf5");
    }
    if (run.game === "mines") award.push("minen");
  } else if (run.game === "five") r.streak = 0;
  return { row: r, award };
}

/** The body of POST /api/profile/games/run → a clean run or null. */
export function cleanRun(b) {
  if (!b || typeof b !== "object" || !GAMES[b.game]) return null;
  const variant = GAMES[b.game].includes(b.variant) ? b.variant : null;
  if (!variant) return null;
  const won = b.won === true;
  return { game: b.game, variant, won, time_s: b.game === "mines" && won ? int(b.time_s, 1, 86400) : null, guesses: b.game === "five" && won ? int(b.guesses, 1, 6) : null };
}

/** Local stats (ctx.store "stats" of each game, before sign-in) merged into a row: played/won add up, best and
 *  best_streak take the better value (pure). */
export function mergeLocal(row, local, game) {
  const r = row ? { ...row } : { played: 0, won: 0, best: null, streak: 0, best_streak: 0, dist: null };
  const played = int(local?.played, 0, 1e6) || 0, won = Math.min(played, int(local?.won, 0, 1e6) || 0);
  r.played += played; r.won += won;
  if (game === "mines") { const b = int(local?.best, 1, 86400); if (b != null) r.best = r.best == null ? b : Math.min(r.best, b); }
  if (game === "five") {
    r.best_streak = Math.max(r.best_streak, int(local?.best, 0, 1e6) || 0, int(local?.streak, 0, 1e6) || 0);
    if (Array.isArray(local?.dist)) { const d = Array.isArray(r.dist) ? r.dist.slice(0, 6) : [0, 0, 0, 0, 0, 0]; while (d.length < 6) d.push(0); local.dist.slice(0, 6).forEach((n, i) => { d[i] += int(n, 0, 1e6) || 0; }); r.dist = d; }
  }
  return r;
}

/** Is it night in Berlin (22:00–06:00)? For the secret badge. */
export function berlinNight(now = Date.now()) {
  const h = Number(new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "numeric", hourCycle: "h23" }).format(new Date(now)));
  return h >= 22 || h < 6;
}

export function makeProfile({ json, getUser, MAIN }) {
  const own = async (req, env, method = "POST") => {
    if (req.method !== method) return { err: json({ error: "Method not allowed" }, 405) };
    if (method !== "GET" && req.headers.get("origin") !== `https://${MAIN}`) return { err: json({ error: "forbidden" }, 403) };
    const u = await getUser(req, env).catch(() => null);
    if (!u) return { err: json({ error: "unauthorized" }, 401) };
    return { u, id: String(u.id) };
  };
  const rowOf = (r) => r && { played: r.played, won: r.won, best: r.best, streak: r.streak, best_streak: r.best_streak, dist: r.dist ? (() => { try { return JSON.parse(r.dist); } catch { return null; } })() : null };
  const put = (env, id, game, variant, r, now) => env.DB.prepare(`INSERT INTO game_stats (discord_id, game, variant, played, won, best, streak, best_streak, dist, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(discord_id, game, variant) DO UPDATE SET played=excluded.played, won=excluded.won, best=excluded.best, streak=excluded.streak, best_streak=excluded.best_streak, dist=excluded.dist, updated_at=excluded.updated_at`)
    .bind(id, game, variant, r.played, r.won, r.best, r.streak, r.best_streak, r.dist ? JSON.stringify(r.dist) : null, now);
  const awardSt = (env, id, badge, now) => env.DB.prepare("INSERT OR IGNORE INTO user_badges (discord_id, badge, earned_at) VALUES (?, ?, ?)").bind(id, badge, now);

  return {
    /** Award a badge from another handler (guestbook POST, reading 100 %); never throws. */
    async award(env, discordId, badge) {
      if (!BADGES.includes(badge)) return;
      await awardSt(env, String(discordId), badge, Date.now()).run().catch(() => {});
    },

    /** Everything the profile window and /api/profile need (signed in). */
    async data(env, u) {
      const id = String(u.id);
      const [prefs, games, badges, sess] = await Promise.all([
        env.DB.prepare("SELECT lang, theme, sound, boot, reduced_motion, updated_at FROM user_prefs WHERE discord_id = ?").bind(id).first().catch(() => null),
        env.DB.prepare("SELECT game, variant, played, won, best, streak, best_streak, dist, updated_at FROM game_stats WHERE discord_id = ?").bind(id).all().then((x) => x.results || []).catch(() => []),
        env.DB.prepare("SELECT badge, earned_at FROM user_badges WHERE discord_id = ? ORDER BY earned_at").bind(id).all().then((x) => x.results || []).catch(() => []),
        u.sid ? env.DB.prepare("SELECT created_at, expires_at FROM sessions WHERE id = ?").bind(u.sid).first().catch(() => null) : null,
      ]);
      const g = {}; for (const r of games) g[r.game + ":" + r.variant] = rowOf(r);
      return { prefs, games: g, badges, session: sess || null };
    },

    async prefs(req, env) {
      const o = await own(req, env); if (o.err) return o.err;
      const p = cleanPrefs(await req.json().catch(() => null));
      if (!p) return json({ error: "invalid json" }, 400);
      await env.DB.prepare(`INSERT INTO user_prefs (discord_id, lang, theme, sound, boot, reduced_motion, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(discord_id) DO UPDATE SET lang=COALESCE(excluded.lang, lang), theme=COALESCE(excluded.theme, theme), sound=COALESCE(excluded.sound, sound), boot=COALESCE(excluded.boot, boot), reduced_motion=COALESCE(excluded.reduced_motion, reduced_motion), updated_at=excluded.updated_at
        WHERE lang IS NOT COALESCE(excluded.lang, lang) OR theme IS NOT COALESCE(excluded.theme, theme) OR sound IS NOT COALESCE(excluded.sound, sound) OR boot IS NOT COALESCE(excluded.boot, boot) OR reduced_motion IS NOT COALESCE(excluded.reduced_motion, reduced_motion)`)
        .bind(o.id, p.lang, p.theme, p.sound, p.boot, p.reduced_motion, Date.now()).run();
      return json({ ok: true, prefs: await env.DB.prepare("SELECT lang, theme, sound, boot, reduced_motion FROM user_prefs WHERE discord_id = ?").bind(o.id).first() });
    },

    async run(req, env) {
      const o = await own(req, env); if (o.err) return o.err;
      const run = cleanRun(await req.json().catch(() => null));
      if (!run) return json({ error: "invalid run" }, 400);
      const cur = await env.DB.prepare("SELECT played, won, best, streak, best_streak, dist FROM game_stats WHERE discord_id = ? AND game = ? AND variant = ?").bind(o.id, run.game, run.variant).first();
      const { row, award } = applyRun(rowOf(cur), run), now = Date.now();
      await env.DB.batch([put(env, o.id, run.game, run.variant, row, now), ...award.map((b) => awardSt(env, o.id, b, now))]);
      return json({ ok: true, stats: row, badges: award });
    },

    async merge(req, env) {
      const o = await own(req, env); if (o.err) return o.err;
      const b = await req.json().catch(() => null);
      if (!b || typeof b !== "object" || typeof b.stats !== "object" || !b.stats) return json({ error: "invalid json" }, 400);
      const now = Date.now(), st = [], out = {};
      for (const [game, variant] of [["mines", "9x9"], ["five", GAMES.five.includes(b.variant) ? b.variant : "de"]]) {
        const local = b.stats[game]; if (!local || typeof local !== "object" || !(Number(local.played) > 0)) continue;
        const cur = await env.DB.prepare("SELECT played, won, best, streak, best_streak, dist FROM game_stats WHERE discord_id = ? AND game = ? AND variant = ?").bind(o.id, game, variant).first();
        const row = mergeLocal(rowOf(cur), local, game); out[game + ":" + variant] = row;
        st.push(put(env, o.id, game, variant, row, now));
        if (game === "mines" && row.won > 0) st.push(awardSt(env, o.id, "minen", now));
        if (game === "five" && row.best_streak >= 5) st.push(awardSt(env, o.id, "fuenf5", now));
      }
      if (st.length) await env.DB.batch(st);
      return json({ ok: true, games: out });
    },

    /** The secret badge: the client says the night theme is on; the server checks the Berlin clock. */
    async night(req, env) {
      const o = await own(req, env); if (o.err) return o.err;
      if (!berlinNight()) return json({ ok: false, error: "not night" }, 409);
      await awardSt(env, o.id, "nacht", Date.now()).run();
      return json({ ok: true, badge: "nacht" });
    },

    async exportData(req, env) {
      const o = await own(req, env, "GET"); if (o.err) return o.err;
      const q = (sql) => env.DB.prepare(sql).bind(o.id).all().then((x) => x.results || []).catch(() => []);
      const [entries, reads, reactions, prefs, games, badges, sessions, link] = await Promise.all([
        q("SELECT name, message, created_at FROM entries WHERE discord_id = ? ORDER BY id"),
        q("SELECT post_id, pct, updated_at FROM blog_reads WHERE discord_id = ?"),
        q("SELECT post_id, kind, created_at FROM blog_reactions WHERE discord_id = ?"),
        q("SELECT lang, theme, sound, boot, reduced_motion, updated_at FROM user_prefs WHERE discord_id = ?"),
        q("SELECT game, variant, played, won, best, streak, best_streak, dist, updated_at FROM game_stats WHERE discord_id = ?"),
        q("SELECT badge, earned_at FROM user_badges WHERE discord_id = ?"),
        q("SELECT created_at, expires_at FROM sessions WHERE discord_id = ?"),   // never the session id
        q("SELECT mc_name, verified, has_role, updated_at FROM mc_links WHERE discord_id = ?"),
      ]);
      const body = { exported_at: new Date().toISOString(), user: { id: o.id, name: o.u.name, username: o.u.username }, guestbook: entries, reading: reads, reactions, prefs: prefs[0] || null, games, badges, sessions, minecraft: link[0] || null };
      return new Response(JSON.stringify(body, null, 2), { headers: { "content-type": "application/json; charset=utf-8", "content-disposition": 'attachment; filename="nwebnotfound-meine-daten.json"', "cache-control": "private, no-store" } });
    },
  };
}
