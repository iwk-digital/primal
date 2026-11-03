// The golden set: published v1 annotations (LLC and TISMIR articles) must render exactly as
// recorded. Each root is replayed from its set's HAR archive, offline.
import fs from "node:fs";
import { expect, test } from "@playwright/test";
import { capture } from "./support/capture.js";
import { replayPage } from "./support/replay.js";
import { goldenRoots, readSnapshot, rootTitle } from "./support/roots.js";

test.describe.configure({ mode: "parallel" });

for (const root of goldenRoots) {
  test(rootTitle(root), async ({ browser, baseURL }, testInfo) => {
    const { context, page } = await replayPage(browser, baseURL, root.set);
    const expected = readSnapshot(root);
    const actual = await capture(page, root, baseURL);
    await context.close();
    fs.writeFileSync(testInfo.outputPath("actual.json"), JSON.stringify(actual, null, 2));
    expect(actual.compare).toEqual(expected.compare);
  });
}
