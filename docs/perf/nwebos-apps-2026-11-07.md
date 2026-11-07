# NwebOS app windows: runtime numbers (07.11.2026)

`scripts/perf-runtime.mjs main` against local `wrangler dev`, CPU throttled 4×, no cookie (the profile is the guest window). Same method as `docs/perf/nwebos-default-2026-11-07.md`; the four shell pages are measured again for comparison.

| Page | Width | LCP ms | TBT ms | Long tasks | CLS | Idle busy % | Scroll fps | INP ms |
|---|---|---|---|---|---|---|---|---|
| / | 375 | 560 | 41 | 1 | 0 | 0 | 60.3 | 24 |
| /de | 375 | 236 | 63 | 1 | 0 | 0 | 60.4 | 32 |
| /portfolio | 375 | 372 | 117 | 1 | 0 | 0 | 60.5 | 32 |
| /guestbook | 375 | 288 | 70 | 1 | 0 | 0 | 60.5 | 32 |
| /blog | 375 | 504 | 50 | 1 | 0 | 0 | 60.3 | 32 |
| /blog/eine-navigation-fuer-zwei-seiten | 375 | 524 | 53 | 1 | 0 | 0 | 60.5 | 32 |
| /changelog | 375 | 356 | 75 | 1 | 0 | 0 | 60.4 | 32 |
| /music | 375 | 456 | 51 | 1 | 0 | 0 | 60.6 | 24 |
| /writing | 375 | 456 | 48 | 1 | 0 | 0 | 60.6 | 24 |
| /profile | 375 | 264 | 65 | 1 | 0 | 0.1 | 60.2 | 24 |
| / | 1280 | 224 | 63 | 1 | 0 | 0 | 60.7 | 72 |
| /de | 1280 | 452 | 54 | 1 | 0 | 0 | 60.6 | 64 |
| /portfolio | 1280 | 304 | 66 | 1 | 0 | 0 | 60.5 | 40 |
| /guestbook | 1280 | 268 | 63 | 1 | 0 | 0 | 60.6 | 48 |
| /blog | 1280 | 528 | 50 | 1 | 0 | 0 | 60.6 | 40 |
| /blog/eine-navigation-fuer-zwei-seiten | 1280 | 524 | 51 | 1 | 0 | 0 | 60.5 | 40 |
| /changelog | 1280 | 504 | 51 | 1 | 0 | 0 | 60.4 | 40 |
| /music | 1280 | 396 | 67 | 1 | 0 | 0 | 60.5 | 48 |
| /writing | 1280 | 276 | 65 | 1 | 0 | 0 | 60.4 | 48 |
| /profile | 1280 | 260 | 68 | 1 | 0 | 0.1 | 60.3 | 64 |

Against the #100 budget:
- **Idle main-thread work:** 0–0.1 %. No canvas, no rAF loop; the only scroll listener is the reader progress fallback (passive, only where CSS `animation-timeline` is missing, only inside the post window).
- **CLS:** 0 on every page.
- **TBT:** one load long task, 41–117 ms (same range as the shell PR).
- **LCP:** 224–560 ms; the blog and post windows are 500–530 ms (server-rendered list/post plus the app stylesheet).
- Blog posts for the search load from `/api/blog` only on the first focus of a search field, not on page load.
