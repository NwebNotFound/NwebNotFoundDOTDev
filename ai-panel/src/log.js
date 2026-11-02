// Request log: structured JSON to Workers Logs plus a bounded in-memory ring for the UI.
// Never records bodies, cookies, tokens or upstream credentials.

const ring = [];
const RING_MAX = 200;

const SECRET_KEYS = /secret|token|key|authorization|cookie|password/i;

function scrub(value, depth = 0) {
  if (depth > 3 || value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => scrub(v, depth + 1));
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (SECRET_KEYS.test(k)) continue;
      out[k] = scrub(v, depth + 1);
    }
    return out;
  }
  if (typeof value === "string") return value.length > 300 ? `${value.slice(0, 300)}…` : value;
  return value;
}

export function record(entry) {
  const row = {
    ts: new Date().toISOString(),
    method: entry.method,
    path: entry.path,
    status: entry.status,
    ms: Math.round(entry.ms || 0),
    bot: entry.bot || null,
    user: entry.user ? String(entry.user).slice(-6) : null,
    note: entry.note || null,
  };
  ring.push(row);
  if (ring.length > RING_MAX) ring.shift();
  try {
    console.log(JSON.stringify({ ai_panel: scrub(row) }));
  } catch {
    // logging must never break a request
  }
  return row;
}

export function recent(limit = 50) {
  const n = Math.max(1, Math.min(RING_MAX, Number(limit) || 50));
  return ring.slice(-n).reverse();
}

export function clear() {
  ring.length = 0;
}
