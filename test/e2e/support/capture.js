// Load one root in Primal and capture what it renders and requests, as a snapshot.
//
// A snapshot has two halves:
//   compare – what a reader sees and what Primal fetches, normalised so that orderings that
//             depend on response timing (concurrent traversal, async MEI rendering, registry
//             insertion order) are sorted. This is what the tests compare.
//   info    – the raw orders, the Mermaid sources as passed, timings: kept for diagnosis only.
import { FIXTURE_ORIGIN } from "./roots.js";

// Requests to anything but the Primal app server go through the HAR archive
export const externalUrls = /^https?:\/\/(?!127\.0\.0\.1[:/]|localhost[:/])/;

const TRAVERSAL_TIMEOUT_MS = 60_000;
const NETWORK_IDLE_MS = 1_500;
const NETWORK_IDLE_TIMEOUT_MS = 60_000;
const STABLE_POLL_MS = 750;
const STABLE_MAX_POLLS = 20;

// Runs in the page before any of Primal's scripts
function initScript() {
  window.__primal = { traversalsComplete: false, mermaidSources: [] };
  document.addEventListener("traversalsComplete", () => {
    window.__primal.traversalsComplete = true;
  });
  // registered before main.js's own DOMContentLoaded handler, so it runs first;
  // mermaid (a classic script in <head>) is defined by then
  document.addEventListener("DOMContentLoaded", () => {
    const m = window.mermaid;
    if (m && typeof m.render === "function") {
      const render = m.render.bind(m);
      m.render = (id, src, ...rest) => {
        window.__primal.mermaidSources.push(String(src));
        return render(id, src, ...rest);
      };
    }
  });
}

// The v1 fixtures point at http://localhost:8000; answer them from the app server, so they
// are served exactly as `python -m http.server` serves them (status, Content-Type, body).
// Node's own fetch, not route.fetch: HEAD requests must not wait for a body.
export async function routeFixtures(target, baseURL) {
  await target.route(`${FIXTURE_ORIGIN}/**`, async (route) => {
    const request = route.request();
    const url = request.url().replace(FIXTURE_ORIGIN, baseURL);
    const response = await fetch(url, { method: request.method() });
    const headers = {};
    for (const name of ["content-type", "last-modified"]) {
      const value = response.headers.get(name);
      if (value) headers[name] = value;
    }
    const body = request.method() === "HEAD" ? "" : Buffer.from(await response.arrayBuffer());
    await route.fulfill({ status: response.status, headers, body });
  });
}

function instrument(page, baseURL) {
  const tracker = {
    requests: [],
    consoleErrors: [],
    pageErrors: [],
    corsBlocked: [],
    mermaidVersion: null,
    inflight: 0,
    lastChange: Date.now(),
  };
  const norm = (s) => s.split(baseURL).join("app:");
  const touch = () => (tracker.lastChange = Date.now());
  page.on("request", (req) => {
    if (/^(data|blob):/.test(req.url())) return;
    // HAR replay answers a redirect chain in one step, so only the first hop is logged
    if (!req.redirectedFrom()) tracker.requests.push(`${req.method()} ${norm(req.url())}`);
    tracker.inflight++;
    touch();
  });
  page.on("response", async (res) => {
    if (res.status() === 200 && /\/mermaid@[^/]+\/dist\/mermaid\.min\.js$/.test(res.url())) {
      const body = await res.text().catch(() => "");
      const m = body.match(/"(\d+\.\d+\.\d+)",\w+=Object\.freeze/);
      tracker.mermaidVersion = m ? m[1] : "unknown";
    }
  });
  const done = (req) => {
    if (/^(data|blob):/.test(req.url())) return;
    tracker.inflight--;
    touch();
  };
  page.on("requestfinished", done);
  page.on("requestfailed", done);
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    // first line only: the stack frames below it depend on async timing
    // the browser's own CORS report appears only on live loads: replay aborts such a
    // request instead, and Primal sees the same failed fetch either way
    if (msg.text().startsWith("Access to fetch at ")) tracker.corsBlocked.push(norm(msg.text()));
    else tracker.consoleErrors.push(norm(msg.text().split("\n")[0]));
  });
  page.on("pageerror", (err) => tracker.pageErrors.push(norm(String(err.message))));
  return tracker;
}

