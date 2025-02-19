import nsMap from "./namespaceMap.js";

// enumerate all namespaces
// export them as an object with functions, one per namespace
// functions are named after prefix, take a string and return a full URI

/**
 * Class for managing namespaces
 * @param {Object} nsMap - object containing namespace prefixes and URIs
 */
export default class NamespaceManager {
  static init(nsMap = nsMap) {
    for (const prefix in nsMap) {
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
      return nsMap[ns] + str;
    };
  }
}
