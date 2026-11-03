---
title: TEST FIXTURE Unsafe markup
slug: test-fixture-unsafe
kind: blog
date: 2026-10-15
tags: [fixtures, security]
lang: de
summary: Platzhalter mit bösartigem Markup, um die Escapes zu prüfen.
---

Roh-HTML muss als Text erscheinen: <script>alert("xss")</script> und <img src=x onerror=alert(1)>.

Ein Link mit unerlaubtem Schema: [klick mich](javascript:alert(1)) und [noch einer](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==).

Ein verschachtelter Versuch: <a href="javascript:void(0)" onclick="alert(2)"><b>Text</b></a>.

Bilder: ![ok](/content-assets/placeholder.svg) und ![boese](https://evil.example/remote.png) und ![data](javascript:alert(3)).

Inline-Code mit Markup: `<b>nicht fett</b>`.

```html
<script>alert(4)</script>
```

Eine sehr lange Zeile folgt, damit der Renderer nicht stolpert: aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa

| Pipe | Tabelle | die es nicht gibt |
