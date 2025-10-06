export let version = "0.7.0";
export const versionDate = "6 October 2025";

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
import {
  clearSectionContent,
  showNoContentMessage,
  showErrorBanner,
} from "./errorBanner.js";

if (env === environments.staging) {
  version = "staging-" + version;
}

let objUrl = null;
const graphModal = new GraphModal();

// Helper function to hide loading spinner for a section
function hideLoadingSpinner(sectionId) {
  const section = document.querySelector(sectionId);
  if (section) {
    section.classList.add("content-loaded");
  }
}

// Function to display audio selections metadata
async function displayAudioSelectionsMetadata() {
  const audioSelections = await Graph.getAudioSelections();

  if (audioSelections.length === 0) {
    return; // No audio selections to display
  }

  // Create or find the audio selections container
  let audioSelectionsDiv = document.querySelector("#meta-audio-selections");
  if (!audioSelectionsDiv) {
    audioSelectionsDiv = document.createElement("div");
    audioSelectionsDiv.id = "meta-audio-selections";

    // Add it after the creator div
    const creatorDiv = document.querySelector("#meta-created-by");
    creatorDiv.parentNode.insertBefore(
      audioSelectionsDiv,
      creatorDiv.nextSibling
    );
  }

  // Build the HTML for audio selections
  let html = "<h3>Audio Files</h3><ul>";

  for (const selection of audioSelections) {
    html += `<li><strong>${selection.title}</strong><br>`;
    html += `<a href="${
      selection.signalId
    }" target="_blank">Signal: ${Graph.labelify(selection.signalId)}</a><br>`;

    // Display track information if available
    if (selection.trackId) {
      const trackLabel =
        selection.trackLabel || Graph.labelify(selection.trackId);
      html += `<a href="${selection.trackId}" target="_blank">${trackLabel}</a><br>`;
    }

    // Display MusicBrainz link if available
    if (selection.musicbrainzId) {
      html += `<a href="${
        selection.musicbrainzId
      }" target="_blank">MusicBrainz: ${Graph.labelify(
        selection.musicbrainzId
      )}</a>`;
    }

    html += "</li>";
  }

  html += "</ul>";
  audioSelectionsDiv.innerHTML = html;
}

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

    // Display audio selections metadata
    await displayAudioSelectionsMetadata();

    // Hide metadata loading spinner (metadata always has at least current URI)
    hideLoadingSpinner("#h-metadata");
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
    const jsonData = Graph.registry[objUrl].compacted;
    if (jsonData && Object.keys(jsonData).length > 0) {
      jsonDisplay.textContent = JSON.stringify(jsonData, null, 2);
      // Show the JSON pre element
      const jsonPre = jsonDisplay.closest("pre");
      if (jsonPre) {
        jsonPre.style.display = "block";
      }
      Prism.highlightElement(jsonDisplay);
      hideLoadingSpinner("#h-json-display");
    } else {
      showNoContentMessage("#h-json-display", "No JSON-LD data available.");
    }

    console.log("Visualising graph: ", visgraph);
    mermaid
      .render("fograph", visgraph)
      .then((svg) => {
        let g = document.querySelector("#graph");
        g.innerHTML =
          svg.svg +
          '<button class="graph-expand-icon" id="graph-expand-btn" title="Expand to full screen">⤢</button>';

        // Show the graph div
        g.style.display = "block";

        // Fit the graph to the container
        GraphModal.fitGraphToContainer(g);

        // Update the expand button reference and ensure modal is initialized
        graphModal.updateExpandButton();

        // Hide graph loading spinner
        hideLoadingSpinner("#h-graph");
      })
      .catch((error) => {
        console.error("Error rendering graph:", error);
        showNoContentMessage(
          "#h-graph",
          "Error rendering graph visualization."
        );
      });
  } else {
    console.error(
      "Object not found in registry while trying to visualise: ",
      objUrl.href,
      Object.keys(Graph.registry),
      Graph.registry
    );

    // Show user-friendly error banner
    const suggestions = [
      "The resource may not contain valid Web Annotation or Music Annotation data",
      "Check that the URL returns structured linked data (JSON-LD)",
      "Verify the resource follows Web Annotation Data Model standards",
      "Ensure the server is responding correctly and not returning errors",
    ];

    showErrorBanner(
      "The resource was loaded but does not contain recognizable annotation data.",
      objUrl.href,
      suggestions,
      { code: "200", text: "OK - Invalid Data Format" }
    );

    // Clear any existing content containers
    clearSectionContent();

    // Show no content messages for all sections
    showNoContentMessage(
      "#h-text-content",
      "No valid annotation data found - see error above."
    );
    showNoContentMessage(
      "#h-music-scores",
      "No valid annotation data found - see error above."
    );
    showNoContentMessage(
      "#h-audio-examples",
      "No valid annotation data found - see error above."
    );
    showNoContentMessage(
      "#h-metadata",
      "No valid annotation data found - see error above."
    );
    showNoContentMessage(
      "#h-graph",
      "No valid annotation data found - see error above."
    );
    showNoContentMessage(
      "#h-json-display",
      "No valid annotation data found - see error above."
    );
    return;
  }
  // render the MEI using Verovio:
  // for each MEI target in the graph,
  // create a div inside #music-scores
  // and use Verovio to render the respective MEI to SVG inside the div
  let meiTargets = Graph.getMEITargets();
  console.log("Main got MEI targets: ", meiTargets);
  if (Object.keys(meiTargets).length > 0) {
    for (const target of Object.keys(meiTargets)) {
      // use fetch to retrieve the target
      fetchTextData(target).then((data) =>
        renderMEI(target, meiTargets[target], data)
      );
    }
  } else {
    // Show no content message for music scores
    showNoContentMessage(
      "#h-music-scores",
      "No music scores found in this annotation."
    );
  }
  // render the textual bodies
  let textBodies = Graph.getTextualBodies();
  if (textBodies.length > 0) {
    renderTextualBodies(textBodies);
    hideLoadingSpinner("#h-text-content");
  } else {
    console.log("No textual bodies found");
    showNoContentMessage(
      "#h-text-content",
      "No text content found in this annotation."
    );
  }

  // render the audio targets
  let audioTargets = Graph.getAudioTargets();
  if (Object.keys(audioTargets).length > 0) {
    await renderAudioTargets(audioTargets);
    hideLoadingSpinner("#h-audio-examples");
  } else {
    showNoContentMessage(
      "#h-audio-examples",
      "No audio recordings found in this annotation."
    );
  }
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

      // Set up timeout for loading
      const loadingTimeout = setTimeout(() => {
        const suggestions = [
          "The server may be slow to respond or temporarily unavailable",
          "The resource URL may be incorrect or the server may be down",
          "The resource URL may not be returning valid music annotation Linked Data (Web Annotation Data Model and/or Music Annotation Ontology)",
          "Try refreshing the page or check the resource URL",
          "Go to the <a href='/'>main page</a> for more information on Primal",
        ];

        showErrorBanner(
          "Loading is taking longer than expected. The resource may be unavailable.",
          objParam,
          suggestions,
          { code: "Timeout", text: "Request Timeout (15s)" }
        );

        // Clear any leftover content and show timeout messages in all sections
        clearSectionContent();
        showNoContentMessage(
          "#h-text-content",
          "Loading timeout - see error above."
        );
        showNoContentMessage(
          "#h-music-scores",
          "Loading timeout - see error above."
        );
        showNoContentMessage(
          "#h-audio-examples",
          "Loading timeout - see error above."
        );
        showNoContentMessage(
          "#h-metadata",
          "Loading timeout - see error above."
        );
        showNoContentMessage("#h-graph", "Loading timeout - see error above.");
        showNoContentMessage(
          "#h-json-display",
          "Loading timeout - see error above."
        );
      }, 15000); // 15 second timeout

      // Clear timeout when traversals complete
      document.addEventListener(
        "traversalsComplete",
        () => {
          clearTimeout(loadingTimeout);
        },
        { once: true }
      );

      // fetch and register the object
      Traverser.fetchAndRegister([objUrl]);
    } catch (e) {
      console.error("Could not traverse: ", objParam, e);

      // Show user-friendly error banner
      const suggestions = [
        "Check that the URL is accessible and returns valid JSON-LD data",
        "Ensure the resource supports CORS (Cross-Origin Resource Sharing)",
        "Verify the URL format is correct",
        "Try accessing the URL directly in your browser to test availability",
      ];

      // Try to extract status information from error
      let status = null;
      if (e.message && e.message.includes("404")) {
        status = { code: 404, text: "Not Found" };
      } else if (e.message && e.message.includes("403")) {
        status = { code: 403, text: "Forbidden" };
      } else if (e.message && e.message.includes("500")) {
        status = { code: 500, text: "Internal Server Error" };
      } else if (e.message && e.message.includes("CORS")) {
        status = { code: "CORS", text: "Cross-Origin Request Blocked" };
      } else if (e.name === "TypeError" && e.message.includes("fetch")) {
        status = { code: "Network", text: "Network Error or CORS Issue" };
      }

      showErrorBanner(
        "Unable to load the requested annotation resource.",
        objParam,
        suggestions,
        status
      );

      // Clear any existing content containers
      clearSectionContent();

      // Show error messages in all sections
      showNoContentMessage(
        "#h-text-content",
        "Unable to load annotation - see error above."
      );
      showNoContentMessage(
        "#h-music-scores",
        "Unable to load annotation - see error above."
      );
      showNoContentMessage(
        "#h-audio-examples",
        "Unable to load annotation - see error above."
      );
      showNoContentMessage(
        "#h-metadata",
        "Unable to load annotation - see error above."
      );
      showNoContentMessage(
        "#h-graph",
        "Unable to load annotation - see error above."
      );
      showNoContentMessage(
        "#h-json-display",
        "Unable to load annotation - see error above."
      );

      return;
    }
  } else {
    // display splash text, hide main content
    let body = document.querySelector("body");
    body.classList.add("splash");
  }
});
