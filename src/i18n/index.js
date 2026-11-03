// Hub i18n: language negotiation, path prefixes and the `t()` helper.
//
// Contract (docs/creative-hub-plan.md §8 "Languages", DESIGN.md §11):
//   - the site is available in German and English; German is the fallback when nothing matches,
//   - `/de/…` and `/en/…` are the canonical per-language URLs; the unprefixed path keeps working and
//     renders the language the visitor picked (cookie) or the one `Accept-Language` asks for,
//   - the choice is remembered in a cookie (`nnf_lang`); there is never a redirect loop because `/`
//     itself renders a language instead of redirecting,
//   - a missing key falls back to the other language, and `scripts/i18n-check.mjs` fails the run when
//     the two message files drift apart.
//
// Everything here is pure (no DOM, no request object), so `scripts/hub-unit.mjs` can test it directly.
import de from "./de.js";
import en from "./en.js";

export const MESSAGES = { de, en };
export const LANGS = ["de", "en"];
export const DEFAULT_LANG = "de";
export const LANG_COOKIE = "nnf_lang";
export const LANG_PATH = /^\/(de|en)(?=\/|$)/;

/** Messages for a language, falling back to the default language for an unknown tag. */
export function messages(lang) {
  return MESSAGES[lang] || MESSAGES[DEFAULT_LANG];
}

/**
 * `t(key, vars)` for one language. Lookup order: requested language, the other language, the key
 * itself (so a missing label is visible in the page instead of rendering as `undefined`).
 * `{name}` placeholders are replaced from `vars`.
 */
export function makeT(lang) {
  const primary = messages(lang);
  const secondary = messages(lang === "de" ? "en" : "de");
  return (key, vars) => {
    let s = primary[key] ?? secondary[key] ?? key;
    if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
    return s;
  };
}

/** Keys that exist in one message file but not in the other (used by scripts/i18n-check.mjs). */
export function missingKeys() {
  const out = { de: [], en: [] };
  for (const lang of LANGS) {
    const other = lang === "de" ? en : de;
    out[lang] = Object.keys(MESSAGES[lang]).filter((k) => !(k in other));
  }
  return out;
}

/** Split a repeated `;q=` Accept-Language header into sorted `{ tag, q }` entries. */
export function parseAcceptLanguage(header) {
  return String(header || "")
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.split(";");
      let q = 1;
      for (const p of params) {
        const m = /^\s*q\s*=\s*([0-9.]+)\s*$/.exec(p);
        if (m) q = Number(m[1]);
      }
      return { tag: tag.trim().toLowerCase(), q: Number.isFinite(q) ? q : 0 };
    })
    .filter((x) => x.tag)
    .sort((a, b) => b.q - a.q);
}

/**
 * Pick the language for a request: an explicit cookie wins, then `Accept-Language` (highest q that
 * matches de or en), then German. `null`/unknown values never select a language.
 */
export function pickLang(header, cookie) {
  if (cookie === "de" || cookie === "en") return cookie;
  for (const { tag, q } of parseAcceptLanguage(header)) {
    if (q <= 0) continue;
    const base = tag.split("-")[0];
    if (base === "de") return "de";
    if (base === "en") return "en";
  }
  return DEFAULT_LANG;
}

/** `/en/about` → `{ lang: "en", path: "/about" }`; an unprefixed path keeps `lang: null`. */
export function splitLang(path) {
  const p = String(path || "/");
  const m = LANG_PATH.exec(p);
  if (!m) return { lang: null, path: p };
  const rest = p.slice(m[0].length);
  return { lang: m[1], path: rest === "" ? "/" : rest };
}

/** Build the prefixed path for a language: `withLang("/about", "en")` → `/en/about`. */
export function withLang(path, lang) {
  const p = String(path || "/");
  const base = p === "/" ? "" : p;
  return `/${lang}${base}`;
}

/** The cookie that remembers an explicit switch. Not HttpOnly: a future client-side switch sets it. */
export const langCookie = (lang) => `${LANG_COOKIE}=${lang}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`;

/** Absolute URL on the hub host (hreflang and canonical need the full form). */
export const canonUrl = (site, path) => `https://${site}${path === "/" ? "/" : path}`;