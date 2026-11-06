/* Start page: the latest guestbook entry in the teaser card. Plain fetch of the existing public list;
   on any failure the server-rendered text stays. No inline script, no tracking. */
(function () {
  var box = document.querySelector("[data-gb-latest]");
  if (!box) return;
  var lang = document.documentElement.lang === "en" ? "en-GB" : "de-DE";
  fetch("/api/guestbook", { credentials: "omit" })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (d) {
      var e = d && d.entries && d.entries[0];
      if (!e || !e.message) return;
      var msg = String(e.message), cut = msg.length > 140 ? msg.slice(0, 137) + "…" : msg;
      var p = document.createElement("p"); p.textContent = "„" + cut + "“";
      var f = document.createElement("footer");
      var av = String(e.avatar || "");
      if (/^https:\/\//.test(av)) { var i = document.createElement("img"); i.alt = ""; i.width = 26; i.height = 26; i.src = av; f.appendChild(i); }
      var when = "";
      try { when = new Date(String(e.created_at).replace(" ", "T") + "Z").toLocaleDateString(lang, { day: "2-digit", month: "2-digit", year: "numeric" }); } catch (_) {}
      f.appendChild(document.createTextNode((e.name || "") + (when ? " · " + when : "")));
      box.replaceChildren(p, f);
    })
    .catch(function () {});
})();
