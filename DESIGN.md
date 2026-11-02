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

- Durations `--ds-duration-fast` 120ms (hover, focus), `--ds-duration` 180ms (popover, drawer),
  `--ds-duration-slow` 320ms (card lift, reveal). Easings: `--ds-ease-out` `cubic-bezier(.2,.8,.2,1)`,
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

---

## 9. Token names in CSS

Canonical names live in three files, one per theme, with shared semantics:

- `public/design/tokens.css` — website portfolio (light/dark). Its `html.mc` block is only a bridge
  that maps the shared `--ds-*` names onto the `--mc-*` tokens of the Minecraft theme.
- `public/design/minecraft.css` — the Minecraft theme (`html.mc`), complete `--mc-*` set, see §10.
- `ai-panel/public/app.css` — panel (dark default, `[data-theme="light"]`, plus a
  `prefers-color-scheme: light` fallback for the login page, which has no script).

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
