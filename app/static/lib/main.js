export const version = "0.1.0";
export const versionDate = "6 April 2025";

import NS from "./namespaceManager.js";
import Traverser from "./traverser.js";
import Graph from "./graph.js";
import { fetchTextData } from "./http.js";
import { vrvOptions } from "./defaults.js";

let objUrl = null;

function traversalsComplete() {
  console.log("Handling traversals completed, registry: ", Graph.registry);
  // render the graph using mermaid
  if (objUrl.href in Graph.registry) {
    let visgraph =
      "graph TD; " + Graph.visualise(Graph.registry[objUrl].expanded, true);
    // remove protocols from the URLs to not upset mermaid
    visgraph = visgraph.replace(/https?:\/\//g, "");
    for (const key of Object.keys(Graph.registry)) {
      // only replace the first protocol (acting as label), not the second (acting as URL)
      visgraph +=
        "\n click " +
        key.replace(/https?:\/\//, "") +
        ' "http://localhost:5001/?obj=' +
        key +
        '" "Tooltip: Foo";';
    }
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
    let el = meiDiv.querySelector(`[id="${f}"]`);
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
    let currentUri = document.querySelector("#current-uri");
    if (currentUri) {
      currentUri.innerHTML = `<a href="${objParam}" target="_blank">&lt;${objParam}&gt;</a>`;
    }
    objUrl = new URL(objParam);
    // fetch and register the object
    Traverser.fetchAndRegister([objUrl]);
  } catch (e) {
    console.error("Could not traverse: ", objParam, e);
    return;
  }
});
