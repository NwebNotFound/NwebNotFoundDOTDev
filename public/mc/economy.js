// Economy-Tageswerte auf /markt: Geldmenge als Stufen-Graph, Tabelle mit Geschöpft/Vernichtet/Netto ('–' bei null). Keine Inline-Styles (CSP).
(async()=>{const R=document.getElementById('econ');if(!R)return;const{E,NF,get}=window.MC;
let d;try{d=await get('/api/mc-economy')}catch(_){d={days:[]}}
const D=(d.days||[]).filter(x=>x&&/^\d{4}-\d{2}-\d{2}$/.test(x.day));
const V=v=>v===null||v===undefined?'–':NF(v)+' CP';const S=v=>v===null||v===undefined?'–':(v>0?'+':'')+NF(v)+' CP';
const DL=s=>new Date(s+'T00:00:00Z').toLocaleDateString('de-DE',{day:'2-digit',month:'2-digit',timeZone:'UTC'});
const H='<h2 class="hub-h2 econ-h">Geldmenge</h2><p class="mut econ-sub">Alle CP auf dem Server, ein Wert pro Tag (letzte 90 Tage).</p>';
if(!D.length){R.innerHTML='<div class="g pad">'+H+'<p class="mut">Noch keine Economy-Daten.</p></div>';return}
const W=720,Ht=200,PL=8,PR=8,PT=10,PB=22,vs=D.map(x=>+x.money_supply_cp),mn=Math.min(...vs),mx=Math.max(...vs),rg=mx-mn||1,n=D.length;
const X=i=>(PL+i/n*(W-PL-PR)).toFixed(1),Y=v=>(PT+(1-(v-mn)/rg)*(Ht-PT-PB)).toFixed(1);
let p='M'+X(0)+','+Y(vs[0]);for(let i=0;i<n;i++){if(i)p+='V'+Y(vs[i]);p+='H'+X(i+1)}
const area=p+'V'+(Ht-PB)+'H'+X(0)+'Z';
const lb=[0,Math.floor((n-1)/2),n-1].filter((v,i,a)=>a.indexOf(v)===i).map(i=>'<text class="econ-ax" x="'+X(i)+'" y="'+(Ht-6)+'">'+E(DL(D[i].day))+'</text>').join('');
const svg='<svg class="econ-svg" viewBox="0 0 '+W+' '+Ht+'" preserveAspectRatio="none" role="img" aria-label="Geldmenge von '+E(DL(D[0].day))+' bis '+E(DL(D[n-1].day))+': '+E(V(vs[n-1]))+'"><path class="econ-area" d="'+area+'"/><path class="econ-line" d="'+p+'"/>'+lb+'</svg>';
const last=D[n-1];const kp='<div class="kp econ-kp"><div class="g pad"><div class="k">Geldmenge</div><div class="v tnum">'+E(V(last.money_supply_cp))+'</div></div><div class="g pad"><div class="k">Geschöpft</div><div class="v tnum">'+E(V(last.minted_cp))+'</div></div><div class="g pad"><div class="k">Vernichtet</div><div class="v tnum">'+E(V(last.burned_cp))+'</div></div><div class="g pad"><div class="k">Netto</div><div class="v tnum">'+E(S(last.net_cp))+'</div></div></div>';
const rows=D.slice().reverse().slice(0,14).map(x=>'<tr><td>'+E(DL(x.day))+'</td><td class="tnum">'+E(V(x.money_supply_cp))+'</td><td class="tnum">'+E(V(x.minted_cp))+'</td><td class="tnum">'+E(V(x.burned_cp))+'</td><td class="tnum">'+E(S(x.net_cp))+'</td></tr>').join('');
R.innerHTML='<div class="g pad" id="econ-card">'+H+kp+'<div class="econ-chart">'+svg+'</div><div class="econ-tw"><table class="econ-t"><thead><tr><th>Tag</th><th>Geldmenge</th><th>Geschöpft</th><th>Vernichtet</th><th>Netto</th></tr></thead><tbody>'+rows+'</tbody></table></div>'+(d.updated_at?'<p class="mut econ-st">Stand: '+E(new Date(d.updated_at).toLocaleString('de-DE',{dateStyle:'medium',timeStyle:'short'}))+'</p>':'')+'</div>'})();
