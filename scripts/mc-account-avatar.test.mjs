import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import worker from '../src/worker.js';

const browser = await chromium.launch();
const api = {available:true,user:{name:'Test',username:'test',mc_name:'NwebNotFound',avatar:'https://cdn.discordapp.com/embed/avatars/2.png'}};
try {
  for (const [host,path] of [['mc.nwebnotfound.dev','/'],['nwebnotfound.dev','/portfolio']]) {
    const response = await worker.fetch(new Request(`https://${host}${path}`),{},{});
    assert.equal(response.status,200);
    const html=await response.text();
    const page=await browser.newPage({viewport:{width:1280,height:900}});
    await page.route('**/*',async route=>{
      const u=new URL(route.request().url());
      if(u.hostname===host&&u.pathname===path){await route.fulfill({status:200,contentType:'text/html',body:html});return}
      if(u.hostname===host&&u.pathname==='/api/me'){await new Promise(resolve=>setTimeout(resolve,300));await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(api)});return}
      if(u.pathname.startsWith('/mc-head/')||u.hostname==='cdn.discordapp.com'){await route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#333"/></svg>'});return}
      await route.fulfill({status:404,body:''});
    });
    await page.goto(`https://${host}${path}`,{waitUntil:'domcontentloaded'});
    if(host.startsWith('mc.')) {
      // Shipped markup: no head at all while /api/me is in flight (hidden, no src) — no placeholder flash.
      assert.match(html,/<img class="mi konto-av"[^>]*hidden/);
      assert.equal(/<img class="mi konto-av"[^>]*src=/.test(html),false,'no generic head is shipped before the session is known');
      await page.waitForFunction(()=>document.querySelector('.konto-av')?.getAttribute('src')?.includes('/mc-head/NwebNotFound/'));
      const src=await page.locator('.konto-av').getAttribute('src');
      assert.match(src,/^\/mc-head\/NwebNotFound\/64\?/);
      assert.equal(await page.locator('.konto-av').isVisible(),true,'resolved avatar is visible');
      // MC without a linked MC name: the pre-existing chain (https avatar, else the Steve head) stays —
      // never the generic player_head icon, and the https-only guard is the e2e contract.
      const page2=await browser.newPage({viewport:{width:1280,height:900}});
      await page2.route('**/*',async route=>{
        const u=new URL(route.request().url());
        if(u.hostname===host&&u.pathname===path){await route.fulfill({status:200,contentType:'text/html',body:html});return}
        if(u.hostname===host&&u.pathname==='/api/me'){await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({available:true,user:{name:'Test',username:'test',avatar:'https://cdn.discordapp.com/embed/avatars/2.png'}})});return}
        if(u.pathname.startsWith('/mc-icon/')||u.pathname.startsWith('/mc-head/')||u.hostname==='cdn.discordapp.com'){await route.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#333"/></svg>'});return}
        await route.fulfill({status:404,body:''});
      });
      await page2.goto(`https://${host}${path}`,{waitUntil:'domcontentloaded'});
      await page2.waitForFunction(()=>document.querySelector('.konto-av')&&!document.querySelector('.konto-av').hidden);
      assert.equal(await page2.locator('.konto-av').getAttribute('src'),'/mc-head/MHF_Steve/64?v=5','unlinked account uses Steve on mc');
      await page2.close();
    } else {
      await page.waitForFunction(()=>document.querySelector('#umb img'));
      const src=await page.locator('#umb img').getAttribute('src');
      assert.equal(src,api.user.avatar,'main domain uses the Discord avatar');
      assert.doesNotMatch(src,/\/mc-head\//,'main domain must not use Minecraft head');
    }
    console.log(`${host}: linked account avatar ok`);
    await page.close();
  }
  // Optional visual pass: with MC_BASE pointing at a local `wrangler dev` (seeded with a session +
  // mc_links row) this keeps the public hostname in the browser, so the account-avatar branch really
  // is the MC one, and writes the two nav screenshots the PR shows for item 6.
  const MC_BASE = process.env.MC_BASE;
  if (MC_BASE) {
    const { webcrypto: C } = await import('node:crypto');
    const SECRET = process.env.SESSION_SECRET || 'screens-session-secret-0123456789abcdef';
    const HOST = 'mc.nwebnotfound.dev', ORIGIN = `https://${HOST}`;
    const sid = process.env.MC_SESSION_ID || 's-av';
    const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const key = await C.subtle.importKey('raw', new TextEncoder().encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const value = sid + '.' + b64u(await C.subtle.sign('HMAC', key, new TextEncoder().encode(sid)));
    for (const vp of [{ w: 1280, h: 900, tag: '1280' }, { w: 375, h: 812, tag: '375' }]) {
      const ctx = await browser.newContext({ viewport: { width: vp.w, height: vp.h }, deviceScaleFactor: 1, colorScheme: 'dark', reducedMotion: 'reduce' });
      await ctx.addCookies([{ name: 'nnf_session', value, domain: HOST, path: '/', secure: true, httpOnly: true }]);
      await ctx.route('**/*', async (route) => {
        const rq = route.request(), u = rq.url();
        if (!u.startsWith(ORIGIN)) return route.continue();
        const h = Object.fromEntries(Object.entries(await rq.allHeaders()).filter(([k]) => !k.startsWith(':') && !['host', 'accept-encoding'].includes(k)));
        try {
          // The dev server runs with --local-upstream mc.nwebnotfound.dev, so it answers as the MC surface.
          const res = await fetch(MC_BASE + u.slice(ORIGIN.length), { headers: h, redirect: 'manual' });
          await route.fulfill({ status: res.status, headers: Object.fromEntries([...res.headers].filter(([k]) => !['content-encoding', 'content-length', 'transfer-encoding'].includes(k))), body: Buffer.from(await res.arrayBuffer()) });
        } catch { await route.abort(); }
      });
      const page3 = await ctx.newPage();
      const errors = [];
      page3.on('pageerror', (e) => errors.push(e.message));
      await page3.goto(`${ORIGIN}/`, { waitUntil: 'domcontentloaded' });
      await page3.waitForFunction(() => { const a = document.querySelector('.konto-av'); return a && !a.hidden && a.getAttribute('src'); }, { timeout: 15000 });
      assert.match(await page3.locator('.konto-av').getAttribute('src'), /^\/mc-head\//, `${vp.tag}: the account avatar is a Minecraft head`);
      if (!(await page3.locator('.konto-av').isVisible())) { await page3.locator('.nbur').click({ force: true }); await page3.waitForTimeout(400); }
      assert.equal(await page3.locator('.konto-av').isVisible(), true, `${vp.tag}: the head is visible in the nav`);
      assert.deepEqual(errors, [], `${vp.tag}: no page errors`);
      await page3.locator('header.nav').screenshot({ path: `docs/screens/v2/mc/nav-konto-${vp.tag}.png` });
      await page3.locator('.konto-av').screenshot({ path: `docs/screens/v2/mc/nav-konto-head-${vp.tag}.png` });
      await page3.screenshot({ path: `docs/screens/v2/mc/nav-konto-menu-${vp.tag}.png` });
      console.log(`mc nav head ${vp.tag}: ${await page3.locator('.konto-av').getAttribute('src')}`);
      await ctx.close();
    }
  }
} finally {await browser.close()}
