export function requestAsJsonLd(url, success, failure) {
  fetch(url)
    .then((response) => response.json())
    .then((data) => {
      success(data);
    })
    .catch((error) => {
      failure(error);
    });
}
