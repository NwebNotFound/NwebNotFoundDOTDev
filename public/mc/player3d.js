// 3D-Spielermodelle (skinview3d, lokal vendored, Skin same-origin über /mc-skin/<name>).
// Lazy (IntersectionObserver), mobil/Reduced-Motion statisch (ein Frame als <img>), ohne WebGL bleibt der Kopf (Fallback).
(()=>{if(window.MC3D)return;
const OK=(()=>{try{const c=document.createElement('canvas');return !!(c.getContext('webgl2')||c.getContext('webgl'))}catch(_){return false}})();
const STATIC=()=>matchMedia('(max-width:640px),(hover:none),(prefers-reduced-motion:reduce)').matches;
const NAME=/^[A-Za-z0-9_]{1,16}$/;const MAX_LIVE=6;let live=0,lib=null;const VS=[];
const gc=()=>{for(let i=VS.length-1;i>=0;i--)if(!VS[i][0].isConnected){try{VS[i][1].dispose()}catch(_){}VS.splice(i,1);live--}};
const load=()=>lib||(lib=new Promise((res,rej)=>{if(window.skinview3d)return res();const s=document.createElement('script');s.src='/vendor/skinview3d-3.4.2.min.js';s.async=true;s.onload=res;s.onerror=rej;document.head.appendChild(s)}));
const skin=n=>'/mc-skin/'+encodeURIComponent(n)+'?v=3';
// Statische Frames nacheinander mit EINEM Viewer rendern (spart WebGL-Kontexte)
let sv=null,q=Promise.resolve();
function still(n,w,h,rot){return q=q.then(async()=>{await load();if(!sv){sv=new skinview3d.SkinViewer({canvas:document.createElement('canvas'),width:w,height:h,zoom:.86,fov:40,preserveDrawingBuffer:true});sv.renderPaused=true;sv.globalLight.intensity=2.6;sv.cameraLight.intensity=.7}
sv.setSize(w,h);await sv.loadSkin(skin(n));sv.playerObject.rotation.y=rot;sv.playerObject.skin.leftArm.rotation.x=.2;sv.playerObject.skin.rightArm.rotation.x=-.2;sv.render();return sv.canvas.toDataURL('image/png')})}
function look(v,el){if(!el.classList.contains('pf-model'))return;const P=v.playerObject,head=P&&P.skin&&P.skin.head;if(!head)return;const base=P.rotation.y;
const fine=matchMedia('(hover:hover) and (pointer:fine)').matches;
if(!fine){let t=0;const tick=()=>{if(!el.isConnected)return;t+=.012;head.rotation.y=Math.sin(t*.9)*.18;requestAnimationFrame(tick)};tick();return}
let tx=0,ty=0,cx=0,cy=0;
const mv=e=>{const r=el.getBoundingClientRect(),ox=r.left+r.width/2,oy=r.top+r.height*.22;tx=Math.max(-1,Math.min(1,(e.clientX-ox)/(innerWidth*.45)));ty=Math.max(-1,Math.min(1,(e.clientY-oy)/(innerHeight*.45)))};
const leave=()=>{tx=0;ty=0};
addEventListener('pointermove',mv,{passive:true});addEventListener('pointerleave',leave);
const loop=()=>{if(!el.isConnected){removeEventListener('pointermove',mv);removeEventListener('pointerleave',leave);return}cx+=(tx-cx)*.08;cy+=(ty-cy)*.08;head.rotation.y=cx*.85;head.rotation.x=cy*.55;P.rotation.y=base+cx*.35;requestAnimationFrame(loop)};loop()}
function live3d(el,n,w,h,rot){const cv=document.createElement('canvas');const v=new skinview3d.SkinViewer({canvas:cv,width:w,height:h,zoom:.86,fov:40});
v.controls.enableZoom=false;v.controls.enablePan=false;v.globalLight.intensity=2.6;v.cameraLight.intensity=.7;v.playerObject.rotation.y=rot;
return v.loadSkin(skin(n)).then(()=>{v.animation=new skinview3d.IdleAnimation();v.animation.speed=.6;if(!el.isConnected){v.dispose();live--;return}el.appendChild(cv);el.classList.add('ready');VS.push([el,v]);look(v,el);
new IntersectionObserver(e=>{v.renderPaused=!e[0].isIntersecting}).observe(el);new ResizeObserver(()=>{if(el.clientWidth&&el.clientHeight)v.setSize(el.clientWidth,el.clientHeight)}).observe(el);return v})}
async function draw(el){const n=el.dataset.name;if(!NAME.test(n)||!OK)return;const w=Math.max(60,el.clientWidth||160),h=Math.max(80,el.clientHeight||220),rot=+(el.dataset.rot||-.4);
try{if(!STATIC()&&el.dataset.mode!=='still'&&live<MAX_LIVE){live++;await load();await live3d(el,n,w,h,rot).catch(e=>{live--;throw e});return}
const url=await still(n,w*2,h*2,rot);const img=new Image();img.alt='';img.className='m3d-still';img.width=w;img.height=h;img.src=url;el.appendChild(img);el.classList.add('ready')}catch(e){console.warn('skinview3d',e)}}
const io='IntersectionObserver' in window?new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){io.unobserve(e.target);draw(e.target)}}),{rootMargin:'200px'}):null;
const E=s=>String(s??'').replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
window.MC3D={
 // Container mit Kopf als Fallback; cls z. B. "pf-model" / "pod-model"
 html:(n,cls,head)=>NAME.test(n)?'<div class="m3d '+E(cls||'')+'" data-name="'+n+'"><img class="m3d-fb" alt="" loading="lazy" width="'+(head||64)+'" height="'+(head||64)+'" src="/mc-head/'+n+'/'+(head||64)+'?v=5" onerror="this.onerror=null;this.src=\'/mc-head/MHF_Steve/'+(head||64)+'?v=5\'"></div>':'',
 scan(root){gc();(root||document).querySelectorAll('.m3d[data-name]:not([data-m3d])').forEach(el=>{el.dataset.m3d='1';io?io.observe(el):draw(el)})},
 // Hover-Vorschau (nur Maus): ein gemeinsamer Viewer im Popover
 hover(root,sel){if(!OK||STATIC())return;const pop=document.createElement('div');pop.className='m3d-pop';pop.setAttribute('aria-hidden','true');document.body.appendChild(pop);let v=null,cur='',tm;
  const show=async(a)=>{const n=a.dataset.player;if(!NAME.test(n))return;const r=a.getBoundingClientRect();pop.style.left=Math.min(innerWidth-180,Math.max(8,r.left+r.width/2-80))+'px';pop.style.top=(r.top+scrollY-232)+'px';if(r.top<240)pop.style.top=(r.bottom+scrollY+8)+'px';pop.classList.add('on');
   if(cur===n)return;cur=n;try{await load();if(!v){const cv=document.createElement('canvas');v=new skinview3d.SkinViewer({canvas:cv,width:160,height:220,zoom:.86,fov:40});v.controls.enableZoom=false;v.controls.enablePan=false;v.controls.enableRotate=false;v.globalLight.intensity=2.6;v.cameraLight.intensity=.7;v.animation=new skinview3d.WalkingAnimation();v.animation.speed=.7;v.playerObject.rotation.y=-.5;pop.appendChild(cv)}v.renderPaused=false;await v.loadSkin(skin(n))}catch(_){}};
  const hide=()=>{pop.classList.remove('on');if(v)v.renderPaused=true};
  root.addEventListener('pointerover',e=>{const a=e.target.closest(sel);if(!a||e.pointerType!=='mouse')return;clearTimeout(tm);tm=setTimeout(()=>show(a),120)});
  root.addEventListener('pointerout',e=>{const a=e.target.closest(sel);if(!a||(e.relatedTarget&&a.contains(e.relatedTarget)))return;clearTimeout(tm);hide()});
  addEventListener('scroll',hide,{passive:true})}
};
// Profil-Bausteine: Header, KPI-Leiste, Tabs (leere Abschnitte werden nicht gerendert)
const NF=v=>(+v).toLocaleString('de-DE');
const MS=ms=>{ms=+ms||0;const m=Math.floor(ms/60000),s=Math.floor(ms%60000/1000),c=Math.floor(ms%1000/10);return (m?m+':'+String(s).padStart(2,'0'):s)+','+String(c).padStart(2,'0')+(m?' min':' s')};
const AGO=t=>{const d=new Date(typeof t==='number'&&t<1e12?t*1000:t);if(isNaN(d))return '';const s=(Date.now()-d)/1000;if(s<120)return 'gerade eben';if(s<3600)return 'vor '+Math.floor(s/60)+' Min';if(s<86400)return 'vor '+Math.floor(s/3600)+' Std';if(s<86400*30)return 'vor '+Math.floor(s/86400)+' T';return d.toLocaleDateString('de-DE',{dateStyle:'medium'})};
const HEX=/^#[0-9A-F]{6}$/i,TC=o=>[o&&o.team_color,o&&o.team_color_hex].find(v=>typeof v==='string'&&HEX.test(v))||null;
const SEEN=t=>{const d=new Date(typeof t==='number'&&t<1e12?t*1000:t);return isNaN(d)?null:d.toLocaleString('de-DE',{timeZone:'Europe/Berlin',dateStyle:'short',timeStyle:'short'})+' Uhr'};
window.MCP={NF,MS,AGO,E,TC,SEEN,
 header:o=>'<div class="pf-hd">'+MC3D.html(o.name,'pf-model',96)+'<div class="pf-info"><p class="pf-eyb">'+E(o.eyebrow||'Spieler')+'</p><h1 class="pf-name">'+E(o.name)+(o.rank||'')+'</h1>'+(o.sub?'<p class="pf-sub">'+o.sub+'</p>':'')+
  ((o.meta||[]).filter(x=>x&&x[1]!=null&&x[1]!=='').length?'<dl class="pf-meta">'+o.meta.filter(x=>x&&x[1]!=null&&x[1]!=='').map(([k,v,ic,x])=>'<div><dt>'+(ic?'<img alt="" width="16" height="16" src="/mc-icon/v2/'+ic+'">':'')+E(k)+'</dt><dd class="tnum">'+(x&&x.online?'<span class="pf-on">Online</span>':'<span'+(x&&x.color&&HEX.test(x.color)?' class="pf-team" style="color:'+x.color+'"':x&&x.seen?' class="pf-seen"':'')+'>'+E(v)+'</span>')+'</dd></div>').join('')+'</dl>':'')+(o.extra||'')+'</div></div>',
 kpi:t=>{t=t.filter(x=>x&&x[1]!=null&&x[1]!=='').slice(0,6);return t.length?'<div class="pf-kpi" style="--n:'+t.length+'">'+t.map(([k,v,ic,sub])=>'<div class="pf-tile"><span class="slot"><img alt="" width="28" height="28" loading="lazy" src="/mc-icon/v2/'+encodeURIComponent(ic||'paper')+'"></span><div><div class="k">'+E(k)+'</div><div class="v tnum">'+E(v)+'</div>'+(sub?'<div class="s">'+E(sub)+'</div>':'')+'</div></div>').join('')+'</div>':''},
 tabs:(id,list)=>{list=list.filter(x=>x&&x[2]);if(!list.length)return '';const want=(location.hash.slice(1)||'').toLowerCase();const sel=list.some(x=>x[0]===want)?want:list[0][0];
  return '<div class="pf-tabs" id="'+id+'"><div class="pf-tl" role="tablist">'+list.map(([k,l,,ic])=>'<button type="button" role="tab" id="t-'+k+'" aria-controls="p-'+k+'" aria-selected="'+(k===sel)+'" tabindex="'+(k===sel?0:-1)+'" data-k="'+k+'">'+(ic?'<img alt="" width="18" height="18" src="/mc-icon/v2/'+ic+'">':'')+E(l)+'</button>').join('')+'</div>'+list.map(([k,,h])=>'<div class="pf-panel" role="tabpanel" id="p-'+k+'" aria-labelledby="t-'+k+'"'+(k===sel?'':' hidden')+'>'+h+'</div>').join('')+'</div>'},
 bindTabs(root){const T=root&&root.querySelector('.pf-tl');if(!T)return;const B=[...T.querySelectorAll('[role=tab]')];const pick=b=>{B.forEach(x=>{const on=x===b;x.setAttribute('aria-selected',on);x.tabIndex=on?0:-1;document.getElementById('p-'+x.dataset.k).hidden=!on});history.replaceState(null,'','#'+b.dataset.k);MC3D.scan(root)};
  T.addEventListener('click',e=>{const b=e.target.closest('[role=tab]');if(b)pick(b)});T.addEventListener('keydown',e=>{const i=B.indexOf(document.activeElement);if(i<0)return;const j=e.key==='ArrowRight'?(i+1)%B.length:e.key==='ArrowLeft'?(i-1+B.length)%B.length:-1;if(j<0)return;e.preventDefault();B[j].focus();pick(B[j])})},
 // PvP + Parkour eines Spielers (öffentliche APIs)
 async games(n){const [pv,pk]=await Promise.all([fetch('/api/mc-pvp/'+encodeURIComponent(n)).then(r=>r.ok?r.json():null).catch(()=>null),fetch('/api/mc-parkour').then(r=>r.ok?r.json():null).catch(()=>null)]);
  const pretty=k=>String(k||'').split('_').filter(Boolean).map(w=>w.charAt(0).toUpperCase()+w.slice(1)).join(' ')||String(k||'');
  const cname=(c,nm)=>{nm=nm||'';if(!nm||nm===c||(nm.includes('_')&&!/\s/.test(nm)))return pretty(nm&&nm!==c?nm:c);return nm};
  const cicon=(c,i)=>{i=i||'';if(c==='house_climb'&&(!i||i==='paper'))return 'ladder';return /^[a-z0-9_]{1,48}$/.test(i)?i:'paper'};
  const runs=[];for(const[c,L]of Object.entries((pk&&pk.courses)||{}))for(const x of L)if(String(x.mc_name).toLowerCase()===n.toLowerCase())runs.push({course:c,name:cname(c,x.course_name||(pk.course_names||{})[c]),icon:cicon(c,x.course_icon||(pk.course_icons||{})[c]),rank:x.rank,ms:x.time_ms});runs.sort((a,b)=>a.ms-b.ms);
  const qOf=pv=>{if(!pv)return null;const m=+pv.matches||0;if(!(m>0))return '0 %';let q=pv.winrate_pct;if(q==null||q===''){const d=(+pv.wins||0)+(+pv.losses||0);q=Math.round(100*(+pv.wins||0)/(d||m))}return NF(+q)+' %'};
  const wr=pv?qOf(pv):null;
  const one=runs.length===1;
  const pkh=runs.length?'<div class="g pad dcard pk-card'+(one?' pk-one':'')+'"><h3>Parkour<small>'+(one?'Beste Platzierung':'Top-10-Platzierungen')+'</small></h3>'+runs.map(r=>{const rk=Number(r.rank),sz=one?40:22;return '<div class="prow pk-run"><span class="slot ic"><img alt="" width="'+sz+'" height="'+sz+'" loading="lazy" src="/mc-icon/v2/'+encodeURIComponent(r.icon)+'" onerror="this.onerror=null;this.src=\'/mc-icon/v2/paper\'"></span><div class="n"><span><a href="/parkour#'+encodeURIComponent(r.course)+'">'+E(r.name)+'</a></span></div><span class="pk-rk tnum'+(rk>=1&&rk<=3?' p'+rk:'')+'" title="Platz '+E(rk)+'">#'+E(rk)+'</span><b class="pk-tm tnum">'+MS(r.ms)+'</b></div>'}).join('')+'</div>':'';
  return {pvp:pv,winrate:wr,best:runs[0]||null,parkourHtml:pkh}}
};
})();
