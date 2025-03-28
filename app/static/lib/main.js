export const version = "0.0.2";
export const versionDate = "20 February 2025";

import NS from "./namespaceManager.js";
import OA from "./oa.js";
import { requestAsJsonLd } from "./http.js";
import V from "./visualiser.js";
import { vrvOptions } from "./defaults.js";

V.init(NS);
// event listener to trigger when DOM loaded
document.addEventListener("DOMContentLoaded", async function () {
  // check for presence of ?oa parameter in URL
  const urlParams = new URLSearchParams(window.location.search);
  const oaParam = urlParams.get("oa");
  const maoParam = urlParams.get("mao");
  // if ?oa parameter is present, ensure it is a valid URL
  if (oaParam || maoParam) {
    const paramType = oaParam ? "oa" : "mao";
    const paramValue = paramType === "oa" ? oaParam : maoParam;
    const objUrl = new URL(paramValue);
    // if valid, request the URL as json-ld
    if (objUrl) {
      try {
        let data = await requestAsJsonLd(objUrl);
        console.log("Retrieved JSON data: ", data);
        let oa = new OA(data);
        oa.prepare()
          .then(() => {
            if (oa.expanded) {
              let graph = V.drawGraph(oa.expanded);
              mermaid.render("fograph", graph).then((svg) => {
                document.getElementById("graph").innerHTML = svg.svg;
              });
            } else {
              console.error("Failed to initialize OA");
            }
            if (oa.hasTarget()) {
              // for each target with type "MEI",
              // create a div inside #music-scores
              // and use Verovio to render the MEI to SVG inside the div
              let meiTargets = Object.keys(oa.targets).filter((key) => {
                return oa.targets[key].type === "MEI";
              });
              meiTargets.forEach((target) => {
                // use fetch to retrieve the target
                fetch(target)
                  .then((response) => {
                    if (!response.ok) {
                      throw new Error(
                        "Network response was not ok",
                        response,
                        target
                      );
                    }
                    return response.text();
                  })
                  .then((meiData) => {
                    // create a new div for the MEI
                    let meiDiv = document.createElement("div");
                    meiDiv.className = "mei";
                    meiDiv.id = target;
                    document.getElementById("music-scores").appendChild(meiDiv);
                    // use Verovio to render the MEI to SVG inside the div
                    let vrvToolkit = new verovio.toolkit();
                    vrvToolkit.setOptions(vrvOptions);
                    vrvToolkit.loadData(meiData);
                    let fragments = Array.from(oa.targets[target].fragments);
                    let meifriendDiv = document.createElement("div");
                    meifriendDiv.className = "meifriendLink";
                    let link = "https://mei-friend.mdw.ac.at/?file=" + target;
                    link += "&select=" + fragments.join(",");
                    meifriendDiv.innerHTML = `<a href="${link} target="_blank">Open in mei-friend</a>`;
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
                  })
                  .catch((error) => {
                    console.error("Failed to load MEI data: ", error);
                  });
              });
            }
            if (oa.hasTextualBody()) {
              const textDiv = document.getElementById("text-content");
              oa.getTextualBodies().forEach((b) => {
                let text = b["@value"];
                let textDivChild = document.createElement("div");
                textDivChild.className = "textual-body";
                textDivChild.innerHTML = text;
                textDiv.appendChild(textDivChild);
              });
            }
          })
          .catch((error) => {
            console.error("Failed to prepare OA:", error);
          });
      } catch (error) {
        console.error("Failed to retrieve OA as JSON-LD: ", error);
      }
    } else {
      console.error("Invalid URL");
    }
  }
});
