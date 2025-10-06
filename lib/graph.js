import NS from "./namespaceManager.js";
import { relevantVis } from "./defaults.js";

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
    console.debug("Registry now: ", this.registry);
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
    console.debug("Graph: ", graph);
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
    for (const key in this.registry) {
      const obj = this.registry[key];
      if (obj.hasOwnProperty("expanded")) {
        const bodies = obj.getTextualBodies();
        for (const body of bodies) {
          textualBodies.push(body);
        }
      }
    }
    return textualBodies;
  }

  static async getAudioSelections() {
    // return a list of all mao:Selection objects that point to audio files
    const audioSelections = [];
    const { requestAsJsonLd } = await import("./httpUtil.js");
    const LDObj = (await import("./LDObj.js")).default;

    for (const key in this.registry) {
      const obj = this.registry[key];
      if (
        obj.hasOwnProperty("expanded") &&
        obj.isMAOSelection &&
        obj.isMAOSelection()
      ) {
        console.log("Processing mao:Selection:", key, obj.expanded);
        // Check if this selection has audio targets by looking at frbr:part
        const parts = obj.expanded[NS.frbr("part")] || [];
        console.log("Found parts:", parts);
        for (const part of parts) {
          console.log("Processing part:", part);
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

              // Try to get track information from the signal
              if (timelineId in this.registry) {
                const signalObj = this.registry[timelineId];
                console.log("Found signal object for", timelineId, signalObj);
                if (
                  signalObj.expanded &&
                  signalObj.expanded[NS.mo("published_as")]
                ) {
                  const trackId =
                    signalObj.expanded[NS.mo("published_as")][0]["@id"];
                  selection.trackId = trackId;
                  console.log("Found trackId:", trackId);

                  // Try to get track details from registry
                  if (trackId in this.registry) {
                    const trackObj = this.registry[trackId];
                    console.log("Found track object:", trackObj);
                    if (trackObj.expanded) {
                      // Get track label
                      if (trackObj.expanded[NS.rdfs("label")]) {
                        selection.trackLabel =
                          trackObj.expanded[NS.rdfs("label")][0]["@value"];
                        console.log("Found track label:", selection.trackLabel);
                      }
                      // Get MusicBrainz ID
                      if (trackObj.expanded[NS.mo("musicbrainz")]) {
                        selection.musicbrainzId =
                          trackObj.expanded[NS.mo("musicbrainz")][0]["@id"];
                        console.log(
                          "Found MusicBrainz ID:",
                          selection.musicbrainzId
                        );
                      }
                    }
                  } else {
                    console.log(
                      "Track not found in registry, attempting to fetch:",
                      trackId
                    );
                    // Try to fetch the track collection
                    try {
                      const baseTrackUrl = trackId.split("#")[0];
                      console.log(
                        "Fetching track collection from:",
                        baseTrackUrl
                      );

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
                          console.log("Found track in collection:", trackItem);

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
                        debug("No published_as property found in signal");
                      }
                    } else {
                      debug("Signal not found in collection");
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
    // we want to avoid drawing a huge amount of "part" relationships when the same
    // resource has many target fragments
    // so, we only draw one "part" relationship per resource, and include the number of fragments in the label
    const targetResources = {
      ...this.getMEITargets(),
      ...this.getAudioTargets(),
    };
    const targetResourcePredFragments = {};

    // if the object has a "@id" property, use it as the node ID
    // otherwise, use a blank node ID by concatenating "blank" with the blankCounter
    // and increment the blankCounter
    const id = obj["@id"] ? obj["@id"] : "blank_" + blankCounter++;
    // If the current object has a @value property, draw it as a rectangle node with the @value as label and return.
    console.log("Visualising object: ", id, obj);
    if (obj.hasOwnProperty("@value") || obj.hasOwnProperty(NS.rdf("value"))) {
      let val = obj.hasOwnProperty("@value")
        ? obj["@value"]
        : obj[NS.rdf("value")];
      if (val && val.length > 0 && val.length > 50) {
        // if the value is too long, truncate it and add an ellipsis
        val = val.substring(0, 50) + "...";
      }
      visgraph = `${id}["${obj["@value"]}];`;
    } else {
      // Otherwise draw the current object as a stadium shape node
      // label it using the object's type
      // if the object has a ns.rdfs("label"), add it as a sublabel in parentheses
      if (obj.hasOwnProperty("@type")) {
        visgraph += `${id}("${this.labelify(obj["@type"][0])}`; // TODO consider multiple types
      }
      if (obj.hasOwnProperty(NS.rdfs("label"))) {
        let lab = obj[NS.rdfs("label")][0]; // TODO consider multiple labels
        if (typeof lab === "string") visgraph += `( ${lab})`;
        else if (typeof lab === "object" && "@value" in lab)
          visgraph += `: <em>${lab["@value"]}</em>`;
      }
      visgraph += '");';
      // draw all relevant predicates as arrows to other objects
      // calling visualise recursively on those objects, if their type is relevant
      // otherwise, draw them as a stadium shape node, labeled with their '@id" if present
      for (const pred of relevant.predicates) {
        if (obj.hasOwnProperty(pred)) {
          for (const target of obj[pred]) {
            // skip if target's resource is in targetResources
            // (they are handled separately later)
            const matches = Object.keys(targetResources).filter((t) => {
              if ("@id" in target && target["@id"].startsWith(t)) {
                if (pred in targetResourcePredFragments) {
                  targetResourcePredFragments[pred][t] =
                    targetResources[t].type === "Audio"
                      ? targetResources[t].fragments.size
                      : targetResources[t].size;
                } else {
                  targetResourcePredFragments[pred] = {};
                  targetResourcePredFragments[pred][t] =
                    targetResources[t].type === "Audio"
                      ? targetResources[t].fragments.size
                      : targetResources[t].size;
                }
                return true;
              }
            });
            if (matches.length) {
              break;
            }
            if (
              //target.hasOwnProperty("@type") &&
              //relevant.types.includes(target["@type"])
              target["@id"] in this.registry
            ) {
              visgraph +=
                `${id} -- ${this.labelify(pred)} --> ${target["@id"]};` +
                `${this.visualise(
                  // if the target is in the registry, use it
                  // otherwise, use the sub-object
                  this.registry[target["@id"]].expanded,
                  false,
                  relevant,
                  blankCounter
                )};`;
            } else {
              let targetId;
              if (target.hasOwnProperty("@id")) {
                targetId = target["@id"];
              } else {
                targetId = "blank_" + blankCounter++;
                this.registerBlank(obj["@id"], targetId);
              }
              visgraph += `${id} -- ${this.labelify(
                pred
              )} --> ${targetId}("${this.labelify(targetId)}");`;
            }
          }
        }
      }
      // draw the targetResourcePredFragments, one arrow per ?s ?p ?o, label with the number of fragments
      for (const pred in targetResourcePredFragments) {
        for (const target in targetResourcePredFragments[pred]) {
          let numFrag;
          let fragWord = "fragment";
          if (targetResources[target].type === "Audio") {
            numFrag = 1; // FIXME: targetResources[target].fragments.size;
            fragWord = "time interval";
          } else {
            numFrag = targetResources[target].size;
          }
          visgraph += `${id} -- ${this.labelify(pred) + " (" + numFrag}`;
          visgraph += numFrag > 1 ? ` ${fragWord}s)` : ` ${fragWord})`;
          visgraph += ` --> ${this.labelify(target)};`;
        }
      }
    }
    return visgraph;
  }

  /**
   * Draw a Mermaid graph of the objects passed in
   * @param  {...Object} objectsToDraw - objects to draw in the graph
   * @returns {string}
   */
  static drawGraph(...objectsToDraw) {
    let g = "graph TD;\n";
    for (const obj of objectsToDraw) {
      g += this.visualise(obj);
    }
    console.debug(g);
    return g;
  }
}
