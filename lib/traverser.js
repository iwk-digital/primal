import NS from "./namespaceManager.js";
import LDObj from "./LDObj.js";
import Graph from "./graph.js";
import { requestAsJsonLd } from "./httpUtil.js";

const DEBUG = false;

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
    if (DEBUG) console.log("after init, numTraversals: ", this.numTraversals);
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
      if (DEBUG) console.log("All traversals complete");
      this.completed = true;
      document.dispatchEvent(this.completionEvent);
    }
  }

  static async fetchAndRegister(urls = []) {
    if (DEBUG) console.log("fetchAndRegister called with urls: ", urls);

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
        if (DEBUG) {
          console.log(
            "Fetching:",
            url.href,
            `(traversals: ${this.numTraversals}, remaining: ${
              uniqueUrls.length - currentIndex
            })`
          );
        }
        try {
          const data = await requestAsJsonLd(url, REQUEST_TIMEOUT_MS);
          if (!data) {
            console.warn("No data returned for", url.href);
            continue;
          }

          // Normalize JSON-LD responses that may return arrays or @graph
          const nodes = Array.isArray(data)
            ? data
            : data && data["@graph"] && Array.isArray(data["@graph"])
            ? data["@graph"]
            : [data];

          const topContext = data && data["@context"];

          const primary =
            nodes.find((item) => item && item["@id"] === url.href) ||
            nodes.find(
              (item) =>
                item &&
                item["@type"] &&
                item["@type"].includes(NS.oa("Annotation"))
            ) ||
            nodes[0];

          if (!primary) {
            console.warn("No suitable JSON-LD node found for", url.href);
            continue;
          }

          const registerNode = async (node, extraKey = null) => {
            let normalized = node;
            if (topContext && !node["@context"]) {
              normalized = { ...node, ["@context"]: topContext };
            }
            const obj = new LDObj(normalized);
            await obj.prepare();
            const expandedId = obj.expanded && obj.expanded["@id"];

            const keys = new Set();
            if (extraKey) keys.add(extraKey);
            if (normalized["@id"]) keys.add(normalized["@id"]);
            if (expandedId) keys.add(expandedId);

            keys.forEach((k) => Graph.register(obj, k));
          };

          // Register primary under request URL and its ids
          await registerNode(primary, url.href);

          // Register remaining nodes under their ids
          for (const node of nodes) {
            if (node === primary) continue;
            await registerNode(node);
          }
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
