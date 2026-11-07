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
    var nb = $("[data-blog-new]");
    nb.addEventListener("click", function () {
      nb.disabled = true;   // re-enabled on every failure, so the same button is the retry
      call("POST", "/posts", { title_de: "" }).then(function (r) {
        if (r.s === 201) location.href = "/blog/admin/" + r.j.id; else { nb.disabled = false; say("Fehler: " + (r.j.error || r.s) + " – nochmal versuchen"); }
      }).catch(function () { nb.disabled = false; say("Neuer Beitrag nicht angelegt (offline?) – nochmal versuchen"); });
    });
    return;
  }

  /* ---------- edit one post ---------- */
  var root = $("[data-blog-editor]");
  if (!root) return;
  var id = root.getAttribute("data-blog-editor"), base = null, slug = "", token = "", lang = "de", timer = 0, ptimer = 0, dirty = false;
  var F = ["slug", "category", "tags", "title_de", "summary_de", "body_de", "title_en", "summary_en", "body_en"];
  var field = function (n) { return root.querySelector("[name='" + n + "']"); };
  var statusEl = $("[data-blog-status]"), plink = $("[data-blog-preview-link]");

  function payload() {
    var o = { base: base };
    F.forEach(function (n) { var v = field(n).value; o[n] = n === "tags" ? v.split(",").map(function (x) { return x.trim(); }).filter(Boolean) : v; });
    return o;
  }
  function setLink() { plink.href = "/blog/" + encodeURIComponent(slug) + "?preview=" + encodeURIComponent(token); }
  // save() resolves true only when the text it sent is stored. A call while a save is in flight waits
  // for it (and saves again if more was typed) instead of resolving early.
  var inflight = null;
  function save() {
    if (inflight) return inflight.then(function () { return save(); });
    if (base === null) return Promise.resolve(false);   // conflict: nothing may be written from this tab
    if (!dirty) return Promise.resolve(true);
    dirty = false; say("Speichert …");
    var body = payload();
    inflight = call("PUT", "/posts/" + id, body).then(function (r) {
      inflight = null;
      if (r.s === 200) { base = r.j.updated_at; slug = body.slug; setLink(); say("Gespeichert " + new Date().toLocaleTimeString("de-DE")); if (dirty) schedule(); return true; }
      if (r.s === 409 && r.j.error === "conflict") { base = null; say("Konflikt: Der Beitrag wurde woanders geändert. Seite neu laden (deine Änderung ist nicht gespeichert)."); return false; }
      dirty = true; say("Nicht gespeichert: " + (r.j.error || r.s)); return false;
    }, function () { inflight = null; dirty = true; say("Nicht gespeichert (offline?)"); return false; });
    return inflight;
  }
  // Everything typed so far is stored (true), or something failed/conflicted (false).
  function flush() {
    clearTimeout(timer);
    return save().then(function (ok) { return ok && (dirty || inflight) ? flush() : ok; });
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
  window.addEventListener("beforeunload", function (e) { if (dirty || inflight) { save(); e.preventDefault(); } });

  [].forEach.call(root.querySelectorAll("[data-tab]"), function (b) {
    b.addEventListener("click", function () {
      lang = b.getAttribute("data-tab");
      [].forEach.call(root.querySelectorAll("[data-tab]"), function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      [].forEach.call(root.querySelectorAll("fieldset[data-lang]"), function (f) { f.hidden = f.getAttribute("data-lang") !== lang; });
      preview();
    });
  });
  // A status change only after all edits are stored, and with `base`: the server refuses it (409) if
  // another tab changed the post in between, so a stale tab can never publish or withdraw.
  var statusBtns = [].slice.call(root.querySelectorAll("[data-set-status]"));
  statusBtns.forEach(function (b) {
    b.addEventListener("click", function () {
      statusBtns.forEach(function (x) { x.disabled = true; });
      var done = function () { statusBtns.forEach(function (x) { x.disabled = false; }); };
      flush().then(function (ok) {
        if (!ok) { done(); say("Status nicht geändert: erst muss alles gespeichert sein (siehe oben)."); return; }
        return call("POST", "/posts/" + id + "/status", { status: b.getAttribute("data-set-status"), base: base }).then(function (r) {
          done();
          if (r.s === 200) { base = r.j.updated_at; statusEl.textContent = r.j.status; say("Status: " + r.j.status); }
          else if (r.s === 409) { base = null; say("Konflikt: Der Beitrag wurde woanders geändert. Seite neu laden, Status nicht geändert."); }
          else say("Status nicht geändert: " + (r.j.error || r.s));
        });
      }).catch(function () { say("Status nicht geändert (offline?)"); }).then(done, done);   // buttons never stay disabled
    });
  });
  $("[data-rotate]").addEventListener("click", function () {
    call("POST", "/posts/" + id + "/preview-token", {}).then(function (r) { if (r.s === 200) { token = r.j.preview_token; setLink(); say("Neuer Vorschau-Link, der alte gilt nicht mehr."); } });
  });
})();
