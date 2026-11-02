// A fresh browser context whose external requests are answered from a HAR archive, offline:
// a request the archive does not hold is aborted, so new requests show up as differences.
import { externalUrls, routeFixtures } from "./capture.js";
import { harPath } from "./roots.js";

export async function replayPage(browser, baseURL, set) {
  const context = await browser.newContext({ baseURL });
  await context.routeFromHAR(harPath(set), { url: externalUrls, notFound: "abort" });
  if (set === "fixtures") await routeFixtures(context, baseURL);
  const page = await context.newPage();
  return { context, page };
}
