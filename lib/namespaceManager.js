import defaultNsMap from "./namespaceMap.js";

console.log("nsMap in namespaceManager.js: ", defaultNsMap);
/**
 * Class for managing namespaces
 * @param {Object} nsMap - object containing namespace prefixes and URIs
 */
export default class NamespaceManager {
  static init(nsMap = defaultNsMap) {
    this.initialized = true;
    this.nsMap = nsMap;
    for (const prefix in this.nsMap) {
      if (this.hasOwnProperty(prefix)) {
        throw new Error(`Namespace ${prefix} clashes with existing property`);
      }
      this[prefix] = this.nsFunc(prefix);
    }
  }

  /**
   * Create namespace functions
   * @param {string} ns - namespace prefix
   * @returns {Function}
   */
  static nsFunc(ns) {
    return function (str) {
      return this.nsMap[ns] + str;
    };
  }
}
