/* Summer Theme v2 — mouse parallax for the hero scene.

   Loaded from the start page only (`<script src="/design/summer-parallax.js?v=…" defer>`), never inline:
   the page ships `script-src 'self'` without a nonce, so a classic external file is the only shape
   that passes. No dependency, no network, no eval, no innerHTML — it only writes three custom
   properties on the scene element:

     --sm-mx / --sm-my  few-pixel offset (the CSS owns the transform)
     --sm-mr            a fraction of a degree of rotation

   Why custom properties: the scene's transform lives in summer.css, the scroll parallax lives in
   the same file (scroll-driven animations), and this file must not fight either of them.

   It stays off when the user asks for less motion, on touch devices (no pointer to follow) and in
   browsers without matchMedia. `pointermove` is passive: scrolling is never blocked. */
(function () {
  var MAX_X = 6; /* px — "wenige Pixel" */
  var MAX_Y = 4;
  var MAX_R = 0.35; /* deg */

  if (!window.matchMedia) return;
  var fine = window.matchMedia("(hover: hover) and (pointer: fine)");
  var calm = window.matchMedia("(prefers-reduced-motion: reduce)");

  var scenes = document.querySelectorAll("[data-sm-parallax]");
  if (!scenes.length) return;

  var running = false;
  var handlers = [];

  function set(scene, x, y, r) {
    scene.style.setProperty("--sm-mx", x.toFixed(2) + "px");
    scene.style.setProperty("--sm-my", y.toFixed(2) + "px");
    scene.style.setProperty("--sm-mr", r.toFixed(3) + "deg");
  }

  function reset() {
    for (var i = 0; i < scenes.length; i++) set(scenes[i], 0, 0, 0);
  }

  function start() {
    if (running) return;
    running = true;
    for (var i = 0; i < scenes.length; i++) {
      (function (scene) {
        var frame = 0;
        var onMove = function (event) {
          if (frame) return;
          frame = window.requestAnimationFrame(function () {
            frame = 0;
            var box = scene.getBoundingClientRect();
            if (!box.width || !box.height) return;
            /* -1 … 1 from the centre of the scene, then a damped offset. */
            var nx = (event.clientX - box.left) / box.width;
            var ny = (event.clientY - box.top) / box.height;
            var x = (nx - 0.5) * 2 * MAX_X;
            var y = (ny - 0.5) * 2 * MAX_Y;
            set(scene, -x, -y, -x * MAX_R / MAX_X * 2);
          });
        };
        var onLeave = function () {
          if (frame) {
            window.cancelAnimationFrame(frame);
            frame = 0;
          }
          set(scene, 0, 0, 0);
        };
        scene.addEventListener("pointermove", onMove, { passive: true });
        scene.addEventListener("pointerleave", onLeave, { passive: true });
        scene.addEventListener("pointercancel", onLeave, { passive: true });
        handlers.push([scene, onMove, onLeave]);
      })(scenes[i]);
    }
  }

  function stop() {
    if (!running) return;
    running = false;
    for (var i = 0; i < handlers.length; i++) {
      handlers[i][0].removeEventListener("pointermove", handlers[i][1]);
      handlers[i][0].removeEventListener("pointerleave", handlers[i][2]);
      handlers[i][0].removeEventListener("pointercancel", handlers[i][2]);
    }
    handlers.length = 0;
    reset();
  }

  function sync() {
    if (fine.matches && !calm.matches) start();
    else stop();
  }

  sync();
  if (fine.addEventListener) {
    fine.addEventListener("change", sync);
    calm.addEventListener("change", sync);
  } else if (fine.addListener) {
    fine.addListener(sync);
    calm.addListener(sync);
  }
})();
