import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import worker from '../src/worker.js';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const fixture = { mined: {waxed_weathered_cut_copper_stairs: 2147483647, stone: 600, dirt: 42}, killed: {chicken: 91, 'minecraft:husk': 25, cow: 3} };
async function openPage(browser, host, path, width = 390, data = fixture) {
  const profile = {user:{name:'Fixture',username:'fixture',avatar:'',id:'1'},guestbook:[],minecraft:{visible:true,mc_name:'Fixture',mc_uuid:'fixture',stats:{},details:data}};
  const player = {name:'Fixture',stats:{},details:{all:{},extra:data},viewer:{logged_in:true}};
  const page = await browser.newPage({viewport:{width,height:900}, reducedMotion:'reduce'});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.pathname === path && url.hostname === host) {
      const response = await worker.fetch(new Request(url.href), {}, {});
      return route.fulfill({status:response.status, contentType:'text/html', body:await response.text()});
    }
    if (url.pathname === '/api/profile') return route.fulfill({json:profile});
    if (url.pathname === '/api/mc-players/Fixture') return route.fulfill({json:player});
    if (url.pathname.startsWith('/mc-mob/')) {
      const response = await worker.fetch(new Request(url.href), {}, {});
      const location = response.headers.get('location');
      if (!location?.startsWith('/mc/heads/')) return route.abort();
      try { return route.fulfill({contentType:'image/png',body:await readFile(resolve(publicDir, '.' + location))}); }
      catch { return route.abort(); }
    }
    if (url.pathname.startsWith('/api/')) return route.fulfill({json:{}});
    if (url.hostname !== host) return route.abort();
    const file = resolve(publicDir, '.' + url.pathname);
    if (!file.startsWith(resolve(publicDir) + '\\') && !file.startsWith(resolve(publicDir) + '/')) return route.abort();
    try {
      const body = await readFile(file);
      const contentType = url.pathname.endsWith('.css') ? 'text/css' : url.pathname.endsWith('.js') ? 'application/javascript' : 'application/octet-stream';
      return route.fulfill({contentType, body});
    } catch { return route.abort(); }
  });
  await page.goto(`https://${host}${path}`);
  try { await page.getByRole('tab',{name:'Statistiken'}).click({timeout:5000}); }
  catch (error) { console.log('page diagnostics', host, path, errors, (await page.locator('body').innerText()).slice(0,1200)); throw error; }
  await page.getByText('Mob-Kills',{exact:true}).waitFor();
  return {page, errors};
}

test('cow mob route resolves to a real self-hosted cow head', async () => {
  const response = await worker.fetch(new Request('https://mc.nwebnotfound.dev/mc-mob/minecraft%3Acow'), {}, {});
  assert.equal(response.status, 302);
  assert.equal(response.headers.get('location'), '/mc/heads/cow.png');
  const png = await readFile(resolve(publicDir, 'mc/heads/cow.png'));
  assert.equal(png.subarray(0,8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16), 64);
  assert.equal(png.readUInt32BE(20), 64);
});

