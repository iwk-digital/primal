export const version = "0.0.2";
export const versionDate = "20 February 2025";

import NS from "./namespaceManager.js";
import LDObj from "./LDObj.js";
import Traverser from "./traverser.js";
import Graph from "./graph.js";
import { requestAsJsonLd, fetchTextData } from "./http.js";
import { vrvOptions } from "./defaults.js";

let objUrl = null;

function traversalsComplete() {
  console.log("Handling traversals completed");
  // render the graph using mermaid
  if (objUrl in Graph.registry) {
    let visgraph =
      "graph TD; " + Graph.visualise(Graph.registry[objUrl].expanded);
    // remove protocols from the URLs to not upset mermaid
    visgraph = visgraph.replace(/https?:\/\//g, "");
    Object.keys(Graph.registry).forEach((key) => {
      // only replace the first protocol (acting as label), not the second (acting as URL)
      visgraph +=
        "\n click " +
        key.replace(/https?:\/\//, "") +
        ' "http://localhost:5001/?obj=' +
        key +
        '" "Tooltip: Foo";';
    });

    console.log("Visualising graph: ", visgraph);
    mermaid.render("fograph", visgraph).then((svg) => {
      document.getElementById("graph").innerHTML = svg.svg;
    });
  } else {
    console.error(
      "Object not found in registry while trying to visualise: ",
      objUrl
    );
  }
  // render the MEI using Verovio:
  // for each MEI target in the graph,
  // create a div inside #music-scores
  // and use Verovio to render the respective MEI to SVG inside the div
  let meiTargets = Graph.getMEITargets();
  console.log("Main got MEI targets: ", meiTargets);
  Object.keys(meiTargets).forEach((target) => {
    // use fetch to retrieve the target
    fetchTextData(target).then((data) =>
      renderMEI(target, meiTargets[target], data)
    );
  });

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
  textBodies.forEach((b) => {
    let text = b["@value"];
    let textDivChild = document.createElement("div");
    textDivChild.className = "textual-body";
    textDivChild.innerHTML = text;
    textDiv.appendChild(textDivChild);
  });
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
  fragments.forEach((f) => {
    let el = meiDiv.querySelector(`[id="${f}"]`);
    if (el) {
      el.classList.add("highlight");
    }
    console.log("element: ", el);
  });
}

document.addEventListener("DOMContentLoaded", async function () {
  Graph.init(NS);
  Traverser.init();
  // add event listener to trigger when traversals are complete
  document.addEventListener("traversalsComplete", traversalsComplete); // check for presence of ?obj parameter in URL
  const urlParams = new URLSearchParams(window.location.search);
  const objParam = urlParams.get("obj");
  try {
    objUrl = new URL(objParam);
    // fetch and register the object
    Traverser.fetchAndRegister([objUrl]);
  } catch (e) {
    console.error("Could not traverse: ", objParam, e);
    return;
  }
});

// event listener to trigger when DOM loaded
//document.addEventListener("DOMContentLoaded", async function () {
//  // check for presence of ?oa parameter in URL
//  const urlParams = new URLSearchParams(window.location.search);
//  const oaParam = urlParams.get("oa");
//  const maoParam = urlParams.get("mao");
//  // if ?oa parameter is present, ensure it is a valid URL
//  if (oaParam || maoParam) {
//    const paramType = oaParam ? "oa" : "mao";
//    const paramValue = paramType === "oa" ? oaParam : maoParam;
//    const objUrl = new URL(paramValue);
//    // if valid, request the URL as json-ld
//    if (objUrl) {
//      try {
//        let data = await requestAsJsonLd(objUrl);
//        console.log("Retrieved JSON data: ", data);
//        let ldo = new LDObj(data);
//        ldo
//          .prepare()
//          .then(() => {
//            if (ldo.expanded) {
//              let graph = V.drawGraph(ldo.expanded);
//              mermaid.render("fograph", graph).then((svg) => {
//                document.getElementById("graph").innerHTML = svg.svg;
//              });
//            } else {
//              console.error("Failed to initialize OA");
//            }
//            if (ldo.hasTarget()) {
//              // for each target with type "MEI",
//              // create a div inside #music-scores
//              // and use Verovio to render the MEI to SVG inside the div
//              let meiTargets = Object.keys(ldo.targets).filter((key) => {
//                return ldo.targets[key].type === "MEI";
//              });
//              meiTargets.forEach((target) => {
//                // use fetch to retrieve the target
//                fetch(target)
//                  .then((response) => {
//                    if (!response.ok) {
//                      throw new Error(
//                        "Network response was not ok",
//                        response,
//                        target
//                      );
//                    }
//                    return response.text();
//                  })
//                  .then((meiData) => {
//                    // create a new div for the MEI
//                    let meiDiv = document.createElement("div");
//                    meiDiv.className = "mei";
//                    meiDiv.id = target;
//                    document.getElementById("music-scores").appendChild(meiDiv);
//                    // use Verovio to render the MEI to SVG inside the div
//                    let vrvToolkit = new verovio.toolkit();
//                    vrvToolkit.setOptions(vrvOptions);
//                    vrvToolkit.loadData(meiData);
//                    let fragments = Array.from(ldo.targets[target].fragments);
//                    let meifriendDiv = document.createElement("div");
//                    meifriendDiv.className = "meifriendLink";
//                    let link = "https://mei-friend.mdw.ac.at/?file=" + target;
//                    link += "&select=" + fragments.join(",");
//                    meifriendDiv.innerHTML = `<a href="${link} target="_blank">Open in mei-friend</a>`;
//                    meiDiv.innerHTML = "";
//                    meiDiv.appendChild(meifriendDiv);
//                    let fragment = fragments[0];
//                    let pageNum = vrvToolkit.getPageWithElement(fragment);
//                    let svg = vrvToolkit.renderToSVG(pageNum);
//                    meiDiv.innerHTML += svg;
//                    // add "highlight" class to each element with the fragment ID
//                    fragments.forEach((f) => {
//                      let el = meiDiv.querySelector(`[id="${f}"]`);
//                      if (el) {
//                        el.classList.add("highlight");
//                      }
//                      console.log("element: ", el);
//                    });
//                  })
//                  .catch((error) => {
//                    console.error("Failed to load MEI data: ", error);
//                  });
//              });
//            }
//            if (ldo.hasTextualBody()) {
//              const textDiv = document.getElementById("text-content");
//              ldo.getTextualBodies().forEach((b) => {
//                let text = b["@value"];
//                let textDivChild = document.createElement("div");
//                textDivChild.className = "textual-body";
//                textDivChild.innerHTML = text;
//                textDiv.appendChild(textDivChild);
//              });
//            }
//          })
//          .catch((error) => {
//            console.error("Failed to prepare OA:", error);
//          });
//      } catch (error) {
//        console.error("Failed to retrieve OA as JSON-LD: ", error);
//      }
//    } else {
//      console.error("Invalid URL");
//    }
//  }
// })
