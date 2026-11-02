// The v1 fixtures in test/, served from this checkout in place of http://localhost:8000.
// Their external references (production audio, w3id signals) are replayed from the HAR.
import fs from "node:fs";
import { expect, test } from "@playwright/test";
import { capture } from "./support/capture.js";
import { replayPage } from "./support/replay.js";
import { fixtureRoots, readSnapshot, rootTitle } from "./support/roots.js";

test.describe.configure({ mode: "parallel" });

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
