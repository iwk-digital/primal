export let version = "0.6.0";
export const versionDate = "5 October 2025";

import NS from "./namespaceManager.js";
import Traverser from "./traverser.js";
import Graph from "./graph.js";
import GraphModal from "./graphModal.js";
import { fetchTextData } from "./httpUtil.js";
import { relevantVis } from "./defaults.js";
import {
  renderMEI,
  renderTextualBodies,
  renderAudioTargets,
} from "./render.js";

import { env, environments } from "./env.js";
if (env === environments.staging) {
  version = "staging-" + version;
}

let objUrl = null;
const graphModal = new GraphModal();

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
        ' "http://primal.mdw.ac.at/?obj=' +
        key +
        '" "Tooltip: ";';
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
      let g = document.querySelector("#graph");
      g.innerHTML =
        svg.svg +
        '<button class="graph-expand-icon" id="graph-expand-btn" title="Expand to full screen">⤢</button>';

      // Fit the graph to the container
      GraphModal.fitGraphToContainer(g);

      // Update the expand button reference and ensure modal is initialized
      graphModal.updateExpandButton();
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

document.addEventListener("DOMContentLoaded", async function () {
  // Initialize the graph modal
  graphModal.initialize();

  // fill in version and date
  let versionSpan = document.querySelector("#version");
  let dateSpan = document.querySelector("#date");
  if (versionSpan && dateSpan) {
    versionSpan.innerHTML = version;
    dateSpan.innerHTML = versionDate;
  }
  // check for presence of ?obj parameter in URL
  const urlParams = new URLSearchParams(window.location.search);
  const objParam = urlParams.get("obj");
  if (objParam) {
    Graph.init(NS);
    Traverser.init();
    // add event listener to trigger when traversals are complete
    document.addEventListener("traversalsComplete", traversalsComplete);
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
  } else {
    // display splash text, hide main content
    let body = document.querySelector("body");
    body.classList.add("splash");
  }
});
