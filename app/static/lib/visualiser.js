import NS from "./namespaceManager.js";
import { relevantVis } from "./defaults.js";

export default class Visualiser {
  static init(ns = NS, relevant = relevantVis) {
    this.ns = ns;
    this.relevant = relevant;
  }

  static labelify(str) {
    // if the string is prefixed with a namespace, return the local name
    // otherwise, return the string without the protocol prefix (to help Mermaid)
    console.log("attempting to label ", str);
    let label = str;
    Object.keys(this.ns.nsMap).forEach((key) => {
      if (str.startsWith(this.ns.nsMap[key])) {
        label = str.replace(this.ns.nsMap[key], key + ":");
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
   * @param {Object} relevant - object containing relevant types and predicates
   * @param {number} blankCounter - counter for blank node IDs
   * @returns {string}
   */
  static visualise(obj, relevant = relevantVis, blankCounter = 0) {
    let visgraph = "";
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
      visgraph += `${id}("${this.labelify(obj["@type"][0])}`; // TODO consider multiple types
      if (obj.hasOwnProperty(this.ns.rdfs("label"))) {
        visgraph += `(${obj[this.ns.rdfs("label")][0]})`;
      }
      visgraph += '");';
      // draw all relevant predicates as arrows to other objects
      // calling visualise recursively on those objects, if their type is relevant
      // otherwise, draw them as a stadium shape node, labeled with their '@id" if present
      for (const pred of relevant.predicates) {
        if (obj.hasOwnProperty(pred)) {
          for (const target of obj[pred]) {
            if (
              target.hasOwnProperty("@type") &&
              relevant.types.includes(target["@type"])
            ) {
              "Target 1: ", target;
              visgraph += `${id} -- ${this.labelify(pred)} --> ${this.visualise(
                target,
                relevant,
                blankCounter
              )};`;
            } else {
              console.log("Target: ", target);
              const targetId = target["@id"]
                ? target["@id"]
                : "blank_" + blankCounter++;
              visgraph += `${id} -- ${this.labelify(
                pred
              )} --> ${targetId}("${this.labelify(target["@id"])}");`;
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
