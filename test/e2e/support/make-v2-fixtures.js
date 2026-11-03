// Generate the MAO v2 fixtures in test/v2/ from Listen Here's own serialiser.
//
//   node test/e2e/support/make-v2-fixtures.js [<listen-here checkout>]
//
// Listen Here's mao-adapter.js turns an annotation into resource templates; this script then
// does what its solid-post.js does when posting them (mint a URI per resource in per-annotation
// folders, substitute the references, add @id, dct:creator/created/provenance, schema:about and
// schema:includedInDataCatalog) and writes each resource as one file under test/v2/pod/, as a
// Community Solid Server would hold it. The output is committed, so that the fixtures change
// only when this script is re-run; timestamps and slugs are fixed.
//
// Two things Listen Here does not (yet) write are added here, as ruled for Primal:
//   - ssv:peaks on each Selection, inline {peaks, duration} as its older solid.js path writes
//     (copyright-sensitive audio is conveyed without sharing it);
//   - an oa/top annotation without a body when there is no description (the "bodiless-top" case).
// The "item-spelling" case writes oa:item, the MAO v2 draft's spelling, where Listen Here
// writes oa:items.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { repoRoot } from "./roots.js";

const listenHere = path.resolve(
  process.argv[2] || process.env.LISTEN_HERE_DIR || "/private/var/git/signature-sound-vienna/listenTool",
);
const jsDir = path.join(listenHere, "app/static/js");
const { serialize } = await import(pathToFileURL(path.join(jsDir, "annotation/mao-adapter.js")));
const { nsp } = await import(pathToFileURL(path.join(jsDir, "linked-data.js")));

export const POD_ORIGIN = "https://listenhere.pod.test";
const APP = "at.ac.mdw.mei-friend";
const WEBID = `${POD_ORIGIN}/profile/card#me`;
const CREATED = "2026-11-02T12:00:00.000Z";
const PROVENANCE = "Generated using Listen Here (Primal test fixture, from mao-adapter.js)";
const outDir = path.join(repoRoot, "test/v2");

const containers = {
  "mao:Selection": "mao/selection",
  "mao:Extract": "mao/extract",
  "mao:MusicalMaterial": "mao/musicalMaterial",
  "oa:Annotation": "oa",
};

// Deterministic stand-in for a recording's precomputed peaks
function peaksFor(file, duration) {
  const seed = [...file].reduce((n, c) => n + c.charCodeAt(0), 0);
  const peaks = Array.from({ length: 240 }, (_, i) =>
    Number((0.5 * Math.abs(Math.sin((i + seed) / 7)) + 0.3 * Math.abs(Math.sin((i * seed) / 31))).toFixed(3)),
  );
  return JSON.stringify({ peaks, duration });
}

const slugOf = (localKey) => localKey.replace(/\.wav$/, "").replace(/[^A-Za-z0-9]+/g, "-");

function substitute(node, mapping) {
  if (Array.isArray(node)) return node.map((n) => substitute(n, mapping));
  if (node && typeof node === "object") {
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      out[k] = k === "@id" && typeof v === "string" && v.startsWith("_:") ? mapping[v.slice(2)] : substitute(v, mapping);
    }
    return out;
  }
  return node;
}

function renameKey(node, from, to) {
  if (Array.isArray(node)) return node.map((n) => renameKey(n, from, to));
  if (node && typeof node === "object") {
    return Object.fromEntries(Object.entries(node).map(([k, v]) => [k === from ? to : k, renameKey(v, from, to)]));
  }
  return node;
}

// Post one annotation state to the fake pod; returns localKey → URI
function post(caseName, annotation, { audioDuration = 30, bodilessTop = false, itemSpelling = false } = {}) {
  // normalised through the URL constructor, as Listen Here does: spaces are encoded, while
  // "(", "&" and "," stay as they are
  const audioUri = (file) => new URL(`${POD_ORIGIN}/audio/${file}`).href;
  const discovery = (uri) => `${POD_ORIGIN}/${APP}/discovery/${slugOf(uri.split("/").pop())}`;
  const state = bodilessTop ? { ...annotation, description: "(bodiless)" } : annotation;
  const { templates } = serialize(state, { resolveAudioUri: audioUri });

  const uris = {};
  for (const t of templates) {
    uris[t.localKey] = `${POD_ORIGIN}/${APP}/${containers[t.kind]}/${caseName}/${slugOf(t.localKey)}`;
  }
  const fileOf = (key) => key.split("/").pop();
  const allAudio = [...new Set(annotation.targets.map((t) => audioUri(t.file)))];

  for (const t of templates) {
    let body = substitute(t.body, uris);
    if (itemSpelling) body = renameKey(body, nsp.OA + "items", nsp.OA + "item");
    if (bodilessTop && t.localKey === "oa/top") delete body[nsp.OA + "hasBody"];
    if (t.kind === "mao:Selection") {
      const a = audioUri(fileOf(t.localKey));
      body[nsp.SCHEMA + "includedInDataCatalog"] = [{ "@id": discovery(a) }];
      body[nsp.SSV + "peaks"] = [{ "@value": peaksFor(fileOf(t.localKey), audioDuration) }];
    } else if (t.kind === "mao:Extract" || t.kind === "mao:MusicalMaterial") {
      body[nsp.SCHEMA + "about"] = allAudio.map((u) => ({ "@id": u }));
      body[nsp.SCHEMA + "includedInDataCatalog"] = allAudio.map((u) => ({ "@id": discovery(u) }));
    }
    body = {
      "@id": uris[t.localKey],
      ...body,
      [nsp.DCT + "creator"]: { "@id": WEBID },
      [nsp.DCT + "created"]: CREATED,
      [nsp.DCT + "provenance"]: PROVENANCE,
    };
    const file = path.join(outDir, "pod", new URL(uris[t.localKey]).pathname + ".jsonld");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(body, null, 2) + "\n");
  }
  return uris;
}

