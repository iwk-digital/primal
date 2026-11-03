// The v1 fixtures in test/, served from this checkout in place of http://localhost:8000.
// Their external references (production audio, w3id signals) are replayed from the HAR.
import fs from "node:fs";
import { expect, test } from "@playwright/test";
import { capture } from "./support/capture.js";
import { replayPage } from "./support/replay.js";
import { fixtureRoots, readSnapshot, rootTitle } from "./support/roots.js";

test.describe.configure({ mode: "parallel" });

// Primal's 15 s loading timeout clears every section; a traversal finishing after it must
// redraw them all, the "Current resource" line included. Time is faked: the timeout fires
// while the root's response is held back, which is then released.
test("fixtures/loading timeout, then traversal completes", async ({ browser, baseURL }) => {
  const root = fixtureRoots.find((r) => r.name === "example-oa");
  const { context, page } = await replayPage(browser, baseURL, "fixtures");
  let release;
  const held = new Promise((resolve) => (release = resolve));
  await context.route(root.obj, async (route) => {
    await held;
    await route.fallback();
  });
  await page.clock.install();
  const rootRequested = page.waitForRequest(root.obj);
  await page.goto(`/?obj=${root.obj}`);
  await rootRequested;
  await page.clock.fastForward(16_000);
  await expect(page.locator(".error-banner")).toContainText("Loading is taking longer");
  await expect(page.locator("#meta-current-uri")).toHaveText("");
  release();
  await expect(page.locator(".error-banner")).toHaveCount(0);
  await expect(page.locator("#text-content .textual-body")).not.toHaveCount(0);
  await expect(page.locator("#meta-current-uri")).toHaveText(`Current resource: <${root.obj}>`);
  await context.close();
});

for (const root of fixtureRoots) {
  test(rootTitle(root), async ({ browser, baseURL }, testInfo) => {
    const { context, page } = await replayPage(browser, baseURL, "fixtures");
    const expected = readSnapshot(root);
    const actual = await capture(page, root, baseURL);
    await context.close();
    fs.writeFileSync(testInfo.outputPath("actual.json"), JSON.stringify(actual, null, 2));
    expect(actual.compare).toEqual(expected.compare);
  });
}
