import NS from "./namespaceManager.js";
import { relevantVis } from "./defaults.js";
import { escapeHTML } from "./sanitize.js";
import Traverser from "./traverser.js";

const DEBUG = true;
const textLabelSoftLimit = 80;
const textLabelHardLimit = 100;

export default class Graph {
  constructor(relevantVisParam = relevantVis) {
    this.relevantVis = relevantVisParam;
    this.registry = {}; // registry of retrieved Linked Data objects
    this.blanks = {}; // registry of blank nodes
  }

  static init(ns) {
    // Initialize static registry
    this.registry = {};
    this.blanks = {};
    this.textClickNodes = new Set();
    this.textNodesBySubject = {};
  }

  static registerTextNode(subjectId, textNodeId) {
    if (!subjectId || !textNodeId) return;
    if (!this.textNodesBySubject) this.textNodesBySubject = {};
    if (!this.textNodesBySubject[subjectId]) {
      this.textNodesBySubject[subjectId] = new Set();
    }
    this.textNodesBySubject[subjectId].add(textNodeId);
  }

  static register(obj, uri) {
    // register the object in the registry
    // if it is not already present
    if (!obj.hasOwnProperty("expanded")) {
      console.error("Object is not expanded: ", obj);
      return;
    }
    if (!this.registry.hasOwnProperty(uri)) {
      this.registry[uri] = obj;
    } else {
      console.warn("object already registered: ", uri);
    }
    if (DEBUG) console.debug("Registry now: ", this.registry);
  }

  static registerBlank(uri, blankId) {
    if (uri in this.blanks) {
      this.blanks[uri].push(blankId);
    } else {
      this.blanks[uri] = [blankId];
    }
  }

  static getGraph() {
    // make a JSON structure of all registered object's 'expanded' properties
    const graph = {};
    for (const key in this.registry) {
      if (this.registry[key].hasOwnProperty("expanded")) {
        graph[key] = this.registry[key].expanded;
      } else {
        console.error("Object does not have expanded property: ", key);
        console.error("Object: ", this.registry[key]);
      }
    }
    if (DEBUG) console.debug("Graph: ", graph);
    return graph;
  }

  static getMEITargets() {
    // return a list of all MEI targets in the graph
    const meiTargets = {};
    for (const key in this.registry) {
      const obj = this.registry[key];
      if (obj.hasOwnProperty("targets")) {
        const targets = obj.getMEITargets();
        for (const target of targets) {
          if (target.url in meiTargets) {
            for (const fragment of target.fragments) {
              meiTargets[target.url].add(fragment);
            }
          } else {
            meiTargets[target.url] = target.fragments;
          }
        }
      }
    }
    return meiTargets;
  }

  static getAudioTargets() {
    // return a list of all Audio targets in the graph
    const audioTargets = {};
    for (const key in this.registry) {
      const obj = this.registry[key];
      if (obj.hasOwnProperty("targets")) {
        const targets = obj.getAudioTargets();
        for (const target of targets) {
          if (target.url in audioTargets) {
            for (const fragment of target.fragments) {
              audioTargets[target.url].fragments.add(fragment);
            }
          } else {
            audioTargets[target.url] = {
              fragments: target.fragments,
              timeline: target.timeline,
              peaks: target.peaks,
              type: "Audio",
              label: target.label || this.labelify(target.url),
            };
          }
        }
      }
    }
    return audioTargets;
  }

  static getTextualBodies() {
    // return a list of all textual bodies in the graph
    const textualBodies = [];
    const seen = new Set();
    for (const key in this.registry) {
      const obj = this.registry[key];
      if (obj.hasOwnProperty("expanded")) {
        const bodies = obj.getTextualBodies();
        for (const body of bodies) {
          // Deduplicate by explicit @id when present, otherwise by value+lang
          const value =
            (body["@value"] ??
              body["http://www.w3.org/1999/02/22-rdf-syntax-ns#value"]) ||
            "";
          const lang = body["@language"] || "";
          const keyId = body["@id"] || `${value}|${lang}`;
          if (!seen.has(keyId)) {
            seen.add(keyId);
            textualBodies.push(body);
          }
        }
      }
    }
    return textualBodies;
  }

