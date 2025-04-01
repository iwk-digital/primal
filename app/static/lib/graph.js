import NS from "./namespaceManager.js";
import { relevantVis } from "./defaults.js";

export default class Graph {
  static init(relevantVis = relevantVis) {
    this.relevantVis = relevantVis;
    this.registry = {}; // registry of retrieved Linked Data objects
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
      console.log("object already registered: ", uri);
    }
    console.log("Registry now: ", this.registry);
  }

  static getGraph() {
    // make a JSON structure of all registered object's 'expanded' properties
    const graph = {};
    Object.keys(this.registry).forEach((key) => {
      graph[key] = this.registry[key].expanded;
    });
    return graph;
  }

  static getMEITargets() {
    // return a list of all MEI targets in the graph
    const meiTargets = {};
    console.log(
      "GetMEITargets called with registry : ",
      Object.keys(this.registry)
    );
    Object.keys(this.registry).forEach((key) => {
      const obj = this.registry[key];
      console.log("Considering object: ", obj, " with key: ", key);
      if (obj.hasOwnProperty("targets")) {
        const targets = obj.getMEITargets();
        console.log("Working with targets: ", targets);
        targets.forEach((target) => {
          if (target.url in meiTargets) {
            console.log("About to add fragments: ", target.fragments);
            target.fragments.forEach((fragment) => {
              console.log("Adding fragment", fragment);
              meiTargets[target.url].add(fragment);
            });
          } else {
            console.log("Adding new fragments: ", target.fragments);
            meiTargets[target.url] = target.fragments;
          }
        });
      }
    });
    return meiTargets;
  }

  static getTextualBodies() {
    // return a list of all textual bodies in the graph
    const textualBodies = [];
    Object.keys(this.registry).forEach((key) => {
      const obj = this.registry[key];
      if (obj.hasOwnProperty("expanded")) {
        const bodies = obj.getTextualBodies();
        bodies.forEach((body) => {
          textualBodies.push(body);
        });
      }
    });
    return textualBodies;
  }

  static labelify(str) {
    // if the string is prefixed with a namespace, return the local name
    // otherwise, return the string without the protocol prefix (to help Mermaid)
    console.log("attempting to label ", str);
    let label = str;
    Object.keys(NS.nsMap).forEach((key) => {
      if (str.startsWith(NS.nsMap[key])) {
        label = str.replace(NS.nsMap[key], key + ":");
        console.log("labelified ", str, " to ", label);
      }
    });
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
    console.log("Registery before visualise: ", this.registry);
    console.log(
      "visualise called with: ",
      obj,
      current,
      relevant,
      blankCounter
    );
    let visgraph = "";
    if (current) {
      visgraph += "class " + obj["@id"] + " current;\n";
    }
    // if the object has a "@id" property, use it as the node ID
    // otherwise, use a blank node ID by concatenating "blank" with the blankCounter
    // and increment the blankCounter
    const id = obj["@id"] ? obj["@id"] : "blank_" + blankCounter++;
    // If the current object has a @value property, draw it as a rectangle node with the @value as label and return.
    if (obj.hasOwnProperty("@value")) {
      visgraph = `${id}["${obj["@value"]}"];`;
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
            if (
              //target.hasOwnProperty("@type") &&
              //relevant.types.includes(target["@type"])
              target["@id"] in this.registry
            ) {
              console.log("Target in registry: ", target);
              visgraph +=
                `${id} -- ${this.labelify(pred)} --> ${target["@id"]};` +
                `${this.visualise(
                  // if the target is in the registry, use it
                  // otherwise, use the sub-object
                  target["@id"] in this.registry
                    ? this.registry[target["@id"]].expanded
                    : target,
                  false,
                  relevant,
                  blankCounter
                )};`;
            } else {
              console.log("Target not in registry: ", target);
              const targetId = target["@id"]
                ? target["@id"]
                : "blank_" + blankCounter++;
              visgraph += `${id} -- ${this.labelify(
                pred
              )} --> ${targetId}("${this.labelify(targetId)}");`;
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
    console.log("drawGraph: ", objectsToDraw);
    let g = "graph TD;\n";
    for (const obj of objectsToDraw) {
      g += this.visualise(obj);
    }
    console.log(g);
    return g;
  }
}
