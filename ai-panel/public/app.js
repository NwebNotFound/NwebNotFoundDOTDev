// AI-Panel SPA. No framework, no build step.
//
// Safety rule for this file: untrusted text only ever reaches the DOM through
// textContent / createTextNode. There are no HTML-string sinks here — markdown and syntax
// highlighting are parsed into data (markdown.js / highlight.js) and rendered node by node.

import { parseMarkdown } from "./markdown.js";
import { highlight } from "./highlight.js";
import {
  approvalPayload,
  approvalText,
  describeError,
  eventName,
  isTerminalEvent,
  isTerminalStatus,
  reconnectDelay,
  runStatusOf,
  toolFailed,
  toolOutputText,
} from "./run-events.js";
import { createCrewView } from "./crew.js";

const state = {
  me: null,
  csrf: "",
  bots: [],
  bot: localStorage.getItem("ai-bot") || "cloudflare",
  view: "chat",
  sessionId: null,
  conversationId: localStorage.getItem("ai-conversation") || null,
  conversations: [],
  runId: null,
  abort: null,
  streaming: false,
  models: null,
  jobs: [],
  editingJob: null,
};

const $ = (sel) => document.querySelector(sel);

// ---------------------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------------------

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
  toastTimer = setTimeout(() => t.classList.add("hidden"), 3600);
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