  // MAO v2 notes, attributed and ordered top-down: the description, comparisons, groups,
  // then per-recording notes. Returns [{heading, body}], heading null when unknown.
  static getV2Notes() {
    const kinds = ["Description", "Comparison", "Group", "Recording"];
    const firstId = (node, pred) => node?.[pred]?.[0]?.["@id"];
    // a resource that was not fetched (e.g. private: 401) has no label to show
    const labelOf = (id) =>
      id in this.registry
        ? this.registry[id].expanded?.[NS.rdfs("label")]?.[0]?.["@value"] ||
          this.labelify(id)
        : "(not accessible)";
    const recordingOf = (selectionId) => {
      const part = firstId(this.registry[selectionId]?.expanded, NS.frbr("part"));
      return part
        ? decodeURIComponent(new URL(part).pathname.split("/").pop())
        : this.labelify(selectionId);
    };
    const notes = [];
    const seen = new Set();
    for (const key in this.registry) {
      const obj = this.registry[key];
      const ann = obj.expanded;
      if (!ann || seen.has(ann["@id"]) || !obj.isOA()) continue;
      seen.add(ann["@id"]);
      const motivation = firstId(ann, NS.oa("motivatedBy"));
      const target = ann[NS.oa("hasTarget")][0];
      let kind = null;
      let heading = null;
      if (motivation === NS.sda("commenting")) {
        kind = "Description";
        heading = kind;
      } else if (motivation === NS.sda("comparing")) {
        kind = "Comparison";
        const items = target[NS.oa("items")] || target[NS.oa("item")] || [];
        heading = `${kind}: ${items
          .map((item) => labelOf(firstId(item, NS.oa("hasSource"))))
          .join(" vs ")}`;
      } else if (motivation === NS.sda("observing") && !target["@id"]) {
        kind = "Group";
        heading = `${kind}: ${labelOf(ann["@id"])}`;
      } else if (motivation === NS.sda("observing")) {
        kind = "Recording";
        heading = `${kind}: ${recordingOf(target["@id"])}`;
      }
      for (const body of obj.getTextualBodies()) {
        notes.push({ kind: kinds.indexOf(kind), heading, body });
      }
    }
    // unknown kinds (-1) last; within a kind, by heading
    const rank = (n) => (n.kind < 0 ? kinds.length : n.kind);
    notes.sort(
      (a, b) =>
        rank(a) - rank(b) || (a.heading || "").localeCompare(b.heading || ""),
    );
    return notes.map(({ heading, body }) => ({ heading, body }));
  }

