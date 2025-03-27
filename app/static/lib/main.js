export const version = "0.0.2";
export const versionDate = "20 February 2025";

import NS from "./namespaceManager.js";
import OA from "./oa.js";
import { requestAsJsonLd } from "./http.js";
import V from "./visualiser.js";

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
