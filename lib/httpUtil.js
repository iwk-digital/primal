import NS from "./namespaceManager.js";

export async function checkUrlAccessible(url) {
  // check if a URL is accessible
  // by making a HEAD request
  // and checking the response status
  try {
    let response = await fetch(url, { method: "HEAD" });
    if (response.ok) {
      return true;
    } else {
      console.error("URL not accessible:", response.statusText);
      return false;
    }
  } catch (error) {
    console.error("Error checking URL:", error);
    return false;
  }
}

export async function requestAsJsonLd(url) {
  // fetch a URL, requesting JSON-LD
  // follow any redirects
  // and return the JSON content of the response

  console.debug("requestAsJsonLd called with url: ", url);
  let headers = new Headers();
  headers.append("Accept", "application/ld+json");
  let options = {
    method: "GET",
    headers: headers,
    redirect: "follow",
  };
  let response = await fetch(url, options);
  if (response.ok) {
    try {
      return response.json();
    } catch (error) {
      console.warn(
        "Could not parse JSON-LD from response. Response was: ",
        response,
        error
      );
      return null;
    }
  } else {
    console.error("Error fetching JSON-LD:", response.statusText);
  }
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

export async function isAudio(url) {
  // check if the URL is an audio file
  // by checking content type
  // or by checking the file extension
  let isAudio = false;
  let type = await getContentType(url);
  if (type === "audio/mpeg" || type === "audio/wav" || type === "audio/ogg") {
    isAudio = true;
  } else {
    // check file extension
    let ext = url.split(".").pop();
    if (ext === "mp3" || ext === "wav" || ext === "ogg") {
      isAudio = true;
    }
  }
  return isAudio;
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
