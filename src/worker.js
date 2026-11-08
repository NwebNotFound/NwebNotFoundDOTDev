import { AV } from "./asset-version.js";
import { cleanEconomy, economyStatements, economyApi } from "./mc-economy.js";
import { cleanRanks, rankStatements } from "./mc-ranks.js";
import { cleanPvp, pvpStatements, pvpApi, pvpPlayerApi, pvpBody } from "./mc-pvp.js";
import { vipApi, vipBody } from "./mc-vip.js";
import { makeVip } from "./mc-vip-cmd.js";
import { resolveIcon, TEX_BASE, ICON_ID_RE } from "./mc-icon.js";
import { mobIcon } from "./mc-mob.js";
import { headResponse, skinResponse, validSkinUrl } from "./mc-head.js";
import { mainNav, mainItems, UNAV_HEAD, UNAV_JS } from "./unav.js";
import { bundleResponse, stampedAsset, STAMPED_HTML } from "./bundle.js";
import { HUB_CSS, hubNav, homeBody, marketBody, marketItemBody, WIKI, wikiIndexBody, wikiArticleBody, shopsBody, shopBody, auctionsBody, auctionBody } from "./mc-hub.js";
import { playersApi, playerApi, playersBody, playerBody } from "./mc-players.js";
import { makeFeedback, feedbackBody } from "./mc-feedback.js";
import { makeTrade, cleanShops, cleanAuctions, blobStatement } from "./mc-trade.js";
import { normInv, renderInventoryCard } from "./mc-inventory.js";
import { changelogBody } from "./mc-changelog.js";
import { cleanParkour, parkourStatements, parkourApi, parkourBody } from "./mc-parkour.js";
import { navReady, sitePage } from "./hub.js";
import { nwebosPage, nwebosChoice, nwebosRoute } from "./nwebos.js";
import { blogList, blogPost, changelog as osChangelog, changelogFeed as osChangelogFeed, writing as osWriting, chapter as osChapter, text as osText, profile as osProfile, notfound as osNotfound } from "./nwebos-apps.js";
import { CONTENT } from "./generated/content.js";
import { publishedWriting, chaptersOf, findWriting } from "./content.js";
import { makeBlog } from "./blog.js";
import { FEEDS } from "./generated/feeds.js";
import { feedFor, matchesEtag } from "./feed.js";
import { epubPath, seriesEpubPath } from "./epub.js";
import { LANG_COOKIE, pickLang, splitLang, langCookie, withLang } from "./i18n/index.js";
import { safeDecode } from "./safe-decode.js";
import { verifyTurnstile } from "./turnstile.js";
import { purge } from "./purge.js";
// nwebnotfound.dev – Portfolio (nwebnotfound.dev) + Minecraft-Bereich (mc.nwebnotfound.dev) + Discord-Login
const SITEKEY = "0x4AAAAAAFplEJyvitu_qwlx";
const MAIN = "nwebnotfound.dev", MCD = "mc.nwebnotfound.dev", MC_HOST = "mc.nwebnotfound.dev";
const COOKIE = "nnf_session", SESSION_DAYS = 30;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const authReady = (env) => !!(env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET && env.SESSION_SECRET);

/* ---------- gemeinsames CSS ---------- */
const BASE_CSS = `@view-transition{navigation:auto}
*,*::before,*::after{box-sizing:border-box}html{-webkit-text-size-adjust:100%;scroll-behavior:smooth}
body{margin:0;font-family:var(--ds-font-sans,-apple-system,BlinkMacSystemFont,"SF Pro Text",system-ui,"Segoe UI",Roboto,Helvetica,Arial,sans-serif);background:var(--bg);color:var(--fg);line-height:1.5;-webkit-font-smoothing:antialiased;letter-spacing:-.01em}
a{color:var(--link);text-decoration:none}a:hover{text-decoration:underline}
img{max-width:100%;display:block}
.wrap{width:var(--ds-container,min(1080px,100% - 2.5rem));margin-inline:auto}
.brand{white-space:nowrap;font-weight:600;color:var(--fg);font-size:1.02rem;margin-right:auto;display:flex;align-items:center;gap:.5rem}.brand:hover{text-decoration:none}
.only-s{display:none}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:var(--ds-space-2,8px);border:0;border-radius:var(--ds-radius-full,980px);min-height:44px;padding:0 1.25rem;line-height:1.2;white-space:nowrap;max-width:100%;font:inherit;font-size:.95rem;font-weight:500;cursor:pointer;background:var(--acc);color:var(--accfg);transition:transform var(--ds-duration,180ms) var(--ds-ease-out,cubic-bezier(.2,.8,.2,1)),opacity var(--ds-duration,180ms) ease,background var(--ds-duration,180ms)}
.btn:hover{text-decoration:none;transform:translateY(-1px)}.btn:active{transform:scale(.98)}
.btn.sec{background:transparent;color:var(--link);box-shadow:inset 0 0 0 1px currentColor}
.btn.sm{min-height:36px;padding:0 .95rem;font-size:.84rem;position:relative}.btn.sm::before{content:"";position:absolute;inset:-4px -2px}
@media(pointer:coarse){.btn.sm{min-height:40px}}
.btn[disabled]{opacity:.5;cursor:not-allowed;transform:none}
.discord{background:var(--acc);color:var(--accfg)}
.discord:disabled{background:var(--line);color:var(--mut);box-shadow:none;cursor:not-allowed;transform:none}
.mut{color:var(--mut)}
.eyebrow{font-size:.85rem;font-weight:600;color:var(--acc2);letter-spacing:.02em;margin:0 0 .6rem}
h1,h2,h3{letter-spacing:-.025em;line-height:1.08;margin:0}
.h-xl{font-size:var(--ds-text-display,clamp(2.6rem,8vw,5rem));font-weight:var(--ds-weight-bold,700)}
.h-l{font-size:clamp(2rem,5vw,3.2rem);font-weight:700}
.lead{font-size:clamp(1.1rem,2.4vw,1.4rem);color:var(--mut);max-width:40ch;margin:1.1rem auto 0}
section{padding:var(--ds-section-space,clamp(3.5rem,9vw,7rem)) 0}
.center{text-align:center}
.grid{display:grid;gap:1.1rem;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))}
.card{background:var(--card);border-radius:var(--ds-radius-2xl,22px);padding:clamp(1.4rem,3vw,2rem);border:1px solid var(--line);transition:transform var(--ds-duration-slow,320ms) var(--ds-ease-out,cubic-bezier(.2,.8,.2,1)),box-shadow var(--ds-duration-slow,320ms)}
a.card{color:inherit;display:block}a.card:hover{text-decoration:none;transform:translateY(-4px);box-shadow:var(--ds-shadow-2,0 18px 40px -18px var(--shadow))}
.card h3{font-size:1.3rem;margin-bottom:.45rem}.card p{margin:.3rem 0;color:var(--mut)}
.more{color:var(--link);font-weight:500;margin-top:.9rem;display:inline-block}
footer{border-top:1px solid var(--line);padding:2rem 0 calc(2.6rem + env(safe-area-inset-bottom));font-size:.78rem;color:var(--mut)}
footer .wrap{display:flex;flex-wrap:wrap;gap:.6rem 1.4rem;justify-content:space-between}
input,textarea{width:100%;padding:.8rem 1rem;margin:.35rem 0 1rem;background:var(--field);color:var(--fg);border:1px solid var(--line);border-radius:var(--ds-radius-lg,12px);font:inherit;transition:border-color var(--ds-duration,180ms),box-shadow var(--ds-duration,180ms)}
input:focus,textarea:focus{outline:none;border-color:var(--acc);box-shadow:0 0 0 4px var(--ring)}
:focus-visible{outline:2px solid var(--acc);outline-offset:2px}
.js .reveal{opacity:0;transform:translateY(24px);transition:opacity var(--ds-duration-slow,250ms) var(--ds-ease-out,cubic-bezier(.2,.8,.2,1)),transform var(--ds-duration-slow,250ms) var(--ds-ease-out,cubic-bezier(.2,.8,.2,1))}
.js .reveal.in{opacity:1;transform:none}
.d1{transition-delay:.08s}.d2{transition-delay:.16s}.d3{transition-delay:.24s}
@media (max-width:420px){.brand{font-size:.95rem}}@media (max-width:640px){.only-s{display:inline}.hide-s{display:none}input,textarea,select{font-size:16px}}@media (pointer:coarse){.btn.sm{min-height:44px;display:inline-flex;align-items:center}}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}.js .reveal{opacity:1;transform:none}@view-transition{navigation:none}}`;

// Farben, Abstände, Typo, Radien und Schatten: siehe DESIGN.md und /design/tokens.css.
// Dieses Stylesheet benutzt nur noch die Aliasnamen (--bg, --fg, --acc, ...), die tokens.css
// auf die --ds-*-Tokens abbildet. Auch der Dark-Mode kommt von dort (prefers-color-scheme).
const PORT_CSS = `.hero{padding-top:clamp(4.5rem,12vw,9rem)}
.grad{background:linear-gradient(90deg,#0071e3,#a855f7 50%,#ff6b35);-webkit-background-clip:text;background-clip:text;color:transparent}
.alt{background:var(--alt,var(--ds-surface-2,#f5f5f7))}
.tag{display:inline-block;font-size:.72rem;font-weight:600;padding:.2rem .6rem;border-radius:var(--ds-radius-full,99px);background:var(--line);color:var(--mut);margin-bottom:.8rem}
.entry{display:flex;align-items:flex-end;gap:.9rem;padding:0;border:0}
.entry .bub{flex:1;min-width:0;padding:.9rem 1.1rem;border-radius:20px 20px 20px 6px;background:var(--card);box-shadow:inset 0 0 0 1px var(--line),var(--ds-shadow-2,0 18px 40px -18px var(--shadow))}
.entry .bub .hd{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:.4rem 1rem}
.av{width:44px;height:44px;border-radius:12px;flex:none;background:var(--panel2);display:grid;place-items:center;font-weight:700;color:var(--mut);overflow:hidden}
.entry p{margin:.4rem 0 0;white-space:pre-wrap;word-break:break-word;line-height:1.6}`;

// Summer Theme v2 for the portfolio surface (`/portfolio`, `/guestbook`, `/profile`, 404).
// Same look as the Creative Hub (public/design/summer.css), but these pages stay in the portfolio
// shell: the Discord account chip, Turnstile and the guestbook script all hang off BASE_CSS, so this
// block only re-maps the alias tokens (--bg, --fg, --acc …) to the v2 palette and restyles the
// components. It never touches the Minecraft surface (html.mc) or the AI panel.
const PORT_V2_CSS = `
@font-face{font-family:"SmPixel";src:url("/design/fonts/pixelify-sans-latin-400.woff2") format("woff2");font-weight:400;font-display:swap}
@font-face{font-family:"SmPixel";src:url("/design/fonts/pixelify-sans-latin-700.woff2") format("woff2");font-weight:700;font-display:swap}
@font-face{font-family:"SmBody";src:url("/design/fonts/nunito-latin-400.woff2") format("woff2");font-weight:400;font-display:swap}
@font-face{font-family:"SmBody";src:url("/design/fonts/nunito-latin-700.woff2") format("woff2");font-weight:700;font-display:swap}
:root{--px-font:"SmPixel",ui-monospace,Menlo,monospace;
--sky1:#9ad8ff;--sky2:#e6f6ff;--bg:#f4faff;--bg2:#e8f4ff;--card:#ffffff;--panel2:#eff6fe;
--fg:#1f2a44;--mut:#55648a;--line:rgba(31,42,68,.10);--strong:rgba(31,42,68,.18);--edge:#647aa0;
--acc:#ffd45e;--accfg:#2a2410;--sunedge:#e2a52a;--link:#0e6b63;--linkh:#0a4f49;
--navbg:rgba(255,255,255,.74);--field:#eff6fe;--ring:rgba(11,92,138,.3);--cream:#fff7e6;--cheek:#ff9fbf;
--grass:#7bd389;--dirt:#c98f5b;
--sh1:0 1px 2px rgba(31,42,68,.06),0 14px 34px -14px rgba(31,42,68,.22);
--sh2:0 2px 4px rgba(31,42,68,.06),0 22px 44px -16px rgba(31,42,68,.30)}
@media (prefers-color-scheme: dark){:root:not([data-theme]){--sky1:#0b1330;--sky2:#243461;--bg:#10172e;--bg2:#0b1124;
--card:#18213e;--panel2:#1f2a4b;--fg:#f1f5ff;--mut:#aab6d4;--line:rgba(255,255,255,.08);--strong:rgba(255,255,255,.16);--edge:#7f8fbd;
--acc:#ffd45e;--accfg:#1a1633;--sunedge:#c48712;--link:#7fe0d3;--linkh:#a6ece2;--navbg:rgba(20,28,54,.72);
--field:#1f2a4b;--ring:rgba(127,224,211,.3);--cream:#fff3d9;--cheek:#ff8fb4;--grass:#4fa86a;--dirt:#8a5d3a;
--sh1:0 1px 2px rgba(0,0,0,.3),0 16px 36px -16px rgba(0,0,0,.6);--sh2:0 2px 4px rgba(0,0,0,.3),0 24px 48px -16px rgba(0,0,0,.7)}}
/* Summer Night as an explicit choice (the theme switch in the header, same keys as the hub). */
:root[data-theme="summer-night"]{--sky1:#0b1330;--sky2:#243461;--bg:#10172e;--bg2:#0b1124;
--card:#18213e;--panel2:#1f2a4b;--fg:#f1f5ff;--mut:#aab6d4;--line:rgba(255,255,255,.08);--strong:rgba(255,255,255,.16);--edge:#7f8fbd;
--acc:#ffd45e;--accfg:#1a1633;--sunedge:#c48712;--link:#7fe0d3;--linkh:#a6ece2;--navbg:rgba(20,28,54,.72);
--field:#1f2a4b;--ring:rgba(127,224,211,.3);--cream:#fff3d9;--cheek:#ff8fb4;--grass:#4fa86a;--dirt:#8a5d3a;
--sh1:0 1px 2px rgba(0,0,0,.3),0 16px 36px -16px rgba(0,0,0,.6);--sh2:0 2px 4px rgba(0,0,0,.3),0 24px 48px -16px rgba(0,0,0,.7)}
body{background-color:var(--bg);background-image:linear-gradient(180deg,var(--sky1) 0,var(--sky2) 360px,var(--bg) 640px);background-repeat:no-repeat}
.px{shape-rendering:crispEdges;image-rendering:pixelated}
img[src^="/mc-icon/"]{image-rendering:pixelated}
.pxfont{font-family:var(--px-font)}
.btn{border-radius:14px;min-height:48px;padding:0 22px;font-size:1rem;font-weight:700;background:var(--acc);color:var(--accfg);box-shadow:0 3px 0 var(--sunedge),0 10px 22px -10px rgba(226,165,42,.8);transition:transform .22s cubic-bezier(.34,1.56,.64,1),box-shadow .22s ease,background-color .3s ease}
.btn:hover{transform:translateY(-2px);box-shadow:0 5px 0 var(--sunedge),0 14px 26px -10px rgba(226,165,42,.85)}
.btn:active{transform:translateY(2px);box-shadow:0 1px 0 var(--sunedge);transition-duration:.08s}
.btn.sec{background:var(--card);color:var(--fg);box-shadow:inset 0 0 0 1px var(--edge),0 3px 0 var(--line)}
.btn.sec:hover{box-shadow:inset 0 0 0 1px var(--edge),0 5px 0 var(--line)}
.btn.sm{min-height:40px;padding:0 16px;font-size:.9rem;border-radius:12px}
.card{border:0;border-radius:22px;background:var(--card);box-shadow:inset 0 0 0 1px var(--line),var(--sh1);padding:clamp(1.2rem,3vw,1.5rem);transition:transform .3s cubic-bezier(.34,1.56,.64,1),box-shadow .3s ease}
a.card:hover{transform:translateY(-5px) rotate(-.4deg);box-shadow:inset 0 0 0 1px var(--strong),var(--sh2)}
.card h3{font-size:1.25rem;font-weight:900;letter-spacing:-.02em}
.tag{font-size:.75rem;font-weight:800;padding:.2rem .6rem;border-radius:999px;background:var(--panel2);color:var(--mut);box-shadow:inset 0 0 0 1px var(--line)}
.more{color:var(--link);font-weight:800}
.ph{padding:clamp(2rem,6vw,3.5rem) 0 2rem}
.pk{margin:0;display:inline-flex;align-items:center;gap:.5rem;font-family:var(--px-font);font-size:.9rem;color:var(--mut)}
.pk::before{content:"";width:10px;height:10px;flex:none;background:var(--sunedge);clip-path:polygon(40% 0,60% 0,60% 40%,100% 40%,100% 60%,60% 60%,60% 100%,40% 100%,40% 60%,0 60%,0 40%,40% 40%)}
.h1x{margin:.75rem 0 0;font-family:var(--px-font);font-size:clamp(2.1rem,5vw,3.25rem);font-weight:700;line-height:1.05;letter-spacing:-.01em}
.h-l{font-family:var(--px-font);font-weight:700;letter-spacing:-.01em}
.lead{margin:1rem 0 0;font-size:1.1875rem;line-height:1.55;color:var(--mut);max-width:56ch;font-weight:600}
.center .lead{margin-left:auto;margin-right:auto}
.alt{background:transparent}
.pgrid{display:grid;gap:20px;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr))}
.pcard{display:flex;flex-direction:column;padding:0;overflow:hidden}
.pcard .in{display:block;padding:1.4rem 1.5rem}
.pcard .in h3{margin:.1rem 0 .5rem}
.pcard .in p{margin:0}
.pcover{display:block;height:150px;position:relative;background-image:linear-gradient(180deg,var(--sky1),var(--sky2));overflow:hidden}
.pcover--mc{background-image:linear-gradient(180deg,#0b1a14,#16301f)}
.pcover--lav{background-image:linear-gradient(180deg,#c9b8ff,#e9e2ff)}
.rowcta{display:flex;flex-wrap:wrap;gap:.8rem;justify-content:center;margin-top:2rem}
.brand--sm{font-size:16px}
.pcover .ground{position:absolute;left:0;bottom:0;width:100%}
.pcover .ctr{position:absolute;inset:0;display:grid;place-items:center}
.pchips{display:flex;flex-wrap:wrap;gap:.4rem;margin:0 0 .7rem}
.hint{margin:.6rem 0 0;font-size:.85rem;color:var(--mut)}
.bub{min-width:0}
.form{padding:1.4rem 1.5rem;display:flex;flex-direction:column;gap:.9rem}
.gbwrap{max-width:720px;display:flex;flex-direction:column;gap:1.2rem}
.gb{padding-top:0}
#entries .entry+.entry{margin-top:1.1rem}
textarea{min-height:110px;padding:.8rem 1rem;border-radius:12px;background:var(--panel2);color:var(--fg);border:0;box-shadow:inset 0 0 0 1px var(--strong);font:inherit;font-size:16px;resize:vertical}
textarea:focus{outline:none;box-shadow:inset 0 0 0 2px var(--link),0 0 0 4px var(--ring)}
footer{border:0;background:var(--bg2);padding:0 0 calc(2rem + env(safe-area-inset-bottom));font-size:.82rem;color:var(--mut)}
footer .wrap{display:flex;flex-wrap:wrap;gap:16px 32px;align-items:center;justify-content:space-between;padding-top:24px}
footer .pnl{display:flex;flex-wrap:wrap;align-items:center;gap:4px}
footer .pnl a{display:inline-flex;align-items:center;border-radius:999px;font-weight:700;text-decoration:none;font-size:.82rem;color:var(--mut);min-height:36px;padding:0 10px}
footer .pnl a:hover{color:var(--fg)}
.grassline{display:block;width:100%;height:14px}
.e404{position:relative;overflow:hidden;text-align:center;padding:40px 0 80px}
.e404 .sky{position:absolute;inset:0;width:100%;height:320px}
.e404 .art{position:relative;display:inline-flex;align-items:flex-start;gap:4px}
.e404 .q{font-family:var(--px-font);font-size:3rem;color:var(--acc);margin-top:-8px}
@keyframes tilt404{0%,100%{transform:rotate(-6deg)}50%{transform:rotate(6deg)}}
@keyframes twinkle404{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.35;transform:scale(.7)}}
.e404 .pk{justify-content:center;margin-top:16px}
.e404 .lead{margin-inline:auto}
.tilt{animation:tilt404 2.4s ease-in-out infinite;transform-origin:50% 90%;transform-box:fill-box}
.tw{animation:twinkle404 2.6s ease-in-out infinite;transform-box:fill-box;transform-origin:center}
.sky .tw:nth-child(2){animation-delay:.7s}
.sky .tw:nth-child(3){animation-delay:1.3s}
.sky .tw:nth-child(4){animation-delay:.3s}
.sky .tw:nth-child(5){animation-delay:1.8s}
@media (prefers-reduced-motion: reduce){.tilt,.tw{animation:none}}
`;

