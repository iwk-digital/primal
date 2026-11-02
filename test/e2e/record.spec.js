// Record a baseline: load every golden root and fixture LIVE, archive every external
// response in har/<set>/archive.har, and write one snapshot per root.
// Only runs with PRIMAL_RECORD=1; writes into PRIMAL_BASELINE_DIR (default test/e2e/baseline).
import fs from "node:fs";
import path from "node:path";
import { test } from "@playwright/test";
import { capture, externalUrls, routeFixtures } from "./support/capture.js";
import {
  fixtureRoots,
  goldenRoots,
  harPath,
  mergeHar,
  rootTitle,
  sanitizeHar,
  writeSnapshot,
} from "./support/roots.js";

const PER_ROOT_MS = 120_000;

// PRIMAL_ROOTS=hand/extract/ExampleA,TISMIR/oa/ExFled re-records only those roots and merges
// them into their sets' existing archives
const only = process.env.PRIMAL_ROOTS?.split(",").map((s) => s.trim()).filter(Boolean);
const wanted = (root) => !only || only.includes(rootTitle(root).replace(/ @quick$/, ""));

const sets = {
  hand: goldenRoots.filter((r) => r.set === "hand" && wanted(r)),
  TISMIR: goldenRoots.filter((r) => r.set === "TISMIR" && wanted(r)),
  fixtures: fixtureRoots.filter(wanted),
};

test.skip(!process.env.PRIMAL_RECORD, "recording runs only with PRIMAL_RECORD=1");

for (const [set, roots] of Object.entries(sets)) {
  if (!roots.length) continue;
  test(`record ${set} (${roots.length} roots)`, async ({ browser, baseURL }) => {
    test.setTimeout(roots.length * PER_ROOT_MS);
    const har = only
      ? path.join(path.dirname(path.dirname(harPath(set))), `${set}-partial`, "archive.har")
      : harPath(set);
    fs.rmSync(path.dirname(har), { recursive: true, force: true });
    fs.mkdirSync(path.dirname(har), { recursive: true });

    // one context per set: one HAR; routing also disables the HTTP cache, so every page
    // makes the requests a first visit makes
    const context = await browser.newContext({ baseURL });
    await context.routeFromHAR(har, {
      url: externalUrls,
      update: true,
      updateContent: "attach",
      updateMode: "minimal",
    });
    if (set === "fixtures") await routeFixtures(context, baseURL);

    for (const root of roots) {
      const page = await context.newPage();
      const snapshot = await capture(page, root, baseURL);
      writeSnapshot(root, { root, recordedAt: new Date().toISOString(), ...snapshot });
      console.log(
        `${rootTitle(root)}: ${snapshot.info.requestCount} requests, ${snapshot.info.timings.totalMs} ms`,
      );
      await page.close();
    }
    await context.close(); // writes the HAR
    sanitizeHar(har);
    if (only) {
      mergeHar(harPath(set), har);
      fs.rmSync(path.dirname(har), { recursive: true, force: true });
    }
  });
}
