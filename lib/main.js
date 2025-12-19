export let version = "0.10.0";
export const versionDate = "19 December 2025";

import NS from "./namespaceManager.js";
import Traverser from "./traverser.js";
import Graph from "./graph.js";
import GraphModal from "./graphModal.js";
import { fetchTextData } from "./httpUtil.js";
import { relevantVis } from "./defaults.js";
import { escapeHTML, isSafeUrl } from "./sanitize.js";
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

const DEBUG = true;

if (env === environments.staging) {
  version = "staging-" + version;
}

let objUrl = null;
const graphModal = new GraphModal();
let loadingTimeoutId = null;
let loadingTimeoutFired = false;

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

  // Clear previous content
  audioSelectionsDiv.textContent = "";

  const heading = document.createElement("h3");
  heading.textContent = "Audio Files";
  audioSelectionsDiv.appendChild(heading);

  const list = document.createElement("ul");

  for (const selection of audioSelections) {
    const li = document.createElement("li");

    const titleEl = document.createElement("strong");
    titleEl.textContent = escapeHTML(selection.title);
    li.appendChild(titleEl);
    li.appendChild(document.createElement("br"));

    // Signal link (only if safe)
    if (isSafeUrl(selection.signalId)) {
      const signalLink = document.createElement("a");
      signalLink.href = selection.signalId;
      signalLink.target = "_blank";
      signalLink.textContent = `Signal: ${Graph.labelify(selection.signalId)}`;
      li.appendChild(signalLink);
      li.appendChild(document.createElement("br"));
    } else {
      const signalText = document.createElement("span");
      signalText.textContent = `Signal: ${escapeHTML(selection.signalId)}`;
      li.appendChild(signalText);
      li.appendChild(document.createElement("br"));
    }

    // Track information if available
    if (selection.trackId) {
      const trackLabel =
        selection.trackLabel || Graph.labelify(selection.trackId);
      if (isSafeUrl(selection.trackId)) {
        const trackLink = document.createElement("a");
        trackLink.href = selection.trackId;
        trackLink.target = "_blank";
        trackLink.textContent = escapeHTML(trackLabel);
        li.appendChild(trackLink);
      } else {
        const trackText = document.createElement("span");
        trackText.textContent = escapeHTML(trackLabel);
        li.appendChild(trackText);
      }
      li.appendChild(document.createElement("br"));
    }

    // MusicBrainz link if available
    if (selection.musicbrainzId) {
      if (isSafeUrl(selection.musicbrainzId)) {
        const mbLink = document.createElement("a");
        mbLink.href = selection.musicbrainzId;
        mbLink.target = "_blank";
        mbLink.textContent = `MusicBrainz: ${Graph.labelify(
          selection.musicbrainzId
        )}`;
        li.appendChild(mbLink);
      } else {
        const mbText = document.createElement("span");
        mbText.textContent = `MusicBrainz: ${escapeHTML(
          selection.musicbrainzId
        )}`;
        li.appendChild(mbText);
      }
    }

    list.appendChild(li);
  }

  audioSelectionsDiv.appendChild(list);
}

