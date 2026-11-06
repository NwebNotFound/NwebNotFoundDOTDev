// UI tests serve public/ from disk; /bundle/mc.css is built by the Worker. This runs the real
// bundleResponse (src/bundle.js) with an ASSETS binding that reads the same public/ files.
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { bundleResponse } from "../../src/bundle.js";

export async function bundleCss(publicDir, href) {
  const env = { ASSETS: { fetch: async (req) => new Response(await readFile(resolve(publicDir, "." + new URL(req.url).pathname))) } };
  return (await bundleResponse(new Request(href), env)).text();
}