async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fall through to the textarea trick
  }
  try {
    const ta = el("textarea", { class: "offscreen" });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------------------

async function api(path, { method = "GET", body } = {}) {
  const headers = { accept: "application/json" };
  if (body !== undefined) headers["content-type"] = "application/json";
  if (method !== "GET") headers["x-csrf-token"] = state.csrf;
  const res = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  if (res.status === 401) {
    // No auto-redirect (that caused a reload loop); show the login screen and let the user click.
    showLogin();
    const err = new Error("unauthorized");
    err.status = 401;
    throw err;
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

// ---------------------------------------------------------------------------------------
// Markdown rendering
// ---------------------------------------------------------------------------------------

function renderInline(tokens, parent) {
  for (const tok of tokens || []) {
    switch (tok.t) {
      case "text":
        parent.append(document.createTextNode(tok.v));
        break;
      case "code":
        parent.append(el("code", { class: "inline", text: tok.v }));
        break;
      case "br":
        parent.append(el("br"));
        break;
      case "strong": {
        const n = el("strong");
        renderInline(tok.c, n);
        parent.append(n);
        break;
      }
      case "em": {
        const n = el("em");
        renderInline(tok.c, n);
        parent.append(n);
        break;
      }
      case "del": {
        const n = el("del");
        renderInline(tok.c, n);
        parent.append(n);
        break;
      }
      case "link": {
        const a = el("a", { href: tok.href, rel: "noopener noreferrer", target: "_blank" });
        renderInline(tok.c, a);
        parent.append(a);
        break;
      }
      default:
        break;
    }
  }
}

function codeBlock(text, lang) {
  const wrap = el("div", { class: "code-block" });
  const head = el("div", { class: "code-head" });
  head.append(el("span", { text: lang || "text" }));
  const copy = el("button", { class: "copy", type: "button", text: "Kopieren" });
  copy.onclick = async () => {
    const ok = await copyText(text);
    copy.textContent = ok ? "Kopiert" : "Fehler";
    setTimeout(() => (copy.textContent = "Kopieren"), 1400);
  };
  head.append(copy);

  const code = el("code");
  for (const tok of highlight(text, lang)) {
    if (tok.t === "text") code.append(document.createTextNode(tok.v));
    else code.append(el("span", { class: `tok-${tok.t}`, text: tok.v }));
  }
  wrap.append(head, el("pre", {}, code));
  return wrap;
}

function listNode(block) {
  const root = el(block.ordered ? "ol" : "ul");
  const stack = [{ level: 0, node: root }];
  for (const item of block.items) {
    while (item.level > stack.length - 1) {
      const host = stack[stack.length - 1].node;
      const parentItem = host.lastElementChild;
      const nested = el(block.ordered ? "ol" : "ul");
      (parentItem || host).append(nested);
      stack.push({ level: stack.length, node: nested });
    }
    while (item.level < stack.length - 1) stack.pop();
    const li = el("li");
    renderInline(item.inl, li);
    stack[stack.length - 1].node.append(li);
  }
  return root;
}

function tableNode(block) {
  const table = el("table");
  const thead = el("thead");
  const hrow = el("tr");
  for (const cell of block.head) {
    const th = el("th");
    renderInline(cell, th);
    hrow.append(th);
  }
  thead.append(hrow);
  const tbody = el("tbody");
  for (const row of block.rows) {
    const tr = el("tr");
    for (const cell of row) {
      const td = el("td");
      renderInline(cell, td);
      tr.append(td);
    }
    tbody.append(tr);
  }
  table.append(thead, tbody);
  return table;
}

function renderBlock(block) {
  switch (block.type) {
    case "p": {
      const p = el("p");
      renderInline(block.inl, p);
      return p;
    }
    case "h": {
      const h = el(`h${Math.min(6, Math.max(1, block.level))}`);
      renderInline(block.inl, h);
      return h;
    }
    case "code":
      return codeBlock(block.text, block.lang);
    case "list":
      return listNode(block);
    case "quote": {
      const q = el("blockquote");
      for (const inner of block.blocks) q.append(renderBlock(inner));
      return q;
    }
    case "table":
      return tableNode(block);
    case "hr":
      return el("hr");
    default:
      return el("p");
  }
}

function renderMarkdownInto(node, src) {
  clear(node);
  for (const block of parseMarkdown(src)) node.append(renderBlock(block));
  return node;
}

// ---------------------------------------------------------------------------------------
// Chat
// ---------------------------------------------------------------------------------------

function nowTime() {
  return new Date().toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" });
}

function scrollToBottom(force = false) {
  const box = $("#messages");
  const near = box.scrollHeight - box.scrollTop - box.clientHeight < 160;
  if (force || near) box.scrollTop = box.scrollHeight;
}

function emptyState() {
  const hero = el("div", { class: "hero" });
  hero.append(
    el("h2", { text: state.bot }),
    el("p", { class: "mut", text: "Frag den Bot — Antworten erscheinen hier mit Denk- und Tool-Schritten." }),
  );
  const ideas = el("div", { class: "row" });
  for (const text of ["Status?", "Was ist heute passiert?", "Zeig mir die letzten Deploys"]) {
    ideas.append(
      el("button", {
        class: "ghost sm",
        text,
        onclick: () => {
          $("#input").value = text;
          autosize();
          send();
        },
      }),
    );
  }
  hero.append(ideas);
  return hero;
}

function userMessage(text) {
  const node = el("div", { class: "msg user" });
  node.append(el("div", { class: "bubble", text }));
  return node;
}

function assistantShell() {
  const node = el("div", { class: "msg assistant" });
  const meta = el("div", { class: "msg-meta" });
  meta.append(el("span", { class: "who", text: state.bot }), el("span", { text: nowTime() }));

  const thinking = el("details", { class: "thinking", open: true });
  const thinkBody = el("div", { class: "body" });
  const thinkSummary = el("summary", { text: "Denkt…" });
  thinking.append(thinkSummary, thinkBody);

  const tools = el("div", { class: "tools" });
  const answer = el("div", { class: "md" });
  const bubble = el("div", { class: "bubble" }, thinking, tools, answer);
  node.append(meta, bubble);

  return {
    node,
    thinking,
    thinkSummary,
    thinkBody,
    tools,
    answer,
    text: "",
    sawThinking: false,
    pending: false,
  };
}

function scheduleAnswer(cur) {
  if (cur.pending) return;
  cur.pending = true;
  setTimeout(() => {
    cur.pending = false;
    renderMarkdownInto(cur.answer, cur.text);
    if (state.streaming) cur.answer.append(el("span", { class: "cursor" }));
    scrollToBottom();
  }, 70);
}

function toolBlock(name) {
  const node = el("details", { class: "tool", open: true });
  const status = el("span", { class: "mut", text: "läuft…" });
  const summary = el("summary");
  summary.append(el("span", { text: name || "tool" }), status);
  const body = el("div", { class: "body" });
  node.append(summary, body);

  return {
    node,
    body,
    command(value) {
      if (value === undefined || value === null || value === "") return;
      const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
      body.append(el("div", { class: "tool-line" }, el("span", { class: "k", text: "Befehl" }), el("code", { class: "inline", text: text.slice(0, 4000) })));
    },
    output(value) {
      if (value === undefined || value === null || value === "" || typeof value === "boolean") return;
      const text = typeof value === "string" ? value : JSON.stringify(value, null, 2);
      if (!text || text === "{}" || text === "[]" || text === '""') return;
      body.append(el("pre", { text: text.slice(0, 8000) }));
    },
    diff(value) {
      if (!value) return;
      const pre = el("pre");
      for (const tok of highlight(String(value), "diff")) {
        if (tok.t === "text") pre.append(document.createTextNode(tok.v));
        else pre.append(el("span", { class: `tok-${tok.t}`, text: tok.v }));
      }
      body.append(el("div", { class: "tool-line" }, el("span", { class: "k", text: "Diff" })), pre);
    },
    finish(ok) {
      status.textContent = ok ? "fertig" : "fehlgeschlagen";
      status.className = ok ? "state-ok" : "state-err";
      node.open = false;
    },
  };
}

function errorBlock(text, onRetry) {
  const box = el("div", { class: "err-box" });
  box.append(el("div", { class: "err-text", text }));
  if (typeof onRetry === "function") {
    box.append(el("button", { class: "ghost sm", text: "Erneut versuchen", onclick: onRetry }));
  }
  return box;
}

function approvalCard(runId, event) {
  const card = el("div", { class: "approval" });
  card.append(el("div", { class: "title", text: "Freigabe nötig" }));
  const what = approvalText(event);
  if (what) card.append(el("pre", { text: String(what).slice(0, 4000) }));

  const labels = { once: "Einmal erlauben", session: "Für diese Sitzung", always: "Immer", deny: "Ablehnen" };
  const choices = Array.isArray(event.choices) && event.choices.length ? event.choices : ["once", "session", "always", "deny"];
  const actions = el("div", { class: "actions" });
  for (const choice of choices) {
    actions.append(
      el("button", {
        class: choice === "deny" ? "danger sm" : "primary sm",
        text: labels[choice] || choice,
        onclick: async () => {
          // The gateway wants exactly {request_id, execution_generation, choice}; the event may
          // name the id `prompt_id` instead. Refuse locally rather than sending a body that
          // silently does nothing upstream.
          const payload = approvalPayload(event, choice);
          if (!payload.ok) {
            actions.prepend(el("div", { class: "err-text", text: describeError({ message: payload.error }).text }));
            return;
          }
          try {
            await api(botPath(`/runs/${runId}/approval`), { method: "POST", body: payload.body });
            card.replaceWith(el("div", { class: "mut", text: `Freigabe: ${labels[choice] || choice}` }));
          } catch (err) {
            toast(describeError(err).text, true);
          }
        },
      }),
    );
  }
  card.append(actions);
  return card;
}

function autosize() {
  const ta = $("#input");
  ta.style.height = "auto";
  ta.style.height = `${Math.min(220, ta.scrollHeight)}px`;
}

function setStreaming(on) {
  state.streaming = on;
  $("#btn-send").classList.toggle("hidden", on);
  $("#btn-stop").classList.toggle("hidden", !on);
}

async function send() {
  const input = $("#input");
  const text = input.value.trim();
  if (!text || state.streaming) return;
  input.value = "";
  autosize();

  const thread = $("#messages");
  if (thread.querySelector(".hero")) clear(thread);
  thread.append(userMessage(text));
  if (!state.sessionId) $("#chat-title").textContent = text.length > 64 ? `${text.slice(0, 64)}…` : text;

  const cur = assistantShell();
  thread.append(cur.node);
  scrollToBottom(true);
  await runInto(text, cur);
}

/** One attempt at answering `text` into an existing shell. */
async function runInto(text, cur) {
  setStreaming(true);
  state.following = true;
  try {
    if ($("#quick-mode").checked) await quickChat(text, cur);
    else await startRun(text, cur);
  } catch (err) {
    const info = describeError(err);
    cur.answer.append(errorBlock(info.text, info.retryable ? () => retryInto(text, cur) : null));
  } finally {
    state.following = false;
    setStreaming(false);
    state.runId = null;
    state.abort = null;
    finishShell(cur);
    loadConversations();
  }
}

async function retryInto(text, cur) {
  if (state.streaming) return;
  clear(cur.answer);
  clear(cur.tools);
  cur.text = "";
  cur.sawThinking = false;
  state.runId = null;
  await runInto(text, cur);
}

function finishShell(cur) {
  const cursor = cur.answer.querySelector(".cursor");
  if (cursor) cursor.remove();
  if (cur.sawThinking) {
    cur.thinking.open = false;
    cur.thinkSummary.textContent = "Gedacht";
  }
  scrollToBottom();
}

async function startRun(text, cur) {
  const body = { input: text };
  if (state.sessionId) body.session_id = state.sessionId;
  if (state.conversationId) body.conversation_id = state.conversationId;
  const data = await api(botPath("/runs"), { method: "POST", body });
  state.runId = data.run_id;
  if (data.conversation_id) {
    state.conversationId = data.conversation_id;
    localStorage.setItem("ai-conversation", state.conversationId);
  }
  if (data.session_id) state.sessionId = data.session_id;
  if (!state.conversationId) loadConversations();
  await followRun(data.run_id, cur);
}

/**
 * Follow a run to its end. The stream is the fast path; when it ends early — the Cloudflare edge
 * gives up on a long approval wait, or the proxy restarts — the run itself is polled and the
 * stream is resumed (by `seq` when the gateway supports it). The user never has to reload.
 */
async function followRun(runId, cur) {
  const controller = new AbortController();
  state.abort = controller;
  let tool = null;
  let seq = null;
  let terminal = false;
  let attempt = 0;
  let pollNotes = 0;

  const handle = (event) => {
    const name = eventName(event);
    if (event?.seq !== undefined && event?.seq !== null) seq = String(event.seq);

    if (name.includes("thinking") || name.includes("reasoning")) {
      const delta = event.delta ?? event.text ?? event.content ?? "";
      if (delta) {
        cur.sawThinking = true;
        cur.thinkBody.append(document.createTextNode(String(delta)));
        cur.thinkSummary.textContent = "Denkt…";
      }
      return;
    }

    if (name === "tool.started" || name === "tool.start") {
      tool = toolBlock(event.tool || event.tool_name || event.name || "tool");
      tool.command(event.command ?? event.arguments ?? event.args ?? event.input);
      cur.tools.append(tool.node);
      return;
    }

    if (name === "tool.completed" || name === "tool.end" || name === "tool.failed" || name === "tool.error") {
      if (!tool) {
        tool = toolBlock(event.tool || event.tool_name || event.name || "tool");
        cur.tools.append(tool.node);
      }
      // Output only ever comes from a payload field — never from `error`, which is a boolean
      // on success and used to render as the literal "false".
      tool.output(toolOutputText(event));
      tool.diff(event.diff ?? event.patch);
      tool.finish(!toolFailed(event));
      tool = null;
      return;
    }

    if (name === "approval.request" || name === "approval.requested") {
      cur.tools.append(approvalCard(runId, event));
      cur.approvalShown = true;
      return;
    }

    if (name === "run.completed" || name === "run.finished") {
      if (!cur.text && typeof event.output === "string") cur.text = event.output;
      scheduleAnswer(cur);
      return;
    }

    if (name === "run.failed" || name === "run.error") {
      const info = describeError({ message: String(event.error || event.message || "run_failed") });
      cur.answer.append(el("div", { class: "mut", text: `Der Run ist fehlgeschlagen: ${info.text}` }));
      return;
    }

    if (name === "run.cancelled" || name === "run.stopped") {
      cur.answer.append(el("div", { class: "mut", text: "Gestoppt." }));
      return;
    }

    const delta = event.delta ?? event.text ?? "";
    if (delta && (name.includes("delta") || name === "run.text" || name === "")) {
      cur.text += String(delta);
      scheduleAnswer(cur);
    }
  };

  for (let round = 0; round < 20 && !controller.signal.aborted && !terminal; round += 1) {
    try {
      const q = seq ? `?since=${encodeURIComponent(seq)}` : "";
      const res = await fetch(botPath(`/runs/${runId}/events${q}`), {
        headers: { accept: "text/event-stream" },
        signal: controller.signal,
      });
      if (res.status === 404) {
        cur.answer.append(el("div", { class: "mut", text: "Diesen Run kennt das Gateway nicht mehr." }));
        return;
      }
      if (!res.ok || !res.body) throw new Error(`Stream ${res.status}`);
      attempt = 0;
      await readSse(
        res.body,
        (event) => {
          handle(event);
          if (isTerminalEvent(event)) terminal = true;
        },
        controller.signal,
        (id) => {
          if (id) seq = id;
        },
      );
    } catch (err) {
      if (controller.signal.aborted) return;
      // Keep going: the poll below decides whether the run is really over.
    }

    if (controller.signal.aborted || terminal) break;

    // The stream ended without a terminal event. Ask the run itself.
    attempt += 1;
    const snapshot = await pollRun(runId, cur);
    if (snapshot.terminal) {
      terminal = true;
      break;
    }
    if (snapshot.pending && !cur.approvalShown) {
      cur.tools.append(approvalCard(runId, snapshot.pending));
      cur.approvalShown = true;
    }
    if (snapshot.failed && pollNotes === 0) {
      pollNotes += 1;
      cur.tools.append(el("div", { class: "mut", text: "Verbindung unterbrochen — Status wird weiter abgefragt." }));
    }
    await new Promise((resolve) => setTimeout(resolve, reconnectDelay(attempt)));
  }

  if (!terminal && !controller.signal.aborted) {
    cur.answer.append(
      errorBlock("Verbindung zum Run ist dauerhaft weggebrochen.", () => {
        if (state.streaming) return;
        followRun(runId, cur).catch((err) => toast(describeError(err).text, true));
      }),
    );
  }
}

/** Ask the gateway what a run is doing right now (the reconnect fallback). */
async function pollRun(runId, cur) {
  try {
    const data = await api(botPath(`/runs/${runId}`));
    const status = runStatusOf(data);
    if (!cur.text && typeof data?.output === "string" && data.output) {
      cur.text = data.output;
      scheduleAnswer(cur);
    }
    if (status === "completed" || status === "finished" || status === "success") scheduleAnswer(cur);
    if (isTerminalStatus(status) && !["completed", "finished", "success"].includes(status)) {
      cur.answer.append(el("div", { class: "mut", text: `Run ${status}.` }));
    }
    const pending = data?.pending && data.pending.request_id ? { ...data.pending } : null;
    return { terminal: isTerminalStatus(status), status, pending, failed: false };
  } catch (err) {
    if (err?.status === 404) return { terminal: true, status: "gone", pending: null, failed: false };
    return { terminal: false, status: "", pending: null, failed: true };
  }
}

async function quickChat(text, cur) {
  const res = await fetch(botPath("/quick"), {
    method: "POST",
    headers: { "content-type": "application/json", "x-csrf-token": state.csrf },
    body: JSON.stringify({ messages: [{ role: "user", content: text }] }),
  });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
  await readSse(res.body, (event) => {
    const delta = event.choices?.[0]?.delta?.content;
    if (delta) {
      cur.text += delta;
      scheduleAnswer(cur);
    }
  });
}

async function stopRun() {
  if (!state.runId) return;
  try {
    await api(botPath(`/runs/${state.runId}/stop`), { method: "POST", body: {} });
  } catch (err) {
    toast(err.message, true);
  }
  if (state.abort) state.abort.abort();
}

/** Minimal SSE reader: parses `data:` frames, ignores comments and [DONE]. */
async function readSse(stream, onEvent, signal, onId) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
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
          if (line.startsWith("id:")) {
            const id = line.slice(3).trim();
            if (id && typeof onId === "function") onId(id);
            continue;
          }
          if (!line.startsWith("data:")) continue; // comments (": ping") and event: lines
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            onEvent(JSON.parse(payload));
          } catch {
            /* keep-alive or non-JSON frame */
          }
        }
      }
    }
  } catch (err) {
    if (err.name !== "AbortError") throw err;
  }
}

