// Bank-Direktkauf auf der Item-Seite: gleiche Queue + Server-Prüfung wie Shop-Orders (type bank_buy)
(async()=>{const{E,NM,NF,CP,get,post}=MC;const B=document.getElementById('bbuy');if(!B)return;const id=B.dataset.item;
let d,v;try{[d,v]=await Promise.all([get('/api/mc-market/'+encodeURIComponent(id)),get('/api/mc-bestellungen').catch(()=>({}))])}catch(_){return}
const x=d&&d.item;if(!x)return;B.hidden=false;
const head='<h2 class="hub-h2" style="font-size:1.2rem;margin:0">Bei der Bank kaufen</h2>';
if(x.buy_locked||!(+x.buy_price>0)){B.innerHTML=head+'<p class="mut" style="margin:.6rem 0 0">'+E(NM(id))+' ist bei der Bank nicht kaufbar.</p>';return}
if(!v.logged_in){B.innerHTML=head+'<p class="mut" style="margin:.6rem 0">Zum Kaufen mit Discord anmelden.</p><a class="btn discord sm" href="https://nwebnotfound.dev/auth/discord/login?next='+encodeURIComponent(location.href)+'">Mit Discord anmelden</a>';return}
if(!v.can){B.innerHTML=head+'<p class="mut" style="margin:.6rem 0">'+(v.linked?'Dein Account ist nicht bestätigt oder dir fehlt die Server-Rolle.':'Verknüpfe zuerst deinen Minecraft-Account im Discord mit /link.')+'</p><a class="btn sec sm" href="/profile">Zum Profil</a>';return}
B.innerHTML=head+'<p class="mut" style="margin:.4rem 0 0;font-size:.9rem">Aktuell ca. <b class="tnum">'+CP(x.buy_price)+'</b> pro Stück. Der Server prüft beim Ausführen Preis, Tageslimit und Kontostand; die Items landen in deinem Abholfach (<code>/abholen</code>).</p>'
+'<form class="bbuy" id="bbf"><label>Menge<input type="number" id="bba" min="1" max="2304" value="1" inputmode="numeric" required></label><label>Summe ca.<output id="bbt" class="tnum" style="min-height:44px;display:flex;align-items:center;color:var(--c-fg)">'+CP(x.buy_price)+'</output></label><button class="btn go" id="bbb">Kaufen</button></form>'
+'<div class="cf-turnstile" data-sitekey="'+E(B.dataset.sitekey)+'" data-theme="dark" data-size="flexible" style="margin-top:.6rem"></div><p class="mut" id="bbm" role="status" style="font-size:.9rem;margin:.6rem 0 0"></p>';
const A=document.getElementById('bba'),T=document.getElementById('bbt'),M=document.getElementById('bbm'),F=document.getElementById('bbf');
const tsr=()=>{try{window.turnstile&&turnstile.render&&!B.querySelector('.cf-turnstile iframe')&&turnstile.render(B.querySelector('.cf-turnstile'))}catch(_){}};setTimeout(tsr,400);
A.oninput=()=>{T.textContent=CP((+A.value||0)*x.buy_price)};
let RID=crypto.randomUUID();F.onsubmit=async e=>{e.preventDefault();const amount=Math.floor(+A.value);if(!(amount>=1&&amount<=2304)){M.textContent='Menge 1 bis 2304';M.className='dn';return}
const btn=document.getElementById('bbb');btn.disabled=true;const tk=(B.querySelector('[name="cf-turnstile-response"]')||{}).value;
const r=await post('/api/mc-shop-order',{type:'bank_buy',item:id,amount,request_id:RID,turnstile:tk||undefined});if(r.ok)RID=crypto.randomUUID();btn.disabled=false;try{window.turnstile&&turnstile.reset()}catch(_){}
M.innerHTML=r.ok?'Kauf gesendet ('+NF(amount)+'× '+E(NM(id))+'), wird vom Server bestätigt. <a href="/bestellungen">Zu deinen Bestellungen ›</a>':E(r.j.error||'Fehler');M.className=r.ok?'up':'dn'}})();
