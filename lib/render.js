import WaveSurfer from "../deps/wavesurfer.js";
import RegionsPlugin from "../deps/regions.js";

import { checkUrlAccessible, requestAsJsonLd } from "./httpUtil.js";
import NS from "./namespaceManager.js";
import { isSafeUrl } from "./sanitize.js";
import { vrvOptions } from "./defaults.js";
import { showErrorBanner } from "./errorBanner.js";

const DEBUG = false;

let wavesurfers = {}; // store wavesurfer instances for each audio target

export async function renderAudioTargets(audioTargets) {
  for (const target of Object.keys(audioTargets)) {
    let success = false; // true if we either have access to the audio file or we have precomputed peaks
    // is the audio data accessible?
    let haveAudio = await checkUrlAccessible(target);
    if (haveAudio) {
      // Add the audio container to the DOM
      addAudioContainerToDOM(target, audioTargets[target]?.label || target);
      // Create a WaveSurfer instance
      wavesurfers[target] = {}; // reset the wavesurfer instance
      wavesurfers[target].regions = RegionsPlugin.create(); // wavesurfer regions plugin
      wavesurfers[target].ws = WaveSurfer.create({
        container: "#" + CSS.escape(target),
        waveColor: "#b4becf",
        progressColor: "#163c7a",
        url: target,
        plugins: [wavesurfers[target].regions],
        mediaControls: true,
        autoPlay: false,
      });
      // store meta we need later
      wavesurfers[target].signalId = target;
      wavesurfers[target].fragments = audioTargets[target].fragments || [];
      wavesurfers[target].regionsPopulated = false;
      success = true;
    } else {
      // can't access the target, check if we have precalculated peaks for it
      if (DEBUG)
        console.log(
          "Cannot access audio target: ",
          target,
          audioTargets[target],
        );
      // Resolve peaks URI: directly from the selection, or via the timeline
      let peaksUri = null;
      let containerId = null;
      if (audioTargets[target].peaks) {
        peaksUri = audioTargets[target].peaks;
        containerId = target;
      } else if (audioTargets[target].timeline) {
        let signalResponse = await requestAsJsonLd(
          audioTargets[target].timeline,
        );
        let signal = signalResponse.filter(
          (s) => s["@id"] == audioTargets[target].timeline,
        )[0];
        if (signal && NS.ssv("peaks") in signal) {
          peaksUri = signal[NS.ssv("peaks")][0]["@id"];
          containerId = signal["@id"];
        }
      }
      if (peaksUri) {
        // add the container to the DOM
        addAudioContainerToDOM(
          containerId,
          (audioTargets[target].label || target) + " [playback restricted]",
        );
        let peaks = await requestAsJsonLd(peaksUri);
        if (peaks) {
          // Calculate duration from peaks array using the known algorithm
          // Based on precompute_peaks.py algorithm:
          // duration = (peaks.length * segment_size) / sample_rate
          const segmentSize = 1024; // default from precompute_peaks.py
          const sampleRate = 44100; // confirmed sample rate

          if (!Array.isArray(peaks) || peaks.length === 0) {
            showErrorBanner(
              `Cannot render audio regions for "${
                audioTargets[target].label || target
              }": Invalid or empty peaks data.`,
              target,
              [
                "Check that the peaks data was generated correctly",
                "Verify the peaks file contains valid array data",
              ],
            );

            // Hide the audio container div since we can't render it properly
            const containerDiv = document.getElementById(
              containerId + "-container",
            );
            if (containerDiv) {
              containerDiv.style.display = "none";
            }

            continue; // Skip rendering this audio target
          }

          const durationToUse = (peaks.length * segmentSize) / sampleRate;
          // create a wavesurfer instance
          wavesurfers[target] = {}; // reset the wavesurfer instance
          wavesurfers[target].regions = RegionsPlugin.create(); // wavesurfer regions plugin
          wavesurfers[target].ws = WaveSurfer.create({
            container: "#" + CSS.escape(containerId),
            waveColor: "#ccc",
            progressColor: "#ccc",
            plugins: [wavesurfers[target].regions],
            mediaControls: false,
            autoPlay: false,
            peaks: peaks,
            duration: durationToUse,
            interact: false,
          });
          // store meta we need later
          wavesurfers[target].signalId = containerId;
          wavesurfers[target].fragments = audioTargets[target].fragments || [];
          wavesurfers[target].regionsPopulated = false;
          success = true;
        }
      }
    }
    if (success) {
      // Populate regions once (works for both decoded audio and peaks-only)
      const populate = () => {
        const wsObj = wavesurfers[target];
        if (!wsObj || wsObj.regionsPopulated) return;
        wsObj.regionsPopulated = true;

        (wsObj.fragments || []).forEach((fragment) => {
          // strip "t=" from the fragment ID
          const t = String(fragment).replace(/t=/, "");
          const frags = t.split(",");
          if (frags.length !== 2) {
            console.error("Invalid fragment: ", fragment);
            return;
          }
          const start = parseFloat(frags[0]);
          const end = parseFloat(frags[1]);

          const region = wsObj.regions.addRegion({
            start,
            end,
            content: "",
            color: "rgba(255, 255, 150, 0.5)",
            drag: false,
            resize: false,
          });
        });

        // Append "start–end" pairs to the label of the corresponding signal container
        appendTimesToLabel(wsObj.signalId, wsObj.fragments);
      };

      wavesurfers[target].ws.on("decode", populate);
      wavesurfers[target].ws.on("ready", populate);

      {
        let activeRegion = null;
        wavesurfers[target].regions.on("region-in", (region) => {
          activeRegion = region;
        });
        wavesurfers[target].regions.on("region-out", (region) => {
          activeRegion = null;
        });
        wavesurfers[target].regions.on("region-clicked", (region, e) => {
          e.stopPropagation(); // prevent triggering a click on the waveform
          activeRegion = region;
          region.play(true);
        });
        // Reset the active region when the user clicks anywhere in the waveform
        wavesurfers[target].ws.on("interaction", () => {
          activeRegion = null;
        });
      }
    }

    // then, create the wavesurfer instances and load the audio files
    /*
  for (const target of Object.keys(audioTargets)) {
    // create a wavesurfer instance

    let wavesurfer = await WaveSurfer.create({
      container: "#" + CSS.escape(target),
      waveColor: "#ddd",
      progressColor: "#3b82f6",
      cursorColor: "#3b82f6",
      height: 128,
      barWidth: 2,
      barHeight: 1,
      plugin: [wsRegions],
      url: target,
    });

    wavesurfer.on("click", () => {
      wavesurfer.playPause();
    });

    wavesurfer.on("ready", () => {
      wsRegions.regions.addRegion({
        start: 3,
        end: 45,
        color: "rgba(255, 0, 0, 1)",
        id: "test",
        content: "Test",
      });
    });

    /*

    // add event listener to highlight the region when clicked
    wavesurfer.on("region-click", (region, e) => {
      // remove highlight from all regions
      wsRegions.clearRegions(wavesurfer);
      // add highlight to the clicked region
      wsRegions.updateRegion(wavesurfer, region.id, {
        color: "rgba(0, 255, 0, 0.5)",
      });
    });

    // add event listener to highlight the region when the audio is played
    wavesurfer.on("play", () => {
      // remove highlight from all regions
      wsRegions.clearRegions(wavesurfer);
      // add highlight to the current region
      let currentRegion = wsRegions.getCurrentRegion(wavesurfer);
      if (currentRegion) {
        wsRegions.updateRegion(wavesurfer, currentRegion.id, {
          color: "rgba(0, 255, 0, 0.5)",
        });
      }
    });
  }
  */
  }
}