// ---------------------------------------------------------------------------------------
// Sessions (sidebar history)
// ---------------------------------------------------------------------------------------

async function loadConversations() {
  const list = clear($("#session-list"));
  try {
    const data = await api(botPath("/conversations?limit=40"));
    state.conversations = data.conversations || [];
    if (!state.conversations.length) {
      list.append(el("div", { class: "mut", text: "Noch keine Chats." }));
      return;
    }
    for (const conv of state.conversations) {
      const item = el("button", { class: `session-item${conv.id === state.conversationId ? " active" : ""}` });
      item.append(el("span", { class: "t", text: conv.title || conv.id }));
      const when = conv.updated_at ? new Date(conv.updated_at).toLocaleDateString("de-DE") : "";
      const parts = [conv.bot, when, conv.messages ? `${conv.messages} Nachrichten` : ""].filter(Boolean);
      item.append(el("span", { class: "m", text: parts.join(" · ") }));
      item.onclick = () => openConversation(conv);
      list.append(item);
    }
  } catch (err) {
    list.append(el("div", { class: "mut", text: `Verlauf: ${describeError(err).text}` }));
  }
}

/** Load one thread from the panel's own store (not from the gateway). */
async function openConversation(conv) {
  state.conversationId = conv.id;
  state.sessionId = conv.session_id || null;
  localStorage.setItem("ai-conversation", conv.id);
  state.view = "chat";
  switchView("chat");
  $("#chat-title").textContent = conv.title || conv.id;
  const thread = clear($("#messages"));
  thread.append(el("div", { class: "mut", text: "lade…" }));
  try {
    const data = await api(botPath(`/conversations/${encodeURIComponent(conv.id)}/messages`));
    clear(thread);
    appendTranscript(thread, data.messages || []);
    if (data.has_more && data.next_before) thread.prepend(olderMessagesButton(conv, data.next_before));
    if (!thread.firstChild) thread.append(el("div", { class: "mut", text: "Keine Nachrichten." }));
    scrollToBottom(true);
    loadConversations();
  } catch (err) {
    clear(thread).append(el("div", { class: "mut", text: `Chat: ${describeError(err).text}` }));
  }
}

