// Tiny syntax highlighter. Returns tokens, never HTML: [{t, v}] where the concatenation of
// every v is exactly the input. app.js turns each token into a <span class="tok-…">.
//
// Supported: js/ts/json, python, bash/sh, html/xml, css, sql, yaml, diff. Anything else is
// returned as a single plain token.

const FLAGS = "y";

const rules = (list) => list.map(([type, source]) => [type, new RegExp(source, FLAGS)]);

const JS = rules([
  ["com", String.raw`\/\/[^\n]*|\/\*[\s\S]*?\*\/`],
  ["str", String.raw`\`(?:\\[\s\S]|[^\\\`])*\`|"(?:\\[\s\S]|[^"\\\n])*"|'(?:\\[\s\S]|[^'\\\n])*'`],
  ["num", String.raw`\b(?:0[xX][0-9a-fA-F]+|0[bB][01]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b`],
  [
    "kw",
    String.raw`\b(?:const|let|var|function|return|if|else|for|while|do|switch|case|default|break|continue|class|extends|new|await|async|import|from|export|try|catch|finally|throw|typeof|instanceof|delete|void|yield|in|of|this|super|null|undefined|true|false|interface|type|enum|implements|public|private|readonly|as|satisfies)\b`,
  ],
  ["fn", String.raw`[A-Za-z_$][\w$]*(?=\s*\()`],
  ["type", String.raw`\b[A-Z][A-Za-z0-9_]*\b`],
]);

const PY = rules([
  ["com", String.raw`#[^\n]*`],
  ["str", String.raw`"""[\s\S]*?"""|'''[\s\S]*?'''|f?"(?:\\[\s\S]|[^"\\\n])*"|f?'(?:\\[\s\S]|[^'\\\n])*'`],
  [
    "kw",
    String.raw`\b(?:def|class|return|if|elif|else|for|while|break|continue|import|from|as|with|try|except|finally|raise|pass|lambda|yield|global|nonlocal|assert|del|in|is|not|and|or|None|True|False|async|await|self|match|case)\b`,
  ],
  ["num", String.raw`\b(?:0[xX][0-9a-fA-F]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b`],
  ["fn", String.raw`[A-Za-z_][\w]*(?=\s*\()`],
  ["meta", String.raw`@[A-Za-z_][\w.]*`],
]);

const SH = rules([
  ["com", String.raw`(?:^|\s)#[^\n]*`],
  ["str", String.raw`"(?:\\[\s\S]|[^"\\])*"|'[^']*'`],
  ["var", String.raw`\$\{?[A-Za-z_][\w]*\}?`],
  [
    "kw",
    String.raw`\b(?:if|then|else|elif|fi|for|in|do|done|while|case|esac|function|return|export|local|set|unset|echo|cd|npm|node|npx|git|curl|wrangler|docker|powershell|sudo|cat|grep|sed|awk|mkdir|rm|cp|mv|chmod|systemctl)\b`,
  ],
  ["num", String.raw`\b\d+\b`],
]);

const HTML = rules([
  ["com", String.raw`<!--[\s\S]*?-->`],
  ["tag", String.raw`<\/?[A-Za-z][\w:-]*|\/?>`],
  ["attr", String.raw`[A-Za-z_:][\w:.-]*(?==)`],
  ["str", String.raw`"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'`],
]);

const CSS = rules([
  ["com", String.raw`\/\*[\s\S]*?\*\/`],
  ["str", String.raw`"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'`],
  ["sel", String.raw`[.#][A-Za-z_][\w-]*|@[a-z-]+`],
  ["attr", String.raw`[a-z-]+(?=\s*:)`],
  ["num", String.raw`\b\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw|s|ms|deg)?\b|#[0-9a-fA-F]{3,8}\b`],
]);

const SQL = rules([
  ["com", String.raw`--[^\n]*|\/\*[\s\S]*?\*\/`],
  ["str", String.raw`'(?:''|[^'])*'`],
  [
    "kw",
    String.raw`\b(?:SELECT|FROM|WHERE|INSERT|INTO|VALUES|UPDATE|SET|DELETE|CREATE|TABLE|INDEX|DROP|ALTER|JOIN|LEFT|RIGHT|INNER|OUTER|ON|GROUP|ORDER|BY|LIMIT|OFFSET|HAVING|AS|AND|OR|NOT|NULL|PRIMARY|KEY|FOREIGN|REFERENCES|DEFAULT|UNIQUE|CASCADE|BEGIN|COMMIT|ROLLBACK)\b`,
  ],
  ["num", String.raw`\b\d+\b`],
]);

const YAML = rules([
  ["com", String.raw`#[^\n]*`],
  ["attr", String.raw`^\s*-?\s*[A-Za-z0-9_.-]+(?=\s*:)`],
  ["str", String.raw`"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'`],
  ["num", String.raw`\b\d+(?:\.\d+)?\b`],
]);

const SETS = {
  js: JS,
  json: JS,
  python: PY,
  bash: SH,
  html: HTML,
  css: CSS,
  sql: SQL,
  yaml: YAML,
};

const ALIASES = {
  js: "js", javascript: "js", jsx: "js", mjs: "js", cjs: "js", ts: "js", typescript: "js", tsx: "js",
  json: "json", jsonc: "json",
  py: "python", python: "python", python3: "python",
  sh: "bash", shell: "bash", bash: "bash", zsh: "bash", console: "bash", shellscript: "bash",
  html: "html", xml: "html", svg: "html", vue: "html",
  css: "css", scss: "css", less: "css",
  sql: "sql", psql: "sql",
  yml: "yaml", yaml: "yaml",
  diff: "diff", patch: "diff",
  text: "text", txt: "text", plain: "text", "": "text",
};

export function normalizeLang(lang) {
  const key = String(lang || "").toLowerCase().trim();
  return ALIASES[key] || "text";
}

/** [{t, v}] — concatenating v reproduces `code` byte for byte. */
export function highlight(code, lang) {
  const src = String(code ?? "");
  if (!src) return [];
  const name = normalizeLang(lang);
  if (name === "diff") return highlightDiff(src);
  const set = SETS[name];
  if (!set) return [{ t: "text", v: src }];

  const out = [];
  let text = "";
  let i = 0;
  const flush = () => {
    if (text) {
      out.push({ t: "text", v: text });
      text = "";
    }
  };

  while (i < src.length) {
    let hit = null;
    for (const [type, re] of set) {
      re.lastIndex = i;
      const m = re.exec(src);
      if (m && m.index === i && m[0].length) {
        hit = [type, m[0]];
        break;
      }
    }
    if (hit) {
      flush();
      out.push({ t: hit[0], v: hit[1] });
      i += hit[1].length;
    } else {
      text += src[i];
      i++;
    }
  }
  flush();
  return out.length ? out : [{ t: "text", v: src }];
}

function highlightDiff(src) {
  const out = [];
  for (const line of src.split("\n")) {
    let type = "text";
    if (/^\+\+\+|^---|^@@|^diff |^index /.test(line)) type = "meta";
    else if (line.startsWith("+")) type = "add";
    else if (line.startsWith("-")) type = "del";
    out.push({ t: type, v: line });
    out.push({ t: "text", v: "\n" });
  }
  // drop the trailing newline token we added after the last line
  if (out.length && out[out.length - 1].v === "\n") out.pop();
  return out;
}

/** Guess a language from a filename, for tool output that only names a path. */
export function langFromPath(path) {
  const ext = String(path || "").toLowerCase().match(/\.([a-z0-9]+)$/);
  return ext ? normalizeLang(ext[1]) : "text";
}
