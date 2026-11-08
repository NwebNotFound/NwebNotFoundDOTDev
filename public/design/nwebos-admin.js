/* NwebOS Verwaltung window (admin only: the server renders it, its entry points and /api/admin only for admins).
   Design: mockups/nwebos/apps/admin (one list + edit pattern). Loaded by the shell on the first open of the admin
   window (docs/nwebos-modules.md).
   Saving (D1 budget, Planner 08.11.): content that is public at once (texts, projects, live news) is saved with the
   button (or Ctrl/⌘+S); typing only keeps a local draft in this browser. Drafts (news) save to D1 1.5 s after the
   last change, and only when something changed. Every save sends the version it started from; a 409 shows the
   "changed in another tab" banner instead of overwriting. Markdown previews use the server's sanitised renderer. */
(function () {
  "use strict";
  var API = "/api/admin";
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  function call(method, path, body) {
    return fetch((path.charAt(0) === "/" && path.indexOf("/api/") === 0 ? "" : API) + path, { method: method, credentials: "same-origin", headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { s: r.status, j: j }; }); }, function () { return { s: 0, j: {} }; });
  }
  function mountAdmin(el, ctx) {
    var en = ctx.lang === "en", T = function (d, e) { return en ? e : d; };
    var $ = function (s, r) { return (r || el).querySelector(s); }, $$ = function (s, r) { return [].slice.call((r || el).querySelectorAll(s)); };
    var SPR = (document.querySelector('link[href*="nwebos-admin.css"]') ? "" : "") + "/design/nwebos-icons.svg";
    var spr = function (k, n) { return '<svg width="' + (n || 16) + '" height="' + (n || 16) + '" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><use href="' + SPR + "#i-" + k + '"/></svg>'; };
    var ic = function (k, n) { var t = document.getElementById("ic-" + k); return t ? t.innerHTML.replace(/width="\d+" height="\d+"/, 'width="' + (n || 16) + '" height="' + (n || 16) + '"') : spr(k, n); };
    var hm = function (ms) { return new Date(ms).toLocaleTimeString(en ? "en-GB" : "de-DE", { hour: "2-digit", minute: "2-digit" }); };
    var when = function (ms) { if (!ms) return ""; var d = new Date(ms), t = new Date(); return d.toDateString() === t.toDateString() ? T("heute ", "today ") + hm(ms) : d.toLocaleDateString(en ? "en-GB" : "de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }); };
    var dmy = function (iso) { return iso ? iso.slice(8, 10) + "." + iso.slice(5, 7) + "." + iso.slice(0, 4) : ""; };
    var toast = function (k, a, b) { if (window.NwebOS && NwebOS.toast) NwebOS.toast(k, a, b); };
    var go = function (url) { if (window.NwebOS && NwebOS.open) NwebOS.open(url); else location.href = url; };
    var base = en ? "/en/admin" : "/admin";
    var SEC = {
      home: { icon: "about", t: T("Startseite & Über mich", "Home & About me") },
      projects: { icon: "portfolio", t: T("Projekte", "Projects") },
      blog: { icon: "blog", t: "Blog", url: (en ? "/en" : "") + "/blog/admin" },
      writing: { icon: "writing", t: T("Texte & Kapitel", "Writing & chapters"), soon: T("kommt mit den Texten in D1", "comes with writing in D1") },
      studio: { icon: "music", t: "Studio", soon: T("kommt mit dem Studio", "comes with the Studio") },
      changelog: { icon: "changelog", t: T("Neuigkeiten", "What's new") },
      guestbook: { icon: "guestbook", t: T("Gästebuch", "Guestbook") },
      pixelwand: { icon: "soon", t: "Pixelwand", soon: T("kommt mit der Pixelwand", "comes with the pixel wall") },
      mc: { icon: "minecraft", t: T("Minecraft-Admin", "Minecraft admin"), out: "https://mc.nwebnotfound.dev/vip" },
    };
    var ORDER = ["home", "projects", "blog", "writing", "studio", "changelog", "guestbook", "pixelwand", "mc"];
    var counts = null, cur = null;   // cur = the open editor: { dirty(), save(), publish(), back() }
    var me = (window.__me && window.__me.user) || {};

    function nav(active) {
      return '<nav class="ad-nav" aria-label="' + T("Verwaltung", "Admin") + '"><div class="ad-me"><img alt="" src="' + esc(/^https:\/\//.test(me.avatar || "") ? me.avatar : "https://cdn.discordapp.com/embed/avatars/0.png") + '"><span><b>' + esc(me.name || "Admin") + "</b><small>ADMIN</small></span></div>" +
        '<a href="' + base + '" data-go=""' + (active === "" ? ' aria-current="page"' : "") + ">" + ic("admin", 20) + T("Übersicht", "Overview") + '</a><span class="sep"></span>' +
        ORDER.map(function (k) { var s = SEC[k], n = badge(k); return (k === "mc" ? '<span class="sep"></span>' : "") + '<a href="' + esc(s.out || s.url || base + "/" + k) + '"' + (s.out ? ' target="_blank" rel="noopener"' : s.url ? ' data-url="' + esc(s.url) + '"' : s.soon ? ' class="soon" aria-disabled="true"' : ' data-go="' + k + '"') + (active === k ? ' aria-current="page"' : "") + ">" + ic(s.icon, 20) + esc(s.t) + (n ? '<em class="n">' + n + "</em>" : s.out ? "<em>↗</em>" : "") + "</a>"; }).join("") + "</nav>";
    }
    function badge(k) { if (!counts) return 0; if (k === "blog") return counts.blog.drafts; if (k === "guestbook") return counts.guestbook.new + counts.guestbook.reported; return 0; }
    function sub(k) {
      var c = counts, s = SEC[k]; if (s.soon) return s.soon; if (s.out) return "mc.nwebnotfound.dev/vip"; if (!c) return "";
      if (k === "home") return T("Texte, Steckbrief, XP", "texts, profile card, XP");
      if (k === "projects") return c.projects + T(c.projects === 1 ? " Projekt" : " Projekte", c.projects === 1 ? " project" : " projects");
      if (k === "blog") return c.blog.drafts + T(c.blog.drafts === 1 ? " Entwurf" : " Entwürfe", c.blog.drafts === 1 ? " draft" : " drafts") + " · " + c.blog.live + " live";
      if (k === "changelog") return c.changelog.all + T(" Einträge", " entries") + (c.changelog.drafts ? " · " + c.changelog.drafts + T(" Entwurf", " draft") : "");
      if (k === "guestbook") return c.guestbook.new + T(" neu · ", " new · ") + c.guestbook.reported + T(" gemeldet", " reported");
      return "";
    }
    function pill(k) { return '<span class="ad-pill ' + k + '">' + ({ live: "Live", draft: T("Entwurf", "Draft"), off: T("Zurückgezogen", "Withdrawn"), rep: T("Gemeldet", "Reported"), hid: T("Ausgeblendet", "Hidden") })[k] + "</span>"; }
    function langs(de, enOk) { return '<span class="ad-lang"><i class="' + (de ? "ok" : "") + '">DE</i><i class="' + (enOk ? "ok" : "") + '">EN</i></span>'; }
    function row(ico, t, s, end, attrs) { return '<li class="ad-row' + (attrs ? " go" : "") + '"' + (attrs || "") + '><span class="ico">' + ico + "</span><span><b>" + esc(t) + "</b><small>" + esc(s) + '</small></span><span class="end">' + (end || "") + "</span></li>"; }
    function head(t, n, add) { return '<button type="button" class="ad-back" data-go="">' + spr("c-back", 18) + T("Übersicht", "Overview") + '</button><div class="ad-h"><h2>' + esc(t) + "</h2><small>" + esc(n) + "</small>" + (add ? '<button type="button" class="xpbtn go" data-new>' + spr("c-plus", 16) + " " + esc(add) + "</button>" : "") + "</div>"; }
    function ib(k, label, attrs, cls) { return '<button type="button" class="ad-ib' + (cls ? " " + cls : "") + '" aria-label="' + esc(label) + '"' + attrs + ">" + spr(k, 20) + "</button>"; }

    /* ---------- address + frame ---------- */
    function setAddr(p) {
      var full = base + (p ? "/" + p : ""), sec = document.getElementById("app-admin");
      if (sec) sec.dataset.path = "/admin" + (p ? "/" + p : "");
      if (location.pathname !== full) history.replaceState(history.state, "", full);
    }
    function frame(active, main) {
      el.innerHTML = '<div class="ad">' + nav(active) + '<div class="ad-main">' + main + "</div></div>";
    }
    function leave(fn) {   // unsaved changes stay in the local draft; just make sure nothing is lost silently
      if (cur && cur.dirty && cur.dirty() && !cur.localOnly) { cur.flush && cur.flush(); }
      cur = null; fn();
    }
    function open(p) {
      var m = /^(home|projects|changelog|guestbook)(?:\/(\d{1,9}|new))?$/.exec(p || "");
      leave(function () {
        setAddr(m ? p : "");
        if (!m) return overview();
        if (m[1] === "home") return editHome();
        if (m[1] === "guestbook") return guestbook("new");
        if (m[2]) return editItem(m[1], m[2]);
        return list(m[1]);
      });
    }
    el.addEventListener("click", function (e) {
      var a = e.target.closest("[data-go],[data-url],[data-open-item]");
      if (!a || !el.contains(a) || e.ctrlKey || e.metaKey || e.shiftKey) return;
      e.preventDefault();
      if (a.hasAttribute("data-url")) return go(a.getAttribute("data-url"));
      if (a.hasAttribute("data-open-item")) return open(a.getAttribute("data-open-item"));
      open(a.getAttribute("data-go"));
    });
    el.addEventListener("keydown", function (e) {
      if (document.querySelector(".shx")) return;
      var mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === "s" || e.key === "S") && cur && cur.save) { e.preventDefault(); e.stopPropagation(); cur.save(true); }
      else if (mod && e.key === "Enter" && cur && cur.publish) { e.preventDefault(); e.stopPropagation(); cur.publish(); }
      else if (e.key === "Escape" && cur && cur.back) { e.preventDefault(); e.stopPropagation(); cur.back(); }
    });

    /* ---------- overview ---------- */
    function overview() {
      var paint = function (recent) {
        frame("", '<div class="ad-scroll"><div class="ad-h"><h2>' + esc(T("Hallo, ", "Hi, ") + (me.name || "Nils")) + "</h2><small>" + T("Hier bearbeitest du alles auf nwebnotfound.dev.", "Edit everything on nwebnotfound.dev here.") + "</small></div>" +
          '<div class="ad-tiles">' + ORDER.map(function (k) {
            var s = SEC[k], n = badge(k), inner = ic(s.icon, 40) + "<b>" + esc(s.t) + "</b><small>" + esc(sub(k)) + "</small>" + (n ? '<span class="n">' + n + "</span>" : "");
            if (s.out) return '<a class="ad-tile out" href="' + esc(s.out) + '" target="_blank" rel="noopener">' + inner + "</a>";
            if (s.soon) return '<div class="ad-tile soon" aria-disabled="true">' + inner + "</div>";
            return '<a class="ad-tile" href="' + esc(s.url || base + "/" + k) + '"' + (s.url ? ' data-url="' + esc(s.url) + '"' : ' data-go="' + k + '"') + ">" + inner + "</a>";
          }).join("") + "</div>" +
          (recent && recent.length ? '<p class="ad-sec">' + T("Zuletzt bearbeitet", "Recently edited") + '</p><ul class="ad-list">' + recent.map(function (r) {
            var s = SEC[r.section] || SEC.home, t = r.section === "home" ? T("Startseite: ", "Home: ") + ({ "home.hero": T("Einleitung", "lead"), "home.facts": T("Steckbrief", "profile card"), "home.xp": "XP", "about.text": T("Über mich", "about me") }[r.title] || r.title) : r.title;
            var target = r.section === "blog" ? ' data-url="' + esc((en ? "/en" : "") + "/blog/admin/" + r.id) + '"' : ' data-open-item="' + (r.section === "home" ? "home" : r.section + "/" + r.id) + '"';
            return row(ic(s.icon, 28), t, s.t + " · " + when(r.updated_at), pill(r.status === "published" || r.status === "live" ? "live" : r.status === "withdrawn" ? "off" : "draft"), target);
          }).join("") + "</ul>" : "") + "</div>");
      };
      paint(null);
      call("GET", "/overview").then(function (r) { if (r.s === 200) { counts = r.j; paint(r.j.recent); } else if (r.s === 503) paint(null); });
    }

    /* ---------- lists ---------- */
    function list(k) {
      var items = [], filter = "", q = "";
      var draw = function () {
        var sc = $(".ad-scroll"), keep = sc ? sc.scrollTop : 0;
        var vis = items.filter(function (r) { return (!filter || r.status === filter) && (!q || (r.title_de + " " + (r.title_en || "") + " " + (r.text_de || "")).toLowerCase().indexOf(q) >= 0); });
        var rows = vis.map(function (r, i) {
          if (k === "projects") return row(ic(document.getElementById("ic-" + r.icon) ? r.icon : "portfolio", 28), r.title_de, r.status + " · " + r.progress + " / 10", langs(1, r.title_en) + (filter || q ? "" : '<span class="ad-up">' + ib("c-up", T("Nach oben", "Move up"), ' data-mv="-1" data-i="' + i + '"' + (i === 0 ? " disabled" : "")) + ib("c-down", T("Nach unten", "Move down"), ' data-mv="1" data-i="' + i + '"' + (i === vis.length - 1 ? " disabled" : "")) + "</span>") + ib("pen", T("Bearbeiten", "Edit"), ' data-open-item="projects/' + r.id + '"'), ' data-open-item="projects/' + r.id + '"');
          return row(ic("changelog", 28), r.title_de, dmy(r.day) + " · " + ({ website: "Website", server: "Server", blog: "Blog" }[r.area] || r.area), langs(1, r.title_en) + pill(r.status === "live" ? "live" : "draft") + ib("pen", T("Bearbeiten", "Edit"), ' data-open-item="changelog/' + r.id + '"'), ' data-open-item="changelog/' + r.id + '"');
        }).join("");
        var chips = k === "changelog" ? '<div class="ad-chips" style="margin-bottom:10px">' + [["", T("Alle", "All")], ["draft", T("Entwurf", "Draft")], ["live", "Live"]].map(function (c) { var n = c[0] ? items.filter(function (r) { return r.status === c[0]; }).length : items.length; return '<button type="button" class="ad-chip" data-f="' + c[0] + '" aria-pressed="' + (filter === c[0]) + '">' + c[1] + " <em>" + n + "</em></button>"; }).join("") + "</div>" : "";
        var main = '<div class="ad-scroll">' + (k === "projects" ? head(T("Projekte", "Projects"), T("Reihenfolge = Reihenfolge auf der Seite", "order = order on the site"), T("Neues Projekt", "New project"))
          : head(T("Neuigkeiten", "What's new"), items.length + T(" Einträge · Server-Einträge kommen aus mc-changelog", " entries · server entries come from mc-changelog"), T("Neuer Eintrag", "New entry"))) +
          '<div class="ad-tools"><input type="search" placeholder="' + T("Suchen …", "Search …") + '" aria-label="' + T("Suchen", "Search") + '" value="' + esc(q) + '" data-q></div>' + chips +
          (rows ? '<ul class="ad-list">' + rows + "</ul>" : '<p class="ad-empty">' + (items.length ? T("Nichts gefunden.", "Nothing found.") : T("Noch nichts hier. Lege den ersten Eintrag an.", "Nothing here yet. Add the first one.")) + "</p>") + "</div>";
        frame(k, main);
        if (!items.length) { var nb = $("[data-new]"); if (nb) nb.remove(); $(".ad-empty").outerHTML = seedMissing(); }
        var s2 = $(".ad-scroll"); if (s2) s2.scrollTop = keep;
        var qi = $("[data-q]"); qi.addEventListener("input", function () { q = qi.value.trim().toLowerCase(); var pos = qi.selectionStart; draw(); var n = $("[data-q]"); n.focus(); try { n.setSelectionRange(pos, pos); } catch (e) {} });
        $$("[data-f]").forEach(function (b) { b.onclick = function () { filter = b.getAttribute("data-f"); draw(); }; });
        var nb2 = $("[data-new]"); if (nb2) nb2.onclick = function () { open(k + "/new"); };
        $$("[data-mv]").forEach(function (b) { b.onclick = function (e) { e.stopPropagation(); move(+b.getAttribute("data-i"), +b.getAttribute("data-mv")); }; });
      };
      var move = function (i, d) {   // the order on the site: renumber 1..n and save only the rows whose place changed
        var j = i + d; if (j < 0 || j >= items.length) return;
        var a = items.slice(); var t = a[i]; a[i] = a[j]; a[j] = t;
        var jobs = a.map(function (r, n) { return r.sort === n + 1 ? null : function () { return call("PATCH", "/projects/" + r.id, { sort: n + 1, version: r.version }).then(function (x) { if (x.s === 200) { r.sort = n + 1; r.version = x.j.item.version; } else throw x; }); }; }).filter(Boolean);
        jobs.reduce(function (p, f) { return p.then(f); }, Promise.resolve()).then(function () { items = a; draw(); toast("ok", T("Reihenfolge gespeichert", "Order saved")); }, function () { toast("err", T("Nicht gespeichert – lade die Liste neu.", "Not saved – reload the list.")); load(); });
      };
      var load = function () { call("GET", "/" + k).then(function (r) { if (r.s === 200) { items = r.j.items || []; draw(); } else frame(k, '<div class="ad-scroll"><p class="ad-err">' + T("Konnte nicht laden", "Could not load") + (r.s === 503 ? T(" (Migration 0019 fehlt)", " (migration 0019 missing)") : "") + "</p></div>"); }); };
      frame(k, '<div class="ad-scroll"><p class="ad-empty">' + T("Lädt …", "Loading …") + "</p></div>");
      load();
    }

    /* ---------- guestbook moderation ---------- */
    function guestbook(f) {
      var paint = function (j) {
        var c = j.counts || {}, items = j.items || [];
        frame("guestbook", '<div class="ad-scroll">' + head(T("Gästebuch", "Guestbook"), c.all + T(" Einträge · ", " entries · ") + c.new + T(" neu", " new")) +
          '<div class="ad-chips" style="margin-bottom:10px">' + [["new", T("Neu", "New"), c.new], ["all", T("Alle", "All"), c.all], ["reported", T("Gemeldet", "Reported"), c.reported], ["hidden", T("Ausgeblendet", "Hidden"), c.hidden]].map(function (x) { return '<button type="button" class="ad-chip" data-gf="' + x[0] + '" aria-pressed="' + (f === x[0]) + '">' + x[1] + " <em>" + (x[2] || 0) + "</em></button>"; }).join("") + "</div>" +
          (items.length ? '<div class="ad-list">' + items.map(function (x) {
            return '<div class="ad-msg' + (x.hidden ? " hid" : "") + '" data-id="' + x.id + '"><span class="av" aria-hidden="true">' + esc((x.name || "?").charAt(0).toUpperCase()) + '</span><div><div class="bub"><b>' + esc(x.name) + '</b> <small style="color:var(--mut2)">' + esc(dmy(String(x.created_at).slice(0, 10)) + " " + String(x.created_at).slice(11, 16)) + "</small> " + (x.reported ? pill("rep") : "") + (x.hidden ? pill("hid") : "") + "<br>" + esc(x.message) + "</div>" +
              '<div class="act"><button type="button" class="xpbtn" data-gh="' + (x.hidden ? "unhide" : "hide") + '">' + spr("c-eye", 16) + " " + (x.hidden ? T("Einblenden", "Show") : T("Ausblenden", "Hide")) + '</button><button type="button" class="xpbtn dzo" data-gd>' + spr("c-del", 16) + " " + T("Löschen", "Delete") + "</button></div></div></div>";
          }).join("") + "</div>" : '<p class="ad-empty">' + T("Keine Einträge in dieser Ansicht.", "No entries in this view.") + "</p>") + "</div>");
        $$("[data-gf]").forEach(function (b) { b.onclick = function () { f = b.getAttribute("data-gf"); load(); }; });
        $$("[data-gh]").forEach(function (b) { b.onclick = function () { var id = b.closest("[data-id]").getAttribute("data-id"), a = b.getAttribute("data-gh"); b.disabled = true; call("POST", "/guestbook/" + id + "/" + a).then(function (r) { if (r.s === 200) { toast("ok", a === "hide" ? T("Ausgeblendet", "Hidden") : T("Wieder sichtbar", "Visible again")); load(); } else { b.disabled = false; toast("err", T("Nicht geändert", "Not changed")); } }); }; });
        $$("[data-gd]").forEach(function (b) { b.onclick = function () {
          var box = b.closest("[data-id]"), id = box.getAttribute("data-id"), who = $("b", box).textContent;
          NwebOS.ask({ title: T("Eintrag löschen?", "Delete this entry?"), text: T("Der Eintrag von „" + who + "“ wird gelöscht. Das geht nicht rückgängig. Tipp: „Ausblenden“ nimmt ihn nur offline.", "The entry by “" + who + "” is deleted. This can't be undone. Tip: “Hide” only takes it offline."), yes: T("Endgültig löschen", "Delete for good"), no: T("Behalten", "Keep"), danger: true, stack: true, icon: spr("c-del", 48) })
            .then(function (ok) { if (!ok) return; call("DELETE", "/guestbook/" + id).then(function (r) { if (r.s === 200) { toast("ok", T("Gelöscht", "Deleted")); load(); } else toast("err", T("Nicht gelöscht", "Not deleted")); }); });
        }; });
      };
      var load = function () { call("GET", "/guestbook?filter=" + f).then(function (r) { if (r.s === 200) paint(r.j); else frame("guestbook", '<div class="ad-scroll"><p class="ad-err">' + T("Konnte nicht laden", "Could not load") + "</p></div>"); }); };
      frame("guestbook", '<div class="ad-scroll"><p class="ad-empty">' + T("Lädt …", "Loading …") + "</p></div>");
      load();
    }

    /* ---------- the one edit pattern ---------- */
    function bar(o) {
      return '<div class="ad-bar"><button type="button" class="ad-back" style="margin:0" data-back>' + spr("c-back", 18) + esc(o.back) + '</button><span data-pill>' + (o.pill ? pill(o.pill) : "") + '</span><span class="sp"></span><span class="save ing" data-save aria-live="polite"><i></i>' + T("Lädt …", "Loading …") + '</span>' +
        (o.pv ? '<button type="button" class="xpbtn pv" data-pv>' + spr("c-eye", 16) + " " + T("Ansehen", "View") + "</button>" : "") + (o.extra || "") + '<button type="button" class="xpbtn go" data-primary>' + esc(o.primary) + "</button></div>";
    }
    function tabs() { return '<div class="ad-tabs" role="group" aria-label="' + T("Sprache", "Language") + '"><button type="button" data-lt="de" aria-pressed="true">Deutsch</button><button type="button" data-lt="en" aria-pressed="false">English<i data-enmiss title="' + T("fehlt noch", "missing") + '" hidden></i></button></div>'; }
    function fl(label, inner, hint, attrs) { return '<label class="ad-fl"' + (attrs || "") + "><span>" + esc(label) + (hint != null ? " <em>" + (hint ? "· " + esc(hint) : "") + "</em>" : "") + "</span>" + inner + "</label>"; }
    function seg(name, opts, val) { return '<span class="ad-seg" role="group" data-seg="' + name + '">' + opts.map(function (o) { return '<button type="button" data-v="' + esc(o[0]) + '" aria-pressed="' + (o[0] === val) + '">' + esc(o[1]) + "</button>"; }).join("") + "</span>"; }
    var MKC = ["#ffd23f", "#7ad3ff", "#b9a8ff", "#ff9ec7"];
    function md(name, label, marks) {
      var tb = [["**", "**", "B"], ["*", "*", "I"], ["\n## ", "\n", "H2"], ["\n### ", "\n", "H3"], ["[", "](https://)", "Link"], ["\n> ", "\n", T("Hinweis", "Note")], ["`", "`", "Code"], ["\n- ", "\n", T("Liste", "List")]];
      return '<div class="ad-fl"><span>' + esc(label) + ' <em>· Markdown</em></span><div class="ad-md" data-md="' + name + '"><div class="tb" role="toolbar" aria-label="' + T("Formatieren", "Format") + '"><span class="ad-seg mdsw" role="group"><button type="button" data-mdv="w" aria-pressed="true">' + T("Schreiben", "Write") + '</button><button type="button" data-mdv="p" aria-pressed="false">' + T("Vorschau", "Preview") + "</button></span>" +
        tb.map(function (b, i) { return '<button type="button" data-ins="' + i + '">' + esc(b[2]) + "</button>"; }).join("") +
        (marks ? MKC.map(function (c, i) { return '<button type="button" class="mk" data-mk="' + (i + 1) + '" style="background:' + c + '" aria-label="' + T("Markieren ", "Highlight ") + (i + 1) + '"></button>'; }).join("") : "") + "</div>" +
        '<textarea class="ad-ta" rows="7" name="' + name + '" aria-label="' + esc(label) + '"></textarea><div class="ad-pv pvw" data-pvw></div></div></div>';
    }
    /* wires a markdown block: toolbar, phone write/preview switch, debounced server preview */
    function wireMd(box, onInput) {
      var ta = $("textarea", box), pv = $("[data-pvw]", box), t = null, TB = [["**", "**"], ["*", "*"], ["\n## ", "\n"], ["\n### ", "\n"], ["[", "](https://)"], ["\n> ", "\n"], ["`", "`"], ["\n- ", "\n"]];
      var render = function () {
        var src = ta.value;
        call("POST", "/api/blog/admin/render", { md: src.replace(/\[\[([^\]|]+)\|([1-4])\]\]/g, "$1") }).then(function (r) {
          if (r.s !== 200) return;
          var html = r.j.html || "";
          /* marker colours: wrap the (already escaped) words the server returned; no raw HTML from the field */
          (src.match(/\[\[([^\]|]+)\|([1-4])\]\]/g) || []).forEach(function (m) { var p = /\[\[([^\]|]+)\|([1-4])\]\]/.exec(m), w = esc(p[1]); html = html.replace(w, '<mark style="--c:' + MKC[+p[2] - 1] + '">' + w + "</mark>"); });
          pv.innerHTML = html;
        });
      };
      var wrap = function (a, b) { var s = ta.selectionStart, e = ta.selectionEnd, v = ta.value; ta.value = v.slice(0, s) + a + v.slice(s, e) + b + v.slice(e); ta.focus(); ta.setSelectionRange(s + a.length, e + a.length); ta.dispatchEvent(new Event("input", { bubbles: true })); };
      $$("[data-ins]", box).forEach(function (b) { b.onclick = function () { var x = TB[+b.getAttribute("data-ins")]; wrap(x[0], x[1]); }; });
      $$("[data-mk]", box).forEach(function (b) { b.onclick = function () { wrap("[[", "|" + b.getAttribute("data-mk") + "]]"); }; });
      $$("[data-mdv]", box).forEach(function (b) { b.onclick = function () { var p = b.getAttribute("data-mdv") === "p"; box.classList.toggle("showpv", p); $$("[data-mdv]", box).forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); }); if (p) render(); }; });
      ta.addEventListener("input", function () { clearTimeout(t); t = setTimeout(render, 600); if (onInput) onInput(); });
      return { set: function (v) { ta.value = v || ""; render(); }, get: function () { return ta.value; } };
    }
    function wireSeg(box, onChange) { $$("button", box).forEach(function (b) { b.onclick = function () { $$("button", box).forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); }); onChange(b.getAttribute("data-v")); }; }); }
    function segVal(box) { var b = $('button[aria-pressed="true"]', box); return b ? b.getAttribute("data-v") : ""; }
    function setSeg(box, v) { $$("button", box).forEach(function (x) { x.setAttribute("aria-pressed", String(x.getAttribute("data-v") === v)); }); }
    function saveState(state, at) {
      var s = $("[data-save]"); if (!s) return;
      s.className = "save" + (state === "ing" ? " ing" : "");
      s.innerHTML = "<i></i>" + esc(state === "ing" ? T("Speichert …", "Saving …") : state === "dirty" ? T("Nicht gespeichert", "Not saved") : state === "auto" ? T("✓ Automatisch gespeichert · ", "✓ Saved automatically · ") + hm(at || Date.now()) : state === "err" ? T("Nicht gespeichert – nochmal versuchen", "Not saved – try again") : T("✓ Gespeichert · ", "✓ Saved · ") + hm(at || Date.now()));
      if (state === "dirty" || state === "err") $("i", s).style.background = "var(--ad-draft)";
    }
    function banner(text, btn, fn) {
      var sc = $(".ad-scroll"); if (!sc || $(".ad-banner", sc)) return;
      sc.insertAdjacentHTML("afterbegin", '<div class="ad-banner" role="alert">⚠ ' + esc(text) + '<button type="button" class="xpbtn" data-bn>' + esc(btn) + "</button></div>");
      $("[data-bn]", sc).onclick = fn;
    }
    function fieldErr(fields) {
      var sc = $(".ad-scroll"); if (!sc) return; var old = $(".ad-err", sc); if (old) old.remove();
      if (!fields) return;
      var N = { title_de: T("Titel (DE)", "title (DE)"), title_en: T("Titel (EN)", "title (EN)"), text_de: T("Text (DE)", "text (DE)"), text_en: T("Text (EN)", "text (EN)"), href: "Link", day: T("Datum", "date"), status: "Status", progress: T("Fortschritt", "progress"), area: T("Bereich", "area"), icon: "Icon", name: "Name", lead: T("Einleitung", "lead") };
      sc.insertAdjacentHTML("afterbegin", '<p class="ad-err" role="alert">' + T("Bitte prüfen: ", "Please check: ") + esc(fields.map(function (f) { return N[f] || f; }).join(", ")) + "</p>");
    }
    /* Planner 08.11.: while a table is empty the site shows today's texts from the code (fallback). The first new row
       would replace that whole list, so creating waits for the seed migration (0020). */
    function seedMissing() { return '<p class="ad-err" role="alert" data-seed-missing>' + T("Startdaten fehlen: Die Seite zeigt noch die Texte aus dem Code. Neue Einträge gehen erst, wenn die Startdaten (Migration 0020) eingespielt sind.", "Start data missing: the site still shows the texts from the code. New entries work once the start data (migration 0020) is in.") + "</p>"; }
    function danger(what) { return '<div class="ad-danger"><button type="button" class="xpbtn dzo" data-del>' + spr("c-del", 16) + " " + T("Löschen", "Delete") + "</button><small>" + esc(what) + "</small></div>"; }
    /* local draft (this browser only, no D1 write) for content that is public on save */
    function local(key) {
      return { get: function () { try { return JSON.parse(ctx.store.get("draft." + key) || "null"); } catch (e) { return null; } },
        set: function (data) { ctx.store.set("draft." + key, JSON.stringify({ at: Date.now(), data: data })); }, clear: function () { ctx.store.set("draft." + key, null); } };
    }

    /* Startseite & Über mich: six text blocks (hero/facts/about per language, XP for both) */
    function editHome() {
      frame("home", bar({ back: T("Übersicht", "Overview"), pill: "live", primary: T("Aktualisieren", "Update"), pv: true }) + '<div class="ad-scroll">' + tabs() + '<div class="ad-f"><p class="ad-sec" style="margin:0">' + T("Startseite", "Home") + "</p>" +
        '<div class="ad-2">' + fl(T("Überzeile", "Eyebrow"), '<input class="ad-in" name="eyebrow" maxlength="80">') + fl("Name", '<input class="ad-in" name="name" maxlength="40">') + "</div>" +
        md("lead", T("Einleitung", "Lead"), true) +
        '<div class="ad-fl"><span>' + T("Steckbrief", "Profile card") + " <em>· " + T("max. 8 Zeilen", "max 8 rows") + '</em></span><ul class="ad-list ad-facts" data-facts></ul><button type="button" class="xpbtn" style="justify-self:start" data-addfact>' + spr("c-plus", 16) + " " + T("Zeile", "Row") + "</button></div>" +
        fl(T("XP bis zum nächsten Projekt", "XP to the next project"), '<input class="ad-rng" type="range" min="0" max="100" name="xp" style="--v:64">', "", ' data-xpl') +
        '<p class="ad-sec">' + T("Über mich (Fenster)", "About me (window)") + "</p>" + md("about", T("Über mich", "About me"), false) + "</div></div>");
      var L = "de", srv = null, data = {}, ver = {}, store = local("home"), dirty = {};
      var KEYS = [["home.hero", "de"], ["home.hero", "en"], ["home.facts", "de"], ["home.facts", "en"], ["home.xp", "*"], ["about.text", "de"], ["about.text", "en"]];
      var id = function (k, l) { return k + ":" + l; };
      var lead = wireMd($('[data-md="lead"]'), function () { grab(); }), about = wireMd($('[data-md="about"]'), function () { grab(); });
      var facts = function (rows) {
        $("[data-facts]").innerHTML = rows.map(function (r, i) { return '<li class="ad-row" data-fi="' + i + '"><input class="ad-in" data-fk value="' + esc(r.k) + '" maxlength="24" aria-label="' + T("Begriff", "Term") + '"><input class="ad-in" data-fv value="' + esc(r.v) + '" maxlength="80" aria-label="' + T("Text", "Text") + '"><span class="end">' + ib("c-up", T("Nach oben", "Move up"), ' data-fup' + (i ? "" : " disabled")) + ib("c-del", T("Zeile löschen", "Delete row"), " data-fdel", "dz") + "</span></li>"; }).join("");
        $$("[data-fi] input").forEach(function (x) { x.addEventListener("input", grab); });
        $$("[data-fup]").forEach(function (b) { b.onclick = function () { var i = +b.closest("[data-fi]").getAttribute("data-fi"), rs = readFacts(); var t = rs[i]; rs[i] = rs[i - 1]; rs[i - 1] = t; facts(rs); grab(); }; });
        $$("[data-fdel]").forEach(function (b) { b.onclick = function () { var rs = readFacts(); rs.splice(+b.closest("[data-fi]").getAttribute("data-fi"), 1); facts(rs); grab(); }; });
        $("[data-addfact]").disabled = rows.length >= 8;
      };
      var readFacts = function () { return $$("[data-fi]").map(function (li, i) { var old = (data[id("home.facts", L)] || { rows: [] }).rows[i] || {}; return { icon: old.icon || "heart", k: $("[data-fk]", li).value, v: $("[data-fv]", li).value }; }); };
      var show = function () {   // fill the form for language L
        var h = data[id("home.hero", L)] || {}, f = data[id("home.facts", L)] || { rows: [] }, a = data[id("about.text", L)] || {}, x = data["home.xp:*"] || { value: 0 };
        $('[name="eyebrow"]').value = h.eyebrow || ""; $('[name="name"]').value = h.name || ""; lead.set(h.lead || ""); about.set(a.md || "");
        facts(f.rows || []); var rng = $('[name="xp"]'); rng.value = Math.round((x.value || 0) * 100); rng.style.setProperty("--v", rng.value); $("[data-xpl] em").textContent = "· " + rng.value + " %";
        $("[data-enmiss]").hidden = !!(data[id("home.hero", "en")] && data[id("home.hero", "en")].lead);
      };
      var grab = function () {   // form -> data for language L; mark what changed
        data[id("home.hero", L)] = { eyebrow: $('[name="eyebrow"]').value, name: $('[name="name"]').value, lead: lead.get() };
        data[id("home.facts", L)] = { rows: readFacts() };
        data["home.xp:*"] = { value: +$('[name="xp"]').value / 100 };
        data[id("about.text", L)] = { md: about.get() };
        KEYS.forEach(function (k) { var i = id(k[0], k[1]); dirty[i] = JSON.stringify(data[i] || null) !== JSON.stringify(srv[i] || null); });
        store.set(data);
        saveState(isDirty() ? "dirty" : "saved");
      };
      var isDirty = function () { return KEYS.some(function (k) { return dirty[id(k[0], k[1])]; }); };
      $('[name="xp"]').addEventListener("input", function (e) { e.target.style.setProperty("--v", e.target.value); $("[data-xpl] em").textContent = "· " + e.target.value + " %"; grab(); });
      $$('[name="eyebrow"],[name="name"]').forEach(function (x) { x.addEventListener("input", grab); });
      $("[data-addfact]").onclick = function () { var rs = readFacts(); if (rs.length >= 8) return; rs.push({ icon: "heart", k: "", v: "" }); facts(rs); var last = $$("[data-fk]").pop(); if (last) last.focus(); };
      $$("[data-lt]").forEach(function (b) { b.onclick = function () { grab(); L = b.getAttribute("data-lt"); $$("[data-lt]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); }); show(); }; });
      var save = function () {
        grab();
        var todo = KEYS.filter(function (k) { return dirty[id(k[0], k[1])] && !(k[0] === "about.text" && !(data[id(k[0], k[1])] || {}).md && !srv[id(k[0], k[1])]); });
        if (!todo.length) { saveState("saved"); return Promise.resolve(true); }
        saveState("ing"); fieldErr(null);
        return todo.reduce(function (p, k) { return p.then(function (ok) { if (!ok) return false; var i = id(k[0], k[1]); return call("PATCH", "/home/" + k[0], { lang: k[1], version: ver[i] || 0, data: data[i] }).then(function (r) {
          if (r.s === 200) { ver[i] = r.j.version; srv[i] = JSON.parse(JSON.stringify(data[i])); dirty[i] = false; return true; }
          if (r.s === 409) { saveState("err"); banner(T("In einem anderen Tab geändert.", "Changed in another tab."), T("Neu laden", "Reload"), function () { store.clear(); editHome(); }); return false; }
          saveState("err"); fieldErr(r.j.error === "invalid" ? [k[0] === "home.hero" ? "lead" : k[0]] : null); return false;
        }); }); }, Promise.resolve(true)).then(function (ok) { if (ok) { store.clear(); saveState("saved"); toast("ok", T("Aktualisiert", "Updated"), T("Die Texte sind jetzt live.", "The texts are live now.")); } return ok; });
      };
      $("[data-primary]").onclick = save; $("[data-back]").onclick = function () { open(""); }; $("[data-pv]").onclick = function () { go((en ? "/en" : "") + "/about"); };
      cur = { dirty: isDirty, save: save, publish: save, back: function () { open(""); }, localOnly: true };
      call("GET", "/home").then(function (r) {
        if (r.s !== 200) { fieldErr(null); $(".ad-scroll").insertAdjacentHTML("afterbegin", '<p class="ad-err">' + T("Konnte nicht laden", "Could not load") + "</p>"); return; }
        srv = {};
        KEYS.forEach(function (k) { var i = id(k[0], k[1]), b = r.j.blocks[k[0]] && r.j.blocks[k[0]][k[1]], d = r.j.defaults[k[0]] && r.j.defaults[k[0]][k[1]];
          ver[i] = b ? b.version : 0; srv[i] = b ? b.data : k[0] === "about.text" ? null : d || null; data[i] = JSON.parse(JSON.stringify(srv[i] || (k[0] === "about.text" ? { md: "" } : {}))); });
        var ld = store.get(); show();
        if (ld && ld.data && JSON.stringify(ld.data) !== JSON.stringify(data)) banner(T("Ungespeicherte Änderungen von ", "Unsaved changes from ") + hm(ld.at) + ".", T("Wiederherstellen", "Restore"), function () { data = ld.data; show(); grab(); var b = $(".ad-banner"); if (b) b.remove(); });
        saveState("saved", Date.now());
      });
    }

    /* one project or news entry. `item` = the saved row (null fields while new), `work` = what the form holds (both
       languages); dirty = they differ. */
    function editItem(k, idv, checked) {
      if (idv === "new" && !checked) {   // the start-data check comes before the form, so nothing typed can be overwritten
        frame(k, '<div class="ad-scroll"><p class="ad-empty">' + T("Lädt …", "Loading …") + "</p></div>");
        call("GET", "/" + k).then(function (r) { if (r.s === 200 && (r.j.items || []).length) editItem(k, idv, true); else frame(k, '<div class="ad-scroll">' + seedMissing() + "</div>"); });
        return;
      }
      var isNew = idv === "new", news = k === "changelog", item = null, work = null, L = "de", store = local(k + "." + idv), t = null;
      var today = new Date(Date.now() + 3600e3).toISOString().slice(0, 10);
      var FIELDS = news ? ["day", "area", "title_de", "title_en", "text_de", "text_en", "status", "sort"] : ["sort", "status", "progress", "href", "icon", "title_de", "title_en", "text_de", "text_en"];
      var blank = news ? { day: today, area: "website", title_de: "", title_en: null, text_de: "", text_en: null, status: "draft", sort: 0, version: 0 } : { sort: null, status: "idee", progress: 0, href: "", icon: "about", title_de: "", title_en: null, text_de: "", text_en: null, version: 0 };
      var pick = function (o) { var p = {}; FIELDS.forEach(function (f) { p[f] = o[f] == null || o[f] === "" && /_en$/.test(f) ? null : o[f]; }); return p; };
      var same = function (a, b) { var x = pick(a), y = pick(b); return FIELDS.every(function (f) { return x[f] === y[f]; }); };
      frame(k, bar({ back: news ? T("Neuigkeiten", "What's new") : T("Projekte", "Projects"), primary: "…", pv: !isNew, extra: news ? '<button type="button" class="xpbtn" data-withdraw hidden>' + T("Zurückziehen", "Withdraw") + "</button>" : "" }) + '<div class="ad-scroll">' + tabs() + '<div class="ad-f">' +
        (news ? '<div class="ad-2">' + fl(T("Datum", "Date"), '<input class="ad-in" type="date" name="day">') + fl(T("Bereich", "Area"), seg("area", [["website", "Website"], ["server", "Server"], ["blog", "Blog"]], "website")) + "</div>"
          + fl(T("Titel", "Title"), '<input class="ad-in big" name="title" maxlength="80">') + fl(T("Text", "Text"), '<input class="ad-in" name="text" maxlength="300">', T("ein Satz", "one sentence"))
          : fl("Name", '<input class="ad-in big" name="title" maxlength="60">') + fl("Status", seg("status", [["live", "live"], ["neu", T("neu", "new")], ["bald", T("bald", "soon")], ["idee", T("Idee", "idea")]], "idee")) +
            fl(T("Fortschritt", "Progress"), '<input class="ad-rng" type="range" min="0" max="10" name="progress">', "", " data-pgl") + fl(T("Beschreibung", "Description"), '<input class="ad-in" name="text" maxlength="300">') +
            '<div class="ad-2">' + fl("Link", '<input class="ad-in" name="href" maxlength="200" placeholder="/blog">', T("Pfad oder https-Adresse", "path or https URL")) + fl("Icon", seg("icon", [["about", "Website"], ["minecraft", "MC"], ["blog", "Blog"], ["music", T("Musik", "Music")], ["writing", T("Texte", "Writing")], ["portfolio", T("Ordner", "Folder")]], "about")) + "</div>") +
        (isNew ? "" : danger(news ? T("Nur dieser Eintrag.", "Only this entry.") : T("Nur die Karte; verlinkte Inhalte bleiben.", "Only the card; linked content stays."))) + "</div></div>");
      var read = function () {   // form (language L) -> work
        var tt = $('[name="title"]').value, tx = $('[name="text"]').value;
        work["title_" + L] = tt; work["text_" + L] = tx;
        if (news) { work.day = $('[name="day"]').value; work.area = segVal($('[data-seg="area"]')); }
        else { work.status = segVal($('[data-seg="status"]')); work.progress = +$('[name="progress"]').value; work.href = $('[name="href"]').value.trim(); work.icon = segVal($('[data-seg="icon"]')); }
      };
      var show = function () {   // work -> form (language L) + bar
        $('[name="title"]').value = work["title_" + L] || ""; $('[name="text"]').value = work["text_" + L] || "";
        if (news) { $('[name="day"]').value = work.day; setSeg($('[data-seg="area"]'), work.area); }
        else { setSeg($('[data-seg="status"]'), work.status); var p = $('[name="progress"]'); p.value = work.progress; p.style.setProperty("--v", work.progress * 10); $("[data-pgl] em").textContent = "· " + work.progress + " / 10"; $('[name="href"]').value = work.href || ""; setSeg($('[data-seg="icon"]'), work.icon); }
        $("[data-enmiss]").hidden = !!work.title_en;
        $("[data-pill]").innerHTML = news ? pill(item.status === "live" ? "live" : "draft") : pill(isNew ? "draft" : "live");
        $("[data-primary]").textContent = news ? (item.status === "live" ? T("Aktualisieren", "Update") : T("Veröffentlichen", "Publish")) : isNew ? T("Anlegen", "Create") : T("Aktualisieren", "Update");
        var wd = $("[data-withdraw]"); if (wd) wd.hidden = item.status !== "live";
      };
      var dirty = function () { return !!item && !same(work, item); };
      var auto = function () { return news && item.status !== "live"; };   // only drafts autosave to D1
      var onInput = function () {
        if (!item) return;
        read(); store.set(pick(work)); $("[data-enmiss]").hidden = !!work.title_en;
        if (!dirty()) { saveState(isNew ? "dirty" : auto() ? "auto" : "saved", item.updated_at); return; }
        saveState("dirty");
        if (auto() && (!isNew || work.title_de)) { clearTimeout(t); t = setTimeout(function () { save(false); }, 1500); }
      };
      var save = function (manual, status) {
        clearTimeout(t); fieldErr(null); read();
        if (!isNew && !status && same(work, item)) { saveState(auto() ? "auto" : "saved", item.updated_at); return Promise.resolve(true); }
        var body = pick(work); if (status) body.status = status; if (body.sort == null) delete body.sort;
        var sent = pick(work);   // what went out; anything typed while the request runs stays in the form
        saveState("ing");
        var req = isNew ? call("POST", "/" + k, body) : call("PATCH", "/" + k + "/" + item.id, Object.assign(body, { version: item.version }));
        return req.then(function (r) {
          if (r.s === 200 || r.s === 201) {
            read(); var now = pick(work); item = r.j.item; store.clear();
            work = Object.assign({}, item); FIELDS.forEach(function (f) { if (f !== "status" && f !== "sort" && now[f] !== sent[f]) work[f] = now[f]; });
            if (isNew) { isNew = false; idv = String(item.id); store = local(k + "." + idv); setAddr(k + "/" + item.id); var pb = $("[data-pv]"); if (pb) pb.hidden = false; }
            show(); saveState(dirty() ? "dirty" : auto() && !manual ? "auto" : "saved", item.updated_at); return true;
          }
          if (r.s === 409) { saveState("err"); banner(T("In einem anderen Tab geändert.", "Changed in another tab."), T("Neu laden", "Reload"), function () { store.clear(); editItem(k, idv); }); return false; }
          saveState("err"); if (r.s === 400) fieldErr(r.j.fields || []); else toast("err", T("Nicht gespeichert", "Not saved")); return false;
        });
      };
      var publish = function () {
        if (!news) { var created = isNew; return save(true).then(function (ok) { if (ok) toast("ok", created ? T("Angelegt", "Created") : T("Aktualisiert", "Updated"), T("Die Projekte-Liste zeigt es jetzt.", "The projects list shows it now.")); }); }
        var wasLive = item.status === "live";
        return save(true, "live").then(function (ok) { if (ok) toast("ok", wasLive ? T("Aktualisiert", "Updated") : T("Veröffentlicht", "Published"), T("Der Eintrag ist jetzt in den Neuigkeiten und im RSS-Feed.", "The entry is now in What's new and the RSS feed.")); });
      };
      $$("input", $(".ad-f")).forEach(function (x) { x.addEventListener("input", onInput); });
      $$("[data-seg]").forEach(function (b) { wireSeg(b, onInput); });
      var pg = $('[name="progress"]'); if (pg) pg.addEventListener("input", function () { pg.style.setProperty("--v", pg.value * 10); $("[data-pgl] em").textContent = "· " + pg.value + " / 10"; });
      $$("[data-lt]").forEach(function (b) { b.onclick = function () { if (work) read(); L = b.getAttribute("data-lt"); $$("[data-lt]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); }); if (work) show(); }; });
      $("[data-primary]").onclick = publish;
      var wd = $("[data-withdraw]"); if (wd) wd.onclick = function () { save(true, "draft").then(function (ok) { if (ok) toast("ok", T("Zurückgezogen", "Withdrawn"), T("Der Eintrag ist offline, als Entwurf.", "The entry is offline, as a draft.")); }); };
      $("[data-back]").onclick = function () { open(k); };
      var pvb = $("[data-pv]"); if (pvb) pvb.onclick = function () { go((en ? "/en" : "") + (news ? "/changelog" : "/portfolio")); };
      var del = $("[data-del]"); if (del) del.onclick = function () {
        NwebOS.ask({ title: news ? T("Eintrag löschen?", "Delete this entry?") : T("Projekt löschen?", "Delete this project?"), text: (news ? T("„" + item.title_de + "“ wird gelöscht. Das geht nicht rückgängig. Tipp: „Zurückziehen“ nimmt ihn nur offline.", "“" + item.title_de + "” is deleted. This can't be undone. Tip: “Withdraw” only takes it offline.") : T("Die Karte „" + item.title_de + "“ wird gelöscht; verlinkte Inhalte bleiben. Das geht nicht rückgängig.", "The card “" + item.title_de + "” is deleted; linked content stays. This can't be undone.")), yes: T("Endgültig löschen", "Delete for good"), no: T("Behalten", "Keep"), danger: true, stack: true, icon: spr("c-del", 48) })
          .then(function (ok) { if (!ok) return; call("DELETE", "/" + k + "/" + item.id).then(function (r) { if (r.s === 200) { store.clear(); toast("ok", T("Gelöscht", "Deleted")); open(k); } else toast("err", T("Nicht gelöscht", "Not deleted")); }); });
      };
      cur = { dirty: dirty, save: function () { return save(true); }, publish: publish, back: function () { open(k); }, localOnly: true, flush: function () { if (item && auto() && dirty() && !isNew) save(false); } };
      var start = function (it) {
        item = it; work = Object.assign({}, it);
        var ld = store.get();
        show(); saveState(isNew ? "dirty" : auto() ? "auto" : "saved", item.updated_at);
        if (ld && ld.data && !same(Object.assign({}, item, ld.data), item)) banner(T("Ungespeicherte Änderungen von ", "Unsaved changes from ") + hm(ld.at) + ".", T("Wiederherstellen", "Restore"), function () { work = Object.assign({}, item, ld.data); show(); onInput(); var b = $(".ad-banner"); if (b) b.remove(); });
      };
      if (isNew) start(blank);
      else call("GET", "/" + k + "/" + idv).then(function (r) { if (r.s === 200) start(r.j.item); else frame(k, '<div class="ad-scroll"><p class="ad-err">' + T("Nicht gefunden", "Not found") + "</p></div>"); });
    }

    var win = el.closest(".win"), tt = win && win.querySelector(".wt .tt");
    if (tt && !tt.querySelector(".ad-tag-adm")) tt.insertAdjacentHTML("beforeend", '<span class="ad-tag-adm">ADMIN</span>');   /* mockup: the red tag in the title bar */
    var p0 = ((document.getElementById("app-admin") || {}).dataset || {}).path || "/admin";
    open(p0.replace(/^\/admin\/?/, ""));
    call("GET", "/overview").then(function (r) { if (r.s === 200 && !counts) { counts = r.j; var n = $(".ad-nav"); if (n) { var act = $(".ad-nav [aria-current]"); n.outerHTML = nav(act ? (act.getAttribute("data-go") || "") : ""); } } });
    return { unmount: function () { if (cur && cur.flush) cur.flush(); cur = null; } };
  }
  var live = null;
  window.NwebOS.register("admin", { mount: function (el, ctx) { live = mountAdmin(el, ctx); }, unmount: function () { if (live) live.unmount(); live = null; } });
})();
