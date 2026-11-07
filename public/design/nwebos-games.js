/* NwebOS games: Pixelminen ("mines") and Fünf ("five"), mounted by the shell (docs/nwebos-modules.md).
   No canvas, no work while idle: the mines timer ticks only while a game runs and its window is not minimised;
   Fünf is event driven only. Both are keyboard playable. Stats live in ctx.store ("stats", JSON). */
(function () {
  "use strict";
  var me = document.currentScript, ver = (me && /[?&]v=([^&]+)/.exec(me.src) || [0, "0"])[1];
  var N = 9, M = 10;
  var S = {
    de: {
      mines: "Pixelminen", grid: "Spielfeld 9 mal 9", cell: "Feld", row: "Reihe", col: "Spalte", hidden: "verdeckt", flag: "Flagge", mine: "Mine", near: "Minen nebenan", empty: "leer",
      newGame: "Neues Spiel", flagMode: "Flaggen-Modus", help: "Aufdecken: Klick oder Enter · Flagge: Rechtsklick, ⚑ oder F · Pfeiltasten bewegen",
      won: "Gewonnen!", lost: "Boom! Nochmal?", stats: function (p, w, b) { return "Siege " + w + " von " + p + (b ? " · Bestzeit " + b + " s" : ""); },
      newWord: "Neues Wort", start: "Errate das Wort mit 5 Buchstaben", five: "Bitte fünf Buchstaben", got: "Geschafft!", was: "Das Wort war ",
      right: "richtig", other: "anderer Platz", no: "nicht drin", enter: "Eingabe", back: "Löschen", lang: "Sprache", letter: "Buchstabe", empty5: "leer",
      fstats: function (p, w, s, b) { return "Gespielt " + p + " · Gewonnen " + w + " · Serie " + s + " (Best " + b + ")"; }
    },
    en: {
      mines: "Pixel Mines", grid: "Board 9 by 9", cell: "Cell", row: "row", col: "column", hidden: "hidden", flag: "flag", mine: "mine", near: "mines nearby", empty: "empty",
      newGame: "New game", flagMode: "Flag mode", help: "Reveal: click or Enter · Flag: right-click, ⚑ or F · arrow keys move",
      won: "You won!", lost: "Boom! Again?", stats: function (p, w, b) { return "Wins " + w + " of " + p + (b ? " · best " + b + " s" : ""); },
      newWord: "New word", start: "Guess the 5-letter word", five: "Five letters, please", got: "Got it!", was: "The word was ",
      right: "right", other: "wrong place", no: "not in word", enter: "Enter", back: "Delete", lang: "Language", letter: "letter", empty5: "empty",
      fstats: function (p, w, s, b) { return "Played " + p + " · Won " + w + " · Streak " + s + " (best " + b + ")"; }
    }
  };
  var WORDS = {
    de: ["SONNE", "BLATT", "HONIG", "KATZE", "PIXEL", "WOLKE", "STERN", "BLUME", "LICHT", "NACHT", "STEIN", "WELLE", "BRIEF", "ZWERG", "TRAUM", "MUSIK", "SPIEL", "KREIS", "APFEL", "BIRNE", "LAMPE", "TISCH", "KERZE", "ZEBRA", "FEDER", "INSEL", "KARTE", "FARBE", "REGEN", "WIESE"],
    en: ["PIXEL", "CLOUD", "LIGHT", "NIGHT", "STONE", "BLOCK", "MUSIC", "HEART", "PLANT", "BEACH", "TRAIN", "OCEAN", "CANDY", "SUGAR", "LEMON", "TOWER", "RIVER", "SMILE", "DREAM", "GHOST", "QUEST", "SWORD", "PIANO", "TIGER", "MAGIC", "STORM", "FROST", "GRASS", "BREAD", "HONEY"]
  };

  function css() {
    if (document.getElementById("nwebos-games-css")) return;
    var l = document.createElement("link");
    l.id = "nwebos-games-css"; l.rel = "stylesheet"; l.href = "/design/nwebos-games.css?v=" + ver;
    document.head.appendChild(l);
  }
  function load(ctx, name, fb) { try { return JSON.parse(ctx.store.get(name)) || fb; } catch (e) { return fb; } }
  function pad3(n) { return String(Math.max(0, Math.min(999, n))).padStart(3, "0"); }
  function lang(ctx) { return ctx.lang === "en" ? "en" : "de"; }

  /* ---------------- Pixelminen ---------------- */
  var minesOff = new WeakMap();
  function mines(el, ctx) {
    css();
    var t = S[lang(ctx)], win = ctx.window;
    var cells, dead, won, first, left, secs, tm = 0, run, cur = 0, flagMode = false;
    el.classList.add("g-mines");
    el.innerHTML = '<div class="pm"><div class="mnbar"><span class="lcd7" data-m role="img"></span><button type="button" class="face" aria-label="' + t.newGame + '"></button>' +
      '<button type="button" class="flagm" aria-pressed="false" aria-label="' + t.flagMode + '">⚑</button><span class="lcd7" data-t aria-hidden="true"></span></div>' +
      '<div class="mngrid" role="group" aria-label="' + t.grid + '"></div><p class="mnst" role="status" aria-live="polite"></p><p class="mnhelp">' + t.help + '</p><p class="mnstat"></p></div>';
    var grid = el.querySelector(".mngrid"), face = el.querySelector(".face"), fm = el.querySelector(".flagm"), lm = el.querySelector("[data-m]"), lt = el.querySelector("[data-t]"),
      st = el.querySelector(".mnst"), sl = el.querySelector(".mnstat");
    var nbs = [];
    for (var i = 0; i < N * N; i++) {
      var x = i % N, y = (i / N) | 0, r = [];
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) { var a = x + dx, b = y + dy; if ((dx || dy) && a >= 0 && b >= 0 && a < N && b < N) r.push(b * N + a); }
      nbs.push(r);
    }
    function showStats() { var s = load(ctx, "stats", {}); sl.textContent = t.stats(s.played || 0, s.won || 0, s.best || 0); }
    function flags() { var n = 0; for (var k = 0; k < cells.length; k++) if (cells[k].flag) n++; return n; }
    function counters() { var m = M - flags(); lm.textContent = pad3(m); lm.setAttribute("aria-label", m + " " + t.mine); lt.textContent = pad3(secs); }
    function label(j) {
      var c = cells[j], s = t.cell + " " + t.row + " " + (((j / N) | 0) + 1) + ", " + t.col + " " + (j % N + 1) + ": ";
      return s + (c.flag ? t.flag : !c.open ? t.hidden : c.mine ? t.mine : c.n ? c.n + " " + t.near : t.empty);
    }
    function paint(j) {
      var c = cells[j], b = grid.children[j];
      b.className = "c" + (c.open ? " o" : "") + (c.flag ? " f" : "") + (c.show ? " m" : "") + (c.boom ? " boom" : "");
      if (c.open && c.n && !c.mine) { b.textContent = c.n; b.dataset.n = c.n; } else { b.textContent = ""; delete b.dataset.n; }
      b.setAttribute("aria-label", label(j));
    }
    function stop() { clearInterval(tm); tm = 0; }
    function go() { if (!tm && run && !dead && !won && !win.classList.contains("min")) tm = setInterval(function () { secs = Math.min(999, secs + 1); lt.textContent = pad3(secs); }, 1000); }
    function setup() {
      stop(); cells = []; for (var k = 0; k < N * N; k++) cells.push({ mine: false, n: 0, open: false, flag: false, show: false, boom: false });
      dead = won = run = false; first = true; left = N * N - M; secs = 0; st.textContent = "";
      grid.innerHTML = ""; for (k = 0; k < N * N; k++) { var b = document.createElement("button"); b.type = "button"; b.className = "c"; b.dataset.i = k; b.tabIndex = k === cur ? 0 : -1; grid.appendChild(b); paint(k); }
      face.className = "face"; counters(); showStats();
    }
    function plant(safe) {
      var p = 0, ban = nbs[safe].concat(safe);
      while (p < M) { var k = Math.floor(Math.random() * N * N); if (cells[k].mine || ban.indexOf(k) > -1) continue; cells[k].mine = true; p++; }
      for (var j = 0; j < cells.length; j++) cells[j].n = nbs[j].filter(function (q) { return cells[q].mine; }).length;
    }
    function finish(good, j) {
      stop(); run = false; dead = !good; won = good;
      var s = load(ctx, "stats", {}); s.played = (s.played || 0) + 1;
      if (good) { s.won = (s.won || 0) + 1; if (!s.best || secs < s.best) s.best = secs; }
      ctx.store.set("stats", JSON.stringify(s));
      if (!good) { cells[j].boom = true; cells.forEach(function (c, k) { if (c.mine && !c.flag) { c.show = true; paint(k); } }); paint(j); }
      face.className = "face " + (good ? "cool" : "dead"); st.textContent = good ? t.won + " " + secs + " s" : t.lost; showStats();
      if (good) { ctx.sound.tone(660, 0, .12, "square", .08); ctx.sound.tone(880, .12, .12, "square", .08); ctx.sound.tone(1175, .24, .2, "square", .08); }
      else { ctx.sound.tone(110, 0, .35, "sawtooth", .12); }
    }
    function open(i) {
      if (dead || won || cells[i].open || cells[i].flag) return;
      if (first) { first = false; plant(i); run = true; go(); }
      var stack = [i];
      while (stack.length) {
        var j = stack.pop(), c = cells[j];
        if (c.open || c.flag) continue;
        c.open = true; left--; paint(j);
        if (c.mine) { finish(false, j); return; }
        if (!c.n) for (var q = 0; q < nbs[j].length; q++) stack.push(nbs[j][q]);
      }
      ctx.sound.click();
      if (!left) finish(true);
    }
    function flag(i) {
      if (dead || won || cells[i].open) return;
      cells[i].flag = !cells[i].flag; paint(i); counters(); ctx.sound.click();
    }
    function focusCell(k) { grid.children[cur].tabIndex = -1; cur = k; grid.children[k].tabIndex = 0; grid.children[k].focus(); }
    grid.addEventListener("click", function (e) { var b = e.target.closest(".c"); if (b) { cur = +b.dataset.i; if (flagMode) flag(cur); else open(cur); } });
    grid.addEventListener("contextmenu", function (e) { var b = e.target.closest(".c"); if (b) { e.preventDefault(); flag(+b.dataset.i); } });
    grid.addEventListener("keydown", function (e) {
      var b = e.target.closest(".c"); if (!b || e.altKey || e.ctrlKey || e.metaKey) return;
      var k = +b.dataset.i, x = k % N, y = (k / N) | 0, d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
      if (d) { e.preventDefault(); focusCell(Math.max(0, Math.min(N - 1, y + d[1])) * N + Math.max(0, Math.min(N - 1, x + d[0]))); }
      else if (e.key === "Home") { e.preventDefault(); focusCell(y * N); }
      else if (e.key === "End") { e.preventDefault(); focusCell(y * N + N - 1); }
      else if (e.key === "f" || e.key === "F") { e.preventDefault(); flag(k); }
    });
    grid.addEventListener("pointerdown", function () { if (!dead && !won) face.classList.add("oh"); });
    grid.addEventListener("pointerup", function () { face.classList.remove("oh"); });
    grid.addEventListener("pointerleave", function () { face.classList.remove("oh"); });
    face.onclick = function () { setup(); ctx.sound.click(); };
    fm.onclick = function () { flagMode = !flagMode; fm.setAttribute("aria-pressed", String(flagMode)); };
    var mo = new MutationObserver(function () { if (win.classList.contains("min")) stop(); else go(); });
    mo.observe(win, { attributes: true, attributeFilter: ["class"] });
    minesOff.set(el, function () { mo.disconnect(); stop(); });
    setup();
  }

  /* ---------------- Fünf ---------------- */
  var fiveOff = new WeakMap();
  function five(el, ctx) {
    css();
    var L = lang(ctx), t = S[L], win = ctx.window, ans, row, col, done, grid, kmark;
    el.classList.add("g-five");
    el.innerHTML = '<div class="fv"><div class="fvtop"><span class="seg2" role="group" aria-label="' + t.lang + '"><button type="button" data-v="de">DE</button><button type="button" data-v="en">EN</button></span>' +
      '<span class="fvmsg" role="status" aria-live="polite"></span><button type="button" class="fvnew"></button></div><div class="fvgrid"></div><div class="kb"></div>' +
      '<p class="fvhelp"><i class="lg t"></i><span data-h1></span><i class="lg o"></i><span data-h2></span><i class="lg s"></i><span data-h3></span></p><p class="mnstat"></p></div>';
    var G = el.querySelector(".fvgrid"), K = el.querySelector(".kb"), msg = el.querySelector(".fvmsg"), sl = el.querySelector(".mnstat");
    var day = Math.floor(Date.now() / 864e5);
    function showStats() { var s = load(ctx, "stats", {}); sl.textContent = S[L].fstats(s.played || 0, s.won || 0, s.streak || 0, s.best || 0); }
    function tile(y, x) { return G.children[y].children[x]; }
    function tlabel(y, x) { var v = grid[y][x]; return S[L].letter + " " + (x + 1) + (v ? ": " + v : ", " + S[L].empty5); }
    function start(shift) {
      t = S[L]; var list = WORDS[L]; ans = list[(day + (shift || 0) + (L === "en" ? 3 : 0)) % list.length]; row = 0; col = 0; done = false;
      grid = []; for (var y = 0; y < 6; y++) grid.push(["", "", "", "", ""]);
      G.innerHTML = ""; for (y = 0; y < 6; y++) { var r = document.createElement("div"); r.className = "fr"; for (var x = 0; x < 5; x++) { var s = document.createElement("span"); s.className = "ft"; s.setAttribute("role", "img"); r.appendChild(s); } G.appendChild(r); }
      for (y = 0; y < 6; y++) for (x = 0; x < 5; x++) tile(y, x).setAttribute("aria-label", tlabel(y, x));
      var rows = L === "en" ? ["QWERTYUIOP", "ASDFGHJKL", "↵ZXCVBNM⌫"] : ["QWERTZUIOP", "ASDFGHJKL", "↵YXCVBNM⌫"];
      K.innerHTML = rows.map(function (r) { return "<div>" + r.split("").map(function (k) { var w = k === "↵" || k === "⌫"; return '<button type="button" data-k="' + k + '"' + (w ? ' class="wide" aria-label="' + (k === "↵" ? t.enter : t.back) + '"' : "") + ">" + k + "</button>"; }).join("") + "</div>"; }).join("");
      kmark = {}; [].forEach.call(el.querySelectorAll("[data-v]"), function (b) { b.setAttribute("aria-pressed", String(b.dataset.v === L)); b.classList.toggle("on", b.dataset.v === L); });
      el.querySelector(".fvnew").textContent = t.newWord; msg.textContent = t.start;
      el.querySelector("[data-h1]").textContent = t.right; el.querySelector("[data-h2]").textContent = t.other; el.querySelector("[data-h3]").textContent = t.no; showStats();
    }
    function key(k) {
      if (done) return;
      if (k === "⌫" || k === "BACKSPACE") { if (col) { col--; grid[row][col] = ""; var b = tile(row, col); b.textContent = ""; b.classList.remove("in"); b.setAttribute("aria-label", tlabel(row, col)); } return; }
      if (k === "↵" || k === "ENTER") return submit();
      if (/^[A-Z]$/.test(k) && col < 5) { grid[row][col] = k; var c = tile(row, col); c.textContent = k; c.classList.add("in"); c.setAttribute("aria-label", tlabel(row, col)); col++; ctx.sound.click(); }
    }
    function end(good) {
      done = true;
      var s = load(ctx, "stats", {}); s.played = (s.played || 0) + 1;
      if (good) { s.won = (s.won || 0) + 1; s.streak = (s.streak || 0) + 1; if (s.streak > (s.best || 0)) s.best = s.streak; } else s.streak = 0;
      ctx.store.set("stats", JSON.stringify(s)); showStats();
      msg.textContent = good ? t.got : t.was + ans;
      if (good) { ctx.sound.tone(660, 0, .12, "square", .08); ctx.sound.tone(880, .12, .12, "square", .08); ctx.sound.tone(1175, .24, .2, "square", .08); }
    }
    function submit() {
      if (done) return;
      if (col < 5) { msg.textContent = t.five; var r = G.children[row]; r.classList.add("shake"); setTimeout(function () { r.classList.remove("shake"); }, 400); return; }
      var g = grid[row], a = ans.split(""), res = ["s", "s", "s", "s", "s"], i;
      for (i = 0; i < 5; i++) if (g[i] === a[i]) { res[i] = "t"; a[i] = null; }
      for (i = 0; i < 5; i++) if (res[i] !== "t") { var j = a.indexOf(g[i]); if (j > -1) { res[i] = "o"; a[j] = null; } }
      for (i = 0; i < 5; i++) {
        var c = tile(row, i); c.style.animationDelay = i * 90 + "ms"; c.classList.add("flip", res[i]);
        c.setAttribute("aria-label", tlabel(row, i) + ", " + (res[i] === "t" ? t.right : res[i] === "o" ? t.other : t.no));
        var kb = K.querySelector('[data-k="' + g[i] + '"]'), rank = { s: 1, o: 2, t: 3 };
        if (kb && (kmark[g[i]] || 0) < rank[res[i]]) { kmark[g[i]] = rank[res[i]]; kb.classList.remove("o", "s", "t"); kb.classList.add(res[i]); }
      }
      if (res.every(function (x) { return x === "t"; })) return end(true);
      row++; col = 0; if (row === 6) end(false);
    }
    function onkey(e) {
      if (e.altKey || e.ctrlKey || e.metaKey || e.target.closest("input,textarea")) return;
      var k = e.key.toUpperCase(), onBtn = e.target.closest && e.target.closest("button");
      if ((k === "ENTER" || e.key === " ") && onBtn) return;   // a focused button keeps its own Enter/Space
      if (/^[A-Z]$/.test(k) || k === "ENTER" || k === "BACKSPACE") { e.preventDefault(); key(k); }
    }
    K.addEventListener("click", function (e) { var b = e.target.closest("[data-k]"); if (b) { key(b.dataset.k); win.focus({ preventScroll: true }); } });
    win.addEventListener("keydown", onkey);
    el.querySelector(".seg2").onclick = function (e) { var b = e.target.closest("button"); if (b) { L = b.dataset.v; start(); win.focus({ preventScroll: true }); } };
    el.querySelector(".fvnew").onclick = function () { start(1 + Math.floor(Math.random() * 29)); win.focus({ preventScroll: true }); };   // typing + Enter work right away
    fiveOff.set(el, function () { win.removeEventListener("keydown", onkey); });
    start();
  }

  NwebOS.register("mines", { mount: mines, unmount: function (el) { var f = minesOff.get(el); if (f) f(); } });
  NwebOS.register("five", { mount: five, unmount: function (el) { var f = fiveOff.get(el); if (f) f(); } });
})();