// Format seconds -> "mm:ss.ss" (rounded to nearest 10 ms)
function formatTime(seconds) {
  const totalHundredths = Math.round(Number(seconds) * 100); // 0.01s = 10ms
  if (!Number.isFinite(totalHundredths)) return "";
  const m = Math.floor(totalHundredths / 6000); // 60 * 100
  const s = Math.floor((totalHundredths % 6000) / 100);
  const hs = totalHundredths % 100;
  const mm = String(m).padStart(2, "0");
  const ss = String(s).padStart(2, "0");
  const hh = String(hs).padStart(2, "0");
  return `${mm}:${ss}.${hh}`;
}

function addAudioContainerToDOM(target, labelText = target) {
  // HACK - reduce label text to just the last part of the URL and make readable
  if (labelText.length > 50) {
    labelText = decodeURIComponent(labelText.split("/").pop());
  }
  let audioDivContainer = document.createElement("div");
  audioDivContainer.className = "audio-container";
  audioDivContainer.id = target + "-container";
  let audioDiv = document.createElement("div");
  audioDiv.className = "audio";
  audioDiv.id = target;
  audioDivContainer.appendChild(audioDiv);
  let audioLabel = document.createElement("div");
  audioLabel.className = "audio-label";
  const labelSpan = document.createElement("span");
  labelSpan.textContent = labelText;
  audioLabel.appendChild(labelSpan);
  audioDivContainer.appendChild(audioLabel);
  document.getElementById("audio-examples").appendChild(audioDivContainer);
  if (DEBUG) console.log("Added audio div: ", audioDiv);
}

