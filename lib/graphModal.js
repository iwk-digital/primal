/**
 * Graph Modal Module
 * Handles the full-screen modal functionality for the music annotation graph viewer
 */

export default class GraphModal {
  constructor() {
    this.currentZoom = 1;
    this.isInitialized = false;
    this.elements = {};

    // Panning state
    this.panOffset = { x: 0, y: 0 };
    this.isPanning = false;
    this.panStart = { x: 0, y: 0 };

    // Bound methods for event listeners
    this.handleWheel = this.handleWheel.bind(this);
    this.handleMouseDown = this.handleMouseDown.bind(this);
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleMouseUp = this.handleMouseUp.bind(this);
  }

  /**
   * Initialize the graph modal functionality
   */
  initialize() {
    if (this.isInitialized) return;

    this.elements = {
      expandBtn: document.getElementById("graph-expand-btn"),
      modal: document.getElementById("graph-modal"),
      closeBtn: document.getElementById("close-modal-btn"),
      modalContent: document.getElementById("graph-modal-content"),
      zoomInBtn: document.getElementById("zoom-in-btn"),
      zoomOutBtn: document.getElementById("zoom-out-btn"),
      fitBtn: document.getElementById("fit-graph-btn"),
    };

    this.bindEvents();
    this.isInitialized = true;
  }

