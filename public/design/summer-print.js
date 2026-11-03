// Print helper for the Creative Hub (docs/creative-hub-plan.md §8 "Export", phase 3c).
//
// The "Print as PDF" button on story and series pages calls `window.print()`. It lives in its own
// external file on purpose: an inline `onclick` would break the CSP, and the button must keep working
// without JavaScript as a plain hint. No `eval`, no `innerHTML`, no network.
//
// The print layout itself is the `@media print` block in public/design/summer.css.
(() => {
  const buttons = document.querySelectorAll("[data-sm-print]");
  for (const button of buttons) {
    button.addEventListener("click", () => window.print());
  }
})();
