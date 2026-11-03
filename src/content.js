// Content model for the Creative Hub "writing" section (docs/creative-hub-plan.md §0 "Decisions,
// round 3", §4.1, §8 "Writing").
//
// One content type `writing` with `kind` = story | blog. Markdown lives in content/writing/*.md with a
// YAML-subset front matter that is parsed here by hand (no dependency). This module is pure and
// dependency-free, so the build script, the unit tests and the Worker (for filtering the prebuilt
// index) can all use it.
//
// Front matter (all keys are case-sensitive):
//   title         required, non-empty
//   slug          required, lowercase words separated by single hyphens
//   kind          required, "story" or "blog"
//   date          required, YYYY-MM-DD (a real calendar day)
//   updated       optional, YYYY-MM-DD, not before `date`
//   tags          optional list of non-empty strings
//   draft         optional bool (default false) — never visible, not even by direct link
//   archived      optional bool (default false) — hidden from the list, reachable by direct link
//   lang          required, "de" or "en" (the language the text was written in)
//   summary       optional short description (used for meta/excerpt instead of the body)
//   cover         optional path under /content-assets/ (parsed and validated, unused in phase 3a)
//   series        required for kind=story, a slug
//   chapter       required for kind=story, a positive whole number
//   series_title  optional for kind=story, the readable series name
export const KIND_STORY = "story";
export const KIND_BLOG = "blog";
export const KINDS = [KIND_STORY, KIND_BLOG];
export const CONTENT_LANGS = ["de", "en"];
export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const WORDS_PER_MINUTE = 200;

