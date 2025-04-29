import ns from "./namespaceManager.js";
import V from "./graph.js";
import Traverser from "./traverser.js";
import { defaultContext } from "./defaults.js";
import { getContentType, getTraversalPredicatesForType } from "./http.js";
// Class: LODObj
// Description: A class to parse and work with (MAO-flavoured) Web Annotation data
export default class LDObj {
  constructor(retrieved) {
    this.raw = retrieved;
    // the following Urls are stored as associative arrays
    // each key is a URL, and the value is a Javascript Set of fragments
    // that are associated with that URL and targeted by the annotation
    this.targets = {};
  }

  async prepare() {
    try {
      let expanded = await jsonld.expand(this.raw);
      this.expanded = expanded[0];
      let context;
      if (this.raw.hasOwnProperty("@context")) {
        context = { ...this.raw["@context"], ...defaultContext };
      } else {
        context = defaultContext; // OA, MAO, FRBR and friends
      }
      console.log("Compacting with context: ", context);
      this.compacted = await jsonld.compact(this.expanded, context);
      this.validate();
      await this.processTargets();
      console.log("Processed targets! Object: ", this);
      return this;
    } catch (err) {
      console.error("Failed to prepare LD object");
      throw new Error(err);
    }
  }

  // validate the object
  validate() {
    if (this.isOA()) {
      if (!this.hasTarget()) {
        throw new Error("OA object must have at least one target");
      }
    } else if (
      !(
        this.isMAOMusicalMaterial() ||
        this.isMAOExtract() ||
        this.isMAOSelection()
      )
    ) {
      throw new Error("Object must be an OA or MAO object");
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

  isMAOMusicalMaterial() {
    // check whether object has MAO Musical Material type
    return (
      this.expanded.hasOwnProperty("@type") &&
      this.expanded["@type"].includes(ns.mao("MusicalMaterial"))
    );
  }

  isMAOExtract() {
    // check whether object has MAO Extract type
    return (
      this.expanded.hasOwnProperty("@type") &&
      this.expanded["@type"].includes(ns.mao("Extract"))
    );
  }

  isMAOSelection() {
    // check whether object has MAO Selection type
    return (
      this.expanded.hasOwnProperty("@type") &&
      this.expanded["@type"].includes(ns.mao("Selection"))
    );
  }

  // check if object has at least one target
  hasTarget() {
    return (
      this.expanded.hasOwnProperty(ns.oa("hasTarget")) &&
      this.expanded[ns.oa("hasTarget")].length > 0
    );
  }

  // process targets:
  // record MEI file URL of targets that look like MEI file fragments
  // record audio file URL of targets that look like audio file fragments
  async processTargets() {
    console.log("Process targets called");
    let traversalPredicates = [];
    if (this.expanded.hasOwnProperty("@type")) {
      // get the traversal predicates for this type
      const travP = new Set();
      for (const type of this.expanded["@type"]) {
        let predicates = getTraversalPredicatesForType(type);
        for (const predicate of predicates) {
          travP.add(predicate);
        }
      }
      traversalPredicates.push(...Array.from(travP));
    }
    let toTraverse = []; // array of target URLs to traverse

    // Use a for...of loop to handle asynchronous operations properly
    for (const predicate of traversalPredicates) {
      if (this.expanded.hasOwnProperty(predicate)) {
        if (this.expanded[predicate].length > 0) {
          for (const target of this.expanded[predicate]) {
            console.log("Processing target: ", target);
            if (target["@id"]) {
              const url = new URL(target["@id"]);
              if (url.protocol === "http:" || url.protocol === "https:") {
                // strip the URL of any fragment
                const strippedUrl = url.origin + url.pathname;
                if (strippedUrl.endsWith(".mei")) {
                  // MEI target: note the URL and fragment, no traversal
                  if (!this.targets[strippedUrl]) {
                    this.targets[strippedUrl] = {
                      type: "MEI",
                      fragments: new Set(),
                    };
                  }
                  // add the fragment to the set of fragments for this URL
                  this.targets[strippedUrl].fragments.add(
                    url.hash.substring(1)
                  );
                } else {
                  // check target's contenttype
                  const contentType = await getContentType(strippedUrl); // Properly await here
                  if (contentType === "application/ld+json") {
                    // if target is a JSON-LD file, mark it for traversal
                    toTraverse.push(new URL(strippedUrl));
                  }
                }
              }
            }
          }
        }
      }
    }

    // traverse the targets
    if (toTraverse.length > 0) {
      // fetch and register the targets
      await Traverser.fetchAndRegister(toTraverse);
    }
    // now we are finished with this object
    Traverser.finishedOne();
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

  getTextualBodies() {
    if (this.hasTextualBody()) {
      return this.expanded[ns.oa("hasBody")].filter((body) =>
        body["@type"].includes(ns.oa("TextualBody"))
      );
    }
    return [];
  }

  getMEITargets() {
    // return the MEI targets
    const t = Object.keys(this.targets).filter((key) => {
      return this.targets[key].type === "MEI";
    });
    let meiTargets = [];
    for (const key of t) {
      meiTargets.push({
        url: key,
        fragments: this.targets[key].fragments,
      });
    }
    return meiTargets;
  }
}
