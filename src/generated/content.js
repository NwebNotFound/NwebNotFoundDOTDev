// AUTOMATISCH ERZEUGT von scripts/build-content.mjs – nicht von Hand bearbeiten.
// Quelle: scripts\fixtures\content (8 Datei(en))
export const CONTENT = {
  "generator": "scripts/build-content.mjs",
  "writing": [
    {
      "slug": "test-fixture-hello",
      "kind": "blog",
      "title": "TEST FIXTURE Hello world",
      "date": "2026-11-03",
      "updated": null,
      "tags": [
        "fixtures",
        "test"
      ],
      "draft": false,
      "archived": false,
      "lang": "de",
      "summary": "Platzhalter-Beitrag für Tests (kein echter Inhalt).",
      "cover": null,
      "series": null,
      "seriesTitle": null,
      "chapter": null,
      "wordCount": 59,
      "readingMinutes": 1,
      "html": "<p>Dies ist ein <strong>Test-Platzhalter</strong>, kein echter Beitrag. Nils schreibt die echten Texte selbst.</p>\n<h2>Eine Zwischenüberschrift</h2>\n<p>Ein Absatz mit <em>kursiv</em>, <strong>fett</strong> und einem <a href=\"/de/writing\">internen Link</a>.</p>\n<h3>Noch tiefer</h3>\n<ul><li>erster Punkt</li><li>zweiter Punkt<ul><li>verschachtelter Punkt</li><li>noch einer</li></ul></li></ul>\n<ol><li>eins</li><li>zwei</li></ol>\n<blockquote><p>Ein Zitat über einen Platzhalter.</p></blockquote>\n<p><code>inline code</code> und ein Block:</p>\n<pre><code class=\"language-js\">const fixture = true;</code></pre>\n<hr>\n<p><img src=\"/content-assets/placeholder.svg\" alt=\"Platzhalterbild\" title=\"Testbild\" loading=\"lazy\" decoding=\"async\"></p>"
    },
    {
      "slug": "test-fixture-english",
      "kind": "blog",
      "title": "TEST FIXTURE English post",
      "date": "2026-11-02",
      "updated": null,
      "tags": [
        "fixtures"
      ],
      "draft": false,
      "archived": false,
      "lang": "en",
      "summary": "A placeholder post written in English.",
      "cover": null,
      "series": null,
      "seriesTitle": null,
      "chapter": null,
      "wordCount": 24,
      "readingMinutes": 1,
      "html": "<p>This is a <strong>test placeholder</strong>, not real content. It exists so the original-language notice (&quot;Original in English&quot; in the German UI) can be tested.</p>"
    },
    {
      "slug": "test-fixture-unsafe",
      "kind": "blog",
      "title": "TEST FIXTURE Unsafe markup",
      "date": "2026-10-15",
      "updated": null,
      "tags": [
        "fixtures",
        "security"
      ],
      "draft": false,
      "archived": false,
      "lang": "de",
      "summary": "Platzhalter mit bösartigem Markup, um die Escapes zu prüfen.",
      "cover": null,
      "series": null,
      "seriesTitle": null,
      "chapter": null,
      "wordCount": 95,
      "readingMinutes": 1,
      "html": "<p>Roh-HTML muss als Text erscheinen: &lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; und &lt;img src=x onerror=alert(1)&gt;.</p>\n<p>Ein Link mit unerlaubtem Schema: klick mich und noch einer.</p>\n<p>Ein verschachtelter Versuch: &lt;a href=&quot;javascript:void(0)&quot; onclick=&quot;alert(2)&quot;&gt;&lt;b&gt;Text&lt;/b&gt;&lt;/a&gt;.</p>\n<p>Bilder: <img src=\"/content-assets/placeholder.svg\" alt=\"ok\" loading=\"lazy\" decoding=\"async\"> und  und .</p>\n<p>Inline-Code mit Markup: <code>&lt;b&gt;nicht fett&lt;/b&gt;</code>.</p>\n<pre><code class=\"language-html\">&lt;script&gt;alert(4)&lt;/script&gt;</code></pre>\n<p>Eine sehr lange Zeile folgt, damit der Renderer nicht stolpert: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa</p>\n<p>| Pipe | Tabelle | die es nicht gibt |</p>"
    },
    {
      "slug": "test-fixture-older",
      "kind": "blog",
      "title": "TEST FIXTURE Older post",
      "date": "2026-10-01",
      "updated": null,
      "tags": [
        "fixtures"
      ],
      "draft": false,
      "archived": false,
      "lang": "de",
      "summary": null,
      "cover": null,
      "series": null,
      "seriesTitle": null,
      "chapter": null,
      "wordCount": 10,
      "readingMinutes": 1,
      "html": "<p>Ein älterer Platzhalter, damit die Sortierung (neueste zuerst) testbar ist.</p>"
    },
    {
      "slug": "test-fixture-chapter-3",
      "kind": "story",
      "title": "TEST FIXTURE Chapter three (archived)",
      "date": "2026-09-15",
      "updated": null,
      "tags": [
        "fixtures"
      ],
      "draft": false,
      "archived": true,
      "lang": "de",
      "summary": null,
      "cover": null,
      "series": "test-fixture-serie",
      "seriesTitle": null,
      "chapter": 3,
      "wordCount": 24,
      "readingMinutes": 1,
      "html": "<p>Drittes Kapitel des Test-Platzhalters, <code>archived: true</code>: es steht nicht mehr in der Kapitelliste, ist aber über den direkten Link erreichbar und zeigt einen Hinweis.</p>"
    },
    {
      "slug": "test-fixture-chapter-2",
      "kind": "story",
      "title": "TEST FIXTURE Chapter two",
      "date": "2026-09-08",
      "updated": null,
      "tags": [
        "fixtures"
      ],
      "draft": false,
      "archived": false,
      "lang": "de",
      "summary": null,
      "cover": null,
      "series": "test-fixture-serie",
      "seriesTitle": null,
      "chapter": 2,
      "wordCount": 13,
      "readingMinutes": 1,
      "html": "<p>Zweites Kapitel des Test-Platzhalters.</p>\n<h3>Unterabschnitt</h3>\n<ul><li>Punkt eins</li><li>Punkt zwei</li></ul>\n<p><img src=\"/content-assets/placeholder.svg\" alt=\"Testbild\" loading=\"lazy\" decoding=\"async\"></p>"
    },
    {
      "slug": "test-fixture-chapter-1",
      "kind": "story",
      "title": "TEST FIXTURE Chapter one",
      "date": "2026-09-01",
      "updated": null,
      "tags": [
        "fixtures",
        "fiction"
      ],
      "draft": false,
      "archived": false,
      "lang": "de",
      "summary": null,
      "cover": null,
      "series": "test-fixture-serie",
      "seriesTitle": "Test Fixture Series",
      "chapter": 1,
      "wordCount": 31,
      "readingMinutes": 1,
      "html": "<p>Erstes Kapitel eines <strong>Test-Platzhalters</strong>. Kein echter Text.</p>\n<h2>Szene</h2>\n<p>Der Platzhalter steht am Fenster und schaut auf ein anderes Platzhalter-Fenster.</p>\n<blockquote><p>Ein Absatz direkt aus der Serie.</p></blockquote>\n<p>Nächstes Kapitel: <a href=\"/de/writing/test-fixture-chapter-2\">weiter</a>.</p>"
    }
  ],
  "series": [
    {
      "slug": "test-fixture-serie",
      "title": "Test Fixture Series",
      "chapters": [
        "test-fixture-chapter-1",
        "test-fixture-chapter-2",
        "test-fixture-chapter-3"
      ],
      "count": 3
    }
  ]
};
