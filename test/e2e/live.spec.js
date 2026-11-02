// Sanity check against the live sources: load each golden root with no HAR and compare with
// the recorded snapshot. A difference here means the world moved (data pushed to a branch
// tip, a new Verovio "latest", a CDN change), not necessarily Primal.
// Only runs with PRIMAL_LIVE=1; it makes real requests to GitHub and w3id.org.
import fs from "node:fs";
import { expect, test } from "@playwright/test";
import { capture } from "./support/capture.js";
import { goldenRoots, readSnapshot, rootTitle } from "./support/roots.js";

test.skip(!process.env.PRIMAL_LIVE, "live check runs only with PRIMAL_LIVE=1");

for (const root of goldenRoots) {
  test(rootTitle(root), async ({ context, page, baseURL }, testInfo) => {
    // a pass-through route disables the HTTP cache, as recording does
    await context.route("**", (route) => route.continue());
    const expected = readSnapshot(root);
    const actual = await capture(page, root, baseURL);
    fs.writeFileSync(testInfo.outputPath("actual.json"), JSON.stringify(actual, null, 2));
    expect(actual.compare).toEqual(expected.compare);
  });
}
