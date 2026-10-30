/** Profil-Inventar (Browser). Logik gespiegelt in src/mc-inventory.js für Tests/API. */
(function () {
  function inventorySlotMap(items) {
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

  function renderInventoryCard(inv) {
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
    return (
      '<div class="card inv"><h3>Inventar</h3><p class="mut" style="font-size:.8rem;margin-top:0">Nur für dich sichtbar' +
      (L.length ? " · " + L.length + " Stapel" : "") +
      ".</p>" +
      body +
      "</div>"
    );
  }

  window.MCInv = renderInventoryCard;
})();
