/* Hero parallax for the Minecraft start page (Summer Theme v2).
   Two independent effects, both transform-only:

   1) Pointer parallax on the hero scene. The pointer offset lands on `.hscene .in` as --mx/--my
      (few pixels, spring-damped), so it never fights the scroll offset that rides on `.ly`.
      Only on fine pointers with hover, and only when the scene is on screen.
   2) Scroll fallback for browsers without CSS scroll-driven animations
      (`animation-timeline: scroll()`). Those layers then get `.par-js` and their `--sy` offset from
      a rAF loop driven by passive scroll/resize listeners — the offsets match the CSS keyframes.

   No inline JS, no dependencies, no scroll hijacking: nothing is prevented or re-scrolled, and under
   `prefers-reduced-motion: reduce` the script does nothing at all (the CSS switches everything off).
   Layers carry their depth in --k (pointer) and --py (scroll) from the stylesheet. */
(() => {
  "use strict";
  const scene = document.querySelector(".hscene");
  if (!scene) return;
  // The scene itself is pointer-events:none (pure decoration); the pointer listener lives on the
  // hero, which still receives the events from its children.
  const host = scene.parentElement || scene;
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const fine = window.matchMedia("(hover: hover) and (pointer: fine)");
  const layers = [...scene.querySelectorAll(".ly")].map((el) => ({
    el,
    k: parseFloat(getComputedStyle(el).getPropertyValue("--k")) || 1,
    py: parseFloat(getComputedStyle(el).getPropertyValue("--py")) || 0,
  }));
  if (!layers.length) return;

  const MAX_PX = 7; // deliberate: a few pixels, not a moving background
  let targetX = 0, targetY = 0, curX = 0, curY = 0, raf = 0, running = false;
  let pointer = false, visible = true;
  const cssScroll = CSS.supports && CSS.supports("animation-timeline: scroll()");

  function frame() {
    raf = 0;
    if (pointer) {
      // spring damping: move a quarter of the remaining distance per frame
      curX += (targetX - curX) * 0.25;
      curY += (targetY - curY) * 0.25;
      if (Math.abs(targetX - curX) < 0.05 && Math.abs(targetY - curY) < 0.05) { curX = targetX; curY = targetY; }
      scene.style.setProperty("--mx", curX.toFixed(2) + "px");
      scene.style.setProperty("--my", curY.toFixed(2) + "px");
    }
    if (!cssScroll) {
      const box = scene.getBoundingClientRect();
      const span = Math.max(1, box.height + window.innerHeight * 0.3);
      const p = Math.min(1, Math.max(0, -box.top / span));
      for (const l of layers) l.el.style.setProperty("--sy", (p * l.py).toFixed(2) + "px");
    }
    if (running && (pointer || !cssScroll)) raf = requestAnimationFrame(frame);
  }
  function schedule() {
    if (raf || motion.matches) return;
    raf = requestAnimationFrame(frame);
  }
  function start() { if (running) return; running = true; schedule(); }
  function stop() { running = false; if (raf) { cancelAnimationFrame(raf); raf = 0; } }

  host.addEventListener("pointermove", (e) => {
    if (motion.matches || !fine.matches || !running) return;
    const box = scene.getBoundingClientRect();
    const nx = ((e.clientX - box.left) / Math.max(1, box.width)) * 2 - 1;
    const ny = ((e.clientY - box.top) / Math.max(1, box.height)) * 2 - 1;
    targetX = Math.max(-1, Math.min(1, nx)) * MAX_PX;
    targetY = Math.max(-1, Math.min(1, ny)) * MAX_PX * 0.6;
    pointer = true;
    schedule();
  }, { passive: true });
  host.addEventListener("pointerleave", () => { pointer = false; targetX = 0; targetY = 0; schedule(); }, { passive: true });

  if (!cssScroll) {
    scene.classList.add("par-js"); // the stylesheet needs the class to apply --sy
    window.addEventListener("scroll", () => { if (visible) schedule(); }, { passive: true });
    window.addEventListener("resize", () => { if (visible) schedule(); }, { passive: true });
  }
  // Pause the loop while the hero is off screen (battery, and no work while reading).
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((entries) => {
      visible = entries.some((x) => x.isIntersecting);
      if (visible) { start(); schedule(); } else stop();
    }, { rootMargin: "120px" }).observe(scene);
  } else visible = true;
  if (motion.addEventListener) motion.addEventListener("change", () => { if (motion.matches) { stop(); scene.style.removeProperty("--mx"); scene.style.removeProperty("--my"); } else { start(); schedule(); } });
  start();
  schedule();
})();
