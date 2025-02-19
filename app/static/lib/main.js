export const version = "0.0.1";
export const versionDate = "19 February 2025";

import NS from "./namespaceManager.js";
import OA from "./oa.js";
import { requestAsJsonLd } from "./http.js";
import V from "./visualiser.js";

V.init(NS);
// event listener to trigger when DOM loaded
document.addEventListener("DOMContentLoaded", async function () {
  console.log("Flask static file serving works!");
  // check for presence of ?oa parameter in URL
  const urlParams = new URLSearchParams(window.location.search);
  const oaParam = urlParams.get("oa");
  // if ?oa parameter is present, ensure it is a valid URL
  if (oaParam) {
    const oaUrl = new URL(oaParam);
    // if valid, request the URL as json-ld
    if (oaUrl) {
      let oa = requestAsJsonLd(
        oaUrl,
        async (data) => {
          console.log("Retrieved JSON data: ", data);
          oa = new OA(data);
          console.log("Parsed OA object: ", oa);
          let g = V.drawGraph(oa.obj);
          // run through mermaid API to render the graph
          mermaid.render("graph", g, function () {
            console.log("Rendered graph");
          });
        },
        (error) => {
          console.error(error);
        }
      );
    } else {
      console.error("Invalid URL");
    }
  }
});
