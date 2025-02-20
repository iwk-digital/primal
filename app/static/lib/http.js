export function requestAsJsonLd(url) {
  return fetch(url).then((response) => response.json());
}