// Minecraft-Sub-Theme: Palette, Pixel-Schrift, Slots und Bevels stehen als --ds-mc-* in
// /design/tokens.css (html.mc) und werden in /mc/ds.css auf die Altnamen --c-* gemappt.
const MC_CSS = `:root{--menubg:#1b2a24}

.px{font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;letter-spacing:0}

.hero{position:relative;isolation:isolate;padding-top:clamp(4rem,11vw,8rem)}
.block{width:56px;height:56px;margin:0 auto 1.6rem;image-rendering:pixelated;animation:float 6s ease-in-out infinite}
@keyframes float{50%{transform:translateY(-8px)}}
.status{display:flex;align-items:center;justify-content:center;gap:.7rem;font-size:clamp(1.4rem,4vw,2rem);font-weight:700;margin:0}
.dot{width:14px;height:14px;border-radius:50%;background:#6b7280;flex:none}
.dot.on{background:#22c55e;box-shadow:0 0 0 0 rgba(34,197,94,.6);animation:pulse 2s infinite}.dot.off{background:#ef4444}
@keyframes pulse{70%{box-shadow:0 0 0 12px rgba(34,197,94,0)}100%{box-shadow:0 0 0 0 rgba(34,197,94,0)}}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,180px),1fr));gap:1rem;margin-top:1.6rem}
.mcgrid{grid-template-columns:repeat(2,1fr)}@media(min-width:700px){.mcgrid{grid-template-columns:repeat(3,1fr)}}@media(min-width:1000px){.mcgrid{grid-template-columns:repeat(5,1fr)}}
.stat .k{font-size:.8rem;color:var(--mut)}.stat .v{font-size:1.6rem;font-weight:700;margin-top:.2rem}
.bar{height:6px;background:var(--line);border-radius:3px;margin-top:.6rem;overflow:hidden}.bar i{display:block;height:100%;width:0;background:var(--acc);transition:width var(--ds-duration-slow,250ms) var(--ds-ease-out,cubic-bezier(.2,.8,.2,1))}
.addr{display:inline-flex;align-items:center;gap:.6rem;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:.5rem .5rem .5rem 1rem;margin-top:2rem;max-width:100%}
.addr code{font-size:1rem;overflow:hidden;text-overflow:ellipsis}
.steps{counter-reset:s;list-style:none;padding:0;margin:0;display:grid;gap:1rem;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))}
.steps li{counter-increment:s;background:var(--card);border:1px solid var(--line);border-radius:22px;padding:1.6rem}
.steps li::before{content:counter(s);display:grid;place-items:center;width:34px;height:34px;border-radius:9px;background:var(--acc);color:var(--accfg);font-weight:700;margin-bottom:1rem}
.soon{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--acc);border:1px solid var(--ring);border-radius:6px;padding:.15rem .45rem;display:inline-block;margin-bottom:.8rem}${HUB_CSS}`;

const REVEAL_JS = `<script>(()=>{const els=document.querySelectorAll('.reveal');if(!('IntersectionObserver'in window)||matchMedia('(prefers-reduced-motion: reduce)').matches){els.forEach(e=>e.classList.add('in'));return}const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}}),{threshold:.12,rootMargin:'0px 0px -40px 0px'});els.forEach(e=>io.observe(e))})();</script>`;


const DISCORD_SVG = `<svg width="18" height="14" viewBox="0 0 71 55" fill="currentColor" aria-hidden="true"><path d="M60.1 4.9A58.5 58.5 0 0045.4.4a40 40 0 00-1.9 3.8 54 54 0 00-16.2 0A40 40 0 0025.4.4 58.4 58.4 0 0010.7 4.9C1.4 18.7-1.1 32.2.1 45.5a59 59 0 0018 9.1 43 43 0 003.8-6.2 38 38 0 01-6-2.9l1.5-1.1a42 42 0 0036 0l1.5 1.1a38 38 0 01-6 2.9 43 43 0 003.8 6.2 58.7 58.7 0 0018-9.1c1.5-15.4-2.5-28.8-10.6-40.6zM23.7 37.3c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2 6.5 3.3 6.4 7.2c0 4-2.8 7.2-6.4 7.2zm23.6 0c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2 6.5 3.3 6.4 7.2c0 4-2.8 7.2-6.4 7.2z"/></svg>`;

// The four faces every page renders with (SmPixel = Pixelify Sans, SmBody = Nunito, 400 + 700).
// Preloaded so the swap happens before first paint instead of shifting the nav and hero (CLS).
// The MC shell used to preload Monocraft, which no page uses since theme v2 (two wasted downloads).
const FONT_PRELOAD = ["pixelify-sans-latin-400", "pixelify-sans-latin-700", "nunito-latin-400", "nunito-latin-700"]
  .map((f) => `<link rel="preload" href="/design/fonts/${f}.woff2" as="font" type="font/woff2" crossorigin>`).join("");

function shell({ title, desc, css, nav, body, head = "", footer, themeColor }) {
  return `<!doctype html><html lang="de"${css === MC_CSS ? ' class="mc"' : ""}><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><meta name="theme-color" content="${themeColor}">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
${css === MC_CSS ? FONT_PRELOAD : ""}<link rel="stylesheet" href="/design/tokens.css?v=${AV}"><script>document.documentElement.classList.add("js")</script><style>${BASE_CSS}${css}img[src^="/mc-head/"]{image-rendering:pixelated;image-rendering:crisp-edges}</style>${css === MC_CSS ? `<link rel="stylesheet" href="/bundle/mc.css?v=${AV}"><script src="/mc/item-names-de.js?v=${AV}"></script>${UNAV_JS}` : UNAV_HEAD}${head}</head><body>
${nav}
<main>${body}</main><footer><div class="wrap">${footer}</div></footer>${REVEAL_JS}</body></html>`;
}

/* ---------- Portfolio ---------- */

// Das Maskottchen-Kopf-Icon der Startseite (Pixel-Art der Vorlage, crispEdges, keine externe Datei).
const BRAND_PX = `<svg class="px" width="28" height="28" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><rect x="2" y="1" width="3" height="3" fill="currentColor"/><rect x="11" y="1" width="3" height="3" fill="currentColor"/><rect x="1" y="3" width="14" height="11" fill="currentColor"/><rect x="2" y="4" width="12" height="9" fill="var(--cream)"/><rect x="5" y="7" width="2" height="2" fill="#1f2a44"/><rect x="9" y="7" width="2" height="2" fill="#1f2a44"/><rect x="7" y="10" width="2" height="1" fill="#1f2a44"/></svg>`;
const GRASSLINE = `<svg class="px grassline" viewBox="0 0 80 2" preserveAspectRatio="none" aria-hidden="true" focusable="false"><rect x="0" y="1" width="80" height="1" fill="var(--grass)"/><rect x="3" y="0" width="2" height="1" fill="var(--grass)"/><rect x="17" y="0" width="1" height="1" fill="var(--grass)"/><rect x="29" y="0" width="3" height="1" fill="var(--grass)"/><rect x="48" y="0" width="1" height="1" fill="var(--grass)"/><rect x="61" y="0" width="2" height="1" fill="var(--grass)"/><rect x="74" y="0" width="1" height="1" fill="var(--grass)"/></svg>`;

// The German-only pages share the unified nav (src/unav.js). Its labels and the DE/EN switch follow
// the language cookie, so the marker is filled per request by legacyNav(); /de/… and /en/… of these
// pages set the cookie and come back to the same page.
const THEME_BOOT = `<script src="/design/summer-theme.js?v=${AV}"></script>`;
const pNav = (cur, bare = "") => `{{UNAV:${cur}:${bare}}}`;
const legacyNav = (h, req) => h.replace(/\{\{UNAV:([a-z]*):([^}]*)\}\}/, (_, cur, bare) => {
  const lang = pickLang(null, cookies(req)[LANG_COOKIE]);
  return mainNav({ lang, items: mainItems(lang, cur, (x) => withLang(x, lang), navReady()), langHrefs: { de: withLang(bare || "/", "de"), en: withLang(bare || "/", "en") }, brandHref: withLang("/", lang) });
});
const pFoot = `${GRASSLINE}<span class="brand brand--sm">${BRAND_PX}<span class="bname">NwebNotFound</span></span><nav class="pnl" aria-label="Links"><a href="/">Start</a><a href="/portfolio">Projekte</a><a href="/guestbook">Gästebuch</a><a href="https://${MCD}/">Minecraft</a></nav><p class="hint">© {{Y}} Nils Weberruß · Made with Cloudflare Workers · kein Tracking.</p>`;
const portfolio = (o) => shell({ css: PORT_CSS + PORT_V2_CSS, footer: pFoot, themeColor: "#f4faff", ...o, head: `${THEME_BOOT}${o.head || ""}` });

// The old portfolio home (/portfolio) and guestbook page (/guestbook) are NwebOS windows now (fix/nwebos-no-optout).

/* ---------- Minecraft-Bereich ---------- */
// (The hand-drawn pixel grass block that used to stand in for a block texture is gone: v2 renders
// every block/item/mob/head through the real, self-hosted textures under /mc-icon/v2, /mc-head,
// /mc-mob and /mc-skin.)
const mNav = hubNav();
const MC_GRASSLINE = `<svg class="px grassline" viewBox="0 0 80 2" preserveAspectRatio="none" aria-hidden="true"><rect x="0" y="1" width="80" height="1" fill="var(--grass)"></rect><rect x="3" y="0" width="2" height="1" fill="var(--grass)"></rect><rect x="29" y="0" width="3" height="1" fill="var(--grass)"></rect><rect x="61" y="0" width="2" height="1" fill="var(--grass)"></rect></svg>`;
const mFoot = `${MC_GRASSLINE}<span class="fbrand brand">NwebNotFound MC</span><span class="fnl"><a href="/feedback">Feedback</a><a href="https://${MAIN}/">Hauptseite</a></span><p>© {{Y}} Nils Weberruß · Kein offizielles Minecraft-Produkt. Nicht von Mojang oder Microsoft genehmigt oder mit ihnen verbunden.</p>`;

const mcPage = (title, desc, body) => shell({ title, desc, css: MC_CSS, nav: mNav, footer: mFoot, themeColor: "#0b0f0c", body });
const MC_HOME = mcPage("Minecraft-Server · NwebNotFound", "Status, Profil, Bestenlisten, Markt und Wiki für mc.nwebnotfound.dev", homeBody(MC_HOST));

