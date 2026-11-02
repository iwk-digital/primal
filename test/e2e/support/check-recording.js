// Flag snapshots in a freshly recorded baseline that may reflect the network rather than
// Primal: an unfinished traversal, a timeout banner, aborted fetches, slow loads.
// Usage: node test/e2e/support/check-recording.js [baselineDir]
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve(process.argv[2] || "test/e2e/baseline", "snapshots");
const PRIMAL_LOADING_TIMEOUT_MS = 15_000; // main.js shows its timeout banner after this

function* snapshots(d) {
  for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, entry.name);
    if (entry.isDirectory()) yield* snapshots(p);
    else if (entry.name.endsWith(".json")) yield p;
  }
}

let flagged = 0;
let total = 0;
for (const file of snapshots(dir)) {
  total++;
  const { compare, info } = JSON.parse(fs.readFileSync(file, "utf8"));
  const flags = [];
  if (!compare.traversalsComplete) flags.push("traversal did not complete");
  if (compare.banners.length) flags.push(`banners: ${compare.banners.map((b) => b.slice(0, 60)).join(" | ")}`);
  for (const [msg, n] of Object.entries(compare.consoleErrors)) {
    if (/AbortError|ERR_CONNECTION|ERR_NETWORK|ERR_TIMED_OUT|ERR_INTERNET|429|50\d /.test(msg)) {
      flags.push(`${n}× ${msg.slice(0, 100)}`);
    }
  }
  if (Object.keys(compare.pageErrors).length) flags.push(`page errors: ${Object.keys(compare.pageErrors).join(" | ")}`);
  // past the loading timeout, main.js clears every section; completion re-renders all but the
  // "Current resource" line, so such a recording is not what a reader normally sees
  if (info.timings.traversalMs === null || info.timings.traversalMs > PRIMAL_LOADING_TIMEOUT_MS) {
    flags.push(`traversal crossed Primal's 15 s loading timeout (${info.timings.traversalMs} ms): RE-RECORD`);
  }
  if (!info.timings.networkIdle) flags.push("network never idle");
  if (flags.length) {
    flagged++;
    console.log(path.relative(dir, file));
    for (const f of flags) console.log(`   ${f}`);
  }
}
console.log(`${flagged} of ${total} snapshots flagged`);
