// One stylesheet for every mc.nwebnotfound.dev page instead of four. The parts are concatenated in
// the order the shell used to link them (minecraft → ds → theme-v2 → unav), so the cascade is
// unchanged; only scripts sat between them. All url() references in these files are absolute, so
// moving them under /bundle/ changes no font or texture path.
// Cache: the shell links ?v=<AV>, a hash over public/ (scripts/deploy.sh). Only that exact version
// is cached as immutable; any other query is revalidated so an old link never pins new CSS.
import { AV } from "./asset-version.js";

export const MC_CSS_PARTS = ["/design/minecraft.css", "/mc/ds.css", "/mc/theme-v2.css", "/design/unav.css"];

// Static HTML in public/ cannot write ?v=${AV}. The one such page, the design preview, is routed
// through the Worker (wrangler.jsonc run_worker_first) and gets the version stamped on every
// /design and /mc CSS/JS link, so the immutable cache never pins an old file there.
export const STAMPED_HTML = ["/design/summer-preview", "/design/summer-preview.html"];
export const stampVersion = (html) => html.replace(/((?:src|href)="\/(?:design|mc)\/[^"?#]+\.(?:css|js))"/g, `$1?v=${AV}"`);
export async function stampedAsset(req, env) {
  const r = await env.ASSETS.fetch(req);
  if (r.status !== 200 || !/text\/html/.test(r.headers.get("content-type") || "")) return r;
  const h = new Headers(r.headers); h.delete("content-length"); h.delete("etag"); h.set("cache-control", "no-cache");
  return new Response(stampVersion(await r.text()), { status: 200, headers: h });
}

export async function bundleResponse(req, env) {
  const url = new URL(req.url);
  const parts = await Promise.all(MC_CSS_PARTS.map(async (path) => {
    const r = await env.ASSETS.fetch(new Request(new URL(path, url.origin)));
    if (!r.ok) throw new Error(`bundle part ${path}: ${r.status}`);
    return `/* ${path} */\n${await r.text()}`;
  }));
  const immutable = url.searchParams.get("v") === AV;
  return new Response(parts.join("\n"), {
    headers: {
      "content-type": "text/css; charset=utf-8",
      "cache-control": immutable ? "public, max-age=31536000, immutable" : "public, max-age=0, must-revalidate",
      "x-content-type-options": "nosniff",
    },
  });
}