/* ---------- Detail-Stats (Profil) + Bestenlisten ---------- */
const ICON_JS = `const ICO=id=>'<span class="ic"><img alt="" loading="lazy" src="/mc-icon/v2/'+encodeURIComponent(id)+'" onerror="this.onerror=null;this.src=\\'/mc-icon/v2/paper\\'"></span>';
const NM=id=>(window.MC_DE&&MC_DE[String(id).replace(/^minecraft:/,'')])||String(id).replace(/_/g,' ').replace(/\\b\\w/g,c=>c.toUpperCase());const NF=v=>(+v).toLocaleString('de-DE');const KM=m=>m>=1000?(m/1000).toLocaleString('de-DE',{maximumFractionDigits:1})+' km':NF(Math.round(m))+' m';`;
const DET_CSS = `<style>
.dg{display:grid;gap:1.2rem;grid-template-columns:repeat(auto-fit,minmax(min(100%,360px),1fr))}

.dc h3{font-size:1.1rem;margin:0 0 1rem;display:flex;justify-content:space-between;align-items:baseline}.dc h3 small{font-size:.75rem;font-weight:500;opacity:.55}
.row{display:flex;align-items:center;gap:.75rem;padding:.5rem 0}.row+.row{border-top:1px solid var(--line)}
.row .n{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.92rem}.row b{font-variant-numeric:tabular-nums;font-size:.92rem}
.ic{width:32px;height:32px;flex:none;font-size:.62rem;font-weight:700}.ic img{width:24px;height:24px;image-rendering:pixelated}
.meter{margin-top:.3rem}
.mini{display:grid;grid-template-columns:repeat(2,1fr);gap:.6rem}.mini div{padding:.85rem 1rem}.mini .k{font-size:.7rem;text-transform:uppercase;letter-spacing:.08em;opacity:.6}.mini .v{font-size:1.25rem;font-weight:650;margin-top:.15rem;font-variant-numeric:tabular-nums}
.emp{padding:1.4rem 0 .4rem;text-align:center;opacity:.55;font-size:.9rem}
</style>`;
const PROFILE_DETAILS = `${DET_CSS}<script src="/mc/entity-names-de.js?v=${AV}"></script><script>(()=>{${ICON_JS}const E=s=>String(s??'').replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const MIC=id=>'<span class="ic"><img alt="" width="22" height="22" style="image-rendering:pixelated" src="/mc-mob/'+encodeURIComponent(id)+'"></span>';
const DB={fall:'Fallschaden',lava:'Lava',fire:'Feuer',fire_tick:'Feuer',drowning:'Ertrinken',drown:'Ertrunken',on_fire:'Verbrannt',starve:'Verhungert',void:'Void',suffocation:'Erstickt',starvation:'Verhungert',explosion:'Explosion',block_explosion:'Explosion',entity_explosion:'Explosion',projectile:'Geschoss',magic:'Magie',freeze:'Erfroren',lightning:'Blitz',contact:'Kaktus/Beere',wither:'Wither',player:'Spieler',sonstige:'Sonstige',zombie:'Zombie',skeleton:'Skelett',creeper:'Creeper'};const MG=(o,L)=>{const r={},f={};for(const[k,v]of Object.entries(o||{})){const l=String(L(k)).toLowerCase();const c=f[l]??=k;r[c]=(r[c]||0)+(+v||0)}return r};const OTH=(o,tot,n)=>{const e=Object.entries(o||{}).map(([k,v])=>[k,+v||0]).filter(x=>x[1]>0).sort((a,b)=>b[1]-a[1]);const s=e.reduce((a,x)=>a+x[1],0);let r=Math.max(0,(+tot||0)-s);let k=e;if(e.length+(r>0?1:0)>n){k=e.slice(0,n-1);r+=e.slice(n-1).reduce((a,x)=>a+x[1],0)}const out=Object.fromEntries(k);if(r>0)out.sonstige=(out.sonstige||0)+r;return out};
const list=(o,f,n=10,lab=NM)=>{const e=Object.entries(o||{}).sort((a,b)=>b[1]-a[1]).slice(0,n);if(!e.length)return '<div class="emp">Noch keine Daten. Spiel eine Runde auf Survival.</div>';const mx=e[0][1]||1;return e.map(([k,v])=>'<div class="row">'+f(k)+'<div class="n">'+E(lab(k))+'<div class="meter"><i style="width:'+Math.max(4,v/mx*100)+'%"></i></div></div><b>'+NF(v)+'</b></div>').join('')};
const card=(t,sub,body)=>body.includes('class="emp"')?'':'<div class="dc"><h3>'+t+(sub?'<small>'+sub+'</small>':'')+'</h3>'+body+'</div>';
document.addEventListener('mcprofile',ev=>{const m=ev.detail.minecraft;if(!m||!m.visible)return;const d=m.details||{},B=document.getElementById('pb');
const emo=k=>MIC(k);const dd=d.distance_m||{};const DL={walk:'Gelaufen',sprint:'Gesprintet',fly:'Geflogen',elytra:'Elytra',swim:'Geschwommen',boat:'Boot',horse:'Pferd',minecart:'Lore',climb:'Geklettert',crouch:'Geschlichen'};
const dist=Object.keys(DL).filter(k=>dd[k]!=null);const tot=dist.reduce((a,k)=>a+dd[k],0);
const MS=[['fished','Gefischt'],['traded','Gehandelt'],['jumps','Sprünge'],['damage_dealt','Schaden ausgeteilt'],['damage_taken','Schaden erlitten'],['cp_earned','CP verdient'],['shop_sales','Shop-Verkäufe']].filter(([k])=>d[k]!=null);
const h='<div class="dg">'+card('Top-Blöcke','abgebaut','<div class="mc-stats-list">'+list(d.mined,ICO)+'</div>')+card('Mob-Kills','','<div class="mc-stats-list">'+list(d.killed,emo,8,window.MC_ENTITY_DE)+'</div>')+card('Distanzen',tot?KM(tot)+' gesamt':'',dist.length?'<div class="mini">'+dist.map(k=>'<div><div class="k">'+DL[k]+'</div><div class="v">'+KM(dd[k])+'</div></div>').join('')+'</div>':'<div class="emp">Noch keine Daten.</div>')
+(d.deaths_entity&&Object.keys(d.deaths_entity).length?card('Getötet von','Mobs',list(d.deaths_entity,emo,8)):'')+(d.deaths_by&&Object.keys(d.deaths_by).length?card('Todesursachen','',list(OTH(MG(d.deaths_by,k=>DB[k]||k),((m.stats||{}).deaths)-Object.values(d.deaths_entity||{}).reduce((x,y)=>x+(+y||0),0),8),k=>MIC(k),8).replace(/<div class="n">([^<]*)/g,(a,x)=>{const k=x.toLowerCase().replace(/ /g,'_');return '<div class="n">'+E(DB[k]||x)})):'')
+card('Gesetzt & gecraftet','',[list(d.placed,ICO,5),list(d.crafted,ICO,5)].filter(x=>!x.includes('class="emp"')).join('<div style="height:.8rem"></div>')||'<div class="emp"></div>')
+card('Sonstiges','',MS.length?'<div class="mini">'+MS.map(([k,t])=>'<div><div class="k">'+t+'</div><div class="v">'+NF(Math.round(d[k]))+'</div></div>').join('')+'</div>':'<div class="emp">Noch keine Daten.</div>')+'</div>';
const w=document.createElement('div');w.innerHTML=h;const ps=document.getElementById('pstat');if(ps)ps.replaceWith(w.firstChild);else B.prepend(w.firstChild);});})();</script>`;
const LEADERBOARDS_MC = () => shell({ title: "Bestenlisten · NwebNotFound MC", desc: "Bestenlisten des Minecraft-Servers", css: MC_CSS, nav: mNav, footer: mFoot, themeColor: "#0b0f0c", body: `${DET_CSS}<style>
.tabs{display:flex;gap:.35rem;overflow-x:auto;padding:.3rem;border-radius:99px;background:color-mix(in srgb,var(--fg) 6%,transparent);border:1px solid var(--line);scrollbar-width:none;max-width:100%;min-width:0;align-self:stretch}.tabs::-webkit-scrollbar{display:none}
.tabs .tg{flex:none;align-self:center;font-size:.65rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--mut);padding:0 .35rem 0 .7rem;white-space:nowrap}.tabs .tg~.tg{border-left:1px solid var(--line);margin-left:.15rem;padding-left:.75rem}
.tabs button{flex:none;border:0;background:transparent;color:var(--mut);font:inherit;font-size:.88rem;font-weight:500;padding:.5rem 1rem;border-radius:99px;cursor:pointer;transition:background .2s,color .2s}.tabs button[aria-selected=true]{background:var(--acc);color:var(--accfg)}
.seg{display:inline-flex;padding:.25rem;border-radius:12px;background:color-mix(in srgb,var(--fg) 6%,transparent);margin-top:1rem}.seg button{border:0;background:transparent;color:var(--mut);font:inherit;font-size:.82rem;padding:.4rem 1rem;border-radius:9px;cursor:pointer}.seg button[aria-pressed=true]{background:var(--card);color:var(--fg);box-shadow:0 1px 4px rgba(0,0,0,.3);background:#1f2a22}#seg[hidden]{display:none}
.pod{display:grid;grid-template-columns:1fr 1.15fr 1fr;gap:.8rem;align-items:end;margin:1.6rem 0}.pod>div{text-align:center;padding:1.2rem .6rem;border-radius:22px;border:1px solid var(--line);background:color-mix(in srgb,var(--fg) 4%,transparent)}
.pod img{width:56px;height:56px;margin:0 auto .6rem;border-radius:10px;image-rendering:pixelated}.pod .p1{padding-top:1.8rem;background:linear-gradient(180deg,rgba(74,222,128,.18),transparent);border-color:rgba(74,222,128,.35)}.pod .p1 img{width:72px;height:72px}
.pod b{display:block;font-size:.95rem;overflow:hidden;text-overflow:ellipsis}.pod span{font-size:.8rem;opacity:.7;font-variant-numeric:tabular-nums}.pod .r{font-size:.7rem;font-weight:700;letter-spacing:.1em;color:var(--acc)}
.lbr{display:flex;align-items:center;gap:.8rem;padding:.75rem .4rem}.lbr+.lbr{border-top:1px solid var(--line)}.lbr .px{width:1.6rem;opacity:.6}.lbr img{width:30px;height:30px;border-radius:6px;image-rendering:pixelated}.lbr .n{flex:1}.lbr b{font-variant-numeric:tabular-nums}
</style><link rel="stylesheet" href="/mc/profile.css?v=${AV}"><script src="/mc/player3d.js?v=${AV}"></script>
<section class="hero center" style="padding-bottom:1.5rem"><div class="pixbg"></div><div class="wrap"><p class="eyebrow">Minecraft</p><h1 class="h-xl">Bestenlisten.</h1><p class="lead">Wer auf dem Server vorne liegt.</p></div></section>
<section style="padding-top:0"><div class="wrap" style="max-width:760px">
<div style="display:flex;flex-direction:column;align-items:center"><div class="tabs" role="tablist" id="tabs"></div><div class="seg" id="seg"><button data-k="weekly" aria-pressed="false">Woche</button><button data-k="total" aria-pressed="true">Gesamt</button></div></div>
<div id="out"></div><p class="mut center" id="upd" style="font-size:.78rem;margin-top:1.4rem"></p></div></section>
<script>(()=>{${ICON_JS}const E=s=>String(s??'').replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const up=t=>{t=+t||0;const d=Math.floor(t/86400),h=Math.floor(t%86400/3600),m=Math.floor(t%3600/60);return d?d+' T '+h+' Std':h?h+' Std '+m+' Min':m+' Min'};
const T=[['money','CP',v=>NF(v)+' CP'],['playtime','Spielzeit',up],['blocks_mined','Blöcke',NF],['kills','Survival-Kills',NF],['distance','Distanz',KM]];
const HIDE=new Set(['kd','kdr','k_d','kill_death','pvp']);
let D={},PV=null,tab=(location.hash.slice(1)||'money'),per='total';
if(tab==='kd'||tab==='kdr'||tab==='k_d')tab='kills';
const av=n=>'/mc-head/'+encodeURIComponent(n)+'/72?v=5';
const WR=p=>NF(+p.winrate_pct||0)+' %';
function draw(){const X=Object.keys(Object.assign({},D.total&&D.total.lists,D.weekly&&D.weekly.lists)).filter(k=>!HIDE.has(k)&&!T.some(t=>t[0]===k));X.forEach(k=>T.push([k,k.replace(/_/g,' ').replace(/^./,c=>c.toUpperCase()),NF]));if(tab!=='pvp'&&!T.some(t=>t[0]===tab))tab='money';
const lab=(k,t)=>k==='money'?(per==='total'?'Kontostand':'<span title="Netto seit Montag (Europe/Berlin)">Kontostand ± diese Woche</span>'):t;
const tip=k=>k==='kills'?' title="Spieler-Kills auf Survival, nicht die PvP-Arena"':k==='pvp'?' title="Siege und Siegquote der Arena, Best of 3"':'';
const btn=([k,t])=>'<button role="tab" data-k="'+k+'" aria-selected="'+(k===tab)+'"'+tip(k)+'>'+lab(k,t)+'</button>';
document.getElementById('tabs').innerHTML='<span class="tg">Survival</span>'+T.map(btn).join('')+'<span class="tg">Arena</span>'+btn(['pvp','PvP']);
{let hn=document.getElementById('lbh');if(!hn){hn=document.createElement('p');hn.id='lbh';hn.className='mut';hn.style.cssText='font-size:.8rem;margin:.5rem 0 0';document.getElementById('tabs').after(hn)}hn.textContent=tab==='pvp'?'Arena, alle Kämpfe (Best of 3): Siege und Siegquote. Nicht die Survival-Kills.':tab==='kills'?'Spieler-Kills auf Survival. Arena-Siege stehen im Tab PvP.':per!=='total'&&tab==='money'?'Netto seit Montag 00:00 (Europe/Berlin): Änderung des Kontostands, nicht nur verdiente CP.':'';}
document.getElementById('seg').hidden=tab==='pvp';
document.querySelectorAll('#seg button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.k===per));
const O=document.getElementById('out');
if(tab==='pvp'){document.getElementById('upd').textContent='';
if(PV===null){O.innerHTML='<div class="dc" style="margin-top:1.6rem;text-align:center;padding:2rem"><p class="mut" style="margin:0">Lade PvP…</p></div>';return}
const L=PV.map(p=>({name:p.name,wins:+p.wins||0,line:NF(p.wins)+' Siege',quote:WR(p)}));
if(!L.length){O.innerHTML='<div class="dc" style="margin-top:1.6rem;text-align:center;padding:3rem 1.5rem"><div style="font-size:2.4rem"><img loading="lazy" alt="" width="48" height="48" style="image-rendering:pixelated;margin:0 auto" src="/mc-icon/v2/iron_sword"></div><h3 style="justify-content:center;margin:.6rem 0 .3rem">Noch niemand auf dem Treppchen</h3><p class="mut" style="margin:0">Für die PvP-Arena gibt es noch keine Kämpfe.</p></div>';return}
const pd=[L[1],L[0],L[2]];O.innerHTML='<div class="pod">'+pd.map((x,i)=>x?'<div class="'+(i===1?'p1':'')+'"><div class="r">#'+(i===1?1:i===0?2:3)+'</div>'+MC3D.html(x.name,'pod-model',i===1?72:56)+'<b><a href="/spieler/'+encodeURIComponent(x.name)+'" style="color:inherit">'+E(x.name)+'</a></b><span>'+E(x.line)+'<br>'+E(x.quote)+'</span></div>':'<div style="opacity:0"></div>').join('')+'</div>'+
(L.length>3?'<div class="dc">'+L.slice(3).map((x,i)=>'<div class="lbr"><span class="px">'+(i+4)+'</span><img alt="" src="'+av(x.name).replace('/72','/30')+'"><span class="n">'+E(x.name)+'</span><b>'+E(x.line+' · '+x.quote)+'</b></div>').join('')+'</div>':'');if(window.MC3D)MC3D.scan(O);return}
const hit=T.find(t=>t[0]===tab)||T[0],lbl=hit[1],f=hit[2],P=D[per],L=(P&&P.lists&&P.lists[tab])||[];
document.getElementById('upd').textContent=P&&P.updated_at?'Stand: '+new Date(P.updated_at).toLocaleString('de-DE',{dateStyle:'medium',timeStyle:'short'}):'';
if(!L.length){O.innerHTML='<div class="dc" style="margin-top:1.6rem;text-align:center;padding:3rem 1.5rem"><div style="font-size:2.4rem"><img loading="lazy" alt="" width="48" height="48" style="image-rendering:pixelated;margin:0 auto" src="/mc-icon/v2/diamond"></div><h3 style="justify-content:center;margin:.6rem 0 .3rem">Noch niemand auf dem Treppchen</h3><p class="mut" style="margin:0">'+(per==='weekly'?'Diese Woche gibt es noch keine Werte für '+lbl+'.':'Für '+lbl+' gibt es noch keine Werte.')+' Spiel auf Survival und hol dir Platz 1.</p></div>';return}
const pd=[L[1],L[0],L[2]];O.innerHTML='<div class="pod">'+pd.map((x,i)=>x?'<div class="'+(i===1?'p1':'')+'"><div class="r">#'+(i===1?1:i===0?2:3)+'</div>'+MC3D.html(x.name,'pod-model',i===1?72:56)+'<b><a href="/spieler/'+encodeURIComponent(x.name)+'" style="color:inherit">'+E(x.name)+'</a></b><span>'+E(f(x.value))+'</span></div>':'<div style="opacity:0"></div>').join('')+'</div>'+
(L.length>3?'<div class="dc">'+L.slice(3).map((x,i)=>'<div class="lbr"><span class="px">'+(i+4)+'</span><img alt="" src="'+av(x.name).replace('/72','/30')+'"><span class="n">'+E(x.name)+'</span><b>'+E(f(x.value))+'</b></div>').join('')+'</div>':'');if(window.MC3D)MC3D.scan(O);}
document.getElementById('tabs').onclick=e=>{const b=e.target.closest('[data-k]');if(!b)return;tab=b.dataset.k;history.replaceState(null,'','#'+tab);draw()};
document.getElementById('seg').onclick=e=>{const b=e.target.closest('[data-k]');if(!b)return;per=b.dataset.k;draw()};
draw();fetch('/api/mc-leaderboards').then(r=>r.json()).then(d=>{D=d;draw()}).catch(()=>{});fetch('/api/mc-pvp').then(r=>r.json()).then(d=>{PV=d.players||[];if(tab==='pvp')draw()}).catch(()=>{PV=[];if(tab==='pvp')draw()});})();</script>` });

