import NS from "./namespaceManager.js";
import LDObj from "./LDObj.js";
import Graph from "./graph.js";
import { requestAsJsonLd } from "./httpUtil.js";

const MAX_CONCURRENT_REQUESTS = 5;
const MAX_TARGETS = 100;
const REQUEST_TIMEOUT_MS = 30000;

// Class: Traverser
// Description: A class to manage HTTP traversals of the graph
export default class Traverser {
  static init() {
    // track the number of current traversals
    // initialise to -1 to indicate no traversals have started
    // a value of 0 indicates all traversals are complete
    this.numTraversals = -1;
    this.completed = false;
    this.completionEvent = new Event("traversalsComplete");
    console.log("after init, numTraversals: ", this.numTraversals);
  }

  static finishedOne() {
    // mark that one traversal round, i.e. a full fetchAndRegister cycle, is finished
    this.numTraversals--;
    this.checkFinished();
  }

  static checkFinished() {
    // check if all traversals are finished
    if (this.numTraversals <= 0 && !this.completed) {
      // emit event to indicate all traversals are complete
      console.log("All traversals complete");
      this.completed = true;
      document.dispatchEvent(this.completionEvent);
    }
  }

  static async fetchAndRegister(urls = []) {
    console.log("fetchAndRegister called with urls: ", urls);

    // Deduplicate and cap total targets to avoid DoS via huge OBJ references
    const seen = new Set();
    const uniqueUrls = [];
    for (const url of urls) {
      if (!seen.has(url.href)) {
        seen.add(url.href);
        uniqueUrls.push(url);
      }
    }
    if (uniqueUrls.length > MAX_TARGETS) {
      console.warn(
        `Too many targets (${uniqueUrls.length}); truncating to ${MAX_TARGETS}`
      );
      uniqueUrls.length = MAX_TARGETS;
    }

    // Initialise traversal counter
    if (uniqueUrls.length > 0) {
      this.numTraversals =
        this.numTraversals < 0
          ? uniqueUrls.length
          : this.numTraversals + uniqueUrls.length;
    } else {
      // Nothing to do; ensure completion is signaled
      this.checkFinished();
    }

    let index = 0;
    const worker = async () => {
      while (index < uniqueUrls.length) {
        const currentIndex = index++;
        const url = uniqueUrls[currentIndex];
        console.log(
          "Fetching:",
          url.href,
          `(traversals: ${this.numTraversals}, remaining: ${
            uniqueUrls.length - currentIndex
          })`
        );
        try {
          const data = await requestAsJsonLd(url, REQUEST_TIMEOUT_MS);
          if (!data) {
            console.warn("No data returned for", url.href);
            continue;
          }
          const obj = new LDObj(data);
          await obj.prepare();
          Graph.register(obj, url);
        } catch (error) {
          console.error("Traversal failed for", url.href, error);
        } finally {
          this.finishedOne();
        }
      }
    };

    const workerCount = Math.min(MAX_CONCURRENT_REQUESTS, uniqueUrls.length);
    if (workerCount > 0) {
      const workers = Array.from({ length: workerCount }, () => worker());
      await Promise.all(workers);
    } else {
      // No URLs to process; mark completion immediately
      this.checkFinished();
    }

    // In case no worker triggered completion (e.g., empty list), double-check
    this.checkFinished();
  }
}
