/**
 * Error Banner Module
 * Handles error display, content cleanup, and user feedback for error states
 */

/**
 * Clears all section content containers and hides visual elements
 * Used during error states to prevent conflicting information display
 */
export function clearSectionContent() {
  // Clear metadata section
  const metaCurrentUri = document.querySelector("#meta-current-uri");
  const metaCreatedBy = document.querySelector("#meta-created-by");
  if (metaCurrentUri) metaCurrentUri.innerHTML = "";
  if (metaCreatedBy) metaCreatedBy.innerHTML = "";

  // Clear and hide graph section
  const graphDiv = document.querySelector("#graph");
  if (graphDiv) {
    graphDiv.innerHTML = "";
    graphDiv.style.display = "none";
  }

  // Clear and hide JSON-LD section
  const jsonDisplay = document.querySelector("#json-display");
  if (jsonDisplay) {
    jsonDisplay.textContent = "";
    // Hide the parent pre element
    const jsonPre = jsonDisplay.closest("pre");
    if (jsonPre) {
      jsonPre.style.display = "none";
    }
  }

  // Clear other content containers
  const textContent = document.querySelector("#text-content");
  const musicScores = document.querySelector("#music-scores");
  const audioExamples = document.querySelector("#audio-examples");
  if (textContent) textContent.innerHTML = "";
  if (musicScores) musicScores.innerHTML = "";
  if (audioExamples) audioExamples.innerHTML = "";
}

/**
 * Shows a "no content" message in a specific section
 * @param {string} sectionId - CSS selector for the target section
 * @param {string} message - Message to display
 */
export function showNoContentMessage(sectionId, message) {
  const section = document.querySelector(sectionId);
  if (section) {
    section.classList.add("content-loaded");
    const noContentDiv = document.createElement("div");
    noContentDiv.className = "no-content-message";
    noContentDiv.textContent = message;
    section.appendChild(noContentDiv);
  }
}

/**
 * Shows a comprehensive error banner with details and suggestions
 * @param {string} message - Main error message
 * @param {string|null} uri - URI that failed to load (optional)
 * @param {Array<string>} suggestions - List of suggestions for the user (optional)
 * @param {Object|null} status - HTTP status object with code and text properties (optional)
 */
export function showErrorBanner(
  message,
  uri = null,
  suggestions = [],
  status = null
) {
  // Remove any existing error banner
  const existingBanner = document.querySelector(".error-banner");
  if (existingBanner) {
    existingBanner.remove();
  }

  // Create error banner
  const banner = document.createElement("div");
  banner.className = "error-banner";

  const content = document.createElement("div");
  content.className = "error-banner-content";

  // Error message
  const messageDiv = document.createElement("div");
  messageDiv.className = "error-message";
  messageDiv.innerHTML = `<strong>Error:</strong> ${message}`;
  content.appendChild(messageDiv);

  // URI if provided
  if (uri) {
    const uriDiv = document.createElement("div");
    uriDiv.className = "error-uri";
    uriDiv.innerHTML = `Attempted to load: <code>${uri}</code>`;
    content.appendChild(uriDiv);
  }

  // HTTP Status if provided
  if (status) {
    const statusDiv = document.createElement("div");
    statusDiv.className = "error-status";
    statusDiv.innerHTML = `Status: <code>${status.code} ${status.text}</code>`;
    content.appendChild(statusDiv);
  }

  // Suggestions if provided
  if (suggestions.length > 0) {
    const suggestionsDiv = document.createElement("div");
    suggestionsDiv.className = "error-suggestions";
    suggestionsDiv.innerHTML = "<strong>Suggestions:</strong>";
    const suggestionsList = document.createElement("ul");
    suggestions.forEach((suggestion) => {
      const li = document.createElement("li");
      li.innerHTML = suggestion;
      suggestionsList.appendChild(li);
    });
    suggestionsDiv.appendChild(suggestionsList);
    content.appendChild(suggestionsDiv);
  }

  // Close button
  const closeBtn = document.createElement("button");
  closeBtn.className = "error-banner-close";
  closeBtn.innerHTML = "×";
  closeBtn.title = "Close error message";
  closeBtn.addEventListener("click", () => banner.remove());

  banner.appendChild(content);
  banner.appendChild(closeBtn);

  // Insert at top of main content
  const main = document.querySelector("main");
  if (main) {
    main.insertBefore(banner, main.firstChild);
  }
}

/**
 * Handles all error scenarios with consistent cleanup and messaging
 * @param {string} errorType - Type of error for logging/debugging
 * @param {string} message - User-facing error message
 * @param {string|null} uri - URI that failed (optional)
 * @param {Array<string>} suggestions - Suggestions for the user (optional)
 * @param {Object|null} status - HTTP status information (optional)
 */
export function handleError(
  errorType,
  message,
  uri = null,
  suggestions = [],
  status = null
) {
  console.error(`[${errorType}]`, message, { uri, status });

  // Clear any leftover content
  clearSectionContent();

  // Show error banner
  showErrorBanner(message, uri, suggestions, status);

  // Show timeout messages in all sections
  const errorMessage = "See error above for details.";
  showNoContentMessage("#h-text-content", errorMessage);
  showNoContentMessage("#h-music-scores", errorMessage);
  showNoContentMessage("#h-audio-examples", errorMessage);
  showNoContentMessage("#h-metadata", errorMessage);
  showNoContentMessage("#h-graph", errorMessage);
  showNoContentMessage("#h-json-display", errorMessage);
}
