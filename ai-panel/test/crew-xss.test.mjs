// XSS at the last mile: the Crew-Runs builders must turn hostile strings into text nodes.
//
// There is no jsdom in this repo, so `el` is recorded instead of rendered: the builder receives
// the same helper signature the shell uses, and we assert that every untrusted value arrives as
// a text child / a `text` prop and never as markup, an attribute value or a tag name.

import test from "node:test";
import assert from "node:assert/strict";

import { crewCard, crewMessageRow, kindLabel, messageCountLabel, rangeLabel, statusLabel } from "../public/crew.js";

/** A recording stand-in for the shell's `el`. Returns a plain tree, nothing renders. */
function recorder() {
  const nodes = [];
  const el = (tag, props = {}, ...children) => {
    const node = { tag, props: { ...props }, children: [] };
    for (const child of children.flat()) if (child !== null && child !== undefined && child !== false) node.children.push(child);
    nodes.push(node);
    return node;
  };
  return { el, nodes };
}

const HOSTILE = '<img src=x onerror="alert(1)"><script>alert(2)</script>';

/** Every text value in the subtree: string children and `text` props, recursively. */
function textChildren(node) {
  const out = [];
  if (typeof node.props?.text === "string") out.push(node.props.text);
  for (const child of node.children || []) {
    if (typeof child === "string") out.push(child);
    else if (child && typeof child === "object") out.push(...textChildren(child));
  }
  return out;
}

test("a hostile session title becomes text, never markup", () => {
  const { el, nodes } = recorder();
  const card = crewCard(el, { id: "run_x", title: HOSTILE, kind: "run", status: "completed", message_count: 2 }, () => {});

  const texts = textChildren(card).join("\n");
  assert.ok(texts.includes(HOSTILE), "the title is preserved verbatim as text");

  // No node may carry it as markup. The only sinks allowed to hold the raw string are the
  // textContent sink (`text`) and an attribute (aria-label), which the DOM escapes.
  const SAFE_SINKS = new Set(["text", "aria-label"]);
  for (const node of nodes) {
    assert.match(node.tag, /^[a-z]+$/, "tag names come from the builder, not from data");
    for (const [key, value] of Object.entries(node.props)) {
      if (typeof value !== "string" || !value.includes("<script")) continue;
      assert.ok(SAFE_SINKS.has(key), `${key} must not carry markup`);
    }
  }
  assert.ok(
    nodes.some((n) => n.props.text === HOSTILE),
    "the title was handed over as a textContent value",
  );
});

test("a hostile transcript body is a text prop on a <pre>, not HTML", () => {
  const { el, nodes } = recorder();
  const row = crewMessageRow(el, { role: "tool", tool_name: "terminal", content: HOSTILE, timestamp: 1767225600 });
  assert.equal(row.tag, "article");
  const pre = nodes.find((n) => n.tag === "pre");
  assert.ok(pre, "the body is a <pre>");
  assert.equal(pre.props.text, HOSTILE, "passed as textContent, not as children markup");
  assert.equal(pre.children.length, 0, "no child nodes were built from the string");
});

test("no builder produces an HTML string or an HTML sink", async () => {
  const { readFile } = await import("node:fs/promises");
  const url = new URL("../public/crew.js", import.meta.url);
  const src = await readFile(url, "utf8");
  for (const banned of [/\.innerHTML\s*=/, /insertAdjacentHTML/, /document\.write/, /outerHTML\s*=/, /\beval\s*\(/, /new Function\s*\(/]) {
    assert.doesNotMatch(src, banned);
  }
  assert.doesNotMatch(src, /\bdocument\./, "crew.js stays DOM-free apart from the injected el");
});

test("the card exposes a whole-row button with 44px-friendly text and an accessible label", () => {
  const { el } = recorder();
  const card = crewCard(el, { id: "local-1", title: "CLI", kind: "cli", status: "running", message_count: 1 }, () => {});
  assert.equal(card.tag, "button");
  assert.equal(card.props.type, "button", "no implicit form submit");
  assert.match(card.props["aria-label"], /CLI CLI, läuft/);
});

test("status and kind labels are human, unknown values are clipped not invented", () => {
  assert.equal(kindLabel("run"), "Run");
  assert.equal(kindLabel("cli"), "CLI");
  assert.equal(kindLabel("weird"), "Session");
  assert.equal(statusLabel("completed"), "abgeschlossen");
  assert.equal(statusLabel("RUNNING"), "läuft");
  assert.equal(statusLabel("failed"), "fehlgeschlagen");
  assert.equal(statusLabel(""), "unbekannt");
  assert.equal(statusLabel("x".repeat(80)).length, 24);
  assert.equal(messageCountLabel(1), "1 Nachricht");
  assert.equal(messageCountLabel(0), "0 Nachrichten");
});

test("rangeLabel never claims more rows than exist", () => {
  assert.equal(rangeLabel({ shown: 0, total: 0, offset: 0 }), "keine Einträge");
  assert.equal(rangeLabel({ shown: 30, total: 84, offset: 0 }), "Zeige 1–30 von 84");
  assert.equal(rangeLabel({ shown: 4, total: 4, offset: 0 }), "Zeige 1–4 von 4 (Ende)");
});
