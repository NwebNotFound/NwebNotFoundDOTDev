import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';

const js = await readFile('public/mc/player3d.js','utf8');
const css = await readFile('public/mc/profile.css','utf8');
const browser = await chromium.launch();
try {
  for (const scenario of ['failure','success','left-before-load']) {
    const fail=scenario==='failure', delay=scenario==='left-before-load';
    const page = await browser.newPage({viewport:{width:1280,height:900}, reducedMotion:'no-preference'});
    await page.setContent(`<html class="mc"><head><style>${css}\n.plc{display:flex;align-items:center;gap:16px;width:340px}</style></head><body><p id="subtitle">Finde Mitspieler</p><div id="root"><a class="plc" data-player="Tester" href="#"><span>Spieler</span><div>Tester</div></a></div></body></html>`);
    await page.evaluate(({fail,delay}) => {
      const orig = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(type,...rest){return type==='webgl'||type==='webgl2'?{}:orig.call(this,type,...rest)};
      window.skinview3d={SkinViewer:class {constructor(o){this.canvas=o.canvas;this.controls={};this.globalLight={};this.cameraLight={};this.playerObject={rotation:{}}} async loadSkin(){if(delay)await new Promise(resolve=>setTimeout(resolve,250));if(fail)throw new Error('skin failed')}},WalkingAnimation:class{}};
    }, {fail,delay});
    await page.addScriptTag({content:js});
    await page.evaluate(()=>MC3D.hover(document.querySelector('#root'),'a.plc'));
    await page.locator('.plc').dispatchEvent('pointerover',{pointerType:'mouse'});
    if(delay) {await page.waitForTimeout(160);await page.locator('.plc').dispatchEvent('pointerout',{pointerType:'mouse'});}
    await page.waitForTimeout(450);
    const result = await page.evaluate(()=>{ const pop=document.querySelector('.m3d-pop'), s=document.querySelector('#subtitle').getBoundingClientRect(), p=pop?.getBoundingClientRect();return {visible:!!pop&&getComputedStyle(pop).visibility!=='hidden'&&getComputedStyle(pop).display!=='none'&&getComputedStyle(pop).opacity!=='0'&&p.width>0&&p.height>0,hasCanvas:!!pop?.querySelector('canvas'),inCard:!!pop?.closest('.plc'),overSubtitle:!!p&&p.left<s.right&&p.right>s.left&&p.top<s.bottom&&p.bottom>s.top}});
    if(fail || delay) assert.equal(result.visible,false,'failed or stale skin must not display a preview');
    else {assert.ok(result.visible && result.hasCanvas,'loaded skin has visible preview');assert.ok(result.inCard,'preview belongs to player card');assert.equal(result.overSubtitle,false,'preview does not cover subtitle');}
    await page.close();
    console.log(`player hover ${scenario} ok`);
  }
} finally { await browser.close(); }
