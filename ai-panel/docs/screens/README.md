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

Chrome for Testing 156 (headless) over CDP, device scale 1. They document behaviour, not pixel
fidelity — the theme tokens come from `public/app.css`.
