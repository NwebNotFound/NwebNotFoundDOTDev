#!/usr/bin/env node
// Minimal XML/XHTML well-formedness checker for the tests — no DOM, no dependency, no network.
//
//   import { checkWellFormed } from "./xml-check.mjs";
//   checkWellFormed(xml)  →  { ok: boolean, errors: string[] }
//
// It is deliberately strict about the things a feed reader or an EPUB reader trips over:
//   - exactly one root element, every tag closed in order,
//   - quoted attribute values only,
//   - `&` only as a known entity or numeric reference, `<` only as markup,
//   - comments, processing instructions and CDATA sections are handled (and must be terminated),
//   - a stray `]]>` outside CDATA is an error.
// It does not know namespaces, DTDs or schema rules — that is what the structure tests are for.

const NAME = "[A-Za-z_:][-A-Za-z0-9_:.]*";
const ENTITY = /&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g;

export function checkWellFormed(xml) {
  const src = String(xml ?? "");
  const errors = [];
  const fail = (msg) => errors.push(msg);
  const stack = [];
  let roots = 0;
  let i = 0;

  const checkText = (text) => {
    if (!text) return;
    if (text.includes("]]>")) fail(`stray "]]>" outside CDATA: ${text.slice(0, 40)}`);
    const rest = text.replace(ENTITY, "");
    if (rest.includes("&")) fail(`unescaped "&" in text: ${text.slice(0, 40)}`);
    if (rest.includes("<")) fail(`unescaped "<" in text: ${text.slice(0, 40)}`);
  };

  while (i < src.length) {
    const lt = src.indexOf("<", i);
    if (lt < 0) {
      checkText(src.slice(i));
      break;
    }
    checkText(src.slice(i, lt));
    i = lt;

    if (src.startsWith("<!--", i)) {
      const end = src.indexOf("-->", i + 4);
      if (end < 0) return finish("unterminated comment");
      i = end + 3;
      continue;
    }
    if (src.startsWith("<![CDATA[", i)) {
      const end = src.indexOf("]]>", i + 9);
      if (end < 0) return finish("unterminated CDATA section");
      i = end + 3;
      continue;
    }
    if (src.startsWith("<?", i)) {
      const end = src.indexOf("?>", i + 2);
      if (end < 0) return finish("unterminated processing instruction");
      i = end + 2;
      continue;
    }
    if (src.startsWith("<!", i)) {
      const end = src.indexOf(">", i + 2);
      if (end < 0) return finish("unterminated declaration");
      i = end + 1;
      continue;
    }

    const closing = new RegExp(`^</(${NAME})\\s*>`).exec(src.slice(i));
    if (closing) {
      const open = stack.pop();
      if (open !== closing[1]) fail(`</${closing[1]}> does not match <${open ?? "nothing"}>`);
      i += closing[0].length;
      continue;
    }

    const start = new RegExp(`^<(${NAME})`).exec(src.slice(i));
    if (!start) {
      fail(`invalid markup at offset ${i}: ${src.slice(i, i + 40)}`);
      break;
    }
    const name = start[1];
    let j = i + start[0].length;
    let selfClosing = false;
    for (;;) {
      while (/\s/.test(src[j] ?? "")) j++;
      if (src.startsWith("/>", j)) {
        selfClosing = true;
        j += 2;
        break;
      }
      if (src[j] === ">") {
        j += 1;
        break;
      }
      const attr = new RegExp(`^(${NAME})\\s*=\\s*("[^"]*"|'[^']*')`).exec(src.slice(j));
      if (!attr) {
        fail(`unquoted or malformed attribute in <${name}> at offset ${j}: ${src.slice(j, j + 30)}`);
        j = -1;
        break;
      }
      checkText(attr[2].slice(1, -1));
      j += attr[0].length;
    }
    if (j < 0) break;
    if (stack.length === 0) roots++;
    if (!selfClosing) stack.push(name);
    i = j;
  }

  if (stack.length) fail(`unclosed element(s): <${stack.join(">, <")}>`);
  if (roots !== 1) fail(`expected exactly one root element, found ${roots}`);
  return { ok: errors.length === 0, errors };

  function finish(msg) {
    fail(msg);
    return { ok: false, errors };
  }
}