/** True only for a real calendar day (`2026-02-30` is rejected). */
export function isValidDate(value) {
  if (!DATE_RE.test(String(value ?? ""))) return false;
  const [y, m, d] = String(value).split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export const countWords = (text) => (String(text ?? "").match(/[\p{L}\p{N}]+(?:['\u2019-][\p{L}\p{N}]+)*/gu) || []).length;

/** Reading time in whole minutes (>= 1) at WORDS_PER_MINUTE. */
export const readingTimeMinutes = (text) => Math.max(1, Math.ceil(countWords(text) / WORDS_PER_MINUTE));

const unquote = (raw) => {
  const s = String(raw ?? "").trim();
  if (/^".*"$/.test(s)) return s.slice(1, -1).replace(/\\"/g, '"');
  if (/^'.*'$/.test(s)) return s.slice(1, -1).replace(/''/g, "'");
  return s;
};

/** A scalar value: bool, number, inline `[a, b]` list, quoted or plain string. */
function parseScalar(raw) {
  const s = raw.trim();
  if (s === "true") return true;
  if (s === "false") return false;
  if (s === "" || s === "~" || s === "null") return null;
  if (s.startsWith("[") && s.endsWith("]")) {
    const inner = s.slice(1, -1).trim();
    if (inner === "") return [];
    return inner.split(",").map((x) => unquote(x)).filter((x) => x !== "");
  }
  if (/^-?\d+$/.test(s)) return Number(s);
  return unquote(s);
}

/** Parse the YAML subset used by `content/`. Throws with a readable message on a broken block. */
function parseYamlBlock(lines, baseLine) {
  const out = {};
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*$/.test(line) || /^\s*#/.test(line)) {
      i++;
      continue;
    }
    const m = /^([A-Za-z][A-Za-z0-9_-]*):(?:\s*(.*))?$/.exec(line);
    if (!m) throw new Error(`front matter line ${baseLine + i} is not "key: value": "${line}"`);
    const key = m[1];
    if (Object.prototype.hasOwnProperty.call(out, key)) throw new Error(`duplicate front matter key "${key}" (line ${baseLine + i})`);
    const raw = (m[2] ?? "").trim();
    if (raw === "") {
      const items = [];
      let j = i + 1;
      while (j < lines.length && /^\s*-\s+/.test(lines[j])) items.push(unquote(lines[j++].replace(/^\s*-\s+/, "")));
      if (items.length) {
        out[key] = items;
        i = j;
        continue;
      }
      out[key] = null;
      i++;
      continue;
    }
    out[key] = parseScalar(raw);
    i++;
  }
  return out;
}

/**
 * Split a document into `{ data, body }`. The front matter must open and close with a `---` line.
 * Throws an Error with a readable message (the caller prefixes the file name).
 */
export function parseFrontMatter(text) {
  const lines = String(text ?? "").replace(/\r\n?/g, "\n").split("\n");
  if ((lines[0] ?? "").trim() !== "---") throw new Error("front matter must start with a '---' line");
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error("front matter is not closed with a '---' line");
  const data = parseYamlBlock(lines.slice(1, end), 2);
  const body = lines
    .slice(end + 1)
    .join("\n")
    .replace(/^\n+/, "")
    .replace(/\s+$/, "");
  return { data, body };
}

/**
 * Validate parsed front matter. Returns `{ problems, item }`; `item` is the normalised record (its
 * `body`/`html`/reading time are added later by `analyze`). Every problem is a readable sentence.
 */
export function normalizeItem(data, { file = null } = {}) {
  const problems = [];
  const str = (v) => (v === undefined || v === null ? null : String(v).trim());

  const title = str(data.title);
  if (!title) problems.push("missing required field: title");

  const slug = str(data.slug);
  if (!slug) problems.push("missing required field: slug");
  else if (!SLUG_RE.test(slug)) problems.push(`invalid slug "${slug}" (lowercase words separated by single hyphens)`);

  const kind = str(data.kind);
  if (!kind) problems.push("missing required field: kind");
  else if (!KINDS.includes(kind)) problems.push(`invalid kind "${kind}" (expected story or blog)`);

  const date = str(data.date);
  if (!date) problems.push("missing required field: date");
  else if (!isValidDate(date)) problems.push(`invalid date "${date}" (expected a real YYYY-MM-DD day)`);

  const updated = str(data.updated);
  if (updated === "") problems.push("updated must not be empty");
  else if (updated !== null && !isValidDate(updated)) problems.push(`invalid updated date "${updated}" (expected a real YYYY-MM-DD day)`);
  else if (updated && isValidDate(date) && updated < date) problems.push(`updated (${updated}) is before date (${date})`);

  const lang = str(data.lang);
  if (!lang) problems.push("missing required field: lang");
  else if (!CONTENT_LANGS.includes(lang)) problems.push(`invalid lang "${lang}" (expected de or en)`);

  const tags = [];
  if (data.tags !== undefined && data.tags !== null) {
    if (!Array.isArray(data.tags)) problems.push("tags must be a list");
    else for (const raw of data.tags) {
      const tag = str(raw);
      if (!tag) problems.push("tags must not contain empty entries");
      else if (!tags.includes(tag)) tags.push(tag);
    }
  }

  const bool = (value, name) => {
    if (value === undefined || value === null || value === "") return false;
    if (value === true || value === "true") return true;
    if (value === false || value === "false") return false;
    problems.push(`${name} must be true or false`);
    return false;
  };
  const draft = bool(data.draft, "draft");
  const archived = bool(data.archived, "archived");

  let series = null;
  let chapter = null;
  let seriesTitle = null;
  if (kind === KIND_STORY) {
    series = str(data.series);
    if (!series) problems.push("kind=story requires a series");
    else if (!SLUG_RE.test(series)) problems.push(`invalid series slug "${series}" (lowercase words separated by single hyphens)`);
    if (data.chapter === undefined || data.chapter === null || data.chapter === "") problems.push("kind=story requires a chapter number");
    else {
      const n = Number(data.chapter);
      if (!Number.isInteger(n) || n < 1) problems.push(`chapter must be a positive whole number (got "${data.chapter}")`);
      else chapter = n;
    }
    seriesTitle = str(data.series_title);
  } else if (kind === KIND_BLOG) {
    for (const field of ["series", "chapter", "series_title"]) {
      if (data[field] !== undefined && data[field] !== null && data[field] !== "") problems.push(`kind=blog must not set ${field}`);
    }
  }

  const summary = str(data.summary);
  const cover = str(data.cover);
  if (cover && !cover.startsWith("/content-assets/")) problems.push(`cover must be a path under /content-assets/ (got "${cover}")`);

  const item = {
    file,
    title,
    slug,
    kind,
    date,
    updated: updated || null,
    tags,
    draft,
    archived,
    lang,
    summary,
    cover,
    series,
    chapter,
    seriesTitle,
  };
  return { problems, item };
}

/**
 * Parse and validate a set of `{ file, text }` documents. Detects the cross-file problems
 * (duplicate slugs, duplicate chapter numbers inside one series) and returns `{ entries, errors }`.
 * Errors carry the file name; a file with errors is dropped from `entries`.
 */
export function analyze(files) {
  const errors = [];
  const entries = [];
  const bySlug = new Map();
  const chapters = new Map();
  for (const { file, text } of files) {
    let parsed;
    try {
      parsed = parseFrontMatter(text);
    } catch (e) {
      errors.push(`${file}: ${e.message}`);
      continue;
    }
    const { problems, item } = normalizeItem(parsed.data, { file });
    if (problems.length) {
      for (const p of problems) errors.push(`${file}: ${p}`);
      continue;
    }
    item.body = parsed.body;
    item.wordCount = countWords(parsed.body);
    item.readingMinutes = readingTimeMinutes(parsed.body);
    if (bySlug.has(item.slug)) errors.push(`${file}: duplicate slug "${item.slug}" (also in ${bySlug.get(item.slug).file})`);
    else bySlug.set(item.slug, item);
    if (item.kind === KIND_STORY) {
      if (!chapters.has(item.series)) chapters.set(item.series, new Map());
      const seen = chapters.get(item.series);
      if (seen.has(item.chapter)) errors.push(`${file}: duplicate chapter ${item.chapter} in series "${item.series}" (also in ${seen.get(item.chapter).file})`);
      else seen.set(item.chapter, item);
    }
    entries.push(item);
  }
  return { entries, errors };
}

/** Newest first; a stable tie-break by slug keeps the generated file deterministic. */
export const byNewest = (a, b) => (a.date === b.date ? a.slug.localeCompare(b.slug) : a.date < b.date ? 1 : -1);

/**
 * Turn analysed entries into the serialisable index: `{ writing, series }`.
 * `render` is the Markdown renderer (injected so tests can pass an identity function).
 * Drafts are dropped here, so an unpublished text never reaches the deployed bundle at all
 * ("draft: not even by direct link", docs/creative-hub-plan.md §0/§4.1).
 */
export function toIndex(entries, render = (md) => md) {
  const writing = entries
    .filter((e) => !e.draft)
    .map((e) => ({
      slug: e.slug,
      kind: e.kind,
      title: e.title,
      date: e.date,
      updated: e.updated,
      tags: e.tags.slice(),
      draft: e.draft,
      archived: e.archived,
      lang: e.lang,
      summary: e.summary,
      cover: e.cover,
      series: e.series,
      seriesTitle: e.seriesTitle,
      chapter: e.chapter,
      wordCount: e.wordCount,
      readingMinutes: e.readingMinutes,
      html: render(e.body),
    }))
    .sort(byNewest);

  const grouped = new Map();
  for (const w of writing) {
    if (w.kind !== KIND_STORY || !w.series) continue;
    if (!grouped.has(w.series)) grouped.set(w.series, []);
    grouped.get(w.series).push(w);
  }
  const series = [...grouped.entries()].map(([slug, chapters]) => {
    const ordered = chapters.slice().sort((a, b) => a.chapter - b.chapter || a.slug.localeCompare(b.slug));
    return { slug, title: ordered.find((c) => c.seriesTitle)?.seriesTitle || slug, chapters: ordered.map((c) => c.slug), count: ordered.length };
  });
  return { writing, series };
}

/* ---- query helpers used by the Worker and the tests (pure, no rendering) ---------------------- */

/** Draft items never appear anywhere; archived items leave the list but stay reachable. */
export const isVisible = (item) => !item.draft && !item.archived;
export const isReachable = (item) => !item.draft;

export const publishedWriting = (writing) => (writing || []).filter(isVisible);
export const reachableWriting = (writing) => (writing || []).filter(isReachable);

export const findWriting = (writing, slug) => (writing || []).find((w) => w.slug === slug && isReachable(w)) || null;

export function filterWriting(writing, { kind = "", tag = "" } = {}) {
  return (writing || []).filter((w) => (kind ? w.kind === kind : true) && (tag ? w.tags.includes(tag) : true));
}

/** Every tag used by a set of items, sorted and de-duplicated (case-insensitive on the label). */
export function allTags(writing) {
  const seen = new Map();
  for (const w of writing || []) for (const tag of w.tags) if (!seen.has(tag.toLowerCase())) seen.set(tag.toLowerCase(), tag);
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

/** Chapters of a series, lowest chapter first, including archived ones (drafts excluded). */
export function chaptersOf(writing, seriesSlug) {
  return reachableWriting(writing)
    .filter((w) => w.kind === KIND_STORY && w.series === seriesSlug)
    .sort((a, b) => a.chapter - b.chapter || a.slug.localeCompare(b.slug));
}

/** Previous / next chapter of the same series (archived chapters count as neighbours). */
export function prevNext(writing, item) {
  if (!item || item.kind !== KIND_STORY || !item.series) return { prev: null, next: null };
  const chapters = chaptersOf(writing, item.series);
  const i = chapters.findIndex((c) => c.slug === item.slug);
  return { prev: i > 0 ? chapters[i - 1] : null, next: i >= 0 && i < chapters.length - 1 ? chapters[i + 1] : null };
}

/** Excerpt: the summary if given, otherwise the first ~180 characters of the rendered body. */
export function excerpt(item, htmlToText, limit = 180) {
  if (!item) return "";
  if (item.summary) return item.summary;
  const text = htmlToText ? htmlToText(item.html) : String(item.html || "").replace(/<[^>]*>/g, " ");
  return text.length > limit ? `${text.slice(0, limit).replace(/\s+\S*$/, "")}\u2026` : text;
}
