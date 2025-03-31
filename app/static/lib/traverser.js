import NS from "./namespaceManager.js";
import LDObj from "./LDObj.js";
import Graph from "./graph.js";
import { requestAsJsonLd } from "./http.js";

// Class: Traverser
// Description: A class to manage HTTP traversals of the graph
export default class Traverser {
  static init() {
    // track the number of current traversals
    // initialise to -1 to indicate no traversals have started
    // a value of 0 indicates all traversals are complete
    this.numTraversals = -1;
    this.completionEvent = new Event("traversalsComplete");
    console.log("after init, numTraversals: ", this.numTraversals);
  }

  static async fetchAndRegister(urls = []) {
    console.log("fetchAndRegister called with urls: ", urls);
    console.log("numTraversals before: ", this.numTraversals);
    urls.forEach(async (url) => {
      // fetch the object from the URL
      // and register it in the registry
      this.numTraversals = this.numTraversals < 0 ? 1 : this.numTraversals + 1;
      console.log(
        "Fetching: ",
        url.href,
        " (traversals: ",
        this.numTraversals,
        ")"
      );
      const data = await requestAsJsonLd(url);
      const obj = new LDObj(data);
      console.log("Fetched object: ", obj);
      console.log("Based on data ", data);
      await obj.prepare();
      Graph.register(obj, url);
      this.numTraversals--;
      console.log("Traversals remaining: ", this.numTraversals);
      if (this.numTraversals === 0) {
        // emit event to indicate all traversals are complete
        document.dispatchEvent(this.completionEvent);
        console.log("All traversals complete");
      }
    });
  }
}
