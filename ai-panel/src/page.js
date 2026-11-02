export const PAGE = `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="referrer" content="no-referrer">
<title>KI</title>
<style>
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Inter","Segoe UI",Roboto,Helvetica,Arial,sans-serif;background:var(--bg);color:var(--fg);line-height:1.5;-webkit-font-smoothing:antialiased;letter-spacing:-.01em}
:root{--bg:#fbfbfd;--fg:#1d1d1f;--mut:#6e6e73;--link:#0066cc;--acc:#0071e3;--accfg:#fff;--card:#fff;--line:rgba(0,0,0,.08);--navbg:rgba(251,251,253,.8);--field:#fff;--ring:rgba(0,113,227,.18);color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--bg:#000;--fg:#f5f5f7;--mut:#a1a1a6;--link:#2997ff;--acc:#0a84ff;--card:#1c1c1e;--line:rgba(255,255,255,.12);--navbg:rgba(0,0,0,.72);--field:#1c1c1e;--ring:rgba(10,132,255,.35)}}
a{color:var(--link);text-decoration:none}
.wrap{width:min(880px,100% - 2rem);margin-inline:auto}
.nav{position:sticky;top:0;z-index:5;background:var(--navbg);backdrop-filter:saturate(180%) blur(20px);-webkit-backdrop-filter:saturate(180%) blur(20px);border-bottom:1px solid var(--line)}
.nav .wrap{display:flex;flex-wrap:wrap;align-items:center;gap:.6rem 1rem;min-height:52px;padding:.4rem 0}
.brand{font-weight:600;color:var(--fg);margin-right:auto}
.nav a.l{color:var(--mut);font-size:.9rem}
h1{font-size:clamp(2rem,8vw,3rem);letter-spacing:-.03em;line-height:1.05;margin:.2rem 0}
.eyebrow{font-size:.8rem;font-weight:600;color:var(--acc);margin:1.2rem 0 .2rem}
.lead{color:var(--mut);max-width:36ch}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 1.1rem;border:0;border-radius:980px;background:var(--acc);color:var(--accfg);font:inherit;font-size:1rem;font-weight:500;cursor:pointer}
.btn.sec{background:transparent;color:var(--link);box-shadow:inset 0 0 0 1px currentColor}
.btn[disabled]{opacity:.45;cursor:not-allowed}
.discord{background:#5865F2;color:#fff}
.card{background:var(--card);border:1px solid var(--line);border-radius:22px;padding:1rem}
.stats{display:grid;grid-template-columns:1fr 1fr;gap:.7rem;margin:1rem 0}
@media (min-width:800px){.stats{grid-template-columns:repeat(4,1fr)}}
.stat b{display:block;font-size:1.15rem;font-variant-numeric:tabular-nums}
.stat span{color:var(--mut);font-size:.78rem}
.bots{display:flex;gap:.4rem;overflow:auto;padding:.2rem 0 .6rem}
.bots button{min-height:44px;padding:0 .9rem;border-radius:980px;border:1px solid var(--line);background:transparent;color:var(--fg);font:inherit;font-size:.95rem}
.bots button[aria-pressed=true]{background:var(--acc);color:#fff;border-color:transparent}
#log{min-height:12rem;max-height:46vh;overflow:auto;margin:.6rem 0}
.bubble{margin:.45rem 0;white-space:pre-wrap;overflow-wrap:anywhere}
.bubble.me{font-weight:600}
.bubble.bot{color:var(--mut)}
#composer{display:flex;gap:.5rem;position:sticky;bottom:0;background:var(--bg);padding:.6rem 0 1rem}
input{flex:1;min-width:0;min-height:44px;padding:.7rem .9rem;border-radius:12px;border:1px solid var(--line);background:var(--field);color:var(--fg);font:inherit;font-size:1rem}
input:focus{outline:none;border-color:var(--acc);box-shadow:0 0 0 4px var(--ring)}
.run{display:flex;flex-wrap:wrap;gap:.45rem;align-items:center;padding:.7rem 0;border-bottom:1px solid var(--line)}
.run p{flex:1 1 12rem;margin:0}
.row{display:flex;flex-wrap:wrap;gap:.5rem;margin:.6rem 0}
.err{color:#ff453a}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.note{color:var(--mut);font-size:.85rem}
footer{color:var(--mut);font-size:.75rem;padding:1.5rem 0 2rem}
</style>
</head>
<body>
<nav class="nav"><div class="wrap"><a class="brand" href="/">KI</a><a class="l" id="logout" hidden href="/auth/logout">Abmelden</a></div></nav>
<main class="wrap" id="app"></main>
<footer><div class="wrap">Modell hermes-agent. Schlüssel bleiben auf dem Server.</div></footer>
<script>
const app = document.getElementById("app");
const NL = String.fromCharCode(10);
let bot = "";
let thread = [];
function el(tag, cls, text) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}
function money(n) {
  if (n == null || !isFinite(Number(n))) return "–";
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "USD", maximumFractionDigits: 6 }).format(Number(n));
}
async function api(path, opt) {
  const r = await fetch(path, opt);
  const t = await r.text();
  let j = null;
  try { j = JSON.parse(t); } catch (e) {}
  return { ok: r.ok, status: r.status, j: j, t: t };
}
function login() {
  app.append(el("p", "eyebrow", "Nur für dich"));
  app.append(el("h1", null, "Dein Panel."));
  app.append(el("p", "lead", "Anmeldung mit Discord. Der Chat geht an Hermes, immer mit dem Modell hermes-agent."));
  const a = el("a", "btn discord", "Mit Discord anmelden");
  a.href = "/auth/login";
  app.append(a);
}
function needs(run) {
  const s = String(run.status || run.state || "");
  return run.approval_required === true || run.needs_approval === true || s === "awaiting_approval" || s === "needs_approval" || s === "pending_approval";
}
async function loadSide(runsBox, sessBox) {
  runsBox.replaceChildren(el("p", "note", "Lade Läufe…"));
  const runs = await api("/p/" + encodeURIComponent(bot) + "/v1/runs");
  const list = runs.j && (Array.isArray(runs.j) ? runs.j : runs.j.runs) || [];
  runsBox.replaceChildren();
  if (!runs.ok) { runsBox.append(el("p", "note", "Läufe gerade nicht erreichbar.")); }
  for (const run of list) {
    const row = el("div", "run");
    row.append(el("p", null, (run.title || run.id || "Lauf") + " · " + (run.status || "")));
    if (needs(run)) {
      const ok = el("button", "btn", "Bestätigen");
      ok.type = "button";
      ok.addEventListener("click", async function () {
        ok.disabled = true;
        await api("/p/" + encodeURIComponent(bot) + "/v1/approval", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ run_id: run.id, approved: true }) });
        loadSide(runsBox, sessBox);
      });
      row.append(ok);
    }
    const stop = el("button", "btn sec", "Stopp");
    stop.type = "button";
    stop.addEventListener("click", function () {
      api("/p/" + encodeURIComponent(bot) + "/v1/stop", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ run_id: run.id }) });
    });
    const hint = el("input");
    hint.maxLength = 500;
    hint.placeholder = "Hinweis";
    hint.setAttribute("aria-label", "Hinweis an den Lauf");
    const send = el("button", "btn sec", "Hinweis");
    send.type = "button";
    send.addEventListener("click", function () {
      const message = hint.value.trim();
      if (!message) return;
      api("/p/" + encodeURIComponent(bot) + "/v1/steer", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ run_id: run.id, message: message }) });
      hint.value = "";
    });
    row.append(stop, hint, send);
    runsBox.append(row);
  }
  const sessions = await api("/p/" + encodeURIComponent(bot) + "/api/sessions");
  const items = sessions.j && (Array.isArray(sessions.j) ? sessions.j : sessions.j.sessions) || [];
  sessBox.replaceChildren();
  for (const s of items.slice(0, 12)) sessBox.append(el("p", "note", s.title || s.id || "Sitzung"));
}
function jobId(job) { return String(job.id || job.job_id || ""); }
async function dashSend(path, opt, mount) {
  const res = await api(path, opt);
  if (!(res.j && res.j.confirm_required)) return res;
  const box = el("div", "card");
  box.append(el("p", null, res.j.confirm_message || "Diese Änderung braucht eine Bestätigung."));
  const yes = el("button", "btn", "Trotzdem setzen");
  yes.type = "button";
  const no = el("button", "btn sec", "Abbrechen");
  no.type = "button";
  box.append(yes, no);
  mount.append(box);
  return new Promise(function (resolve) {
    no.addEventListener("click", function () { box.remove(); resolve(res); });
    yes.addEventListener("click", async function () {
      yes.disabled = true;
      let body = {};
      try { body = opt && opt.body ? JSON.parse(opt.body) : {}; } catch (e) { body = {}; }
      body.confirm_expensive_model = true;
      const again = await api(path, { method: opt.method || "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      box.remove();
      resolve(again);
    });
  });
}
async function loadJobs(box) {
  if (!bot) return;
  box.replaceChildren(el("p", "note", "Lade Aufträge…"));
  const res = await api("/p/" + encodeURIComponent(bot) + "/api/jobs");
  const list = res.j && (Array.isArray(res.j) ? res.j : res.j.jobs) || [];
  box.replaceChildren();
  if (!res.ok) { box.append(el("p", "note", (res.j && res.j.error) || "Aufträge gerade nicht erreichbar.")); return; }
  const form = el("form", "row");
  const nm = el("input"); nm.placeholder = "Name"; nm.setAttribute("aria-label", "Auftragsname"); nm.maxLength = 80;
  const sch = el("input"); sch.placeholder = "0 3 * * *"; sch.setAttribute("aria-label", "Zeitplan"); sch.maxLength = 80;
  const pr = el("input"); pr.placeholder = "Auftrag"; pr.setAttribute("aria-label", "Auftragstext"); pr.maxLength = 500;
  const add = el("button", "btn sec", "Auftrag anlegen"); add.type = "submit";
  form.append(nm, sch, pr, add);
  form.addEventListener("submit", async function (ev) {
    ev.preventDefault();
    await api("/p/" + encodeURIComponent(bot) + "/api/jobs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: nm.value.trim(), schedule: sch.value.trim(), prompt: pr.value.trim() }) });
    loadJobs(box);
  });
  box.append(form);
  for (const job of list) {
    const id = jobId(job);
    if (!id) continue;
    const row = el("div", "run");
    row.append(el("p", null, (job.name || id) + " · " + (job.schedule || "")));
    const edit = el("input"); edit.value = job.prompt || job.schedule || ""; edit.setAttribute("aria-label", "Auftrag bearbeiten"); edit.maxLength = 500;
    const save = el("button", "btn sec", "Speichern"); save.type = "button";
    save.addEventListener("click", async function () {
      await api("/p/" + encodeURIComponent(bot) + "/api/jobs/" + encodeURIComponent(id), { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ schedule: job.schedule || "", prompt: edit.value }) });
      loadJobs(box);
    });
    const pause = el("button", "btn sec", job.paused ? "Fortsetzen" : "Pause"); pause.type = "button";
    pause.addEventListener("click", async function () {
      await api("/p/" + encodeURIComponent(bot) + "/api/jobs/" + encodeURIComponent(id) + (job.paused ? "/resume" : "/pause"), { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      loadJobs(box);
    });
    const run = el("button", "btn sec", "Ausführen"); run.type = "button";
    run.addEventListener("click", function () { api("/p/" + encodeURIComponent(bot) + "/api/jobs/" + encodeURIComponent(id) + "/run", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }); });
    const del = el("button", "btn sec", "Löschen"); del.type = "button";
    del.addEventListener("click", function () {
      const yes = el("button", "btn", "Wirklich löschen"); yes.type = "button";
      yes.addEventListener("click", async function () {
        await api("/p/" + encodeURIComponent(bot) + "/api/jobs/" + encodeURIComponent(id), { method: "DELETE" });
        loadJobs(box);
      });
      row.append(yes);
    });
    row.append(edit, save, pause, run, del);
    box.append(row);
  }
}
async function panel(user) {
  document.getElementById("logout").hidden = false;
  app.append(el("p", "eyebrow", "Angemeldet"));
  app.append(el("h1", null, user.name || user.username || "KI"));
  const usage = el("div", "stats");
  usage.id = "usage";
  app.append(usage);
  const bots = el("div", "bots");
  app.append(bots);
  const form = el("form", "row");
  const name = el("input");
  name.maxLength = 32;
  name.placeholder = "neuer-bot";
  name.setAttribute("aria-label", "Name des Bots");
  name.autocomplete = "off";
  const add = el("button", "btn sec", "Anlegen");
  add.type = "submit";
  const err = el("p", "err", "");
  form.append(name, add);
  form.addEventListener("submit", async function (ev) {
    ev.preventDefault();
    err.textContent = "";
    const res = await api("/api/hermes/profiles", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: name.value.trim() }) });
    if (!res.ok) { err.textContent = (res.j && res.j.error) || "Anlegen fehlgeschlagen"; return; }
    name.value = "";
    err.textContent = (res.j && res.j.hint) || "";
    loadBots(bots, res.j.name);
  });
  app.append(form, err);
  const log = el("div", "card");
  log.id = "log";
  const composer = el("form");
  composer.id = "composer";
  const label = el("label", "sr", "Nachricht");
  label.htmlFor = "msg";
  const msg = el("input");
  msg.id = "msg";
  msg.maxLength = 4000;
  msg.autocomplete = "off";
  const send = el("button", "btn", "Senden");
  send.type = "submit";
  composer.append(label, msg, send);
  app.append(log, el("p", "note", "Modell hermes-agent. Teure Modelle werden abgelehnt."), composer);
  const runsBox = el("div");
  runsBox.id = "runs";
  const sessBox = el("div");
  const jobsBox = el("div");
  jobsBox.id = "jobs";
  const modelBox = el("div");
  modelBox.id = "model";
  app.append(el("h2", "eyebrow", "Läufe"), runsBox, el("h2", "eyebrow", "Sitzungen"), sessBox, el("h2", "eyebrow", "Cron"), jobsBox, el("h2", "eyebrow", "Modell"), modelBox);
  composer.addEventListener("submit", async function (ev) {
    ev.preventDefault();
    const text = msg.value.trim();
    if (!text || !bot) return;
    msg.value = "";
    thread.push({ role: "user", content: text });
    log.append(el("p", "bubble me", text));
    const node = el("p", "bubble bot", "");
    log.append(node);
    send.disabled = true;
    const r = await fetch("/p/" + encodeURIComponent(bot) + "/v1/chat/completions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "hermes-agent", stream: true, messages: thread.slice(-20) }) });
    if (!r.ok || !r.body) { node.textContent = "Keine Antwort (" + r.status + ")"; send.disabled = false; return; }
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let carry = "";
    let acc = "";
    while (true) {
      const step = await reader.read();
      if (step.done) break;
      carry += decoder.decode(step.value, { stream: true });
      const lines = carry.split(NL);
      carry = lines.pop();
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.indexOf("data:") !== 0) continue;
        const data = trimmed.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        try {
          const j = JSON.parse(data);
          const bit = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content || "";
          if (bit) { acc += bit; node.textContent = acc; }
        } catch (e) {}
      }
    }
    if (acc) thread.push({ role: "assistant", content: acc });
    log.scrollTop = log.scrollHeight;
    send.disabled = false;
  });
  async function loadBots(box, prefer) {
    const res = await api("/api/bots");
    const list = res.j && res.j.bots || [];
    box.replaceChildren();
    if (!list.length) { box.append(el("p", "note", "Keine Bots.")); return; }
    if (!prefer || !list.some(function (b) { return b.name === prefer && b.ready; })) {
      const ready = list.find(function (b) { return b.ready; });
      bot = ready ? ready.name : list[0].name;
    } else bot = prefer;
    for (const b of list) {
      const btn = el("button", null, b.name);
      btn.type = "button";
      btn.disabled = !b.ready;
      btn.setAttribute("aria-pressed", b.name === bot ? "true" : "false");
      btn.addEventListener("click", function () {
        bot = b.name;
        thread = [];
        log.replaceChildren();
        loadBots(box, b.name);
      });
      box.append(btn);
    }
    await loadSide(runsBox, sessBox);
    await fillUsage();
    await loadJobs(jobsBox);
    await loadModel(modelBox);
  }
async function loadModel(box) {
  if (!bot) return;
  box.replaceChildren();
  const field = el("input");
  field.value = "hermes-agent";
  field.maxLength = 80;
  field.setAttribute("aria-label", "Modell");
  const save = el("button", "btn sec", "Modell speichern");
  save.type = "button";
  save.addEventListener("click", async function () {
    const res = await dashSend("/api/hermes/model/set?profile=" + encodeURIComponent(bot), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: field.value.trim(), profile: bot }) }, box);
    if (res.j && res.j.ok) box.append(el("p", "note", "Modell gespeichert."));
  });
  box.append(field, save);
}
  async function fillUsage() {
    const res = await api("/api/usage");
    const u = res.j || {};
    usage.replaceChildren();
    const cards = [
      ["Guthaben", u.credits ? money(u.credits.remaining) : "–"],
      ["Heute", money(u.today_usd)],
      ["7 Tage", money(u.week_usd)],
      ["Modell", u.model && u.model.id || "hermes-agent"]
    ];
    for (const c of cards) {
      const card = el("div", "card stat");
      card.append(el("b", null, c[1]), el("span", null, c[0]));
      usage.append(card);
    }
    const rows = u.by_bot || [];
    for (const row of rows) usage.append(el("p", "note", row.bot + ": " + row.requests + " Anfragen, " + row.tokens + " Tokens, " + money(row.cost_usd)));
  }
  loadBots(bots).catch(function () { err.textContent = "Bots konnten nicht geladen werden."; });
}
api("/api/me").then(function (me) {
  if (!me.ok || !me.j || !me.j.user) { login(); return; }
  panel(me.j.user);
});
</script>
</body>
</html>`;
