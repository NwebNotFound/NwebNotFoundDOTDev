// Bot-Namen. Nur diese Form darf in argv, Pfade und URLs.
export const BOT_NAME = /^[a-z0-9-]{1,32}$/;

export function isBotName(v) {
  return typeof v === "string" && BOT_NAME.test(v);
}

export function keyEnvName(name) {
  if (!isBotName(name)) return null;
  return "HERMES_KEY_" + name.toUpperCase().replace(/-/g, "_");
}

export function cleanSoul(v) {
  let t = typeof v === "string" ? v : "";
  t = t.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").replace(/\p{Cf}/gu, "");
  return t.trim().slice(0, 4000);
}