  static async getAudioSelections() {
    // return a list of all mao:Selection objects that point to audio files
    const audioSelections = [];
    const seenSelectionIds = new Set();
    const { requestAsJsonLd } = await import("./httpUtil.js");
    const LDObj = (await import("./LDObj.js")).default;

    for (const key in this.registry) {
      const obj = this.registry[key];
      if (
        obj.hasOwnProperty("expanded") &&
        obj.isMAOSelection &&
        obj.isMAOSelection()
      ) {
        if (DEBUG) console.log("Processing mao:Selection:", key, obj.expanded);
        // Check if this selection has audio targets by looking at frbr:part
        const parts = obj.expanded[NS.frbr("part")] || [];
        if (DEBUG) console.log("Found parts:", parts);
        for (const part of parts) {
          if (DEBUG) console.log("Processing part:", part);
          if (part["@type"] && part["@type"].includes(NS.tl("Interval"))) {
            // This is a timeline interval, check if it points to audio
            const timelineId =
              part[NS.tl("onTimeLine")] && part[NS.tl("onTimeLine")][0]["@id"];
            if (timelineId) {
              // Extract the selection info
              const label =
                obj.expanded[NS.rdfs("label")] &&
                obj.expanded[NS.rdfs("label")][0]["@value"];

              const selection = {
                selectionId: obj.expanded["@id"],
                title: label || this.labelify(obj.expanded["@id"]),
                signalId: timelineId,
                interval: part["@id"],
                trackId: null,
                trackLabel: null,
                musicbrainzId: null,
              };

              // Deduplicate selections registered under multiple keys
              if (seenSelectionIds.has(selection.selectionId)) {
                continue;
              }
              seenSelectionIds.add(selection.selectionId);

              // Try to get track information from the signal
              if (timelineId in this.registry) {
                const signalObj = this.registry[timelineId];
                if (DEBUG)
                  console.log("Found signal object for", timelineId, signalObj);
                if (
                  signalObj.expanded &&
                  signalObj.expanded[NS.mo("published_as")]
                ) {
                  const trackId =
                    signalObj.expanded[NS.mo("published_as")][0]["@id"];
                  selection.trackId = trackId;
                  if (DEBUG) console.log("Found trackId:", trackId);

                  // Try to get track details from registry
                  if (trackId in this.registry) {
                    const trackObj = this.registry[trackId];
                    if (DEBUG) console.log("Found track object:", trackObj);
                    if (trackObj.expanded) {
                      // Get track label
                      if (trackObj.expanded[NS.rdfs("label")]) {
                        selection.trackLabel =
                          trackObj.expanded[NS.rdfs("label")][0]["@value"];
                        if (DEBUG)
                          console.log(
                            "Found track label:",
                            selection.trackLabel,
                          );
                      }
                      // Get MusicBrainz ID
                      if (trackObj.expanded[NS.mo("musicbrainz")]) {
                        selection.musicbrainzId =
                          trackObj.expanded[NS.mo("musicbrainz")][0]["@id"];
                        if (DEBUG)
                          console.log(
                            "Found MusicBrainz ID:",
                            selection.musicbrainzId,
                          );
                      }
                    }
                  } else {
                    if (DEBUG) {
                      console.log(
                        "Track not found in registry, attempting to fetch:",
                        trackId,
                      );
                    }
                    // Try to fetch the track collection
                    try {
                      const baseTrackUrl = trackId.split("#")[0];
                      if (DEBUG) {
                        console.log(
                          "Fetching track collection from:",
                          baseTrackUrl,
                        );
                      }

                      const trackCollectionData =
                        await requestAsJsonLd(baseTrackUrl);
                      if (
                        trackCollectionData &&
                        Array.isArray(trackCollectionData)
                      ) {
                        const trackItem = trackCollectionData.find(
                          (item) => item["@id"] === trackId,
                        );
                        if (trackItem) {
                          if (DEBUG)
                            console.log(
                              "Found track in collection:",
                              trackItem,
                            );

                          // Register the track item
                          const trackObj = new LDObj(trackItem);
                          await trackObj.prepare();
                          this.register(trackObj, trackId);

                          if (
                            trackItem[
                              "http://www.w3.org/2000/01/rdf-schema#label"
                            ]
                          ) {
                            selection.trackLabel =
                              trackItem[
                                "http://www.w3.org/2000/01/rdf-schema#label"
                              ][0]["@value"];
                            if (DEBUG)
                              console.log(
                                "Found track label:",
                                selection.trackLabel,
                              );
                          }
                          if (
                            trackItem["http://purl.org/ontology/mo/musicbrainz"]
                          ) {
                            selection.musicbrainzId =
                              trackItem[
                                "http://purl.org/ontology/mo/musicbrainz"
                              ][0]["@id"];
                            if (DEBUG)
                              console.log(
                                "Found MusicBrainz ID:",
                                selection.musicbrainzId,
                              );
                          }
                        }
                      }
                    } catch (error) {
                      console.warn(
                        "Failed to fetch track collection:",
                        trackId,
                        error,
                      );
                    }
                  }
                } else {
                  if (DEBUG)
                    console.log(
                      "No published_as found in signal",
                      signalObj.expanded,
                    );
                }
              } else {
                // Try to fetch the signal collection
                try {
                  // Extract base URL without fragment for collection fetching
                  const baseSignalUrl = timelineId.split("#")[0];

                  const signalCollectionData =
                    await requestAsJsonLd(baseSignalUrl);
                  if (
                    signalCollectionData &&
                    Array.isArray(signalCollectionData)
                  ) {
                    // Find the specific signal in the collection
                    const signalItem = signalCollectionData.find(
                      (item) => item["@id"] === timelineId,
                    );
                    if (signalItem) {
                      // First extract track information from the fetched signal
                      const publishedAs =
                        signalItem["http://purl.org/ontology/mo/published_as"];
                      let trackId = null;
                      if (publishedAs) {
                        if (
                          Array.isArray(publishedAs) &&
                          publishedAs.length > 0 &&
                          publishedAs[0]["@id"]
                        ) {
                          trackId = publishedAs[0]["@id"];
                          selection.trackId = trackId;
                        }
                      }

                      // Register the signal item
                      try {
                        const signalObj = new LDObj(signalItem);
                        await signalObj.prepare();
                        this.register(signalObj, timelineId);
                      } catch (registrationError) {
                        // Continue without registration
                      }

                      // Try to fetch the track collection if we have a trackId
                      if (trackId) {
                        try {
                          const baseTrackUrl = trackId.split("#")[0];

                          const trackCollectionData =
                            await requestAsJsonLd(baseTrackUrl);

                          if (
                            trackCollectionData &&
                            Array.isArray(trackCollectionData)
                          ) {
                            const trackItem = trackCollectionData.find(
                              (item) => item["@id"] === trackId,
                            );
                            if (trackItem) {
                              // Extract track metadata

                              // Extract track label
                              if (
                                trackItem[
                                  "http://www.w3.org/2000/01/rdf-schema#label"
                                ]
                              ) {
                                selection.trackLabel =
                                  trackItem[
                                    "http://www.w3.org/2000/01/rdf-schema#label"
                                  ][0]["@value"];
                              }

                              // Extract MusicBrainz ID
                              if (
                                trackItem[
                                  "http://purl.org/ontology/mo/musicbrainz"
                                ]
                              ) {
                                selection.musicbrainzId =
                                  trackItem[
                                    "http://purl.org/ontology/mo/musicbrainz"
                                  ][0]["@id"];
                              }

                              // Attempt track registration (optional)
                              try {
                                const trackObj = new LDObj(trackItem);
                                await trackObj.prepare();
                                this.register(trackObj, trackId);
                              } catch (trackRegistrationError) {
                                // Continue without registration
                              }
                            }
                          }
                        } catch (trackError) {
                          // Continue without track metadata
                        }
                      } else {
                        if (DEBUG)
                          console.debug(
                            "No published_as property found in signal",
                          );
                      }
                    } else {
                      if (DEBUG)
                        console.debug("Signal not found in collection");
                    }
                  }
                } catch (signalError) {
                  console.error(
                    "Failed to fetch signal collection:",
                    timelineId,
                    signalError,
                  );
                }
              }

              audioSelections.push(selection);
              break; // Only add once per selection, even if multiple parts
            }
          }
        }
      }
    }
    return audioSelections;
  }

