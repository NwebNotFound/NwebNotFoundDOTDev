// Spielerköpfe selbst rendern: 8x8 Gesicht (x8,y8) + Hut-Layer (x40,y8) aus dem 64x64-Skin,
// nearest-neighbor hochskaliert, im Worker-Cache. Fallback: Steve.
const SKIN_SRC = (n) => "https://mc-heads.net/skin/" + encodeURIComponent(n);
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
async function zlib(data, inflate) { const s = new Blob([data]).stream().pipeThrough(inflate ? new DecompressionStream("deflate") : new CompressionStream("deflate")); return new Uint8Array(await new Response(s).arrayBuffer()); }
// Minimaler PNG-Decoder (8 bit, RGBA/RGB/Palette/Grau, nicht interlaced) → RGBA
export async function decodePng(buf) {
  const b = new Uint8Array(buf), dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (dv.getUint32(0) !== 0x89504e47) throw new Error("no png");
  let p = 8, w = 0, h = 0, bd = 0, ct = 0, il = 0, pal = null, trns = null; const idat = [];
  while (p < b.length) { const len = dv.getUint32(p), type = String.fromCharCode(...b.subarray(p + 4, p + 8)), d = b.subarray(p + 8, p + 8 + len);
    if (type === "IHDR") { w = dv.getUint32(p + 8); h = dv.getUint32(p + 12); bd = d[8]; ct = d[9]; il = d[12]; }
    else if (type === "PLTE") pal = d; else if (type === "tRNS") trns = d; else if (type === "IDAT") idat.push(d); else if (type === "IEND") break;
    p += 12 + len; }
  if (bd !== 8 || il || w > 512 || h > 512) throw new Error("unsupported png");
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ct]; if (!ch) throw new Error("bad ct");
  const raw = await zlib(new Uint8Array(await new Blob(idat).arrayBuffer()), true), st = w * ch, px = new Uint8Array(st * h);
  for (let y = 0; y < h; y++) { const f = raw[y * (st + 1)], s = raw.subarray(y * (st + 1) + 1, (y + 1) * (st + 1)), o = y * st;
    for (let x = 0; x < st; x++) { const a = x >= ch ? px[o + x - ch] : 0, u = y ? px[o - st + x] : 0, c = x >= ch && y ? px[o - st + x - ch] : 0; let v = s[x];
      if (f === 1) v += a; else if (f === 2) v += u; else if (f === 3) v += (a + u) >> 1; else if (f === 4) { const q = a + u - c, pa = Math.abs(q - a), pb = Math.abs(q - u), pc = Math.abs(q - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? u : c; }
      px[o + x] = v; } }
  const out = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) { let r, g, bl, al = 255;
    if (ct === 6) [r, g, bl, al] = px.subarray(i * 4, i * 4 + 4); else if (ct === 2) [r, g, bl] = px.subarray(i * 3, i * 3 + 3);
    else if (ct === 3) { const k = px[i]; r = pal[k * 3]; g = pal[k * 3 + 1]; bl = pal[k * 3 + 2]; al = trns && k < trns.length ? trns[k] : 255; }
    else if (ct === 0) r = g = bl = px[i]; else { r = g = bl = px[i * 2]; al = px[i * 2 + 1]; }
    out.set([r, g, bl, al], i * 4); }
  return { w, h, data: out };
}
export async function encodePng(w, h, rgba) {
  const raw = new Uint8Array((w * 4 + 1) * h); for (let y = 0; y < h; y++) raw.set(rgba.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1);
  const chunk = (t, d) => { const c = new Uint8Array(12 + d.length), v = new DataView(c.buffer); v.setUint32(0, d.length); c.set(new TextEncoder().encode(t), 4); c.set(d, 8); v.setUint32(8 + d.length, crc32(c.subarray(4, 8 + d.length))); return c; };
  const ih = new Uint8Array(13), iv = new DataView(ih.buffer); iv.setUint32(0, w); iv.setUint32(4, h); ih.set([8, 6, 0, 0, 0], 8);
  return new Uint8Array(await new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ih), chunk("IDAT", await zlib(raw, false)), chunk("IEND", new Uint8Array())]).arrayBuffer());
}
// Gültige Skin-Formate: 64x64, Legacy 64x32 und HD (128/256/512, quadratisch oder 2:1)
export const skinOk = (s) => s && s.w >= 64 && s.w <= 512 && s.w % 64 === 0 && (s.h === s.w || s.h === s.w / 2);
// Gesicht + Hut → size x size, nearest neighbor. Wie im Spiel: Legacy-Skins (64x32) mit komplett deckender
// Hut-Fläche bekommen keinen Hut (Notch-Transparenz-Hack), sonst würde eine schwarze/bunte Füllfläche das Gesicht verdecken.
export function faceRgba(skin, size) {
  const { w, h, data } = skin, sc = w / 64, out = new Uint8Array(size * size * 4), k = size / 8;
  const at = (x, y) => { const i = ((Math.floor(y * sc)) * w + Math.floor(x * sc)) * 4; return data.subarray(i, i + 4); };
  let hat = true;
  if (h === w / 2) { let opaque = true; for (let y = 0; y < 16 && opaque; y++) for (let x = 32; x < 64; x++) if (at(x, y)[3] < 128) { opaque = false; break; } if (opaque) hat = false; }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const fx = Math.floor(x / k), fy = Math.floor(y / k), f = at(8 + fx, 8 + fy), t = at(40 + fx, 8 + fy), a = hat ? t[3] / 255 : 0, o = (y * size + x) * 4;
    for (let c = 0; c < 3; c++) out[o + c] = Math.round(t[c] * a + f[c] * (1 - a)); out[o + 3] = 255; }
  return out;
}
// Skin-URL direkt von Mojang (mc-heads liefert für manche Accounts falsche/verrauschte Köpfe)
const MJ_TTL = 6 * 3600;
// Begrenzter Retry für Mojang und mc-heads: max. 2 Versuche, 250 ms Backoff. Kein Retry bei 429 mit Retry-After.
export const RETRY_MS = { v: 250 };
export async function fetchRetry(fetcher, url, init) {
  let r = null;
  for (let i = 0; i < 2; i++) {
    if (i) await new Promise((ok) => setTimeout(ok, RETRY_MS.v));
    try { r = await fetcher(url, init); } catch { r = null; }
    if (r && r.status < 500 && r.status !== 429) return r;
    if (r && r.status === 429 && r.headers.get("retry-after")) return r;
  }
  return r;
}
// Mojang-Lookups (Name→UUID, UUID→Skin) im Cache API zwischenspeichern; 429/Fehler → null (Fallback mc-heads, dann Steve)
async function mojangJson(url, fetcher) {
  const cache = typeof caches !== "undefined" ? caches.default : null, key = new Request(url);
  try { const hit = cache && (await cache.match(key)); if (hit) return hit.status === 204 ? null : await hit.json(); } catch {}
  // Mojang liefert sporadisch 502/429: einmal neu versuchen; Edge-Cache nur für 2xx (Fehler nie lange cachen)
  const r = await fetchRetry(fetcher, url, { cf: { cacheTtlByStatus: { "200-299": MJ_TTL, "404": 60, "400-599": 0 } } });
  if (!r || r.status === 429 || r.status >= 500) return null; // nicht cachen, später neu versuchen
  const body = r.ok ? await r.text().catch(() => null) : null;
  let j = null; try { j = body ? JSON.parse(body) : null; } catch {}
  if (cache) { try { await cache.put(key, j ? new Response(body, { headers: { "content-type": "application/json", "cache-control": "public, max-age=" + MJ_TTL } }) : new Response(null, { status: 204, headers: { "cache-control": "public, max-age=600" } })); } catch {} }
  return j;
}
async function mojangSkin(id, fetcher) {
  let uuid = id.replace(/-/g, "");
  if (!/^[0-9a-f]{32}$/i.test(uuid)) { const nm = encodeURIComponent(id.toLowerCase()); const j = (await mojangJson("https://api.minecraftservices.com/minecraft/profile/lookup/name/" + nm, fetcher)) || (await mojangJson("https://api.mojang.com/users/profiles/minecraft/" + nm, fetcher)); uuid = j && j.id; if (!uuid) return null; }
  const j = await mojangJson("https://sessionserver.mojang.com/session/minecraft/profile/" + uuid.toLowerCase(), fetcher); if (!j) return null;
  const t = j.properties?.find((x) => x.name === "textures"); if (!t) return null;
  const u = JSON.parse(atob(t.value)).textures?.SKIN?.url; return u && /^https?:\/\/textures\.minecraft\.net\/texture\/[0-9a-f]+$/.test(u) ? u.replace(/^http:/, "https:") : null;
}
// Skin-Quellen in fester Reihenfolge:
//  a) skin_url aus dem Ingest (stats.skin_url oder mc_links.skin_url, nur textures.minecraft.net) → echt
//  b) Mojang per UUID aus mc_links (sonst per Name) → echt
//  c) minotar.net/skin/<uuid> – wenn Mojang keinen ladbaren Skin liefert; echt nur, wenn kein Default-Skin
//  d) mc-heads (liefert für manche Accounts nur Steve) → Fallback
//  e) Steve → Fallback
// Echt = 6 h Cache, Fallback = 10 min.
const TEX_RE = /^https:\/\/textures\.minecraft\.net\/texture\/[0-9a-f]{16,128}$/;
export const validSkinUrl = (u) => (typeof u === "string" && TEX_RE.test(u.replace(/^http:/, "https:")) ? u.replace(/^http:/, "https:") : null);
const MINOTAR = (id) => "https://minotar.net/skin/" + encodeURIComponent(id);
// SHA-1 der RGBA-Pixel bekannter Default-Skins (Mojang Steve/Alex, minotar- und mc-heads-Steve)
export const DEFAULT_SKINS = new Set(["18b1728ad94f13571d903b913f5e58d47cee1b0a", "55955c2efee5c28a12cac80d271d83cbe19cd182", "24aca6a62fd30965a6e4f212f36b74adc91ac1fc", "ee5617598fb1d9efee0c63797534e1184d9de91b"]);
const sha1hex = async (u8) => [...new Uint8Array(await crypto.subtle.digest("SHA-1", u8))].map((x) => x.toString(16).padStart(2, "0")).join("");
// Spieler aus D1 (nur lesen): UUID und optionale skin_url. Fehlende Tabellen/Spalten/DB → {}
export async function playerSkinInfo(env, id) {
  if (!env?.DB) return {};
  try {
    const k = id.toLowerCase().replace(/-/g, "");
    const r = await env.DB.prepare("SELECT l.*, s.stats AS stats FROM mc_links l LEFT JOIN mc_player_stats s ON s.mc_uuid = l.mc_uuid WHERE lower(l.mc_name) = ? OR lower(replace(l.mc_uuid, '-', '')) = ? LIMIT 1").bind(k, k).first();
    if (!r) return {};
    let st = {}; try { st = typeof r.stats === "string" ? JSON.parse(r.stats) : r.stats || {}; } catch {}
    const uuid = String(r.mc_uuid || "").replace(/-/g, "").toLowerCase();
    return { uuid: /^[0-9a-f]{32}$/.test(uuid) ? uuid : null, skinUrl: validSkinUrl(st?.skin_url) || validSkinUrl(r.skin_url) };
  } catch { return {}; }
}
async function loadSkin(src, fetcher) {
  try { const r = await fetchRetry(fetcher, src, { cf: { cacheTtl: 3600, cacheEverything: true } }); if (!r || !r.ok) return null; const b = await r.arrayBuffer(); const s = await decodePng(b); return skinOk(s) ? { b, s } : null; } catch { return null; }
}
// → { b: PNG-Bytes, s: dekodiert, real: bool, src: "ingest"|"mojang"|"minotar"|"mc-heads"|"steve" } oder null
export async function resolveSkin(id, env, fetcher = fetch) {
  const info = await playerSkinInfo(env, id), who = info.uuid || id;
  if (info.skinUrl) { const x = await loadSkin(info.skinUrl, fetcher); if (x) return { ...x, real: true, src: "ingest" }; }
  let mj = null; try { mj = await mojangSkin(who, fetcher); } catch {}
  if (mj) { const x = await loadSkin(mj, fetcher); if (x) return { ...x, real: true, src: "mojang" }; }
  // minotar nach jedem erfolglosen Mojang-Versuch (keine URL, Fehler oder Download/PNG kaputt)
  { const x = await loadSkin(MINOTAR(who), fetcher); if (x) { const real = !DEFAULT_SKINS.has(await sha1hex(x.s.data)); if (real) return { ...x, real, src: "minotar" }; } }
  for (const [src, n] of [[SKIN_SRC(id), "mc-heads"], [SKIN_SRC("MHF_Steve"), "steve"]]) { const x = await loadSkin(src, fetcher); if (x) return { ...x, real: false, src: n }; }
  return null;
}
const CC = (real) => "public, max-age=" + (real ? 21600 : 600);
// Letzter Ausweg ohne Netz: der mitgelieferte Default-Kopf (public/mc/heads/steve.png, gebacken mit
// derselben Gesichts-Crop-Logik wie die Mob-Köpfe — scripts/gen-steve-head.py). Vorher lief dieser
// Fall über /mc-icon/v2/player_head → mc-heads.net, also über das Netz: ohne Verbindung zu den
// Skin-Quellen blieb das <img> kaputt, jeder Avatar (auch der eines verknüpften Namens) fiel auf
// MHF_Steve zurück. Jetzt antwortet /mc-head/<name> immer mit einem echten PNG.
async function localHeadAsset(env, req) {
  try {
    if (!env?.ASSETS) return null;
    const url = new URL("/mc/heads/steve.png", req.url).toString();
    const r = await env.ASSETS.fetch(new Request(url, { headers: { accept: "image/png" } }));
    if (!r || !r.ok) return null;
    const b = await r.arrayBuffer();
    if (!b || b.byteLength < 100) return null;
    return new Response(b, {
      status: 200,
      headers: {
        "content-type": "image/png", "cache-control": "public, max-age=600",
        "x-skin-source": "asset:steve", "x-content-type-options": "nosniff",
      },
    });
  } catch { return null; }
}
export async function renderHead(name, size, fetcher = fetch, env = null) {
  const k = await resolveSkin(name, env, fetcher); if (!k) return null;
  return { png: await encodePng(size, size, faceRgba(k.s, size)), fallback: !k.real, src: k.src };
}
export async function headResponse(req, path, ctx, env = null, fetcher = fetch) {
  const m = path.match(/^\/mc-head\/([A-Za-z0-9_]{1,16}|[0-9a-f-]{32,36})(?:\/(\d{1,3}))?(?:\.png)?$/i);
  if (!m) return new Response("Not found", { status: 404 });
  const size = Math.min(256, Math.max(8, Math.round((+m[2] || 64) / 8) * 8));
  const key = new Request(new URL("/mc-head/v5/" + m[1].toLowerCase() + "/" + size, req.url).toString());
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const hit = cache && (await cache.match(key)); if (hit) return hit;
  const r = await renderHead(m[1], size, fetcher, env);
  if (!r) {
    // Ohne erreichbare Skin-Quelle: eigener Default-Kopf statt Weiterleitung ins Netz.
    const local = await localHeadAsset(env, req);
    if (local) return local;
    return new Response(null, { status: 302, headers: { location: "/mc-icon/v2/player_head", "cache-control": "public, max-age=300" } });
  }
  const res = new Response(r.png, { headers: { "content-type": "image/png", "cache-control": CC(!r.fallback), "x-skin-source": r.src, "x-content-type-options": "nosniff" } });
  if (cache) { const p = cache.put(key, res.clone()); ctx?.waitUntil ? ctx.waitUntil(p) : await p; }
  return res;
}
// Roh-Skin same-origin für skinview3d (CSP: img/connect nur 'self'). Nur validierte PNGs (siehe skinOk), Fallback Steve.
export async function skinResponse(req, path, ctx, env = null, fetcher = fetch) {
  const m = path.match(/^\/mc-skin\/([A-Za-z0-9_]{1,16}|[0-9a-f-]{32,36})(?:\.png)?$/i);
  if (!m) return new Response("Not found", { status: 404 });
  const key = new Request(new URL("/mc-skin/v3/" + m[1].toLowerCase(), req.url).toString());
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const hit = cache && (await cache.match(key)); if (hit) return hit;
  const k = await resolveSkin(m[1], env, fetcher);
  if (!k) return new Response("Not found", { status: 404, headers: { "cache-control": "public, max-age=300" } });
  const res = new Response(k.b, { headers: { "content-type": "image/png", "cache-control": CC(k.real), "x-skin-source": k.src, "x-content-type-options": "nosniff" } });
  if (cache) { const p = cache.put(key, res.clone()); ctx?.waitUntil ? ctx.waitUntil(p) : await p; }
  return res;
}
