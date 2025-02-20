import ns from "./namespaceManager.js";
import V from "./visualiser.js";

// Class: oa
// Description: A class to parse and work with (MAO-flavoured) Web Annotation data
export default class OA {
  constructor(retrieved) {
    // expand the object using jsonld, then store the raw and expanded objects and validate
    this.raw = retrieved;
  }

  async prepare() {
    return jsonld.expand(this.raw).then((expanded, err) => {
      if (err) {
        // invalid JSON-LD object
        console.error("Failed to expand JSON-LD object");
        throw new Error(err);
      }
      console.log("Expanded object: ", expanded);
      this.expanded = expanded[0];
      console.log("Validating...");
      this.validate();
      console.log("Visualising...");
      V.visualise(this.expanded);
      return this;
    });
  }

  // validate the object
  validate() {
    if (!this.isOA()) {
      throw new Error("Invalid OA object");
    }
    if (!this.hasTarget()) {
      throw new Error("OA object must have at least one target");
    }
  }

  // check is object contains correct type for OA
  isOA() {
    // ensure object has OA type and at least one target
    return (
      this.expanded.hasOwnProperty("@type") &&
      this.expanded["@type"].includes(ns.oa("Annotation"))
    );
  }

  // check if object has at least one target
  hasTarget() {
    return (
      this.expanded.hasOwnProperty(ns.oa("hasTarget")) &&
      this.expanded[ns.oa("hasTarget")].length > 0
    );
  }

  // check if object has at least one body
  hasBody() {
    return (
      this.expanded.hasOwnProperty(ns.oa("hasBody")) &&
      this.expanded[ns.oa("hasBody")].length > 0
    );
  }

  // check if object has at least one textual body
  hasTextualBody() {
    return (
      this.hasBody() &&
      this.expanded[ns.oa("hasBody")].some((body) =>
        body["@type"].includes(ns.oa("TextualBody"))
      )
    );
  }
}
