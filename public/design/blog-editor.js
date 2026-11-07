/* Blog editor (admin only; the server checks every request). Plain on purpose: the UI is redone
   after the design reset. Autosave: 1.5 s after the last change, with the loaded updated_at as
   `base`, so a second tab gets a conflict instead of overwriting newer text. Live preview: the
   server renders the Markdown with the same sanitiser as the blog, so the preview is the real output. */
(function () {
  var API = "/api/blog/admin";
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var state = $("[data-blog-state]");
  function say(t) { if (state) state.textContent = t; }
  function call(method, path, body) {
    return fetch(API + path, { method: method, credentials: "same-origin", headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { s: r.status, j: j }; }); });
  }

  /* ---------- post list ---------- */
  var admin = $("[data-blog-admin]");
  if (admin) {
    var ul = $("[data-blog-posts]");
    call("GET", "/posts").then(function (r) {
      if (r.s !== 200) { say("Fehler: " + (r.j.error || r.s)); return; }
      say(r.j.posts.length ? r.j.posts.length + " Beiträge" : "Noch keine Beiträge.");
      r.j.posts.forEach(function (p) {
        var li = document.createElement("li"), a = document.createElement("a");
        a.href = "/blog/admin/" + p.id; a.textContent = (p.title_de || "(ohne Titel)") + " [" + p.status + "]";
        li.append(a); ul.append(li);
      });
    });
    $("[data-blog-new]").addEventListener("click", function () {
      call("POST", "/posts", { title_de: "" }).then(function (r) {
        if (r.s === 201) location.href = "/blog/admin/" + r.j.id; else say("Fehler: " + (r.j.error || r.s));
      });
    });
    return;
  }

  /* ---------- edit one post ---------- */
  var root = $("[data-blog-editor]");
  if (!root) return;
  var id = root.getAttribute("data-blog-editor"), base = null, slug = "", token = "", lang = "de", timer = 0, ptimer = 0, dirty = false, saving = false;
  var F = ["slug", "category", "tags", "title_de", "summary_de", "body_de", "title_en", "summary_en", "body_en"];
  var field = function (n) { return root.querySelector("[name='" + n + "']"); };
  var statusEl = $("[data-blog-status]"), plink = $("[data-blog-preview-link]");

  function payload() {
    var o = { base: base };
    F.forEach(function (n) { var v = field(n).value; o[n] = n === "tags" ? v.split(",").map(function (x) { return x.trim(); }).filter(Boolean) : v; });
    return o;
  }
  function setLink() { plink.href = "/blog/" + encodeURIComponent(slug) + "?preview=" + encodeURIComponent(token); }
  function save() {
    if (saving || !dirty || base === null) return Promise.resolve();
    saving = true; dirty = false; say("Speichert …");
    var body = payload();
    return call("PUT", "/posts/" + id, body).then(function (r) {
      saving = false;
      if (r.s === 200) { base = r.j.updated_at; slug = body.slug; setLink(); say("Gespeichert " + new Date().toLocaleTimeString("de-DE")); if (dirty) schedule(); }
      else if (r.s === 409 && r.j.error === "conflict") { base = null; say("Konflikt: Der Beitrag wurde woanders geändert. Seite neu laden (deine Änderung ist nicht gespeichert)."); }
      else { dirty = true; say("Nicht gespeichert: " + (r.j.error || r.s)); }
    }, function () { saving = false; dirty = true; say("Nicht gespeichert (offline?)"); });
  }
  function schedule() { clearTimeout(timer); timer = setTimeout(save, 1500); }
  function preview() {
    clearTimeout(ptimer);
    ptimer = setTimeout(function () {
      call("POST", "/render", { md: field("body_" + lang).value }).then(function (r) {
        if (r.s !== 200) return;
        $("[data-blog-preview]").innerHTML = r.j.html; /* sanitised server-side (src/markdown.js) */
        var toc = $("[data-blog-toc]"); toc.replaceChildren();
        if (r.j.toc.length > 1) {
          var ol = document.createElement("ol");
          r.j.toc.forEach(function (h) { var li = document.createElement("li"), a = document.createElement("a"); li.className = "l" + h.level; a.href = "#" + h.id; a.textContent = h.text; li.append(a); ol.append(li); });
          toc.append(ol);
        }
      });
    }, 400);
  }

  call("GET", "/posts/" + id).then(function (r) {
    if (r.s !== 200) { say("Fehler: " + (r.j.error || r.s)); return; }
    var p = r.j;
    F.forEach(function (n) { field(n).value = n === "tags" ? (p.tags || []).join(", ") : p[n] == null ? "" : p[n]; });
    base = p.updated_at; slug = p.slug; token = p.preview_token || ""; statusEl.textContent = p.status; setLink();
    say("Geladen"); preview();
  });
  root.addEventListener("input", function (e) { if (!e.target.name) return; dirty = true; schedule(); if (/^body_/.test(e.target.name)) preview(); });
  root.addEventListener("change", function (e) { if (e.target.name === "category") { dirty = true; schedule(); } });
  window.addEventListener("beforeunload", function (e) { if (dirty || saving) { save(); e.preventDefault(); } });

  [].forEach.call(root.querySelectorAll("[data-tab]"), function (b) {
    b.addEventListener("click", function () {
      lang = b.getAttribute("data-tab");
      [].forEach.call(root.querySelectorAll("[data-tab]"), function (x) { x.setAttribute("aria-selected", String(x === b)); });
      [].forEach.call(root.querySelectorAll("fieldset[data-lang]"), function (f) { f.hidden = f.getAttribute("data-lang") !== lang; });
      preview();
    });
  });
  [].forEach.call(root.querySelectorAll("[data-set-status]"), function (b) {
    b.addEventListener("click", function () {
      clearTimeout(timer);
      var go = function () {
        call("POST", "/posts/" + id + "/status", { status: b.getAttribute("data-set-status") }).then(function (r) {
          if (r.s === 200) { base = r.j.updated_at; statusEl.textContent = r.j.status; say("Status: " + r.j.status); }
          else say("Status nicht geändert: " + (r.j.error || r.s));
        });
      };
      save().then(go); /* pending text first, so the status change sees the latest base */
    });
  });
  $("[data-rotate]").addEventListener("click", function () {
    call("POST", "/posts/" + id + "/preview-token", {}).then(function (r) { if (r.s === 200) { token = r.j.preview_token; setLink(); say("Neuer Vorschau-Link, der alte gilt nicht mehr."); } });
  });
})();
