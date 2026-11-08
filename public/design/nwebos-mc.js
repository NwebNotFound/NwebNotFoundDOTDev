/* NwebOS Block Edition (mc.nwebnotfound.dev), small extras next to the shared core (public/design/nwebos.js):
   - the tray's server dot and the login footer show the live player count (/api/mc-status, the same as the old page)
   - switching OS (the "Hauptseite" icon here, the Minecraft-Server icon on main): a 0.7 s full-screen bar in the
     target OS's colour, then the page loads (0 s with reduced motion; Ctrl/Cmd-click is a normal new tab) */
(function () {
  "use strict";
  var rm = function () { return document.documentElement.classList.contains("rm") || matchMedia("(prefers-reduced-motion: reduce)").matches; };
  function osSwitch(href, target) {
    var mc = target === "mc";
    var bar = document.createElement("div"); bar.id = "switch"; bar.className = "scr"; bar.setAttribute("role", "status");
    bar.style.background = mc ? "#3f8a2a" : "#1f5bd8";
    bar.innerHTML = '<div class="swin"><p>Wechsle zu NwebOS · ' + (mc ? "Block Edition" : "Summer Edition") + '</p><div class="bbar"><i></i><i></i><i></i></div></div>';
    document.body.appendChild(bar);
    setTimeout(function () { location.href = href; }, rm() ? 0 : 700);
  }
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[data-os-switch]");
    if (!a || e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault(); osSwitch(a.href, a.getAttribute("data-os-switch"));
  }, true);
  window.NwebOSSwitch = osSwitch;
  var dot = document.querySelector("[data-srv]");
  if (!dot) return;
  fetch("/api/mc-status", { credentials: "omit" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
    if (!d) return;
    var on = !!d.online, n = d.players ? (d.players.online || 0) + "/" + (d.players.max || 0) : "";
    dot.hidden = false; dot.classList.toggle("off", !on); dot.title = on ? "Server online" : "Server offline";
    var t = dot.querySelector("[data-srv-n]"); if (t) t.textContent = on ? n : "offline";
    var line = document.querySelector("[data-srv-line]"); if (line) line.textContent = on ? "Server online · " + n.replace("/", " / ") + " Spieler" : "Server offline";
  }).catch(function () {});
})();
