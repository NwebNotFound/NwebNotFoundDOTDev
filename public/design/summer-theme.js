/* Creative Hub theme bootstrap — sibling of ai-panel/public/theme.js.

   Load it synchronously in <head>, BEFORE the stylesheet, so the theme is known before first paint
   (no light flash for a user who picked "summer night"). Classic script, no inline handlers, no
   eval, no external requests: it passes `script-src 'self'` without a nonce.

   Precedence (matches public/design/summer.css):
     1. ?theme=day|night        — explicit link (used by the preview page and for screenshots)
     2. localStorage "summer-theme"
     3. the system's prefers-color-scheme (the CSS handles it; we simply set nothing)

   Markup for a toggle (optional, Phase 2):
     <button type="button" data-summer-theme-toggle aria-pressed="false">Theme</button> */
(function () {
  var KEY = "summer-theme";
  var DAY = "summer-day";
  var NIGHT = "summer-night";

  function fromQuery() {
    try {
      var v = new URLSearchParams(window.location.search).get("theme");
      if (v === "day") return DAY;
      if (v === "night") return NIGHT;
      if (v === "auto") return null;
    } catch (e) {}
    return undefined;
  }

  function fromStore() {
    try {
      var v = window.localStorage.getItem(KEY);
      return v === DAY || v === NIGHT ? v : null;
    } catch (e) {
      return null;
    }
  }

  function apply(theme) {
    var root = document.documentElement;
    if (theme) root.dataset.theme = theme;
    else delete root.dataset.theme;
    // For the label we need to know what is actually painted when no choice is stored.
    var shown = theme;
    if (!shown) {
      shown =
        window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? NIGHT : DAY;
    }
    var toggles = document.querySelectorAll("[data-summer-theme-toggle]");
    for (var i = 0; i < toggles.length; i++) {
      toggles[i].setAttribute("aria-pressed", shown === NIGHT ? "true" : "false");
      var label = toggles[i].getAttribute(shown === NIGHT ? "data-label-day" : "data-label-night");
      if (label) toggles[i].textContent = label;
    }
  }

  function current() {
    var theme = fromQuery();
    if (theme === undefined) theme = fromStore();
    return theme;
  }

  // Runs during head parsing: the attribute exists before the body paints.
  apply(current());

  document.addEventListener("DOMContentLoaded", function () {
    apply(current());
    document.addEventListener("click", function (event) {
      var el = event.target && event.target.closest ? event.target.closest("[data-summer-theme-toggle]") : null;
      // Re-derive from what is currently painted, so a system-dark page toggles to day first.
      var next;
      if (el) {
        var shown = document.documentElement.dataset.theme;
        if (!shown) shown = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? NIGHT : DAY;
        next = shown === NIGHT ? DAY : NIGHT;
        try {
          window.localStorage.setItem(KEY, next);
        } catch (e) {}
        apply(next);
      }
    });
  });
})();
