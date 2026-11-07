/* NwebOS blog editor window (admin only: the server checks every page and API call). Design: mockups/nwebos/apps
   "Editor". Loaded by the shell on the first open of the blog-edit window (docs/nwebos-modules.md). Same save rules
   as the #106 editor: autosave 1.5 s after the last change with the loaded updated_at as `base`, so a stale tab
   gets a 409 conflict instead of overwriting newer text; a status change only after everything is stored; the
   preview is the server's sanitised renderer (POST /api/blog/admin/render). */
(function () {
  "use strict";
  var API = "/api/blog/admin";
  var CATS = [["bauen", "Bauen"], ["server", "Server"], ["musik", "Musik"], ["notizen", "Notizen"]];
  var ST = { draft: ["draft", "Entwurf"], published: ["pub", "Veröffentlicht"], withdrawn: ["wd", "Zurückgezogen"] };
  var TOOLS = [["**fett**", "Fett", "<b>B</b>"], ["*kursiv*", "Kursiv", "<i>I</i>"], ["\n## Überschrift\n", "Überschrift", "H2"], ["\n### Zwischenüberschrift\n", "Zwischenüberschrift", "H3"],
    ["[Text](https://)", "Link", "Link"], ["![Beschreibung](/content-assets/bild.png)", "Bild aus /content-assets/", "Bild"], ["`code`", "Code", "&lt;/&gt;"], ["\n> Kurz gesagt: …\n", "Hinweis-Box", "❝"], ["\n- Punkt\n", "Liste", "• Liste"]];
  var MAX_TAGS = 8;
  function call(method, path, body) {
    return fetch(API + path, { method: method, credentials: "same-origin", headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { s: r.status, j: j }; }); });
  }
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var hm = function (d) { return d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }); };
  var when = function (ms) { var d = new Date(ms), t = new Date(); return d.toDateString() === t.toDateString() ? "heute " + hm(d) : d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }) + "."; };

  function markup() {
    return '<div class="ed"><div class="edtop"><nav class="tabs" aria-label="Editor"><button type="button" data-ep="w" class="on">Schreiben</button><button type="button" data-ep="l">Beiträge <em data-count>0</em></button></nav><span class="sp"></span>' +
      '<span class="as" data-as aria-live="polite"></span><button type="button" class="xpbtn" data-plink disabled>Vorschau-Link</button><button type="button" class="xpbtn go" data-publish disabled>Veröffentlichen</button></div>' +
      '<p class="conflict" data-draft hidden>Ungespeicherter Text vom <b data-draft-at></b> ist noch da. <button type="button" class="lnk" data-draft-restore>Wiederherstellen</button> oder <button type="button" class="lnk" data-draft-drop>verwerfen</button>.</p><p class="conflict" data-conflict hidden>In einem anderen Tab wurde dieser Beitrag geändert. <button type="button" class="lnk" data-reload>Neu laden</button> oder <button type="button" class="lnk" data-keep>meine Fassung behalten</button>.</p>' +
      '<section class="edw" data-panel-ed="w"><p class="hint" data-empty>Wähle unter „Beiträge“ einen Beitrag oder lege einen neuen an.</p><div data-form hidden><div class="meta"><input class="ttl" name="title" aria-label="Titel" maxlength="140" placeholder="Titel">' +
      '<label>Adresse <span class="slug">/blog/<input name="slug" aria-label="Slug" maxlength="80"></span></label><label>Kategorie <select name="category" aria-label="Kategorie">' + CATS.map(function (c) { return '<option value="' + c[0] + '">' + c[1] + "</option>"; }).join("") + "</select></label>" +
      '<span class="tagsin" data-tags><input placeholder="Tag + Enter" aria-label="Tag hinzufügen" maxlength="30" data-tagin></span><span class="seg" role="group" aria-label="Sprache"><button type="button" class="on" data-lang="de" aria-pressed="true">DE</button><button type="button" data-lang="en" aria-pressed="false">EN <small>optional</small></button></span><span class="pill" data-pill></span>' +
      '<label class="sum">Kurzbeschreibung <input name="summary" maxlength="300" aria-label="Kurzbeschreibung"></label></div>' +
      '<div class="tool" role="toolbar" aria-label="Formatieren">' + TOOLS.map(function (t, i) { return '<button type="button" data-md-ins="' + i + '" title="' + esc(t[1]) + '">' + t[2] + "</button>"; }).join("") +
      '<span class="sp"></span><span class="segm" role="group" aria-label="Ansicht"><button type="button" class="on" data-edv="md">Text</button><button type="button" data-edv="pv">Vorschau</button></span></div>' +
      '<div class="split" data-edview="md"><textarea class="md" name="body" aria-label="Markdown" spellcheck="true"></textarea><div class="pv post" data-pv aria-label="Vorschau"></div></div>' +
      '<p class="edfoot"><span data-wc></span><span>Markdown · Bilder nur aus /content-assets/ · Strg+S speichert sofort<button type="button" class="lnk" data-status="draft" hidden> · Zurück zu Entwurf</button><button type="button" class="lnk" data-status="withdrawn" hidden> · Zurückziehen</button><button type="button" class="lnk" data-rotate> · Neuer Vorschau-Link</button></span></p></div></section>' +
      '<section class="edl" data-panel-ed="l" hidden><p class="btns"><button type="button" class="xpbtn go" data-new>+ Neuer Beitrag</button></p><table class="xtbl"><thead><tr><th>Titel</th><th>Status</th><th>Kategorie</th><th>Geändert</th><th></th></tr></thead><tbody data-rows></tbody></table>' +
      '<p class="hint">Nur für dich sichtbar (Admin). Entwürfe sieht sonst nur, wer den Vorschau-Link hat.</p></section></div>';
  }

  function mount(el, ctx) {
    el.innerHTML = markup();
    var $ = function (s) { return el.querySelector(s); }, $$ = function (s) { return [].slice.call(el.querySelectorAll(s)); };
    var sec = document.getElementById("app-blog-edit");
    var st = { id: null, base: null, post: null, lang: "de", tags: [], dirty: false, inflight: null, timer: 0, ptimer: 0, keep: null };
    var say = function (t) { $("[data-as]").textContent = t; };
    var field = function (n) { return el.querySelector("[name='" + n + "']"); };

    /* the address of this window follows the open post (/blog/admin/<id>), so a reload or a saved window comes back to it */
    function setAddress(id) {
      var p = "/blog/admin" + (id ? "/" + id : "");
      if (sec) sec.dataset.path = p;
      if (ctx.window.classList.contains("focus")) history.replaceState(history.state, "", (document.documentElement.lang === "en" ? "/en" : "") + p);
    }
    function pane(n) { $$("[data-ep]").forEach(function (b) { b.classList.toggle("on", b.dataset.ep === n); }); $$("[data-panel-ed]").forEach(function (s) { s.hidden = s.dataset.panelEd !== n; }); }
    function pill(status) {
      // only the status changes that apply: a draft can be published, a published post withdrawn or taken back to draft
      $("[data-status='draft']").hidden = status === "draft"; $("[data-status='withdrawn']").hidden = status !== "published";
      var p = $("[data-pill]"), x = ST[status] || ST.draft; p.className = "pill " + x[0]; p.textContent = x[1]; $("[data-publish]").textContent = status === "published" ? "Veröffentlicht ✓" : "Veröffentlichen"; }
    function drawTags() {
      $$(".tagsin > span").forEach(function (n) { n.remove(); });
      var inp = $("[data-tagin]");
      st.tags.forEach(function (t, i) { var s = document.createElement("span"); s.textContent = "#" + t + " "; var x = document.createElement("button"); x.type = "button"; x.textContent = "×"; x.setAttribute("aria-label", "Tag entfernen"); x.dataset.untag = i; s.appendChild(x); inp.before(s); });
      inp.disabled = st.tags.length >= MAX_TAGS;
    }
    function wc() { var n = (field("body").value.match(/\S+/g) || []).length; $("[data-wc]").textContent = n + " Wörter · " + Math.max(1, Math.round(n / 200)) + " Min. Lesezeit"; }
    /* the DE/EN switch shows that language's title, summary and text; both are kept in st.post until saved */
    function showLang() {
      var p = st.post || {};
      field("title").value = p["title_" + st.lang] || ""; field("summary").value = p["summary_" + st.lang] || ""; field("body").value = p["body_" + st.lang] || "";
      $$("[data-lang]").forEach(function (b) { var on = b.dataset.lang === st.lang; b.classList.toggle("on", on); b.setAttribute("aria-pressed", String(on)); });
      wc(); preview();
    }
    function collect() {
      var p = st.post; p["title_" + st.lang] = field("title").value; p["summary_" + st.lang] = field("summary").value; p["body_" + st.lang] = field("body").value;
      p.slug = field("slug").value.trim(); p.category = field("category").value; p.tags = st.tags.slice();
    }
    function payload() { var p = st.post; return { base: st.base, slug: p.slug, category: p.category, tags: p.tags, title_de: p.title_de || "", summary_de: p.summary_de || "", body_de: p.body_de || "", title_en: p.title_en || "", summary_en: p.summary_en || "", body_en: p.body_en || "" }; }
    function conflict(on) { $("[data-conflict]").hidden = !on; }
    // save() resolves true only when the text it sent is stored; a call during a save waits for it
    function save() {
      if (st.inflight) return st.inflight.then(function () { return save(); });
      if (!st.post) return Promise.resolve(true);
      if (st.base === null) return Promise.resolve(false);   // conflict: nothing is written from this tab
      if (!st.dirty) return Promise.resolve(true);
      st.dirty = false; say("Speichert …");
      var body = payload(), id = st.id;
      st.inflight = call("PUT", "/posts/" + id, body).then(function (r) {
        st.inflight = null;
        if (id !== st.id) return r.s === 200;   // another post was opened meanwhile: this answer must not touch it (Gatekeeper #119)
        if (r.s === 200) { st.base = r.j.updated_at; dropDraft(id); say("✓ Automatisch gespeichert · " + hm(new Date())); if (st.dirty) schedule(); return true; }
        if (r.s === 409 && r.j.error === "conflict") { st.base = null; st.keep = body; conflict(true); say("Nicht gespeichert: Konflikt"); return false; }
        st.dirty = true; say("Nicht gespeichert: " + (r.j.error || r.s)); return false;
      }, function () { st.inflight = null; if (id === st.id) { st.dirty = true; say("Nicht gespeichert (offline?)"); } return false; });
      return st.inflight;
    }
    /* unsent text (closed window, failed save, conflict) survives in ctx.store with the base it was written on, so a
       restore can't overwrite newer text silently: the server answers 409 and only "meine Fassung behalten" writes it */
    var DKEY = function (id) { return "draft:" + id; };
    function keepDraft() {
      if (!st.post || !(st.dirty || st.base === null || st.keep)) return;
      collect(); var p = payload(); p.base = st.base !== null ? st.base : (st.keep && st.keep.base);   // current text, on the base it was written on
      try { ctx.store.set(DKEY(st.id), JSON.stringify({ at: Date.now(), body: p })); } catch (e) {}
    }
    function dropDraft(id) { try { ctx.store.set(DKEY(id), null); } catch (e) {} $("[data-draft]").hidden = true; }
    function readDraft(id) { try { return JSON.parse(ctx.store.get(DKEY(id)) || "null"); } catch (e) { return null; } }
    function leave() {
      return flush().then(function (ok) { if (!ok) { keepDraft(); say("Erst speichern: der Text ist noch nicht gespeichert (Konflikt oder offline)."); } return ok; });
    }
    function flush() { clearTimeout(st.timer); return save().then(function (ok) { return ok && (st.dirty || st.inflight) ? flush() : ok; }); }
    function schedule() { clearTimeout(st.timer); st.timer = setTimeout(save, 1500); }
    function changed() { if (!st.post) return; collect(); st.dirty = true; say("Ungespeichert …"); schedule(); }
    function preview() {
      clearTimeout(st.ptimer);
      st.ptimer = setTimeout(function () {
        call("POST", "/render", { md: field("body").value }).then(function (r) { if (r.s === 200) $("[data-pv]").innerHTML = r.j.html; });   /* sanitised server-side (src/markdown.js) */
      }, 400);
    }
    var alive = function () { return el.isConnected && !!el.querySelector(".ed"); };
    function load(id) {
      say("Lädt …");
      return call("GET", "/posts/" + id).then(function (r) {
        if (!alive()) return;
        if (r.s !== 200) { say("Fehler: " + (r.j.error || r.s)); return; }
        st.id = id; st.post = r.j; st.base = r.j.updated_at; st.tags = (r.j.tags || []).slice(); st.lang = "de"; st.dirty = false; st.keep = null; conflict(false);
        field("slug").value = r.j.slug || ""; field("category").value = r.j.category || "notizen"; drawTags(); pill(r.j.status); showLang();
        $("[data-form]").hidden = false; $("[data-empty]").hidden = true; $("[data-plink]").disabled = false; $("[data-publish]").disabled = false;
        say("✓ Gespeichert · " + when(r.j.updated_at)); setAddress(id); pane("w");
        var d = readDraft(id); if (d && d.body) { $("[data-draft-at]").textContent = when(d.at); $("[data-draft]").hidden = false; }
      });
    }
    function list() {
      return call("GET", "/posts").then(function (r) {
        if (!alive()) return;
        if (r.s !== 200) { say("Fehler: " + (r.j.error || r.s)); return; }
        $("[data-count]").textContent = r.j.posts.length;
        var tb = $("[data-rows]"); tb.replaceChildren();
        r.j.posts.forEach(function (p) {
          var x = ST[p.status] || ST.draft, tr = document.createElement("tr");
          tr.innerHTML = "<td><b></b></td><td><span class=\"pill " + x[0] + "\">" + x[1] + "</span></td><td>" + esc((CATS.filter(function (c) { return c[0] === p.category; })[0] || [0, p.category])[1]) + "</td><td>" + esc(when(p.updated_at)) + '</td><td><button type="button" class="lnk" data-edit="' + esc(p.id) + '">Bearbeiten</button></td>';
          tr.querySelector("b").textContent = p.title_de || "(ohne Titel)";
          tb.appendChild(tr);
        });
      });
    }
    function setStatus(status) {
      var btns = $$("[data-publish], [data-status]"); btns.forEach(function (b) { b.disabled = true; });
      var done = function () { btns.forEach(function (b) { b.disabled = false; }); };
      return flush().then(function (ok) {
        if (!ok) { say("Status nicht geändert: erst muss alles gespeichert sein."); return; }
        return call("POST", "/posts/" + st.id + "/status", { status: status, base: st.base }).then(function (r) {
          if (r.s === 200) { st.base = r.j.updated_at; st.post.status = r.j.status; pill(r.j.status); say("Status: " + (ST[r.j.status] || ST.draft)[1]); list(); }
          else if (r.s === 409) { st.base = null; conflict(true); say("Status nicht geändert: Konflikt"); }
          else say("Status nicht geändert: " + (r.j.error || r.s));
        });
      }).catch(function () { say("Status nicht geändert (offline?)"); }).then(done, done);
    }

    el.addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b || !el.contains(b)) return;
      if (b.dataset.ep) { pane(b.dataset.ep); if (b.dataset.ep === "l") list(); return; }
      if (b.dataset.edit) { if (b.dataset.edit === st.id) { pane("w"); return; } leave().then(function (ok) { if (ok) load(b.dataset.edit); }); return; }
      if (b.hasAttribute("data-new")) {
        b.disabled = true;   // re-enabled on failure: the same button is the retry
        leave().then(function (ok) { if (!ok) { b.disabled = false; return; } return call("POST", "/posts", { title_de: "" }).then(function (r) { b.disabled = false; if (r.s === 201) { load(r.j.id); list(); } else say("Neuer Beitrag nicht angelegt – nochmal versuchen" + (r.s === 401 || r.s === 403 ? " (bitte neu anmelden)" : "") + "."); }, function () { b.disabled = false; say("Neuer Beitrag nicht angelegt (offline?)"); }); });
        return;
      }
      if (b.dataset.lang) { if (st.post) { collect(); st.lang = b.dataset.lang; showLang(); } return; }
      if (b.dataset.untag != null) { st.tags.splice(+b.dataset.untag, 1); drawTags(); changed(); return; }
      if (b.dataset.mdIns != null) {
        var ta = field("body"), ins = TOOLS[+b.dataset.mdIns][0], s0 = ta.selectionStart, s1 = ta.selectionEnd;
        ta.setRangeText(ins, s0, s1, "end"); ta.focus(); wc(); changed(); preview(); return;
      }
      if (b.dataset.edv) { $$("[data-edv]").forEach(function (x) { x.classList.toggle("on", x === b); }); $("[data-edview]").dataset.edview = b.dataset.edv; return; }
      if (b.hasAttribute("data-plink")) {
        var url = location.origin + "/blog/" + encodeURIComponent(st.post.slug) + "?preview=" + encodeURIComponent(st.post.preview_token || "");
        if (navigator.clipboard) navigator.clipboard.writeText(url).catch(function () {});
        b.textContent = "Kopiert ✓"; setTimeout(function () { b.textContent = "Vorschau-Link"; }, 1400); return;
      }
      if (b.hasAttribute("data-publish")) { setStatus("published"); return; }
      if (b.dataset.status) { setStatus(b.dataset.status); return; }
      if (b.hasAttribute("data-rotate")) { call("POST", "/posts/" + st.id + "/preview-token", {}).then(function (r) { if (r.s === 200) { st.post.preview_token = r.j.preview_token; say("Neuer Vorschau-Link, der alte gilt nicht mehr."); } }); return; }
      if (b.hasAttribute("data-reload")) { load(st.id); return; }
      if (b.hasAttribute("data-draft-drop")) { dropDraft(st.id); return; }
      if (b.hasAttribute("data-draft-restore")) {
        var d = readDraft(st.id); if (!d || !d.body) return;
        ["slug", "category", "tags", "title_de", "summary_de", "body_de", "title_en", "summary_en", "body_en"].forEach(function (n) { if (d.body[n] !== undefined) st.post[n] = d.body[n]; });
        st.tags = (d.body.tags || []).slice(); field("slug").value = st.post.slug || ""; field("category").value = st.post.category || "notizen"; drawTags(); showLang();
        $("[data-draft]").hidden = true; st.base = d.body.base; st.dirty = true; save();   // the old base: if the post changed since, 409 and the banner decide
        return;
      }
      // keep my version: take the newer base, then write my text over it (an explicit choice, never automatic)
      if (b.hasAttribute("data-keep")) {
        var mine = st.keep; call("GET", "/posts/" + st.id).then(function (r) { if (r.s !== 200) return; st.base = r.j.updated_at; st.dirty = true; conflict(false); if (mine) mine.base = st.base; save(); });
      }
    });
    el.addEventListener("input", function (e) {
      if (e.target.matches("[data-tagin]")) return;
      if (e.target.name === "body") { wc(); preview(); }
      if (e.target.name) changed();
    });
    el.addEventListener("change", function (e) { if (e.target.name === "category") changed(); });
    el.addEventListener("keydown", function (e) {
      if (e.target.matches("[data-tagin]") && e.key === "Enter") {
        e.preventDefault(); var v = e.target.value.trim().replace(/^#/, "").toLowerCase();
        if (v && st.tags.indexOf(v) < 0 && st.tags.length < MAX_TAGS) { st.tags.push(v); drawTags(); changed(); }
        e.target.value = ""; return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); flush(); }
    });
    st.onunload = function (e) { if (st.dirty || st.inflight || st.base === null) { keepDraft(); save(); e.preventDefault(); } };
    window.addEventListener("beforeunload", st.onunload);
    st.save = save; st.keepDraft = keepDraft; el._ed = st;

    var m = sec && /\/blog\/admin\/([0-9a-f-]{36})$/.exec(sec.dataset.path || "");
    list().then(function () { if (m) load(m[1]); else pane("l"); });
  }
  function unmount(el) {
    var st = el._ed; if (!st) return;
    clearTimeout(st.timer); clearTimeout(st.ptimer);
    if (st.dirty || st.base === null) { st.keepDraft(); st.save(); }   // closing: try to send it; whatever isn't stored stays as a draft for the next open
    window.removeEventListener("beforeunload", st.onunload);
  }
  NwebOS.register("blog-edit", { mount: mount, unmount: unmount });
})();
