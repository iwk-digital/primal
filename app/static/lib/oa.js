import ns from "./namespaceManager.js";
import V from "./visualiser.js";

// Class: oa
// Description: A class to parse and work with (MAO-flavoured) Web Annotation data
export default class OA {
  constructor(retrieved) {
    // expand the object using jsonld, then store the raw and expanded objects and validate
    jsonld.expand(retrieved, (err, expanded) => {
      if (err) {
        // invalid JSON-LD object
        throw new Error(err);
      }
      this.raw = retrieved;
      this.obj = expanded[0];
      this.validate();
      this.visualiser = new V();
      this.vis = this.visualiser.visualise(this.obj);
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
      this.obj.hasOwnProperty("@type") &&
      this.obj["@type"].includes(ns.oa("Annotation"))
    );
  }

  // check if object has at least one target
  hasTarget() {
    return (
      this.obj.hasOwnProperty(ns.oa("hasTarget")) &&
      this.obj[ns.oa("hasTarget")].length > 0
    );
  }

  // check if object has at least one body
  hasBody() {
    return (
      this.obj.hasOwnProperty(ns.oa("hasBody")) &&
      this.obj[ns.oa("hasBody")].length > 0
    );
  }

  // check if object has at least one textual body
  hasTextualBody() {
    return (
      this.hasBody() &&
      this.obj[ns.oa("hasBody")].some((body) =>
        body["@type"].includes(ns.oa("TextualBody"))
      )
    );
  }
}
