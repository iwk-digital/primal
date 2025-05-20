export let version = "0.3.2";
export const versionDate = "15 May 2025";

import NS from "./namespaceManager.js";
import Traverser from "./traverser.js";
import Graph from "./graph.js";
import { fetchTextData } from "./httpUtil.js";
import { vrvOptions, relevantVis } from "./defaults.js";

import WaveSurfer from "../deps/wavesurfer.js";
import RegionsPlugin from "../deps/regions.js";

import { env, environments } from "./env.js";
if (env === environments.staging) {
  version = "staging-" + version;
}

let objUrl = null;

let wavesurfers = {}; // store wavesurfer instances for each audio target

async function traversalsComplete() {
  console.log("Handling traversals completed, registry: ", Graph.registry);
  if (objUrl.href in Graph.registry) {
    // if we have information about the creator, show it
    let creator = Graph.registry[objUrl.href].expanded[NS.dc("creator")];
    if (creator) {
      // do we have a URI? (TODO: currently assumes one creator and max one label)
      let creatorUri = "@id" in creator[0] ? creator[0]["@id"] : null;
      let creatorLabel =
        NS.rdfs("label") in creator[0] &&
        "@value" in creator[0][NS.rdfs("label")][0]
          ? creator[0][NS.rdfs("label")][0]["@value"]
          : null;
      let creatorDiv = document.querySelector("#meta-created-by");
      // if we have a URI and label, show it as a link
      if (creatorUri && creatorLabel) {
        creatorDiv.innerHTML = `Created by: <a href="${creatorUri}" target="_blank">${creatorLabel}</a>`;
      } else if (creatorUri) {
        // if we only have a URI, show it as a link
        creatorDiv.innerHTML = `Created by: <a href="${creatorUri}" target="_blank">&lt;${creatorUri}&gt;</a>`;
      } else if (creatorLabel) {
        // if we only have a label, show it as text
        creatorDiv.innerHTML = `&lt;${creatorLabel}&gt;`;
      }
    }
    // render the graph using mermaid
    let visgraph =
      "graph TD; " + Graph.visualise(Graph.registry[objUrl].expanded, true);
    // remove protocols from the URLs to not upset mermaid
    visgraph = visgraph.replace(/https?:\/\//g, "");
    for (const key of Object.keys(Graph.registry)) {
      // only replace the first protocol (acting as label), not the second (acting as URL)
      visgraph +=
        "\n click " +
        key.replace(/https?:\/\//, "") +
        ' "http://localhost:8000/?obj=' +
        key +
        '" "Tooltip: Foo";';
    }
    // draw in subgraph containing subject and objects in current URI's resource
    // current subject.
    // Only draw one representation per resource, even if many resource fragments are included

    const fragmentedResources = {
      ...Graph.getMEITargets(),
      ...Graph.getAudioTargets(),
    }; // TODO include other types
    const fragmentedResourcesToExclude = new Set();
    Object.keys(fragmentedResources).forEach((k) => {
      fragmentedResourcesToExclude.add(k);
    });
    visgraph +=
      "\n subgraph Current resource\n" +
      Graph.registry[objUrl].compacted["@id"].replace(/https?:\/\//, "");
    // attached objects:
    relevantVis.predicates.forEach((p) => {
      if (Graph.registry[objUrl].expanded.hasOwnProperty(p)) {
        Graph.registry[objUrl].expanded[p].forEach((o) => {
          // does o["@id"] start with any of the fragmentedResourcesToExclude?
          const matches = Array.from(fragmentedResourcesToExclude).filter(
            (r) => "@id" in o && o["@id"].startsWith(r)
          );
          // skip fragmented resources
          if (!matches.length && o["@id"]) {
            console.log("Adding object: ", o);
            visgraph += "\n" + o["@id"].replace(/https?:\/\//, "") + "\n";
          }
        });
      }
    });
    // add any blank nodes associated with the subject
    if (Graph.blanks[objUrl.href]) {
      Graph.blanks[objUrl.href].forEach((b) => {
        visgraph += "\n" + b + "\n";
      });
    }
    visgraph += "\n end\n";
    let jsonDisplay = document.querySelector("#json-display");
    jsonDisplay.textContent = JSON.stringify(
      Graph.registry[objUrl].compacted,
      null,
      2
    );
    Prism.highlightElement(jsonDisplay);

    console.log("Visualising graph: ", visgraph);
    mermaid.render("fograph", visgraph).then((svg) => {
      document.getElementById("graph").innerHTML = svg.svg;
    });
  } else {
    console.error(
      "Object not found in registry while trying to visualise: ",
      objUrl.href,
      Object.keys(Graph.registry),
      Graph.registry
    );
  }
  // render the MEI using Verovio:
  // for each MEI target in the graph,
  // create a div inside #music-scores
  // and use Verovio to render the respective MEI to SVG inside the div
  let meiTargets = Graph.getMEITargets();
  console.log("Main got MEI targets: ", meiTargets);
  for (const target of Object.keys(meiTargets)) {
    // use fetch to retrieve the target
    fetchTextData(target).then((data) =>
      renderMEI(target, meiTargets[target], data)
    );
  }
  // render the textual bodies
  let textBodies = Graph.getTextualBodies();
  if (textBodies.length > 0) {
    renderTextualBodies(textBodies);
  } else {
    console.log("No textual bodies found");
  }

  // render the audio targets
  let audioTargets = Graph.getAudioTargets();
  await renderAudioTargets(audioTargets);
}

async function renderAudioTargets(audioTargets) {
  // for each audio target, render a wavesurfer.js waveform inside a div with the ID of the target
  // for each fragment in the audio target, create a wavesurfer region for the corresponding time range
  // first, create all the container divs:
  for (const target of Object.keys(audioTargets)) {
    let audioDiv = document.createElement("div");
    audioDiv.className = "audio";
    audioDiv.id = target;
    document.getElementById("audio-examples").appendChild(audioDiv);
    console.log("Added audio div: ", audioDiv);
  }

  for (const target of Object.keys(audioTargets)) {
    // Create a WaveSurfer instance
    wavesurfers[target] = {}; // reset the wavesurfer instance
    wavesurfers[target].regions = RegionsPlugin.create(); // wavesurfer regions plugin
    wavesurfers[target].ws = WaveSurfer.create({
      container: "#" + CSS.escape(target),
      waveColor: "#b4becf",
      progressColor: "#163c7a",
      url: target,
      plugins: [wavesurfers[target].regions],
      mediaControls: true,
      autoPlay: false,
    });

    // Create some regions at specific time ranges
    wavesurfers[target].ws.on("decode", (e) => {
      console.log("In decode, e: ", e);
      // add regions to the wavesurfer instance using the regions plugin
      audioTargets[target].forEach((fragment) => {
        // strip "t=" from the fragment ID
        fragment = fragment.replace(/t=/, "");
        let frags = fragment.split(",");
        if (!frags.length == 2) {
          console.error("Invalid fragment: ", fragment);
          return;
        }
        let start = parseFloat(frags[0]);
        let end = parseFloat(frags[1]);
        console.log("Adding region: ", start, end);
        wavesurfers[target].regions.addRegion({
          start: start,
          end: end,
          content: "",
          color: "rgba(255, 255, 150, 0.5)",
          drag: false,
          resize: false,
        });
      });
    });

    wavesurfers[target].regions.on("region-updated", (region) => {
      console.log("Updated region", region);
    });

    {
      let activeRegion = null;
      wavesurfers[target].regions.on("region-in", (region) => {
        console.log("region-in", region);
        activeRegion = region;
      });
      wavesurfers[target].regions.on("region-out", (region) => {
        console.log("region-out", region);
        activeRegion = null;
      });
      wavesurfers[target].regions.on("region-clicked", (region, e) => {
        e.stopPropagation(); // prevent triggering a click on the waveform
        activeRegion = region;
        region.play(true);
      });
      // Reset the active region when the user clicks anywhere in the waveform
      wavesurfers[target].ws.on("interaction", () => {
        activeRegion = null;
      });
    }

    // then, create the wavesurfer instances and load the audio files
    /*
  for (const target of Object.keys(audioTargets)) {
    // create a wavesurfer instance

    let wavesurfer = await WaveSurfer.create({
      container: "#" + CSS.escape(target),
      waveColor: "#ddd",
      progressColor: "#3b82f6",
      cursorColor: "#3b82f6",
      height: 128,
      barWidth: 2,
      barHeight: 1,
      plugin: [wsRegions],
      url: target,
    });

    wavesurfer.on("click", () => {
      wavesurfer.playPause();
    });

    wavesurfer.on("ready", () => {
      wsRegions.regions.addRegion({
        start: 3,
        end: 45,
        color: "rgba(255, 0, 0, 1)",
        id: "test",
        content: "Test",
      });
      console.log("Wavesurfer ready: ", wavesurfer, wsRegions);
    });

    /*

    // add event listener to highlight the region when clicked
    wavesurfer.on("region-click", (region, e) => {
      // remove highlight from all regions
      wsRegions.clearRegions(wavesurfer);
      // add highlight to the clicked region
      wsRegions.updateRegion(wavesurfer, region.id, {
        color: "rgba(0, 255, 0, 0.5)",
      });
    });

    // add event listener to highlight the region when the audio is played
    wavesurfer.on("play", () => {
      // remove highlight from all regions
      wsRegions.clearRegions(wavesurfer);
      // add highlight to the current region
      let currentRegion = wsRegions.getCurrentRegion(wavesurfer);
      if (currentRegion) {
        wsRegions.updateRegion(wavesurfer, currentRegion.id, {
          color: "rgba(0, 255, 0, 0.5)",
        });
      }
    });
  }
  */
  }
}

function renderTextualBodies(textBodies) {
  const textDiv = document.getElementById("text-content");
  for (const b of Object.keys(textBodies)) {
    let text = textBodies[b][NS.rdf("value")]
      .map((x) => x["@value"])
      .join("<br/>");
    let textDivChild = document.createElement("div");
    textDivChild.className = "textual-body";
    textDivChild.innerHTML = text;
    textDiv.appendChild(textDivChild);
  }
}

function renderMEI(uri, fragmentSet, meiData) {
  let fragments = Array.from(fragmentSet);
  console.log("Rendering MEI: ", uri, fragments);
  // create a new div for the MEI
  let meiDiv = document.createElement("div");
  meiDiv.className = "mei";
  meiDiv.id = uri;
  document.getElementById("music-scores").appendChild(meiDiv);
  // use Verovio to render the MEI to SVG inside the div
  let vrvToolkit = new verovio.toolkit();
  vrvToolkit.setOptions(vrvOptions);
  vrvToolkit.loadData(meiData);
  let meifriendDiv = document.createElement("div");
  meifriendDiv.className = "meifriendLink";
  let link = "https://mei-friend.mdw.ac.at/?file=" + uri;
  link += "&select=" + fragments.join(",");
  meifriendDiv.innerHTML = `<a href="${link}" target="_blank">Open in mei-friend</a>`;
  meiDiv.innerHTML = "";
  meiDiv.appendChild(meifriendDiv);
  let fragment = fragments[0];
  let pageNum = vrvToolkit.getPageWithElement(fragment);
  let svg = vrvToolkit.renderToSVG(pageNum);
  meiDiv.innerHTML += svg;
  // add "highlight" class to each element with the fragment ID
  for (const f of fragments) {
    let el = meiDiv.querySelector(`[data-id="${f}"]`);
    if (el) {
      el.classList.add("highlight");
    }
    console.log("element: ", el);
  }
}

document.addEventListener("DOMContentLoaded", async function () {
  // fill in version and date
  let versionSpan = document.querySelector("#version");
  let dateSpan = document.querySelector("#date");
  if (versionSpan && dateSpan) {
    versionSpan.innerHTML = version;
    dateSpan.innerHTML = versionDate;
  }

  Graph.init(NS);
  Traverser.init();
  // add event listener to trigger when traversals are complete
  document.addEventListener("traversalsComplete", traversalsComplete); // check for presence of ?obj parameter in URL
  const urlParams = new URLSearchParams(window.location.search);
  const objParam = urlParams.get("obj");
  try {
    let currentUri = document.querySelector("#meta-current-uri");
    if (currentUri) {
      currentUri.innerHTML = `Current resource: <a href="${objParam}" target="_blank">&lt;${objParam}&gt;</a>`;
    }
    objUrl = new URL(objParam);
    // fetch and register the object
    Traverser.fetchAndRegister([objUrl]);
  } catch (e) {
    console.error("Could not traverse: ", objParam, e);
    return;
  }
});
