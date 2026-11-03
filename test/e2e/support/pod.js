// A fake Solid pod for the MAO v2 fixtures in test/v2/ (see make-v2-fixtures.js), answering
// as a Community Solid Server does where it matters to Primal:
//   - resource URLs have no extension; test/v2/pod/<path>.jsonld holds each one;
//   - application/ld+json, asked for or not: solidcommunity.net answers a resource PUT as
//     JSON-LD in the type it was stored in (checked 2026-11-02 on a public Listen Here
//     MusicalMaterial); only a GET asking for something else would get Turtle;
//   - private resources answer 401, audio 403 (copyright, as w3id's /ssv/audio/ does);
//   - throttled resources (a root's `throttle`: path → number of refusals, -1 for always)
//     answer 429 WITHOUT CORS headers, as solidcommunity.net appears to: the browser then
//     reports a failed fetch and hides the status;
//   - Access-Control-Allow-Origin: *.
import fs from "node:fs";
import path from "node:path";
import { repoRoot } from "./roots.js";

const v2Dir = path.join(repoRoot, "test/v2");
export const v2 = JSON.parse(fs.readFileSync(path.join(v2Dir, "roots.json"), "utf8"));
export const v2Roots = v2.roots;

export async function routePod(target, root) {
  const privatePaths = new Set(root.private || []);
  const refusals = { ...(root.throttle || {}) };
  await target.route(`${v2.origin}/**`, async (route) => {
    const request = route.request();
    const { pathname } = new URL(request.url());
    if (refusals[pathname]) {
      refusals[pathname]--;
      return route.fulfill({ status: 429, headers: { "content-type": "text/plain" }, body: "Too Many Requests" });
    }
    const headers = { "access-control-allow-origin": "*" };
    const file = path.join(v2Dir, "pod", pathname + ".jsonld");
    const status = privatePaths.has(pathname)
      ? 401
      : pathname.startsWith("/audio/")
        ? 403
        : fs.existsSync(file)
          ? 200
          : 404;
    if (status !== 200) {
      return route.fulfill({ status, headers: { ...headers, "content-type": "text/plain" }, body: "" });
    }
    headers["content-type"] = "application/ld+json";
    const body = request.method() === "HEAD" ? "" : fs.readFileSync(file);
    await route.fulfill({ status, headers, body });
  });
}
