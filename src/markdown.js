// Build-time Markdown renderer for the Creative Hub (docs/creative-hub-plan.md §4.1, §8 "Writing").
//
// Deliberately small, dependency-free and safe. It runs at build time (scripts/build-content.mjs);
// the Worker never parses Markdown at request time.
//
// Supported subset:
//   - paragraphs (soft line breaks become spaces),
//   - headings `#`…`######` rendered as <h2>…<h4> (a page has exactly one <h1> — the title),
//   - emphasis `*x*` / `_x_`, strong `**x**` / `__x__`,
//   - links `[text](url "title")`,
//   - images `![alt](src "title")` — only paths under /content-assets/ or an allowlisted https host,
//   - unordered / ordered lists, nested by indentation,
//   - blockquotes `>`, fenced code blocks (``` / ~~~), inline code,
//   - horizontal rules (`---`, `***`, `___`).
//
// Safety contract:
//   - Raw HTML in Markdown is escaped, never passed through (`<script>` becomes text).
//   - Link targets are limited to http(s), mailto and relative URLs; `javascript:` and `data:` are
//     dropped (the label survives as plain text).
//   - External links get `rel="noopener noreferrer"`.
//   - Images are only emitted for local /content-assets/ paths (no remote image in phase 3a).
//   - Smart quotes are never substituted automatically.
export const IMAGE_HOST_ALLOWLIST = []; // phase 3a: no remote image hosts, local paths only
export const IMAGE_PATH_PREFIX = "/content-assets/";

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ESCAPES[c]);