async function waitForNetworkIdle(tracker) {
  const start = Date.now();
  while (Date.now() - start < NETWORK_IDLE_TIMEOUT_MS) {
    if (tracker.inflight <= 0 && Date.now() - tracker.lastChange >= NETWORK_IDLE_MS) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
}

// Everything visible, read from the DOM (runs in the page)
function readPage() {
  const text = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : null);
  const links = (el) =>
    el ? [...el.querySelectorAll("a")].map((a) => ({ text: text(a), href: a.getAttribute("href") })) : [];

  const sections = {};
  for (const id of ["h-text-content", "h-music-scores", "h-audio-examples", "h-metadata", "h-graph", "h-json-display"]) {
    const s = document.getElementById(id);
    sections[id] = {
      loaded: s.classList.contains("content-loaded"),
      noContent: [...s.querySelectorAll(".no-content-message")].map(text),
    };
  }

  const textBodies = [...document.querySelectorAll("#text-content .textual-body")].map((el) =>
    [...el.querySelectorAll("span")].map((s) => s.textContent),
  );

  const scores = [...document.querySelectorAll("#music-scores .mei")].map((div) => {
    const svg = div.querySelector("svg");
    return {
      id: div.id,
      highlighted: [...div.querySelectorAll(".highlight")].map((e) => e.getAttribute("data-id")).sort(),
      svg: svg ? { viewBox: svg.getAttribute("viewBox"), elementsWithDataId: div.querySelectorAll("[data-id]").length } : null,
    };
  });
  const meiFriendLinks = [...document.querySelectorAll(".meifriendLink a")].map((a) => a.getAttribute("href"));

  const audio = [...document.querySelectorAll("#audio-examples .audio-container")].map((c) => {
    const host = [...c.querySelectorAll(".audio *")].find((e) => e.shadowRoot);
    return {
      id: c.id,
      hidden: c.style.display === "none",
      label: text(c.querySelector(".audio-label")),
      waveform: Boolean(host),
      regions: host
        ? [...host.shadowRoot.querySelectorAll('[part~="region"]')].map((r) => ({ left: r.style.left, width: r.style.width }))
        : [],
    };
  });

  const selections = document.getElementById("meta-audio-selections");
  const metadata = {
    currentUri: text(document.getElementById("meta-current-uri")),
    createdBy: text(document.getElementById("meta-created-by")),
    createdByLinks: links(document.getElementById("meta-created-by")),
    audioSelectionsHeading: selections ? text(selections.querySelector("h3")) : null,
    audioSelections: selections
      ? [...selections.querySelectorAll("li")].map((li) => ({ text: text(li), links: links(li) }))
      : [],
  };

  const graphSvg = document.querySelector("#graph svg");

  return {
    splash: document.body.classList.contains("splash"),
    traversalsComplete: window.__primal.traversalsComplete,
    sections,
    banners: [...document.querySelectorAll(".error-banner")].map(text),
    textBodies,
    scores,
    meiFriendLinks,
    audio,
    metadata,
    graph: {
      svg: Boolean(graphSvg),
      nodes: graphSvg ? graphSvg.querySelectorAll(".node").length : 0,
      edges: graphSvg ? graphSvg.querySelectorAll(".flowchart-link, .edgePath").length : 0,
    },
    mermaidSources: window.__primal.mermaidSources,
    json: document.getElementById("json-display")?.textContent ?? null,
  };
}

// Version of the Verovio that did the rendering (loaded as "latest"); Mermaid's ("mermaid@10")
// is read from its bundle as it arrives
function readVerovioVersion() {
  try {
    return new verovio.toolkit().getVersion();
  } catch (e) {
    return null;
  }
}

const byJson = (a, b) => (JSON.stringify(a) < JSON.stringify(b) ? -1 : JSON.stringify(a) > JSON.stringify(b) ? 1 : 0);
const sorted = (xs, cmp = byJson) => [...xs].sort(cmp);

// Mermaid statements, order-free: the click lines follow registry insertion order,
// which depends on response timing
function mermaidStatements(src) {
  return sorted(
    src
      .split(/[;\n]/)
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

function countOf(xs) {
  const counts = {};
  for (const x of xs) counts[x] = (counts[x] || 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

function normalise(page, versions, tracker, timings) {
  return {
    compare: {
      splash: page.splash,
      traversalsComplete: page.traversalsComplete,
      sections: page.sections,
      banners: sorted(page.banners),
      textBodies: sorted(page.textBodies),
      scores: sorted(page.scores),
      meiFriendLinks: sorted(page.meiFriendLinks),
      audio: sorted(page.audio),
      metadata: { ...page.metadata, audioSelections: sorted(page.metadata.audioSelections) },
      graph: page.graph,
      mermaid: page.mermaidSources.map(mermaidStatements),
      json: page.json,
      versions,
      requests: countOf(tracker.requests),
      consoleErrors: countOf(tracker.consoleErrors),
      pageErrors: countOf(tracker.pageErrors),
    },
    info: {
      timings,
      order: {
        textBodies: page.textBodies.map((b) => (b[0] || "").slice(0, 40)),
        scores: page.scores.map((s) => s.id),
        audio: page.audio.map((a) => a.id),
        audioSelections: page.metadata.audioSelections.map((s) => s.text.slice(0, 60)),
      },
      mermaidSources: page.mermaidSources,
      requestCount: tracker.requests.length,
      corsBlocked: tracker.corsBlocked,
    },
  };
}

// Load `root` in `page` and return its snapshot
export async function capture(page, root, baseURL) {
  await page.addInitScript(initScript);
  const tracker = instrument(page, baseURL);
  const t0 = Date.now();
  await page.goto(`/?obj=${root.obj}`);

  const traversal = await page
    .waitForFunction(() => window.__primal && window.__primal.traversalsComplete, null, {
      timeout: TRAVERSAL_TIMEOUT_MS,
    })
    .then(() => true)
    .catch(() => false);
  const tTraversal = Date.now();
  const idle = await waitForNetworkIdle(tracker);
  const tIdle = Date.now();

  // then wait for the DOM to stop changing (waveform regions, Mermaid, MEI rendering)
  let previous = JSON.stringify(await page.evaluate(readPage));
  let polls = 0;
  for (; polls < STABLE_MAX_POLLS; polls++) {
    await page.waitForTimeout(STABLE_POLL_MS);
    const current = JSON.stringify(await page.evaluate(readPage));
    if (current === previous) break;
    previous = current;
  }
  const timings = {
    traversalMs: traversal ? tTraversal - t0 : null,
    networkIdle: idle,
    idleMs: tIdle - t0,
    stablePolls: polls,
    totalMs: Date.now() - t0,
  };
  const versions = {
    verovio: await page.evaluate(readVerovioVersion),
    mermaid: tracker.mermaidVersion,
  };
  return normalise(JSON.parse(previous), versions, tracker, timings);
}
