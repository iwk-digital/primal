// Where the golden roots, fixtures, HAR archives and snapshots live.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, "../../..");
export const e2eDir = path.resolve(here, "..");

// A baseline is a directory holding har/<set>/archive.har and snapshots/<set>/.../<name>.json.
// The committed one is test/e2e/baseline; PRIMAL_BASELINE_DIR points elsewhere, e.g. at a
// throw-away reference under test/e2e/reference/ (gitignored).
export const baselineDir = path.resolve(
  repoRoot,
  process.env.PRIMAL_BASELINE_DIR || "test/e2e/baseline",
);

export const goldenRoots = JSON.parse(
  fs.readFileSync(path.join(e2eDir, "golden-roots.json"), "utf8"),
).roots;

// The v1 fixtures in test/ are written against http://localhost:8000 (see README.md)
export const FIXTURE_ORIGIN = "http://localhost:8000";
export const fixtureRoots = fs
  .readdirSync(path.join(repoRoot, "test"))
  .filter((f) => f.endsWith(".jsonld"))
  .sort()
  .map((f) => ({
    set: "fixtures",
    folder: null,
    name: f.replace(/\.jsonld$/, ""),
    obj: `${FIXTURE_ORIGIN}/test/${f}`,
  }));

// One directory per set: archive.har plus its response bodies, one file per distinct body
export function harPath(set) {
  return path.join(baselineDir, "har", set, "archive.har");
}

// The archive stores bodies decoded but keeps the transfer headers that described the
// encoded bytes; replaying those makes Chromium reset the connection. Drop them.
// Requests the browser failed (CORS, network) are stored with status -1, and replaying such
// an entry hangs; drop the entry, so that replay aborts the request as the browser did.
// A revalidated response (304, answered from the browser's cache) is stored as a 200 without
// Content-Type; when the same request was also stored in full, drop the revalidation.
const TRANSFER_HEADERS = new Set(["content-encoding", "content-length", "transfer-encoding"]);
const hasContentType = (entry) =>
  entry.response.headers.some((h) => h.name.toLowerCase() === "content-type");
export function sanitizeHar(file) {
  const har = JSON.parse(fs.readFileSync(file, "utf8"));
  har.log.entries = har.log.entries.filter((entry) => entry.response.status > 0);
  const complete = new Set(
    har.log.entries.filter(hasContentType).map((e) => `${e.request.method} ${e.request.url}`),
  );
  har.log.entries = har.log.entries.filter(
    (e) => hasContentType(e) || !complete.has(`${e.request.method} ${e.request.url}`),
  );
  for (const entry of har.log.entries) {
    entry.response.headers = entry.response.headers.filter(
      (h) => !TRANSFER_HEADERS.has(h.name.toLowerCase()),
    );
  }
  fs.writeFileSync(file, JSON.stringify(har, null, 1));
}

// Merge a partial recording (some roots re-recorded) into a set's archive: the partial's
// entries replace those for the same request, and its body files join the set's.
export function mergeHar(target, partial) {
  const key = (e) => `${e.request.method} ${e.request.url}`;
  const into = JSON.parse(fs.readFileSync(target, "utf8"));
  const from = JSON.parse(fs.readFileSync(partial, "utf8"));
  const replaced = new Set(from.log.entries.map(key));
  into.log.entries = into.log.entries.filter((e) => !replaced.has(key(e))).concat(from.log.entries);
  for (const entry of from.log.entries) {
    const body = entry.response.content._file;
    if (body) fs.copyFileSync(path.join(path.dirname(partial), body), path.join(path.dirname(target), body));
  }
  fs.writeFileSync(target, JSON.stringify(into, null, 1));
}

export function snapshotPath(root) {
  const parts = [baselineDir, "snapshots", root.set];
  if (root.folder) parts.push(root.folder);
  parts.push(`${root.name}.json`);
  return path.join(...parts);
}

export function rootTitle(root) {
  const where = root.folder ? `${root.set}/${root.folder}` : root.set;
  return `${where}/${root.name}${root.quick ? " @quick" : ""}`;
}

export function readSnapshot(root) {
  return JSON.parse(fs.readFileSync(snapshotPath(root), "utf8"));
}

export function writeSnapshot(root, snapshot) {
  const file = snapshotPath(root);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(snapshot, null, 2) + "\n");
}