  /**
   * Bind all event listeners for modal functionality
   */
  bindEvents() {
    // Expand button click handler
    this.elements.expandBtn?.addEventListener("click", () => {
      this.openModal();
    });

    // Close button click handler
    this.elements.closeBtn?.addEventListener("click", () => {
      this.closeModal();
    });

    // Close modal on Escape key
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this.isModalOpen()) {
        this.closeModal();
      }
    });

    // Close modal when clicking outside content
    this.elements.modal?.addEventListener("click", (e) => {
      if (e.target === this.elements.modal) {
        this.closeModal();
      }
    });

    // Zoom controls
    this.elements.zoomInBtn?.addEventListener("click", () => {
      this.zoomIn();
    });

    this.elements.zoomOutBtn?.addEventListener("click", () => {
      this.zoomOut();
    });

    this.elements.fitBtn?.addEventListener("click", () => {
      this.fitToView();
    });
  }

  /**
   * Bind mouse interaction events for the modal
   */
  bindModalInteractionEvents() {
    if (!this.elements.modalContent) return;

    // Mouse wheel for zooming
    this.elements.modalContent.addEventListener("wheel", this.handleWheel, {
      passive: false,
    });

    // Mouse events for panning
    this.elements.modalContent.addEventListener(
      "mousedown",
      this.handleMouseDown
    );
    document.addEventListener("mousemove", this.handleMouseMove);
    document.addEventListener("mouseup", this.handleMouseUp);

    // Prevent context menu on right-click
    this.elements.modalContent.addEventListener("contextmenu", (e) => {
      e.preventDefault();
    });

    // Set cursor style
    this.elements.modalContent.style.cursor = "grab";
  }

  /**
   * Unbind mouse interaction events
   */
  unbindModalInteractionEvents() {
    if (!this.elements.modalContent) return;

    this.elements.modalContent.removeEventListener("wheel", this.handleWheel);
    this.elements.modalContent.removeEventListener(
      "mousedown",
      this.handleMouseDown
    );
    document.removeEventListener("mousemove", this.handleMouseMove);
    document.removeEventListener("mouseup", this.handleMouseUp);
    this.elements.modalContent.removeEventListener("contextmenu", (e) => {
      e.preventDefault();
    });
  }

  /**
   * Open the modal with the current graph
   */
  openModal() {
    const originalSvg = document.querySelector("#graph svg");
    if (!originalSvg || !this.elements.modal || !this.elements.modalContent)
      return;

    // Clone the graph SVG to the modal
    const clonedSvg = originalSvg.cloneNode(true);
    this.elements.modalContent.innerHTML = "";
    this.elements.modalContent.appendChild(clonedSvg);

    // Reset zoom and pan state
    this.currentZoom = 1;
    this.panOffset = { x: 0, y: 0 };
    this.fitGraphToModal(clonedSvg);

    // Bind mouse interaction events
    this.bindModalInteractionEvents();

    this.elements.modal.classList.add("show");
  }

  /**
   * Close the modal
   */
  closeModal() {
    if (this.elements.modal) {
      // Unbind mouse interaction events
      this.unbindModalInteractionEvents();

      // Reset panning state
      this.isPanning = false;

      this.elements.modal.classList.remove("show");
    }
  }

  /**
   * Check if modal is currently open
   */
  isModalOpen() {
    return this.elements.modal?.classList.contains("show") || false;
  }

  /**
   * Zoom in the graph
   */
  zoomIn() {
    this.currentZoom = Math.min(this.currentZoom * 1.2, 5); // Max zoom 5x
    this.applyZoom(this.currentZoom);
  }

  /**
   * Zoom out the graph
   */
  zoomOut() {
    this.currentZoom = Math.max(this.currentZoom / 1.2, 0.1); // Min zoom 0.1x
    this.applyZoom(this.currentZoom);
  }

  /**
   * Fit the graph to the modal view
   */
  fitToView() {
    const svg = this.elements.modalContent?.querySelector("svg");
    if (svg) {
      this.currentZoom = 1;
      this.panOffset = { x: 0, y: 0 };
      this.fitGraphToModal(svg);
    }
  }

  /**
   * Apply zoom and pan transformations to the SVG
   * @param {number} zoom - The zoom level to apply
   * @param {Object} panOffset - The pan offset {x, y}
   */
  applyTransform(zoom = this.currentZoom, panOffset = this.panOffset) {
    const svg = this.elements.modalContent?.querySelector("svg");
    if (svg) {
      svg.style.transform = `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`;
      svg.style.transformOrigin = "0 0";
    }
  }

  /**
   * Apply zoom transformation to the SVG (legacy method, kept for compatibility)
   * @param {number} zoom - The zoom level to apply
   */
  applyZoom(zoom) {
    this.applyTransform(zoom, this.panOffset);
  }

  /**
   * Handle mouse wheel events for zooming
   * @param {WheelEvent} e - The wheel event
   */
  handleWheel(e) {
    e.preventDefault();

    const rect = this.elements.modalContent.getBoundingClientRect();

    // Determine zoom direction and amount (reduced sensitivity)
    const zoomDelta = e.deltaY > 0 ? 0.97 : 1.03;
    const newZoom = Math.max(0.1, Math.min(5, this.currentZoom * zoomDelta));

    if (newZoom === this.currentZoom) return; // No change needed

    // Get mouse position relative to the container
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Calculate the point under the mouse before zoom (in the coordinate system of the SVG)
    const pointBeforeZoomX = (mouseX - this.panOffset.x) / this.currentZoom;
    const pointBeforeZoomY = (mouseY - this.panOffset.y) / this.currentZoom;

    // Calculate the point under the mouse after zoom
    const pointAfterZoomX = pointBeforeZoomX * newZoom;
    const pointAfterZoomY = pointBeforeZoomY * newZoom;

    // Adjust pan offset so the point under the mouse stays in the same screen position
    this.panOffset.x = mouseX - pointAfterZoomX;
    this.panOffset.y = mouseY - pointAfterZoomY;

    this.currentZoom = newZoom;
    this.applyTransform();
  }

  /**
   * Handle mouse down events for panning
   * @param {MouseEvent} e - The mouse event
   */
  handleMouseDown(e) {
    if (e.button === 0) {
      // Left mouse button
      this.isPanning = true;
      this.panStart.x = e.clientX - this.panOffset.x;
      this.panStart.y = e.clientY - this.panOffset.y;
      this.elements.modalContent.style.cursor = "grabbing";
      e.preventDefault();
    }
  }

  /**
   * Handle mouse move events for panning
   * @param {MouseEvent} e - The mouse event
   */
  handleMouseMove(e) {
    if (this.isPanning) {
      this.panOffset.x = e.clientX - this.panStart.x;
      this.panOffset.y = e.clientY - this.panStart.y;
      this.applyTransform();
      e.preventDefault();
    }
  }

  /**
   * Handle mouse up events to stop panning
   * @param {MouseEvent} e - The mouse event
   */
  handleMouseUp(e) {
    if (this.isPanning) {
      this.isPanning = false;
      if (this.elements.modalContent) {
        this.elements.modalContent.style.cursor = "grab";
      }
    }
  }

  /**
   * Fit the graph SVG to the modal container
   * @param {SVGElement} svg - The SVG element to fit
   */
  fitGraphToModal(svg) {
    if (!svg) return;

    svg.style.width = "auto";
    svg.style.height = "auto";
    svg.style.maxWidth = "100%";
    svg.style.maxHeight = "100%";

    // Center the SVG with transform
    svg.style.display = "block";
    svg.style.margin = "0 auto";

    // Apply the transform with current zoom and pan
    this.applyTransform();
  }

  /**
   * Fit graph to container (used for main graph view)
   * @param {HTMLElement} graphContainer - The container element
   */
  static fitGraphToContainer(graphContainer) {
    const svg = graphContainer.querySelector("svg");
    if (!svg) return;

    // Set up the SVG to fit the container
    svg.style.width = "100%";
    svg.style.height = "auto";
    svg.style.maxWidth = "100%";

    // Get the viewBox to maintain aspect ratio
    const viewBox = svg.getAttribute("viewBox");
    if (viewBox) {
      const [, , width, height] = viewBox.split(" ").map(Number);
      const containerWidth = graphContainer.clientWidth - 40; // Account for padding
      const containerHeight = Math.min(500, containerWidth * (height / width)); // Max height 500px

      svg.style.maxHeight = containerHeight + "px";
    }
  }

  /**
   * Update the expand button reference (called after graph re-render)
   */
  updateExpandButton() {
    this.elements.expandBtn = document.getElementById("graph-expand-btn");
    if (this.elements.expandBtn && this.isInitialized) {
      // Re-bind the expand button event
      this.elements.expandBtn.addEventListener("click", () => {
        this.openModal();
      });
    }
  }
}
