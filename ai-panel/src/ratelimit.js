// Per-isolate sliding-window rate limiter.
// Workers isolates are per-colo and short-lived, so this is best-effort abuse control, not a
// billing guarantee. It stops a runaway tab or a scripted loop cold, which is the actual risk.

const buckets = new Map();
const MAX_KEYS = 5000;

export const LIMITS = {
  chat: { max: 20, window: 60 },
  api: { max: 120, window: 60 },
  auth: { max: 10, window: 60 },
};

export function take(bucketName, id, now = Date.now()) {
  const limit = LIMITS[bucketName] || LIMITS.api;
  const key = `${bucketName}:${id}`;
  let entry = buckets.get(key);
  if (!entry || entry.reset <= now) {
    entry = { count: 0, reset: now + limit.window * 1000 };
    buckets.set(key, entry);
  }
  entry.count += 1;
  if (buckets.size > MAX_KEYS) {
    for (const [k, v] of buckets) if (v.reset <= now) buckets.delete(k);
    if (buckets.size > MAX_KEYS) buckets.clear();
  }
  const remaining = Math.max(0, limit.max - entry.count);
  return {
    ok: entry.count <= limit.max,
    remaining,
    retryAfter: Math.max(1, Math.ceil((entry.reset - now) / 1000)),
    limit: limit.max,
  };
}

export function reset() {
  buckets.clear();
}
