import NS from "./namespaceManager.js";
import { relevantVis } from "./defaults.js";

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
                            selection.trackLabel
                          );
                      }
                      // Get MusicBrainz ID
                      if (trackObj.expanded[NS.mo("musicbrainz")]) {
                        selection.musicbrainzId =
                          trackObj.expanded[NS.mo("musicbrainz")][0]["@id"];
                        if (DEBUG)
                          console.log(
                            "Found MusicBrainz ID:",
                            selection.musicbrainzId
                          );
                      }
                    }
                  } else {
                    if (DEBUG) {
                      console.log(
                        "Track not found in registry, attempting to fetch:",
                        trackId
                      );
                    }
                    // Try to fetch the track collection
                    try {
                      const baseTrackUrl = trackId.split("#")[0];
                      if (DEBUG) {
                        console.log(
                          "Fetching track collection from:",
                          baseTrackUrl
                        );
                      }

                      const trackCollectionData = await requestAsJsonLd(
                        baseTrackUrl
                      );
                      if (
                        trackCollectionData &&
                        Array.isArray(trackCollectionData)
                      ) {
                        const trackItem = trackCollectionData.find(
                          (item) => item["@id"] === trackId
                        );
                        if (trackItem) {
                          if (DEBUG)
                            console.log(
                              "Found track in collection:",
                              trackItem
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
                                selection.trackLabel
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
                                selection.musicbrainzId
                              );
                          }
                        }
                      }
                    } catch (error) {
                      console.warn(
                        "Failed to fetch track collection:",
                        trackId,
                        error
                      );
                    }
                  }
                } else {
                  if (DEBUG)
                    console.log(
                      "No published_as found in signal",
                      signalObj.expanded
                    );
                }
              } else {
                // Try to fetch the signal collection
                try {
                  // Extract base URL without fragment for collection fetching
                  const baseSignalUrl = timelineId.split("#")[0];

                  const signalCollectionData = await requestAsJsonLd(
                    baseSignalUrl
                  );
                  if (
                    signalCollectionData &&
                    Array.isArray(signalCollectionData)
                  ) {
                    // Find the specific signal in the collection
                    const signalItem = signalCollectionData.find(
                      (item) => item["@id"] === timelineId
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

                          const trackCollectionData = await requestAsJsonLd(
                            baseTrackUrl
                          );

                          if (
                            trackCollectionData &&
                            Array.isArray(trackCollectionData)
                          ) {
                            const trackItem = trackCollectionData.find(
                              (item) => item["@id"] === trackId
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
                            "No published_as property found in signal"
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
                    signalError
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
    blankCounter = 0
  ) {
    let visgraph = "";
    if (current) {
      visgraph += "class " + obj["@id"] + " current;\n";
    }

    // Avoid drawing many "part" edges for multiple target fragments; aggregate counts instead.
    const targetResources = {
      ...this.getMEITargets(),
      ...this.getAudioTargets(),
    };
    const targetResourcePredFragments = {};

    // Determine node id
    const id = obj["@id"] ? obj["@id"] : "blank_" + blankCounter++;

    // Literal node: draw rectangle with value and return
    const literalValue = obj["@value"] ?? obj[NS.rdf("value")];
    if (literalValue !== undefined) {
      let val = literalValue;
      if (typeof val === "string" && val.length > 50) {
        val = val.substring(0, 50) + "...";
      }
      visgraph = `${id}["${val}"];`;
      return visgraph;
    }

    // Resource node: stadium shape with type/label
    if (obj.hasOwnProperty("@type")) {
      visgraph += `${id}("${this.labelify(obj["@type"][0])}`; // TODO consider multiple types
    }
    if (obj.hasOwnProperty(NS.rdfs("label"))) {
      const lab = obj[NS.rdfs("label")][0]; // TODO consider multiple labels
      if (typeof lab === "string") visgraph += `( ${lab})`;
      else if (typeof lab === "object" && "@value" in lab)
        visgraph += `: <em>${lab["@value"]}</em>`;
    }
    visgraph += '");';

    // Draw predicate edges
    for (const pred of relevant.predicates) {
      if (!obj.hasOwnProperty(pred)) continue;

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
          visgraph += `${id} -- ${this.labelify(pred)} --> ${target["@id"]};`;
          visgraph += this.visualise(
            this.registry[target["@id"]].expanded,
            false,
            relevant,
            blankCounter
          );
        } else {
          let targetId;
          if ("@id" in target) {
            targetId = target["@id"];
          } else {
            targetId = "blank_" + blankCounter++;
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
          let classCommand = null;
          if (isTextualBody && typeof textualValue === "string") {
            const raw = textualValue;
            let clipped = raw;
            if (raw.length > textLabelSoftLimit) {
              const slice = raw.slice(
                textLabelSoftLimit,
                textLabelHardLimit + 1
              );
              const firstBoundary = slice.search(/\s/);
              if (firstBoundary !== -1) {
                clipped = raw.slice(0, textLabelSoftLimit + firstBoundary);
              } else if (raw.length > textLabelHardLimit) {
                clipped = raw.slice(0, textLabelHardLimit);
              }
            }

            const cropped = clipped.length < raw.length;
            const safeText = clipped
              .replace(/[\n\r]+/g, " ")
              .replace(/\"/g, "&quot;");
            const quotedText = `&quot;${safeText}${
              cropped ? " ..." : ""
            }&quot;`;
            targetLabel = `<em>${quotedText}</em>`;

            if (!this.textClickNodes) this.textClickNodes = new Set();
            if (!this.textClickNodes.has(targetId)) {
              this.textClickNodes.add(targetId);
              clickCommand = `click ${targetId} "#a-text-content" "View textual body";`;
              classCommand = `class ${targetId} clickable;`;
            }
          }

          visgraph += `${id} -- ${this.labelify(
            pred
          )} --> ${targetId}("${targetLabel}");`;
          if (clickCommand) {
            visgraph += `\n ${clickCommand}`;
          }
          if (classCommand) {
            visgraph += `\n ${classCommand}`;
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
          visgraph += `${id} -- ${this.labelify(pred)} (${numFrag}`;
          visgraph += numFrag > 1 ? ` ${fragWord}s)` : ` ${fragWord})`;
          visgraph += ` --> ${this.labelify(target)};`;
        }
      }
    }
    return visgraph;
  }
}
