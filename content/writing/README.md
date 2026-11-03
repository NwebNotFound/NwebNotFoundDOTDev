# Inhalt: Texte (`content/writing/`)

Hier liegen die Texte der Seite `/writing`. Es gibt **einen** Inhaltstyp `writing` mit dem Feld
`kind`:

- `kind: blog` – ein datierter Blog-Beitrag.
- `kind: story` – ein Kapitel einer Serie (`series` + `chapter`).

Jede Datei ist Markdown mit einem kleinen YAML-Kopf (Front Matter). Der Build liest alle
`*.md`-Dateien unter diesem Ordner (auch in Unterordnern, z. B. `content/writing/<serie>/01-…md`),
validiert sie und rendert sie zu HTML. Der Worker parst zur Laufzeit **kein** Markdown.

> **Nichts hier sind fertige Texte.** Nils schreibt die Geschichten und Beiträge selbst. Diese Datei
> ist nur die Format-Dokumentation; der Ordner enthält bewusst keinen Inhalt. Für Tests gibt es
> Platzhalter unter `scripts/fixtures/content/`.

## Veröffentlichen

1. Datei anlegen: `content/writing/<slug>.md` (oder `content/writing/<serie>/<nn>-<slug>.md`).
2. Front Matter und Text schreiben (siehe unten).
3. `node scripts/build-content.mjs` lokal ausführen – es bricht mit einer klaren Fehlermeldung ab,
   wenn etwas fehlt oder doppelt ist.
4. Branch + Pull Request. Nach dem Merge baut `scripts/deploy.sh` den Inhalt automatisch neu.

Gelöschte Dateien verschwinden beim nächsten Build aus der Seite. **Vor dem Löschen von Inhalten
fragt Nils Bescheid** – es geht um Spielerdaten/Inhalte, nicht nur um Code.

## Front Matter

| Feld | Pflicht | Typ | Bedeutung |
|---|---|---|---|
| `title` | ja | Text | Überschrift des Beitrags/Kapitels |
| `slug` | ja | Text | URL-Teil: Kleinschreibung, Wörter mit einzelnen Bindestrichen |
| `kind` | ja | `story` \| `blog` | Art des Inhalts |
| `date` | ja | Datum | Veröffentlichungsdatum, `YYYY-MM-DD` (echter Kalendertag) |
| `updated` | nein | Datum | Letzte Änderung, `YYYY-MM-DD`, nicht vor `date` |
| `tags` | nein | Liste | Stichworte, z. B. `[fantasy, kurze-geschichte]` |
| `draft` | nein | bool | `true` = niemals sichtbar (auch nicht über den Link) |
| `archived` | nein | bool | `true` = nicht in der Liste, aber über den direkten Link erreichbar (mit Hinweis) |
| `lang` | ja | `de` \| `en` | Sprache, in der der Text geschrieben ist (Original) |
| `summary` | nein | Text | Kurzbeschreibung für Liste/Suchmaschine; sonst der Textanfang |
| `cover` | nein | Pfad | Nur ein Pfad unter `/content-assets/` – in Phase 3a noch ungenutzt |
| `series` | nur `story` | Text | Slug der Serie (Kleinschreibung, Bindestriche) |
| `chapter` | nur `story` | Zahl | Kapitelnummer, ganze Zahl ≥ 1 |
| `series_title` | nein | Text | Lesbarer Serientitel (sonst der Serien-Slug) |

`kind: story` braucht `series` und `chapter`; `kind: blog` darf sie nicht setzen. Doppelte `slug`s
und doppelte `chapter`-Nummern innerhalb einer Serie lehnt der Build ab.

## Beispiele

Blog-Beitrag (Deutsch):

```markdown
---
title: Mein erster Beitrag
slug: mein-erster-beitrag
kind: blog
date: 2026-11-03
tags: [notizen]
draft: false
archived: false
lang: de
summary: Kurz, worum es geht.
---

Erster Absatz.

## Zwischenüberschrift

Noch ein Absatz mit *Betonung*, **fett** und einem [Link](https://example.org).
```

Story-Kapitel (Englisch, Teil einer Serie):

```markdown
---
title: The harbour at dawn
slug: harbour-at-dawn
kind: story
series: a-summer-story
series_title: A Summer Story
chapter: 1
date: 2026-11-03
tags: [fiction]
draft: true
archived: false
lang: en
---

The story starts here.
```

## Markdown, das unterstützt wird

Absätze, Überschriften (`##`, `###`, `####`), *kursiv* / **fett**, Links `[Text](url)`,
Bilder `![alt](/content-assets/…)`, Listen (geordnet/ungeordnet, verschachtelt),
Zitate (`>`), Code (`` `inline` `` und ```` ```lang ````-Blöcke) und horizontale Linien (`---`).

Sicherheit: Rohes HTML im Markdown wird **escaped** und nie durchgereicht. Links sind nur
`http(s)`, `mailto` oder relativ erlaubt – `javascript:` und `data:` werden entfernt. Externe Links
bekommen `rel="noopener noreferrer"`. Bilder nur als `<img>` mit `alt` und nur von Pfaden unter
`/content-assets/` (Phase 3a: keine externen Bild-Hosts). Anführungszeichen werden nicht
automatisch „verschönert“.

Bilder für Texte liegen unter `public/content-assets/` und werden im Markdown als
`![Alt-Text](/content-assets/dateiname.png)` eingebunden. In Phase 3a gibt es dort nur
`placeholder.svg` als Test-Platzhalter (für die Fixture-Seiten).

## Feeds und Exporte (Phase 3b/3c)

Derselbe Build (`node scripts/build-content.mjs`) erzeugt zwei Dinge zusätzlich:

- **Feeds** unter `/writing/feed.xml` (RSS) und `/writing/atom.xml` (Atom), dazu je Art
  (`/writing/blog/…`, `/writing/stories/…`) und je Serie (`/writing/series/<serie>/…`). Nur
  veröffentlichte Texte (kein `draft`, kein `archived`), die neuesten 30, Sprache = Sprache des
  Inhalts. Blog-Beiträge enthalten den vollen Text, Story-Kapitel einen Auszug plus Link.
- **EPUB-Downloads** je Story-Kapitel (`/downloads/story-<slug>.epub`) und je Serie
  (`/downloads/series-<slug>.epub`, alle nicht-archivierten Kapitel in Reihenfolge). Blog-Beiträge
  bekommen bewusst keinen Download. Die Dateien entstehen bei jedem Build neu unter
  `public/downloads/` und sind **nicht** eingecheckt (siehe `.gitignore`); ein gelöschtes Kapitel
  verschwindet beim nächsten Build auch als Download.

Für PDF gibt es keinen eigenen Erzeuger: Story-Seiten haben eine Druckansicht
(`@media print` in `public/design/summer.css`) und einen „Als PDF drucken“-Button, der den
Browser-Druckdialog öffnet – dort „Als PDF speichern“ wählen.
