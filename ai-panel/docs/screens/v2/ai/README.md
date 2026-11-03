# Summer Theme v2 — AI panel screens

Before/after material for the `ai.nwebnotfound.dev` redesign. Every value in these images is mock
data from `test/helpers.mjs` (the mock Hermes) — no profile names, keys or host paths beyond the
loopback dev server.

| File | What it is |
|---|---|
| `mockup-<page>-1280.png` | the static mockup (`/opt/data/mockups/summer-v2/Ai*.html`), 1280×900 — the "Soll" |
| `neu-<page>-1280.png` | the real panel at 1280×900, dark theme (the mockups are the night variant) |
| `neu-<page>-390.png` | the real panel at 390×844, dark theme |
| `day-<page>-1280.png` | the real panel at 1280×900, light theme (proves the day tokens) |

Pages: `chat`, `bots`, `crew`, `cron`, `usage`, `log`.

## Regenerate

`capture.mjs` boots the mock Hermes, runs `scripts/dev-server.mjs` against it, signs in through the
dev-only `/__dev/login` route and drives headless Chromium over the six views. Nothing here ships:
the file lives under `docs/` and is imported by no runtime module.

```bash
# From the website repo root. The Playwright image carries the Chromium build.
tar -cf - -C . ai-panel -C /path/to/mockups summer-v2 \
  | docker run --rm -i -v hermes-scratch-ai-out:/out -e OUT_DIR=/out -w /work \
      mcr.microsoft.com/playwright:v1.64.1-noble sh -c '
        mkdir -p /work && tar -xf - -C /work && mv /work/summer-v2 /work/mockups &&
        cd /work/ai-panel && npm i --no-save playwright@1.64.1 &&
        node docs/screens/v2/ai/capture.mjs'
docker run --rm -v hermes-scratch-ai-out:/out alpine tar -cf - -C /out . | tar -xf - -C ai-panel/docs/screens/v2/ai
```

The shots use `colorScheme: dark` for the primary pass because the mockups are the night variant;
the panel's own toggle reads `prefers-color-scheme` on first load, so the day pass is the same page
with `colorScheme: light`.
