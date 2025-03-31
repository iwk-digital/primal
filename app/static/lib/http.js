import NS from "./namespaceManager.js";

export async function requestAsJsonLd(url) {
  return fetch(url).then((response) => response.json());
}

export async function fetchTextData(url) {
  console.log("fetchTextData called with url: ", url);
  return fetch(url)
    .then((response) => {
      if (response.ok) {
        return response.text();
      } else {
        throw new Error("Network response was not ok");
      }
    })
    .catch((error) => {
      console.error("Error fetching MEI:", error);
    });
}

export async function getContentType(url) {
  return fetch(url, { method: "HEAD" })
    .then((response) => {
      if (response.ok) {
        const contentType = response.headers.get("Content-Type");
        // split contentType string and strip spaces:
        let types = contentType.split(";").map((type) => type.trim());
        return types[0];
      } else {
        throw new Error("Network response was not ok");
      }
    })
    .catch((error) => {
      console.error("Error fetching content type:", error);
    });
}

export function getTraversalPredicatesForType(type) {
  // return the list of predicates to traverse *from* a given type
  switch (type) {
    case NS.oa("Annotation"):
      return [NS.oa("hasTarget")];
    case NS.mao("MusicalMaterial"):
      return [NS.mao("setting")];
    case NS.mao("Extract"):
      return [NS.frbr("embodiment")];
    case NS.mao("Selection"):
      return [NS.frbr("part")];
    default:
      console.warn("No traversal predicate for type: ", type);
      return [];
  }
}
