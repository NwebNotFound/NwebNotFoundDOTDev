/* Private profile: highlights the tab of the section in view, and the "Daten löschen" request.
   No inline script. Deleting removes the owner's guestbook entries and sessions (POST /api/profile/delete). */
(function () {
  var tabs = [].slice.call(document.querySelectorAll("[data-p3-tabs] a"));
  function cur(a) { tabs.forEach(function (x) { if (x === a) x.setAttribute("aria-current", "page"); else x.removeAttribute("aria-current"); }); }
  tabs.forEach(function (a) { a.addEventListener("click", function () { cur(a); }); });
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { var a = tabs.filter(function (x) { return x.getAttribute("href") === "#" + e.target.id; })[0]; if (a) cur(a); } });
    }, { rootMargin: "-35% 0px -55% 0px" });
    ["uebersicht", "lesen", "erfolge", "gaestebuch", "einstellungen"].forEach(function (id) { var s = document.getElementById(id); if (s) io.observe(s); });
  }
  var btn = document.querySelector("[data-p3-delete]"), msg = document.querySelector("[data-p3-msg]");
  if (!btn) return;
  btn.addEventListener("click", function () {
    if (!window.confirm("Gästebuch-Einträge und Anmeldung wirklich löschen? Das lässt sich nicht rückgängig machen.")) return;
    btn.disabled = true;
    fetch("/api/profile/delete", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirm: "delete" }) })
      .then(function (r) { if (!r.ok) throw new Error("x"); location.assign("/"); })
      .catch(function () { btn.disabled = false; if (msg) msg.textContent = "Das hat nicht geklappt. Versuch es gleich noch einmal."; });
  });
})();
