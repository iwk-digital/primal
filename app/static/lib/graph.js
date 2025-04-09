import NS from "./namespaceManager.js";
import { relevantVis } from "./defaults.js";

export default class Graph {
  static init(relevantVis = relevantVis) {
    this.relevantVis = relevantVis;
    this.registry = {}; // registry of retrieved Linked Data objects
    this.blanks = {}; // registry of blank nodes
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
    // TODO, for now only MEI targets, should be extended to other types
    const targetResources = this.getMEITargets();
    const targetResourcePredFragments = {};

    // if the object has a "@id" property, use it as the node ID
    // otherwise, use a blank node ID by concatenating "blank" with the blankCounter
    // and increment the blankCounter
    const id = obj["@id"] ? obj["@id"] : "blank_" + blankCounter++;
    // If the current object has a @value property, draw it as a rectangle node with the @value as label and return.
    if (obj.hasOwnProperty("@value")) {
      visgraph = `${id}["${obj["@value"]};`;
    } else {
      // Otherwise draw the current object as a stadium shape node
      // label it using the object's type
      // if the object has a ns.rdfs("label"), add it as a sublabel in parentheses
      if (obj.hasOwnProperty("@type")) {
        visgraph += `${id}("${this.labelify(obj["@type"][0])}`; // TODO consider multiple types
      }
      if (obj.hasOwnProperty(NS.rdfs("label"))) {
        visgraph += `(${obj[NS.rdfs("label")][0]})`;
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
                    targetResources[t].size;
                } else {
                  targetResourcePredFragments[pred] = {};
                  targetResourcePredFragments[pred][t] =
                    targetResources[t].size;
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
          // draw the targetResourcePredFragments, one arrow per ?s ?p ?o, label with the number of fragments
          for (const pred in targetResourcePredFragments) {
            for (const target in targetResourcePredFragments[pred]) {
              const numFrag = targetResourcePredFragments[pred][target];
              visgraph += `${id} -- ${this.labelify(pred) + " (" + numFrag}`;
              visgraph += numFrag > 1 ? " fragments)" : " fragment)";
              visgraph += ` --> ${target};`;
            }
          }
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
