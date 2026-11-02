// AI-Panel SPA. No framework, no build step. All state lives in `state`.

const state = {
  me: null,
  csrf: "",
  bots: [],
  bot: localStorage.getItem("ai-bot") || "cloudflare",
  tab: "chat",
  runId: null,
  abort: null,
  jobs: [],
  editingJob: null,
};

// ---------- tiny DOM helpers ----------
const $ = (sel) => document.querySelector(sel);

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (k === "dataset") Object.assign(node.dataset, v);
    else node.setAttribute(k, v === true ? "" : String(v));
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

let toastTimer;
function toast(message, isError = false) {
  const t = $("#toast");
  t.textContent = message;
  t.className = `toast${isError ? " err" : ""}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add("hidden"), 3200);
}

function confirmAction(title, text, okLabel = "Bestätigen") {
  return new Promise((resolve) => {
    const modal = $("#modal");
    $("#modal-title").textContent = title;
    $("#modal-text").textContent = text;
    $("#modal-ok").textContent = okLabel;
    modal.classList.remove("hidden");
    const done = (value) => {
      modal.classList.add("hidden");
      $("#modal-ok").onclick = null;
      $("#modal-cancel").onclick = null;
      resolve(value);
    };
    $("#modal-ok").onclick = () => done(true);
    $("#modal-cancel").onclick = () => done(false);
  });
}

// ---------- API ----------
async function api(path, { method = "GET", body } = {}) {
  const headers = { accept: "application/json" };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (method !== "GET") headers["x-csrf-token"] = state.csrf;
  const res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  if (res.status === 401) {
    location.href = "/auth/login";
    throw new Error("unauthorized");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok && !data.confirm_required) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.data = data;
    err.status = res.status;
    throw err;
  }
  return data;
}

const botPath = (suffix) => `/api/bots/${encodeURIComponent(state.bot)}${suffix}`;

// ---------- boot ----------
async function boot() {
  try {
    const me = await api("/api/me");
    state.me = me.user;
    state.csrf = me.csrf;
    state.bots = me.bots;
  } catch {
    return;
  }
  if (!state.bots.includes(state.bot)) state.bot = state.bots[0];
  renderBotSwitch();
  wire();
  switchTab(state.tab);
  await loadBots();
}

function renderBotSwitch() {
  const sel = $("#bot-switch");
  clear(sel);
  for (const b of state.bots) sel.append(el("option", { value: b, text: b, selected: b === state.bot }));
  sel.onchange = () => {
    state.bot = sel.value;
    localStorage.setItem("ai-bot", state.bot);
    $("#messages").replaceChildren();
    state.runId = null;
    if (state.tab === "cron") loadJobs();
    if (state.tab === "sessions") loadSessions();
    if (state.tab === "bots") loadBots();
  };
  $("#cron-bot").textContent = state.bot;
  $("#sessions-bot").textContent = state.bot;
}

function wire() {
  $("#tabs").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-tab]");
    if (btn) switchTab(btn.dataset.tab);
  });
  $("#logout").onclick = () => (location.href = "/auth/logout");
  $("#btn-send").onclick = send;
  $("#input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });
  $("#btn-stop").onclick = stopRun;
  $("#btn-steer").onclick = steerRun;
  $("#btn-new-bot").onclick = newBot;
  $("#btn-set-model").onclick = setModel;
  $("#btn-save-soul").onclick = saveSoul;
  $("#bot-detail-close").onclick = () => $("#bot-detail").classList.add("hidden");
  $("#btn-new-job").onclick = () => openJobForm(null);
  $("#job-form-cancel").onclick = () => $("#job-form").classList.add("hidden");
  $("#job-form").onsubmit = saveJob;
  $("#btn-usage-refresh").onclick = loadUsage;
  $("#btn-sessions-refresh").onclick = loadSessions;
  $("#btn-log-refresh").onclick = loadLog;
  $("#session-close").onclick = () => $("#session-detail").classList.add("hidden");
  $("#model-provider").onchange = () => fillModelNames();
}

function switchTab(tab) {
  state.tab = tab;
  for (const btn of document.querySelectorAll("#tabs button")) btn.classList.toggle("active", btn.dataset.tab === tab);
  for (const view of document.querySelectorAll(".view")) view.classList.toggle("active", view.id === `view-${tab}`);
  $("#cron-bot").textContent = state.bot;
  $("#sessions-bot").textContent = state.bot;
  if (tab === "bots") loadBots();
  if (tab === "cron") loadJobs();
  if (tab === "usage") loadUsage();
  if (tab === "sessions") loadSessions();
  if (tab === "log") loadLog();
}

// ---------- chat ----------
function addMessage(role, text = "") {
  const node = el("div", { class: `msg ${role}` });
  if (text) node.textContent = text;
  $("#messages").append(node);
  node.scrollIntoView({ block: "end" });
  return node;
}

function ensureRunControls(show) {
  $("#run-controls").classList.toggle("hidden", !show);
}

async function send() {
  const input = $("#input");
  const text = input.value.trim();
  if (!text || state.abort) return;
  input.value = "";
  addMessage("user", text);
  const bubble = addMessage("assistant");
  const quick = $("#quick-mode").checked;
  try {
    if (quick) await quickChat(text, bubble);
    else await startRun(text, bubble);
  } catch (err) {
    bubble.append(el("div", { class: "mut", text: `Fehler: ${err.message}` }));
    ensureRunControls(false);
  }
}

async function startRun(text, bubble) {
  const data = await api(botPath("/runs"), { method: "POST", body: { input: text } });
  state.runId = data.run_id;
  ensureRunControls(true);
  await followRun(data.run_id, bubble);
}

async function followRun(runId, bubble) {
  const think = el("details", { class: "think", open: true });
  const thinkBody = el("div");
  think.append(el("summary", { text: "Denkt…" }), thinkBody);
  const tools = el("div");
  const answer = el("div");
  bubble.append(think, tools, answer);

  const controller = new AbortController();
  state.abort = controller;
  let sawText = false;

  try {
    const res = await fetch(botPath(`/runs/${runId}/events`), {
      headers: { accept: "text/event-stream" },
      signal: controller.signal,
    });
    if (!res.ok || !res.body) throw new Error(`events HTTP ${res.status}`);
    await readSse(res.body, (event) => {
      const name = event.event || event.type || "";
      if (name.includes("thinking") || name.includes("reasoning")) {
        thinkBody.append(document.createTextNode(event.delta || event.text || event.content || ""));
      } else if (name === "tool.started" || name === "tool.start") {
        tools.append(el("span", { class: "tool", text: `⚙ ${event.tool || event.tool_name || event.name || "tool"}…` }));
      } else if (name === "tool.completed" || name === "tool.end") {
        const last = tools.lastElementChild;
        if (last) {
          last.classList.add("done");
          last.textContent = `✓ ${event.tool || event.tool_name || last.textContent.replace(/^⚙ /, "")}`;
        }
      } else if (name === "approval.request") {
        tools.append(approvalCard(runId, event));
      } else if (name.includes("delta") || name === "run.text") {
        answer.append(document.createTextNode(event.delta || event.text || ""));
        sawText = true;
      } else if (name === "run.completed" || name === "run.finished") {
        if (!sawText && event.output) answer.textContent = event.output;
        think.open = false;
        think.querySelector("summary").textContent = "Gedacht";
      } else if (name === "run.failed" || name === "run.error") {
        answer.append(el("div", { class: "mut", text: `Fehler: ${event.error || event.message || "unbekannt"}` }));
      } else if (name === "run.cancelled" || name === "run.stopped") {
        answer.append(el("div", { class: "mut", text: "Gestoppt." }));
      }
      bubble.scrollIntoView({ block: "end" });
    }, controller.signal);
  } catch (err) {
    if (err.name !== "AbortError") answer.append(el("div", { class: "mut", text: `Stream: ${err.message}` }));
  } finally {
    state.abort = null;
    state.runId = null;
    ensureRunControls(false);
  }
}

function approvalCard(runId, event) {
  const card = el("div", { class: "approval" });
  card.append(el("strong", { text: "Freigabe nötig" }));
  if (event.command) card.append(el("code", { text: String(event.command) }));
  else if (event.message) card.append(el("div", { class: "mut", text: String(event.message) }));
  const choices = Array.isArray(event.choices) && event.choices.length ? event.choices : ["once", "deny"];
  const row = el("div", { class: "row" });
  for (const choice of choices) {
    row.append(
      el("button", {
        class: choice === "deny" ? "danger sm" : "primary sm",
        text: choice,
        onclick: async () => {
          try {
            await api(botPath(`/runs/${runId}/approval`), { method: "POST", body: { choice, request_id: event.request_id } });
            card.replaceWith(el("div", { class: "mut", text: `Freigabe: ${choice}` }));
          } catch (err) {
            toast(err.message, true);
          }
        },
      }),
    );
  }
  card.append(row);
  return card;
}

async function steerRun() {
  const input = $("#steer-input");
  const text = input.value.trim();
  if (!text || !state.runId) return;
  try {
    await api(botPath(`/runs/${state.runId}/steer`), { method: "POST", body: { input: text } });
    input.value = "";
    toast("Steer gesendet");
  } catch (err) {
    toast(err.message, true);
  }
}

async function stopRun() {
  if (!state.runId) return;
  try {
    await api(botPath(`/runs/${state.runId}/stop`), { method: "POST", body: {} });
    toast("Stop gesendet");
  } catch (err) {
    toast(err.message, true);
  }
  if (state.abort) state.abort.abort();
}

async function quickChat(text, bubble) {
  const res = await fetch(botPath("/quick"), {
    method: "POST",
    headers: { "content-type": "application/json", "x-csrf-token": state.csrf },
    body: JSON.stringify({ messages: [{ role: "user", content: text }] }),
  });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  await readSse(res.body, (event) => {
    const delta = event.choices?.[0]?.delta?.content;
    if (delta) bubble.append(document.createTextNode(delta));
  });
}

/** Minimal SSE reader: yields parsed JSON objects for each `data:` frame. */
async function readSse(stream, onEvent, signal) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    if (signal?.aborted) {
      reader.cancel().catch(() => {});
      return;
    }
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const frame = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      for (const line of frame.split("\n")) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          onEvent(JSON.parse(payload));
        } catch {
          /* ignore keep-alive comments and non-JSON frames */
        }
      }
    }
  }
}

// ---------- bots ----------
async function loadBots() {
  const list = $("#bot-list");
  clear(list);
  try {
    const data = await api("/api/bots");
    for (const bot of data.bots) {
      const card = el(
        "div",
        { class: "card click" },
        el("h3", { text: bot.name }),
        el("div", { class: "k", text: bot.description || "—" }),
        el("div", { class: "k", text: `${bot.provider || "?"} · ${bot.model || "kein Modell"}` }),
        el("div", { class: "k", text: bot.exists ? (bot.gateway_running ? "läuft" : "gestoppt") : "Profil fehlt" }),
      );
      card.onclick = () => openBot(bot.name);
      list.append(card);
    }
    if (data.others?.length) {
      list.append(el("div", { class: "card" }, el("h3", { text: "Weitere Profile" }), el("div", { class: "k", text: data.others.join(", ") })));
    }
  } catch (err) {
    list.append(el("div", { class: "card mut", text: `Bots: ${err.message}` }));
  }
}

async function openBot(name) {
  const panel = $("#bot-detail");
  panel.classList.remove("hidden");
  state.bot = name;
  localStorage.setItem("ai-bot", name);
  $("#bot-switch").value = name;
  $("#cron-bot").textContent = name;
  $("#sessions-bot").textContent = name;
  $("#bot-detail-title").textContent = name;
  $("#bot-detail-meta").textContent = "lade…";
  $("#soul").value = "";
  try {
    const [soul, models] = await Promise.all([api(`/api/bots/${name}/soul`), api(`/api/bots/${name}/models`)]);
    $("#soul").value = soul.content || "";
    $("#bot-detail-meta").textContent = `aktuell: ${models.current.provider || "?"} · ${models.current.model || "?"}`;
    state.models = models;
    const provider = $("#model-provider");
    clear(provider);
    for (const p of models.providers) provider.append(el("option", { value: p.slug, text: p.name || p.slug }));
    const currentProvider = models.providers.find((p) => p.slug === models.current.provider);
    if (currentProvider) provider.value = currentProvider.slug;
    fillModelNames();
  } catch (err) {
    $("#bot-detail-meta").textContent = `Fehler: ${err.message}`;
  }
}

function fillModelNames() {
  const provider = $("#model-provider").value;
  const sel = $("#model-name");
  clear(sel);
  const row = state.models?.providers.find((p) => p.slug === provider);
  for (const m of row?.models || []) sel.append(el("option", { value: m.id, text: m.name || m.id }));
}

async function setModel() {
  const provider = $("#model-provider").value;
  const model = $("#model-name").value;
  if (!provider || !model) return;
  try {
    await api(botPath("/model"), { method: "POST", body: { provider, model } });
    toast("Modell gesetzt");
  } catch (err) {
    if (err.data?.confirm_required) {
      const ok = await confirmAction("Teures Modell", err.data.message || "Wirklich setzen?", "Trotzdem setzen");
      if (!ok) return;
      try {
        await api(botPath("/model"), { method: "POST", body: { provider, model, confirm: true } });
        toast("Modell gesetzt");
      } catch (e2) {
        toast(e2.message, true);
      }
      return;
    }
    toast(err.message, true);
  }
}

async function saveSoul() {
  const content = $("#soul").value;
  const ok = await confirmAction("SOUL.md überschreiben", `SOUL.md von ${state.bot} wirklich ersetzen?`, "Speichern");
  if (!ok) return;
  try {
    await api(botPath("/soul"), { method: "PUT", body: { content, confirm: true } });
    $("#soul-state").textContent = "gespeichert";
    toast("SOUL gespeichert");
  } catch (err) {
    toast(err.message, true);
  }
}

async function newBot() {
  const name = prompt("Name des neuen Bots (a-z, 0-9, -):");
  if (!name) return;
  try {
    const res = await api("/api/bots", { method: "POST", body: { name, description: "" } });
    toast(res.panel_enabled ? "Bot erstellt" : "Erstellt — PANEL_BOTS ergänzen, damit er hier auftaucht");
    await loadBots();
  } catch (err) {
    toast(err.message, true);
  }
}

// ---------- cron ----------
async function loadJobs() {
  const list = $("#job-list");
  clear(list);
  try {
    const data = await api(botPath("/jobs"));
    state.jobs = data.jobs;
    if (!data.jobs.length) list.append(el("div", { class: "card mut", text: "Keine Jobs." }));
    for (const job of data.jobs) {
      const card = el(
        "div",
        { class: "card" },
        el("h3", { text: job.name || job.id }),
        el("div", { class: "k", text: job.schedule || "" }),
        el("div", { class: "k", text: job.paused ? "pausiert" : job.enabled === false ? "deaktiviert" : "aktiv" }),
        el(
          "div",
          { class: "actions" },
          el("button", { class: "ghost sm", text: "Bearbeiten", onclick: () => openJobForm(job) }),
          el("button", {
            class: "ghost sm",
            text: job.paused ? "Resume" : "Pause",
            onclick: () => jobAction(job.id, job.paused ? "resume" : "pause"),
          }),
          el("button", { class: "ghost sm", text: "Run", onclick: () => jobAction(job.id, "run") }),
          el("button", { class: "danger sm", text: "Löschen", onclick: () => deleteJob(job) }),
        ),
      );
      list.append(card);
    }
  } catch (err) {
    list.append(el("div", { class: "card mut", text: `Cron: ${err.message}` }));
  }
}

function openJobForm(job) {
  state.editingJob = job;
  $("#job-form").classList.remove("hidden");
  $("#job-form-title").textContent = job ? `Job: ${job.name}` : "Neuer Job";
  $("#job-name").value = job?.name || "";
  $("#job-schedule").value = job?.schedule || "";
  $("#job-prompt").value = job?.prompt || "";
}

async function saveJob(e) {
  e.preventDefault();
  const body = {
    name: $("#job-name").value.trim(),
    schedule: $("#job-schedule").value.trim(),
    prompt: $("#job-prompt").value.trim(),
  };
  try {
    if (state.editingJob) await api(botPath(`/jobs/${state.editingJob.id}`), { method: "PATCH", body });
    else await api(botPath("/jobs"), { method: "POST", body });
    $("#job-form").classList.add("hidden");
    toast("Job gespeichert");
    await loadJobs();
  } catch (err) {
    toast(err.message, true);
  }
}

async function jobAction(id, action) {
  try {
    await api(botPath(`/jobs/${id}/${action}`), { method: "POST", body: {} });
    toast(`${action} ok`);
    await loadJobs();
  } catch (err) {
    toast(err.message, true);
  }
}

async function deleteJob(job) {
  const ok = await confirmAction("Job löschen", `„${job.name || job.id}“ wirklich löschen?`, "Löschen");
  if (!ok) return;
  try {
    await api(botPath(`/jobs/${job.id}?confirm=1`), { method: "DELETE" });
    toast("Gelöscht");
    await loadJobs();
  } catch (err) {
    toast(err.message, true);
  }
}

// ---------- usage ----------
const money = (v) => (v === null || v === undefined ? "—" : `$${Number(v).toFixed(4)}`);

async function loadUsage() {
  const cards = $("#usage-cards");
  clear(cards);
  cards.append(el("div", { class: "card mut", text: "lade…" }));
  try {
    const u = await api("/api/usage");
    clear(cards);
    const or = u.openrouter;
    cards.append(
      metric("Guthaben", money(or.total_credits)),
      metric("Verbraucht", money(or.total_usage)),
      metric("Heute", money(or.usage_daily)),
      metric("Woche", money(or.usage_weekly)),
      metric("Monat", money(or.usage_monthly)),
      metric("Limit übrig", money(or.limit_remaining)),
    );
    if (!or.available) cards.append(el("div", { class: "card mut", text: `OpenRouter: ${or.error || "kein Key gesetzt"}` }));

    const bots = clear($("#usage-bots"));
    for (const b of u.per_bot) {
      bots.append(
        el(
          "div",
          { class: "card" },
          el("h3", { text: b.bot }),
          el("div", { class: "v", text: money(b.cost_usd) }),
          el("div", { class: "k", text: `${b.sessions} Sessions · ${b.input_tokens + b.output_tokens} Tokens` }),
        ),
      );
    }

    const daily = clear($("#usage-daily"));
    if (!u.daily.length) daily.append(el("div", { class: "card mut", text: "keine Daten" }));
    for (const d of u.daily) daily.append(el("div", { class: "card" }, el("div", { class: "k", text: d.day }), el("div", { class: "v sm", text: money(d.cost_usd) })));

    const recent = clear($("#usage-recent"));
    if (!u.recent_requests.length) recent.append(el("div", { class: "card mut", text: "keine" }));
    for (const r of u.recent_requests) {
      recent.append(
        el(
          "div",
          { class: "card" },
          el("h3", { text: r.title || r.id }),
          el("div", { class: "k", text: `${r.bot} · ${r.model || "?"}` }),
          el("div", { class: "k", text: `${money(r.cost_usd)} · ${r.input_tokens}+${r.output_tokens} Tokens` }),
        ),
      );
    }

    const prices = clear($("#usage-prices"));
    if (!u.prices.length) prices.append(el("div", { class: "card mut", text: u.prices_error || "keine Preise" }));
    for (const p of u.prices) {
      prices.append(
        el(
          "div",
          { class: "card" },
          el("h3", { text: p.name }),
          el("div", { class: "k", text: `in ${p.prompt ?? "?"} · out ${p.completion ?? "?"}` }),
        ),
      );
    }
  } catch (err) {
    clear(cards).append(el("div", { class: "card mut", text: `Usage: ${err.message}` }));
  }
}

function metric(label, value) {
  return el("div", { class: "card" }, el("div", { class: "k", text: label }), el("div", { class: "v", text: value }));
}

// ---------- sessions ----------
async function loadSessions() {
  const list = clear($("#session-list"));
  list.append(el("div", { class: "card mut", text: "lade…" }));
  try {
    const data = await api(botPath("/sessions"));
    clear(list);
    if (!data.sessions.length) list.append(el("div", { class: "card mut", text: "Keine Sessions." }));
    for (const s of data.sessions) {
      const card = el(
        "div",
        { class: "card click" },
        el("h3", { text: s.title || s.id }),
        el("div", { class: "k", text: s.model || "?" }),
        el("div", { class: "k", text: `${s.messages} Nachrichten · ${money(s.cost_usd)} · ${new Date((s.last_active || 0) * 1000).toLocaleString("de-DE")}` }),
      );
      card.onclick = () => openSession(s);
      list.append(card);
    }
  } catch (err) {
    clear(list).append(el("div", { class: "card mut", text: `Sessions: ${err.message}` }));
  }
}

async function openSession(session) {
  const panel = $("#session-detail");
  panel.classList.remove("hidden");
  $("#session-title").textContent = session.title || session.id;
  const box = clear($("#session-messages"));
  box.append(el("div", { class: "mut", text: "lade…" }));
  try {
    const data = await api(botPath(`/sessions/${session.id}/messages`));
    clear(box);
    for (const m of data.messages) {
      const text = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
      box.append(el("div", { class: `msg ${m.role === "user" ? "user" : "assistant"}`, text: `${m.tool ? `[${m.tool}] ` : ""}${text}` }));
    }
  } catch (err) {
    clear(box).append(el("div", { class: "mut", text: err.message }));
  }
}

// ---------- log ----------
async function loadLog() {
  const list = clear($("#log-list"));
  try {
    const data = await api("/api/log?limit=100");
    for (const e of data.entries) {
      list.append(
        el(
          "div",
          { class: "line" },
          el("span", { text: (e.ts || "").slice(11, 19) }),
          el("span", { class: `s${String(e.status)[0]}`, text: String(e.status) }),
          el("span", { text: `${e.method} ${e.path}${e.bot ? ` · ${e.bot}` : ""} · ${e.ms}ms` }),
        ),
      );
    }
    if (!data.entries.length) list.append(el("div", { class: "mut", text: "leer" }));
  } catch (err) {
    list.append(el("div", { class: "mut", text: err.message }));
  }
}

boot();
