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
  var open = new Map(), z = 10, seq = 0, me = null;

  var title = function (k) { var a = APPS[k]; return a ? a.dataset[lang === "en" ? "titleEn" : "titleDe"] : (open.get(k) && open.get(k).title) || ""; };
  var icon16 = function (k) { var t = $("#ic-" + k); return t ? t.innerHTML : ""; };
  var pathOf = function (k) { var p = k && APPS[k] ? APPS[k].dataset.path : "/"; return lang === "en" ? (p === "/" ? "/en" : "/en" + p) : p; };
  var appOf = function (pathname) { var p = pathname.replace(/^\/en(?=\/|$)/, "") || "/"; p = p.replace(/\/$/, "") || "/"; var hit = null; Object.keys(APPS).forEach(function (k) { if (APPS[k].dataset.path === p) hit = k; }); return hit; };
  var push = function (k) { var p = pathOf(k); if (location.pathname !== p) history.pushState({ k: k || "" }, "", p); document.title = (k ? title(k) + " · " : "") + "NwebOS"; };
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
    open.forEach(function (o, k) { if (!APPS[k]) return; list.push({ k: k, x: parseFloat(o.el.style.getPropertyValue("--x")) || 0, y: parseFloat(o.el.style.getPropertyValue("--y")) || 0, w: o.el.offsetWidth || parseFloat(o.el.style.width), h: o.el.offsetHeight || parseFloat(o.el.style.height), min: o.el.classList.contains("min"), max: o.el.classList.contains("max"), z: +o.el.style.zIndex || 0 }); });
    store.set("wins", JSON.stringify(list));
  }
  function saved() { try { return JSON.parse(store.get("wins") || "[]").filter(function (w) { return w && APPS[w.k]; }); } catch (e) { return []; } }

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
    var d = opt.pos || DEF[k] || [120 + 30 * (seq % 8), 60 + 24 * (seq % 8)]; seq++;
    var p = clampPos(d[0], d[1], w, h);
    el.style.setProperty("--x", p[0] + "px"); el.style.setProperty("--y", p[1] + "px"); el.style.width = w + "px"; el.style.height = h + "px";
    var ico = opt.icon || icon16(k), tt = esc(opt.title || title(k));
    el.innerHTML = '<header class="wt"><button type="button" class="wb back" aria-label="' + esc(L.back) + '">‹</button>' + ico + '<span class="tt">' + tt + '</span>' +
      '<button type="button" class="wb mn" aria-label="' + esc(L.minimize) + '">–</button><button type="button" class="wb mx" aria-label="' + esc(L.maximize) + '">□</button><button type="button" class="wb x" aria-label="' + esc(L.close) + '">×</button></header>' + (opt.menu === false ? '' : '<nav class="wm" aria-hidden="true">' + (L.menu || []).map(function (m) { return '<span>' + esc(m) + '</span>'; }).join('') + '</nav>') + '<div class="wc"></div><span class="wr" aria-hidden="true"></span>';
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
    var done = function () { o.el.remove(); };
    if (RM) done(); else { o.el.classList.add("closing"); after(o.el, done); }
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
  sb.onclick = function (e) { e.stopPropagation(); sound.click(); var o = sm.hidden; sm.hidden = !o; sb.setAttribute("aria-expanded", String(o)); if (o) { var f = $("a,button", sm); if (f) f.focus(); } };
  document.addEventListener("click", function (e) {
    if (!sm.hidden && !e.target.closest("#startm,#startb")) closeStart();
    var op = e.target.closest("[data-open]");
    if (op && !op.classList.contains("dicon") && !e.ctrlKey && !e.metaKey && !e.shiftKey) { e.preventDefault(); openWin(op.dataset.open); return; }
    var cw = e.target.closest("[data-closewin]"); if (cw) { var w = cw.closest(".win"); open.forEach(function (o, k) { if (o.el === w) close(k, true); }); return; }
    var egg = e.target.closest("[data-egg]"); if (egg) { closeStart(); if (eggs[egg.dataset.egg]) eggs[egg.dataset.egg](); }
    if (!e.target.closest(".dicon")) $$(".dicon.sel").forEach(function (d) { d.classList.remove("sel"); });
  });
  var eggs = {
    logout: function () {
      store.set("loggedout", "1"); store.set("user", null);
      if (me) { location.href = L.logoutUrl + encodeURIComponent(location.href); return; }   // real Discord session: sign out, come back to the login
      showLogin();
    },
    shutdown: function () { var off = $("#off"); off.hidden = false; desk.hidden = true; off.onclick = function () { off.hidden = true; showDesk(); }; },
    "about-os": function () { dialog(L.aboutOs, lang === "en" ? "<b>NwebOS · Summer Edition</b><br>An operating system that only pretends. Built by Nils with HTML, CSS and a little JavaScript." : "<b>NwebOS · Sommer Edition</b><br>Ein Betriebssystem, das nur so tut. Gebaut von Nils mit HTML, CSS und ein bisschen JavaScript."); }
  };

  /* ---------- desktop icons: click selects, double click or Enter opens; links without a window navigate ---------- */
  $$(".dicon").forEach(function (d) {
    d.addEventListener("click", function (e) {
      if (!d.dataset.open) return;                  // blog/music/… still their own page until the apps PR
      e.preventDefault();
      if (PHONE() || e.detail === 0) { openWin(d.dataset.open); return; }
      $$(".dicon.sel").forEach(function (x) { x.classList.remove("sel"); }); d.classList.add("sel");
    });
    d.addEventListener("dblclick", function () { if (d.dataset.open) openWin(d.dataset.open); else location.href = d.href; });
  });
  $("[data-home]").onclick = function () { var t = topWindow(); if (t) minimize(t); };
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
    me = d && d.user ? d.user : null;
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
    open.forEach(function (o, key) { if (!o.el.classList.contains("min")) minimize(key); });   // back to the desktop address: show the desktop
  });

  setUser();
  var deep = appOf(location.pathname);
  var firstVisit = !store.get("booted");
  // restore the saved windows quietly (no sound, no animation), the deep-linked app goes on top
  saved().sort(function (a, b) { return a.z - b.z; }).forEach(function (w) { openWin(w.k, { quiet: true, noPush: true, pos: [w.x, w.y], w: w.w, h: w.h, min: w.min, max: w.max }); });
  if (deep) openWin(deep, { noPush: true, quiet: open.has(deep) });
  else { var top = topWindow(); if (top) history.replaceState({ k: top }, "", pathOf(top)); }
  // Boot: first visit to the desktop only (a direct app visit and reduced motion skip it). Login: first visit and after "Abmelden".
  if (firstVisit && !deep && !RM) boot();
  else if (firstVisit || store.get("loggedout")) { store.set("booted", "1"); showLogin(); }
  else showDesk(false);
})();