/* ---------- Profil ---------- */
const PICKUP_BODY = `<section class="sec"><div class="wrap" id="pu"><p class="eyebrow">Survival</p><h1 class="h-l">Bestellungen</h1><p class="lead">Shop-Bestellungen, Bank-Käufe und dein Abholfach in einer Liste. Im Spiel: <code>/abholen</code>.</p><div id="pub" aria-live="polite"><p class="mut">Lade …</p></div></div></section>
<script src="/mc/common.js?v=${AV}"></script><script src="/mc/orders.js?v=${AV}"></script>`;
const PROFILE_PB_CSS = `<style>
#pb .mch{display:grid;grid-template-columns:minmax(240px,340px) 1fr;gap:1.5rem;align-items:center;padding:clamp(1.2rem,3vw,1.6rem);background:var(--card);border:1px solid var(--line);border-radius:22px}
#pb .mch-model{position:relative;height:min(400px,55vw);display:grid;place-items:center}
#pb .mch-model canvas{position:absolute;inset:0;width:100%!important;height:100%!important;opacity:0;animation:mchInMain var(--ds-duration-slow,250ms) var(--ds-ease-out,cubic-bezier(.2,.8,.2,1)) forwards}
#pb .mch-model.ready .mch-fb{opacity:0;transition:opacity .4s}
#pb .mch-fb{max-height:280px;image-rendering:pixelated;filter:drop-shadow(0 12px 24px rgba(0,0,0,.2))}
#pb .mch-info{min-width:0}
#pb .mch-name{font-size:clamp(1.5rem,5vw,2.2rem);margin:.2rem 0;line-height:1.15;overflow-wrap:anywhere}
#pb .mch-sub{margin:0 0 1rem;font-size:.85rem;color:var(--mut)}
#pb .mch-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.65rem}
#pb .mch-tile{padding:.85rem 1rem;background:color-mix(in srgb,var(--fg) 4%,transparent);border:1px solid var(--line);border-radius:14px}
#pb .mch-tile.wide{grid-column:1/-1}
#pb .mch-tile .k{font-size:.72rem;text-transform:uppercase;letter-spacing:.06em;color:var(--mut)}
#pb .mch-tile .v{font-size:clamp(1.1rem,4vw,1.45rem);font-weight:650;margin-top:.2rem;font-variant-numeric:tabular-nums}
#pb .mch-tile.empty .v{opacity:.35}#pb .mch-tile .nd{font-size:.7rem;color:var(--mut);margin-top:.15rem;opacity:.75}
#pb .inv .iv-pane{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:8px;align-items:start;max-width:min(100%,520px);margin-top:.8rem}
#pb .inv .iv-arm{display:grid;gap:3px;grid-template-columns:1fr;padding:6px 4px;background:color-mix(in srgb,var(--fg) 5%,transparent);border:1px solid var(--line);border-radius:12px}
#pb .inv .iv-stack{display:grid;gap:8px;min-width:0}
#pb .inv .iv-off{align-self:end;padding:6px 4px;background:color-mix(in srgb,var(--fg) 5%,transparent);border:1px solid var(--line);border-radius:12px}
#pb .inv .ivg{display:grid;grid-template-columns:repeat(9,minmax(0,1fr));gap:3px;max-width:100%;padding:6px;background:color-mix(in srgb,var(--fg) 5%,transparent);border:1px solid var(--line);border-radius:12px}
#pb .inv .ivs{aspect-ratio:1;position:relative;display:grid;place-items:center;background:color-mix(in srgb,var(--fg) 7%,transparent);min-width:0;border:1px solid var(--line);border-radius:6px}
#pb .inv .ivs img{width:72%;height:auto;aspect-ratio:1/1;image-rendering:pixelated;object-fit:cover;object-position:50% 0}
#pb .inv .ivs b{position:absolute;right:2px;bottom:0;font:700 .7rem ui-monospace,monospace;text-shadow:0 0 2px var(--card)}
#pb .inv .iv-arm,#pb .inv .iv-off{grid-template-columns:var(--ivw,40px)}#pb .inv .iv-arm .ivs,#pb .inv .iv-off .ivs{width:var(--ivw,40px);height:var(--ivw,40px);aspect-ratio:1/1;box-sizing:border-box}#pb .inv .iv-arm .ivs img,#pb .inv .iv-off .ivs img{width:72%;height:72%;object-fit:cover;object-position:50% 0;image-rendering:pixelated}
#pb .inv .iv-empty .iv-pane{opacity:.45}
#pb .pblk{background:var(--card);border:1px solid var(--line);border-radius:22px;padding:clamp(1rem,3vw,1.4rem)}#pb .pblk>header{display:flex;justify-content:space-between;align-items:baseline;gap:.6rem;flex-wrap:wrap;margin-bottom:.6rem}#pb .pblk h2{font-size:1.15rem;margin:0}#pb .pbal{display:flex;align-items:center;gap:1rem;flex-wrap:wrap}#pb .pbal .v{font-size:clamp(1.5rem,5vw,2.2rem);font-weight:700}#pb .pbal .acts{display:flex;gap:.5rem;flex-wrap:wrap;margin-left:auto}#pb .pord{list-style:none;margin:0;padding:0}#pb .pord li{display:grid;grid-template-columns:32px 1fr auto;gap:.7rem;align-items:center;padding:.4rem 0}#pb .pord img{width:28px;height:28px;image-rendering:pixelated}
@keyframes mchInMain{to{opacity:1}}
@media(max-width:760px){#pb .mch{grid-template-columns:1fr;text-align:center}#pb .mch-grid{text-align:left}}
@media(max-width:480px){#pb .inv .iv-pane{grid-template-columns:1fr}#pb .inv .iv-arm{grid-template-columns:repeat(4,var(--ivw,40px))}}
@media(prefers-reduced-motion:reduce){#pb .mch-model canvas{animation:none;opacity:1}}
</style>`;
const PROFILE_BODY = (mc) => `
${mc ? "" : PROFILE_PB_CSS}
<section class="hero center" style="padding-bottom:2rem">${mc ? '<div class="pixbg"></div>' : ""}<div class="wrap" id="ph"><p class="mut">Lade Profil…</p></div></section>
<section style="padding-top:0"><div class="wrap" style="max-width:860px;display:grid;gap:1.2rem" id="pb"></div></section>
<link rel="stylesheet" href="/mc/profile.css?v=${AV}"><link rel="stylesheet" href="/mc/stats-lists.css?v=${AV}"><script src="/mc/inventory.js?v=${AV}"></script><script src="/mc/player3d.js?v=${AV}"></script><script>
const E=s=>String(s??'').replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const fd=t=>{try{return new Date(t.replace(' ','T')+(t.includes('Z')?'':'Z')).toLocaleDateString('de-DE',{dateStyle:'long'})}catch(_){return t}};
const up=t=>{t=+t||0;const d=Math.floor(t/86400),h=Math.floor(t%86400/3600),m=Math.floor(t%3600/60);return d?d+' T '+h+' Std':h?h+' Std '+m+' Min':m+' Min'};
const LBL={money:['Kontostand',v=>(+v).toLocaleString('de-DE')+' CP'],playtime:['Spielzeit',up],kills:['Spieler-Kills',v=>(+v).toLocaleString('de-DE')],deaths:['Tode',v=>(+v).toLocaleString('de-DE')],blocks_mined:['Abgebaute Blöcke',v=>(+v).toLocaleString('de-DE')]};

(async()=>{const H=document.getElementById('ph'),B=document.getElementById('pb');
const r=await fetch('/api/profile',{credentials:'include'});const d=await r.json().catch(()=>({}));
if(!d.user){H.innerHTML='<h1 class="h-l">Dein Profil.</h1><p class="lead">Melde dich mit Discord an, um dein Profil zu sehen.</p><p style="margin-top:2rem"><a class="btn discord" href="${mc ? `https://${MAIN}` : ""}/auth/discord/login?next='+encodeURIComponent(location.href)+'">${DISCORD_SVG} Mit Discord anmelden</a></p>';return}
const u=d.user;const mcName=d.minecraft&&d.minecraft.mc_name;const pic=${mc ? "(mcName&&/^[A-Za-z0-9_]{1,16}$/.test(mcName)?'/mc-head/'+mcName+'/64?v=5':'/mc-head/MHF_Steve/64?v=5')" : "u.avatar"};H.innerHTML='<img loading="lazy" alt="" ${mc ? 'onerror="this.onerror=null;this.src=&quot;/mc-head/MHF_Steve/64?v=5&quot;"' : ''} src="'+E(pic)+'" width="112" height="112" style="width:112px;height:112px;border-radius:50%;margin:0 auto 1.2rem;box-shadow:0 10px 40px -10px var(--shadow)"><h1 class="h-l">'+E(u.name)+'</h1><p class="mut" style="margin:.4rem 0 0">@'+E(u.username)+(u.member_since?' · Mitglied seit '+E(fd(u.member_since)):'')+'</p>';
let h='';const m=d.minecraft;
if(m&&m.visible){const st=m.stats||{};const ks=Object.keys(st).filter(k=>k!=='inventory'&&k!=='pickup');
const SK=['playtime','kills','deaths','blocks_mined'].concat(ks.filter(k=>!LBL[k]&&k!=='money'));const bal=st.money!=null&&st.money!=='';const id=encodeURIComponent(m.mc_uuid||m.mc_name);
const PBAL='<section class="pblk" id="pbal" aria-labelledby="pbal-h"><header><h2 id="pbal-h">Kontostand</h2><span class="mut" style="font-size:.8rem">'+(m.updated_at?'Stand '+E(new Date(m.updated_at).toLocaleString('de-DE',{dateStyle:'short',timeStyle:'short'})):'')+'</span></header><div class="pbal"><img loading="lazy" alt="" width="40" height="40" class="mi" src="/mc-icon/v2/gold_ingot" style="image-rendering:pixelated"><span class="v tnum">'+(bal?E(LBL.money[1](st.money)):'–')+'</span><div class="acts"><a class="btn sm sec" href="${mc ? "" : "https://mc." + MAIN}/markt">Markt & Bank</a><a class="btn sm sec" href="${mc ? "" : "https://mc." + MAIN}/bestellungen">Bestellungen</a></div></div></section>';
const PORD='<section class="pblk" id="pord" aria-labelledby="pord-h"><header><h2 id="pord-h">Bestellungen</h2><a href="${mc ? "" : "https://mc." + MAIN}/bestellungen">Alle ansehen ›</a></header><div id="pordl"><p class="mut">Lade …</p></div></section>';
const inv=(st.inventory||[]).length&&typeof window.MCInv==='function'?window.MCInv(st.inventory):'';
const G=await MCP.games(m.mc_name).catch(()=>({}));const NFm=v=>(+v).toLocaleString('de-DE');const KMm=v=>v>=1000?(v/1000).toLocaleString('de-DE',{maximumFractionDigits:1})+' km':NFm(Math.round(v))+' m';const num=k=>st[k]!=null&&st[k]!==''&&Number.isFinite(+st[k])?+st[k]:null;
const dist=num('distance')??num('distance_m'),blk=num('blocks_mined')??num('mined_total'),kil=num('kills')??num('player_kills');
h+=MCP.header({name:m.mc_name,eyebrow:'Minecraft · Verifiziert',sub:m.updated_at?'Stats vom '+E(new Date(m.updated_at).toLocaleString('de-DE',{dateStyle:'short',timeStyle:'short'})):'Noch keine Stats',meta:[['Team',typeof st.team==='string'?st.team:null,'white_banner',{color:MCP.TC(st)}],['CP',bal?LBL.money[1](st.money):null,'gold_ingot'],(st.online===true||st.online===1||st.online==='1'||st.online==='true')?['Status','Online','clock',{online:true}]:['Zuletzt online',(st.last_seen??st.last_online)!=null?MCP.SEEN(st.last_seen??st.last_online):null,'clock',{seen:true}],['Spielzeit',num('playtime')!=null?up(num('playtime')):null,'compass']],extra:'<p class="pf-sub"><a href="/spieler/'+encodeURIComponent(m.mc_name)+'">Öffentliches Profil ansehen ›</a></p>'})
+MCP.kpi([['Spieler-Kills',kil!=null?NFm(kil):null,'iron_sword'],['Tode',num('deaths')!=null?NFm(num('deaths')):null,'skeleton_skull'],['Distanz',dist!=null?KMm(dist):null,'leather_boots'],['Blöcke',blk!=null?NFm(blk):null,'iron_pickaxe'],['PvP-Winrate',G.winrate,'shield',G.pvp?NFm(G.pvp.matches)+' Kämpfe':''],['Beste Parkour-Zeit',G.best?MCP.MS(G.best.ms):null,'feather',G.best?G.best.name:'']]);
const pvpc=G.pvp?'<div class="g pad dcard card pvp-arena"><h3>PvP-Arena<small>'+NFm(G.pvp.matches)+' Kämpfe</small></h3><div class="mini dmini">'+[['Siege',G.pvp.wins],['Niederlagen',G.pvp.losses],['Quote',G.winrate||'0 %']].map(([k,v])=>'<div class="slotbox"><div class="k">'+k+'</div><div class="v tnum">'+(typeof v==='number'?NFm(v):E(v))+'</div></div>').join('')+'</div></div>':'';
h+=MCP.tabs('ptabs',[['inventar','Inventar',inv,'chest'],['statistiken','Statistiken','<div id="pstat"></div>','book'],['markt','Markt',PBAL+PORD,'emerald'],['minispiele','Minispiele',pvpc+(G.parkourHtml||''),'golden_boots']]);}
else if(m){h+='<div class="card" style="text-align:center"><p class="eyebrow">Minecraft</p><h3>Noch nicht verknüpft</h3><p>'+E(m.hint)+'</p></div>';}
const g=d.guestbook||[];h+='<div class="card"><h3 style="margin-bottom:.6rem">Deine Gästebuch-Einträge</h3>'+(g.length?g.map(x=>'<div style="padding:.9rem 0;border-top:1px solid var(--line)"><span class="mut" style="font-size:.8rem">'+E(fd(x.created_at))+'</span><p style="margin:.25rem 0 0;white-space:pre-wrap;word-break:break-word;color:var(--fg)">'+E(x.message)+'</p></div>').join(''):'<p>Noch keine Einträge. <a href="https://${MAIN}/guestbook">Jetzt einen schreiben ›</a></p>')+'</div>';
B.innerHTML=h;MC3D.scan(B);MCP.bindTabs(B);document.dispatchEvent(new CustomEvent('mcprofile',{detail:d}));
{const L=document.getElementById('pordl');if(L)fetch('/api/mc-bestellungen',{credentials:'include'}).then(r=>r.json()).then(o=>{const S={pending:['wird bestätigt','tw'],bought:['gekauft','ts'],ready:['abholbereit','ts'],collected:['erledigt','ts'],failed:['abgelehnt','tr']};const O=(o.orders||[]).slice(0,5),P=(o.pickup||[]).length;
L.innerHTML=(P?'<p class="mut" style="margin:0 0 .5rem">'+P+' Stapel im Abholfach · im Spiel <code>/abholen</code></p>':'')+(O.length?'<ul class="pord">'+O.map(x=>{const g=S[x.stage]||S.pending;return '<li class="hl"><span class="ic"><img alt="" loading="lazy" src="/mc-icon/v2/'+encodeURIComponent(x.item)+'"></span><span><b>'+(+x.qty).toLocaleString('de-DE')+'× '+E((window.MC_DE&&MC_DE[x.item])||String(x.item).replace(/_/g,' ').replace(/\\b\\w/g,c=>c.toUpperCase()))+'</b> <span class="mut" style="font-size:.8rem">'+(x.order_type==='bank_buy'?'Bank':'Shop')+'</span></span><span class="tag '+g[1]+'">'+g[0]+'</span></li>'}).join('')+'</ul>':'<p class="mut" style="margin:0">Noch keine Bestellungen.</p>')}).catch(()=>{L.innerHTML='<p class="mut">Konnte Bestellungen nicht laden.</p>'})}})();
</script>${PROFILE_DETAILS}`;
const PROFILE_MC = () => shell({ title: "Profil · NwebNotFound MC", desc: "Dein Profil", css: MC_CSS, nav: mNav, footer: mFoot, themeColor: "#0b0f0c", body: PROFILE_BODY(true) });

// Owner deletes their own data: guestbook entries, blog reading progress and reactions, sessions. POST from the site itself only.
async function profileDelete(req, env) {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (req.headers.get("origin") !== `https://${MAIN}`) return json({ error: "forbidden" }, 403);
  const u = await getUser(req, env).catch(() => null);
  if (!u) return json({ error: "unauthorized" }, 401);
  // Explicit confirmation from the UI; the target is ALWAYS the session owner, never anything from the request.
  const b = await req.json().catch(() => null);
  if (!b || b.confirm !== "delete") return json({ error: "confirmation required" }, 400);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM entries WHERE discord_id = ?").bind(u.id),
    env.DB.prepare("DELETE FROM sessions WHERE discord_id = ?").bind(u.id),
    // reading progress and reactions from the NwebOS blog/reader (Gatekeeper #115)
    env.DB.prepare("DELETE FROM blog_reads WHERE discord_id = ?").bind(String(u.id)),
    env.DB.prepare("DELETE FROM blog_reactions WHERE discord_id = ?").bind(String(u.id)),
  ]);
  return json({ ok: true }, 200, { "set-cookie": sessCookie("", 0) });
}

async function profileApi(req, env) {
  const origin = req.headers.get("origin");
  const cors = origin === `https://${MCD}` || origin === `https://${MAIN}` ? { "access-control-allow-origin": origin, "access-control-allow-credentials": "true", vary: "origin" } : {};
  const u = await getUser(req, env).catch(() => null);
  if (!u) return json({ user: null }, 200, cors);
  const since = await env.DB.prepare("SELECT MIN(created_at) AS c FROM sessions WHERE discord_id = ?").bind(u.id).first().catch(() => null);
  const { results: gb } = await env.DB.prepare("SELECT message, created_at FROM entries WHERE discord_id = ? ORDER BY id DESC LIMIT 20").bind(u.id).all().catch(() => ({ results: [] }));
  const link = await env.DB.prepare("SELECT mc_name, mc_uuid, has_role, verified FROM mc_links WHERE discord_id = ?").bind(u.id).first().catch(() => null);
  let minecraft = { visible: false, hint: "Verknüpfe deinen Account im Discord mit /link" };
  if (link && link.verified && link.has_role) {
    const ps = await env.DB.prepare("SELECT stats, updated_at, details FROM mc_player_stats WHERE mc_uuid = ?").bind(link.mc_uuid).first().catch(() => null);
    minecraft = { visible: true, mc_name: link.mc_name, mc_uuid: link.mc_uuid, stats: ps ? JSON.parse(ps.stats) : {}, details: ps && ps.details ? JSON.parse(ps.details) : null, updated_at: ps ? new Date(ps.updated_at).toISOString() : null };
  } else if (link && !link.verified) minecraft.hint = "Bestätige die Verknüpfung im Discord mit deinem Code (/link).";
  else if (link && !link.has_role) minecraft.hint = "Dir fehlt noch die Server-Rolle im Discord. Danach erscheinen hier deine Stats.";
  return json({ user: { id: u.id, name: u.name, username: u.username, avatar: u.avatar, member_since: since?.c || null }, guestbook: gb, minecraft }, 200, cors);
}

/* ---------- Status-API ---------- */
// Live-Zahl: Bot-Ingest (frisch) schlägt den Ping-Dienst (der cacht 1–5 Min). Proxy-Zahl bevorzugt, sonst Summe der Backends.
const srvCount = (v) => { if (!v) return 0; const n = [v.online_count, v.players_online, v.player_count, v.count].find((x) => Number.isFinite(+x) && x !== null && x !== "" && typeof x !== "boolean"); return n != null ? +n : Array.isArray(v.players) ? v.players.length : Number.isFinite(+v.players) ? +v.players : 0; };
const srvNames = (v) => (Array.isArray(v?.players) ? v.players : []).map((x) => typeof x === "string" ? x : x?.name).filter(Boolean);
async function mergeLive(res, env) {
  const out = await res.clone().json().catch(() => null); if (!out || !env?.DB) return res;
  const row = await env.DB.prepare("SELECT data, updated_at FROM mc_snapshot WHERE id = 1").first().catch(() => null);
  let d = {}; try { d = row ? JSON.parse(row.data) || {} : {}; } catch { d = {}; }
  const at = d.servers_at || (d.servers ? row?.updated_at : null);
  if (at && Date.now() - at <= FRESH_MS && d.servers && Object.keys(d.servers).length) {
    const S = d.servers, px = S.proxy || S.velocity || null, be = Object.entries(S).filter(([k]) => k !== "proxy" && k !== "velocity").map(([, v]) => v);
    const names = [...new Set([...(px ? srvNames(px) : []), ...be.flatMap(srvNames)])];
    const live = px ? srvCount(px) : be.reduce((a, v) => a + srvCount(v), 0);
    out.players.online = Math.max(live, names.length); out.players.list = names.slice(0, 50);
    if (be.some((v) => v.online)) out.online = true;
    if (!out.players.max) out.players.max = Math.max(0, ...be.map((v) => +v.max || 0));
    out.live_source = "ingest"; out.live_at = new Date(at).toISOString();
  }
  return new Response(JSON.stringify(out), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=15" } });
}
async function mcStatus(ctx, env) {
  const cache = caches.default, key = new Request("https://nwebnotfound.dev/__cache/mc-status");
  const hit = await cache.match(key); if (hit) return withCors(await mergeLive(hit, env));
  let out = null;
  try {
    const r = await fetch(`https://api.mcsrvstat.us/3/${MC_HOST}`, { headers: { "user-agent": "nwebnotfound.dev status page" } });
    if (r.ok) { const d = await r.json(); out = { online: !!d.online, players: { online: d.players?.online ?? 0, max: d.players?.max ?? 0, list: (d.players?.list || []).map(x => x.name || String(x)).slice(0, 50) }, version: d.version || null, motd: (d.motd?.clean || []).join(" ").trim() || null, source: "mcsrvstat.us" }; }
  } catch {}
  if (!out || !out.online) try {
    const r = await fetch(`https://api.mcstatus.io/v2/status/java/${MC_HOST}`);
    if (r.ok) { const d = await r.json(); out = { online: !!d.online, players: { online: d.players?.online ?? 0, max: d.players?.max ?? 0, list: (d.players?.list || []).map(x => x.name_clean || x.name_raw).slice(0, 50) }, version: d.version?.name_clean || null, motd: (d.motd?.clean || "").trim() || null, source: "mcstatus.io" }; }
  } catch {}
  if (!out) out = { online: false, players: { online: 0, max: 0, list: [] }, version: null, motd: null, error: "Status-APIs nicht erreichbar" };
  out.host = MC_HOST; out.checked_at = new Date().toISOString();
  const res = new Response(JSON.stringify(out), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=20" } });
  ctx.waitUntil(cache.put(key, res.clone()));
  return withCors(await mergeLive(res, env));
}
const withCors = (r) => { r = new Response(r.body, r); r.headers.set("access-control-allow-origin", "*"); return r; };

/* ---------- Auth (Discord OAuth2) ---------- */
const enc = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const rand = (n = 32) => b64u(crypto.getRandomValues(new Uint8Array(n)));
async function hmac(secret, data) { const k = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]); return b64u(await crypto.subtle.sign("HMAC", k, enc.encode(data))); }
function safeEq(a, b) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
async function sign(env, v) { return `${v}.${await hmac(env.SESSION_SECRET, v)}`; }
async function unsign(env, s) { if (!s || !env.SESSION_SECRET) return null; const i = s.lastIndexOf("."); if (i < 1) return null; const v = s.slice(0, i); return safeEq(s.slice(i + 1), await hmac(env.SESSION_SECRET, v)) ? v : null; }
// Kaputte Cookies (ohne "=" oder mit ungültiger %-Folge, z. B. von einer Nachbar-Subdomain gesetzt) werden
// übersprungen statt die ganze Anfrage mit einem URIError abzubrechen.
const cookies = (req) => { const o = {}; for (const c of (req.headers.get("cookie") || "").split(/;\s*/)) { const i = c.indexOf("="); if (i < 1) continue; const k = c.slice(0, i), v = safeDecode(c.slice(i + 1)); if (v != null && !(k in o)) o[k] = v; } return o; };
const sessCookie = (v, maxAge) => `${COOKIE}=${encodeURIComponent(v)}; Domain=.${MAIN}; Path=/; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
const hostOk = (h) => { const host = String(h || "").toLowerCase(); if (host === MAIN || host === MCD) return true; if (!host.endsWith("." + MAIN)) return false; const rest = host.slice(0, -(MAIN.length + 1)); return rest.length > 0 && /^[a-z0-9.-]+$/.test(rest) && !rest.startsWith(".") && !rest.endsWith(".") && !rest.includes(".."); };
// next: relativer Pfad oder https auf nwebnotfound.dev / *.nwebnotfound.dev. Sonst Startseite. /vip bleibt auf der MC-Subdomain.
const safeNext = (n) => {
  const fallback = `https://${MAIN}/`;
  if (typeof n !== "string") return fallback;
  const s = n.trim();
  if (!s || s.length > 2048 || /[\u0000-\u001f\u007f\\@]/.test(s) || s.startsWith("//")) return fallback;
  if (s.startsWith("/")) {
    const path = s.split("?")[0].split("#")[0];
    const base = path === "/vip" || path.startsWith("/vip/") ? MCD : MAIN;
    try { const u = new URL(s, `https://${base}`); if (u.protocol !== "https:" || u.hostname !== base || u.username || u.password || u.pathname.startsWith("//")) return fallback; return u.toString(); } catch { return fallback; }
  }
  try { const u = new URL(s); if (u.protocol !== "https:" || u.username || u.password || !hostOk(u.hostname)) return fallback; return u.toString(); } catch { return fallback; }
};
const avatarUrl = (id, av) => av ? `https://cdn.discordapp.com/avatars/${id}/${av}.png?size=128` : `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(id) >> 22n) % 6n)}.png`;
const redirect = (loc, headers = {}) => new Response(null, { status: 302, headers: { location: loc, "cache-control": "no-store", ...headers } });

async function getUser(req, env) {
  if (!authReady(env)) return null;
  const sid = await unsign(env, cookies(req)[COOKIE]); if (!sid) return null;
  const row = await env.DB.prepare("SELECT discord_id, username, global_name, avatar FROM sessions WHERE id = ? AND expires_at > datetime('now')").bind(sid).first();
  if (!row) return null;
  return { id: row.discord_id, name: row.global_name || row.username, username: row.username, avatar: avatarUrl(row.discord_id, row.avatar), sid };
}

