# Hub fonts — licences and provenance

Two self-hosted families for the Creative Hub ("anime summer" look, `public/design/summer.css`).
Both are **SIL Open Font License 1.1**; full licence texts sit next to the files
(`OFL-Nunito.txt`, `OFL-Pixelify-Sans.txt`) as the OFL requires.

Nothing here is loaded from a third party at runtime: no Google Fonts CDN, no `@import`, no font
tracking request. Every `@font-face` in `summer.css` points at `/design/fonts/…` on our own origin.
The Minecraft sub-theme keeps its own Monocraft files in `public/mc/fonts/` — neither family is
shared between the two surfaces on purpose (plan §7: the hub must not look like the MC pages).

## Files

| File | Family | Weight | Bytes | Role |
| --- | --- | --- | --- | --- |
| `pixelify-sans-latin-400.woff2` | Pixelify Sans | 400 | 7692 | headings 400 |
| `pixelify-sans-latin-700.woff2` | Pixelify Sans | 700 | 7904 | headings, labels, eyebrows |
| `nunito-latin-400.woff2` | Nunito | 400 | 16316 | running text |
| `nunito-latin-700.woff2` | Nunito | 700 | 16228 | bold running text, buttons |
| **total** | | | **48140** (47 KB) | budget was < 150 KB |

Both families are used through the two `@font-face` families `SmPixel` and `SmBody`, so the CSS
never depends on the upstream family name.

## Subset and coverage

The slices are the **`latin` subset** served by the Google Fonts API (`unicode-range`
`U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329,
U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD`), i.e. Latin plus the
German letters and the typography the hub actually needs.

Verified with fontTools (inside a throwaway `python:3.12-alpine` container, `fonttools` + `brotli`):

```
nunito-latin-400.woff2             usWeightClass=400  macStyle=0  230 glyphs
nunito-latin-700.woff2             usWeightClass=700  macStyle=1  230 glyphs
pixelify-sans-latin-400.woff2      usWeightClass=400  macStyle=0  217 glyphs
pixelify-sans-latin-700.woff2      usWeightClass=700  macStyle=1  217 glyphs
missing required (äöüÄÖÜß€„“”–—’…°): none, in any of the four files
```

Every file starts with the `wOF2` magic bytes and declares a static instance (no variable axes).

## Sources

### Pixelify Sans — headings, labels, eyebrows
- Designer: **Stefie Justprince**
- Copyright: `Copyright 2021 The Pixelify Sans Project Authors (https://github.com/eifetx/Pixelify-Sans)`
- Upstream: <https://github.com/eifetx/Pixelify-Sans> · catalogue entry:
  <https://github.com/google/fonts/tree/main/ofl/pixelifysans>
- Licence: SIL Open Font License 1.1 → `OFL-Pixelify-Sans.txt`
- Fetched from: `https://fonts.gstatic.com/s/pixelifysans/v3/…` (latin slice, `wght@400` and
  `wght@700`), downloaded once at build time; the site itself never talks to gstatic.

### Nunito — running text
- Designers: **Vernon Adams, Cyreal, Jacques Le Bailly**
- Copyright: `Copyright 2014 The Nunito Project Authors (https://github.com/googlefonts/nunito)`
- Upstream: <https://github.com/googlefonts/nunito> · catalogue entry:
  <https://github.com/google/fonts/tree/main/ofl/nunito>
- Licence: SIL Open Font License 1.1 → `OFL-Nunito.txt`
- Fetched from: `https://fonts.gstatic.com/s/nunito/v32/…` (latin slice, `wght@400`/`wght@700`).

## Replacing or extending a family

1. Keep the OFL/Apache-2.0 requirement: only self-hosted `woff2` with an open licence, and add the
   licence text here.
2. Keep the shared budget under 150 KB total and prefer the `latin` slice (it already carries
   ä ö ü ß Ä Ö Ü).
3. Re-check the glyph coverage and the weight class in a throwaway container before committing —
   a "Regular" file whose `usWeightClass` is not 400 renders too thin or too fat everywhere.
4. Update the table above and the `@font-face` block in `public/design/summer.css`.
