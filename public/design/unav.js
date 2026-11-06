/* Unified navigation behaviour (markup: src/unav.js). External file, no inline handlers.
   - phone drawer: burger, Esc, focus stays inside the drawer, click outside, scroll lock (#69)
   - mc.* group dropdowns: click, hover (fine pointer), arrow keys, Esc; active entry by path
   - account: /api/me fills the bar and the drawer (Discord avatar on the main site, MC head on mc.*) */
(function () {
  var N = document.querySelector("[data-unav]");
  if (!N) return;
  var root = document.documentElement;
  var bur = N.querySelector(".u-burger");
  var panel = N.querySelector(".u-panel");
  var L = {};
  try { L = JSON.parse(N.getAttribute("data-l") || "{}"); } catch (e) {}
  var isMc = N.getAttribute("data-site") === "mc";
  var base = N.getAttribute("data-login-base") || "";
  var mq = window.matchMedia("(max-width:860px)");
  var mob = function () { return mq.matches; };
  var groups = function () { return [].slice.call(N.querySelectorAll(".u-group")); };
  var visible = function (el) { return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length); };

  /* ---------- active entry (mc groups: longest matching path wins) ---------- */
  function mark() {
    if (!isMc) return;
    var p = location.pathname.replace(/\/$/, "") || "/";
    var best = null;
    [].forEach.call(N.querySelectorAll(".u-drop a[href^='/'], .u-menu a[href^='/'], .u-me__links a[href^='/']"), function (a) {
      a.removeAttribute("aria-current");
      var h = a.getAttribute("href").split("#")[0].split("?")[0];
      if (!(h === p || (h !== "/" && p.indexOf(h + "/") === 0))) return;
      if (!best || h.length > best.h.length) best = { a: a, h: h };
    });
    groups().forEach(function (g) { g.querySelector(".u-gbtn").removeAttribute("data-cur"); });
    if (mbtn) mbtn.removeAttribute("data-cur");
    if (best) {
      [].forEach.call(N.querySelectorAll("a[href='" + best.h + "']"), function (x) { if (!x.closest(".u-links") || x.closest(".u-drop")) x.setAttribute("aria-current", "page"); });
      var g = best.a.closest(".u-group");
      if (g) g.querySelector(".u-gbtn").setAttribute("data-cur", "");
      else if (mbtn) mbtn.setAttribute("data-cur", "");
    }
  }

  /* ---------- group dropdowns / accordions ---------- */
  function setG(g, o) { g.classList.toggle("open", !!o); g.querySelector(".u-gbtn").setAttribute("aria-expanded", o ? "true" : "false"); }
  function shut(except) { groups().forEach(function (g) { if (g !== except) setG(g, false); }); }
  groups().forEach(function (g) {
    var b = g.querySelector(".u-gbtn"), t = 0;
    b.addEventListener("click", function (e) { e.stopPropagation(); clearTimeout(t); var o = b.getAttribute("aria-expanded") === "true"; if (!mob()) shut(g); setG(g, !o); });
    g.addEventListener("keydown", function (e) {
      var I = [].slice.call(g.querySelectorAll(".u-drop a")), i = I.indexOf(document.activeElement);
      if (e.key === "Escape" && g.classList.contains("open") && !mob()) { setG(g, false); b.focus(); e.preventDefault(); e.stopPropagation(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); if (!g.classList.contains("open")) { if (!mob()) shut(g); setG(g, true); } var n = I[i < 0 ? 0 : Math.min(I.length - 1, i + 1)]; if (n) n.focus(); }
      else if (e.key === "ArrowUp" && i >= 0) { e.preventDefault(); (i ? I[i - 1] : b).focus(); }
    });
    g.addEventListener("focusout", function (e) { if (!mob() && !g.contains(e.relatedTarget)) setG(g, false); });
    if (window.matchMedia("(hover:hover) and (pointer:fine)").matches) {
      g.addEventListener("mouseenter", function () { clearTimeout(t); if (!mob() && !g.classList.contains("open")) { shut(g); setG(g, true); } });
      g.addEventListener("mouseleave", function () { if (mob()) return; clearTimeout(t); t = setTimeout(function () { if (!g.contains(document.activeElement)) setG(g, false); }, 150); });
    }
  });

  /* ---------- phone drawer ---------- */
  var isOpen = function () { return N.classList.contains("u-open"); };
  function focusables() {
    return [bur].concat([].slice.call(panel.querySelectorAll("a[href],button")).filter(visible));
  }
  function drawer(o, focusBack) {
    N.classList.toggle("u-open", !!o);
    bur.setAttribute("aria-expanded", o ? "true" : "false");
    bur.setAttribute("aria-label", o ? L.close || "Menü schließen" : L.open || "Menü öffnen");
    root.classList.toggle("u-lock", !!o && mob());
    if (o) {
      var c = N.querySelector(".u-gbtn[data-cur]");
      shut(c && c.parentNode);
      if (c) setG(c.parentNode, true);
      var f = focusables()[1];
      if (f) f.focus();
    } else {
      shut();
      if (focusBack) bur.focus();
    }
  }
  bur.addEventListener("click", function (e) { e.stopPropagation(); drawer(!isOpen()); });
  N.addEventListener("keydown", function (e) {
    if (e.key !== "Tab" || !isOpen() || !mob()) return;
    var F = focusables(), i = F.indexOf(document.activeElement);
    if (e.shiftKey && i <= 0) { e.preventDefault(); F[F.length - 1].focus(); }
    else if (!e.shiftKey && i === F.length - 1) { e.preventDefault(); F[0].focus(); }
  });
  mq.addEventListener("change", function () { if (isOpen()) drawer(false); closeMenu(); });

  /* ---------- account ---------- */
  var slot = N.querySelector("[data-u-acct]"), me = N.querySelector("[data-u-me]"), menu = null, mbtn = null;
  function el(tag, cls, text) { var x = document.createElement(tag); if (cls) x.className = cls; if (text != null) x.textContent = text; return x; }
  function img(src, fb) {
    var i = el("img"); i.alt = ""; i.width = 30; i.height = 30;
    i.onerror = function () { this.onerror = null; if (String(this.src || "").slice(-fb.length) !== fb) this.src = fb; };
    i.src = src || fb; return i;
  }
  function icon(id) { var i = el("img"); i.alt = ""; i.width = 20; i.height = 20; i.src = "/mc-icon/v2/" + id; return i; }
  function link(href, text, cls, ic) { var a = el("a", cls); a.href = href; if (ic) a.append(icon(ic)); a.append(document.createTextNode(text)); return a; }
  var openMenu = function () { return !!(menu && menu.parentNode.classList.contains("open")); };
  function setMenu(o) {
    if (!menu) return;
    menu.parentNode.classList.toggle("open", !!o);
    mbtn.setAttribute("aria-expanded", o ? "true" : "false");
    if (o) { var a = menu.querySelector("a"); if (a) setTimeout(function () { a.focus(); }, 20); }
  }
  function closeMenu() { setMenu(false); }
  var DISCORD = '<svg viewBox="0 0 71 55" fill="currentColor" aria-hidden="true" focusable="false"><path d="M60.1 4.9A58.5 58.5 0 0045.4.4a40 40 0 00-1.9 3.8 54 54 0 00-16.2 0A40 40 0 0025.4.4 58.4 58.4 0 0010.7 4.9C1.4 18.7-1.1 32.2.1 45.5a59 59 0 0018 9.1 43 43 0 003.8-6.2 38 38 0 01-6-2.9l1.5-1.1a42 42 0 0036 0l1.5 1.1a38 38 0 01-6 2.9 43 43 0 003.8 6.2 58.7 58.7 0 0018-9.1c1.5-15.4-2.5-28.8-10.6-40.6zM23.7 37.3c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2 6.5 3.3 6.4 7.2c0 4-2.8 7.2-6.4 7.2zm23.6 0c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2 6.5 3.3 6.4 7.2c0 4-2.8 7.2-6.4 7.2z"/></svg>';
  function httpsUrl(u) { try { var x = new URL(String(u || "")); return x.protocol === "https:" && !x.username && !x.password ? x.href : ""; } catch (e) { return ""; } }

  function render(d) {
    var nx = encodeURIComponent(location.href);
    slot.replaceChildren(); me.replaceChildren();
    if (d && d.user) {
      var nm = d.user.mc_name && /^[A-Za-z0-9_]{1,16}$/.test(d.user.mc_name) ? d.user.mc_name : "";
      var fb = isMc ? "/mc-head/MHF_Steve/64?v=5" : "https://cdn.discordapp.com/embed/avatars/0.png";
      var pic = isMc ? (nm ? "/mc-head/" + nm + "/64?v=5" : "") : httpsUrl(d.user.avatar);
      var label = isMc ? nm || String(d.user.name || "") : String(d.user.name || "");
      var out = base + "/auth/discord/logout?next=" + nx;
      var wrap = el("div", "u-ac");
      mbtn = el("button", "u-acct"); mbtn.type = "button"; mbtn.id = "umb";
      mbtn.setAttribute("aria-haspopup", "menu"); mbtn.setAttribute("aria-expanded", "false"); mbtn.setAttribute("aria-controls", "umm");
      mbtn.setAttribute("aria-label", (L.account || "Konto") + ": " + label);
      mbtn.append(img(pic, fb), el("span", "u-name", label));
      mbtn.insertAdjacentHTML("beforeend", '<svg class="u-chev" viewBox="0 0 10 10" aria-hidden="true" focusable="false"><path d="M1 3h2v2h2v2h0V5h2V3h2v2H7v2H5v2h0V7H3V5H1z" fill="currentColor"/></svg>');
      menu = el("div", "u-menu"); menu.id = "umm"; menu.setAttribute("role", "menu");
      var items = (L.menu || []).map(function (m) { var a = link(m[0], m[1], "", m[2]); a.setAttribute("role", "menuitem"); return a; });
      var lo = link(out, L.logout || "Abmelden", "u-out"); lo.setAttribute("role", "menuitem");
      menu.append.apply(menu, items.concat([el("hr"), lo]));
      wrap.append(mbtn, menu); slot.append(wrap);
      mbtn.addEventListener("click", function (e) { e.stopPropagation(); if (mob()) { drawer(true); return; } setMenu(!openMenu()); });
      menu.addEventListener("keydown", function (e) {
        var A = [].slice.call(menu.querySelectorAll("a")), i = A.indexOf(document.activeElement);
        if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); A[(i + (e.key === "ArrowDown" ? 1 : A.length - 1)) % A.length].focus(); }
      });
      /* Phone drawer (mockup): avatar + name link to the profile, Abmelden on the right; no extra link row. */
      var prof = (L.menu || [])[0], who = el("a", "u-me__who");
      who.href = prof ? prof[0] : "/profile"; who.setAttribute("aria-label", (prof ? prof[1] : "Profil") + ": " + label);
      who.append(img(pic, fb), el("span", "", label));
      var ml = el("div", "u-me__links"); ml.append(link(out, L.logout || "Abmelden", "u-out"));
      me.append(who, ml);
    } else if (d && d.available) {
      var a = el("a", "u-login"); a.href = base + "/auth/discord/login?next=" + nx;
      a.setAttribute("aria-label", L.login || "Anmelden");
      a.insertAdjacentHTML("beforeend", DISCORD); a.append(el("span", "u-txt", L.login || "Anmelden"));
      slot.append(a);
    } else if (d) {
      var s = el("span", "u-login", L.soon || "Login bald"); s.setAttribute("aria-disabled", "true");
      slot.append(s);
    }
    mark();
    window.__me = d;
    document.dispatchEvent(new CustomEvent("me", { detail: d }));
  }
  fetch("/api/me", { credentials: "include" }).then(function (r) { return r.json(); }).then(render).catch(function () {});

  /* ---------- global keys and clicks ---------- */
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (openMenu()) { setMenu(false); mbtn.focus(); }
    else if (isOpen()) drawer(false, true);
    else shut();
  });
  document.addEventListener("click", function (e) {
    if (menu && !menu.parentNode.contains(e.target)) setMenu(false);
    if (!N.contains(e.target)) { shut(); if (isOpen()) drawer(false); }
  });
  mark();
})();