async function auth(p, req, env, url) {
  const next = safeNext(url.searchParams.get("next") || `https://${MAIN}/`);
  const redirectUri = `https://${MAIN}/auth/discord/callback`;
  if (p === "/auth/discord/login") {
    if (!authReady(env)) return html(legacyNav(portfolio({ title: "Login bald verfügbar", desc: "", nav: pNav(""), body: `<section class="hero center"><div class="wrap"><h1 class="h-l">Discord-Login ist bald verfügbar.</h1><p class="lead">Der Login wird gerade eingerichtet. Schau bald wieder vorbei.</p><p style="margin-top:2rem"><a class="btn" href="${esc(next)}">Zurück</a></p></div></section>` }), req), 503);
    const state = rand(24);
    const st = await sign(env, `${state}|${b64u(enc.encode(next))}`);
    const q = new URLSearchParams({ client_id: env.DISCORD_CLIENT_ID, response_type: "code", redirect_uri: redirectUri, scope: "identify", state, prompt: "none" });
    return redirect(`https://discord.com/oauth2/authorize?${q}`, { "set-cookie": `nnf_oauth=${encodeURIComponent(st)}; Path=/auth/discord; Max-Age=600; HttpOnly; Secure; SameSite=Lax` });
  }
  if (p === "/auth/discord/callback") {
    if (!authReady(env)) return redirect(`https://${MAIN}/`);
    const clear = "nnf_oauth=; Path=/auth/discord; Max-Age=0; HttpOnly; Secure; SameSite=Lax";
    const raw = await unsign(env, cookies(req).nnf_oauth);
    const code = url.searchParams.get("code"), state = url.searchParams.get("state");
    if (!raw || !code || !state) return redirect(`https://${MAIN}/?login=failed`, { "set-cookie": clear });
    const [s, nb] = raw.split("|"); if (!safeEq(s, state)) return redirect(`https://${MAIN}/?login=failed`, { "set-cookie": clear });
    let back = `https://${MAIN}/`; try { back = safeNext(new TextDecoder().decode(Uint8Array.from(atob(nb.replace(/-/g, "+").replace(/_/g, "/")), c => c.charCodeAt(0)))); } catch {}
    const tr = await fetch("https://discord.com/api/oauth2/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: env.DISCORD_CLIENT_ID, client_secret: env.DISCORD_CLIENT_SECRET, grant_type: "authorization_code", code, redirect_uri: redirectUri }) });
    if (!tr.ok) return redirect(`https://${MAIN}/?login=failed`, { "set-cookie": clear });
    const tok = await tr.json();
    const ur = await fetch("https://discord.com/api/users/@me", { headers: { authorization: `Bearer ${tok.access_token}` } });
    if (!ur.ok) return redirect(`https://${MAIN}/?login=failed`, { "set-cookie": clear });
    const u = await ur.json();
    const sid = rand(32);
    await env.DB.prepare("INSERT INTO sessions (id, discord_id, username, global_name, avatar, expires_at) VALUES (?, ?, ?, ?, ?, datetime('now', ?))").bind(sid, u.id, u.username, u.global_name || null, u.avatar || null, `+${SESSION_DAYS} days`).run();
    const h = new Headers({ location: back, "cache-control": "no-store" });
    h.append("set-cookie", clear); h.append("set-cookie", sessCookie(await sign(env, sid), SESSION_DAYS * 86400));
    return new Response(null, { status: 302, headers: h });
  }
  // Logout ändert Zustand → nur per POST mit passender Origin (sonst könnte jede fremde Seite per Link
  // oder Redirect abmelden: SameSite=Lax schickt die Cookie bei Top-Level-GETs mit). Ein GET (alter
  // Link, Lesezeichen, ohne JS) zeigt nur eine Bestätigungsseite mit POST-Formular.
  if (p === "/auth/discord/logout") {
    if (req.method === "POST") {
      const o = req.headers.get("origin");
      if (o !== `https://${MAIN}` && o !== `https://${MCD}`) return html(legacyNav(portfolio({ title: "Abmelden fehlgeschlagen", desc: "", nav: pNav(""), body: `<section class="hero center"><div class="wrap"><h1 class="h-l">Abmelden nicht möglich.</h1><p class="lead">Die Anfrage kam nicht von dieser Seite.</p><p style="margin-top:2rem"><a class="btn" href="https://${MAIN}/">Zur Startseite</a></p></div></section>` }), req), 403);
      const user = await getUser(req, env);
      if (user) await env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(user.sid).run();
      return new Response(null, { status: 303, headers: { location: next, "cache-control": "no-store", "set-cookie": sessCookie("", 0) } });
    }
    if (req.method !== "GET" && req.method !== "HEAD") return new Response("Method not allowed", { status: 405, headers: { allow: "GET, POST" } });
    const user = await getUser(req, env);
    if (!user) return redirect(next);
    // phone audit A8: no old confirmation page — the NwebOS desktop asks with its logout sheet (its button POSTs)
    return new Response(null, { status: 302, headers: { location: "/?logout=1", "cache-control": "no-store" } });
  }
  return null;
}

/** D1 write budget (free tier: 100k rows a day): one log line per write burst with the rows D1 really wrote, so
 *  `wrangler tail` / Workers logs show the writes per source. No counter in D1 (that would cost writes itself). */
export function logWrites(src, results) {
  const n = (Array.isArray(results) ? results : [results]).reduce((a, r) => a + (Number(r?.meta?.rows_written) || 0), 0);
  if (n) console.log(JSON.stringify({ d1_rows_written: n, src }));
  return results;
}

/* ---------- MC-Ingest (Push von PC-Nils) ---------- */
// mc_snapshot: servers und leaderboards kommen in getrennten Pushes. Nur den gesendeten Teil in SQL
// ersetzen (json_set), statt die ganze Zeile in JS zu lesen, zu ändern und zurückzuschreiben: zwei
// parallele Pushes überschreiben sich sonst gegenseitig mit dem alten Stand des jeweils anderen Teils.
// Für den nicht gesendeten Teil wird ein fehlender Zeitstempel (Altdaten) aus dem bisherigen
// updated_at nachgetragen, bevor updated_at weiterspringt. undefined = Teil nicht gesendet.
/* heartbeat < FRESH_MS with margin: bot pushes every 30–60 s, so the stamp is at most ~3.5 min old (< 5 min) */
const SNAP_HEARTBEAT_MS = 150000;
export function snapshotStatement(env, servers, leaderboards, now) {
  const parts = [["servers", servers], ["leaderboards", leaderboards]];
  const fresh = {}; for (const [k, v] of parts) if (v !== undefined) { fresh[k] = v; fresh[k + "_at"] = now; }
  const sets = [], args = [JSON.stringify(fresh), now];
  for (const [k, v] of parts) {
    if (v !== undefined) { sets.push(`'$.${k}', json(?${args.length + 1}), '$.${k}_at', ?2`); args.push(JSON.stringify(v)); }
    else sets.push(`'$.${k}_at', COALESCE(json_extract(mc_snapshot.data, '$.${k}_at'), CASE WHEN json_type(mc_snapshot.data, '$.${k}') IS NOT NULL THEN mc_snapshot.updated_at END)`);
  }
  /* D1 write budget: only when a sent part changed, or when that part's own *_at stamp is older than SNAP_HEARTBEAT_MS
     (servers and leaderboards come in separate pushes; one part changing must not keep the other's stamp from
     refreshing — readers drop a part whose *_at is older than FRESH_MS) */
  const diff = []; for (const [k, v] of parts) if (v !== undefined) {
    const n = args.indexOf(JSON.stringify(v), 2) + 1;
    diff.push(`json_extract(mc_snapshot.data, '$.${k}') IS NOT json(?${n})`, `COALESCE(json_extract(mc_snapshot.data, '$.${k}_at'), 0) < ?2 - ${SNAP_HEARTBEAT_MS}`);
  }
  return env.DB.prepare(`INSERT INTO mc_snapshot (id, data, updated_at) VALUES (1, ?1, ?2) ON CONFLICT(id) DO UPDATE SET data = json_set(json(mc_snapshot.data), ${sets.join(", ")}), updated_at = excluded.updated_at WHERE ${diff.join(" OR ")}`).bind(...args);
}
// Craft-Views direkt annehmen (v_leaderboards, v_player_stats_ext, v_market_history) → interne Formen
const pk = (o, ...k) => { for (const x of k) if (o?.[x] != null && o[x] !== "") return o[x]; return null; };
const UUIDX = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;
const nU = (x) => String(x).toLowerCase().replace(/-/g, "").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
const tsMs = (v) => { if (v == null || v === "") return null; const n = typeof v === "number" || /^\d+(\.\d+)?$/.test(String(v)) ? Number(v) : Date.parse(v); return Number.isFinite(n) ? (n < 1e12 ? n * 1000 : n) : null; };
const LB_CAT = ["category", "stat", "key", "board", "leaderboard", "kind", "type", "metric"], LB_U = ["uuid", "player", "player_uuid", "mc_uuid"], LB_N = ["name", "player_name", "mc_name", "username"], LB_V = ["value", "score", "amount", "total", "count"];
const SKIP_STAT = new Set(["uuid", "player", "player_uuid", "mc_uuid", "name", "player_name", "mc_name", "username", "updated_at", "ts", "created_at", "id", "stat", "key", "value"]);
const LB_ALIAS = { cp: "money", balance: "money", coins: "money", geld: "money", kontostand: "money", play_time: "playtime", playtime_s: "playtime", playtime_seconds: "playtime", time_played: "playtime", spielzeit: "playtime", mined: "blocks_mined", blocks: "blocks_mined", mined_blocks: "blocks_mined", blocks_broken: "blocks_mined", player_kills: "kills", pvp_kills: "kills", kdr: "kd", k_d: "kd", kill_death: "kd", distance_m: "distance", distance_walked: "distance", travelled: "distance", traveled: "distance" };
const lbKey = (k) => { const c = String(k).toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 24); return LB_ALIAS[c] || c; };
async function normalizeViews(env, b) {
  const rowsLb = Array.isArray(b.v_leaderboards) ? b.v_leaderboards : Array.isArray(b.leaderboards) ? b.leaderboards : null;
  const rowsPs = Array.isArray(b.v_player_stats_ext) ? b.v_player_stats_ext : Array.isArray(b.player_stats_ext) ? b.player_stats_ext : Array.isArray(b.players_stats) ? b.players_stats : Array.isArray(b.player_stats) ? b.player_stats : null;
  const rowsH = Array.isArray(b.v_market_history) ? b.v_market_history : null;
  const info = { leaderboard_rows: rowsLb ? rowsLb.length : 0, player_stat_rows: rowsPs ? rowsPs.length : 0, history_rows: rowsH ? rowsH.length : 0 };
  if (!rowsLb && !rowsPs && !rowsH && !b.player_stats_ext && !(b.players_stats && !Array.isArray(b.players_stats) && !Object.keys(b.players_stats).length)) return info;
  // Namen: Payload-Namen, dann mc_links
  const names = {};
  for (const r of [...(rowsLb || []), ...(rowsPs || [])]) { const u = pk(r, ...LB_U), n = pk(r, ...LB_N); if (u && UUIDX.test(String(u)) && n && /^[A-Za-z0-9_]{1,16}$/.test(String(n))) names[nU(u)] = String(n); }
  const need = [...new Set([...(rowsLb || [])].map((r) => pk(r, ...LB_U)).filter((u) => u && UUIDX.test(String(u))).map(nU).filter((u) => !names[u]))];
  for (let i = 0; i < need.length; i += 90) { const c = need.slice(i, i + 90); const { results } = await env.DB.prepare(`SELECT mc_uuid, mc_name FROM mc_links WHERE mc_uuid IN (${c.map(() => "?").join(",")})`).bind(...c).all().catch(() => ({ results: [] })); for (const r of results) names[r.mc_uuid] = r.mc_name; }
  if (rowsLb) {
    const tot = {}, wk = {};
    for (const r of rowsLb.slice(0, 5000)) {
      const raw = pk(r, ...LB_CAT); if (raw == null) continue; const cat = lbKey(raw);
      const u = pk(r, ...LB_U), name = pk(r, ...LB_N) ?? (u && UUIDX.test(String(u)) ? names[nU(u)] : null); if (!name || !/^[A-Za-z0-9_]{1,16}$/.test(String(name))) continue;
      const per = String(pk(r, "period", "scope", "range", "timeframe") ?? "total").toLowerCase(); const T = /week|woche|7d/.test(per) ? wk : tot;
      const val = pk(r, ...LB_V); if (val == null || !Number.isFinite(+val)) continue; // null-Stat → nicht ins Leaderboard (statt 0)
      (T[cat] ||= []).push({ name: String(name), value: +val, rank: Number(r.rank) || null });
    }
    const fin = (T) => { for (const k in T) T[k] = T[k].sort((a, c) => (a.rank && c.rank ? a.rank - c.rank : c.value - a.value)).slice(0, 10).map(({ name, value }) => ({ name, value })); return T; };
    b.leaderboards = fin(tot); if (Object.keys(wk).length) b.leaderboards_weekly = fin(wk);
    info.leaderboards = Object.keys(tot).length + Object.keys(wk).length;
  }
  if (rowsPs) {
    const ps = {};
    for (const r of rowsPs.slice(0, 20000)) {
      const u = pk(r, ...LB_U); if (!u || !UUIDX.test(String(u))) continue; const o = (ps[nU(u)] ||= {});
      const sk = pk(r, "stat", "key", "category"); if (sk != null && r.value !== undefined) { const k = String(sk).toLowerCase().replace(/[^a-z0-9_]/g, "_").slice(0, 24); const v = r.value; o[k] = typeof v === "string" && /^[[{]/.test(v) ? (() => { try { return JSON.parse(v); } catch { return v; } })() : v; continue; }
      for (const [k, v] of Object.entries(r)) { if (SKIP_STAT.has(k)) continue; o[k] = typeof v === "string" && /^[[{]/.test(v) ? (() => { try { return JSON.parse(v); } catch { return v; } })() : v; }
    }
    for (const o of Object.values(ps)) { const d = {}; for (const k of [...DETAIL_MAPS, ...DETAIL_NUMS, ...DETAIL_ALIASES, "distance_m"]) if (o[k] !== undefined && (typeof o[k] === "object" || DETAIL_NUMS.includes(k))) { d[k] = o[k]; if (typeof o[k] === "object") delete o[k]; } if (Object.keys(d).length) o.details = d; }
    b.players_stats = ps;
  }
  if (rowsH) b.market_history = rowsH.map((r) => ({ item: pk(r, "item", "material", "item_id"), hour_ts: (tsMs(pk(r, "hour_ts", "hour", "bucket", "ts", "time", "timestamp", "created_at")) ?? NaN) / 1000, avg_price: pk(r, "avg_price", "avg", "price", "close", "buy_price", "value"), min_price: pk(r, "min_price", "min", "low"), max_price: pk(r, "max_price", "max", "high"), volume_qty: pk(r, "volume_qty", "volume", "qty", "amount", "menge") }));
  return info;
}
const FRESH_MS = 5 * 60 * 1000;
const clip = (v, n = 32) => String(v ?? "").slice(0, n);
const META_KEYS = new Set(["online", "team", "team_name", "team_color", "team_color_hex", "team_color_code", "last_seen", "last_online", "last_login"]);
function cleanIngest(b) {
  const servers = {};
  for (const [k, v] of Object.entries(b?.servers || {}).slice(0, 8)) {
    if (!/^[a-z0-9_-]{1,24}$/i.test(k) || typeof v !== "object" || !v) continue;
    servers[k] = { online: !!v.online, players: (Array.isArray(v.players) ? v.players : []).slice(0, 100).map(x => clip(typeof x === "string" ? x : x?.name, 16)).filter(Boolean),
      max: Number.isFinite(+v.max) ? +v.max : null, version: v.version ? clip(v.version, 40) : null, mode: v.mode ? clip(v.mode, 40) : null, uptime_seconds: Number.isFinite(+(v.uptime_seconds ?? v.uptime)) && (v.uptime_seconds ?? v.uptime) !== null ? Math.max(0, Math.floor(+(v.uptime_seconds ?? v.uptime))) : null, tps: Number.isFinite(+v.tps) ? Math.round(+v.tps * 10) / 10 : null };
  }
  const leaderboards = {};
  for (const [k, v] of Object.entries(b?.leaderboards || {}).slice(0, 32)) {
    if (!/^[a-z0-9_-]{1,24}$/i.test(k) || !Array.isArray(v)) continue;
    leaderboards[lbKey(k)] = v.filter(x => x?.value != null && x.value !== "" && Number.isFinite(+x.value)).slice(0, 10).map(x => ({ name: clip(x?.name, 16), value: +x.value })).filter(x => x.name);
  }
  const leaderboards_weekly = cleanLb(b?.leaderboards_weekly);
  const UUID = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;
  const normU = (x) => String(x).toLowerCase().replace(/-/g, "").replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, "$1-$2-$3-$4-$5");
  const links = Array.isArray(b?.links) ? b.links.slice(0, 200).filter(l => /^\d{15,21}$/.test(String(l?.discord_id ?? "")) && UUID.test(String(l?.mc_uuid ?? "")) && /^[A-Za-z0-9_]{1,16}$/.test(String(l?.mc_name ?? "")))
    .map(l => ({ discord_id: String(l.discord_id), mc_name: String(l.mc_name), mc_uuid: normU(l.mc_uuid), has_role: l.has_role === true, verified: l.verified === true })) : null;
  const players_stats = {}, details = {};
  for (const [k, v] of Object.entries(b?.players_stats || {}).slice(0, 200)) {
    if (!UUID.test(k) || typeof v !== "object" || !v) continue;
    const o = {};
    if (v.details !== undefined) { const d = cleanDetails(v.details); if (d) details[normU(k)] = d; }
    // Meta-Felder (team, team_color, last_seen, online) immer zuerst, damit sie nicht am 24er-Limit hängen bleiben
    const ent = Object.entries(v).filter(([x]) => x !== "details"), metaE = ent.filter(([x]) => META_KEYS.has(x));
    for (const [sk, sv] of [...metaE, ...ent.filter(([x]) => !META_KEYS.has(x)).slice(0, Math.max(0, 24 - metaE.length))]) {
      if (!/^[a-z0-9_]{1,24}$/i.test(sk)) continue;
      // null bleibt null (vorher: +null === 0 → Platzhalter-0), Bool bleibt Bool (vorher verworfen → online fehlte)
      if (sv === null) { o[sk] = null; continue; }
      if (typeof sv === "boolean") { o[sk] = sv; continue; }
      // online: nur eindeutige Werte (true/false, 1/0, "1"/"0", "true"/"false"); unbekannte Werte werden verworfen (Feld fehlt dann)
      if (sk === "online") { const t = sv === 1 || sv === "1" || sv === "true" ? true : sv === 0 || sv === "0" || sv === "false" ? false : null; if (t !== null) o.online = t; continue; }
      if (sv === "" || (typeof sv === "string" && !sv.trim())) { o[sk] = null; continue; }
      if (/^(inventory|inv|inventar|items)$/i.test(sk)) { const inv = normInv(sv); if (inv) o.inventory = inv; continue; }
      if (/^(pickup|pickups|abholfach|abholungen|claims|claim_chest|pickup_chest)$/i.test(sk)) { const inv = normInv(sv); if (inv) o.pickup = inv; continue; }
      // skin_url vollständig speichern (nicht auf 40 Zeichen kürzen), nur gültige textures.minecraft.net-URLs
      if (sk === "skin_url") { const u = validSkinUrl(sv); if (u) o.skin_url = u; continue; }
      if (Number.isFinite(+sv) && typeof sv !== "boolean") o[sk] = +sv; else if (typeof sv === "string") o[sk] = clip(sv, 40);
    }
    players_stats[normU(k)] = o;
  }
  return { servers, leaderboards, links, players_stats, details, leaderboards_weekly };
}
/* Erweiterung Detail-Stats + Wochen-Bestenlisten */
function cleanLb(o) {
  if (!o || typeof o !== "object" || Array.isArray(o)) return null;
  const r = {};
  for (const [k, v] of Object.entries(o).slice(0, 32)) {
    if (!/^[a-z0-9_-]{1,24}$/i.test(k) || !Array.isArray(v)) continue;
    r[lbKey(k)] = v.filter(x => x?.value != null && x.value !== "" && Number.isFinite(+x.value)).slice(0, 10).map(x => ({ name: clip(x?.name, 16), value: +x.value })).filter(x => /^[A-Za-z0-9_]{1,16}$/.test(x.name)).sort((a, b) => b.value - a.value);
  }
  return r;
}
const DETAIL_MAPS = ["mined", "placed", "killed", "deaths_by", "deaths_entity", "crafted", "playtime_by_world"];
const DETAIL_NUMS = ["fished", "traded", "jumps", "damage_dealt", "damage_taken", "cp_earned", "shop_sales"];
const DIST_KEYS = ["walk", "sprint", "fly", "swim", "boat", "horse", "elytra", "minecart", "climb", "crouch"];
// Vanilla minecraft:custom-Stats (Zentimeter / Zähler) → Website-Keys
const CM_MAP = { walk_one_cm: "walk", sprint_one_cm: "sprint", fly_one_cm: "fly", aviate_one_cm: "elytra", swim_one_cm: "swim", walk_under_water_one_cm: "swim", walk_on_water_one_cm: "swim", boat_one_cm: "boat", horse_one_cm: "horse", minecart_one_cm: "minecart", climb_one_cm: "climb", crouch_one_cm: "crouch" };
const CUSTOM_NUM = { fish_caught: "fished", traded_with_villager: "traded", jump: "jumps", damage_dealt: "damage_dealt", damage_taken: "damage_taken" };
const DETAIL_ALIASES = ["distance_cm", "blocks_placed", "custom"];
const keyOf = (k) => String(k).toLowerCase().replace(/^minecraft:/, "");
const num = (v) => (typeof v === "number" || (typeof v === "string" && v.trim() !== "")) && Number.isFinite(+v) ? Math.max(0, +v) : null;
function cleanDetails(d) {
  if (!d || typeof d !== "object" || Array.isArray(d)) return null;
  d = normDetails(d);
  const o = {};
  for (const m of DETAIL_MAPS) {
    const src = d[m]; if (!src || typeof src !== "object" || Array.isArray(src)) continue;
    const e = [];
    for (const [k, v] of Object.entries(src)) {
      const id = String(k).toLowerCase().replace(/^minecraft:/, ""), n = num(v);
      if (/^[a-z0-9_./-]{1,48}$/.test(id) && n !== null) e.push([id, n]);
    }
    e.sort((a, b) => b[1] - a[1]); if (e.length) o[m] = Object.fromEntries(e.slice(0, 25));
  }
  if (d.distance_m && typeof d.distance_m === "object") { const r = {}; for (const k of DIST_KEYS) { const n = num(d.distance_m[k]); if (n !== null) r[k] = Math.round(n); } if (Object.keys(r).length) o.distance_m = r; }
  for (const k of DETAIL_NUMS) { const n = num(d[k]); if (n !== null) o[k] = n; }
  if (!Object.keys(o).length) return null;
  return JSON.stringify(o).length <= 16384 ? o : null;
}
// Aliase von Craft/Dex: distance_cm (custom *_one_cm), deaths_entity, blocks_placed, custom
const isObj = (x) => x && typeof x === "object" && !Array.isArray(x);
export function normDetails(src) {
  const d = { ...src };
  if (isObj(d.blocks_placed) && !isObj(d.placed)) d.placed = d.blocks_placed;
  // deaths_entity (Mobs) und deaths_by (sonstige Ursachen) bleiben getrennte Keys
  const cm = {};
  const addCm = (o) => { if (!isObj(o)) return; for (const [k0, v] of Object.entries(o)) { const k = keyOf(k0), t = CM_MAP[k] || (DIST_KEYS.includes(k) ? k : null), n = num(v); if (t && n !== null) cm[t] = (cm[t] || 0) + n; } };
  addCm(d.distance_cm); addCm(d.custom);
  if (Object.keys(cm).length && !isObj(d.distance_m)) d.distance_m = Object.fromEntries(Object.entries(cm).map(([k, v]) => [k, v / 100]));
  if (isObj(d.custom)) for (const [k0, v] of Object.entries(d.custom)) { const t = CUSTOM_NUM[keyOf(k0)], n = num(v); if (t && n !== null && d[t] === undefined) d[t] = t.startsWith("damage") ? n / 10 : n; }
  return d;
}
async function mcLeaderboards(env) {
  const { results } = await env.DB.prepare("SELECT kind, data, updated_at FROM mc_leaderboards").all().catch(() => ({ results: [] }));
  const out = { total: null, weekly: null };
  for (const r of results) if (r.kind in out) out[r.kind] = { updated_at: new Date(r.updated_at).toISOString(), lists: JSON.parse(r.data) };
  if (!out.total) { const row = await env.DB.prepare("SELECT data, updated_at FROM mc_snapshot WHERE id = 1").first().catch(() => null); const lb = row ? JSON.parse(row.data).leaderboards : null; if (lb && Object.keys(lb).length) out.total = { updated_at: new Date(row.updated_at).toISOString(), lists: lb }; }
  return json(out, 200, { "cache-control": "public, max-age=5" });
}
async function mcIngest(req, env) {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const tok = req.headers.get("x-ingest-token") || "";
  if (!env.MC_INGEST_TOKEN || !safeEq(tok, env.MC_INGEST_TOKEN)) return json({ error: "unauthorized" }, 401);
  const raw = await req.text(); if (raw.length > 8388608) return json({ error: "too large" }, 413);
  let b; try { b = JSON.parse(raw); } catch { return json({ error: "invalid json" }, 400); }
  if (!b || typeof b !== "object") return json({ error: "invalid json" }, 400);
  let econ;
  if ("economy_daily" in b) { econ = cleanEconomy(b.economy_daily); if (econ.error) return json({ error: econ.error }, 400); }
  let ranks;
  if ("player_ranks" in b) {
    // Ungültig → nur dieses Feld verwerfen (ein warn), Rest des Ingests läuft weiter. Leeres Array → ignorieren, nichts löschen.
    ranks = cleanRanks(b.player_ranks);
    if (ranks.error) { console.warn("mc-ingest: player_ranks dropped: " + ranks.error); ranks = { rows: [], dropped: ranks.error }; }
  }
  let pvp;
  if ("pvp_stats" in b) {
    pvp = cleanPvp(b.pvp_stats);
    if (pvp.error) { console.warn("mc-ingest: pvp_stats dropped: " + pvp.error); pvp = { rows: [], dropped: pvp.error }; }
  }
  const vinfo = await normalizeViews(env, b);
  const { links, players_stats, details, leaderboards_weekly, ...data } = cleanIngest(b), now = Date.now();
  const st = [], market = cleanMarket(b?.market), market_history = cleanHistory(b?.market_history);
  if (b?.servers || b?.leaderboards) {
    st.push(snapshotStatement(env, b.servers ? data.servers ?? null : undefined, b.leaderboards ? data.leaderboards ?? null : undefined, now));
  }
  if (links) {
    for (const l of links) st.push(env.DB.prepare("INSERT INTO mc_links (discord_id, mc_name, mc_uuid, has_role, verified, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(discord_id) DO UPDATE SET mc_name=excluded.mc_name, mc_uuid=excluded.mc_uuid, has_role=excluded.has_role, verified=excluded.verified, updated_at=excluded.updated_at WHERE mc_name IS NOT excluded.mc_name OR mc_uuid IS NOT excluded.mc_uuid OR has_role IS NOT excluded.has_role OR verified IS NOT excluded.verified").bind(l.discord_id, l.mc_name, l.mc_uuid, l.has_role ? 1 : 0, l.verified ? 1 : 0, now));
    // a full list removes the links that are gone, instead of deleting and re-inserting all of them (D1 write budget)
    if (b.links_full === true) st.push(env.DB.prepare("DELETE FROM mc_links WHERE discord_id NOT IN (SELECT value FROM json_each(?))").bind(JSON.stringify(links.map((l) => String(l.discord_id)))));
  }
  if (b?.leaderboards) st.push(env.DB.prepare("INSERT INTO mc_leaderboards (kind, data, updated_at) VALUES ('total', ?, ?) ON CONFLICT(kind) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at WHERE data IS NOT excluded.data OR updated_at < excluded.updated_at - 240000").bind(JSON.stringify(cleanLb(b.leaderboards) || {}), now));
  if (leaderboards_weekly) st.push(env.DB.prepare("INSERT INTO mc_leaderboards (kind, data, updated_at) VALUES ('weekly', ?, ?) ON CONFLICT(kind) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at WHERE data IS NOT excluded.data OR updated_at < excluded.updated_at - 240000").bind(JSON.stringify(leaderboards_weekly), now));
  for (const [k, v] of Object.entries(players_stats)) st.push(env.DB.prepare("INSERT INTO mc_player_stats (mc_uuid, stats, updated_at, details) VALUES (?, ?, ?, ?) ON CONFLICT(mc_uuid) DO UPDATE SET stats=excluded.stats, updated_at=excluded.updated_at, details=COALESCE(excluded.details, mc_player_stats.details) WHERE stats IS NOT excluded.stats OR (excluded.details IS NOT NULL AND details IS NOT excluded.details) OR updated_at < excluded.updated_at - 240000").bind(k, JSON.stringify(v), now, details[k] ? JSON.stringify(details[k]) : null));
  st.push(...marketStatements(env, market, market_history));
  // optionales Top-Level-Feld price_reset_at (ISO): speichern; null/"" löscht (dann gilt wieder env PRICE_RESET_AT)
  let reset_info;
  if (b && "price_reset_at" in b) {
    const v = b.price_reset_at, t = parseReset(v);
    if (v === null || v === "") { st.push(env.DB.prepare("DELETE FROM mc_meta WHERE key = 'price_reset_at'")); reset_info = null; }
    else if (t) { reset_info = new Date(t * 1000).toISOString(); st.push(env.DB.prepare("INSERT INTO mc_meta (key, value, updated_at) VALUES ('price_reset_at', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at WHERE value IS NOT excluded.value").bind(reset_info, now)); }
    else reset_info = "invalid";
  }
  const shops = cleanShops(b?.shops), auctions = cleanAuctions(b?.auctions ?? b?.v_auctions, b?.auction_bids ?? b?.v_auction_bids);
  if (shops) st.push(blobStatement(env, "shops", shops, now));
  if (auctions) st.push(blobStatement(env, "auctions", auctions, now));
  const parkour = cleanParkour(b?.parkour, now); if (parkour) st.push(...parkourStatements(env, parkour.rows, parkour.names, now));
  if (econ) st.push(...economyStatements(env, econ.rows, now));
  if (ranks && ranks.rows.length) st.push(...rankStatements(env, ranks.rows, now));
  if (pvp && pvp.rows.length) st.push(...pvpStatements(env, pvp.rows, now));
  if (st.length) logWrites("mc-ingest", await env.DB.batch(st));
  HIST_MEMO = null; MARKET_MEMO = null; // neue Marktdaten/Reset: kurzer Speicher ist nicht mehr gültig
  return json({ ok: true, ...(econ ? { economy_daily: econ.rows.length } : {}), ...(ranks ? { player_ranks: ranks.rows.length, ...(ranks.dropped ? { player_ranks_dropped: true } : {}) } : {}), ...(pvp ? { pvp_stats: pvp.rows.length, ...(pvp.dropped ? { pvp_stats_dropped: true } : {}) } : {}), ...(parkour ? { parkour: parkour.rows.length, parkour_rejected: parkour.rejected, parkour_course_names: parkour.names.length } : {}), views: vinfo, shops: shops ? shops.length : 0, auctions: auctions ? auctions.length : 0, market: market ? market.length : 0, market_history: market_history ? market_history.length : 0, servers: Object.keys(data.servers).length, leaderboards: Object.keys(data.leaderboards).length, links: links ? links.length : 0, players_stats: Object.keys(players_stats).length, details: Object.keys(details).length, leaderboards_weekly: leaderboards_weekly ? Object.keys(leaderboards_weekly).length : 0, ...(reset_info !== undefined ? { price_reset_at: reset_info } : {}) });
}
let _fb; const FB = () => _fb || (_fb = makeFeedback({ json, getUser, safeEq, MAIN, MCD }));
let _trade; const TRADE = () => _trade || (_trade = makeTrade({ json, getUser, safeEq, MAIN, MCD }));
let _blog; const BLOG = () => _blog || (_blog = makeBlog({ json, getUser, html, sitePage, rand, safeEq, MAIN, notFound, chapterExists: (s, n) => osSeries("de").some((se) => se.slug === s && se.chapters.some((c) => c.n === n)) }));
let _vipq; const VIPQ = () => _vipq || (_vipq = makeVip({ json, getUser, safeEq, MAIN, MCD }));
async function mcData(env) {
  const row = await env.DB.prepare("SELECT data, updated_at FROM mc_snapshot WHERE id = 1").first().catch(() => null);
  const d = row ? JSON.parse(row.data) : {}, now = Date.now(), iso = (t) => t ? new Date(t).toISOString() : null;
  const sAt = d.servers_at || (d.servers ? row.updated_at : null), lAt = d.leaderboards_at || (d.leaderboards ? row.updated_at : null);
  const sF = !!sAt && now - sAt <= FRESH_MS, lF = !!lAt && now - lAt <= FRESH_MS;
  return json({ fresh: sF || lF, updated_at: iso(row?.updated_at), servers_fresh: sF, servers_at: iso(sAt), leaderboards_fresh: lF, leaderboards_at: iso(lAt),
    servers: d.servers || {}, leaderboards: lF ? d.leaderboards || {} : {} }, 200, { "cache-control": "public, max-age=5" });
}

/* ---------- Markt ---------- */
const ITEM_RE = /^[a-z0-9_]{1,48}$/;
const cleanItem = (v) => { const id = String(v ?? "").toLowerCase().replace(/^minecraft:/, ""); return ITEM_RE.test(id) ? id : null; };
const price = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 && n <= 1e12 ? Math.round(n * 1e4) / 1e4 : null; };
const MARKET_MAX = 2000, HIST_MAX = 60000, HIST_CHUNK = 4000, HIST_DAYS = 90;
function cleanMarket(a) {
  if (!Array.isArray(a)) return null;
  const seen = new Set(), out = [];
  for (const x of a.slice(0, MARKET_MAX)) {
    const item = cleanItem(x?.item); if (!item || seen.has(item)) continue;
    const buy = price(x.buy_price), sell = price(x.sell_price);
    const locked = x.locked === true || x.buy_enabled === false || !(buy > 0) ? 1 : 0;
    const slocked = x.sell_enabled === false || !(sell > 0) ? 1 : 0;
    const ch = Number(x.change_24h_pct), up = Number(x.updated_at);
    seen.add(item);
    out.push({ item, buy_locked: locked, sell_locked: slocked, buy_price: buy ?? 0, sell_price: sell ?? 0, base_price: price(x.base_price) ?? buy ?? sell ?? 0, volume_24h_qty: price(x.volume_24h_qty) ?? 0, volume_24h_cp: price(x.volume_24h_cp) ?? 0,
      trades_24h: Math.floor(price(x.trades_24h) ?? 0), change_24h_pct: Number.isFinite(ch) ? Math.max(-1e4, Math.min(1e4, Math.round(ch * 100) / 100)) : 0,
      updated_at: Number.isFinite(up) && up > 0 ? Math.floor(up > 1e11 ? up / 1000 : up) : Math.floor(Date.now() / 1000) });
  }
  return out;
}
function cleanHistory(a) {
  if (!Array.isArray(a)) return null;
  const now = Math.floor(Date.now() / 1000), min = now - HIST_DAYS * 86400, m = new Map();
  for (const x of a.slice(0, HIST_MAX)) {
    const item = cleanItem(x?.item); let ts = Number(x?.hour_ts); if (!item || !Number.isFinite(ts)) continue;
    if (ts > 1e11) ts = ts / 1000; ts = Math.floor(ts / 3600) * 3600; if (ts < min || ts > now + 3600) continue;
    const avg = price(x.avg_price); if (avg === null) continue;
    m.set(item + "|" + ts, { item, hour_ts: ts, avg_price: avg, min_price: price(x.min_price) ?? avg, max_price: price(x.max_price) ?? avg, volume_qty: price(x.volume_qty) ?? 0 });
  }
  return [...m.values()];
}
function marketStatements(env, market, hist) {
  const st = [];
  if (market) {
    // Live-Preispunkte: bei jeder Änderung von Kauf-/Verkaufspreis (gegenüber mc_market) einen Tick speichern – vor dem Upsert.
    st.push(env.DB.prepare(`INSERT OR IGNORE INTO mc_price_ticks (item, ts, buy_price, sell_price, buy_locked)
      SELECT json_extract(j.value,'$.item'), ?, json_extract(j.value,'$.buy_price'), json_extract(j.value,'$.sell_price'), json_extract(j.value,'$.buy_locked') FROM json_each(?) j LEFT JOIN mc_market m ON m.item = json_extract(j.value,'$.item')
      WHERE m.item IS NULL OR m.buy_price IS NOT json_extract(j.value,'$.buy_price') OR m.sell_price IS NOT json_extract(j.value,'$.sell_price')`).bind(Math.floor(Date.now() / 1000), JSON.stringify(market)));
    st.push(env.DB.prepare("DELETE FROM mc_price_ticks WHERE ts < ?").bind(Math.floor(Date.now() / 1000) - HIST_DAYS * 86400));
    // Nur geänderte Zeilen schreiben (Push jede Minute): Upsert mit WHERE, danach verschwundene Items löschen
    for (let i = 0; i < market.length; i += HIST_CHUNK) st.push(env.DB.prepare(`INSERT INTO mc_market (item, buy_locked, sell_locked, buy_price, sell_price, base_price, volume_24h_qty, volume_24h_cp, trades_24h, change_24h_pct, updated_at)
      SELECT json_extract(value,'$.item'), json_extract(value,'$.buy_locked'), json_extract(value,'$.sell_locked'), json_extract(value,'$.buy_price'), json_extract(value,'$.sell_price'), json_extract(value,'$.base_price'), json_extract(value,'$.volume_24h_qty'), json_extract(value,'$.volume_24h_cp'), json_extract(value,'$.trades_24h'), json_extract(value,'$.change_24h_pct'), json_extract(value,'$.updated_at') FROM json_each(?) WHERE 1
      ON CONFLICT(item) DO UPDATE SET buy_locked=excluded.buy_locked, sell_locked=excluded.sell_locked, buy_price=excluded.buy_price, sell_price=excluded.sell_price, base_price=excluded.base_price, volume_24h_qty=excluded.volume_24h_qty, volume_24h_cp=excluded.volume_24h_cp, trades_24h=excluded.trades_24h, change_24h_pct=excluded.change_24h_pct, updated_at=excluded.updated_at
      WHERE buy_locked IS NOT excluded.buy_locked OR sell_locked IS NOT excluded.sell_locked OR buy_price IS NOT excluded.buy_price OR sell_price IS NOT excluded.sell_price OR base_price IS NOT excluded.base_price OR volume_24h_qty IS NOT excluded.volume_24h_qty OR volume_24h_cp IS NOT excluded.volume_24h_cp OR trades_24h IS NOT excluded.trades_24h OR change_24h_pct IS NOT excluded.change_24h_pct`).bind(JSON.stringify(market.slice(i, i + HIST_CHUNK))));
    st.push(env.DB.prepare("DELETE FROM mc_market WHERE item NOT IN (SELECT value FROM json_each(?))").bind(JSON.stringify(market.map((m) => m.item))));
  }
  if (hist && hist.length) {
    /* D1 free tier: 100k written rows a day. A history resync re-sends every hour of the last 90 days; hours that are
       over (older than 2 h) are only inserted when missing, never rewritten — slightly different averages from a
       recomputation upstream no longer cost a write per row (08.11.: 87k of 100k rows went here) */
    const closed = Math.floor(Date.now() / 1000) - 7200;
    for (let i = 0; i < hist.length; i += HIST_CHUNK) st.push(env.DB.prepare(`INSERT INTO mc_market_history (item, hour_ts, avg_price, min_price, max_price, volume_qty)
      SELECT json_extract(value,'$.item'), json_extract(value,'$.hour_ts'), json_extract(value,'$.avg_price'), json_extract(value,'$.min_price'), json_extract(value,'$.max_price'), json_extract(value,'$.volume_qty') FROM json_each(?) WHERE 1
      ON CONFLICT(item, hour_ts) DO UPDATE SET avg_price=excluded.avg_price, min_price=excluded.min_price, max_price=excluded.max_price, volume_qty=excluded.volume_qty WHERE excluded.hour_ts >= ?2 AND (avg_price IS NOT excluded.avg_price OR min_price IS NOT excluded.min_price OR max_price IS NOT excluded.max_price OR volume_qty IS NOT excluded.volume_qty)`).bind(JSON.stringify(hist.slice(i, i + HIST_CHUNK)), closed));
    st.push(env.DB.prepare("DELETE FROM mc_market_history WHERE hour_ts < ?").bind(Math.floor(Date.now() / 1000) - HIST_DAYS * 86400));
  }
  return st;
}
// Preis-Reset (env PRICE_RESET_AT, ISO-Zeitstempel; leer/ungültig = aus): Historie bleibt komplett,
// aber %-Änderungen, Top/Flop und Badges rechnen nur mit Punkten ab dem Reset → keine Fake-Crashes durch Neubepreisung.
// Vorrang: gespeicherter Ingest-Wert (mc_meta.price_reset_at) vor env PRICE_RESET_AT.
const parseReset = (v) => { v = String(v ?? "").trim(); if (!v) return null; const t = Date.parse(v); return Number.isFinite(t) ? Math.floor(t / 1000) : null; };
async function resetAt(env) {
  const r = await env.DB.prepare("SELECT value FROM mc_meta WHERE key = 'price_reset_at'").first().catch(() => null);
  return (r ? parseReset(r.value) : null) ?? parseReset(env?.PRICE_RESET_AT);
}
// Kurzer Speicher je Worker-Instanz (mehr Aufrufe in kurzer Zeit lesen nicht jedes Mal neu aus D1).
let HIST_MEMO = null, MARKET_MEMO = null;
// %-Änderung aus der Preishistorie (letzter Stundenwert vs. Wert vor ≥24h); ohne Historie bleibt der Ingest-Wert, has_hist=0
async function histPct(env, items) {
  if (!items.length) return; const now = Math.floor(Date.now() / 1000), rs = await resetAt(env), since = Math.max(now - 8 * 86400, rs && rs <= now ? rs : 0);
  // Pro Item nur der jeweils letzte Wert, gezielt über den Primärschlüssel (item, hour_ts). Vorher: GROUP BY über die
  // komplette Historie (~25-35k gelesene Zeilen je Abfrage, zwei Mal je Aufruf) - das hat am 03.11. das tägliche
  // D1-Lesezeilen-Limit (5 Mio.) gesprengt und die ganze Seite lahmgelegt. Jetzt rund 4k Zeilen je Aufruf.
  const cutoff = now - 86400, many = items.length > 20;
  const run = async (upper) => {
    const extra = upper ? " AND hour_ts <= ?" : "", tail = upper ? [cutoff] : [];
    try {
      if (many) return (await env.DB.prepare(`SELECT m.item AS item, h.avg_price AS avg_price, h.hour_ts AS t FROM mc_market m CROSS JOIN mc_market_history h ON h.item = m.item AND h.hour_ts = (SELECT MAX(hour_ts) FROM mc_market_history WHERE item = m.item AND hour_ts >= ?${extra})`).bind(since, ...tail).all()).results;
      const sts = items.map((x) => env.DB.prepare(`SELECT item, avg_price, hour_ts AS t FROM mc_market_history WHERE item = ? AND hour_ts >= ?${extra} ORDER BY hour_ts DESC LIMIT 1`).bind(x.item, since, ...tail));
      return (await env.DB.batch(sts)).flatMap((r) => r.results);
    } catch { return []; }
  };
  let last, prev;
  if (many && HIST_MEMO && HIST_MEMO.rs === (rs ?? 0) && Date.now() - HIST_MEMO.at < 120000) ({ last, prev } = HIST_MEMO);
  else { [last, prev] = await Promise.all([run(false), run(true)]); if (many && last.length) HIST_MEMO = { at: Date.now(), rs: rs ?? 0, last, prev }; }
  const L = new Map(last.map((r) => [r.item, r])), P = new Map(prev.map((r) => [r.item, r]));
  const fresh = rs && rs <= now && now - rs < 86400; // <24h seit Reset: Ingest-% enthält den Reset-Sprung
  for (const x of items) { const l = L.get(x.item), p = P.get(x.item); x.has_hist = l ? 1 : 0; if (l && p && p.avg_price > 0 && l.t > p.t) { x.change_24h_pct = Math.round(((l.avg_price - p.avg_price) / p.avg_price) * 10000) / 100; x.hist_pct = 1; } else if (fresh) { x.change_24h_pct = 0; x.hist_pct = 0; x.reset_new = 1; } }
}
async function mcMarket(env) {
  if (MARKET_MEMO && Date.now() - MARKET_MEMO.at < 30000) return json(MARKET_MEMO.payload, 200, { "cache-control": "public, max-age=5" });
  const rs = await resetAt(env);
  const { results: items } = await env.DB.prepare("SELECT * FROM mc_market").all().catch(() => ({ results: [] }));
  await histPct(env, items);
  const spark = {}, spark_reset = {};
  if (items.length) {
    const by = [...items].sort((a, b) => b.change_24h_pct - a.change_24h_pct);
    const pick = new Set([...by.slice(0, 5), ...by.slice(-5), ...[...items].sort((a, b) => Math.abs(b.change_24h_pct) - Math.abs(a.change_24h_pct)).slice(0, 4)].map((x) => x.item));
    const ids = [...pick], since = Math.floor(Date.now() / 1000) - 7 * 86400;
    const { results } = await env.DB.prepare(`SELECT item, avg_price, hour_ts FROM mc_market_history WHERE item IN (${ids.map(() => "?").join(",")}) AND hour_ts >= ? ORDER BY hour_ts`).bind(...ids, since).all().catch(() => ({ results: [] }));
    for (const r of results) { (spark[r.item] ||= []).push(r.avg_price); if (rs && r.hour_ts < rs) spark_reset[r.item] = spark[r.item].length; }
  }
  const at = items.reduce((m, x) => Math.max(m, x.updated_at || 0), 0);
  const payload = { updated_at: at ? new Date(at * 1000).toISOString() : null, price_reset_at: rs ? new Date(rs * 1000).toISOString() : null, items, spark, spark_reset };
  if (items.length) MARKET_MEMO = { at: Date.now(), payload };
  return json(payload, 200, { "cache-control": "public, max-age=5" });
}
async function mcMarketItem(env, raw) {
  const id = cleanItem(raw); if (!id) return json({ error: "invalid item" }, 400);
  const item = await env.DB.prepare("SELECT * FROM mc_market WHERE item = ?").bind(id).first().catch(() => null);
  if (item) await histPct(env, [item]);
  const { results } = await env.DB.prepare("SELECT hour_ts, avg_price, min_price, max_price, volume_qty FROM mc_market_history WHERE item = ? AND hour_ts >= ? ORDER BY hour_ts").bind(id, Math.floor(Date.now() / 1000) - HIST_DAYS * 86400).all().catch(() => ({ results: [] }));
  const rs = await resetAt(env);
  const { results: tk } = await env.DB.prepare("SELECT ts, buy_price, sell_price, buy_locked FROM mc_price_ticks WHERE item = ? AND ts >= ? ORDER BY ts DESC LIMIT 5000").bind(id, Math.floor(Date.now() / 1000) - HIST_DAYS * 86400).all().catch(() => ({ results: [] }));
  return json({ item: item || null, price_reset_at: rs ? new Date(rs * 1000).toISOString() : null, history: results.map((r) => [r.hour_ts, r.avg_price, r.min_price, r.max_price, r.volume_qty]),
    ticks: tk.reverse().map((r) => [r.ts, r.buy_price, r.sell_price, r.buy_locked ? 1 : 0]) }, 200, { "cache-control": "public, max-age=5" });
}

/* ---------- Helfer ---------- */
// CSP wird erzwungen (vorher Report-Only). Geprüft: alle Seiten beider Hosts, ein- und ausgeloggt,
// ohne Verstoß gegen diese Liste. Inline-Skripte/-Styles und Inline-Handler (onerror=…) sind noch
// nötig, daher 'unsafe-inline' (Nonces wären ein größerer Umbau). Kein report-uri → keine IP-Logs.
// form-action: Logout ist ein POST an die Hauptdomain, auch von mc. aus, und leitet auf beide Hosts weiter.
const CSP = `default-src 'self'; script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://mc-heads.net https://cdn.jsdelivr.net https://cdn.discordapp.com; font-src 'self'; connect-src 'self'; frame-src https://challenges.cloudflare.com; frame-ancestors 'self'; base-uri 'self'; form-action 'self' https://${MAIN} https://${MCD} https://discord.com; object-src 'none'`;
// HSTS: .dev steht ohnehin auf der HSTS-Preload-Liste; der Header deckt zusätzlich Clients ohne diese Liste ab.
const HSTS = "max-age=31536000; includeSubDomains";
const SEC_HEADERS = { "content-security-policy": CSP, "strict-transport-security": HSTS, "x-content-type-options": "nosniff", "referrer-policy": "strict-origin-when-cross-origin", "x-frame-options": "SAMEORIGIN", "permissions-policy": "camera=(), microphone=(), geolocation=()" };
const json = (o, s = 200, extra = {}) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra } });
// Feeds (phase 3b): prebuilt at build time (src/generated/feeds.js), served with a validator so a
// reader that already has the current version gets a 304. Short cache, no tracking parameters.
const FEED_HEADERS = { "x-content-type-options": "nosniff", "referrer-policy": "strict-origin-when-cross-origin" };
function feedResponse(req, feed) {
  const headers = {
    "content-type": `${feed.format === "atom" ? "application/atom+xml" : "application/rss+xml"}; charset=utf-8`,
    "cache-control": "public, max-age=300",
    etag: feed.etag,
    ...FEED_HEADERS,
  };
  if (feed.lastModified) headers["last-modified"] = feed.lastModified;
  if (matchesEtag(req.headers.get("if-none-match"), feed.etag)) return new Response(null, { status: 304, headers });
  return new Response(feed.xml, { status: 200, headers });
}
const html = (h, s = 200, extra = {}) => new Response(h.replaceAll("{{Y}}", String(new Date().getUTCFullYear())), { status: s, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache", ...SEC_HEADERS, ...extra } });
// 404 der Hauptdomain im v2-Look (Vorlage NotFound.html): Nachthimmel mit Twinkles, das verwirrte
// Maskottchen, drei echte Wege zurück. Das MC-404 bleibt unverändert.
const NOTFOUND_BODY = `
<section class="e404"><div class="wrap">
<svg class="px sky" viewBox="0 0 120 40" preserveAspectRatio="none" aria-hidden="true" focusable="false"><rect class="tw" x="10" y="6" width="1" height="1" fill="#fff"></rect><rect class="tw" x="30" y="18" width="1" height="1" fill="#ffd45e"></rect><rect class="tw" x="92" y="10" width="1" height="1" fill="#fff"></rect><rect class="tw" x="104" y="24" width="1" height="1" fill="#c9b8ff"></rect><rect class="tw" x="70" y="4" width="1" height="1" fill="#fff"></rect></svg>
<div class="art">
<svg class="px tilt" width="150" height="150" viewBox="0 0 16 16" role="img" aria-label="Das Maskottchen schaut verwirrt"><rect x="2" y="1" width="3" height="3" fill="#a9b7d9"></rect><rect x="11" y="1" width="3" height="3" fill="#a9b7d9"></rect><rect x="1" y="3" width="14" height="11" fill="#a9b7d9"></rect><rect x="2" y="4" width="12" height="9" fill="var(--cream)"></rect><rect x="5" y="7" width="2" height="1" fill="#1f2a44"></rect><rect x="9" y="6" width="2" height="3" fill="#1f2a44"></rect><rect x="3" y="10" width="2" height="1" fill="var(--cheek)"></rect><rect x="11" y="10" width="2" height="1" fill="var(--cheek)"></rect><rect x="6" y="11" width="4" height="1" fill="#1f2a44"></rect></svg>
<span class="q tw">?</span>
</div>
<p class="pk">Fehler 404</p>
<h1 class="h1x">Hier ist nichts.</h1>
<p class="lead">Diese Seite gibt es nicht – oder noch nicht. Passend zum Namen. Vielleicht hilft einer dieser Wege:</p>
<p class="rowcta"><a class="btn" href="/">Zur Startseite</a><a class="btn sec" href="/portfolio">Projekte</a><a class="btn sec" href="https://${MCD}/">Minecraft-Server</a></p>
</div></section>`;

const notFound = (mc, req) => html(mc
  ? shell({ title: "404 · NwebNotFound MC", desc: "", css: MC_CSS, nav: mNav, footer: mFoot, themeColor: "#0b0f0c", body: `<section class="hero center"><div class="wrap"><h1 class="h-xl">404</h1><p class="lead">Diesen Chunk gibt es nicht.</p><p style="margin-top:2rem"><a class="btn" href="/">Zur Startseite</a></p></div></section>` })
  : legacyNav(portfolio({ title: "404 · NwebNotFound", desc: "", nav: pNav(""), body: NOTFOUND_BODY }), req), 404);
async function assetOrNotFound(req, env, mc) {
  if (env.ASSETS) {
    const ar = await env.ASSETS.fetch(req);
    if (ar.status !== 404) return ar;
  }
  // Main site: an unknown page is the 404 window (real HTTP 404).
  if (!mc && req.method === "GET") {
    const url = new URL(req.url), pre = splitLang(url.pathname.replace(/\/$/, "") || "/");
    const lang = pre.lang || pickLang(req.headers.get("accept-language"), cookies(req)[LANG_COOKIE]);
    return osResponse(req, env, url, lang, { k: "notfound", path: pre.path });
  }
  return notFound(mc, req);
}

// ---- NwebOS windows (src/nwebos.js + src/nwebos-apps.js): the data for the window at this address ----
const WRITING_ALL = CONTENT.writing || [];
function osSeries(lang) {
  const stories = publishedWriting(WRITING_ALL).filter((w) => w.kind === "story");
  const slugs = [...new Set(stories.map((w) => w.series))];
  return slugs.map((s) => { const ch = chaptersOf(WRITING_ALL, s); return { slug: s, title: ch[0]?.seriesTitle || s, chapters: ch.map((c) => ({ n: c.chapter, title: c.title, slug: c.slug, item: c })) }; });
}
/* Old Creative Hub addresses that have no window of their own: /writing/series/<s> is the Texte window,
   /writing/<chapter-slug> is its chapter window, any other /writing/<slug> the text window (drafts: 404 window). */
function osLegacy(bare) {
  const se = /^\/writing\/series\/([a-z0-9-]+)$/.exec(bare);   // a shared series link: the Texte window, filtered to it
  if (se) return { route: chaptersOf(WRITING_ALL, se[1]).length ? { k: "writing", path: bare, filter: { series: se[1] } } : { k: "notfound", path: bare } };
  const one = /^\/writing\/([a-z0-9-]+)$/.exec(bare);
  if (!one) return null;
  const it = findWriting(WRITING_ALL, one[1]);   // archived stays reachable by its link, drafts never
  if (it && it.kind === "story" && it.series && it.chapter) return { location: `/writing/${it.series}/${it.chapter}` };
  if (it) return { route: { k: "text", path: bare, item: it } };
  return { route: { k: "notfound", path: bare } };
}
async function osResponse(req, env, url, lang, route) {
  const de = lang !== "en";
  let k = route.k, content = {}, title = "", status = 200, priv = false, oneLang = "";
  const u = ["profile", "blog-post"].includes(k) ? await getUser(req, env).catch(() => null) : null;
  if (k === "blog-edit") {
    // admin only (server-side, as the #106 page): guests sign in first, everyone else gets the 404 window
    const a = await BLOG().admin(req, env).catch(() => ({ err: 500 }));
    if (a.err === 401) return new Response(null, { status: 302, headers: { location: `/auth/discord/login?next=${encodeURIComponent("https://" + MAIN + route.path)}`, "cache-control": "no-store" } });
    if (a.err) k = "notfound";
    else { priv = true; content["blog-edit"] = `<p>${de ? "Der Editor braucht JavaScript." : "The editor needs JavaScript."}</p>`; }
  } else if (k === "blog") content.blog = blogList(lang, await BLOG().os.list(env, lang));
  else if (k === "blog-post") {
    const d = await BLOG().os.post(req, env, route.m[1], url.searchParams.get("preview"), lang).catch(() => null);
    if (d) { content["blog-post"] = blogPost(lang, d.post, d.rx, { signedIn: d.signedIn, older: d.older, newer: d.newer, preview: d.priv }); title = d.post.title; priv = d.priv; if (!d.post.has_en) oneLang = "de"; }
    else k = "notfound";
  } else if (k === "profile") {
    priv = true;
    if (u) {
      const cnt = await env.DB.prepare("SELECT COUNT(*) AS n FROM entries WHERE discord_id = ?").bind(u.id).first().catch(() => null);
      const { results: entries } = await env.DB.prepare("SELECT message, created_at FROM entries WHERE discord_id = ? ORDER BY id DESC LIMIT 3").bind(u.id).all().catch(() => ({ results: [] }));
      const rows = await BLOG().os.reads(env, u.id).catch(() => []);
      const blogSlugs = rows.filter((r) => r.post_id.startsWith("blog:")).map((r) => r.post_id.slice(5));
      const titles = await BLOG().os.titles(env, blogSlugs).catch(() => ({}));
      const ser = osSeries(lang);
      const reads = rows.map((r) => {
        if (r.post_id.startsWith("blog:")) { const t = titles[r.post_id.slice(5)]; return t && { kind: "Blog", title: de || !t.title_en ? t.title_de : t.title_en, pct: r.pct, href: (de ? "" : "/en") + "/blog/" + r.post_id.slice(5) }; }
        const [, s, n] = r.post_id.split(":"); const se = ser.find((x) => x.slug === s); const c = se && se.chapters.find((x) => String(x.n) === n);
        return c && { kind: de ? "Roman" : "Novel", title: `${se.title} · ${de ? "Kapitel" : "Chapter"} ${c.n}`, pct: r.pct, href: (de ? "" : "/en") + `/writing/${s}/${n}` };
      }).filter(Boolean);
      content.profile = osProfile(lang, { user: u, gbCount: cnt?.n || 0, entries: entries || [], reads });
    } else content.profile = osProfile(lang, null);
  } else if (k === "changelog") content.changelog = osChangelog(lang);
  else if (k === "writing") {
    const tag = (url.searchParams.get("tag") || "").slice(0, 40);
    content.writing = osWriting(lang, osSeries(lang), publishedWriting(WRITING_ALL).filter((w) => w.kind !== "story"), route.filter || (tag ? { tag } : {}));
  }
  else if (k === "chapter") {
    const se = osSeries(lang).find((x) => x.slug === route.m[1]); const i = se ? se.chapters.findIndex((c) => String(c.n) === route.m[2]) : -1;
    if (i >= 0) { const c = se.chapters[i]; content.chapter = osChapter(lang, se, { chapter: c.n, title: c.title }, c.item.html || "", se.chapters[i - 1], se.chapters[i + 1], { archived: !!c.item.archived, epub: epubPath(c.item.slug), seriesEpub: seriesEpubPath(se.slug), itemLang: c.item.lang }); title = `${se.title} · ${de ? "Kapitel" : "Chapter"} ${c.n}`; }
    else k = "notfound";
  }
  else if (k === "text") { content.text = osText(lang, route.item, route.item.html || ""); title = route.item.title; }
  if (k === "notfound") { content.notfound = osNotfound(lang, route.path); status = 404; }
  const entries = await guestEntries(env).catch(() => []);
  const page = nwebosPage({ lang, app: k, path: route.path, entries, sitekey: SITEKEY, content, title, status, oneLang });
  return html(page, status, { "cache-control": priv ? "private, no-store" : "no-store", vary: "cookie, accept-language", ...(priv ? { "x-robots-tag": "noindex" } : {}) });
}

// Latest guestbook entries (Discord avatar per rule 10), for the API and the server-rendered NwebOS window.
async function guestEntries(env) {
  const { results } = await env.DB.prepare("SELECT name, message, created_at, discord_id, avatar FROM entries ORDER BY id DESC LIMIT 50").all();
  return results.map(r => ({ name: r.name, message: r.message, created_at: r.created_at, avatar: r.discord_id ? avatarUrl(r.discord_id, r.avatar) : null }));
}

async function guestbookApi(req, env) {
  if (req.method === "GET") return json({ entries: await guestEntries(env) });
  if (req.method === "POST") {
    if (!authReady(env)) return json({ error: "Discord-Login ist bald verfügbar" }, 503);
    const user = await getUser(req, env); if (!user) return json({ error: "Bitte zuerst mit Discord anmelden" }, 401);
    let b; try { b = await req.json(); } catch { return json({ error: "Ungültige Anfrage" }, 400); }
    const message = String(b.message || "").trim();
    if (!message || message.length > 500) return json({ error: "Nachricht 1–500 Zeichen" }, 400);
    if (!(await verifyTurnstile(env, b?.token, { ip: req.headers.get("CF-Connecting-IP") || "", hosts: [MAIN, MCD] }))) return json({ error: "Captcha fehlgeschlagen" }, 403);
    const row = await env.DB.prepare("SELECT avatar FROM sessions WHERE id = ?").bind(user.sid).first();
    await env.DB.prepare("INSERT INTO entries (name, message, discord_id, avatar) VALUES (?, ?, ?, ?)").bind(user.name.slice(0, 50), message, user.id, row?.avatar || null).run();
    return json({ ok: true }, 201);
  }
  return json({ error: "Method not allowed" }, 405);
}

async function me(req, env) {
  const origin = req.headers.get("origin");
  const cors = origin === `https://${MCD}` || origin === `https://${MAIN}` ? { "access-control-allow-origin": origin, "access-control-allow-credentials": "true", vary: "origin" } : {};
  const u = await getUser(req, env).catch(() => null);
  const l = u ? await env.DB.prepare("SELECT mc_name FROM mc_links WHERE discord_id = ? AND verified = 1").bind(String(u.id)).first().catch(() => null) : null;
  return json({ available: authReady(env), user: u ? { id: u.id, name: u.name, username: u.username, avatar: u.avatar, mc_name: l?.mc_name || null } : null }, 200, cors);
}

// Letztes Netz: jeder ungefangene Fehler im Routing wird geloggt und als sauberes 500 beantwortet
// (statt Cloudflare-Fehler 1101). Keine Fehlerdetails an den Client.
async function handle(req, env, ctx) {
  try { return await route(req, env, ctx); }
  catch (e) {
    console.error("unhandled error", req.method, new URL(req.url).pathname, e && e.stack || e);
    let api = false; try { api = new URL(req.url).pathname.startsWith("/api/"); } catch {}
    /* D1's free-tier daily limit (resets 00:00 UTC): a soft 503 with Retry-After until the reset, so the senders
       (bot note_status, CraftCore sync) wait instead of hammering a hard 500 */
    if (/daily row (write|read) limit|exceeded D1's free tier/i.test(String(e && e.message || e))) {
      const now = Date.now(), wait = Math.max(60, Math.ceil((Math.ceil(now / 86400000) * 86400000 - now) / 1000));
      return new Response(JSON.stringify({ error: "Datenbank-Tageslimit erreicht, bitte später erneut", retry_after: wait }), { status: 503, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "retry-after": String(wait) } });
    }
    return api ? json({ error: "Interner Fehler" }, 500) : new Response("Interner Fehler", { status: 500, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  }
}

async function route(req, env, ctx) {
    const url = new URL(req.url);
    const hostH = req.headers.get("host")?.replace(/:\d+$/, "") || "";
    const allowTestHost = env.MC_INGEST_TOKEN === "e2e-token";
    const testHostHdr = allowTestHost ? req.headers.get("x-nnf-test-host")?.replace(/:\d+$/, "") || "" : "";
    const siteHost = testHostHdr || hostH || url.hostname;
    if (siteHost === `www.${MAIN}`) { url.hostname = MAIN; return Response.redirect(url.toString(), 301); }
    const p = url.pathname.replace(/\/$/, "") || "/";
    const isMc = siteHost === MCD;
    if (p === "/bundle/mc.css") return bundleResponse(req, env);
    if (STAMPED_HTML.includes(url.pathname)) return stampedAsset(req, env);

    if (p.startsWith("/api/feedback")) { const r = FB().route(p, req, env, url); if (r) return r; }
    if (p.startsWith("/api/mc-")) { const r = TRADE().route(p, req, env, url); if (r) return r; }
    if (p.startsWith("/api/mc-vip/") || p.startsWith("/api/mc-vip-")) { const r = await VIPQ().route(p, req, env, url); if (r) return r; }
    if (p === "/api/mc-status") return mcStatus(ctx, env);
    if (p === "/api/me") return me(req, env);
    if (p === "/api/mc-ingest") return mcIngest(req, env);
    if (p === "/api/mc-data") return mcData(env);
    if (p === "/api/profile") return profileApi(req, env);
    if (p === "/api/profile/delete") return profileDelete(req, env);
    if (p === "/api/mc-players") return json({ players: await playersApi(env, url) });
    if (p.startsWith("/api/mc-players/")) { const n = safeDecode(p.slice(16)); if (n == null) return json({ error: "Spieler nicht gefunden" }, 404); const u = await getUser(req, env).catch(() => null); const o = await playerApi(env, n, u); return o ? json(o) : json({ error: "Spieler nicht gefunden" }, 404); }
    if (p === "/api/mc-leaderboards") return mcLeaderboards(env);
    if (p === "/api/mc-parkour") return json(await parkourApi(env), 200, { "cache-control": "public, max-age=30" });
    if (p === "/api/mc-pvp") return json(await pvpApi(env), 200, { "cache-control": "public, max-age=30" });
    if (p === "/api/mc-vip") { if (req.method !== "GET") return json({ error: "Method not allowed" }, 405); const u = await getUser(req, env).catch(() => null); return json(await vipApi(env, u), 200, { "cache-control": "private, no-store" }); }
    if (p.startsWith("/api/mc-pvp/")) { const n = safeDecode(p.slice(12)); if (n == null) return json({ error: "keine PvP-Daten" }, 404); const o = await pvpPlayerApi(env, n); return o ? json(o, 200, { "cache-control": "public, max-age=30" }) : json({ error: "keine PvP-Daten" }, 404); }
    if (p === "/api/mc-economy") return json(await economyApi(env), 200, { "cache-control": "public, max-age=60" });
    if (p === "/api/mc-market") return mcMarket(env);
    if (p.startsWith("/api/mc-market/")) { const it = safeDecode(p.slice(15)); return it == null ? json({ error: "invalid item" }, 400) : mcMarketItem(env, it); }
    if (p.startsWith("/mc-head/")) return headResponse(req, p, ctx, env);
    if (p.startsWith("/mc-skin/")) return skinResponse(req, p, ctx, env);
    if (p.startsWith("/mc-mob/")) { const k = safeDecode(p.slice(8)); if (k == null) return new Response("Not found", { status: 404 }); return new Response(null, { status: 302, headers: { location: mobIcon(k.replace(/\.png$/, "")), "cache-control": "public, max-age=86400" } }); }
    if (p.startsWith("/mc-icon/")) { const dq = safeDecode(p.slice(9).replace(/^v2\//, "")), id = dq == null ? "" : dq.toLowerCase().replace(/\.png$/, "").replace(/^minecraft:/, ""); if (!ICON_ID_RE.test(id)) return new Response("Not found", { status: 404, headers: { "cache-control": "public, max-age=3600" } }); const r = resolveIcon(id); return r ? new Response(null, { status: 302, headers: { location: /^(https:|\/)/.test(r) ? r : TEX_BASE + r + ".png", "cache-control": "public, max-age=604800" } }) : new Response(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" rx="2" fill="#2a2f3a"/><text x="8" y="11.2" font-family="monospace" font-size="7" font-weight="700" fill="#9aa3b2" text-anchor="middle">${id.replace(/[^a-z0-9]/gi,"").slice(0,2).toUpperCase()}</text></svg>`, { status: 200, headers: { "content-type": "image/svg+xml", "x-icon-fallback": "1", "cache-control": "public, max-age=86400" } }); }
    if (p.startsWith("/auth/")) {
      if (isMc) { url.hostname = MAIN; return redirect(url.toString()); }
      const r = await auth(p, req, env, url); if (r) return r;
    }
    if (isMc) {
      if (p === "/") return html(MC_HOME);
      if (p === "/profile") return html(PROFILE_MC());
      if (p === "/leaderboards") return html(LEADERBOARDS_MC());
      if (p === "/pvp") return html(mcPage("PvP · NwebNotFound MC", "PvP-Rangliste der Arena: Siege, Niederlagen und Siegquote", pvpBody()));
      if (p === "/vip") return html(mcPage("VIP · NwebNotFound MC", "VIP- und MVP-Panel: eigener Rang, Vorteile, Welten und Stats", vipBody()));
      if (p === "/changelog") return html(mcPage("Changelog · NwebNotFound MC", "Neuigkeiten und Änderungen auf dem Minecraft-Server", changelogBody()));
      if (p === "/parkour") return html(mcPage("Parkour · NwebNotFound MC", "Parkour-Bestzeiten aus der Lobby: Top 10 pro Kurs", parkourBody()));
      if (p === "/bestellungen" || p === "/abholungen") return html(mcPage("Bestellungen · NwebNotFound MC", "Deine Bestellungen, Bank-Käufe und dein Abholfach", PICKUP_BODY));
      if (p === "/feedback") return html(shell({ title: "Feedback · NwebNotFound MC", desc: "Bug melden oder Idee einreichen", css: MC_CSS, nav: mNav, footer: mFoot, themeColor: "#0b0f0c", head: `<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>`, body: feedbackBody(SITEKEY, MAIN) }));
      if (p === "/spieler") return html(mcPage("Spieler · NwebNotFound MC", "Spieler suchen: Skin, öffentliche Stats und Profil", playersBody()));
      if (p.startsWith("/spieler/")) { const n = safeDecode(p.slice(9)); if (n == null || !/^[A-Za-z0-9_]{1,16}$/.test(n)) return notFound(true); return html(mcPage(n + " · Spieler · NwebNotFound MC", "Öffentliches Spielerprofil von " + n, playerBody(n, MAIN))); }
      if (p === "/markt" && url.searchParams.has("item")) {
        const raw = String(url.searchParams.get("item") || "").trim(), it = cleanItem(raw);
        const known = it ? await env.DB.prepare("SELECT 1 FROM mc_market WHERE item = ?").bind(it).first().catch(() => null) : null;
        return redirect(known ? `/markt/${encodeURIComponent(it)}` : `/markt?q=${encodeURIComponent(raw.replace(/^minecraft:/i, "").replace(/_/g, " ").slice(0, 48))}`);
      }
      if (p === "/shops") return html(mcPage("Shops · NwebNotFound MC", "Spielershops: Angebote, Preise, Lager und Orte", shopsBody()));
      if (p.startsWith("/shops/")) { const id = safeDecode(p.slice(7)); if (id == null || !/^[A-Za-z0-9_.:-]{1,64}$/.test(id)) return notFound(true); return html(mcPage("Shop · NwebNotFound MC", "Spielershop", shopBody(id))); }
      if (p === "/bestenlisten" || p === "/bestenliste") return Response.redirect(`https://${MCD}/leaderboards`, 301);
      if (p === "/auktionen") return html(mcPage("Auktionen · NwebNotFound MC", "Live-Auktionen vom Server", auctionsBody()));
      if (p.startsWith("/auktionen/")) { const id = safeDecode(p.slice(11)); if (id == null || !/^[A-Za-z0-9_.:-]{1,64}$/.test(id)) return notFound(true); return html(mcPage("Auktion · NwebNotFound MC", "Auktion mit Gebotsverlauf", auctionBody(id))); }
      if (p === "/markt") return html(mcPage("Markt · NwebNotFound MC", "Preise, Gewinner und Verlierer im Server-Shop", marketBody()));
      if (p.startsWith("/markt/")) { const raw = safeDecode(p.slice(7)), it = raw == null ? null : cleanItem(raw); if (!it) return notFound(true); return html(mcPage(it.replace(/_/g, " ") + " · Markt · NwebNotFound MC", "Preisverlauf im Server-Shop", marketItemBody(it))); }
      if (p === "/wiki") return html(mcPage("Wiki · NwebNotFound MC", "Anleitungen, Regeln und FAQ zum Minecraft-Server", wikiIndexBody(MC_HOST)));
      if (p.startsWith("/wiki/")) { const a = WIKI.find((x) => x.slug === p.slice(6)); if (!a) return notFound(true); return html(mcPage(a.title + " · Wiki · NwebNotFound MC", a.sum, wikiArticleBody(a, MC_HOST))); }
      return assetOrNotFound(req, env, true);
    }
    if (p === "/feedback") return new Response(null, { status: 301, headers: { location: `https://${MCD}/feedback`, "cache-control": "public, max-age=3600" } });
    if (p === "/api/guestbook") return guestbookApi(req, env);
    if (p === "/api/blog" || p.startsWith("/api/blog/")) { const r = await BLOG().api(p, req, env, url); if (r) return r; }
    // ---- Feeds (Creative Hub, phase 3b) ----
    // Vor dem Sprach-Redirect: /de/writing/feed.xml und /writing/feed.xml liefern denselben Feed (ein
    // Feed trägt die Sprache seines Inhalts, nicht die der Oberfläche). Vorgerendert, kein Markdown
    // zur Laufzeit.
    { const feed = feedFor(FEEDS, p); if (feed) return feedResponse(req, feed); }
    // phone audit A14: the changelog window as RSS, per language (its rows exist in both)
    if (/^\/(?:de\/|en\/)?changelog\/feed\.xml$/.test(p)) return new Response(osChangelogFeed(p.startsWith("/en/") ? "en" : "de"), { headers: { "content-type": "application/rss+xml; charset=utf-8", "cache-control": "public, max-age=300" } });
    // ---- Creative Hub (nwebnotfound.dev) ----
    // Sprachpfade `/de/…` und `/en/…` plus die sprachlosen Pfade. `/` selbst rendert die gewählte
    // Sprache (Cookie → Accept-Language → Deutsch), statt umzuleiten: so kann kein Redirect-Loop
    // entstehen. Ein Sprachpräfix vor einer Hub-fremden Route fällt auf den Pfad ohne Präfix zurück
    // (301), damit z. B. /en/guestbook nicht in einem 404 endet.
    const pre = splitLang(p);
    // NwebOS (src/nwebos.js) is the site (Nils 07.11.: no old pages behind NwebOS). Every page address is a window or
    // the 404 window; a left-over ?nwebos=0|1 goes back to the clean URL and clears the old opt-out cookie. HEAD
    // answers like GET without a body.
    if (req.method === "GET" || req.method === "HEAD") {
      const os = nwebosChoice(url);
      if (os.setCookie) { const u = new URL(url); u.searchParams.delete("nwebos"); return new Response(null, { status: 302, headers: { location: u.pathname + u.search, "set-cookie": os.setCookie, "cache-control": "no-store" } }); }
      const old = osLegacy(pre.path);
      if (old && old.location) return new Response(null, { status: 302, headers: { location: (pre.lang ? "/" + pre.lang : "") + old.location + url.search, "cache-control": "no-store" } });
      const route = old ? old.route : nwebosRoute(pre.path);   // the blog editor too (#119): every page is a window
      if (route) {
        const lang = pre.lang || pickLang(req.headers.get("accept-language"), cookies(req)[LANG_COOKIE]);
        const res = await osResponse(req, env, url, lang, route);
        if (pre.lang) res.headers.append("set-cookie", langCookie(pre.lang));
        return req.method === "HEAD" ? new Response(null, res) : res;
      }
    }
    // Blog (D1-backed, src/blog.js): before the hub, whose /blog is only the coming-soon page.
    if (pre.path === "/blog" || pre.path.startsWith("/blog/")) {
      const lang = pre.lang || pickLang(req.headers.get("accept-language"), cookies(req)[LANG_COOKIE]);
      const r = await BLOG().page(pre.path, req, env, url, lang);
      if (r) return r;
    }
    // A prefixed address without a window (an asset, an API, an old page): the bare address, remembering the language.
    // 302 + no-store: a cached 301 would skip the Worker on the next switch and never set the cookie again.
    if (pre.lang && (req.method === "GET" || req.method === "HEAD")) return new Response(null, { status: 302, headers: { location: `https://${MAIN}${pre.path}`, "set-cookie": langCookie(pre.lang), "cache-control": "no-store" } });
    if (p === "/minecraft" || p.startsWith("/minecraft/")) return Response.redirect(`https://${MCD}/`, 301);
    return assetOrNotFound(req, env, false);
}

export default {
  fetch: (req, env, ctx) => handle(req, env, ctx),
  async scheduled(event, env, ctx) {
    try { console.log("purge", JSON.stringify(await purge(env))); }
    catch (e) { console.error("purge failed", e && e.stack || e); throw e; }
  },
};