// a recording name like Listen Here's real ones ("VPO-1941 (& unbekannt).wav")
const GAMMA = "gamma (& friends), live.wav";
const regions = [
  { id: "r1", label: "" },
  { id: "r2", label: "" },
];
const recordings = (notes) =>
  ["alpha.wav", "beta.wav", GAMMA].map((file, i) => ({
    file,
    description: notes[file] || "",
    regionTimes: { r1: { start: 2 + i * 0.2, end: 6 + i * 0.2 }, r2: { start: 14 + i * 0.3, end: 21 + i * 0.3 } },
  }));
const grouping = {
  name: "By Section",
  groups: [
    { groupId: "g-strings", label: "Strings", color: "#3b82f6", files: ["alpha.wav", "beta.wav"] },
    { groupId: "g-brass", label: "Brass", color: "#f59e0b", files: [GAMMA] },
  ],
};
const full = {
  label: "Opening phrase",
  description: "The opening phrase, compared across sections.",
  regions,
  targets: recordings({ "alpha.wav": "Alpha takes the phrase slowly.", "beta.wav": "Beta rushes the second bar." }),
  groupNotes: { "g-strings": "The strings agree on the shape.", "g-brass": "The brass breathes before bar two." },
  comparisons: [{ id: "c1", leftGroupId: "g-strings", rightGroupId: "g-brass", text: "Strings phrase across bar two; brass divides it." }],
  pinnedGrouping: grouping,
  // a score-side Selection kept from mei-friend: the v1 fixture, served from this checkout
  preservedSelections: ["http://localhost:8000/test/example-mao-selection.jsonld"],
};

fs.rmSync(outDir, { recursive: true, force: true });
const roots = [];
const add = (name, uris, key, note, extra = {}) => roots.push({ set: "v2", folder: null, name, obj: uris[key], note, ...extra });

add(
  "description-only",
  post("description-only", {
    ...full,
    targets: recordings({}),
    groupNotes: {},
    comparisons: [],
    preservedSelections: [],
  }),
  "oa/top",
  "description only: oa/top targets the MusicalMaterial directly (v1-shaped path)",
);
add(
  "track-note",
  post("track-note", { ...full, description: "", groupNotes: {}, comparisons: [], preservedSelections: [] }),
  "oa/track/alpha.wav",
  "no description: as posted today, there is no oa/top; the root is one per-recording note",
);
const fullUris = post("full", full);
add("full", fullUris, "oa/top", "per-recording notes, two groups (Brass points at a Selection directly), a comparison, a description, a score-side Selection");
const pathOf = (key) => new URL(fullUris[key]).pathname;
add("throttled", fullUris, "oa/top", "as full, served by a pod that refuses two resources twice each (429 without CORS headers): retried", {
  throttle: { [pathOf("oa/track/alpha.wav")]: 2, [pathOf("oa/group/g-strings")]: 2 },
});
add("unavailable", fullUris, "oa/top", "as full, with beta's note refused every time (429 without CORS headers): a notice says so", {
  throttle: { [pathOf("oa/track/beta.wav")]: -1 },
});
add(
  "bodiless-top",
  post("bodiless-top", { ...full, description: "" }, { bodilessTop: true }),
  "oa/top",
  "the agreed URL contract: oa/top is always written, here without a body",
);
add("item-spelling", post("item-spelling", full, { itemSpelling: true }), "oa/top", "as full, with the MAO v2 draft's oa:item for oa:items");
const priv = post("private-part", full);
add("private-part", priv, "oa/top", "as full, with beta's note and the Brass group note private (401)", {
  private: [priv["oa/track/beta.wav"], priv["oa/group/g-brass"]].map((u) => new URL(u).pathname),
});

fs.writeFileSync(path.join(outDir, "roots.json"), JSON.stringify({ origin: POD_ORIGIN, roots }, null, 2) + "\n");
console.log(`wrote ${roots.length} v2 fixture roots to ${path.relative(repoRoot, outDir)}`);
