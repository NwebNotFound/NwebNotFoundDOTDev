import assert from 'node:assert/strict';
import { WIKI, wikiArticleBody } from '../src/mc-hub.js';

const article = WIKI.find((x) => x.slug === 'economy');
const html = wikiArticleBody(article, 'mc.example.test');
// Desktop keeps the sidebar; phones get a horizontal chip row. Both carry the same links.
assert.match(html, /<nav class="wside g wside-desktop"[^>]*aria-label="Wiki-Artikel"/);
assert.match(html, /<nav class="wside-chips"[^>]*aria-label="Wiki-Artikel"/);
assert.equal(html.includes('<details'), false, 'no disclosure widget: the phone nav is a chip row');
assert.equal((html.match(/href="\/wiki"/g) || []).length >= 2, true, 'overview available in navigation');
for (const entry of WIKI) {
  assert.equal((html.match(new RegExp(`href="/wiki/${entry.slug}"`, 'g')) || []).length, 2, `${entry.slug}: desktop and phone navigation`);
}
assert.equal((html.match(/href="\/wiki\/economy" aria-current="page"/g) || []).length, 2, 'current article marked in both navigations');
// The chip row scrolls with snap and hides its scrollbar; the sidebar gets a themed thin one.
assert.match(html, /\.wside-chips\{[^}]*scroll-snap-type:x proximity[^}]*scrollbar-width:none/);
assert.match(html, /\.wside-chips a\{[^}]*scroll-snap-align:start/);
assert.match(html, /\.wside-chips::-webkit-scrollbar\{display:none/);
assert.match(html, /\.wside\{[^}]*scrollbar-width:thin/);
assert.match(html, /@media\(max-width:899px\)\{\.wside-desktop\{display:none\}html\.mc \.wside-chips\{display:flex\}\}/);
assert.match(html, /<article class="g pad wk">/);
console.log('mc-wiki-unit ok');
