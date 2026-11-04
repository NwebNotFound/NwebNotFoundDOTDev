/* Summer Theme v2 — reader helpers for chapter pages (artboard Story.html).

   Loaded from post/chapter pages only (`<script src="/design/summer-reader.js" defer>`), never
   inline: the page ships `script-src 'self'` without a nonce. No dependency, no network, no eval,
   no innerHTML.

   It does two things:

   1. Reading progress — a lavender 4px line above the header. The script only writes the scroll
      ratio into the custom property `--sm-progress` on the bar; the CSS owns the transform, so no
      layout is touched and nothing is read back per frame. The scroll listener is passive and the
      update runs inside requestAnimationFrame.

   2. Text size — one "Aa" button that cycles small → normal → large. The choice goes into
      `data-sm-reading` on the root element and into localStorage, wrapped in try/catch (private
      mode and blocked storage must not break the page). Keyboard: it is a real <button>, so Enter
      and Space work; the aria-label is updated to the size just selected. Without this script the
      button does nothing and the prose keeps the artboard size.

   prefers-reduced-motion: the bar itself is not animated (no transition, no keyframes) — it only
   follows the scroll position, so there is nothing to switch off. If a transition ever gets added,
   the static CSS already disables it for that preference. */
(function () {
  var STORE = "summer-reading";

  /* ---- 1. reading progress ---- */
  var bar = document.querySelector("[data-sm-progress]");
  if (bar) {
    var frame = 0;
    var update = function () {
      frame = 0;
      var doc = document.documentElement;
      var max = doc.scrollHeight - window.innerHeight;
      var ratio = max > 0 ? window.scrollY / max : 0;
      if (ratio < 0) ratio = 0;
      if (ratio > 1) ratio = 1;
      bar.style.setProperty("--sm-progress", ratio.toFixed(4));
    };
    var request = function () {
      if (frame) return;
      frame = window.requestAnimationFrame(update);
    };
    window.addEventListener("scroll", request, { passive: true });
    window.addEventListener("resize", request, { passive: true });
    update();
  }

  /* ---- 2. text size ---- */
  var button = document.querySelector("[data-sm-reading-size]");
  var STEPS = ["small", "normal", "large"];

  function read() {
    try {
      var saved = window.localStorage.getItem(STORE);
      return STEPS.indexOf(saved) >= 0 ? saved : "normal";
    } catch (e) {
      return "normal";
    }
  }

  function label(size) {
    if (!button) return size;
    var pattern = button.getAttribute("data-label") || "{size}";
    var word = button.getAttribute("data-size-" + size) || size;
    return pattern.split("{size}").join(word);
  }

  function apply(size) {
    var root = document.documentElement;
    if (size === "normal") root.removeAttribute("data-sm-reading");
    else root.setAttribute("data-sm-reading", size);
    if (!button) return;
    button.setAttribute("data-size", size);
    button.setAttribute("aria-label", label(size));
  }

  if (button) {
    apply(read());
    button.addEventListener("click", function () {
      var next = STEPS[(STEPS.indexOf(button.getAttribute("data-size") || "normal") + 1) % STEPS.length];
      apply(next);
      try {
        window.localStorage.setItem(STORE, next);
      } catch (e) {
        /* storage blocked: the size still applies for this page view */
      }
    });
  }
})();
