import NS from "./namespaceManager.js";

export async function requestAsJsonLd(url) {
  let response = await fetch(url);
  return await response.json();
}

export async function fetchTextData(url) {
  console.debug("fetchTextData called with url: ", url);
  try {
    let response = await fetch(url);
    if (response.ok) {
      return response.text();
    } else {
      throw new Error("Network response was not ok");
    }
  } catch (error) {
    console.error("Error fetching MEI:", error);
  }
}

export async function getContentType(url) {
  try {
    let response = await fetch(url, { method: "HEAD" });
    if (response.ok) {
      const contentType = response.headers.get("Content-Type");
      // split contentType string and strip spaces:
      let types = contentType.split(";");
      let trimmed = [];
      for (const t of types) {
        trimmed.push(t.trim());
      }
      return trimmed[0];
    } else {
      throw new Error("Network response was not ok");
    }
  } catch (error) {
    console.error("Error fetching content type:", error);
  }
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
