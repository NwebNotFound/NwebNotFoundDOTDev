window.MC=(()=>{const E=s=>String(s??'').replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const NM=id=>(window.MC_DE&&MC_DE[String(id).replace(/^minecraft:/,'')])||String(id).replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
const NF=(v,d=0)=>(+v||0).toLocaleString('de-DE',{maximumFractionDigits:d,minimumFractionDigits:d});
const CP=v=>{v=+v||0;return (v>=100?NF(v):NF(v,v<10?2:1))+' CP'};
const BIG=v=>{v=+v||0;return v>=1e6?NF(v/1e6,1)+' Mio':v>=1e4?NF(v/1e3,1)+' Tsd':NF(v)};
const ICO=id=>'<span class="ic"><img alt="" loading="lazy" src="/mc-icon/v2/'+encodeURIComponent(id)+'" onerror="this.onerror=null;this.src=\'/mc-icon/v2/paper\'"></span>';
const PCT=p=>{p=+p||0;const c=p>0.005?'up':p<-0.005?'dn':'flat';return '<span class="'+c+' tnum">'+(p>0?'+':'')+NF(p,2)+' %</span>'};
const spark=(pts,w=120,h=36,ri=0)=>{if(!pts||pts.length<2)return '<svg width="'+w+'" height="'+h+'"></svg>';const mn=Math.min(...pts),mx=Math.max(...pts),r=mx-mn||1;const P=pts.map((v,i)=>[(i/(pts.length-1)*w).toFixed(1),(h-2-(v-mn)/r*(h-4)).toFixed(1)]);ri=+ri||0;const RM=ri>0&&ri<pts.length;const c=pts[pts.length-1]>=pts[RM?ri:0]?'#4ade80':'#f87171';const id='s'+Math.random().toString(36).slice(2,8);
return '<svg width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'" aria-hidden="true"><defs><linearGradient id="'+id+'" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="'+c+'" stop-opacity=".35"/><stop offset="1" stop-color="'+c+'" stop-opacity="0"/></linearGradient></defs><path d="M'+P.join('L')+'L'+w+','+h+'L0,'+h+'Z" fill="url(#'+id+')"/><path d="M'+P.join('L')+'" fill="none" stroke="'+c+'" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>'+(RM?RMARK(((ri-.5)/(pts.length-1)*w).toFixed(1),0,h,1,w):'')+'</svg>'};
// Vertikale Markierung "neue Preise" (Preis-Reset) für SVG-Charts; sm = kompakt für Sparklines
const RMARK=(x,y0,y1,sm,w)=>{const fl=w&&+x>w-(sm?48:84);return '<g class="rmk"><line x1="'+x+'" x2="'+x+'" y1="'+y0+'" y2="'+y1+'" stroke="#facc15" stroke-width="'+(sm?1:1.5)+'" stroke-dasharray="'+(sm?'2 2':'4 3')+'"/><text x="'+(fl?+x-3:+x+3)+'" text-anchor="'+(fl?'end':'start')+'" y="'+(+y0+(sm?7:12))+'" fill="#facc15" font-size="'+(sm?7:11)+'" style="font-family:var(--pf)">neue Preise</text><title>Preis-Reset: neue Preise ab hier</title></g>'};
const C2=c=>NF((+c||0)/100,2)+' CP';
const LEFT=ms=>{if(ms<=0)return 'beendet';const s=Math.floor(ms/1000),d=Math.floor(s/86400),h=Math.floor(s%86400/3600),m=Math.floor(s%3600/60),x=s%60;return d?d+'T '+h+'h':h?h+'h '+m+'m':m+'m '+String(x).padStart(2,'0')+'s'};
const LOC=l=>!l?'':typeof l==='string'?l:[l.world,[l.x,l.y,l.z].filter(v=>v!=null).join(' / ')].filter(Boolean).join(' · ');
const post=(u,b)=>fetch(u,{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify(b)}).then(async r=>({ok:r.ok,status:r.status,j:await r.json().catch(()=>({}))}));
const get=u=>fetch(u,{credentials:'include'}).then(r=>{if(!r.ok)throw 0;return r.json()});
function SCORE(x,q){q=q.toLowerCase().trim().replace(/[_\s]+/g,' ');if(!q)return 0;const n=NM(x.item).toLowerCase(),id=x.item.replace(/_/g,' ');let best=0;
for(const h of [n,id]){const w=h.split(' ');if(h===q)return 1000;if(h.startsWith(q))best=Math.max(best,800-h.length);
if(w.some(v=>v.startsWith(q)))best=Math.max(best,600-h.length);const qw=q.split(' ');if(qw.length>1&&qw.every(p=>w.some(v=>v.startsWith(p))))best=Math.max(best,550-h.length);
const ini=w.map(v=>v[0]).join('');if(q.length>=2&&!q.includes(' ')&&ini.startsWith(q))best=Math.max(best,500-h.length);
if(h.includes(q))best=Math.max(best,400-h.length);
if(q.length>=3&&!best&&w.some(v=>v[0]===q[0])){let i=0;for(const c of h){if(c===q[i])i++;if(i===q.length)break}if(i===q.length)best=Math.max(best,100-h.length/4)}}return best}
function search(inp,box,items,go){inp.addEventListener('focus',()=>document.documentElement.classList.add('srch-focus'));inp.addEventListener('blur',()=>setTimeout(()=>document.documentElement.classList.remove('srch-focus'),200));let sel=-1,cur=[];const close=()=>{box.hidden=true;inp.setAttribute('aria-expanded','false');document.documentElement.classList.remove('ac-open');sel=-1};
const draw=()=>{const t=inp.value.trim();if(!t){close();return}cur=items.map(x=>[x,SCORE(x,inp.value)]).filter(a=>a[1]>0).sort((a,b)=>b[1]-a[1]||(+b[0].volume_24h_cp||0)-(+a[0].volume_24h_cp||0)).map(a=>a[0]).slice(0,8);
box.innerHTML=cur.length?cur.map((x,i)=>'<a role="option" href="/markt/'+encodeURIComponent(x.item)+'" aria-selected="'+(i===sel)+'">'+ICO(x.item)+E(NM(x.item))+'<small class="tnum">'+(x.buy_locked?'gesperrt':CP(x.buy_price))+'</small></a>').join(''):'<div class="mut" style="padding:.7rem">Kein Item gefunden.</div>';box.hidden=false;inp.setAttribute('aria-expanded','true');document.documentElement.classList.add('ac-open')};
inp.addEventListener('input',()=>{sel=-1;draw()});inp.addEventListener('keydown',e=>{if(box.hidden)return;if(e.key==='ArrowDown'||e.key==='ArrowUp'){e.preventDefault();sel=(sel+(e.key==='ArrowDown'?1:cur.length-1))%Math.max(1,cur.length);draw()}else if(e.key==='Enter'){const x=cur[Math.max(0,sel)];if(x){e.preventDefault();go(x.item)}}else if(e.key==='Escape')close()});
document.addEventListener('click',e=>{if(!box.contains(e.target)&&e.target!==inp)close()})}
const HASCH=x=>!x.reset_new&&(!!x.hist_pct||(+x.trades_24h||0)>0||Math.abs(+x.change_24h_pct||0)>0.004);const PX=x=>HASCH(x)?PCT(x.change_24h_pct):x.reset_new?'<span class="mut" title="Neue Preise seit dem Preis-Reset, noch keine 24h-Änderung">neu</span>':'<span class="mut">—</span>';
const LOCK='<span class="nb" title="Nicht bei der Bank kaufbar">nur Verkauf</span>';const BUYP=x=>x.buy_locked?(x.sell_locked||!(+x.sell_price>0)?'<span class="nb" title="Bei der Bank weder kauf- noch verkaufbar">nicht handelbar</span>':LOCK):CP(x.buy_price);
// Turnstile for web shop buys and bids (Nils, 06.11.: same as bank_buy). One widget per page in
// a container OUTSIDE the re-rendered list (#ts[data-sitekey]); api.js loads only when a form is
// shown (render=explicit). token() is the current response, reset() after every submit.
const CAPTCHA=(()=>{let wid=null,p=null;const host=()=>document.getElementById('ts');
const load=()=>p||(p=new Promise((res,rej)=>{if(window.turnstile)return res();const s=document.createElement('script');s.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';s.async=true;s.onload=()=>res();s.onerror=rej;document.head.appendChild(s)}));
return{show(){const h=host();if(!h||wid!==null)return;h.hidden=false;load().then(()=>{if(wid===null)wid=turnstile.render(h,{sitekey:h.dataset.sitekey,theme:'dark',size:'flexible'})}).catch(()=>{})},
token(){try{return wid===null?'':(turnstile.getResponse(wid)||'')}catch(_){return ''}},reset(){try{if(wid!==null)turnstile.reset(wid)}catch(_){}}}})();
return{RMARK,SCORE,E,NM,NF,CP,C2,LEFT,LOC,BIG,ICO,PCT,PX,HASCH,LOCK,BUYP,spark,get,post,search,CAPTCHA}})();
