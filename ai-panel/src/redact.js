// Entfernt bekannte Geheimnisse aus Text, auch wenn sie über Chunk-Grenzen laufen.
export function redactText(s, secrets) {
  let out = String(s);
  for (const secret of secrets) {
    if (typeof secret === "string" && secret.length >= 8) out = out.split(secret).join("[redacted]");
  }
  return out;
}

export function createRedactor(secrets) {
  const needles = (secrets || []).filter((s) => typeof s === "string" && s.length >= 8);
  const tail = needles.reduce((m, s) => Math.max(m, s.length - 1), 0);
  let pending = "";
  const take = (all) => {
    pending = redactText(pending, needles);
    const cut = all ? pending.length : Math.max(0, pending.length - tail);
    const part = pending.slice(0, cut);
    pending = pending.slice(part.length);
    return part;
  };
  return {
    push(text) { pending += text; return take(false); },
    end() { return take(true); },
  };
}