/** Render transcript rows into a container, in store order (oldest first). */
function appendTranscript(container, rows) {
  for (const row of rows) {
    if (row.role === "user") {
      container.append(userMessage(row.content));
    } else if (row.role === "assistant") {
      const shell = assistantShell();
      shell.thinking.remove();
      renderMarkdownInto(shell.answer, row.content || "");
      container.append(shell.node);
    } else {
      container.append(transcriptEventRow(row));
    }
  }
}

/** The transcript is paged: this pulls the page above the oldest visible row. */
function olderMessagesButton(conv, before) {
  const wrap = el("div", { class: "thread-more" });
  const btn = el("button", { class: "ghost sm", text: "Ältere Nachrichten laden" });
  btn.onclick = async () => {
    btn.disabled = true;
    btn.textContent = "lade…";
    const thread = $("#messages");
    const heightBefore = thread.scrollHeight;
    try {
      const data = await api(botPath(`/conversations/${encodeURIComponent(conv.id)}/messages?before=${before}`));
      const frag = document.createDocumentFragment();
      appendTranscript(frag, data.messages || []);
      thread.insertBefore(frag, wrap);
      if (data.has_more && data.next_before) wrap.replaceWith(olderMessagesButton(conv, data.next_before));
      else wrap.remove();
      // Keep the row the user was looking at in place instead of jumping to the top.
      thread.scrollTop += thread.scrollHeight - heightBefore;
    } catch (err) {
      btn.disabled = false;
      btn.textContent = `Ältere laden: ${describeError(err).text}`;
    }
  };
  wrap.append(btn);
  return wrap;
}

