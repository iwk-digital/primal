// Flag snapshots in a freshly recorded baseline that may reflect the network rather than
// Primal: an unfinished traversal, a banner, aborted fetches, Primal's loading timeout firing.
// Usage: node test/e2e/support/check-recording.js [baselineDir]
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve(process.argv[2] || "test/e2e/baseline", "snapshots");

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
  // "Current resource" line, so such a recording is not what a reader normally sees. The timer
  // starts only once Primal's scripts have loaded, so the time from navigation is no measure of
  // it (19.5 s has stayed inside it, 15.6 s has not): look for the empty line instead.
  if (info.timings.traversalMs === null) flags.push("traversal time unknown");
  if (!compare.metadata.currentUri) {
    flags.push(`"Current resource" line empty: Primal's 15 s loading timeout fired (traversal ${info.timings.traversalMs} ms): RE-RECORD`);
  }
  if (!info.timings.networkIdle) flags.push("network never idle");
  if (flags.length) {
    flagged++;
    console.log(path.relative(dir, file));
    for (const f of flags) console.log(`   ${f}`);
  }
}
console.log(`${flagged} of ${total} snapshots flagged`);
