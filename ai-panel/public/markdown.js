// Markdown → a plain data tree. No HTML strings anywhere: the renderer in app.js walks the
// tree and creates text nodes, so model output can never become markup.
//
//   parseMarkdown(src) -> Block[]
//   parseInline(src)   -> Inline[]
//
// Block:  {type:"p"|"h"|"code"|"list"|"quote"|"hr"|"table", …}
// Inline: {t:"text"|"code"|"strong"|"em"|"del"|"link"|"br", …}

const FENCE = /^\s*(`{3,}|~{3,})\s*([A-Za-z0-9_+#.-]*)\s*$/;
const HEADING = /^(#{1,6})\s+(.*)$/;
const RULE = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
const QUOTE = /^\s{0,3}>\s?/;
const ITEM = /^(\s*)([-*+]|\d{1,9}[.)])\s+(.*)$/;
const TABLE_SEP = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;

/** Only http(s), mailto and site-relative links survive. Everything else is plain text. */
export function safeHref(raw) {
  const href = String(raw ?? "").trim();
  if (!href) return null;
  if (/[\u0000-\u001f\u007f]/.test(href)) return null;
  if (/^(https?:|mailto:)/i.test(href)) return href;
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  return null;
}

function isBlockStart(line) {
  return (
    FENCE.test(line) ||
    HEADING.test(line) ||
    RULE.test(line) ||
    QUOTE.test(line) ||
    ITEM.test(line)
  );
}

export function parseMarkdown(src) {
  const lines = String(src ?? "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }

    const fence = line.match(FENCE);
    if (fence) {
      const marker = fence[1][0];
      const len = fence[1].length;
      const lang = (fence[2] || "").toLowerCase();
      const body = [];
      i++;
      while (i < lines.length) {
        const close = lines[i].match(/^\s*(`{3,}|~{3,})\s*$/);
        if (close && close[1][0] === marker && close[1].length >= len) {
          i++;
          break;
        }
        body.push(lines[i]);
        i++;
      }
      blocks.push({ type: "code", lang, text: body.join("\n") });
      continue;
    }

    const heading = line.match(HEADING);
    if (heading) {
      blocks.push({ type: "h", level: heading[1].length, inl: parseInline(heading[2].trim()) });
      i++;
      continue;
    }

    if (RULE.test(line)) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    if (QUOTE.test(line)) {
      const inner = [];
      while (i < lines.length && QUOTE.test(lines[i])) {
        inner.push(lines[i].replace(QUOTE, ""));
        i++;
      }
      blocks.push({ type: "quote", blocks: parseMarkdown(inner.join("\n")) });
      continue;
    }

    // GFM-style table: header row + |---| row
    if (line.includes("|") && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]) && lines[i + 1].includes("-")) {
      const head = splitRow(line);
      const rows = [];
      i += 2;
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) {
        rows.push(splitRow(lines[i]));
        i++;
      }
      blocks.push({ type: "table", head: head.map(parseInline), rows: rows.map((r) => r.map(parseInline)) });
      continue;
    }

    const item = line.match(ITEM);
    if (item) {
      const ordered = /\d/.test(item[2]);
      const items = [];
      while (i < lines.length) {
        const m = lines[i].match(ITEM);
        if (!m) break;
        const indent = m[1].replace(/\t/g, "  ").length;
        items.push({ level: Math.min(2, Math.floor(indent / 2)), inl: parseInline(m[3]) });
        i++;
        // indented continuation lines belong to the item above
        while (
          i < lines.length &&
          lines[i].trim() &&
          !ITEM.test(lines[i]) &&
          /^\s{2,}/.test(lines[i])
        ) {
          const last = items[items.length - 1];
          last.inl = last.inl.concat([{ t: "br" }], parseInline(lines[i].trim()));
          i++;
        }
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    const para = [];
    while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) {
      para.push(lines[i]);
      i++;
    }
    blocks.push({ type: "p", inl: parseInline(para.join("\n")) });
  }

  return blocks;
}

function splitRow(line) {
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  return s.split("|").map((c) => c.trim());
}

export function parseInline(src) {
  const s = String(src ?? "");
  const out = [];
  let buf = "";
  let i = 0;

  const flush = () => {
    if (buf) {
      out.push({ t: "text", v: buf });
      buf = "";
    }
  };
  const push = (tok) => {
    flush();
    out.push(tok);
  };

  while (i < s.length) {
    const ch = s[i];

    if (ch === "\\" && i + 1 < s.length && /[\\`*_{}[\]()#+\-.!~|>]/.test(s[i + 1])) {
      buf += s[i + 1];
      i += 2;
      continue;
    }

    if (ch === "`") {
      const m = /^(`+)([\s\S]*?)\1/.exec(s.slice(i));
      if (m) {
        push({ t: "code", v: m[2].replace(/^ | $/g, "") });
        i += m[0].length;
        continue;
      }
    }

    if (ch === "[") {
      const m = /^\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/.exec(s.slice(i));
      if (m) {
        const href = safeHref(m[2]);
        if (href) push({ t: "link", href, c: parseInline(m[1]) });
        else push({ t: "text", v: m[0] }); // unsafe scheme: keep the source text verbatim
        i += m[0].length;
        continue;
      }
    }

    if (ch === "<") {
      const m = /^<(https?:\/\/[^>\s]+)>/.exec(s.slice(i));
      if (m) {
        push({ t: "link", href: m[1], c: [{ t: "text", v: m[1] }] });
        i += m[0].length;
        continue;
      }
    }

    if ((ch === "*" && s[i + 1] === "*") || (ch === "_" && s[i + 1] === "_")) {
      const mark = ch + ch;
      const end = s.indexOf(mark, i + 2);
      if (end > i + 2) {
        push({ t: "strong", c: parseInline(s.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }

    if (ch === "~" && s[i + 1] === "~") {
      const end = s.indexOf("~~", i + 2);
      if (end > i + 2) {
        push({ t: "del", c: parseInline(s.slice(i + 2, end)) });
        i = end + 2;
        continue;
      }
    }

    if (ch === "*" || ch === "_") {
      const end = s.indexOf(ch, i + 1);
      if (end > i + 1 && s.slice(i + 1, end).trim()) {
        push({ t: "em", c: parseInline(s.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }

    if (ch === "\n") {
      push({ t: "br" });
      i++;
      continue;
    }

    buf += ch;
    i++;
  }

  flush();
  return out;
}

/** Plain text of an inline tree — used for aria labels and the copy button. */
export function inlineText(tokens) {
  let out = "";
  for (const tok of tokens || []) {
    if (tok.t === "text" || tok.t === "code") out += tok.v;
    else if (tok.t === "br") out += "\n";
    else if (tok.c) out += inlineText(tok.c);
  }
  return out;
}