/** A persisted tool/approval row: compact, muted, no markdown. */
function transcriptEventRow(row) {
  const wrap = el("div", { class: "transcript-event" });
  const label = row.kind === "approval" ? "Freigabe" : row.tool || "tool";
  const suffix = row.kind === "approval" ? "" : row.ok === false ? " · fehlgeschlagen" : "";
  wrap.append(el("div", { class: "mut", text: `${label}${suffix}` }));
  if (row.content) wrap.append(el("pre", { class: "tool-log", text: String(row.content).slice(0, 4000) }));
  return wrap;
}

function newChat() {
  state.sessionId = null;
  state.conversationId = null;
  state.runId = null;
  localStorage.removeItem("ai-conversation");
  $("#chat-title").textContent = "Neuer Chat";
  const thread = clear($("#messages"));
  thread.append(emptyState());
  if (window.innerWidth <= 860) closeDrawer();
  loadConversations();
}

// ---------------------------------------------------------------------------------------
// Bots + models
// ---------------------------------------------------------------------------------------

async function loadBots() {
  const data = await api("/api/bots");
  state.bots = data.bots;
  renderBotList();
  renderBotListFull();
  return data.bots;
}

function renderBotList() {
  const list = clear($("#bot-list"));
  for (const entry of state.bots) {
    const bot = typeof entry === "string" ? { name: entry, exists: true, gateway_running: false } : entry;
    const item = el("button", { class: `bot-item${bot.name === state.bot ? " active" : ""}` });
    item.append(el("span", { class: "avatar", text: bot.name.slice(0, 1).toUpperCase() }));
    item.append(el("span", { class: "name", text: bot.name }));
    item.append(el("span", { class: `pip ${bot.gateway_running ? "on" : "off"}` }));
    item.onclick = () => switchBot(bot.name);
    list.append(item);
  }
}

