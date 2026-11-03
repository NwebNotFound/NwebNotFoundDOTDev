#!/usr/bin/env node
// Unit-Tests für den EPUB-Export (Phase 3c, docs/creative-hub-plan.md §8 "Export"): ZIP-Struktur
// (mimetype zuerst und ungepackt, CRC32, zentrale Verzeichnis-Einträge), XHTML-Wohlgeformtheit,
// Sonderzeichen/Umlaute, Rechte-Zeile, stabile Kennung, Cover und "kein Export für Blog".
// Läuft allein (`node scripts/epub-unit.mjs`) und wird von scripts/e2e.mjs importiert, damit die CI
// (die nur e2e ausführt) sie mitnimmt.
import assert from "node:assert/strict";
import { analyze, toIndex } from "../src/content.js";
import {
  buildEpub,
  buildEpubs,
  crc32,
  epubIdentifier,
  epubPath,
  htmlToXhtml,
  imageMediaType,
  modifiedStamp,
  rewriteForEpub,
  seriesEpubPath,
  zipStore,
} from "../src/epub.js";
import { makeT } from "../src/i18n/index.js";
import { renderMarkdown } from "../src/markdown.js";
import { checkWellFormed } from "./xml-check.mjs";

const SITE = "nwebnotfound.dev";
const RIGHTS = (lang) => makeT(lang)("writing.export.rights");
const dec = new TextDecoder();

/** A minimal ZIP reader for stored entries — the test must not trust the writer it checks. */
function readZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries = [];
  const central = [];
  let at = 0;
  while (view.getUint32(at, true) === 0x04034b50) {
    const method = view.getUint16(at + 8, true);
    const crc = view.getUint32(at + 14, true);
    const size = view.getUint32(at + 18, true);
    const nameLen = view.getUint16(at + 26, true);
    const extraLen = view.getUint16(at + 28, true);
    const name = dec.decode(bytes.subarray(at + 30, at + 30 + nameLen));
    const dataAt = at + 30 + nameLen + extraLen;
    entries.push({ name, method, crc, size, extraLen, offset: at, data: bytes.subarray(dataAt, dataAt + size) });
    at = dataAt + size;
  }
  const cdStart = at;
  while (view.getUint32(at, true) === 0x02014b50) {
    const method = view.getUint16(at + 10, true);
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 20, true);
    const nameLen = view.getUint16(at + 28, true);
    const extraLen = view.getUint16(at + 30, true);
    const commentLen = view.getUint16(at + 32, true);
    const localOffset = view.getUint32(at + 42, true);
    central.push({ name: dec.decode(bytes.subarray(at + 46, at + 46 + nameLen)), method, crc, size, localOffset });
    at += 46 + nameLen + extraLen + commentLen;
  }
  const eocd = { count: view.getUint16(at + 10, true), size: view.getUint32(at + 12, true), offset: view.getUint32(at + 16, true) };
  return { entries, central, eocd, cdStart, size: bytes.length };
}

const entry = (zip, name) => zip.entries.find((e) => e.name === name);
const text = (zip, name) => dec.decode(entry(zip, name).data);
const names = (zip) => zip.entries.map((e) => e.name);

/** The one chapter fixture: markdown in, EPUB out. */
const chapter = (o = {}) => ({
  slug: o.slug || "chapter-1",
  title: o.title || "Kapitel eins",
  chapter: o.chapter || 1,
  lang: o.lang || "de",
  date: o.date || "2026-11-04",
  series: o.series || "serie",
  seriesTitle: o.seriesTitle || "Die Serie",
  cover: o.cover || null,
  html: o.html || "<p>Ein Absatz.</p>",
});

const epubOf = (chapter, extra = {}) =>
  buildEpub({
    title: chapter.title,
    lang: chapter.lang,
    date: chapter.date,
    identifier: epubIdentifier(`chapter:${chapter.slug}`),
    rights: RIGHTS(chapter.lang),
    chapters: [chapter],
    site: SITE,
    ...extra,
  });

