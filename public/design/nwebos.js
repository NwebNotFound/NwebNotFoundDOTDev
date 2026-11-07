/* NwebOS window manager (markup: src/nwebos.js, mockup: mockups/nwebos). Vanilla JS, no libraries.
   - Real paths: every app has its own address (/guestbook, /about, …; /en/… in English). Opening or
     focusing a window pushes it, closing replaces it, Back/Forward open and focus the matching window.
   - Boot only on the first visit to the desktop (a direct app visit and reduced motion skip it); login on the
     first visit and after "Abmelden". Open windows and their positions are kept in localStorage.
   - Sounds: synthesised with WebAudio after the first gesture, mute toggle in the tray.
   - Performance (#100 budget): no canvas, no rAF loop, no scroll/resize listeners; motion is CSS
     transform/opacity; idle work is one clock update per minute. */
(function () {
  "use strict";
  var R = document.documentElement;
  R.classList.remove("no-js"); R.classList.add("js");
  var L = {}; try { L = JSON.parse(document.getElementById("os-l").textContent); } catch (e) {}
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return [].slice.call((el || document).querySelectorAll(s)); };
  var RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var PHONE = function () { return matchMedia("(max-width:700px)").matches; };
  var store = {
    get: function (k) { try { return localStorage.getItem("nwebos." + k); } catch (e) { return null; } },
    set: function (k, v) { try { if (v == null) localStorage.removeItem("nwebos." + k); else localStorage.setItem("nwebos." + k, v); } catch (e) {} }
  };
  var lang = L.lang === "en" ? "en" : "de";
  var desk = $("#desk"), wins = $("#wins"), tb = $("#tbtns"), sm = $("#startm"), sb = $("#startb");
  var APPS = {}; $$("#apps .app").forEach(function (s) { APPS[s.dataset.app] = s; });
  var DEF = { about: [150, 40], portfolio: [330, 70], guestbook: [790, 24], dlg: [480, 220] };
  var ROUTES = {}; (L.routes || []).forEach(function (r) { ROUTES[r[0]] = r[1]; });
  var bare = function (pathname) { var p = pathname.replace(/^\/(de|en)(?=\/|$)/, "") || "/"; return p.replace(/\/$/, "") || "/"; };
  /* an address the shell can open as a window (the server renders it): no assets, APIs, auth or the old editor */
  var osPath = function (u) { var p = bare(u.pathname); return u.origin === location.origin && !/\.[a-z0-9]{2,5}$/i.test(p) && !/^\/(api|auth|design|mc|vendor|bundle|downloads|content-assets|mc-icon|mc-head|mc-skin)(\/|$)/.test(p) && !/^\/blog\/admin(\/|$)/.test(p); };
  var open = new Map(), z = 10, seq = 0, me = null;
  /* App modules (docs/nwebos-modules.md): NwebOS.register(key, { mount(content, ctx), unmount?(content) }).
     A section with data-module loads that script on the first open; the window is mounted once it registered. */
  var MODS = {}, loading = {}, waiting = {};
  window.NwebOS = { register: function (key, mod) { MODS[key] = mod; (waiting[key] || []).forEach(function (f) { f(); }); delete waiting[key]; } };
  function ctxFor(k, el) { return { key: k, lang: lang, window: el, sound: { click: function () { sound.click(); }, open: function () { sound.open(); }, close: function () { sound.close(); }, tone: tone },
    store: { get: function (x) { return store.get(k + "." + x); }, set: function (x, v) { store.set(k + "." + x, v); } }, close: function () { close(k); } }; }
  function mount(k, el) {
    var src = APPS[k], url = src && src.dataset.module; if (!url) return;
    var wc = $(".wc", el);
    var go = function () { if (!open.has(k) || open.get(k).el !== el) return; try { wc.replaceChildren(); MODS[k].mount(wc, ctxFor(k, el)); } catch (e) { if (window.console) console.error("NwebOS module " + k, e); } };
    if (MODS[k]) return go();
    (waiting[k] = waiting[k] || []).push(go);
    if (!loading[url]) { loading[url] = true; var s = document.createElement("script"); s.src = url; s.async = true; document.head.appendChild(s); }
  }

  var title = function (k) { var a = APPS[k]; return a ? a.dataset[lang === "en" ? "titleEn" : "titleDe"] : (open.get(k) && open.get(k).title) || ""; };
  /* control icons (pixel, currentColor) from the sprite: the phone title bar and bottom bar (phone polish 4/5) */
  var ic2 = function (k) { return '<svg class="ic2" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><use href="' + (L.sprite || "/design/nwebos-icons.svg") + '#i-c-' + k + '"/></svg>'; };
  var icon16 = function (k) { var t = $("#ic-" + k); return t ? t.innerHTML : ""; };
  /* a window's address; `data-q` keeps the query of the address it was opened on (a draft's ?preview= token) */
  var pathOf = function (k) { var p = k && APPS[k] ? APPS[k].dataset.path : "/", q = k && APPS[k] ? APPS[k].dataset.q || "" : ""; return (lang === "en" ? (p === "/" ? "/en" : "/en" + p) : p) + q; };
  var appOf = function (pathname) { var p = pathname.replace(/^\/(de|en)(?=\/|$)/, "") || "/"; p = p.replace(/\/$/, "") || "/"; var hit = null; Object.keys(APPS).forEach(function (k) { if (APPS[k].dataset.path === p) hit = k; }); return hit; };
  var push = function (k) { if (k && APPS[k] && !APPS[k].dataset.path) return; var p = pathOf(k); if (location.pathname !== p) history.pushState({ k: k || "" }, "", p); document.title = (k ? title(k) + " · " : "") + "NwebOS"; };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };

  /* ---------- sound: tiny WebAudio synth, created on the first gesture only ---------- */
  var ac = null, muted = store.get("mute") === "1";
  function audio() { if (muted) return null; if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } } if (ac.state === "suspended") ac.resume(); return ac; }
  function tone(f, t0, d, type, vol) { var a = audio(); if (!a) return; var o = a.createOscillator(), g = a.createGain(), t = a.currentTime + t0; o.type = type || "square"; o.frequency.value = f; g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol || 0.05, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d); o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + d + 0.02); }
  var sound = {
    click: function () { tone(880, 0, 0.05, "square", 0.03); },
    open: function () { tone(660, 0, 0.06, "triangle", 0.05); tone(990, 0.05, 0.08, "triangle", 0.04); },
    close: function () { tone(740, 0, 0.05, "triangle", 0.04); tone(494, 0.05, 0.08, "triangle", 0.035); },
    start: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, i * 0.12, 0.5, "triangle", 0.05); }); tone(262, 0, 0.9, "sine", 0.04); }
  };
  var snd = $("#snd");
  function setMute(m) { muted = m; store.set("mute", m ? "1" : null); snd.setAttribute("aria-pressed", m ? "false" : "true"); if (m && ac) ac.suspend(); }
  setMute(muted);
  snd.addEventListener("click", function () { setMute(!muted); if (!muted) sound.click(); });

  /* ---------- window state in localStorage ---------- */
  function save() {
    var list = [];
    open.forEach(function (o, k) { if (!APPS[k] || k === "notfound") return; list.push({ k: k, p: APPS[k].dataset.path || "", x: parseFloat(o.el.style.getPropertyValue("--x")) || 0, y: parseFloat(o.el.style.getPropertyValue("--y")) || 0, w: o.el.offsetWidth || parseFloat(o.el.style.width), h: o.el.offsetHeight || parseFloat(o.el.style.height), min: o.el.classList.contains("min"), max: o.el.classList.contains("max"), z: +o.el.style.zIndex || 0 }); });
    store.set("wins", JSON.stringify(list));
  }
  function saved() { try { return JSON.parse(store.get("wins") || "[]").filter(function (w) { return w && w.k && (APPS[w.k] || w.p); }); } catch (e) { return []; } }
  /* Open the window for an address: its section is in the page, or it is fetched from that address (the server renders
     the window there) and added. A window already open for that app gets the new content (another post). */
  var pending = {};
  function openUrl(url, opt) {
    opt = opt || {};
    var u = new URL(url, location.href), b = bare(u.pathname);
    var have = null; Object.keys(APPS).forEach(function (k) { if (APPS[k].dataset.path === b) have = k; });
    if (have && !u.search) { openWin(have, opt); return Promise.resolve(have); }
    var key = u.pathname + u.search; if (pending[key]) return pending[key];
    return (pending[key] = fetch(u.pathname + u.search, { credentials: "include", headers: { accept: "text/html" } }).then(function (r) { return r.text(); }).then(function (txt) {
      delete pending[key];
      var doc = new DOMParser().parseFromString(txt, "text/html"), sec = doc.querySelector("#apps .app");
      if (!sec || !doc.documentElement.classList.contains("nwebos")) { location.href = u.href; return null; }
      var k = sec.dataset.app, old = APPS[k], tpl = doc.getElementById("ic-" + k);
      if (tpl && !document.getElementById("ic-" + k)) document.body.appendChild(document.importNode(tpl, true));
      sec = document.importNode(sec, true);
      if (old) old.replaceWith(sec); else $("#apps").appendChild(sec);
      APPS[k] = sec;
      var o = open.get(k);
      if (o) {   /* same window, new content */
        var wc = $(".wc", o.el); wc.replaceChildren(); [].slice.call(sec.cloneNode(true).childNodes).forEach(function (n) { if (!(n.classList && n.classList.contains("nojs-h"))) wc.appendChild(n); });
        $(".tt", o.el).textContent = title(k); $("span", o.btn).textContent = title(k); o.el.setAttribute("aria-label", title(k));
        document.dispatchEvent(new CustomEvent("nwebos:content", { detail: o.el }));
        restore(k); focus(k, !opt.noPush);
      } else openWin(k, opt);
      return k;
    }).catch(function () { delete pending[key]; location.href = u.href; return null; }));
  }

  /* ---------- windows ---------- */
  function focus(k, doPush) {
    var w = open.get(k); if (!w) return;
    open.forEach(function (o) { o.el.classList.remove("focus"); o.btn.classList.remove("on"); o.btn.setAttribute("aria-selected", "false"); });
    w.el.style.zIndex = ++z; w.el.classList.add("focus"); w.btn.classList.add("on"); w.btn.setAttribute("aria-selected", "true");
    $("#mtitle").textContent = title(k) || w.title;
    if (doPush !== false && APPS[k]) push(k);
  }
  function topWindow() { var best = null; open.forEach(function (o, k) { if (!o.el.classList.contains("min") && (!best || +o.el.style.zIndex > +open.get(best).el.style.zIndex)) best = k; }); return best; }
  function clampPos(x, y, w, h) { return [Math.max(0, Math.min(x, innerWidth - Math.min(w, innerWidth) - 10)), Math.max(0, Math.min(y, innerHeight - 36 - Math.min(h, innerHeight - 46) - 10))]; }
  function openWin(k, opt) {
    opt = opt || {};
    if (open.has(k)) { restore(k); focus(k, !opt.noPush); return open.get(k); }
    closeStart();
    var src = APPS[k];
    var el = document.createElement("section"); el.className = "win" + (opt.quiet || RM ? "" : " opening"); el.setAttribute("role", "dialog"); el.setAttribute("aria-label", opt.title || title(k)); el.tabIndex = -1;
    var w = opt.w || +(src && src.dataset.w || 360), h = opt.h || +(src && src.dataset.h || 220);
    var d = opt.pos || DEF[k] || (src && src.dataset.x ? [+src.dataset.x, +src.dataset.y] : [120 + 30 * (seq % 8), 60 + 24 * (seq % 8)]); seq++;
    if (src && src.dataset.menu === "no") opt.menu = false;
    var p = clampPos(d[0], d[1], w, h);
    el.style.setProperty("--x", p[0] + "px"); el.style.setProperty("--y", p[1] + "px"); el.style.width = w + "px"; el.style.height = h + "px";
    var ico = opt.icon || icon16(k), tt = esc(opt.title || title(k));
    el.innerHTML = '<header class="wt"><button type="button" class="wb back" aria-label="' + esc(L.back) + '"><span class="wbt">‹</span>' + ic2("back") + '</button>' + ico + '<span class="tt">' + tt + '</span>' +
      '<button type="button" class="wb mn" aria-label="' + esc(L.minimize) + '">–</button><button type="button" class="wb mx" aria-label="' + esc(L.maximize) + '">□</button><button type="button" class="wb x" aria-label="' + esc(L.close) + '"><span class="wbt">×</span>' + ic2("close") + '</button></header>' + (opt.menu === false ? '' : '<nav class="wm" aria-hidden="true">' + (L.menu || []).map(function (m) { return '<span>' + esc(m) + '</span>'; }).join('') + '</nav>') + '<div class="wc"></div><span class="wr" aria-hidden="true"></span>';
    var wc = $(".wc", el);
    if (src) [].slice.call(src.cloneNode(true).childNodes).forEach(function (n) { if (!(n.classList && n.classList.contains("nojs-h"))) wc.appendChild(n); });
    else wc.innerHTML = opt.html || "";
    wins.appendChild(el);
    var btn = document.createElement("button"); btn.type = "button"; btn.className = "tbb"; btn.setAttribute("role", "tab");
    btn.innerHTML = ico + "<span>" + tt + "</span>"; tb.appendChild(btn);
    var rec = { el: el, btn: btn, title: opt.title || title(k) }; open.set(k, rec);
    el.addEventListener("animationend", function () { el.classList.remove("opening", "restoring"); });
    el.addEventListener("pointerdown", function () { focus(k, !el.classList.contains("focus") && !!APPS[k]); }, true);
    btn.onclick = function () { sound.click(); if (el.classList.contains("min")) { restore(k); focus(k); } else if (el.classList.contains("focus")) minimize(k); else focus(k); };
    $(".x", el).onclick = function () { close(k); };
    $(".back", el).onclick = function () { close(k); };
    $(".mn", el).onclick = function () { minimize(k); };
    $(".mx", el).onclick = function () { el.classList.toggle("max"); save(); };
    var bar = $(".wt", el);
    bar.addEventListener("dblclick", function (e) { if (!e.target.closest(".wb")) { el.classList.toggle("max"); save(); } });
    drag(bar, el, false); drag($(".wr", el), el, true);
    if (opt.min) el.classList.add("min");
    if (opt.max) el.classList.add("max");
    if (!opt.quiet) sound.open();
    if (!opt.min) focus(k, !opt.noPush);
    if (!opt.quiet && !opt.min) el.focus({ preventScroll: true });
    if (k === "guestbook") guestbook(el);
    mount(k, el);
    save();
    return rec;
  }
  function drag(handle, el, resize) {
    handle.addEventListener("pointerdown", function (e) {
      if (PHONE() || e.button !== 0 || e.target.closest(".wb") || (!resize && el.classList.contains("max"))) return;
      e.preventDefault(); handle.setPointerCapture(e.pointerId);
      var x0 = parseFloat(el.style.getPropertyValue("--x")), y0 = parseFloat(el.style.getPropertyValue("--y")), w0 = el.offsetWidth, h0 = el.offsetHeight, sx = e.clientX, sy = e.clientY;
      var mv = function (ev) {
        var dx = ev.clientX - sx, dy = ev.clientY - sy;
        if (resize) { el.style.width = Math.max(260, w0 + dx) + "px"; el.style.height = Math.max(160, h0 + dy) + "px"; }
        else { el.style.setProperty("--x", Math.min(innerWidth - 80, Math.max(-w0 + 80, x0 + dx)) + "px"); el.style.setProperty("--y", Math.min(innerHeight - 70, Math.max(0, y0 + dy)) + "px"); }
      };
      var up = function () { handle.removeEventListener("pointermove", mv); handle.removeEventListener("pointerup", up); handle.removeEventListener("pointercancel", up); save(); };
      handle.addEventListener("pointermove", mv); handle.addEventListener("pointerup", up); handle.addEventListener("pointercancel", up);
    });
  }
  // once on animationend, with a timer fallback (background tabs may not paint)
  function after(el, fn) { var d = false; var go = function () { if (!d) { d = true; fn(); } }; el.addEventListener("animationend", go, { once: true }); setTimeout(go, 320); }
  function toBtn(k) { var o = open.get(k), r = o.btn.getBoundingClientRect(); o.el.style.setProperty("--mx", r.left + "px"); o.el.style.setProperty("--my", r.top - 40 + "px"); }
  function minimize(k) {
    var o = open.get(k); if (!o) return; toBtn(k);
    var done = function () { o.el.classList.remove("mining"); o.el.classList.add("min"); o.el.classList.remove("focus"); o.btn.classList.remove("on"); var t = topWindow(); if (t) focus(t, false); history.replaceState({ k: t || "" }, "", pathOf(t)); save(); };
    if (RM || PHONE()) return done();
    o.el.classList.add("mining"); after(o.el, done);
  }
  function restore(k) { var o = open.get(k); if (!o || !o.el.classList.contains("min")) return; toBtn(k); o.el.classList.remove("min"); if (!RM) o.el.classList.add("restoring"); save(); }
  function close(k, fromHistory) {
    var o = open.get(k); if (!o) return; open.delete(k); o.btn.remove(); sound.close();
    if (MODS[k] && MODS[k].unmount) { try { MODS[k].unmount($(".wc", o.el)); } catch (e) {} }
    var done = function () { o.el.remove(); };
    if (RM) done(); else { o.el.classList.add("closing"); after(o.el, done); }
    syncInert();   /* before focus moves: an inert icon list cannot take it */
    var t = topWindow(); if (t) { focus(t, false); open.get(t).el.focus({ preventScroll: true }); } else { $("#mtitle").textContent = "NwebOS"; var di = $(".dicon"); if (di) di.focus({ preventScroll: true }); }
    if (!fromHistory) history.replaceState({ k: t && APPS[t] ? t : "" }, "", pathOf(t && APPS[t] ? t : ""));
    document.title = (t && APPS[t] ? title(t) + " · " : "") + "NwebOS";
    save();
  }
  function dialog(t, msg) {
    return openWin("dlg" + (++seq), { title: t, w: 320, h: 170, menu: false, icon: icon16("about"), pos: [innerWidth / 2 - 160, innerHeight / 2 - 120], noPush: true,
      html: '<div class="pad" style="display:flex;gap:12px;align-items:flex-start">' + icon16("about").replace('width="16" height="16"', 'width="32" height="32"') + '<p style="margin:0;font-size:13px">' + msg + '</p></div><p class="btns pad" style="justify-content:flex-end;padding-top:0"><button type="button" class="xpbtn" data-closewin>OK</button></p>' });
  }

  /* ---------- start menu ---------- */
  function closeStart() { sm.hidden = true; sb.setAttribute("aria-expanded", "false"); }
  sb.onclick = function (e) { e.stopPropagation(); sound.click(); var o = sm.hidden; sm.hidden = !o; sb.setAttribute("aria-expanded", String(o)); if (o) { var f = $("#smq", sm) || $("a,button", sm); if (f) f.focus(); } };
  /* search (start menu, phone home): windows, mc wiki and links from the page, blog posts from /api/blog on first use */
  var IDX = (L.idx || []).slice(), blogP = null;
  var norm = function (x) { return String(x).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); };
  function loadBlog() {
    return blogP || (blogP = fetch("/api/blog", { credentials: "omit" }).then(function (r) { return r.ok ? r.json() : { posts: [] }; }).then(function (j) {
      (j.posts || []).forEach(function (q) { IDX.push({ t: q.title, d: "Blog · " + new Date(q.published_at).toLocaleDateString(L.lang === "en" ? "en-GB" : "de-DE", { day: "2-digit", month: "2-digit", timeZone: "Europe/Berlin" }), p: (L.lang === "en" ? "/en" : "") + "/blog/" + q.slug, ic: "blog", kw: [q.category].concat(q.tags || []).join(" ") + " " + (q.summary || "") }); });
    }).catch(function () {}));
  }
  function find(q) { q = norm(q.trim()); if (!q) return []; var parts = q.split(/\s+/); /* title hits first, then windows of this site before links out */
    var all = function (h) { return parts.every(function (x) { return h.indexOf(x) >= 0; }); };
    return IDX.map(function (r, i) { var t = norm(r.t); return { r: r, i: i, s: all(t) ? 0 : all(t + " " + norm(r.kw + " " + r.d)) ? 2 : 9 }; }).filter(function (x) { return x.s < 9; })
      .sort(function (a, b) { return (a.s + (a.r.url ? 1 : 0)) - (b.s + (b.r.url ? 1 : 0)) || a.i - b.i; }).slice(0, 8).map(function (x) { return x.r; }); }
  function bindSearch(inp, list, after) {
    if (!inp || !list) return;
    var sel = 0, res = [];
    var draw = function () {
      res = find(inp.value); list.hidden = !inp.value.trim(); sel = Math.min(sel, Math.max(0, res.length - 1));
      list.replaceChildren();
      if (!res.length) { var li0 = document.createElement("li"); li0.className = "none"; li0.textContent = L.noHit + " „" + inp.value.trim() + "“"; list.appendChild(li0); }
      res.forEach(function (r, i) {
        var li = document.createElement("li"), b = document.createElement("button"), sp = document.createElement("span"), bt = document.createElement("b"), sm2 = document.createElement("small");
        b.type = "button"; b.dataset.i = i; if (i === sel) b.className = "on";
        b.innerHTML = icon16(r.ic); bt.textContent = r.t; sm2.textContent = r.d; sp.append(bt, sm2); b.appendChild(sp);
        if (r.url) { var em = document.createElement("em"); em.textContent = "↗"; b.appendChild(em); }
        li.appendChild(b); list.appendChild(li);
      });
      var mid = $(".smmid", sm); if (list.id === "smres" && mid) mid.hidden = !list.hidden;
    };
    var go = function (r) { if (!r) return; if (r.url) window.open(r.url, "_blank", "noopener"); else openUrl(r.p); inp.value = ""; draw(); if (after) after(); };
    inp.addEventListener("focus", function () { loadBlog().then(function () { if (inp.value.trim()) draw(); }); });
    inp.addEventListener("input", function () { sel = 0; draw(); });
    inp.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") { sel = Math.min(res.length - 1, sel + 1); draw(); e.preventDefault(); }
      else if (e.key === "ArrowUp") { sel = Math.max(0, sel - 1); draw(); e.preventDefault(); }
      else if (e.key === "Enter") { e.preventDefault(); go(res[sel]); }
      else if (e.key === "Escape" && inp.value) { inp.value = ""; draw(); e.stopPropagation(); }
    });
    list.addEventListener("click", function (e) { var b = e.target.closest("[data-i]"); if (b) { e.stopPropagation(); go(res[+b.dataset.i]); } });
  }
  bindSearch($("#smq"), $("#smres"), closeStart); bindSearch($("#hq"), $("#hres"));
  var hf = $(".hsearch"); if (hf) hf.addEventListener("submit", function (e) { e.preventDefault(); });
  document.addEventListener("click", function (e) {
    if (!sm.hidden && !e.target.closest("#startm,#startb")) closeStart();
    var op = e.target.closest("[data-open]");
    if (op && !op.classList.contains("dicon") && !e.ctrlKey && !e.metaKey && !e.shiftKey) { e.preventDefault(); if (APPS[op.dataset.open]) openWin(op.dataset.open); else if (op.href || ROUTES[op.dataset.open]) openUrl(op.href || ROUTES[op.dataset.open]); return; }
    /* an internal link inside the desktop opens its window instead of reloading the page */
    var a = e.target.closest("#desk a[href]");
    if (a && !a.classList.contains("dicon") && !a.target && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.button === 0) { var lu = new URL(a.href, location.href); if (osPath(lu) && !a.closest(".lang")) { e.preventDefault(); closeStart(); openUrl(lu.href); return; } }
    var cl = e.target.closest("[data-close]"); if (cl && cl.closest(".win")) { e.preventDefault(); var w0 = cl.closest(".win"); open.forEach(function (o, k) { if (o.el === w0) close(k); }); return; }
    var cw = e.target.closest("[data-closewin]"); if (cw) { var w = cw.closest(".win"); open.forEach(function (o, k) { if (o.el === w) close(k, true); }); return; }
    var egg = e.target.closest("[data-egg]"); if (egg) { closeStart(); if (eggs[egg.dataset.egg]) eggs[egg.dataset.egg](); }
    if (!e.target.closest(".dicon")) $$(".dicon.sel").forEach(function (d) { d.classList.remove("sel"); });
  });
  var eggs = {
    logout: function () {
      store.set("loggedout", "1"); store.set("user", null);
      /* real Discord session: sign out with a same-origin POST (a GET only shows the confirmation page, audit #88),
         back to the desktop address, where the login screen shows (a window address opens its window directly) */
      if (me) { var f = document.createElement("form"); f.method = "post"; f.action = L.logoutUrl + encodeURIComponent(location.origin + (L.home || "/")); f.hidden = true; document.body.appendChild(f); f.submit(); return; }
      showLogin();
    },
    shutdown: function () { var off = $("#off"); off.hidden = false; desk.hidden = true; off.onclick = function () { off.hidden = true; showDesk(); }; },
    "about-os": function () { dialog(L.aboutOs, lang === "en" ? "<b>NwebOS · Summer Edition</b><br>An operating system that only pretends. Built by Nils with HTML, CSS and a little JavaScript." : "<b>NwebOS · Sommer Edition</b><br>Ein Betriebssystem, das nur so tut. Gebaut von Nils mit HTML, CSS und ein bisschen JavaScript."); }
  };

  /* ---------- desktop icons: click selects, double click or Enter opens; links without a window navigate ---------- */
  $$(".dicon").forEach(function (d) {
    d.addEventListener("click", function (e) {
      if (!d.dataset.open) return;                  // links out (Minecraft server)
      e.preventDefault();
      if (PHONE() || e.detail === 0) { if (APPS[d.dataset.open]) openWin(d.dataset.open); else openUrl(d.href); return; }
      $$(".dicon.sel").forEach(function (x) { x.classList.remove("sel"); }); d.classList.add("sel");
    });
    d.addEventListener("dblclick", function () { if (d.dataset.open) { if (APPS[d.dataset.open]) openWin(d.dataset.open); else openUrl(d.href); } else location.href = d.href; });
  });
  $("[data-home]").onclick = function () { var t = topWindow(); if (t) minimize(t); };
  /* phone bottom bar: search goes to the home screen and focuses its search field (phone polish 5) */
  var ms = $("[data-msearch]"); if (ms) ms.onclick = function () { open.forEach(function (o, key) { if (!o.el.classList.contains("min")) minimize(key); }); setTimeout(function () { var q = $("#hq"); if (q) q.focus(); }, 60); };
  /* Phone: an open app covers the home screen, so its icons leave the Tab order (inert) until the app is minimized or closed. Home stays reachable. */
  function syncInert() { var ic = $(".dicons"); if (ic) ic.inert = !!(PHONE() && topWindow()); }
  new MutationObserver(syncInert).observe(wins, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  matchMedia("(max-width:700px)").addEventListener("change", syncInert);   /* breakpoint only, no resize listener (perf budget) */

  /* ---------- keyboard ---------- */
  document.addEventListener("keydown", function (e) {
    if (!$("#boot").hidden) { skipBoot(); return; }
    if (e.key === "Escape") { if (!sm.hidden) { closeStart(); sb.focus(); return; } var t = topWindow(); if (t && !desk.hidden) close(t); }
    if (e.altKey && (e.key === "w" || e.key === "W")) { e.preventDefault(); var ks = []; open.forEach(function (_, k) { ks.push(k); }); if (!ks.length) return; var n = ks[(ks.indexOf(topWindow()) + 1) % ks.length]; restore(n); focus(n); open.get(n).el.focus(); }
  });

  /* ---------- tray: day/night shares summer-theme.js's choice; DE/EN are real links ---------- */
  var thm = $("#thm");
  var night = function () { var t = R.dataset.theme; return t === "summer-night" || (!t && matchMedia("(prefers-color-scheme: dark)").matches); };
  function syncTheme() { thm.setAttribute("aria-pressed", String(night())); R.toggleAttribute("data-night", night()); }
  thm.onclick = function () { var n = night() ? "summer-day" : "summer-night"; R.dataset.theme = n; try { localStorage.setItem("summer-theme", n); } catch (e) {} syncTheme(); sound.click(); };
  syncTheme();
  var tick = function () { var t = new Date().toLocaleTimeString(lang === "en" ? "en-GB" : "de-DE", { hour: "2-digit", minute: "2-digit" }); $("#clock").textContent = t; $("#mclock").textContent = t; };
  tick(); setTimeout(function () { tick(); setInterval(tick, 60000); }, 60000 - (Date.now() % 60000));

  /* ---------- account (rule 10: the Discord avatar on the main site) ---------- */
  var GUEST_AV = "data:image/svg+xml," + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="#ffd23f"/></svg>');
  function setUser() {
    var useMe = me && store.get("user") !== "gast";
    $("#smname").textContent = useMe ? me.name : L.guest;
    var av = $("#smav"); av.src = useMe && /^https:\/\//.test(me.avatar || "") ? me.avatar : GUEST_AV;
  }
  var meP = fetch("/api/me", { credentials: "include" }).then(function (r) { return r.json(); }).then(function (d) {
    me = d && d.user ? d.user : null; window.__me = d;
    var li = $("[data-login-me]"), dl = $("[data-login-discord]");
    if (me) { li.hidden = false; dl.hidden = true; $("[data-me-name]").textContent = me.name; if (/^https:\/\//.test(me.avatar || "")) $("[data-me-av]").src = me.avatar; }
    else if (d && !d.available) dl.hidden = true;
    setUser();
    return me;
  }).catch(function () { return null; });
  $("[data-login-link]").href = L.login + encodeURIComponent(location.href);

  /* ---------- guestbook window: Discord login, Turnstile on demand, live list ---------- */
  var tsLoad = function () { return window.__tsP || (window.__tsP = new Promise(function (res, rej) { if (window.turnstile) return res(); var s = document.createElement("script"); s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"; s.async = true; s.onload = function () { res(); }; s.onerror = rej; document.head.appendChild(s); })); };
  function renderEntries(box, entries) {
    box.innerHTML = entries.length ? entries.map(function (x) {
      var av = x.avatar && /^https:\/\//.test(x.avatar) ? '<img src="' + esc(x.avatar) + '" width="28" height="28" alt="" loading="lazy" decoding="async">' : '<span class="ini" aria-hidden="true">' + esc(String(x.name || "?")[0].toUpperCase()) + "</span>";
      var d = new Date(String(x.created_at).replace(" ", "T") + "Z");
      return '<article class="msg">' + av + "<div><b>" + esc(x.name) + '</b> <time>' + esc(isNaN(d) ? x.created_at : d.toLocaleDateString(lang === "en" ? "en-GB" : "de-DE", { dateStyle: "medium" })) + "</time><p>" + esc(x.message) + "</p></div></article>";
    }).join("") : '<p class="sys">' + (lang === "en" ? "No entries yet. Be the first!" : "Noch keine Einträge. Sei die oder der Erste!") + "</p>";
  }
  function guestbook(win) {
    var box = $("[data-gb-compose]", win), list = $("[data-gb-list]", win);
    meP.then(function (u) {
      if (!u || !box) { var a = box && $("a", box); if (a) a.href = L.login + encodeURIComponent(location.href); return; }
      var de = lang !== "en";
      box.innerHTML = '<form><label class="vh" for="gb-m-' + seq + '">' + (de ? "Nachricht" : "Message") + '</label><textarea id="gb-m-' + seq + '" name="message" maxlength="500" required placeholder="' + (de ? "Schreib etwas Nettes (max. 500 Zeichen)" : "Write something nice (max. 500 characters)") + '"></textarea><div class="cf-turnstile" data-sitekey="' + esc(L.sitekey) + '" data-theme="auto"></div><div class="row"><span class="gb-st" role="status"></span><button class="xpbtn go" type="submit">' + (de ? "Eintragen" : "Send") + "</button></div></form>";
      var form = $("form", box), st = $(".gb-st", box), host = $(".cf-turnstile", box);
      tsLoad().then(function () { try { if (!host.querySelector("iframe")) turnstile.render(host); } catch (e) {} }).catch(function () {});
      form.onsubmit = function (ev) {
        ev.preventDefault(); st.className = "gb-st"; st.textContent = de ? "Sende …" : "Sending …";
        var fd = new FormData(form);
        fetch("/api/guestbook", { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: fd.get("message"), token: fd.get("cf-turnstile-response") }) })
          .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, j: j }; }); })
          .then(function (r) {
            if (r.ok) { st.textContent = de ? "Danke!" : "Thanks!"; form.reset(); sound.open(); } else { st.className = "gb-st err"; st.textContent = r.j.error || (de ? "Fehler" : "Error"); }
            try { if (window.turnstile) turnstile.reset(host); } catch (e) {}
            return fetch("/api/guestbook").then(function (x) { return x.json(); }).then(function (d) { renderEntries(list, d.entries || []); });
          }).catch(function () { st.className = "gb-st err"; st.textContent = de ? "Nicht gesendet (offline?)" : "Not sent (offline?)"; });
      };
    });
  }

  /* ---------- boot / login / desktop ---------- */
  var bootT;
  function boot() { var b = $("#boot"); b.hidden = false; desk.hidden = true; bootT = setTimeout(skipBoot, 2400); b.onclick = skipBoot; }
  function skipBoot() { clearTimeout(bootT); $("#boot").hidden = true; store.set("booted", "1"); showLogin(); }
  function showLogin() { var l = $("#login"); l.hidden = false; desk.hidden = true; var f = $("button:not([hidden]),a", l); meP.then(function () { var b = $("li:not([hidden]) button, li:not([hidden]) a", l); if (b) b.focus(); }); if (f) f.focus(); }
  $$("[data-user]").forEach(function (b) { b.onclick = function () { store.set("user", b.dataset.user); store.set("loggedout", null); setUser(); $("#login").hidden = true; showDesk(true); }; });
  function showDesk(fromLogin) {
    desk.hidden = false; $("#login").hidden = true;
    if (fromLogin) sound.start();
    if (!open.size) { var d = $(".dicon"); if (d) d.focus({ preventScroll: true }); }
  }
  addEventListener("popstate", function () {
    var k = appOf(location.pathname);
    if (k) { openWin(k, { noPush: true }); return; }
    if (bare(location.pathname) !== "/") { openUrl(location.href, { noPush: true }); return; }
    open.forEach(function (o, key) { if (!o.el.classList.contains("min")) minimize(key); });   // back to the desktop address: show the desktop
  });

  setUser();
  var deep = appOf(location.pathname);
  if (deep && /[?&]preview=/.test(location.search)) APPS[deep].dataset.q = location.search;
  var atDesk = bare(location.pathname) === "/";   /* before restored windows change the address */
  var firstVisit = !store.get("booted");
  // restore the saved windows quietly (no sound, no animation), the deep-linked app goes on top
  var restoring = [];
  saved().sort(function (a, b) { return a.z - b.z; }).forEach(function (w) { var o = { quiet: true, noPush: true, pos: [w.x, w.y], w: w.w, h: w.h, min: w.min, max: w.max }; if (APPS[w.k] && (!w.p || APPS[w.k].dataset.path === w.p)) openWin(w.k, o); else if (w.p) restoring.push(openUrl(w.p, o)); });
  if (deep) openWin(deep, { noPush: true, quiet: open.has(deep) });
  /* windows restored from their address arrive later: the deep-linked window stays on top */
  if (deep && restoring.length) Promise.all(restoring).then(function () { if (open.has(deep)) { focus(deep, false); open.get(deep).el.focus({ preventScroll: true }); } });
  else if (!deep) { var top = topWindow(); if (top) history.replaceState({ k: top }, "", pathOf(top)); }   /* a deep link keeps its address as typed */
  // Boot and login: first visit to the desktop (/) only; login again after "Abmelden". A direct visit to a window's
  // address (deep link, also the 404 window) opens it at once and counts as seen, so the boot does not play later
  // (Planner 07.11.). Reduced motion skips the boot.
  if (deep || !atDesk) { if (firstVisit) store.set("booted", "1"); showDesk(false); }
  else if (firstVisit && !RM) boot();
  else if (firstVisit || store.get("loggedout")) { store.set("booted", "1"); showLogin(); }
  else showDesk(false);
})();
