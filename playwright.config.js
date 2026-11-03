// Browser tests for Primal (development only; Primal itself has no build step).
//
// Projects:
//   record       – load every golden root and fixture LIVE, write the HAR archives and the
//                  snapshots (PRIMAL_RECORD=1; see test/e2e/README.md)
//   golden       – replay all golden roots from the HARs and compare with the snapshots
//   golden-quick – the same for the annotation-level roots only (@quick)
//   fixtures     – the v1 fixtures in test/, replayed and compared the same way
//   v2           – the MAO v2 fixtures in test/v2/, served by a fake pod (support/pod.js)
//   live         – opt-in sanity check: load the golden roots live and compare (PRIMAL_LIVE=1)
import { defineConfig } from "@playwright/test";

const PORT = Number(process.env.PRIMAL_PORT || 8137);

export default defineConfig({
  testDir: "test/e2e",
  outputDir: "test-results",
  timeout: 120_000,
  workers: Number(process.env.PRIMAL_WORKERS || 4),
  retries: 0,
  reporter: [["list"]],
  use: {
    browserName: "chromium",
    headless: true,
    baseURL: `http://127.0.0.1:${PORT}`,
  },
  webServer: {
    command: `python3 test/e2e/support/serve.py ${PORT} .`,
    url: `http://127.0.0.1:${PORT}/index.html`,
    reuseExistingServer: true,
    stdout: "ignore",
    stderr: "ignore",
  },
  projects: [
    { name: "record", testMatch: "record.spec.js" },
    { name: "golden", testMatch: "golden.spec.js" },
    { name: "golden-quick", testMatch: "golden.spec.js", grep: /@quick/ },
    { name: "fixtures", testMatch: "fixtures.spec.js" },
    { name: "v2", testMatch: "v2.spec.js" },
    { name: "live", testMatch: "live.spec.js" },
  ],
});