/* ---- 1. CRC32 and the ZIP writer ----------------------------------------------------------------- */
assert.equal(crc32(new TextEncoder().encode("123456789")), 0xcbf43926, "the standard CRC-32 test vector");
assert.equal(crc32(new TextEncoder().encode("")), 0, "an empty payload has CRC 0");

{
  const zip = readZip(zipStore([{ name: "mimetype", data: "application/epub+zip" }, { name: "b.txt", data: "hallo" }]));
  assert.deepEqual(names(zip), ["mimetype", "b.txt"], "entry order is preserved");
  assert.equal(zip.entries[0].method, 0, "stored, not deflated");
  assert.equal(zip.entries[0].extraLen, 0, "no extra field");
  assert.equal(zip.entries[0].offset, 0, "the first entry starts at byte 0");
  assert.equal(text(zip, "mimetype"), "application/epub+zip");
  assert.equal(zip.entries[1].crc, crc32(new TextEncoder().encode("hallo")), "the entry CRC is the payload CRC");
  assert.equal(zip.entries[1].size, 5, "the size is the payload size");
  assert.equal(zip.eocd.count, 2, "the end of central directory counts both entries");
  assert.equal(zip.eocd.offset, zip.cdStart, "the central directory offset points at the directory");
  assert.equal(zip.eocd.size + zip.eocd.offset + 22, zip.size, "central directory + EOCD end the file");
  for (const c of zip.central) assert.equal(entry(zip, c.name).offset, c.localOffset, `central offset of ${c.name}`);
  assert.equal(zipStore([{ name: "a", data: "x" }]).length, zipStore([{ name: "a", data: "x" }]).length, "deterministic");
}

/* ---- 2. HTML → XHTML ------------------------------------------------------------------------------ */
assert.equal(htmlToXhtml("<p>x</p><hr><img src=\"a.png\" alt=\"b\">"), '<p>x</p><hr/><img src="a.png" alt="b"/>');
assert.equal(htmlToXhtml('<img src="a.png"/>'), '<img src="a.png"/>', "already closed stays closed (idempotent)");
assert.equal(htmlToXhtml("<br>"), "<br/>");
assert.ok(!/<(hr|img|br)(?![^>]*\/)>/i.test(htmlToXhtml("<hr><img src=x><br>")), "no void element is left open");
assert.equal(htmlToXhtml('<img src="a.png" alt="A & B"/>'), '<img src="a.png" alt="A & B"/>', "attributes are untouched");

/* ---- 3. rewriting for the reader ------------------------------------------------------------------ */
{
  const images = { "/content-assets/platzhalter.png": { href: "images/platzhalter.png" } };
  const out = rewriteForEpub('<p><a href="/de/writing/x">weiter</a></p><img src="/content-assets/platzhalter.png" alt="p"><img src="/content-assets/fehlt.png" alt="f">', { site: SITE, images });
  assert.ok(out.includes(`href="https://${SITE}/de/writing/x"`), "an internal link becomes an absolute URL");
  assert.ok(out.includes('src="images/platzhalter.png"'), "an available image is embedded");
  assert.ok(!out.includes("fehlt.png"), "an image without a local file is dropped instead of breaking the EPUB");
  assert.equal(checkWellFormed(`<div>${out}</div>`).ok, true, "the rewritten fragment stays well-formed");
}

/* ---- 4. identifier and metadata ------------------------------------------------------------------- */
{
  const id = epubIdentifier("chapter:kapitel-eins");
  assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, "a UUID-shaped, stable id");
  assert.equal(epubIdentifier("chapter:kapitel-eins"), id, "the same slug keeps its id");
  assert.notEqual(epubIdentifier("chapter:kapitel-zwei"), id, "a different slug gets a different id");
  assert.equal(id.length, 36, "36 characters, like a UUID");
}
assert.equal(modifiedStamp("2026-11-04"), "2026-11-04T00:00:00Z");
assert.equal(imageMediaType("cover.png"), "image/png");
assert.equal(imageMediaType("bild.SVG"), "image/svg+xml");
assert.equal(imageMediaType("x.xyz"), "application/octet-stream");
assert.equal(epubPath("kapitel-eins"), "/downloads/story-kapitel-eins.epub");
assert.equal(seriesEpubPath("die-serie"), "/downloads/series-die-serie.epub");

