// Runs synchronously in <head> before CSS paints, so the theme never flips between loads.
(function () {
  try {
    var saved = localStorage.getItem("ai-theme");
    var light = window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
    document.documentElement.dataset.theme = saved || (light ? "light" : "dark");
  } catch (e) {}
})();