function renderBotListFull() {
  const list = clear($("#bot-list-full"));
  for (const entry of state.bots) {
    const bot = typeof entry === "string" ? { name: entry, exists: true } : entry;
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
}

async function switchBot(name) {
  state.bot = name;
  localStorage.setItem("ai-bot", name);
  $("#cron-bot").textContent = name;
  renderBotList();
  newChat();
  await loadModels();
  if (state.view === "cron") loadJobs();
  if (window.innerWidth <= 860) closeDrawer();
}

async function loadModels() {
  const picker = $("#model-picker");
  try {
    const models = await api(botPath("/models"));
    state.models = models;
    clear(picker);
    for (const provider of models.providers) {
      const group = el("optgroup", { label: provider.name || provider.slug });
      for (const model of provider.models) {
        const selected = provider.slug === models.current.provider && model.id === models.current.model;
        group.append(el("option", { value: `${provider.slug}|${model.id}`, text: model.name || model.id, selected }));
      }
      picker.append(group);
    }
    picker.disabled = false;
  } catch {
    clear(picker).append(el("option", { text: "Modell unbekannt", value: "" }));
    picker.disabled = true;
  }
}

async function setModelFromPicker() {
  const value = $("#model-picker").value;
  if (!value || !value.includes("|")) return;
  const [provider, model] = value.split("|");
  try {
    await api(botPath("/model"), { method: "POST", body: { provider, model } });
    toast("Modell gesetzt");
    await loadModels();
  } catch (err) {
    if (err.data?.confirm_required) {
      const ok = await confirmAction("Teures Modell", err.data.message || "Wirklich setzen?", "Trotzdem setzen");
      if (!ok) return;
      try {
        await api(botPath("/model"), { method: "POST", body: { provider, model, confirm: true } });
        toast("Modell gesetzt");
        await loadModels();
      } catch (e2) {
        toast(e2.message, true);
      }
      return;
    }
    toast(err.message, true);
  }
}

async function openBot(name) {
  const panel = $("#bot-detail");
  panel.classList.remove("hidden");
  $("#bot-detail-title").textContent = name;
  $("#bot-detail-meta").textContent = "lade…";
  $("#soul").value = "";
  try {
    const [soul, models] = await Promise.all([api(`/api/bots/${name}/soul`), api(`/api/bots/${name}/models`)]);
    $("#soul").value = soul.content || "";
    $("#bot-detail-meta").textContent = `aktuell: ${models.current.provider || "?"} · ${models.current.model || "?"}`;
    const provider = $("#model-provider");
    clear(provider);
    for (const p of models.providers) provider.append(el("option", { value: p.slug, text: p.name || p.slug }));
    const current = models.providers.find((p) => p.slug === models.current.provider);
    if (current) provider.value = current.slug;
    state.models = models;
    fillModelNames();
  } catch (err) {
    $("#bot-detail-meta").textContent = `Fehler: ${err.message}`;
  }
}

function fillModelNames() {
  const provider = $("#model-provider").value;
  const sel = clear($("#model-name"));
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
    toast(res.panel_enabled ? "Bot erstellt" : "Erstellt — Profil erscheint beim nächsten Laden");
    await loadBots();
    await switchBot(name);
  } catch (err) {
    toast(err.message, true);
  }
}

