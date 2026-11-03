# Screenshots

Generated against `scripts/dev-server.mjs` with the mock Hermes from `test/helpers.mjs`
(`mock.state.approvalInStream = true`), so every value here is test data — no profile names,
keys or host paths beyond the loopback dev server.

| File | What it shows |
|---|---|
| `chat-desktop-dark.png` | 1280×900, chat with tool row (`terminal · exit 0`), approval card, health dot `online`, conversation in the sidebar |
| `chat-desktop-light.png` | same, light theme |
| `chat-mobile-dark.png` | 390×844, chat + approval card + health dot |
| `sidebar-mobile-dark.png` | 390×844 drawer with the history list (title · bot · date · message count) |
| `chat-mobile-light.png` | 390×844, light theme |
| `crew-mobile-dark.png` | 390×844 Crew-Runs: bot picker, type chips (`Alle` active), three session cards with badge · title · status/start/message count · id |
| `crew-mobile-light.png` | same, light theme (the wrapped hostile title shows that markup renders as text) |
| `crew-mobile-dark-transcript.png` | 390×844 transcript: role/tool/time line, monospace body, `[redacted]` where a key was |
| `crew-desktop-dark.png` | 1280×900 Crew-Runs list in its 880px reading column |
| `crew-desktop-light.png` | same, light theme |
| `crew-desktop-dark-transcript.png` | 1280×900 transcript for `run_9f2c1a4b` |
| `crew-desktop-light-transcript.png` | same, light theme |

The Crew-Runs shots are a read-only view: there is no approve/delete/steer affordance in any of
them, by design. Contrast of the token pairs used there (meta text, chip labels, badge label) is
5.7:1 or better in both themes; the only sub-3:1 pair is the decorative card hairline, which is
not the sole indicator of anything.

Chrome for Testing 156 (headless) over CDP, device scale 1. They document behaviour, not pixel
fidelity — the theme tokens come from `public/app.css`.
