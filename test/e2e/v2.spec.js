// The MAO v2 fixtures in test/v2/ (generated from Listen Here's serialiser by
// support/make-v2-fixtures.js), served by a fake pod (support/pod.js). Primal's scripts and
// the CDN libraries are replayed from the fixtures' HAR.
// These snapshots are expectations for new behaviour, reviewed by hand: PRIMAL_UPDATE_V2=1
// writes them instead of comparing.
import fs from "node:fs";
import { expect, test } from "@playwright/test";
import { capture } from "./support/capture.js";
import { routePod, v2Roots } from "./support/pod.js";
import { replayPage } from "./support/replay.js";
import { readSnapshot, rootTitle, writeSnapshot } from "./support/roots.js";

test.describe.configure({ mode: "parallel" });

// Scope chips (lib/main.js) depend on Mermaid keeping their HTML and on its node ids:
// a Mermaid update that breaks either must fail here, not in front of a reader
test("v2/scope chips highlight their scope", async ({ browser, baseURL }) => {
  const root = v2Roots.find((r) => r.name === "full");
  const { context, page } = await replayPage(browser, baseURL, "fixtures");
  await routePod(context, root);
  await page.goto(`/?obj=${root.obj}`);
  const chips = page.locator("#graph .scope-chip");
  await expect(chips.first()).toBeVisible({ timeout: 30_000 });
  const scope = await chips.first().getAttribute("data-scope");
  expect(scope).toMatch(/mao\/extract\/full\/extract$/);
  await chips.first().hover();
  const lit = page.locator("#graph g.node.scope-hover");
  // the Extract plus every SpecificResource scoped to it
  await expect(lit).toHaveCount((await chips.count()) + 1);
  expect(await lit.evaluateAll((ns) => ns.filter((n) => !n.querySelector(".scope-chip")).map((n) => n.id))).toEqual([
    expect.stringContaining(scope),
  ]);
  await page.locator("h1").first().hover();
  await expect(lit).toHaveCount(0);
  await context.close();
});

for (const root of v2Roots) {
  test(rootTitle(root), async ({ browser, baseURL }, testInfo) => {
    const { context, page } = await replayPage(browser, baseURL, "fixtures");
    await routePod(context, root);
    const actual = await capture(page, root, baseURL);
    await context.close();
    fs.writeFileSync(testInfo.outputPath("actual.json"), JSON.stringify(actual, null, 2));
    if (process.env.PRIMAL_UPDATE_V2) {
      writeSnapshot(root, { root, recordedAt: new Date().toISOString(), ...actual });
      return;
    }
    expect(actual.compare).toEqual(readSnapshot(root).compare);
  });
}
