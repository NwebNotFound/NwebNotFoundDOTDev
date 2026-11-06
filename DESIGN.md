# NwebNotFound Design System

One design language for two surfaces that ship from this repository:

| Surface | Entry point | Renderer | Theme switch |
| --- | --- | --- | --- |
| Website (`nwebnotfound.dev`, `mc.nwebnotfound.dev`) | `src/worker.js`, `public/` | one Cloudflare Worker, server-rendered HTML + one small static stylesheet | `prefers-color-scheme` |
| AI panel (`ai.nwebnotfound.dev`) | `ai-panel/public/` | static SPA, no build step | `data-theme` on `<html>`, persisted in `localStorage` |

The conventions follow [shadcn/ui](https://ui.shadcn.com/docs/theming): a small set of semantic
CSS custom properties (`--background`, `--foreground`, `--card`, `--primary`, `--muted`,
`--border`, `--ring`, `--radius`) that components read, instead of components hard-coding colours.
We keep the same *semantics* and the same *shape* of the token set; we do not copy its component
markup, and there is no Tailwind in this repo.

Rules that apply everywhere:

- A component never contains a raw colour, radius, shadow or spacing value. It reads a token.
- Tokens are the only thing that changes per surface and per theme. Structure does not.
- Legacy variable names already used by the site (`--bg`, `--fg`, `--mut`, `--acc`, `--line`, …)
  and by the panel (`--text-dim`, `--bg-elev`, `--accent-weak`, …) stay in place as aliases that
  point at the canonical `--ds-*` token. This is what keeps the migration free of visual diffs.

## 0. Product requirements (non-negotiable)

These come from Nils and are checked on every UI change. A change that breaks one of them is not
mergeable, however good it looks in isolation.

1. **Mobile-first, Apple-level finish.** The 390px viewport is the design target; 1280px is the
   same layout with more room, never a separate design.
2. **One type family.** `-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif`
   (plus `"Segoe UI", Roboto` as Windows/Linux fallbacks). No webfont for UI text; Monocraft is
   allowed only inside the MC sub-theme's headings and numbers.
3. **One accent.** Exactly one interactive colour per surface. Everything else is neutral. Status
   colours (success/warning/danger) are states, not accents, and always come with text or an icon.
4. **8pt rhythm**, soft shadows, soft radii, generous whitespace. No dense 2px paddings.
5. **Real dark mode** — both surfaces are designed in both themes, not inverted with a filter.
6. **WCAG AA everywhere** (§2), enforced by `scripts/contrast-check.mjs`.
7. **Touch targets ≥ 44×44px** and form fields at **16px** on touch, so mobile Safari never zooms.
8. **Safe areas** — every edge-touching element pads with `env(safe-area-inset-*)`
   (`viewport-fit=cover` is set in both documents).
9. **Glassy headers** — translucent background plus `backdrop-filter: saturate(180%) blur(20px)`,
   with content scrolling underneath.
10. **Gestures are an addition, never the only path.** Swipe from the left edge opens the panel
    drawer, swipe left closes it; the same actions exist as buttons.
11. **No native browser UI.** No `prompt()`, `alert()` or bare `confirm()`: use `<dialog>`
    (§8 Dialogs). No default-styled scrollbars, selects or buttons where they can be styled.
12. **Motion 150–250ms**, opacity/transform only, and everything collapses under
    `prefers-reduced-motion: reduce`.
13. **No horizontal scrolling at 390px**, nothing clipped, no text under 11px.

---

## 1. Colour tokens

Semantic names first, values per theme. Every token below also exists as an alias in the surface
that uses it, so a component may use either name — new code uses the `--ds-*` name.

### 1.1 Website — portfolio theme

| Token | Light | Dark | Used for |
| --- | --- | --- | --- |
| `--ds-background` | `#fbfbfd` | `#000000` | page background |
| `--ds-foreground` | `#1d1d1f` | `#f5f5f7` | body text, headings |
| `--ds-surface` | `#ffffff` | `#1c1c1e` | cards, fields, menus |
| `--ds-surface-2` | `#f5f5f7` | `#0b0b0c` | alternating section band (`.alt`) |
| `--ds-muted-foreground` | `#6e6e73` | `#a1a1a6` | secondary text, captions |
| `--ds-border` | `rgba(0,0,0,.08)` | `rgba(255,255,255,.1)` | hairlines, card outline |
| `--ds-primary` | `#0071e3` | `#0974d8` | solid button fill |
| `--ds-primary-foreground` | `#ffffff` | `#ffffff` | text on `--ds-primary` |
| `--ds-link` | `#0066cc` | `#2997ff` | links, secondary button text |
| `--ds-accent-strong` | `#bf4800` | `#ff9f0a` | eyebrow labels, small emphasis |
| `--ds-navbar` | `rgba(251,251,253,.72)` | `rgba(0,0,0,.7)` | sticky nav / popover backdrop |
| `--ds-ring` | `rgba(0,113,227,.18)` | `rgba(10,132,255,.3)` | focus halo (`box-shadow` spread) |
| `--ds-shadow-color` | `rgba(0,0,0,.25)` | `rgba(0,0,0,.9)` | shadow tint |

`--ds-primary` is intentionally one step darker than the brand blue `#0071e3` in dark mode:
white text on `#0a84ff` only reaches 3.65:1, which fails AA for button labels (see §2).

### 1.2 AI panel theme

| Token | Dark (default) | Light | Used for |
| --- | --- | --- | --- |
| `--ds-background` | `#0f1115` | `#ffffff` | chat background |
| `--ds-surface` | `#16181d` | `#f7f8fa` | cards, composer, code header |
| `--ds-sidebar` | `#0b0d11` | `#f4f5f7` | sidebar rail |
| `--ds-hover` | `#1d2026` | `#eceef2` | hover / selected row |
| `--ds-border` | `#262a31` | `#dfe3e8` | component borders |
| `--ds-border-soft` | `#1e2228` | `#e8ebef` | inner separators |
| `--ds-foreground` | `#e8eaed` | `#17191c` | body text |
| `--ds-muted-foreground` | `#9aa0a8` | `#5c636b` | labels, meta |
| `--ds-faint-foreground` | `#818896` | `#656c74` | timestamps, hints (min AA value) |
| `--ds-primary` | `#7c9cff` | `#3355d8` | accent text, focus, send button |
| `--ds-primary-foreground` | `#0b0d11` | `#ffffff` | text on `--ds-primary` |
| `--ds-primary-weak` | `rgba(124,156,255,.14)` | `rgba(51,85,216,.1)` | tinted chip background |
| `--ds-bubble` | `#1f2530` | `#eef1f6` | user message bubble |
| `--ds-code-background` | `#101318` | `#f6f7f9` | code block body |
| `--ds-code-header` | `#171b21` | `#eceef2` | code block title bar |
| `--ds-success` | `#4ade80` | `#15803d` | ok state |
| `--ds-warning` | `#fbbf24` | `#a16207` | pending / approval |
| `--ds-danger` | `#f87171` | `#c02626` | errors, destructive |

The panel is dark-first (it is an operator console), the website is light-first (it is a portfolio).
Both expose both themes; neither is "the" theme.

`--ds-faint-foreground` is deliberately the *lowest* text value allowed anywhere: the previous
values (`#6b7280` / `#8b929a`) sat at 3.9:1 and 3.2:1 and were not AA-compliant.

### 1.3 Minecraft theme — separate token set

`mc.nwebnotfound.dev` (the Minecraft section of the site) has its own complete theme with its own
`--mc-*` token set in `public/design/minecraft.css`. It is not a palette override of the portfolio:
pixel headings, block/inventory surfaces and the Minecraft material palette are part of the theme's
identity. Everything structural that must stay identical across surfaces (8pt spacing, system body
type, 150–250 ms motion, AA contrast, 390 px layout) is restated as `--mc-*` tokens with the same
values, so the section cannot drift. Full specification: **§10**.

---

## 2. Contrast (WCAG 2.2 AA) — hard requirements

| Requirement | Minimum | Applies to |
| --- | --- | --- |
| Body and UI text | **4.5:1** | anything below 24px regular / 18.66px bold |
| Large text | **3:1** | ≥24px, or ≥18.66px at weight 600+ |
| Icons, borders, form outlines, focus ring | **3:1** against the adjacent colour | non-text UI |
| Disabled text | exempt, but must still be *legible* (≥3:1) | `[disabled]`, `.mut` in forms |

Rules:

- Text is never pure colour-coded: state needs a second cue (icon, weight, label).
- Muted text is for *secondary* content only. If it is the only text in a control, it must pass 4.5:1.
- Placeholders use `--ds-muted-foreground`, not a lighter grey.
- Focus is always visible: `:focus-visible { outline: 2px solid var(--ds-ring-strong); outline-offset: 2px }`
  (never `outline:none` without a replacement ring).
- Every token pair that carries text is listed in `scripts/contrast-check.mjs`, which fails the build
  when a pair drops below its threshold. Add a pair there when you add a text token.

Measured values (2026-11): lowest passing pairs are website dark `#ffffff` on `#0974d8` = **4.67**,
panel light `--ds-faint-foreground` on `--ds-hover` = **4.58**, MC dim on `--ds-mc-surface-2` = **4.58**.

---

## 3. Spacing — 4/8 grid

`--ds-space-1` … `--ds-space-12`, all multiples of 4px, all in `rem` so browser zoom works.

| Token | Value | Typical use |
| --- | --- | --- |
| `--ds-space-1` | 4px | icon ↔ label |
| `--ds-space-2` | 8px | inside chips, button icon gap |
| `--ds-space-3` | 12px | input padding, stacked meta |
| `--ds-space-4` | 16px | card inner gap, grid gap |
| `--ds-space-5` | 24px | card padding (panel), block gap |
| `--ds-space-6` | 32px | card padding (marketing), section inner |
| `--ds-space-8` | 48px | between groups |
| `--ds-space-10` | 64px | section padding (mobile) |
| `--ds-space-12` | 96px | section padding (desktop) |

- Vertical rhythm: 8px steps for blocks, 4px only inside a control.
- Page gutter: `--ds-container` = `min(1080px, 100% - 2.5rem)` on the site, `--ds-space-4`/`5` in the
  panel. Never patch a gutter with a one-off `margin` on a page.
- Nested padding never exceeds the parent's content box: card padding 24px inside a 16px gutter is
  the maximum for 390px viewports.

---

## 4. Type scale

| Token | Size / line-height | Use |
| --- | --- | --- |
| `--ds-text-2xs` | 11px / 1.45 | panel timestamps, badges |
| `--ds-text-xs` | 12px / 1.5 | labels, captions, table meta |
| `--ds-text-sm` | 14px / 1.55 | secondary UI text, nav links |
| `--ds-text-base` | 16px / 1.6 | body copy (website), chat text is 15px via alias |
| `--ds-text-lg` | 18px / 1.55 | lead paragraphs |
| `--ds-text-xl` | 22px / 1.3 | card headings |
| `--ds-text-2xl` | 28px / 1.2 | section headings |
| `--ds-text-3xl` | 36px / 1.15 | page titles |
| `--ds-text-display` | `clamp(2.6rem, 8vw, 5rem)` / 1.08 | hero only |

Weights `--ds-weight-regular|medium|semibold|bold` = 400/500/600/700. Families:
`--ds-font-sans` (`-apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif`, with
`"Segoe UI"`/`Roboto` fallbacks), `--ds-font-mono` (code, tabular numbers),
`--ds-font-pixel` (Monocraft, MC sub-theme only). No webfont is loaded for UI text.

Rules: no size between steps; no font-weight below 400 for text below 14px; `text-wrap: balance`
on headings is allowed, hyphenation is not; `overflow-wrap:anywhere` on user-provided text.

---

## 5. Radii, shadows, borders

Radii: `--ds-radius-xs` 4px (tags), `sm` 6px, `md` 8px (panel cards, buttons), `lg` 12px
(inputs, code blocks, panel shell), `xl` 14px (menus, address pill), `2xl` 22px (marketing cards),
`full` 999px (pills, avatars).

Deliberate split: marketing pages use `--ds-radius-2xl` for cards, the panel uses `md`/`lg`.
That is the only radius difference between surfaces and it is a density decision, not a style drift.

Shadows are tinted with `--ds-shadow-color`, never pure black on dark surfaces:

| Token | Value (site) | Use |
| --- | --- | --- |
| `--ds-shadow-1` | `0 1px 2px -1px var(--ds-shadow-color)` | resting card |
| `--ds-shadow-2` | `0 18px 40px -18px var(--ds-shadow-color)` | card hover, menu |
| `--ds-shadow-3` | `0 20px 50px -20px var(--ds-shadow-color)` | popover, modal |

Borders are 1px `--ds-border`; only the MC sub-theme uses 2px bevels. Never combine a border and a
shadow of the same purpose on the same element.

---

## 6. Motion

- Durations `--ds-duration-fast` 150ms (hover, focus), `--ds-duration` 200ms (popover, drawer,
  `--ds-duration-slow` 250ms (card lift, reveal). Nothing in the UI animates longer than 250ms.
  Easings: `--ds-ease-out` `cubic-bezier(.2,.8,.2,1)`,
  `--ds-ease-in-out` `cubic-bezier(.4,0,.2,1)`.
- Animate only `opacity` and `transform`. Layout properties, `width`, `height` and `filter` are not
  animatable on interactive elements.
- Motion is decorative: it never carries information and never delays content.
- `prefers-reduced-motion: reduce` zeroes every duration token, disables `@view-transition`,
  scroll-reveal and the MC float/pulse keyframes. Both surfaces implement this globally:
  `@media (prefers-reduced-motion: reduce) { *,*::before,*::after { animation:none!important;
  transition:none!important; scroll-behavior:auto!important } }`.
- One exception, documented: the "live" dot on the MC status page keeps its colour change under
  reduced motion, it only loses the `pulse` animation.

---

## 7. Breakpoints and layout

Mobile-first; the CSS is written with `min-width` where a rule is additive and `max-width` only for
the existing nav/menu fallbacks.

| Name | Width | Behaviour |
| --- | --- | --- |
| `xs` | 390px | design target for phones (iPhone 12–15 logical width), 16px gutters |
| `sm` | 640px | site nav condenses, cards go 2-up |
| `md` | 860px | panel shows the sidebar permanently, drawer disabled above this |
| `lg` | 1024px | 3-up grids, wider reading measure |
| `xl` | 1280px | desktop target for screenshots and design review |

Custom properties cannot be used in media queries — these widths are literals, documented here so
they stay consistent. Hard rules: no horizontal scrolling at 390px; nothing interactive below
44×44px touch area (`min-height:44px` on buttons and inputs on touch devices); text lines are
capped at `40ch`–`72ch`.

---

## 8. Components

### Buttons

- One primary action per view. Height 44px (`36px` for `.sm`, `40px` on coarse pointers).
- Primary: `--ds-primary` fill, `--ds-primary-foreground` text, `--ds-radius-full`, weight 500.
- Secondary: transparent, `--ds-link` text, 1px inset ring in currentColor.
- Danger: `--ds-danger` text on transparent, never a filled red block next to the primary.
- States: hover lifts 1px, active scales to .98, `[disabled]` 50% opacity and `cursor:not-allowed`,
  focus ring from §2. Icons are 18px, `gap:--ds-space-2`, `aria-hidden` unless the icon is the label.
- No icon-only button without `aria-label`.
- Third-party brand colours are not used. The Discord login button keeps the glyph but takes
  `--ds-primary` (panel) / `--ds-primary` green (MC): one accent per surface, not a purple island.

### Inputs

- Background `--ds-surface`, 1px `--ds-border`, `--ds-radius-lg`, padding `--ds-space-3` `--ds-space-4`,
  `min-height:44px`, `font:inherit`.
- Focus: 1px `--ds-primary` border **plus** a 4px `--ds-ring` halo (both, so the state survives
  forced-colours mode).
- Placeholder: `--ds-muted-foreground`; the label is always a real `<label>`, never a placeholder.
- Error: `--ds-danger` border and an `aria-describedby` hint. Errors never rely on colour alone.
- Textarea grows with content, `resize:vertical`, max 12 rows in the panel composer.

### Cards

- `--ds-surface` + 1px `--ds-border` + `--ds-radius-2xl` (marketing) / `lg` (panel).
- Padding `--ds-space-5`/`6`; heading uses `--ds-text-xl`; body text `--ds-muted-foreground`.
- Hover lift only when the whole card is a link (`a.card`), `--ds-shadow-2`, `translateY(-4px)`,
  `--ds-duration-slow`. A card that is not clickable never reacts to hover.
- Interactive cards keep a visible focus ring on the card, not on the heading inside it.

### Code blocks

- Body `--ds-code-background`, header `--ds-code-header`, 1px `--ds-border`, `--ds-radius-lg`.
- Font `--ds-font-mono` at `--ds-text-sm` (panel) / `0.9em` inline; inline `code` gets
  `--ds-surface` + 4px radius + 1px border.
- Highlighting is a token map (`highlight.js`), never inline colour: keywords, strings, numbers,
  comments each map to one token. Comments must still pass 4.5:1.
- Horizontal scroll inside the block, never on the page. Copy button top-right, 44px target,
  `aria-label` in German ("Kopieren").

### Headers (glass)

- The panel top bar floats over the scroll area: `position:absolute; inset:0 0 auto`, translucent
  `color-mix(in srgb, var(--ds-background) 78%, transparent)` plus
  `backdrop-filter: saturate(180%) blur(20px)` and `-webkit-backdrop-filter`. Content scrolls
  underneath it, which is what makes the blur visible; the scroll containers pad by
  `calc(var(--header-h) + …)` instead of pushing the bar into the flow.
- `--header-h` is 60px (`64px` on phones) plus `env(safe-area-inset-top)`. The site nav uses the
  same recipe (`--ds-navbar` + blur) and pads its top with the safe-area inset.
- No solid `background` on a glass header, ever: it turns the blur into a cheap shadow.

### Drawer (panel, ≤860px)

- The sidebar becomes an off-canvas rail, `width: min(86vw, 320px)`, sliding in over the content
  with a 1.5% blur scrim behind it.
- **Swipe from the left edge opens it, swipe left closes it.** The gesture only starts after 10px
  of mostly-horizontal travel inside a 24px edge strip, so scrolling and tapping are untouched;
  the rail follows the finger and snaps to the nearer edge at 35% travel. The menu button and the
  ✕ button remain the non-gesture path. `prefers-reduced-motion` removes the follow animation.
- Focus stays in the page, `Escape` closes the drawer, tapping the scrim closes it.

### Dialogs

- Always a native `<dialog>` with `showModal()` — never `prompt()`, `alert()` or `confirm()`.
  The element gives the focus trap, `Escape`, the backdrop and `::backdrop`; the promise behind it
  settles on `close`, so Esc cannot leave a hanging `await`.
- Desktop: centred, `--ds-radius-xl`, `width:min(440px, 100vw - 2×16px)`, `--ds-shadow-3`.
  Phone (≤860px): a bottom sheet pinned to the safe area, full width, radius only on the top
  corners, actions stacked full width (`flex-direction: column`, 48px tall) with the primary action
  last, i.e. closest to the thumb. A 36×4px grabber marks it as a sheet.
- Fields are real `<label>`s, 44px tall, **16px text** (no iOS zoom), `aria-describedby` for the
  hint, `aria-invalid` plus a `role="alert"` message for errors. Validation is explicit, not
  `required`-only, and the message names the rule.
- The only blocking confirmations left are destructive ones (logout-all, SOUL overwrite); they use
  the same dialog with a danger-styled confirm button.

### Approval cards (panel)

- A pending tool approval is a warning-tinted card, not an accent card: `--ds-warning` at 7%
  background, 3px warning left rail, warning dot in the title, and the command in a monospace
  block. The accent stays reserved for the primary action inside it.
- **≤639px: every choice is a full-width 44px button, stacked** (`display:grid`), because the
  card is usually the bottom-most thing in the thread and must be thumb-reachable without aiming.
  From 640px up they sit in a row of 36px buttons.
- The card is `role="group"` with an `aria-label`; answering replaces it with a one-line result
  instead of leaving dead buttons behind.

---

## 9. Token names in CSS

Canonical names live in three files, one per theme, with shared semantics:

- `public/design/tokens.css` — website portfolio (light/dark). Its `html.mc` block is only a bridge
  that maps the shared `--ds-*` names onto the `--mc-*` tokens of the Minecraft theme.
- `public/design/minecraft.css` — the Minecraft theme (`html.mc`), complete `--mc-*` set, see §10.
- `public/design/summer.css` — the Creative Hub theme (`.sm-root`), complete `--sm-*` set, see §11.
- `ai-panel/public/app.css` — panel (dark default, `[data-theme="light"]`, plus a
  `prefers-color-scheme: light` fallback for a document that has no `data-theme` yet).

Adding a token means: a value in the file that owns the theme, a row in §1/§10, a contrast pair in
`scripts/contrast-check.mjs` if text can use it, and an alias in the bridge/alias block at the bottom
of the surface CSS so existing components keep working.

---

## 10. Minecraft theme (`mc.nwebnotfound.dev`)

The Minecraft section is a surface of its own, not the portfolio with a green accent. It gets a
complete theme: its own token set (`--mc-*`, `public/design/minecraft.css`), its own component look
(inventory slots, item frames, block textures) and its own type treatment (pixel headings, system
body). The panel keeps the clean Apple-like theme; nothing here leaks into it. The only shared
things are the rules that make either theme *premium*: an 8pt spacing grid, readable body type,
150–250 ms motion, WCAG AA, mobile-first at 390 px.

### 10.1 Palette — Minecraft materials, one accent

| Token | Value | Role |
| --- | --- | --- |
| `--mc-grass` | `#5fe36d` | the single accent: links, primary buttons, active states, focus |
| `--mc-grass-deep` | `#2f8a3a` | accent border/shadow side, pressed bevel |
| `--mc-grass-weak` | `rgba(95,227,109,.12)` | tinted chip/label background |
| `--mc-dirt` | `#8a5a34` | item-frame wood highlight |
| `--mc-dirt-deep` | `#6b4a2b` | item-frame wood border |
| `--mc-stone` | `#8b8b8b` | filled inventory slot |
| `--mc-stone-dim` | `#6d6d6d` | empty inventory slot |
| `--mc-diamond` | `#53e2df` | rarity/info, secondary highlight |
| `--mc-redstone` | `#ff6161` | errors, destructive, offline |
| `--mc-gold` | `#ffb941` | eyebrows, prices, ranks, warnings |
| `--mc-amethyst` | `#a986ff` | NBT/enchanted rarity (large text only) |
| `--mc-obsidian` | `#120d1f` | tooltip body |

Surfaces are deepslate, not the portfolio greys: `--mc-background` `#0c0e13`,
`--mc-surface-1` `#13161e`, `--mc-surface-2` `#191d27`, `--mc-surface-3` `#212635`,
`--mc-surface-4` `#2a3043`, `--mc-line` `#262c3b`, `--mc-line-strong` `#353d52`.
Text: `--mc-text` `#e9edf5`, `--mc-text-muted` `#8e98ad`, `--mc-text-dim` `#7c859e`,
`--mc-on-grass` `#06210b`, `--mc-navbar` `rgba(12,14,19,.92)`.

Gold is the *label* colour, grass the *action* colour. Never two accents in one component; a gold
number and a grass button may sit side by side, a gold button may not exist.

### 10.2 Structure — block and inventory look

| Token | Value | Role |
| --- | --- | --- |
| `--mc-border-width` | `2px` | GUI edges are 2px, never 1px hairlines |
| `--mc-frame-bg` / `--mc-frame-edge` | `#161922` / `#030406` | frame body / outer edge |
| `--mc-slot-bg` / `--mc-slot-bg-empty` | `#8b8b8b` / `#6d6d6d` | inventory slot, filled/empty |
| `--mc-slot-shadow` / `--mc-slot-highlight` | `#373737` / `rgba(255,255,255,.2)` | the 2px inset bevel |
| `--mc-slot-size` / `--mc-slot-gap` | `40px` / `4px` | slot grid (80 px at 2× DPR) |
| `--mc-item-size` | `40px` | item texture inside a slot |
| `--mc-item-frame-inset` | `6px` | padding between wood frame and item |
| `--mc-bevel-panel` | `inset 2px 2px 0 #343a48, inset -2px -2px 0 #07080c` | chest panel |
| `--mc-bevel-slot` | `inset 2px 2px 0 #373737, inset -2px -2px 0 rgba(255,255,255,.2)` | slot |
| `--mc-bevel-raised` | `0 14px 32px -22px rgba(0,0,0,.92)` | lifted card |
| `--mc-glow` | `0 0 28px -10px rgba(95,227,109,.32)` | hover on an interactive slot/card |
| `--mc-radius` / `--mc-radius-sm` / `--mc-radius-slot` | `4px` / `2px` / `0` | never the 22px marketing radius |
| `--mc-texture` / `--mc-texture-2` | `/mc-icon/v2/deepslate` / `/mc-icon/v2/stone` | block textures |
| `--mc-texture-size` / `--mc-texture-opacity` | `48px` / `.09` | 8pt tile, subtle only |

Bevels come from tokens, never from gradients or images. Item art is a 16×16 texture at
`image-rendering:pixelated`; the only large texture use is a decorative band at 9% opacity, and it
never sits behind running text.

### 10.3 Type — pixel headings, system body

- `--mc-font-pixel` (`Monocraft`, OFL, `public/mc/fonts/`) for `h1`–`h3`, page/hero headings,
  numeric highlights (stat values, balances, percentages) and short labels (tags, pills, eyebrows).
- `--mc-font-body` is the system UI stack for every paragraph, list, table cell, input and button —
  pixel text is never used for running text, because it loses 15–20% legibility at body size.
- Sizes are the shared scale restated as `--mc-text-*` (12/14/16/18/22/28/36 px), body leading
  `--mc-leading-body` 1.6, headings `--mc-leading-tight` 1.15.
- Headings carry a blocky underline: an 8 px tall, 8 px-on/8 px-off grass bar below the heading
  (`::after` on `.hub-h`, `.hub-h2`, `.h-l`), 4 px for sub-headings. Eyebrows get an 8×8 px gold
  square as a marker. Both are drawn with `repeating-linear-gradient`, so they scale with zoom.
- `--mc-pixel-shadow` (`0 2px 0 rgba(0,0,0,.55)`) replaces a soft text shadow: it reads as a block
  edge, not a glow.

### 10.4 Components

- **Inventory slot** (`.slot`, `.ivs`, `.pslot`): `--mc-slot-bg`, 2 px `--mc-frame-edge`,
  `--mc-bevel-slot`, radius 0, square aspect. Empty = `--mc-slot-bg-empty`. Selected/hover adds
  `--mc-glow` over 150 ms, never a colour-only cue (the item still changes brightness/shadow).
- **Item frame** (`.mc-item-frame`, `.slot.big`, `.slot.huge`, the server address pill): wood frame
  from `--mc-dirt`/`--mc-dirt-deep` + `--mc-bevel-panel`, `--mc-item-frame-inset` inner padding.
- **Chest panel / card**: `--mc-surface-2 → --mc-surface-1` body, 2 px `--mc-frame-edge`,
  `--mc-bevel-panel` + `--mc-bevel-raised`, radius `--mc-radius-sm`. Hover lifts 2 px with
  `--mc-glow` over 200 ms (only when the whole card is a link).
- **Block band**: `.mc-block-band`, a 24 px strip of two block textures at 9% opacity, for section
  breaks and the footer edge. Decorative only, `aria-hidden`, never a container for text.
- **Buttons**: 44 px high (36 px `.sm`, 40 px on coarse pointers), 2 px `--mc-grass-deep` edge,
  `--mc-grass` fill, `--mc-on-grass` text, inset bottom shade; press moves 1 px over 150 ms.
- **Inputs**: `--mc-background` body, 2 px `--mc-frame-edge`, `--mc-bevel-panel`, focus = 2 px
  `--mc-grass` border plus a 3 px ring at 3:1.
- **Focus** everywhere: `--mc-focus-ring` 2 px `--mc-grass`, offset 2 px, also on slots and cards.

### 10.5 Spacing, layout, motion

- `--mc-space-1` … `--mc-space-12` = the same 4/8 grid as §3, in rem. Section padding
  `clamp(3.5rem, 9vw, 7rem)`; card padding `--mc-space-5`, `--mc-space-4` below 600 px.
- Mobile-first at 390 px: no horizontal scroll, slot grids fall back to one column, tables become
  stacked rows, address pill truncates inside its frame, nothing interactive below 44×44 px.
- `--mc-duration-fast` 150 ms (hover/focus), `--mc-duration` 200 ms (lift, menu), `--mc-duration-slow`
  250 ms (profile reveal). `--mc-ease` `cubic-bezier(.2,.8,.2,1)`. Only `opacity`, `transform` and
  `box-shadow` animate. `prefers-reduced-motion: reduce` zeroes all three durations and the site's
  global rule disables the float/pulse keyframes.

### 10.6 Contrast (measured)

The gate in `scripts/contrast-check.mjs` reads `public/design/minecraft.css` and asserts:
`--mc-text` on `--mc-background` **16.45**, `--mc-text-muted` on `--mc-surface-2` **5.81**,
`--mc-text-dim` on `--mc-surface-2` **4.58** (the floor), `--mc-grass` on `--mc-background`
**11.67**, `--mc-gold` on `--mc-surface-1` **10.56**, `--mc-redstone` on `--mc-background` **6.56**,
`--mc-diamond` on `--mc-background` **12.24**, `--mc-on-grass` on `--mc-grass` **10.32**.
`--mc-amethyst` on `--mc-obsidian` is **6.84** and is checked at the large-text threshold (3:1)
because it is only used for NBT lines.

### 10.7 Reuse (Gacha design PR)

The Gacha surface under `mc.nwebnotfound.dev` consumes this theme as-is: `--mc-*` names, slot and
frame components, pixel headings, motion tokens. It adds its own layout and content, not new colour
values. If a genuinely new token is needed, it goes into `public/design/minecraft.css` with a row in
this section and a contrast pair — never into a component rule.

---

## 11. Creative Hub theme — "anime summer" (phase 1: tokens + base components)

The hub (`nwebnotfound.dev` itself, plus `/writing`, `/music`, `/photos`, `/reviews`, `/guestbook`
and the other hub routes from `docs/creative-hub-plan.md`) is a **third surface**: soft anime summer
skies with pixel-art interface chrome. It does not borrow from the Minecraft palette and it does not
change the Minecraft or the portfolio look — those pages do not load this stylesheet at all.

### 11.1 Files

| File | Role |
| --- | --- |
| `public/design/summer.css` | tokens (`--sm-*`) and every base component, scoped to `.sm-root` |
| `public/design/summer-theme.js` | theme bootstrap + optional toggle, sets `data-theme` before first paint |
| `public/design/summer-preview.html` / `summer-preview.css` | internal preview of all tokens and components in both themes (not linked in any navigation, `noindex`) |
| `public/design/summer-sprites.svg` | **placeholder** pixel shapes (sun, cloud, sparkle, heart, star, mascot stand-in) |
| `public/design/fonts/` | `SmPixel` (Pixelify Sans) and `SmBody` (Nunito), both OFL 1.1; licences in `fonts/LICENSES.md` |
| `scripts/summer-scope-check.mjs` | regression gate: no bare element selectors, no foreign token names, no `@import`/remote URL, preview page stays CSP-clean |
| `src/hub.js` | the hub shell and its pages (nav, footer, hero, tiles, empty states); server-rendered from `src/worker.js` |
| `src/i18n/de.js`, `src/i18n/en.js`, `src/i18n/index.js` | interface messages plus language negotiation, `/de/…`–`/en/…` prefixes and `t()` |
| `scripts/i18n-check.mjs`, `scripts/hub-unit.mjs` | gates: message files stay complete, and the shell renders the expected HTML (no browser needed) |
| `docs/screens/summer-preview-{day,night}.png` | the two reference screenshots of the preview page, taken with Playwright in a throwaway container (both themes) |
| `docs/screens/hub-*.png` | reference screenshots of the hub shell (home, about, empty state, English home; 390/1280, day/night), same throwaway-container workflow (`node scripts/screenshots.mjs --serve --only hub`) |

`.sm-root` goes on `<html>` (mirroring `html.mc`), so `<body>` is styled through the root class.
Every selector starts with an `sm-`-namespaced class; the check fails the run otherwise.

### 11.2 Theme switching

`summer day` (light) is the **default**, `summer night` is the dark mode. Precedence, implemented in
CSS only where possible:

1. `?theme=day|night` in the URL (preview page, screenshots),
2. `localStorage["summer-theme"]`,
3. `prefers-color-scheme`.

An explicit `data-theme` on the root element always wins: the system-driven block is written as
`.sm-root:not([data-theme])` inside `@media (prefers-color-scheme: dark)`, the explicit choice as
`.sm-root[data-theme="summer-night"]`. `summer-theme.js` runs synchronously in `<head>` **before** the
stylesheet, so there is no light flash for a night user. It is a classic external script — no inline
code, no inline event handler, no `eval` — so it passes `script-src 'self'` without a nonce.
`scripts/contrast-check.mjs` additionally asserts that both dark paths define byte-identical values.

### 11.3 Palette

Roles first; a component reads the role, never a literal.

| Token | summer day | summer night | Used for |
| --- | --- | --- | --- |
| `--sm-sky-1` / `--sm-sky-2` | `#8fd3ff` → `#ddf3ff` | `#101a36` → `#23335c` | hero and band gradients |
| `--sm-background` / `--sm-background-2` | `#f1f9ff` / `#e4f2fe` | `#141b33` / `#101628` | page, alternating band |
| `--sm-surface` / `-2` / `-3` | `#ffffff` / `#eaf5fe` / `#dcebf9` | `#1c2542` / `#17203a` / `#26304f` | cards, controls, tiles |
| `--sm-foreground` | `#1f2a44` | `#f1f5ff` | body text, headings |
| `--sm-muted-foreground` | `#4a5a7a` | `#aeb9d4` | secondary text |
| `--sm-border` / `--sm-border-strong` | `rgba(31,42,68,.14)` / `#647aa0` | `rgba(255,255,255,.14)` / `#6e7da8` | hairline / control outline |
| `--sm-frame` | `#24314f` | `#a9b7d9` | the 2 px pixel frame |
| `--sm-primary` / `--sm-primary-foreground` / `--sm-primary-deep` | `#ffd45e` / `#2a2410` / `#7a5300` | same fill, `#1a1633` text | the one interactive fill (sunflower) |
| `--sm-link` | `#0e6b63` | `#7fe0d3` | links (ramune family, text-safe member) |
| `--sm-accent-sun` / `-peach` / `-sakura` / `-ramune` / `-lavender` | `#ffd45e` / `#ffb8a8` / `#ffc8dd` / `#7fe0d3` / `#c9b8ff` | identical (tints change less than text) | section flavours, badge tints |
| `--sm-peach-ink` / `-sakura-ink` / `-ramune-ink` / `-lavender-ink` | `#a6432c` / `#a2405f` / `#0e6b63` / `#4b3ba8` | the pastel itself | that family's text on a *surface* |
| `--sm-on-pastel` | `#1f2a44` | `#1f2a44` | text on a pastel *tint* |
| `--sm-danger` / `-success` / `-warning` | `#b3261e` / `#1b6b3a` / `#8a5a00` | `#ff8a80` / `#78e0a0` / `#ffd08a` | states, always with text or an icon |
| `--sm-focus-ring` | `#0b5c8a` | `#ffd45e` | `:focus-visible` outline |
| `--sm-star` / `--sm-star-empty` | `#b06e00` / `#768db0` | `#ffd45e` / `#6e7ca6` | rating display |
| `--sm-shadow-color` / `--sm-shadow-hard-color` / `--sm-scrim` | `rgba(31,42,68,…)` | `rgba(0,0,0,…)` | soft shadow, pixel offset, scrim |

The pastel families separate two jobs on purpose: the pastel is a **tint** (background, badge, chip)
and the matching `*-ink` is the **text** value on a surface. That is what keeps five happy colours
readable in both themes instead of only the sunflower surviving.

### 11.4 Structure: type, spacing, pixel detail, z-order

- `--sm-font-pixel` (`SmPixel`) for `.sm-h1`–`.sm-h4`, `.sm-display`, `.sm-eyebrow`, badges, card
  titles and numbers; `--sm-font-body` (`SmBody`) for every paragraph, list, label, input and button.
  Running text is never set in the pixel font. Both are self-hosted `woff2` (47 KB total, latin subset
  with German umlauts), `< 150 KB` budget, `font-display: swap`, no CDN and no tracking request.
- Sizes are the shared scale restated as `--sm-text-*` (11/12/14/16/18/22/28/36 px + display clamp),
  leading `--sm-leading-body` 1.6, prose measure `68ch`.
- Spacing is the same 4/8 grid as §3 (`--sm-space-1` … `--sm-space-12`), section padding
  `--sm-section-space`.
- Pixel detail is CSS only, all from tokens: `--sm-pixel` 2 px borders, `--sm-pixel-step` 4 px and
  `--sm-pixel-notch` 8 px staircase corners drawn with `clip-path: polygon(…)` on `.sm-card--pixel`,
  `--sm-shadow-pixel` (a 2 px hard offset instead of a blur), `--sm-dither` (a 4 px diagonal pattern
  from `repeating-linear-gradient`) on `.sm-dither` / `.sm-card--dither`, and sprite art at
  `image-rendering: pixelated`.
- `--sm-tap` 44 px is the minimum for every target; `--sm-tap-dense` 36 px is the compact variant and
  is raised to 44 px inside `@media (pointer: coarse)`.
- Z-order lives in tokens (`--sm-z-nav` 50, `--sm-z-scrim` 60, `--sm-z-drawer` 70, `--sm-z-popover` 80,
  `--sm-z-toast` 90) so no component invents a magic number.
- Motion: `--sm-duration-fast|--sm-duration|--sm-duration-slow` (150/200/250 ms) with
  `--sm-ease`; only `transform`/`background`/`color`. `prefers-reduced-motion: reduce` zeroes the
  durations *and* disables animations/transitions inside `.sm-root`, including the dialogue-box
  caret.

### 11.5 Components (pure CSS, no JS)

| Class | Notes |
| --- | --- |
| `.sm-skip-link` | first focusable element of a hub page; slides in on focus |
| `.sm-h1`…`.sm-h4`, `.sm-display`, `.sm-eyebrow`, `.sm-lead`, `.sm-muted`, `.sm-tnum`, `.sm-kaomoji` | typography; `.sm-h1`/`.sm-h2` carry the 8 px on/off pixel underline |
| `.sm-prose` | stories, blog, reviews: `h2`/`h3` in the pixel font, blockquote, list, `hr`, `small`/`figcaption` |
| `.sm-btn` `--ghost` `--danger` `--dense` `--icon` `--block` | 44 px tall, `translateY(2px)` press onto the hard shadow; `.sm-btn--icon` needs an `aria-label` |
| `.sm-card`, `--pixel`, `--sun`, `--dither`, `--link`, `.sm-card__title`, `.sm-card__meta` | illustration card vs pixel chrome card |
| `.sm-dialog`, `.sm-dialog__name`, `__body`, `__more` | visual-novel textbox for guestbook entries, pull quotes, review verdicts |
| `.sm-tabs` + `.sm-tab` | `role="tablist"`/`role="tab"` with `aria-selected`; keyboard wiring is phase 2 |
| `.sm-field`, `.sm-label`, `.sm-input`, `.sm-textarea`, `.sm-select`, `.sm-hint`, `.sm-error` | real `<label for>`, 16 px text on touch, `aria-invalid` + `role="alert"` for errors |
| `.sm-badge` `--sun|--sakura|--ramune|--lavender|--peach|--success|--warning|--danger`, `.sm-chip` | tint + `--sm-on-pastel`; chips use `aria-pressed` |
| `.sm-stars` `--lg|--sm` | display only: 5 stars filled to `--sm-rating` (0–5, one decimal) with `role="img"` + `aria-label`; no widget, no script |
| `.sm-sticker`, `.sm-sky` `--night`, `.sm-dither`, `.sm-mascot` `--placeholder`, `.sm-icon` `--lg` | pixel/sticker detail and the mascot slot |
| `.sm-wrap`, `.sm-stack`, `.sm-row`, `.sm-section`, `.sm-visually-hidden` | shell helpers for phase 2 |
| `.sm-shell`, `.sm-nav__link` (footer links), `.sm-lang` (`__link`), `.sm-theme` | hub shell: skip link, footer links, footer DE/EN switch and theme toggle (§11.9). The header of both sites is the unified nav: `src/unav.js`, `/design/unav.css`, `/design/unav.js` (`.u-*`, mockup `fix-unified-nav`) |
| `.sm-hero` (`__inner` `__cta` `__note`), `.sm-display__soft`, `.sm-tiles`, `.sm-tile` (`__text` `__cta` `--soon`), `.sm-measure`, `.sm-placeholder` (`__note`), `.sm-soon` | home hero, section tiles, the "soon" empty state (§11.9) |
| `.sm-footer` (`__grid` `__col` `__title` `__list` `__bottom`), `.sm-mascot--xl`, `.sm-mascot--brand`, `.sm-mascot__art` | footer (links, language, theme) and the mascot slot sizes |

### 11.6 Contrast (measured, `scripts/contrast-check.mjs`)

The gate reads `public/design/summer.css` and checks 34 pairs per theme (68 in total) plus the token
scale, the "both dark paths are identical" invariant and the reduced-motion/coarse-pointer blocks.

| Pair | summer day | summer night |
| --- | --- | --- |
| `--sm-foreground` on `--sm-background` | 13.40 | 15.59 |
| `--sm-foreground` on `--sm-surface-3` | 11.74 | 11.89 |
| `--sm-muted-foreground` on `--sm-surface-3` | 5.70 | 6.26 |
| `--sm-link` on `--sm-surface-3` | 5.24 | 8.35 |
| `--sm-primary-foreground` on `--sm-primary` | 10.92 | 12.02 |
| `--sm-on-pastel` on the pastels | 8.00–10.07 | identical (pastels are shared) |
| `--sm-danger` on `--sm-background` | 6.14 | 7.45 |
| `--sm-border-strong` on `--sm-surface-3` (non-text, 3:1) | 3.58 | 3.19 (the floor) |

### 11.7 What phase 1 deliberately does not do

No worker or route change, no navigation entry, no content, no translation, no database work, no
deploy, no new dependency in `package.json`. `src/worker.js` still renders the portfolio and MC
surfaces exactly as before: the hub shell (nav, footer, hero, routes) is phase 2, and it is the step
that starts serving `summer.css` to hub pages. The preview page is a static file under
`/design/summer-preview.html`, marked `noindex`. (Phase 2 does exactly that — see §11.9.)

### 11.8 Extending the hub theme

A new token means: a value in `public/design/summer.css` (day block, plus both night blocks — they
must stay identical), a row in §11.3/§11.4, a pair in `scripts/contrast-check.mjs` if text or a
control outline can use it, and a swatch on the preview page. A new component means: an `sm-`
prefixed class, a preview example, and a row in §11.5. Run all three gates before pushing:

```
node scripts/icon-check.mjs && node scripts/contrast-check.mjs && node scripts/summer-scope-check.mjs \
  && node scripts/i18n-check.mjs && node scripts/hub-unit.mjs
```

### 11.9 Phase 2: shell, home and DE/EN routing

Phase 2 serves `summer.css` to the hub pages (still only there — the Minecraft surface and the
portfolio keep their own stylesheets) and adds the shared shell in `src/hub.js`.

**Routes.** `nwebnotfound.dev` owns `/`, `/about` and the still-empty sections `/music`, `/writing`
and `/reviews` (empty state with the mascot placeholder, `(◕‿◕)` and a "soon" badge in the
navigation). The previous start page moved unchanged to **`/portfolio`** and is linked from the home
tiles, the About page and the footer; `/guestbook`, `/profile`, `/feedback` and every
`/api/…`/`/auth/…` route behave exactly as before. `mc.nwebnotfound.dev` is untouched and does not
load `summer.css` (checked by the e2e suite).

**Languages.** German and English interface text lives in `src/i18n/de.js` / `en.js` (identical key
sets, enforced by `scripts/i18n-check.mjs`); `src/i18n/index.js` holds negotiation and `t(key, vars)`.
`/de/…` and `/en/…` are the canonical URLs and carry `hreflang` alternates plus `x-default`.
`Accept-Language` decides the language for the unprefixed path, a `nnf_lang` cookie (one year,
`SameSite=Lax`, not `HttpOnly` — it holds no personal data) remembers an explicit switch, and German
is the fallback. `<html lang>` follows the language. `/` never redirects, so no redirect loop can
exist; a language prefix in front of a route the hub does not own returns `301` to the unprefixed
path (`/en/guestbook` → `/guestbook`, since those legacy pages are German-only for now). A missing
key falls back to the other language. No machine translation in this phase: content translation
follows with phase 3 (`/writing`).

**Shell.** `public/design/summer-theme.js` is loaded **before** `summer.css` in `<head>`, so the
stored/system theme is known before the first paint; the toggle in the header *and* the footer is a
`[data-summer-theme-toggle]` button that the script keeps in sync (`aria-pressed`, label swapped from
`data-label-day`/`data-label-night`). Its label area has a fixed width, so switching the theme does
not shift the layout. Below 600px the navigation wraps onto a second row instead of scrolling
sideways, so no entry (and no "soon" badge) is ever clipped. Accessibility: the skip link is the
first focusable element and stays off-screen until focused — the `prefers-reduced-motion` block no
longer resets its `transform` (that parked it on top of the header; the zeroed duration is enough to
remove the slide) —, `<header>`, `<main id="main">` and `<footer>` are the landmarks, and every
target is at least `--sm-tap-dense` (44px on coarse pointers) tall. Privacy: no tracker, no CDN, no
external font and no inline script — GitHub and X are plain links with `rel="noopener noreferrer"`,
which `scripts/hub-unit.mjs` asserts.

**Tests.** `node scripts/hub-unit.mjs` (language negotiation, prefixes, `t()` fallback, generated
HTML), `node scripts/i18n-check.mjs` (message files), plus the hub block in `scripts/e2e.mjs`
(status codes, `Set-Cookie`, `301` targets, Minecraft regression) — all three run in CI before the
browser suite.
