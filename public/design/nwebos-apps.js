/* NwebOS app windows: behaviour inside windows (blog filter, reader, reactions, reading progress, player, trash,
   profile). Markup: src/nwebos-apps.js, design: mockups/nwebos/apps. Delegated listeners, no libraries, no idle work:
   the only timers run while a button feedback or a debounce is pending. */
(function () {
  "use strict";
  var $ = function (s, el) { return (el || document).querySelector(s); }, $$ = function (s, el) { return [].slice.call((el || document).querySelectorAll(s)); };
  var RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var EN = document.documentElement.lang === "en";
  var T = function (de, en) { return EN ? en : de; };
  var CSS_PROGRESS = window.CSS && CSS.supports && CSS.supports("animation-timeline: scroll()");
  function post(url, body) { return fetch(url, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { s: r.status, j: j }; }); }); }

  function filter(bl) {
    var cat = ($(".cats .on", bl) || {}).dataset ? $(".cats .on", bl).dataset.cat : "", tagB = $(".tagc .on", bl), tag = tagB ? tagB.dataset.tag : "", monB = $(".arch .on", bl), mon = monB ? monB.dataset.month : "", q = (($("[data-bq]", bl) || {}).value || "").trim().toLowerCase();
    var n = 0;
    $$("[data-q]", bl).forEach(function (it) { var ok = (!cat || it.dataset.cat === cat) && (!mon || it.dataset.m === mon) && (!tag || it.dataset.q.indexOf(tag) >= 0) && (!q || it.dataset.q.indexOf(q) >= 0); it.hidden = !ok; if (ok) n++; });
    var nh = $(".nohit", bl); if (nh) nh.hidden = n > 0;
  }
  // reader: progress bar (CSS scroll timeline where supported, else this passive listener), TOC, saved progress
  function initReader(rd) {
    var sc = $(".rscroll", rd), bar = $(".prog i", rd), toc = $$(".toc [data-jump]", rd), key = rd.dataset.read, best = 0, sendT = 0, sent = 0;
    if (!sc) return;
    var k = key && (key.indexOf("writing:") === 0 ? key : "blog:" + key);
    var upd = function () {
      var max = sc.scrollHeight - sc.clientHeight, p = max > 0 ? Math.min(1, sc.scrollTop / max) : 0;
      if (!CSS_PROGRESS && bar) bar.style.setProperty("--p", p);
      if (toc.length) { var cur = toc[0]; toc.forEach(function (b) { var h = rd.querySelector("#" + CSS.escape(b.dataset.jump)); if (h && h.offsetTop - sc.offsetTop - 40 <= sc.scrollTop) cur = b; }); if (max > 0 && sc.scrollTop >= max - 2) cur = toc[toc.length - 1];   /* at the end: the last section, even when it can't reach the top */ toc.forEach(function (b) { b.classList.toggle("on", b === cur); }); }
      var pct = Math.round(p * 100);
      if (k && window.__me && window.__me.user && pct >= sent + 10) { best = Math.max(best, pct); clearTimeout(sendT); sendT = setTimeout(function () { sent = best; post("/api/blog/progress", { key: k, pct: best }); }, 2500); }
    };
    sc.addEventListener("scroll", upd, { passive: true }); upd();
    if (rd.classList.contains("rbook") && document.documentElement.hasAttribute("data-night")) { rd.classList.add("npaper"); var pb = $("[data-paper]", rd); if (pb) pb.setAttribute("aria-pressed", "true"); }
  }
  function initWin(w) { $$(".rd", w).forEach(initReader); }
  new MutationObserver(function (ms) { ms.forEach(function (m) { [].forEach.call(m.addedNodes, function (n) { if (n.classList && n.classList.contains("win")) initWin(n); }); }); }).observe($("#wins"), { childList: true });
  document.addEventListener("nwebos:content", function (e) { initWin(e.detail); });   /* a window got new content (another post) */

  document.addEventListener("click", function (e) {
    var t = e.target, win = t.closest(".win"), b;
    if ((b = t.closest("[data-pane]"))) {
      var scope = win || document, grp = b.closest("nav, ul") || scope, names = $$("[data-pane]", grp).map(function (x) { return x.dataset.pane; });
      $$("[data-pane]", grp).forEach(function (x) { x.classList.toggle("on", x === b); });
      $$("[data-panel]", scope).filter(function (s) { return names.indexOf(s.dataset.panel) >= 0; }).forEach(function (s) { s.hidden = s.dataset.panel !== b.dataset.pane; });
      return;
    }
    if ((b = t.closest(".cats [data-cat]"))) { var bl = b.closest(".bl"); $$(".cats button", bl).forEach(function (x) { x.classList.toggle("on", x === b); }); filter(bl); return; }
    if ((b = t.closest(".tagc [data-tag]"))) { var bl2 = b.closest(".bl"), on = !b.classList.contains("on"); $$(".tagc button", bl2).forEach(function (x) { x.classList.remove("on"); }); b.classList.toggle("on", on); filter(bl2); return; }
    if ((b = t.closest(".arch [data-month]"))) { var bl4 = b.closest(".bl"), on4 = !b.classList.contains("on"); $$(".arch button", bl4).forEach(function (x) { x.classList.remove("on"); x.setAttribute("aria-pressed", "false"); }); b.classList.toggle("on", on4); b.setAttribute("aria-pressed", String(on4)); filter(bl4); return; }
    if ((b = t.closest("[data-clear]"))) { var bl3 = b.closest(".bl"); $("[data-bq]", bl3).value = ""; $$(".tagc .on, .arch .on", bl3).forEach(function (x) { x.classList.remove("on"); x.removeAttribute("aria-pressed"); }); $(".cats [data-cat='']", bl3).click(); return; }
    if ((b = t.closest("[data-react]"))) {
      var grp2 = b.closest("[data-rx]");
      post("/api/blog/react", { slug: grp2.dataset.rx, kind: b.dataset.react }).then(function (r) {
        if (r.s === 401) { var n = $(".rxn small", grp2.parentNode); if (n) { n.classList.add("flash"); setTimeout(function () { n.classList.remove("flash"); }, 1200); } return; }
        if (r.s !== 200) return;
        b.setAttribute("aria-pressed", String(r.j.on));
        ["heart", "star", "sun"].forEach(function (k) { var x = $("[data-react='" + k + "'] em", grp2); if (x) x.textContent = r.j.counts[k]; });
      });
      return;
    }
    if ((b = t.closest("[data-fs]"))) { var rd = b.closest(".rd"), cur = parseFloat(getComputedStyle(rd).getPropertyValue("--fs")) || 14; rd.style.setProperty("--fs", Math.max(12, Math.min(20, cur + +b.dataset.fs)) + "px"); return; }
    if ((b = t.closest("[data-paper]"))) { var rd2 = b.closest(".rd"), on2 = rd2.classList.toggle("npaper"); b.setAttribute("aria-pressed", String(on2)); return; }
    if ((b = t.closest("[data-jump]"))) { e.preventDefault(); var rd3 = b.closest(".rd"), h = rd3.querySelector("#" + CSS.escape(b.dataset.jump)), sc = $(".rscroll", rd3); if (h) sc.scrollTo({ top: h.offsetTop - sc.offsetTop - 8, behavior: RM ? "auto" : "smooth" }); return; }
    if ((b = t.closest("[data-print]"))) { window.print(); return; }   /* chapter window: print the page (print CSS shows only it) */
    if ((b = t.closest("[data-copy]"))) { if (navigator.clipboard) navigator.clipboard.writeText(b.dataset.copy).catch(function () {}); var o = b.textContent; b.textContent = T("Kopiert ✓", "Copied ✓"); setTimeout(function () { b.textContent = o; }, 1400); return; }
    if ((b = t.closest(".mctl [aria-disabled=true]"))) return;   /* no tracks yet: the controls do nothing */
    if ((b = t.closest(".mctl [data-toggle]"))) { b.setAttribute("aria-pressed", String(b.getAttribute("aria-pressed") !== "true")); return; }
    if ((b = t.closest("[data-play]"))) {   /* no tracks exist yet: the player only shows its state, nothing plays */
      var mp = b.closest("[data-mp]"), on3 = mp.classList.toggle("on"); b.setAttribute("aria-pressed", String(on3)); b.setAttribute("aria-label", on3 ? "Pause" : T("Abspielen", "Play")); return;
    }
    if ((b = t.closest(".trt tbody tr"))) { $$(".trt tr", b.closest("table")).forEach(function (r) { r.classList.toggle("sel", r === b); }); return; }
    if ((b = t.closest("[data-trash-empty]"))) { $(".trq", b.closest(".trw")).hidden = false; return; }
    if ((b = t.closest("[data-trash-no]"))) { b.closest(".trq").hidden = true; return; }
    if ((b = t.closest("[data-trash-yes]"))) { var w2 = b.closest(".trw"); $(".trq", w2).hidden = true; $(".trt", w2).hidden = true; $(".tempty", w2).hidden = false; $("[data-trash-count]", w2).textContent = T("0 Objekte", "0 items"); return; }
    if ((b = t.closest("[data-trash-restore]"))) { var c = $("[data-trash-count]", b.closest(".trw")), keep = c.textContent; c.textContent = T("Die bleiben lieber hier. 😺", "They'd rather stay. 😺"); setTimeout(function () { c.textContent = keep; }, 1800); return; }
    if ((b = t.closest("[data-focus-search]"))) { if (win) $(".wb.x", win).click(); setTimeout(function () { var st = $("#startb"); if (st && $("#startm").hidden) st.click(); var q = $("#smq") || $("#hq"); if (q) q.focus(); }, 30); return; }
    if ((b = t.closest("[data-pf-delete]"))) {
      if (!confirm(T("Wirklich alle deine Gästebuch-Einträge, deinen Lesefortschritt, deine Reaktionen und Sitzungen löschen?", "Really delete all your guestbook entries, reading progress, reactions and sessions?"))) return;
      post("/api/profile/delete", { confirm: "delete" }).then(function (r) { if (r.s === 200) location.href = EN ? "/en" : "/"; });
      return;
    }
  });
  document.addEventListener("input", function (e) {
    var bq = e.target.closest("[data-bq]"); if (bq) filter(bq.closest(".bl"));
    var r = e.target; if (r.type === "range") r.style.setProperty("--v", (r.value - r.min) / ((r.max - r.min) || 1) * 100);   /* slider fill (phone polish 2) */
  });
  document.addEventListener("submit", function (e) { if (e.target.closest(".bsearch")) e.preventDefault(); });   /* search filters in place */
  document.addEventListener("keydown", function (e) {
    if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || "")) { var w = $(".win.focus [data-bq]"); if (w) { e.preventDefault(); w.focus(); } }
  });
  $$("#wins .win").forEach(initWin);
})();
