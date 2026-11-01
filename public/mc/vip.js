// VIP-Panel. Freitext immer über MC.E. Keine Inline-Styles. Profil-Link ist fest, nicht aus der API.
(() => {
  const { E, NF, get } = window.MC;
  const T = document.getElementById("vip");
  if (!T) return;
  const ICON = /^[a-z0-9_]{1,48}$/;
  const NAME = /^[A-Za-z0-9_]{1,16}$/;
  const COLOR = /^[0-9a-f]$/;
  const RANKL = { vip: "VIP", mvp: "MVP", builder: "Builder", admin: "Admin", default: "Spieler" };
  const slot = (id, big) => {
    const i = ICON.test(id) ? id : "paper";
    return `<span class="slot${big ? " big" : ""}"><img alt="" width="${big ? 40 : 28}" height="${big ? 40 : 28}" src="/mc-icon/v2/${i}"></span>`;
  };
  const up = (t) => {
    t = Math.max(0, Math.floor(+t || 0));
    const d = Math.floor(t / 86400), h = Math.floor((t % 86400) / 3600), m = Math.floor((t % 3600) / 60);
    return d ? d + " T " + h + " Std" : h ? h + " Std " + m + " Min" : m + " Min";
  };
  const badge = (rank, color) => RANKL[rank] && COLOR.test(color || "") ? `<span class="rk rk-${color}">${RANKL[rank]}</span>` : "";
  const perks = (list) => `<ul class="vip-perks">${(list || []).map((p) => `<li>${slot(p.icon)}<span><b>${E(p.title)}</b><span class="mut">${E(p.text)}</span></span></li>`).join("")}</ul>`;
  const cards = (cat) => `<div class="vip-ranks">${(cat || []).map((c) => {
    const rk = c.rank === "mvp" ? "mvp" : c.rank === "vip" ? "vip" : "";
    if (!rk) return "";
    return `<article class="g vip-card is-${rk}${c.yours ? " is-you" : ""}"><header><span class="vip-card-h">${slot(c.icon)}<h3 class="hub-h2">${E(c.label || RANKL[rk])}</h3></span>${c.yours ? '<span class="tag ts">Dein Rang</span>' : ""}</header>${perks(c.perks)}</article>`;
  }).join("")}</div>`;
  const worlds = (w) => {
    const head = `<section class="vip-block" id="vip-worlds"><h2 class="hub-h2">VIP-Welten</h2>`;
    const slots = w && !w.placeholder && Array.isArray(w.slots) ? w.slots.slice(0, 3) : [];
    if (!slots.length) return `${head}<div class="g vip-soon">${slot("barrier", true)}<p class="tag tw">bald verfügbar</p><p class="mut">Bis zu drei VIP-Welten sind geplant. Sobald der Server sie meldet, steht hier der Status.</p></div></section>`;
    const html = slots.map((s) => {
      const tag = s.online ? '<span class="tag ts">online</span>' : '<span class="tag tr">offline</span>';
      const max = s.max == null || s.max === "" || !Number.isFinite(+s.max) ? "" : " / " + NF(s.max);
      const tps = s.tps == null || s.tps === "" || !Number.isFinite(+s.tps) ? "" : " · " + NF(s.tps, 1) + " TPS";
      return `<article class="g vip-world">${slot(s.online ? "grass_block" : "barrier")}<div><b>${E(s.label)||"VIP-Welt"}</b>${tag}<p class="mut">${NF(s.players || 0)}${max} Spieler${tps}</p></div></article>`;
    }).join("");
    return `${head}<div class="vip-worlds">${html}</div></section>`;
  };
  const cell = (icon, k, v) => `<div class="g vip-stat">${slot(icon)}<span class="k">${k}</span><b class="v tnum">${v}</b></div>`;
  const panel = (d) => {
    const p = d.player || {};
    const name = NAME.test(p.name || "") ? p.name : "";
    const head = name ? `<span class="slot big"><img alt="" width="40" height="40" src="/mc-head/${encodeURIComponent(name)}/64?v=5"></span>` : slot("player_head", true);
    const st = d.stats || {};
    const money = st.money == null ? "–" : NF(st.money) + " CP";
    const pub = name ? `<a class="btn sec" href="/spieler/${encodeURIComponent(name)}">Öffentliches Profil</a>` : "";
    return `<div class="g vip-me">${head}<div><p class="eyb">Dein Rang</p><h2 class="hub-h2">${E(name || "Spieler")} ${badge(p.rank, p.color)}</h2><p class="vip-acts"><a class="btn" href="/profile">Zum Profil</a>${pub}</p></div></div><h2 class="hub-h2">Vorteile</h2>${cards(d.catalog)}<p class="mut vip-note">${E(d.note || "")}</p>${worlds(d.worlds)}<section class="vip-block" id="vip-stats"><h2 class="hub-h2">Deine Stats</h2><div class="vip-stats">${cell("gold_ingot", "Kontostand", money)}${cell("clock", "Spielzeit", st.playtime == null ? "–" : up(st.playtime))}${cell("iron_sword", "Spieler-Kills", st.kills == null ? "–" : NF(st.kills))}${cell("skeleton_skull", "Tode", st.deaths == null ? "–" : NF(st.deaths))}${cell("iron_pickaxe", "Blöcke", st.blocks_mined == null ? "–" : NF(st.blocks_mined))}</div></section>`;
  };
  const gate = (d) => {
    const login = "https://nwebnotfound.dev/auth/discord/login?next=" + encodeURIComponent(location.href);
    let msg;
    if (d.reason === "login") msg = `<p class="mut">Melde dich mit Discord an. Das Panel gibt es für verknüpfte Spieler mit dem Rang VIP oder MVP.</p><p class="vip-acts"><a class="btn discord" href="${login}">Mit Discord anmelden</a></p>`;
    else if (d.reason === "link") msg = `<p class="mut">Verknüpfe deinen Minecraft-Account im Discord mit <code>/link</code> und bestätige ihn. Danach prüft diese Seite deinen Rang.</p><p class="vip-acts"><a class="btn sec" href="/profile">Zum Profil</a></p>`;
    else if (d.reason === "error") msg = `<p class="mut">Das Panel konnte nicht geladen werden. Versuch es gleich noch einmal.</p>`;
    else {
      const own = d.own_rank && RANKL[d.own_rank.rank] ? " Dein Rang ist " + E(RANKL[d.own_rank.rank]) + "." : "";
      msg = `<p class="mut">Das Panel ist für die Ränge VIP und MVP.${own} Builder und Admin sehen die Übersicht, nicht das eigene Panel.</p><p class="vip-acts"><a class="btn sec" href="/profile">Zum Profil</a></p>`;
    }
    return `<div class="vip-gate">${msg}</div><h2 class="hub-h2">Vorteile</h2>${cards(d.catalog)}<p class="mut vip-note">${E(d.note || "")}</p>${worlds(null)}`;
  };
  (async () => {
    let d;
    try { d = await get("/api/mc-vip"); } catch { d = { access: false, reason: "error", catalog: [], note: "" }; }
    T.innerHTML = d && d.access ? panel(d) : gate(d || {});
  })();
})();