// Append region times to the label span of the audio container for a given signal
function appendTimesToLabel(signalId, fragments = []) {
  try {
    const container = document.getElementById(`${signalId}-container`);
    if (!container) return;
    const span = container.querySelector(".audio-label span");
    if (!span) return;

    // Preserve original label once, then set text with appended times to avoid duplicates
    if (!span.dataset.baseLabel) {
      span.dataset.baseLabel = span.textContent || "";
    }
    const pairs = [];
    fragments.forEach((fragment) => {
      const t = String(fragment).replace(/t=/, "");
      const parts = t.split(",");
      if (parts.length === 2) {
        const start = parseFloat(parts[0]);
        const end = parseFloat(parts[1]);
        if (Number.isFinite(start) && Number.isFinite(end)) {
          const formatted = `${formatTime(start)}–${formatTime(end)}`;
          pairs.push(formatted);
        }
      }
    });
    const base = span.dataset.baseLabel;
    span.textContent = pairs.length ? `${base} (${pairs.join(", ")})` : base;
  } catch (e) {
    console.error("Could not append times to label for signal:", signalId, e);
  }
}

export function renderTextualBodies(textBodies) {
  const textDiv = document.getElementById("text-content");
  for (const b of Object.keys(textBodies)) {
    let textValues = textBodies[b][NS.rdf("value")].map((x) => x["@value"]);
    let textDivChild = document.createElement("div");
    textDivChild.className = "textual-body";
    textValues.forEach((val, idx) => {
      const span = document.createElement("span");
      span.textContent = val;
      textDivChild.appendChild(span);
      if (idx < textValues.length - 1) {
        textDivChild.appendChild(document.createElement("br"));
      }
    });
    textDiv.appendChild(textDivChild);
  }
}

export function renderMEI(uri, fragmentSet, meiData) {
  let fragments = Array.from(fragmentSet);
  if (DEBUG) console.log("Rendering MEI: ", uri, fragments);
  // create a new div for the MEI
  let meiDiv = document.createElement("div");
  meiDiv.className = "mei";
  meiDiv.id = uri;
  let scoreDiv = document.getElementById("music-scores");
  document.getElementById("music-scores").appendChild(meiDiv);
  // use Verovio to render the MEI to SVG inside the div
  let vrvToolkit = new verovio.toolkit();
  vrvToolkit.setOptions(vrvOptions);
  vrvToolkit.loadData(meiData);
  let meifriendDiv = document.createElement("div");
  meifriendDiv.className = "meifriendLink";
  let link = "https://mei-friend.mdw.ac.at/?file=" + uri;
  link += "&select=" + fragments.join(",");
  const friendAnchor = document.createElement("a");
  friendAnchor.href = isSafeUrl(link) ? link : "";
  friendAnchor.target = "_blank";
  friendAnchor.textContent = "Open in mei-friend";
  meifriendDiv.textContent = "";
  meifriendDiv.appendChild(friendAnchor);
  meiDiv.innerHTML = "";
  let fragment = fragments[0];
  let pageNum = vrvToolkit.getPageWithElement(fragment);
  let svg = vrvToolkit.renderToSVG(pageNum);
  meiDiv.innerHTML += svg;
  scoreDiv.parentElement.appendChild(meifriendDiv);
  // add "highlight" class to each element with the fragment ID
  for (const f of fragments) {
    let el = meiDiv.querySelector(`[data-id="${f}"]`);
    if (el) {
      el.classList.add("highlight");
    }
    if (DEBUG) console.log("element: ", el);
  }

  // Hide music scores loading spinner
  const musicScoresSection = document.querySelector("#h-music-scores");
  if (musicScoresSection) {
    musicScoresSection.classList.add("content-loaded");
  }
}