// ---------------------------------------------------------------------------------------
// Cron
// ---------------------------------------------------------------------------------------

async function loadJobs() {
  const list = clear($("#job-list"));
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

// ---------------------------------------------------------------------------------------
// Usage + log
// ---------------------------------------------------------------------------------------

const money = (v) => (v === null || v === undefined ? "—" : `$${Number(v).toFixed(4)}`);
const metric = (label, value) =>
  el("div", { class: "card" }, el("div", { class: "k", text: label }), el("div", { class: "v", text: value }));

async function loadUsage() {
  const cards = clear($("#usage-cards"));
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
    for (const d of u.daily) {
      daily.append(el("div", { class: "card" }, el("div", { class: "k", text: d.day }), el("div", { class: "v sm", text: money(d.cost_usd) })));
    }

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
      prices.append(el("div", { class: "card" }, el("h3", { text: p.name }), el("div", { class: "k", text: `in ${p.prompt ?? "?"} · out ${p.completion ?? "?"}` })));
    }
  } catch (err) {
    clear(cards).append(el("div", { class: "card mut", text: `Usage: ${err.message}` }));
  }
}

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

// ---------------------------------------------------------------------------------------
// Health + run history
// ---------------------------------------------------------------------------------------

/** Tunnel/proxy/gateway dot in the topbar. Silent when healthy, explicit when not. */
async function loadHealth() {
  const node = $("#health");
  if (!node) return;
  try {
    const h = await api("/api/health");
    // Unauthenticated health is only {ok} — no origin detail, so it cannot say more than "up".
    if (!h.authenticated) {
      node.dataset.state = "unknown";
      node.textContent = "…";
      node.title = "Nicht angemeldet";
      return;
    }
    const reachable = Boolean(h.origin?.reachable);
    const gateway = Boolean(h.origin?.gateway);
    node.dataset.state = reachable && gateway ? "ok" : reachable ? "warn" : "down";
    node.textContent = reachable && gateway ? "online" : reachable ? "Gateway aus" : "Tunnel aus";
    node.title = `Proxy ${reachable ? "erreichbar" : "nicht erreichbar"} · Gateway ${gateway ? "läuft" : "aus"}`;
  } catch {
    node.dataset.state = "down";
    node.textContent = "Panel aus";
    node.title = "Das Panel selbst antwortet nicht";
  }
}

/** Runs started from the panel, persisted in the Durable Object. */
async function loadRuns() {
  const list = clear($("#run-list"));
  try {
    const data = await api("/api/runs?limit=50");
    if (!data.runs.length) {
      list.append(el("div", { class: "card mut", text: "Noch keine Runs." }));
      return;
    }
    for (const run of data.runs) {
      const when = run.started_at ? new Date(Number(run.started_at)).toLocaleString("de-DE") : "";
      list.append(
        el(
          "div",
          { class: "card" },
          el("h3", { text: run.input || run.run_id }),
          el("div", { class: "k", text: `${run.bot} · ${run.status}${run.error ? ` · ${run.error}` : ""}` }),
          el("div", { class: "k", text: `${when} · ${run.run_id}` }),
        ),
      );
    }
  } catch (err) {
    list.append(el("div", { class: "card mut", text: `Runs: ${describeError(err).text}` }));
  }
}

// ---------------------------------------------------------------------------------------
// Crew-Runs (read-only) — the view itself lives in crew.js; this is the only hook.
// ---------------------------------------------------------------------------------------

const crewView = createCrewView({ $, el, clear, api, describeError, state });
// ---------------------------------------------------------------------------------------
// Shell: views, drawer, theme, logout
// ---------------------------------------------------------------------------------------