async function traversalsComplete() {
  // Cancel any outstanding load timeout and clean up timeout UI
  if (loadingTimeoutId) {
    clearTimeout(loadingTimeoutId);
    loadingTimeoutId = null;
  }
  if (loadingTimeoutFired) {
    loadingTimeoutFired = false;
    const existingBanner = document.querySelector(".error-banner");
    if (existingBanner) existingBanner.remove();
    document
      .querySelectorAll(".no-content-message")
      .forEach((el) => el.remove());
    clearSectionContent();
  }

  if (DEBUG) {
    if (DEBUG) {
      console.log("Handling traversals completed, registry: ", Graph.registry);
      console.log("Registry keys:", Object.keys(Graph.registry));
    }
  }
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
      // Clear previous content
      creatorDiv.textContent = "";
      const prefix = document.createTextNode("Created by: ");
      creatorDiv.appendChild(prefix);

      if (creatorUri && isSafeUrl(creatorUri)) {
        const link = document.createElement("a");
        link.href = creatorUri;
        link.target = "_blank";
        link.textContent = creatorLabel
          ? escapeHTML(creatorLabel)
          : `<${creatorUri}>`;
        creatorDiv.appendChild(link);
      } else if (creatorLabel) {
        const span = document.createElement("span");
        span.textContent = escapeHTML(creatorLabel);
        creatorDiv.appendChild(span);
      } else if (creatorUri) {
        const span = document.createElement("span");
        span.textContent = `<${creatorUri}>`;
        creatorDiv.appendChild(span);
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
            if (DEBUG) console.log("Adding object: ", o);
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
    if (DEBUG) console.log("Visualising current resource subgraph: ", visgraph);
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

    if (DEBUG) console.log("Visualising graph: ", visgraph);
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
    console.warn("Registry keys at failure:", Object.keys(Graph.registry));

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
  if (DEBUG) console.log("Main got MEI targets: ", meiTargets);
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
    if (DEBUG) console.log("No textual bodies found");
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

  // Mobile nav toggle
  const nav = document.querySelector("nav");
  const navToggle = document.querySelector("#nav-toggle");
  const navLinks = document.querySelector("#nav-links");
  if (nav && navToggle && navLinks) {
    navToggle.addEventListener("click", () => {
      const isOpen = nav.classList.toggle("nav-open");
      navToggle.setAttribute("aria-expanded", isOpen);
    });

    navLinks.querySelectorAll("a").forEach((link) => {
      link.addEventListener("click", () => {
        nav.classList.remove("nav-open");
        navToggle.setAttribute("aria-expanded", "false");
      });
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 768) {
        nav.classList.remove("nav-open");
        navToggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  // fill in version and date
  let versionSpan = document.querySelector("#version");
  let dateSpan = document.querySelector("#date");
  if (versionSpan && dateSpan) {
    versionSpan.textContent = version;
    dateSpan.textContent = versionDate;
  }
  // check for presence of ?obj parameter in URL
  const urlParams = new URLSearchParams(window.location.search);
  const objParam = urlParams.get("obj");
  const rejectedFromHead = window.__PRIMAL_INVALID_OBJ__;

  if (rejectedFromHead) {
    const suggestions = [
      "Use an absolute http(s) URL to a JSON-LD resource",
      "Ensure the URL is properly encoded",
      "Avoid embedding HTML or script content in the obj parameter",
    ];

    showErrorBanner(
      "Invalid resource URL. Only http(s) URLs are allowed.",
      rejectedFromHead,
      suggestions,
      { code: "Invalid", text: "Invalid URL" }
    );

    clearSectionContent();
    showNoContentMessage(
      "#h-text-content",
      "Invalid resource URL - see error above."
    );
    showNoContentMessage(
      "#h-music-scores",
      "Invalid resource URL - see error above."
    );
    showNoContentMessage(
      "#h-audio-examples",
      "Invalid resource URL - see error above."
    );
    showNoContentMessage(
      "#h-metadata",
      "Invalid resource URL - see error above."
    );
    showNoContentMessage("#h-graph", "Invalid resource URL - see error above.");
    showNoContentMessage(
      "#h-json-display",
      "Invalid resource URL - see error above."
    );

    return;
  }

  if (objParam) {
    const trimmedObj = objParam.trim();
    const hasAngleBrackets = /[<>]/.test(trimmedObj);

    // Reject non-HTTP(S) obj parameters early to prevent HTML/JS injection
    if (hasAngleBrackets || !isSafeUrl(trimmedObj)) {
      const suggestions = [
        "Use an absolute http(s) URL to a JSON-LD resource",
        "Ensure the URL is properly encoded",
        "Avoid embedding HTML or script content in the obj parameter",
      ];

      showErrorBanner(
        "Invalid resource URL. Only http(s) URLs are allowed.",
        trimmedObj,
        suggestions,
        { code: "Invalid", text: "Invalid URL" }
      );

      clearSectionContent();
      showNoContentMessage(
        "#h-text-content",
        "Invalid resource URL - see error above."
      );
      showNoContentMessage(
        "#h-music-scores",
        "Invalid resource URL - see error above."
      );
      showNoContentMessage(
        "#h-audio-examples",
        "Invalid resource URL - see error above."
      );
      showNoContentMessage(
        "#h-metadata",
        "Invalid resource URL - see error above."
      );
      showNoContentMessage(
        "#h-graph",
        "Invalid resource URL - see error above."
      );
      showNoContentMessage(
        "#h-json-display",
        "Invalid resource URL - see error above."
      );

      return;
    }

    Graph.init(NS);
    Traverser.init();
    // add event listener to trigger when traversals are complete
    document.addEventListener("traversalsComplete", traversalsComplete, {
      once: true,
    });
    try {
      let currentUri = document.querySelector("#meta-current-uri");
      if (currentUri) {
        currentUri.textContent = "";
        const prefix = document.createTextNode("Current resource: ");
        currentUri.appendChild(prefix);
        if (isSafeUrl(objParam)) {
          const link = document.createElement("a");
          link.href = objParam;
          link.target = "_blank";
          link.textContent = `<${objParam}>`;
          currentUri.appendChild(link);
        } else {
          const span = document.createElement("span");
          span.textContent = `<${objParam}>`;
          currentUri.appendChild(span);
        }
      }
      objUrl = new URL(objParam);

      // Set up timeout for loading
      loadingTimeoutId = setTimeout(() => {
        loadingTimeoutFired = true;
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
          if (loadingTimeoutId) {
            clearTimeout(loadingTimeoutId);
            loadingTimeoutId = null;
          }
          loadingTimeoutFired = false;
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
