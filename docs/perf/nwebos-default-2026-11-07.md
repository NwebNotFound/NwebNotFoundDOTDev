# NwebOS as the default: runtime numbers (07.11.2026)

`scripts/perf-runtime.mjs main` against local `wrangler dev`, CPU throttled 4×, without any cookie, so this is what every visitor now gets. Before/after against the old pages: `docs/perf/nwebos-shell-2026-11-07.md` (same code, then opt-in).

| Page | Width | LCP ms | TBT ms | Long tasks | CLS | Idle busy % | Scroll fps | INP ms |
|---|---|---|---|---|---|---|---|---|
| / | 375 | 316 | 31 | 1 | 0 | 0 | 60.6 | 24 |
| /de | 375 | 200 | 56 | 1 | 0 | 0 | 60.4 | 32 |
| /portfolio | 375 | 356 | 114 | 1 | 0 | 0 | 60.5 | 32 |
| /guestbook | 375 | 268 | 74 | 1 | 0 | 0 | 60.5 | 32 |
| / | 1280 | 224 | 72 | 1 | 0 | 0 | 60.6 | 64 |
| /de | 1280 | 216 | 63 | 1 | 0 | 0 | 60.3 | 56 |
| /portfolio | 1280 | 312 | 81 | 1 | 0 | 0 | 60.6 | 32 |
| /guestbook | 1280 | 280 | 76 | 1 | 0 | 0 | 60.4 | 32 |

Against the #100 budget:
- **Idle main-thread work:** 0 %. No canvas, no rAF loop, no scroll or resize listeners.
- **CLS:** 0.
- **LCP:** below the old pages on every path (see the shell note).
- **TBT:** one load long task, 31–114 ms.

`PERF_COOKIE=nnf_os=0` measures the old pages.
