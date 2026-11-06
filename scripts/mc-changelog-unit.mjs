import { test } from "node:test";
import assert from "node:assert/strict";
import { changelogBody, playerSections, latestEntries } from "../src/mc-changelog.js";
import { resolveIcon } from "../src/mc-icon.js";

test("player entries with the same date share a timeline card without exposing admin entries", () => {
  const md = `## Für Spieler
### Update A – 2026-10-03
- Erste Änderung
### Update B – 2026-10-03
- Zweite Änderung
### Update C – 2026-09-01
- Ältere Änderung
## Für Admins
- Interner Schlüssel
`;
  const html = changelogBody(md);
  assert.equal((html.match(/data-date="2026-10-03"/g) || []).length, 1);
  assert.equal((html.match(/data-date="2026-09-01"/g) || []).length, 1);
  for (const text of ["Update A", "Update B", "Update C", "Erste Änderung", "Zweite Änderung", "Ältere Änderung"]) assert.ok(html.includes(text));
  assert.ok(!html.includes("Interner Schlüssel"));
});

test("category icons and labels follow explicit entry categories with a neutral fallback", () => {
  const md = `## Für Spieler
- [Neu] Ein Portal wurde geöffnet
- [Feature] Ein Feature kam dazu
- [Fix] Ein Fehler wurde behoben
- [Balance] Die Preise wurden angepasst
- [Event] Ein Event startet
- [Geändert] Regeln wurden angepasst
- Unkategorisierte Nachricht
`;
  const html = changelogBody(md);
  for (const [category, icon, label] of [["new", "grass_block", "Neu"], ["fix", "anvil", "Fix"], ["balance", "gold_ingot", "Balance"], ["event", "bell", "Event"], ["change", "comparator", "Geändert"], ["other", "writable_book", "Eintrag"]]) {
    const row = html.match(new RegExp(`<li[^>]*data-category="${category}"[^>]*>(?:(?!<\\/li>)[\\s\\S])*<\\/li>`))?.[0];
    assert.ok(row, `missing ${category} row`);
    assert.ok(row.includes(`/mc-icon/v2/${icon}`), row);
    assert.ok(row.includes(label), row);
  }
});

test("the bundled player entries carry their real dates and keep topic icons, without invented update types", () => {
  const html = changelogBody();
  assert.match(html, /data-category="trade"[^>]*>[\s\S]*?\/mc-icon\/v2\/emerald/);
  assert.match(html, /data-category="connection"[^>]*>[\s\S]*?\/mc-icon\/v2\/ender_pearl/);
  assert.match(html, /<time class="chip cl-date" datetime="2026-11-01">01\.11\.2026<\/time>/);
  assert.match(html, /<time class="chip cl-date" datetime="2026-10-31">31\.10\.2026<\/time>/);
  assert.doesNotMatch(html, /data-category="(?:new|fix|change)"/);
  assert.ok(html.includes("Stack für Stack"));
});

test("latestEntries gives date, title and subline for the start page", () => {
  const md = `## Für Spieler
### 06.11.2026
- **Neue Navigation** – Hauptseite und Server-Seite teilen sich dieselbe Leiste.
- Ohne Fettdruck. Der zweite Satz ist die Unterzeile.
### 04.11.2026
- Nur ein Satz ohne Unterzeile.
`;
  assert.deepEqual(latestEntries(3, md), [
    { date: "06.11.", text: "Hauptseite und Server-Seite teilen sich dieselbe Leiste.", title: "Neue Navigation", sub: "Hauptseite und Server-Seite teilen sich dieselbe Leiste." },
    { date: "06.11.", text: "Ohne Fettdruck. Der zweite Satz ist die Unterzeile.", title: "Ohne Fettdruck", sub: "Der zweite Satz ist die Unterzeile." },
    { date: "04.11.", text: "Nur ein Satz ohne Unterzeile.", title: "Nur ein Satz ohne Unterzeile", sub: "" },
  ]);
  assert.equal(latestEntries(2, md).length, 2);
});

test("English title and subline come from the en: comment, fall back to German, and never show on the page", () => {
  const md = `## Für Spieler
### 06.11.2026
- **Neue Navigation** – Eine Leiste für alles. <!-- en: **New navigation** – One bar for everything. -->
- **Nur Deutsch** – Kein englischer Text.
`;
  assert.deepEqual(latestEntries(2, md, "en").map((e) => [e.title, e.sub]), [["New navigation", "One bar for everything."], ["Nur Deutsch", "Kein englischer Text."]]);
  assert.deepEqual(latestEntries(1, md, "de").map((e) => [e.title, e.sub]), [["Neue Navigation", "Eine Leiste für alles."]]);
  assert.ok(!changelogBody(md).includes("New navigation") && !changelogBody(md).includes("en:") && !changelogBody(md).includes("&lt;!--"));
  assert.deepEqual(playerSections(md)[0].items[0], "**Neue Navigation** – Eine Leiste für alles.");
});

test("a new player section without a heading does not inherit an earlier date", () => {
  const md = `## Für Spieler
### 2026-10-03
- Datierter Eintrag
## Admin
- Intern
## Für Spieler
- Eintrag ohne Datum
`;
  assert.deepEqual(playerSections(md), [
    { title: "2026-10-03", items: ["Datierter Eintrag"] },
    { title: null, items: ["Eintrag ohne Datum"] },
  ]);
});

test("empty state and safe inline formatting are preserved", () => {
  assert.match(changelogBody("## Admin\n- Geheim"), /id="cl-empty"/);
  const html = changelogBody("## Für Spieler\n### 03.10.2026 <img>\n- **Stark** und `code` <script>");
  assert.match(html, /datetime="2026-10-03"/);
  assert.ok(html.includes("&lt;img&gt;"));
  assert.ok(html.includes("<strong>Stark</strong>"));
  assert.ok(html.includes("<code>code</code>"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(!html.includes("<script>"));
  assert.doesNotMatch(changelogBody("## Für Spieler\n### 2026-02-30\n- Test"), /<time\b/);
});

test("website, server, Discord and economy use distinct topic icons without losing fix labels", () => {
  const html = changelogBody(`## Für Spieler\n- [Fix] Discord-Anmeldung korrigiert\n- Die Website wurde erweitert\n- Server aktualisiert\n- Economy und CP angepasst`);
  for (const [category, icon] of [["discord", "note_block"], ["website", "filled_map"], ["server", "grass_block"], ["economy", "emerald"]]) {
    const row = html.match(new RegExp(`<li[^>]*data-category="${category}"[^>]*>(?:(?!<\\/li>)[\\s\\S])*<\\/li>`))?.[0];
    assert.ok(row, `missing ${category}`);
    assert.ok(row.includes(`/mc-icon/v2/${icon}`), row);
    if (category === "discord") assert.ok(row.includes('>Fix<'), 'explicit fix label remains visible');
  }
});

test("all category icon IDs resolve to their intended Minecraft textures", () => {
  for (const [id, texture] of Object.entries({ emerald: "item/emerald", ender_pearl: "item/ender_pearl", grass_block: "block/grass_block_side", anvil: "block/anvil_top", comparator: "item/comparator", writable_book: "item/writable_book" })) {
    assert.equal(resolveIcon(id), texture);
  }
});