for (const [host,path] of [['mc.nwebnotfound.dev','/profile'], ['nwebnotfound.dev','/profile'], ['mc.nwebnotfound.dev','/spieler/Fixture']]) {
  for (const width of [390,1280]) test(`${host}${path}: statistic columns align and do not clip at ${width}px`, async () => {
    const browser = await chromium.launch();
    try {
      const {page,errors} = await openPage(browser,host,path,width);
      const metrics = await page.evaluate(() => {
        const cards = [...document.querySelectorAll('h3')].filter(h => h.textContent.startsWith('Top-Blöcke') || h.textContent.startsWith('Mob-Kills')).map(h => {
          const card = h.parentElement, rows = [...card.querySelectorAll('.row,.prow')];
          const box = e => {const r=e.getBoundingClientRect();return {left:r.left,right:r.right,width:r.width};};
          return {title:h.textContent, card:box(card), rows:rows.map(row=>{
            const label=row.querySelector('.n'), value=row.querySelector(':scope > b'), meter=label.querySelector('.meter');
            return {row:box(row), label:box(label), value:box(value), meter:box(meter), labelScroll:label.scrollWidth, labelClient:label.clientWidth, labelOverflow:getComputedStyle(label).overflow, valueScroll:value.scrollWidth, valueClient:value.clientWidth};
          })};
        });
        return {cards, scroll:document.documentElement.scrollWidth, viewport:document.documentElement.clientWidth};
      });
      assert.equal(metrics.cards.length,2);
      assert.ok(metrics.scroll<=metrics.viewport,JSON.stringify(metrics));
      for (const card of metrics.cards) {
        assert.ok(card.rows.length>=2,JSON.stringify(card));
        const first=card.rows[0];
        for (const row of card.rows) {
          assert.ok(Math.abs(first.value.width-row.value.width)<1,JSON.stringify(card));
          assert.ok(Math.abs(first.meter.width-row.meter.width)<1,JSON.stringify(card));
          assert.ok(row.value.right<=card.card.right+1 && row.label.left>=card.card.left-1,JSON.stringify(card));
          assert.ok(row.labelScroll<=row.labelClient+1 && row.valueScroll<=row.valueClient+1,JSON.stringify(card));
        }
      }
      assert.deepEqual(errors,[]);
    } finally { await browser.close(); }
  });
  test(`${host}${path}: extreme counts and unknown names remain legible`, async () => {
    const browser = await chromium.launch();
    try {
      const data={mined:{stone:1},killed:{unknown_extremely_long_creature_name_that_should_wrap_cleanly:1e30,chicken:1}};
      const {page,errors}=await openPage(browser,host,path,390,data);
      const metrics=await page.evaluate(()=>{
        const heading=[...document.querySelectorAll('h3')].find(e=>e.textContent==='Mob-Kills');
        const rows=[...heading.parentElement.querySelectorAll('.row,.prow')];
        return {scroll:document.documentElement.scrollWidth, viewport:document.documentElement.clientWidth,
          rows:rows.map(row=>[row.querySelector('.n'),row.querySelector('.n > span'),row.querySelector(':scope > b')].filter(Boolean).map(el=>({text:el.textContent,client:el.clientWidth,scroll:el.scrollWidth,left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right})))};
      });
      assert.equal(metrics.rows.length,2);
      assert.ok(metrics.scroll<=metrics.viewport,JSON.stringify(metrics));
      assert.ok(metrics.rows.every(row=>row.every(el=>el.scroll<=el.client+1 && el.left>=0 && el.right<=390)),JSON.stringify(metrics));
      assert.deepEqual(errors,[]);
    } finally { await browser.close(); }
  });
  test(`${host}${path}: mob labels use entity rather than item translations`, async () => {
    const browser = await chromium.launch();
    try {
      const {page, errors} = await openPage(browser,host,path);
      const card = page.locator('div').filter({has:page.getByRole('heading',{name:'Mob-Kills',exact:true})}).filter({hasNot:page.getByRole('heading',{name:'Top-Blöcke'})}).last();
      const text = await card.innerText();
      assert.match(text,/Huhn/);
      assert.match(text,/Wüstenzombie/);
      assert.match(text,/Kuh/);
      assert.doesNotMatch(text,/Rohes Hühnchen/);
      const images = card.locator('img');
      assert.equal(await images.count(),3);
      for (const expected of ['chicken','husk','cow']) {
        const img = card.locator(`img[src^="/mc-mob/"][src*="${expected}"]`);
        await img.scrollIntoViewIfNeeded({timeout:3000});
        try { await page.waitForFunction(el=>el.complete && el.naturalWidth>0, await img.elementHandle(), {timeout:3000}); }
        catch (error) { console.log('image diagnostics', expected, await img.evaluate(el=>({src:el.src,complete:el.complete,naturalWidth:el.naturalWidth}))); throw error; }
      }
      assert.deepEqual(errors,[]);
    } finally { await browser.close(); }
  });
}