/* ---- 5. one chapter, end to end ------------------------------------------------------------------- */
{
  const ch = chapter({ title: "Kapitel eins – Ärger & Ümläute", html: "<p>ÄÖÜ &amp; &lt;tag&gt; „Zitat“.</p>\n<h2>Zweiter Teil</h2>\n<p>Mehr Text.</p>" });
  const bytes = epubOf(ch);
  const zip = readZip(bytes);

  assert.equal(entry(zip, "mimetype").offset, 0, "mimetype is the first entry");
  assert.equal(text(zip, "mimetype"), "application/epub+zip", "mimetype carries the EPUB media type");
  assert.equal(entry(zip, "mimetype").method, 0, "mimetype is stored, not compressed");
  assert.deepEqual(names(zip), [
    "mimetype",
    "META-INF/container.xml",
    "OEBPS/content.opf",
    "OEBPS/nav.xhtml",
    "OEBPS/titlepage.xhtml",
    "OEBPS/style.css",
    "OEBPS/chapter-1.xhtml",
  ]);

  const container = text(zip, "META-INF/container.xml");
  assert.ok(container.includes('full-path="OEBPS/content.opf"'), "container.xml points at the package document");
  assert.ok(container.includes('media-type="application/oebps-package+xml"'));

  const opf = text(zip, "OEBPS/content.opf");
  assert.ok(opf.includes('<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id"'), "EPUB 3 package document");
  assert.ok(opf.includes('<dc:title>Kapitel eins – Ärger &amp; Ümläute</dc:title>'), "the title is escaped in the metadata");
  assert.ok(opf.includes("<dc:language>de</dc:language>") && opf.includes('<dc:creator id="author">Nils</dc:creator>'), "language and author");
  assert.ok(opf.includes("<dc:rights>(c) Nils, nur zum persönlichen Lesen.</dc:rights>"), "the rights line is in the metadata");
  assert.ok(opf.includes('<meta property="dcterms:modified">2026-11-04T00:00:00Z</meta>'), "dcterms:modified is the chapter date, not the build time");
  assert.ok(opf.includes('<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>'), "the navigation document is declared as nav");
  assert.ok(opf.includes('<itemref idref="titlepage"/>') && opf.includes('<itemref idref="ch1"/>'), "the spine lists the title page and the chapter");

  // manifest completeness: every packaged file is declared, and every declaration exists
  const declared = [...opf.matchAll(/<item [^>]*href="([^"]+)"/g)].map((m) => m[1]);
  for (const name of names(zip)) {
    if (name === "mimetype" || name === "META-INF/container.xml" || name === "OEBPS/content.opf") continue;
    assert.ok(declared.includes(name.replace("OEBPS/", "")), `${name} is declared in the manifest`);
  }
  for (const href of declared) assert.ok(entry(zip, `OEBPS/${href}`), `the manifest href ${href} exists`);
  const ids = new Set([...opf.matchAll(/<item [^>]*id="([^"]+)"/g)].map((m) => m[1]));
  for (const m of opf.matchAll(/<itemref idref="([^"]+)"/g)) assert.ok(ids.has(m[1]), `the spine id ${m[1]} exists in the manifest`);

  // every packaged XML/XHTML file is well-formed
  for (const name of names(zip)) {
    if (!/\.(xhtml|opf|xml|css)$/.test(name)) continue;
    const content = text(zip, name);
    if (name.endsWith(".css")) continue;
    const check = checkWellFormed(content);
    assert.deepEqual(check.errors, [], `${name} is well-formed: ${check.errors.join("; ")}`);
    assert.ok(content.startsWith('<?xml version="1.0" encoding="utf-8"?>'), `${name} starts with the XML declaration`);
  }

  const nav = text(zip, "OEBPS/nav.xhtml");
  assert.ok(nav.includes('xmlns:epub="http://www.idpf.org/2007/ops"') && nav.includes('epub:type="toc"'), "the nav document is a toc");
  assert.ok(nav.includes('<a href="chapter-1.xhtml">Kapitel eins – Ärger &amp; Ümläute</a>'), "the toc links the chapter");

  const titlepage = text(zip, "OEBPS/titlepage.xhtml");
  assert.ok(titlepage.includes("(c) Nils, nur zum persönlichen Lesen."), "the rights line is on the title page");
  assert.ok(titlepage.includes("2026-11-04") && titlepage.includes("Nils"), "the title page names author and date");

  const body = text(zip, "OEBPS/chapter-1.xhtml");
  assert.ok(body.includes("ÄÖÜ &amp; &lt;tag&gt; „Zitat“"), "umlauts and entities survive");
  assert.ok(body.includes("<h2>Zweiter Teil</h2>"), "the rendered headings are kept");
  assert.ok(body.includes('xml:lang="de"') && body.includes('href="style.css"'), "language and stylesheet");
  assert.equal(checkWellFormed(body).ok, true, "the chapter is well-formed XHTML");

  assert.equal(epubOf(ch).length, bytes.length, "the same input produces the same bytes (deterministic)");
}

/* ---- 6. cover, images and the English rights line ------------------------------------------------- */
{
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
  const ch = chapter({ lang: "en", title: "Chapter one", html: '<p>Text</p><img src="/content-assets/bild.png" alt="b">' });
  const zip = readZip(epubOf(ch, { images: { "/content-assets/bild.png": { bytes: png, mediaType: "image/png" } }, cover: { bytes: png, mediaType: "image/png", name: "cover.png" } }));
  const opf = text(zip, "OEBPS/content.opf");
  assert.ok(entry(zip, "OEBPS/images/bild.png"), "the chapter image is packaged");
  assert.ok(opf.includes('href="images/bild.png" media-type="image/png"'), "the image is declared");
  assert.ok(entry(zip, "OEBPS/images/cover.png") && opf.includes('properties="cover-image"'), "the cover is packaged and declared as cover-image");
  assert.ok(opf.includes('<meta name="cover" content="cover-image"/>'), "the EPUB 2 cover hint is set");
  assert.ok(entry(zip, "OEBPS/cover.xhtml") && text(zip, "OEBPS/cover.xhtml").includes('src="images/cover.png"'), "the cover page shows the cover");
  assert.ok(opf.indexOf('<itemref idref="cover"/>') < opf.indexOf('<itemref idref="titlepage"/>'), "the cover is first in the spine");
  assert.ok(opf.includes("<dc:rights>(c) Nils, personal reading only.</dc:rights>"), "an English chapter gets the English rights line");
  assert.ok(!opf.includes("cover-image.png"), "no double extension");
}

/* ---- 7. no cover, no images: nothing extra is packaged -------------------------------------------- */
{
  const zip = readZip(epubOf(chapter()));
  assert.ok(!names(zip).some((n) => n.includes("cover")), "without a cover there is no cover file");
  assert.ok(!names(zip).some((n) => n.startsWith("OEBPS/images/")), "without images there is no image folder");
  assert.ok(!text(zip, "OEBPS/content.opf").includes("cover-image"), "no cover hint without a cover");
}

/* ---- 8. one EPUB per chapter and per series, none for blog --------------------------------------- */
{
  const files = [
    { file: "b.md", text: "---\ntitle: Blog\nslug: blog-eins\nkind: blog\ndate: 2026-11-07\nlang: de\n---\n\nText.\n" },
    { file: "c1.md", text: "---\ntitle: Kapitel eins\nslug: kap-eins\nkind: story\nseries: serie\nseries_title: Die Serie\nchapter: 1\ndate: 2026-11-04\nlang: de\n---\n\nText.\n" },
    { file: "c2.md", text: "---\ntitle: Kapitel zwei\nslug: kap-zwei\nkind: story\nseries: serie\nchapter: 2\ndate: 2026-11-05\nlang: de\n---\n\nText.\n" },
    { file: "c3.md", text: "---\ntitle: Kapitel drei (archiviert)\nslug: kap-drei\nkind: story\nseries: serie\nchapter: 3\ndate: 2026-11-06\narchived: true\nlang: de\n---\n\nText.\n" },
    { file: "d.md", text: "---\ntitle: Entwurf\nslug: entwurf\nkind: story\nseries: serie\nchapter: 4\ndate: 2026-11-08\ndraft: true\nlang: de\n---\n\nText.\n" },
  ];
  const { entries, errors } = analyze(files);
  assert.deepEqual(errors, []);
  const { writing, series } = toIndex(entries, renderMarkdown);
  const epubs = buildEpubs({ writing, series, site: SITE, rights: RIGHTS, readImage: () => null });

  assert.deepEqual(epubs.map((e) => e.path), [
    "/downloads/series-serie.epub",
    "/downloads/story-kap-eins.epub",
    "/downloads/story-kap-zwei.epub",
  ], "one file per published chapter and one for the series — and nothing for the blog post");
  assert.ok(epubs.every((e) => e.bytes.length > 200), "every export has content");
  assert.ok(!epubs.some((e) => e.path.includes("blog")), "a blog post gets no export");
  assert.ok(!epubs.some((e) => e.path.includes("kap-drei") || e.path.includes("entwurf")), "archived and draft chapters are not exported");

  // Every produced EPUB carries the mandatory metadata (a missing language or date makes it invalid).
  for (const epub of epubs) {
    const opf = text(readZip(epub.bytes), "OEBPS/content.opf");
    assert.ok(/<dc:language>de<\/dc:language>/.test(opf), `${epub.path} declares its language`);
    assert.ok(/<dc:date>\d{4}-\d{2}-\d{2}<\/dc:date>/.test(opf), `${epub.path} declares a date`);
    assert.ok(/<meta property="dcterms:modified">\d{4}-\d{2}-\d{2}T00:00:00Z<\/meta>/.test(opf), `${epub.path} declares dcterms:modified`);
    assert.ok(/<dc:rights>\(c\) Nils/.test(opf), `${epub.path} carries the rights line`);
    assert.ok(/<dc:title>[^<]+<\/dc:title>/.test(opf), `${epub.path} has a title`);
    assert.ok(/<dc:identifier id="pub-id">urn:uuid:[0-9a-f-]{36}<\/dc:identifier>/.test(opf), `${epub.path} has a stable identifier`);
  }

  const seriesZip = readZip(epubs.find((e) => e.kind === "series").bytes);
  const seriesOpf = text(seriesZip, "OEBPS/content.opf");
  assert.ok(seriesOpf.includes("<dc:title>Die Serie</dc:title>"), "the series EPUB is titled after the series");
  assert.ok(seriesOpf.includes("chapter-1.xhtml") && seriesOpf.includes("chapter-2.xhtml"), "the series EPUB has both chapters");
  assert.ok(!seriesOpf.includes("chapter-3.xhtml"), "the series EPUB has no archived chapter");
  assert.ok(seriesOpf.indexOf("chapter-1.xhtml") < seriesOpf.indexOf("chapter-2.xhtml"), "chapters are in reading order");
  assert.ok(seriesOpf.includes("<dc:date>2026-11-05</dc:date>"), "the series date is the newest chapter");
  assert.ok(text(seriesZip, "OEBPS/nav.xhtml").includes("Kapitel zwei"), "the toc lists the chapters");
  assert.deepEqual(checkWellFormed(seriesOpf).errors, [], "the series package document is well-formed");

  // deterministic across two builds, and an index without stories produces nothing
  assert.equal(JSON.stringify(buildEpubs({ writing, series, site: SITE, rights: RIGHTS }).map((e) => e.bytes.length)), JSON.stringify(epubs.map((e) => e.bytes.length)));
  assert.deepEqual(buildEpubs({ writing: writing.filter((w) => w.kind === "blog"), series: [], site: SITE, rights: RIGHTS }), [], "no story, no export");
}

console.log("epub-unit ok");