function switchView(view) {
  state.view = view;
  for (const node of document.querySelectorAll(".view")) node.classList.toggle("active", node.id === `view-${view}`);
  for (const btn of document.querySelectorAll(".nav-item")) btn.classList.toggle("active", btn.dataset.view === view);
  if (view === "bots") loadBots().catch(() => {});
  if (view === "cron") loadJobs();
  if (view === "usage") loadUsage();
  if (view === "log") loadLog();
  if (view === "runs") loadRuns();
  if (view === "crew") crewView.open();
  if (window.innerWidth <= 860) closeDrawer();
}

function openDrawer() {
  document.body.classList.add("drawer-open");
}

function closeDrawer() {
  document.body.classList.remove("drawer-open");
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  localStorage.setItem("ai-theme", theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", theme === "dark" ? "#0f1115" : "#ffffff");
}

function showLogin() {
  document.documentElement.dataset.auth = "out";
  const box = $("#login-screen");
  if (box) box.hidden = false;
}

function initTheme() {
  const saved = localStorage.getItem("ai-theme");
  const prefersLight = window.matchMedia?.("(prefers-color-scheme: light)").matches;
  applyTheme(saved || (prefersLight ? "light" : "dark"));
}

async function logout() {
  try {
    await fetch("/auth/logout", { method: "POST", headers: { "x-csrf-token": state.csrf } });
  } catch {
    /* cookie is cleared server-side either way */
  }
  location.href = "/";
}

async function logoutAll() {
  const ok = await confirmAction("Überall abmelden", "Beendet alle Panel-Sitzungen auf allen Geräten.", "Abmelden");
  if (!ok) return;
  try {
    await fetch("/api/logout-all", { method: "POST", headers: { "x-csrf-token": state.csrf } });
  } catch {
    /* ignore */
  }
  showLogin();
}

function wire() {
  $("#btn-new-chat").onclick = newChat;
  $("#btn-send").onclick = send;
  $("#btn-stop").onclick = stopRun;
  $("#input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      send();
    }
  });
  $("#input").addEventListener("input", autosize);

  $("#btn-menu").onclick = openDrawer;
  $("#btn-close-sidebar").onclick = closeDrawer;
  $("#scrim").onclick = closeDrawer;

  $("#side-nav").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-view]");
    if (btn) switchView(btn.dataset.view);
  });
  for (const btn of document.querySelectorAll("button.back")) {
    btn.addEventListener("click", () => switchView("chat"));
  }

  $("#model-picker").onchange = setModelFromPicker;
  $("#btn-theme").onclick = () => {
    applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark");
  };

  $("#logout").onclick = logout;
  $("#btn-logout-all").onclick = logoutAll;

  $("#btn-refresh-sessions").onclick = loadConversations;
  $("#btn-new-bot").onclick = newBot;
  $("#btn-set-model").onclick = setModel;
  $("#btn-save-soul").onclick = saveSoul;
  $("#bot-detail-close").onclick = () => $("#bot-detail").classList.add("hidden");
  $("#model-provider").onchange = fillModelNames;
  $("#btn-new-job").onclick = () => openJobForm(null);
  $("#job-form-cancel").onclick = () => $("#job-form").classList.add("hidden");
  $("#job-form").onsubmit = saveJob;
  $("#btn-usage-refresh").onclick = loadUsage;
  $("#btn-log-refresh").onclick = loadLog;
  $("#btn-runs-refresh").onclick = loadRuns;

  crewView.wire();

  window.addEventListener("resize", () => {
    if (window.innerWidth > 860) closeDrawer();
  });
}

// ---------------------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------------------

async function boot() {
  initTheme();
  let me;
  try {
    me = await api("/api/me");
  } catch (err) {
    if (err?.status !== 401) showLogin();
    return;
  }
  document.documentElement.dataset.auth = "in";
  const login = $("#login-screen");
  if (login) login.hidden = true;
  state.me = me.user;
  state.csrf = me.csrf;
  state.bots = me.bots;

  if (!state.bots.includes(state.bot)) state.bot = state.bots[0] || "";
  $("#cron-bot").textContent = state.bot;

  const who = clear($("#me"));
  if (state.me.avatar) {
    const src = `https://cdn.discordapp.com/avatars/${encodeURIComponent(state.me.id)}/${encodeURIComponent(state.me.avatar)}.png?size=64`;
    who.append(el("img", { src, alt: "" }));
  }
  who.append(el("span", { text: state.me.name || "Nils" }));

  wire();
  renderBotList();
  // newChat() clears the stored conversation id, so remember it first: a reload should reopen
  // the thread the user was in.
  const resume = state.conversationId;
  newChat();
  await loadModels();
  await loadBots().catch(() => {});
  await loadConversations();
  const resumeConv = resume ? state.conversations.find((c) => c.id === resume) : null;
  if (resumeConv) await openConversation(resumeConv);
  await loadHealth();
  setInterval(loadHealth, 20_000);
}

boot();
