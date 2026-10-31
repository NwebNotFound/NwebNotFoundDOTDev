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
  if (bd !== 8 || il || w > 128 || h > 128) throw new Error("unsupported png");
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
// Gesicht + Hut (Hut nur bei 64x64-Skins mit Alpha) → size x size, nearest neighbor
export function faceRgba(skin, size) {
  const { w, data } = skin, sc = w / 64, out = new Uint8Array(size * size * 4), k = size / 8;
  const at = (x, y) => { const i = ((Math.floor(y * sc)) * w + Math.floor(x * sc)) * 4; return data.subarray(i, i + 4); };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const fx = Math.floor(x / k), fy = Math.floor(y / k), f = at(8 + fx, 8 + fy), t = at(40 + fx, 8 + fy), a = t[3] / 255, o = (y * size + x) * 4;
    for (let c = 0; c < 3; c++) out[o + c] = Math.round(t[c] * a + f[c] * (1 - a)); out[o + 3] = 255; }
  return out;
}
// Skin-URL direkt von Mojang (mc-heads liefert für manche Accounts falsche/verrauschte Köpfe)
const MJ_TTL = 6 * 3600;
// Mojang-Lookups (Name→UUID, UUID→Skin) im Cache API zwischenspeichern; 429/Fehler → null (Fallback mc-heads, dann Steve)
async function mojangJson(url, fetcher) {
  const cache = typeof caches !== "undefined" ? caches.default : null, key = new Request(url);
  try { const hit = cache && (await cache.match(key)); if (hit) return hit.status === 204 ? null : await hit.json(); } catch {}
  let r; try { r = await fetcher(url, { cf: { cacheTtl: MJ_TTL, cacheEverything: true } }); } catch { return null; }
  if (r.status === 429 || r.status >= 500) return null; // nicht cachen, später neu versuchen
  const body = r.ok ? await r.text().catch(() => null) : null;
  let j = null; try { j = body ? JSON.parse(body) : null; } catch {}
  if (cache) { try { await cache.put(key, j ? new Response(body, { headers: { "content-type": "application/json", "cache-control": "public, max-age=" + MJ_TTL } }) : new Response(null, { status: 204, headers: { "cache-control": "public, max-age=600" } })); } catch {} }
  return j;
}
async function mojangSkin(id, fetcher) {
  let uuid = id.replace(/-/g, "");
  if (!/^[0-9a-f]{32}$/i.test(uuid)) { const j = await mojangJson("https://api.mojang.com/users/profiles/minecraft/" + encodeURIComponent(id.toLowerCase()), fetcher); uuid = j && j.id; if (!uuid) return null; }
  const j = await mojangJson("https://sessionserver.mojang.com/session/minecraft/profile/" + uuid.toLowerCase(), fetcher); if (!j) return null;
  const t = j.properties?.find((x) => x.name === "textures"); if (!t) return null;
  const u = JSON.parse(atob(t.value)).textures?.SKIN?.url; return u && /^https?:\/\/textures\.minecraft\.net\/texture\/[0-9a-f]+$/.test(u) ? u.replace(/^http:/, "https:") : null;
}
export async function renderHead(name, size, fetcher = fetch) {
  let mj = null; try { mj = await mojangSkin(name, fetcher); } catch {}
  for (const [n, src] of [[name, mj], [name, SKIN_SRC(name)], ["MHF_Steve", SKIN_SRC("MHF_Steve")]]) { if (!src) continue; try { const r = await fetcher(src, { cf: { cacheTtl: 3600, cacheEverything: true } }); if (!r.ok) continue; const s = await decodePng(await r.arrayBuffer()); if (s.w !== 64 && s.w !== 128) continue; return { png: await encodePng(size, size, faceRgba(s, size)), fallback: n !== name }; } catch {} }
  return null;
}
export async function headResponse(req, path, ctx) {
  const m = path.match(/^\/mc-head\/([A-Za-z0-9_]{1,16}|[0-9a-f-]{32,36})(?:\/(\d{1,3}))?(?:\.png)?$/i);
  if (!m) return new Response("Not found", { status: 404 });
  const size = Math.min(256, Math.max(8, Math.round((+m[2] || 64) / 8) * 8));
  const key = new Request(new URL("/mc-head/" + m[1].toLowerCase() + "/" + size, req.url).toString());
  const cache = typeof caches !== "undefined" ? caches.default : null;
  const hit = cache && (await cache.match(key)); if (hit) return hit;
  const r = await renderHead(m[1], size);
  if (!r) return new Response(null, { status: 302, headers: { location: "/mc-icon/v2/player_head", "cache-control": "public, max-age=300" } });
  const res = new Response(r.png, { headers: { "content-type": "image/png", "cache-control": "public, max-age=" + (r.fallback ? 600 : 21600), "x-content-type-options": "nosniff" } });
  if (cache) { const p = cache.put(key, res.clone()); ctx?.waitUntil ? ctx.waitUntil(p) : await p; }
  return res;
}
