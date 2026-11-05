import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { WIKI, wikiArticleBody } from '../src/mc-hub.js';

const css = (await Promise.all(['public/design/minecraft.css','public/mc/ds.css','public/mc/theme-v2.css'].map(p=>readFile(p,'utf8')))).join('\n');
const html = `<!doctype html><html class="mc"><head><style>${css}\nhtml,body{margin:0}.hub-wrap{width:min(1080px,calc(100% - 32px));margin:auto}</style></head><body>${wikiArticleBody(WIKI.find(a=>a.slug==='economy'),'mc.example.test')}</body></html>`;
const browser = await chromium.launch();
try {
  for (const width of [390,1280]) {
    const page = await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});
    await page.setContent(html);
    await page.waitForTimeout(120);
    const result = await page.evaluate(() => {
      const visible=(el)=>{const r=el.getBoundingClientRect();return r.width>0&&r.height>0};
      const chip=document.querySelector('.wside-chips');
      const chipVisible=visible(chip);
      const nav=chipVisible?chip:document.querySelector('.wside');
      const links=[...nav.querySelectorAll('a')];
      const cur=nav.querySelector('[aria-current=page]');
      const other=links.find(a=>a!==cur);
      const st=getComputedStyle(chip);
      const hb=chip.getBoundingClientRect(),cb=cur?cur.getBoundingClientRect():null;
      return {
        details:document.querySelectorAll('details').length,
        chipVisible, overflow:document.documentElement.scrollWidth-innerWidth,
        navClient:nav.clientWidth, navScroll:nav.scrollWidth,
        links:links.length, current:cur?cur.textContent.trim():null,
        minHeight:Math.min(...links.map(e=>e.getBoundingClientRect().height)),
        images:[...new Set(links.map(a=>a.querySelector('img')?.getBoundingClientRect().width))],
        snap:st.scrollSnapType, scrollbarWidth:getComputedStyle(nav).scrollbarWidth,
        curInside:!!cb&&cb.left>=hb.left-1&&cb.right<=hb.right+1,
        curBg:cur?getComputedStyle(cur).backgroundColor:null,
        otherBg:other?getComputedStyle(other).backgroundColor:null,
      };
    });
    assert.equal(result.overflow,0,`${width}: document does not overflow`);
    assert.equal(result.details,0,`${width}: no disclosure widget`);
    assert.equal(result.links,WIKI.length+1,`${width}: all entries and overview`);
    assert.equal(result.current,'Economy & CP');
    assert.ok(result.minHeight>=44,`${width}: 44px targets`);
    assert.notEqual(result.curBg,result.otherBg,`${width}: the current item is visibly marked`);
    if(width===390){
      assert.equal(result.chipVisible,true,'390: the chip row is the phone navigation');
      assert.match(result.snap,/^x(\s|$)/,'390: horizontal snap');
      assert.equal(result.scrollbarWidth,'none','390: no visible scrollbar');
      assert.ok(result.navScroll>result.navClient,'390: the chip row really scrolls');
      assert.equal(result.curInside,true,'390: the current chip is scrolled into view');
      assert.deepEqual(result.images,[18],'390: consistently sized chip icons');
      console.log('wiki phone navigation 390: snap chip row, hidden scrollbar, current scrolled in');
    } else {
      assert.equal(result.chipVisible,false,'1280: the sidebar carries the desktop navigation');
      assert.ok(result.navScroll<=result.navClient,'1280: sidebar has no horizontal overflow');
      assert.equal(result.scrollbarWidth,'thin','1280: themed thin scrollbar');
      assert.deepEqual(result.images,[20],'1280: consistently sized sidebar icons');
      console.log('wiki sidebar 1280: themed scrollbar, no overflow, current marked');
    }
    await page.close();
  }
} finally {await browser.close()}
