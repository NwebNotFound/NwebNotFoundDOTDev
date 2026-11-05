import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { renderInventoryCard } from '../src/mc-inventory.js';

const cssFiles = ['public/design/minecraft.css', 'public/mc/ds.css', 'public/mc/theme-v2.css', 'public/mc/profile.css'];
const css = (await Promise.all(cssFiles.map((p) => readFile(p, 'utf8')))).join('\n');
const inventory = [{item:'diamond',count:64,slot:9},{item:'bread',count:32,slot:0},{item:'diamond_helmet',count:1,slot:39},{item:'shield',count:1,slot:40},{item:'oak_log',count:48,slot:17},{item:'cobblestone',count:64,slot:27}];
const html = `<!doctype html><html class="mc"><head><style>${css}\nhtml,body{margin:0}#pb{width:min(860px,calc(100% - 32px));margin:auto}</style></head><body><div id="pb">${renderInventoryCard(inventory)}</div></body></html>`;
const browser = await chromium.launch();
try {
  for (const width of [375, 390, 1280]) {
    const page = await browser.newPage({viewport:{width,height:900}, reducedMotion:'reduce'});
    await page.setContent(html);
    const d = await page.evaluate(() => {
      const box = (e) => { const b=e.getBoundingClientRect(); return {x:b.x,y:b.y,w:b.width,h:b.height,right:b.right,bottom:b.bottom,cx:b.x+b.width/2,cy:b.y+b.height/2}; };
      const slots = [...document.querySelectorAll('.inv .ivs')];
      const first = document.querySelector('.ivs img');
      const count = document.querySelector('.ivs b');
      const uniq = (a) => [...new Set(a.map(v => Math.round(v)))];
      return {
        overflow: document.documentElement.scrollWidth - innerWidth,
        slots: slots.map(box),
        card: box(document.querySelector('.inv')),
        pane: box(document.querySelector('.iv-pane')),
        armor: [...document.querySelectorAll('.iv-arm .ivs')].map(box),
        main: [...document.querySelectorAll('.ivg:not(.hot) .ivs')].map(box),
        hot: [...document.querySelectorAll('.ivg.hot .ivs')].map(box),
        off: box(document.querySelector('.iv-off .ivs')),
        count: box(count),
        countSlot: box(count.closest('.ivs')),
        countFont: getComputedStyle(count).fontFamily,
        pxToken: getComputedStyle(document.documentElement).getPropertyValue('--f-px').trim(),
        icon: box(first), iconSlot: box(first.closest('.ivs')),
        mainRows: uniq([...document.querySelectorAll('.ivg:not(.hot) .ivs')].map(e => e.getBoundingClientRect().y)).length,
        mainCols: uniq([...document.querySelectorAll('.ivg:not(.hot) .ivs')].map(e => e.getBoundingClientRect().x)).length,
        armorCols: uniq([...document.querySelectorAll('.iv-arm .ivs')].map(e => e.getBoundingClientRect().x)).length,
        hotRows: uniq([...document.querySelectorAll('.ivg.hot .ivs')].map(e => e.getBoundingClientRect().y)).length,
      };
    });
    if (width === 375) assert.ok(d.slots[0].w >= 28, `375: slot at least 28px, got ${d.slots[0].w}`);
    assert.equal(d.slots.length, 41, `${width}: 41 slots`);
    assert.equal(d.main.length, 27); assert.equal(d.hot.length, 9); assert.equal(d.armor.length, 4);
    assert.ok(d.overflow <= 0, `${width}: no document overflow`);
    assert.ok(d.slots.every(s => Math.abs(s.w - d.slots[0].w) < 1 && Math.abs(s.h - s.w) < 1), `${width}: all inventory slots equally sized squares`);
    assert.ok(d.slots.every(s => s.x >= d.card.x - 1 && s.right <= d.card.right + 1), `${width}: all slots within card`);
    assert.ok(d.slots.every(s => s.y >= d.card.y - 1 && s.bottom <= d.card.bottom + 1), `${width}: all slots vertically within card`);
    // Storage stays 3x9; phones move equipment below it to preserve padding and slot size.
    assert.equal(d.mainRows, 3, `${width}: storage is three rows`);
    assert.equal(d.mainCols, 9, `${width}: storage is nine columns`);
    assert.equal(d.hotRows, 1, `${width}: hotbar is one row`);
    if (width <= 560) {
      assert.ok(d.slots.every(s => s.x - d.card.x >= 12 && d.card.right - s.right >= 12), `${width}: at least 12px inner space on both sides`);
      assert.equal(d.armorCols, 4, `${width}: armour wraps into a row`);
      assert.ok(d.armor.every(s => s.y > d.hot[0].bottom), `${width}: armour below hotbar`);
      assert.ok(Math.abs(d.off.cy - d.armor[0].cy) < 2, `${width}: offhand shares equipment row`);
    } else {
      assert.equal(d.armorCols, 1, `${width}: armour is one column`);
      assert.ok(Math.abs(d.armor[0].x - d.armor[3].x) < 1, `${width}: armour slots share one column`);
      assert.ok(d.armor[0].y < d.armor[3].y, `${width}: armour runs top to bottom`);
      assert.ok(d.armor[3].right <= d.main[0].x + 1, `${width}: armour sits left of the storage`);
      assert.ok(Math.abs(d.off.cy - d.hot[0].cy) < 2, `${width}: offhand is level with the hotbar`);
    }
    assert.ok(d.hot[0].y > d.main[26].bottom, `${width}: hotbar below storage`);
    const rowGap = d.main[9].y - d.main[0].bottom;
    const hotGap = d.hot[0].y - d.main[26].bottom;
    assert.ok(hotGap > rowGap, `${width}: hotbar is visually separated (${hotGap} > ${rowGap})`);
    assert.ok(d.off.x >= d.main[8].right - 1, `${width}: offhand sits right of the storage`);
    // Item icons centred in their slot.
    assert.ok(Math.abs(d.icon.cx - d.iconSlot.cx) <= 1 && Math.abs(d.icon.cy - d.iconSlot.cy) <= 1, `${width}: icon centred in its slot`);
    // Stack counts bottom-right in the pixel font.
    assert.ok(d.countSlot.right - d.count.right <= 6 && d.countSlot.bottom - d.count.bottom <= 4, `${width}: stack count at the bottom right`);
    const fam = (s) => s.split(',')[0].replace(/["']/g, '').trim();
    assert.ok(d.pxToken && fam(d.countFont) === fam(d.pxToken), `${width}: stack count uses the pixel font (${d.countFont} vs ${d.pxToken})`);
    console.log(`inventory geometry ${width}: 41 equal slots, MC layout, no clipping`);
    await page.close();
  }
} finally { await browser.close(); }
