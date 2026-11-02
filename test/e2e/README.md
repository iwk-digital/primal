# Primal browser tests

Development only: Primal has no build step, and nothing here is loaded by the app.

The first job of these tests is a **characterisation baseline**: annotations published with the
LLC and TISMIR articles must keep rendering exactly as they do now. Every change to Primal is
checked against what Primal rendered and requested for each of them.

## What is compared

`golden-roots.json` lists the 144 golden roots: every `Example*` file of the
[data](https://github.com/Signature-Sound-Vienna/data) repository's `hand` branch (LLC,
doi:10.1093/llc/fqaf093) and every `Ex*` file of its `TISMIR` branch (TISMIR,
doi:10.5334/tismir.315), in `annot/oa` and all of `annot/mao`. Readers reach them through w3id
(`https://w3id.org/ssv/<branch>/annot/...`), which redirects to Primal with
`?obj=https://raw.githubusercontent.com/Signature-Sound-Vienna/data/<branch>/annot/....jsonld`.
The 7 v1 fixtures in `test/` are checked the same way.

For each root, `support/capture.js` loads Primal, waits until traversal, network and DOM have
settled, and writes a snapshot:

- `compare` (what the tests compare): each section's state and messages, error banners, text
  bodies, scores (highlighted note ids, page rendered, mei-friend links), audio players (labels,
  regions), metadata, the Mermaid graph source, the JSON-LD panel, the Verovio and Mermaid
  versions, every request made (method and URL, counted), and console errors (first line).
  Orders that depend on response timing are sorted.
- `info` (diagnosis only): timings, the orders as rendered, the raw Mermaid source.

## Running

Chromium only. The tests serve this checkout on port 8137 (`PRIMAL_PORT`) with
`support/serve.py`, the same handler as `python -m http.server`.

    npm test                # quick: the 21 annotation-level roots + fixtures, replayed offline
    npm run test:golden     # all 144 golden roots + fixtures, replayed offline
    npm run test:live       # sanity check: load the golden roots LIVE and compare
    npm run record          # re-record HARs and snapshots from live (see below)

Replay answers every external request from the HAR archives in `baseline/har/<set>/` and aborts
anything the archive does not hold, so it needs no network and is not affected by changes to the
data branches, Verovio "latest" or the CDNs. A failing live check means that the world moved,
not necessarily Primal.

The HAR archives (~100 MB, rewritten in full by every recording) are gitignored and local for
now; only the snapshots in `baseline/snapshots/` are committed. Without the archives, replay
cannot run: record them first (below), or use the live check.

## Recording a baseline

    PRIMAL_RECORD=1 PRIMAL_BASELINE_DIR=<dir> npx playwright test --project=record
    node test/e2e/support/check-recording.js <dir>

`check-recording.js` flags snapshots that may record the network rather than Primal (unfinished
traversal, timeout banner, aborted fetches, loads over Primal's 15 s timeout). Re-record on a
good connection before trusting a flagged root. To re-record only some roots, name them:

    PRIMAL_RECORD=1 PRIMAL_ROOTS=hand/extract/ExampleA,TISMIR/extract/ExFled npx playwright test --project=record

Their responses replace the same requests' entries in their sets' archives; the rest is kept.

**Known failure (2026-11-02): `TISMIR/extract/ExFled`.** Its 238 requests traverse in 0.5 s
offline but took 19-24 s live on a mobile connection (~0.55 s per round trip), past Primal's 15 s
loading timeout. When that happens Primal never restores the "Current resource" line, so the
recorded snapshot lacks it and the fast replay fails on `metadata.currentUri`. Re-record this root
alone on a low-latency connection.

Recording keeps two quirks of live loads out of the archive, so that replay behaves as the browser
did: transfer headers (`content-encoding`, `content-length`) describing the compressed bytes are
dropped, and requests the browser failed (CORS) are left out so that replay aborts them too. The
browser's own CORS console line appears only on live loads and is kept in `info`, not compared.
Redirect chains are logged by their first request only, because replay answers a chain in one step.