  // Mermaid cannot parse some characters in a node id, e.g. the "(", "&" and "," of Listen
  // Here's recording names; replace them. Ids without them come back unchanged.
  static nodeId(str) {
    return str.replace(/[()[\]{}&,;"'<>|`\s]/g, "_");
  }

  static readable(str) {
    try {
      return escapeHTML(decodeURIComponent(str));
    } catch (e) {
      return escapeHTML(str);
    }
  }

  // The label lines for a SpecificResource's purpose(s), and a chip per scope naming it
  // (main.js highlights the scope's node when the chip is hovered or clicked)
  static specificResourceLines(node) {
    let lines = "<span class='v2-lines'>";
    const purposes = (node[NS.oa("hasPurpose")] || []).map((p) =>
      this.labelify(p["@id"]),
    );
    if (purposes.length) {
      lines += `<br>[oa:hasPurpose: ${purposes.join(", ")}]`;
    }
    for (const scope of node[NS.oa("hasScope")] || []) {
      const sid = scope["@id"];
      const target = this.registry[sid]?.expanded;
      const type = target?.["@type"]?.[0];
      const label = target?.[NS.rdfs("label")]?.[0]?.["@value"];
      const name = type
        ? this.labelify(type) + (label ? ` «${escapeHTML(label)}»` : "")
        : this.labelify(sid);
      lines += `<br><span class='scope-chip' data-scope='${this.nodeId(
        sid,
      )}'>scope: ${name}</span>`;
    }
    return lines + "</span>";
  }

  static isV2Blank(node) {
    const types = node["@type"] || [];
    return (
      types.includes(NS.oa("SpecificResource")) ||
      types.includes(NS.oa("CompositeTarget"))
    );
  }

  static labelify(str) {
    // if the string is prefixed with a namespace, return the local name
    // otherwise, return the string without the protocol prefix (to help Mermaid)
    let label = str;
    for (const prefix in NS.nsMap) {
      if (str.startsWith(NS.nsMap[prefix])) {
        label = str.replace(NS.nsMap[prefix], prefix + ":");
      }
    }
    if (label === str) {
      // doesn't match a namespace, so try to get the last part of the URL
      label = str.substring(str.lastIndexOf("/") + 1);
    }
    return label;
  }

  static getTextualValue(node) {
    if (!node) return null;
    if (typeof node === "string") return node;
    if (typeof node["@value"] === "string") return node["@value"];

    const rdfVal = node[NS.rdf("value")];
    if (Array.isArray(rdfVal) && rdfVal.length) {
      const first = rdfVal[0];
      if (typeof first === "string") return first;
      if (
        first &&
        typeof first === "object" &&
        typeof first["@value"] === "string"
      ) {
        return first["@value"];
      }
    }

    return null;
  }

  /**
   * Return a partial Mermaid graph string to visualise the relevant parts of the object
   * @param {Object} obj - current object to visualise
   * @param {boolean} current - whether the object correponds to the current URL
   * @param {Object} relevant - object containing relevant types and predicates
   * @param {number} blankCounter - counter for blank node IDs
   * @returns {string}
   */

  static visualise(
    obj,
    current = false,
    relevant = relevantVis,
    blankCounter = 0,
  ) {
    let visgraph = "";
    if (current) {
      visgraph += "class " + this.nodeId(obj["@id"]) + " current;\n";
      // A MAO v2 crawl is a graph, not a tree: draw each resource once, and number blank
      // nodes across the whole drawing (v1 numbers them per branch, which can repeat ids)
      this.v2Drawn = new Set();
      this.v2BlankCount = 0;
    }
    const blankId = () =>
      Traverser.v2 ? "blank_" + this.v2BlankCount++ : "blank_" + blankCounter++;

    // Avoid drawing many "part" edges for multiple target fragments; aggregate counts instead.
    const targetResources = {
      ...this.getMEITargets(),
      ...this.getAudioTargets(),
    };
    const targetResourcePredFragments = {};

    // Determine node id
    const id = obj["@id"] ? obj["@id"] : blankId();
    if (Traverser.v2) this.v2Drawn.add(id);
    const nid = this.nodeId(id);

    // Literal node: draw rectangle with value and return
    const literalValue = obj["@value"] ?? obj[NS.rdf("value")];
    if (literalValue !== undefined) {
      let val = literalValue;
      if (typeof val === "string" && val.length > 50) {
        val = val.substring(0, 50) + "...";
      }
      visgraph = `${nid}["${val}"];`;
      return visgraph;
    }

    // Resource node: stadium shape with type/label
    if (obj.hasOwnProperty("@type")) {
      visgraph += `${nid}("${this.labelify(obj["@type"][0])}`; // TODO consider multiple types
    }
    if (obj.hasOwnProperty(NS.rdfs("label"))) {
      const lab = obj[NS.rdfs("label")][0]; // TODO consider multiple labels
      if (typeof lab === "string") visgraph += `( ${lab})`;
      else if (typeof lab === "object" && "@value" in lab)
        visgraph += `: <em>${lab["@value"]}</em>`;
    }
    // MAO v2: a SpecificResource's purpose and scope go in its label, not along edges that
    // would cross the whole graph (every item of a Listen Here annotation shares one scope)
    const v2Blank = Traverser.v2 && this.isV2Blank(obj);
    if (v2Blank) visgraph += this.specificResourceLines(obj);
    visgraph += '");';
    if (v2Blank) {
      // still draw each scope once: in a v2 crawl nothing else reaches the Extract
      for (const scope of obj[NS.oa("hasScope")] || []) {
        const sid = scope["@id"];
        if (sid in this.registry && !this.v2Drawn.has(sid)) {
          visgraph += this.visualise(
            this.registry[sid].expanded,
            false,
            relevant,
            blankCounter,
          );
        }
      }
    }

    // Draw predicate edges
    for (const pred of relevant.predicates) {
      if (!obj.hasOwnProperty(pred)) continue;
      if (
        v2Blank &&
        (pred === NS.oa("hasPurpose") || pred === NS.oa("hasScope"))
      ) {
        continue;
      }

      for (const target of obj[pred]) {
        // Aggregate fragment counts for resources we handle separately
        const matches = Object.keys(targetResources).filter((t) => {
          if ("@id" in target && target["@id"].startsWith(t)) {
            if (!targetResourcePredFragments[pred]) {
              targetResourcePredFragments[pred] = {};
            }
            targetResourcePredFragments[pred][t] =
              targetResources[t].type === "Audio"
                ? targetResources[t].fragments.size
                : targetResources[t].size;
            return true;
          }
          return false;
        });
        if (matches.length) {
          continue;
        }

        if ("@id" in target && target["@id"] in this.registry) {
          visgraph += `${nid} -- ${this.labelify(pred)} --> ${this.nodeId(
            target["@id"],
          )};`;
          if (!(Traverser.v2 && this.v2Drawn.has(target["@id"]))) {
            visgraph += this.visualise(
              this.registry[target["@id"]].expanded,
              false,
              relevant,
              blankCounter,
            );
          }
        } else if (!("@id" in target) && this.isV2Blank(target)) {
          // MAO v2: a SpecificResource or CompositeTarget, drawn with what it points at
          const targetId = blankId();
          this.registerBlank(obj["@id"], targetId);
          visgraph += `${nid} -- ${this.labelify(pred)} --> ${targetId};`;
          visgraph += this.visualise(
            { ...target, "@id": targetId },
            false,
            relevant,
            blankCounter,
          );
        } else {
          let targetId;
          if ("@id" in target) {
            targetId = target["@id"];
          } else {
            targetId = blankId();
            this.registerBlank(obj["@id"], targetId);
          }

          // Show a snippet of textual body content when the blank node is a textual body
          let targetLabel = this.labelify(targetId);
          const types = target["@type"] || [];
          const isTextualBody = Array.isArray(types)
            ? types.includes(NS.oa("TextualBody")) ||
              types.includes("oa:TextualBody")
            : types === NS.oa("TextualBody") || types === "oa:TextualBody";

          const textualValue = this.getTextualValue(target);
          let clickCommand = null;
          if (isTextualBody && typeof textualValue === "string") {
            const raw = textualValue;
            let clipped = raw;
            if (raw.length > textLabelSoftLimit) {
              const slice = raw.slice(
                textLabelSoftLimit,
                textLabelHardLimit + 1,
              );
              const firstBoundary = slice.search(/\s/);
              if (firstBoundary !== -1) {
                clipped = raw.slice(0, textLabelSoftLimit + firstBoundary);
              } else if (raw.length > textLabelHardLimit) {
                clipped = raw.slice(0, textLabelHardLimit);
              }
            }

            const cropped = clipped.length < raw.length;
            const safeText = escapeHTML(clipped.replace(/[\n\r]+/g, " "));
            const quotedText = `&quot;${safeText}${
              cropped ? " ..." : ""
            }&quot;`;
            targetLabel = `<em>${quotedText}</em>`;

            if (!this.textClickNodes) this.textClickNodes = new Set();
            if (!this.textClickNodes.has(targetId)) {
              this.textClickNodes.add(targetId);
              clickCommand = `click ${targetId} "#a-text-content" "View textual body";`;
            }

            // Track textual body per subject for subgraph inclusion
            this.registerTextNode(obj["@id"], targetId);
          }

          visgraph += `${nid} -- ${this.labelify(
            pred,
          )} --> ${this.nodeId(targetId)}("${targetLabel}");`;
          if (clickCommand) {
            visgraph += `\n ${clickCommand}`;
          }
        }
      }

      if (targetResourcePredFragments[pred]) {
        for (const target in targetResourcePredFragments[pred]) {
          const numFrag = targetResourcePredFragments[pred][target];
          let fragWord = "fragment";
          if (targetResources[target].type === "Audio") {
            fragWord = "time interval";
          }
          visgraph += `${nid} -- ${this.labelify(pred)} (${numFrag}`;
          visgraph += numFrag > 1 ? ` ${fragWord}s)` : ` ${fragWord})`;
          const name = this.labelify(target);
          const nameId = this.nodeId(name);
          // an escaped id keeps the readable name as its label
          visgraph +=
            nameId === name
              ? ` --> ${name};`
              : ` --> ${nameId}["${this.readable(name)}"];`;
        }
      }
    }
    return visgraph;
  }
}
