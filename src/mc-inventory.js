/** Inventar normalisieren + HTML (Profil, Tests). Minecraft-Slots: 0–8 Hotbar, 9–35 Haupt, 36–39 Rüstung, 40 Nebenhand. */
const clip = (v, n = 48) => String(v ?? "").slice(0, n);

export function normInv(v) {
  if (v && !Array.isArray(v) && typeof v === "object") {
    const inner = v.items ?? v.contents ?? v.slots ?? v.inventory;
    v = Array.isArray(inner) ? inner : Object.entries(inner && typeof inner === "object" ? inner : v).map(([k, x]) => (x && typeof x === "object" ? { slot: k, ...x } : { slot: k, item: x }));
  }
  if (!Array.isArray(v)) return null;
  const out = [];
  for (const i of v.slice(0, 64)) {
    if (i == null) continue;
    const raw = typeof i === "string" ? i : i.item ?? i.id ?? i.type ?? i.material ?? i.name;
    const item = clip(String(raw ?? "").toLowerCase().replace(/^minecraft:/, ""), 48);
    if (!item || /^(cave_|void_)?air$/.test(item)) continue;
    const c = typeof i === "object" ? +(i.count ?? i.amount ?? i.qty ?? i.quantity ?? 1) : 1;
    const sl = typeof i === "object" ? +(i.slot ?? i.index ?? NaN) : NaN;
    const e = { item, count: Math.max(1, Math.min(999, Math.floor(Number.isFinite(c) ? c : 1))) };
    if (Number.isInteger(sl) && sl >= 0 && sl <= 40) e.slot = sl;
    const dn = typeof i === "object" ? i.display_name ?? i.custom_name : null;
    if (typeof dn === "string" && dn) e.name = clip(dn, 40);
    out.push(e);
    if (out.length >= 41) break;
  }
  return out;
}

/** Slot-Index → Item (null = leer). Legacy ohne slot: füllt 0,1,2,… */
export function inventorySlotMap(items) {
  const L = Array.isArray(items) ? items.filter((i) => i && i.item) : [];
  const m = {};
  const hasSlot = L.some((i) => i.slot != null);
  if (hasSlot) {
    for (const i of L) {
      if (i.slot != null && i.slot >= 0 && i.slot <= 40) m[i.slot] = i;
    }
    return m;
  }
  const order = [];
  for (let s = 0; s <= 8; s++) order.push(s);
  for (let s = 9; s <= 35; s++) order.push(s);
  for (let s = 36; s <= 40; s++) order.push(s);
  L.forEach((item, idx) => {
    if (order[idx] != null) m[order[idx]] = item;
  });
  return m;
}

export function renderInventoryCard(inv) {
  const L = Array.isArray(inv) ? inv.filter((i) => i && i.item) : [];
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ic = (i) => `<img alt="" loading="lazy" src="/mc-icon/${encodeURIComponent(i.item)}" onerror="this.onerror=null;this.src='/mc-icon/paper'">`;
  const nmi = (i) => i.name || String(i.item).replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const slot = (i, extraClass = "", aria = "") =>
    `<div class="ivs${i ? "" : " e"}${extraClass}"${aria ? ` aria-label="${esc(aria)}"` : ""}${i ? ` title="${esc(nmi(i))}${i.count > 1 ? " ×" + i.count : ""}"` : ""}>${i ? ic(i) + (i.count > 1 ? `<b>${i.count}</b>` : "") : ""}</div>`;
  const map = inventorySlotMap(L);
  const main = Array.from({ length: 27 }, (_, k) => slot(map[k + 9] ?? null)).join("");
  const hot = Array.from({ length: 9 }, (_, k) => slot(map[k] ?? null)).join("");
  const armor = [
    { s: 39, label: "Helm" },
    { s: 38, label: "Brust" },
    { s: 37, label: "Beine" },
    { s: 36, label: "Stiefel" },
  ]
    .map(({ s, label }) => slot(map[s] ?? null, " iv-arm", label))
    .join("");
  const offInner = slot(map[40] ?? null, "", "Nebenhand");
  const pane = `<div class="iv-pane"><div class="iv-arm">${armor}</div><div class="iv-stack"><div class="ivg">${main}</div><div class="ivg hot">${hot}</div></div><div class="iv-off">${offInner}</div></div>`;
  let body;
  if (!L.length) {
    body = `<div class="iv-empty">${pane}<p><b>Noch kein Inventar synchronisiert.</b><br><span class="mut">Sobald du auf dem Survival-Server warst, erscheint hier dein Inventar.</span></p></div>`;
  } else {
    body = pane;
  }
  return '<div class="card inv"><h3>Inventar</h3><p class="mut" style="font-size:.8rem;margin-top:0">Nur für dich sichtbar' + (L.length ? ' · ' + L.length + ' Stapel' : '') + '.</p>' + body + '</div>';
}
