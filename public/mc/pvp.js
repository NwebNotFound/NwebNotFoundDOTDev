// PvP-Rangliste (/pvp) und PvP-Block auf /spieler/<name>. Keine Inline-Styles (CSP). Freitext (favorite_kit) immer escapen.
(()=>{const{E,NF,get}=window.MC;
const RL={vip:'VIP',mvp:'MVP',builder:'Builder',admin:'Admin'};
const RB=p=>p.rank&&RL[p.rank.rank]&&/^[0-9a-f]$/.test(p.rank.color)?'<span class="rk rk-'+p.rank.color+'">'+RL[p.rank.rank]+'</span>':'';
const WR=p=>{const m=+p.matches||0;if(!(m>0))return '0 %';let q=p.winrate_pct;if(q==null||q===''){const d=(+p.wins||0)+(+p.losses||0);q=Math.round(100*(+p.wins||0)/(d||m))}return NF(+q)+' %'};
const KIT=p=>p.favorite_kit?E(p.favorite_kit):'–';
const T=document.getElementById('pvp');
if(T)(async()=>{let d;try{d=await get('/api/mc-pvp')}catch(_){d={players:[]}}const L=d.players||[];
if(!L.length){T.innerHTML='<div class="g empty-st" id="pvp-empty"><h2 class="hub-h2">Noch keine Kämpfe</h2><p class="mut">Sobald in der Arena gekämpft wird, steht die Rangliste hier.</p></div>';return}
T.innerHTML='<div class="g pvp-tw"><table class="pvp-t"><thead><tr><th>#</th><th>Spieler</th><th class="n">Siege</th><th class="n">Niederl.</th><th class="n">Kämpfe</th><th class="n">Quote</th><th>Lieblings-Kit</th></tr></thead><tbody>'+
L.map((p,i)=>'<tr><td class="pos">'+(i+1)+'</td><td class="pl"><a href="/spieler/'+encodeURIComponent(p.name)+'">'+E(p.name)+'</a>'+RB(p)+'</td><td class="n">'+NF(p.wins)+'</td><td class="n">'+NF(p.losses)+'</td><td class="n">'+NF(p.matches)+'</td><td class="n">'+WR(p)+'</td><td class="kit">'+KIT(p)+'</td></tr>').join('')+'</tbody></table></div><p class="mut pvp-note">Best of 3, ohne Unentschieden. Quote = Siege / Kämpfe, auch unter 5 Kämpfen.</p>'})();
const P=document.getElementById('pvp-pl');
if(P&&/^[A-Za-z0-9_]{1,16}$/.test(P.dataset.name||''))(async()=>{let p;try{p=await get('/api/mc-pvp/'+encodeURIComponent(P.dataset.name))}catch(_){return}
P.innerHTML='<h2 class="hub-h2 pvp-ph">PvP</h2><div class="pstats">'+[['Siege',NF(p.wins)],['Niederlagen',NF(p.losses)],['Siegquote',WR(p)],['Lieblings-Kit',KIT(p)]].map(([k,v])=>'<div class="g"><div class="k">'+k+'</div><div class="v tnum">'+v+'</div></div>').join('')+'</div>';P.hidden=false})();
})();
