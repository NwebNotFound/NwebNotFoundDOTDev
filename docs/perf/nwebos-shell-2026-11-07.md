# NwebOS shell: runtime numbers vs the current main site (07.11.2026)

`scripts/perf-runtime.mjs` (from #100): local `wrangler dev`, CPU throttled 4×, 375 (mobile, touch) and 1280.
"old" = the current pages, "OS" = the same paths with `PERF_COOKIE=nnf_os=1` (desktop already booted, guest).
The INP proxy is one click on the nav toggle (old) or the start button / home button (OS).

| Page | Width | LCP ms | TBT ms | Long tasks | CLS | Idle busy % | Scroll fps | INP ms |
|---|---|---|---|---|---|---|---|---|
| / | 375 | 704 → 324 | 0 → 29 | 1 → 1 | 0 → 0 | 0.1 → 0 | 60.1 → 60.3 | 40 → 24 |
| /de | 375 | 348 → 340 | 0 → 35 | 0 → 1 | 0 → 0 | 0.1 → 0 | 60.1 → 60.4 | 40 → 24 |
| /portfolio | 375 | 664 → 336 | 197 → 108 | 1 → 1 | 0 → 0 | 0 → 0 | 60.5 → 60.4 | 40 → 32 |
| /guestbook | 375 | 480 → 264 | 0 → 71 | 0 → 1 | 0 → 0 | 0 → 0 | 60.4 → 60.6 | 32 → 24 |
| / | 1280 | 376 → 212 | 25 → 72 | 1 → 1 | 0.258 → 0 | 0.1 → 0 | 60.2 → 60.6 | 32 → 64 |
| /de | 1280 | 372 → 212 | 0 → 71 | 0 → 1 | 0.006 → 0 | 0.1 → 0 | 60.2 → 60.3 | 48 → 64 |
| /portfolio | 1280 | 648 → 348 | 192 → 104 | 1 → 1 | 0.026 → 0 | 0.1 → 0 | 60.2 → 60.4 | 48 → 40 |
| /guestbook | 1280 | 708 → 280 | 0 → 68 | 1 → 1 | 0.043 → 0 | 0.1 → 0 | 60.1 → 60.4 | 32 → 32 |

## The #100 budget
- **Idle main-thread work:** 0 %. No canvas, no rAF loop, no scroll or resize listeners. The only timer is the clock, once a minute.
- **LCP:** lower on every page. **CLS:** 0 everywhere; the old start page had 0.258.

## The cost
**TBT:** one long task of ~70–100 ms during load (4× throttle): parsing plus `nwebos.js` restoring and opening windows. That's well under the 200 ms "good" threshold, but it isn't 0 like some old pages. A follow-up could defer restoring the minimised windows.

Raw JSON: not committed (local run).