const isSafeImageSrc = (src) => {
  if (!src) return false;
  if (src.startsWith(IMAGE_PATH_PREFIX) && !src.includes("..")) return true;
  const m = /^https:\/\/([^/?#]+)/i.exec(src);
  return !!m && IMAGE_HOST_ALLOWLIST.includes(m[1].toLowerCase());
};

/** `http`, `mailto`, `relative` or `bad` (an unknown scheme or a protocol-relative URL). */
const linkKind = (href) => {
  // Browsers drop control characters (and leading spaces) when they parse a URL, so "\u0001javascript:..." would
  // still be a javascript: URL. No legitimate link contains them: refuse.
  if (/[\u0000-\u001f\u007f-\u009f]/.test(href)) return "bad";
  if (/^https?:\/\//i.test(href)) return "http";
  if (/^mailto:/i.test(href)) return "mailto";
  if (/^[a-z][a-z0-9+.-]*:/i.test(href)) return "bad";
  if (href.startsWith("//")) return "bad";
  return "relative";
};

function renderImage(alt, src, title) {
  if (!isSafeImageSrc(src)) return "";
  const t = title ? ` title="${title}"` : "";
  return `<img src="${src}" alt="${alt}"${t} loading="lazy" decoding="async">`;
}

function renderLink(text, href, title) {
  const kind = linkKind(href);
  if (kind === "bad") return text; // javascript:, data:, protocol-relative … link removed
  const t = title ? ` title="${title}"` : "";
  if (kind === "http") return `<a href="${href}"${t} target="_blank" rel="noopener noreferrer">${text}</a>`;
  return `<a href="${href}"${t}>${text}</a>`;
}

/**
 * Inline rendering. Takes raw text, escapes it first, then applies the inline subset.
 * The whole string is escaped before any transformation, so raw HTML can never survive.
 */
export function renderInline(raw) {
  let s = escapeHtml(raw);
  const codes = [];
  s = s.replace(/(`+)([\s\S]*?)\1/g, (m, ticks, body) => `\u0000c${codes.push(body) - 1}\u0000`);
  // The whole string is escaped before this point, so a quoted title arrives as `&quot;…&quot;`.
  const DEST = "([^()\\s]*(?:\\([^()\\s]*\\)[^()\\s]*)*)";
  const TITLE = "(?:\\s+&quot;(.*?)&quot;)?";
  s = s.replace(new RegExp(`!\\[([^\\]]*)\\]\\(${DEST}${TITLE}\\)`, "g"), (m, alt, src, title) => renderImage(alt, src, title));
  s = s.replace(new RegExp(`\\[([^\\]]*)\\]\\(${DEST}${TITLE}\\)`, "g"), (m, text, href, title) => renderLink(text, href, title));
  s = s.replace(/(^|[^A-Za-z0-9_])(\*\*|__)(?=\S)([\s\S]*?\S)\2(?![A-Za-z0-9_])/g, (m, pre, mark, inner) => `${pre}<strong>${inner}</strong>`);
  s = s.replace(/(^|[^A-Za-z0-9_])(\*|_)(?=\S)([^*_]*?\S)\2(?![A-Za-z0-9_])/g, (m, pre, mark, inner) => `${pre}<em>${inner}</em>`);
  s = s.replace(/\u0000c(\d+)\u0000/g, (m, i) => `<code>${codes[Number(i)]}</code>`);
  return s;
}

const FENCE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const HEADING = /^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/;
const HR = /^ {0,3}([-*_])(\s*\1){2,}\s*$/;
const QUOTE = /^ {0,3}>/;
const LIST_ITEM = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;

/** Render the item list starting at `start` as one <ul>/<ol>, recursing into deeper indentation. */
function renderListAt(items, start) {
  const indent = items[start].indent;
  const ordered = items[start].ordered;
  const tag = ordered ? "ol" : "ul";
  const startAttr = ordered && items[start].start !== 1 ? ` start="${items[start].start}"` : "";
  let html = `<${tag}${startAttr}>`;
  let i = start;
  while (i < items.length && items[i].indent === indent && items[i].ordered === ordered) {
    let inner = renderInline(items[i].text);
    i++;
    if (i < items.length && items[i].indent > indent) {
      const [sub, next] = renderListAt(items, i);
      inner += sub;
      i = next;
    }
    html += `<li>${inner}</li>`;
  }
  return [`${html}</${tag}>`, i];
}

const closeFence = (ch) => new RegExp(`^ {0,3}${ch === "`" ? "`{3,}" : "~{3,}"}\\s*$`);

/** Render a Markdown document to HTML. Pure: same input, same output. */
export function renderMarkdown(src) {
  const lines = String(src ?? "").replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n");
  const html = [];
  const blank = (l) => /^\s*$/.test(l);
  let i = 0;

  while (i < lines.length) {
    if (blank(lines[i])) {
      i++;
      continue;
    }

    const fence = FENCE.exec(lines[i]);
    if (fence) {
      const close = closeFence(fence[1][0]);
      const lang = fence[2].trim().split(/\s+/)[0] || "";
      const body = [];
      i++;
      while (i < lines.length && !close.test(lines[i])) body.push(lines[i++]);
      if (i < lines.length) i++;
      const cls = /^[A-Za-z0-9_+-]{1,20}$/.test(lang) ? ` class="language-${escapeHtml(lang)}"` : "";
      html.push(`<pre><code${cls}>${escapeHtml(body.join("\n"))}</code></pre>`);
      continue;
    }

    const heading = HEADING.exec(lines[i]);
    if (heading) {
      const level = Math.min(4, Math.max(2, heading[1].length));
      html.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      i++;
      continue;
    }

    if (HR.test(lines[i])) {
      html.push("<hr>");
      i++;
      continue;
    }

    if (QUOTE.test(lines[i])) {
      const buf = [];
      while (i < lines.length && QUOTE.test(lines[i])) buf.push(lines[i++].replace(/^ {0,3}>\s?/, ""));
      html.push(`<blockquote>${renderMarkdown(buf.join("\n"))}</blockquote>`);
      continue;
    }

    if (LIST_ITEM.test(lines[i])) {
      const items = [];
      while (i < lines.length) {
        const m = LIST_ITEM.exec(lines[i]);
        if (m) {
          const ordered = /\d/.test(m[2]);
          items.push({ indent: m[1].length, ordered, start: ordered ? parseInt(m[2], 10) : 1, text: m[3] });
          i++;
          while (i < lines.length && !blank(lines[i]) && !LIST_ITEM.test(lines[i]) && /^\s+/.test(lines[i])) {
            items[items.length - 1].text += ` ${lines[i++].trim()}`;
          }
          continue;
        }
        if (blank(lines[i])) break;
        if (!items.length) break;
        items[items.length - 1].text += ` ${lines[i++].trim()}`;
      }
      let idx = 0;
      while (idx < items.length) {
        const [chunk, next] = renderListAt(items, idx);
        html.push(chunk);
        idx = next;
      }
      continue;
    }

    const buf = [];
    while (
      i < lines.length &&
      !blank(lines[i]) &&
      !FENCE.test(lines[i]) &&
      !HEADING.test(lines[i]) &&
      !HR.test(lines[i]) &&
      !QUOTE.test(lines[i]) &&
      !LIST_ITEM.test(lines[i])
    ) {
      buf.push(lines[i++].trim());
    }
    html.push(`<p>${renderInline(buf.join(" "))}</p>`);
  }

  return html.join("\n");
}

/** Plain text of a rendered HTML fragment (used for excerpts and meta descriptions). */
export const htmlToText = (htmlText) =>
  String(htmlText ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
