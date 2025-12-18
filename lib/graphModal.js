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
    this.hasDragged = false;
    this.dragThreshold = 5; // pixels movement threshold to distinguish click from drag

    // Bound methods for event listeners
    this.handleWheel = this.handleWheel.bind(this);
    this.handleMouseDown = this.handleMouseDown.bind(this);
    this.handleMouseMove = this.handleMouseMove.bind(this);
    this.handleMouseUp = this.handleMouseUp.bind(this);
    this.handleTouchStart = this.handleTouchStart.bind(this);
    this.handleTouchMove = this.handleTouchMove.bind(this);
    this.handleTouchEnd = this.handleTouchEnd.bind(this);
    this.handleClick = this.handleClick.bind(this);
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

    // Touch events for panning
    this.elements.modalContent.addEventListener(
      "touchstart",
      this.handleTouchStart,
      { passive: false }
    );
    document.addEventListener("touchmove", this.handleTouchMove, {
      passive: false,
    });
    document.addEventListener("touchend", this.handleTouchEnd, {
      passive: false,
    });
    document.addEventListener("touchcancel", this.handleTouchEnd, {
      passive: false,
    });

    // Click event for link handling (capture phase to intercept before links)
    this.elements.modalContent.addEventListener(
      "click",
      this.handleClick,
      true
    );

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
    this.elements.modalContent.removeEventListener(
      "touchstart",
      this.handleTouchStart
    );
    document.removeEventListener("touchmove", this.handleTouchMove);
    document.removeEventListener("touchend", this.handleTouchEnd);
    document.removeEventListener("touchcancel", this.handleTouchEnd);
    this.elements.modalContent.removeEventListener(
      "click",
      this.handleClick,
      true
    );
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
    document.body.classList.add("modal-open");

    // Add subtle zoom wobble animation to indicate zoomability
    this.addZoomWobbleAnimation(clonedSvg);
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
      document.body.classList.remove("modal-open");
    }
  }

  /**
   * Add subtle zoom wobble animation to indicate zoomability
   */
  addZoomWobbleAnimation(svg) {
    if (!svg) return;

    // Add the animation class
    svg.classList.add("zoom-wobble");

    // Remove the animation class after it completes to avoid interfering with interactions
    svg.addEventListener(
      "animationend",
      () => {
        svg.classList.remove("zoom-wobble");
      },
      { once: true }
    );
  }

  /**
   * Check if modal is currently open
   */
  isModalOpen() {
    return this.elements.modal?.classList.contains("show") || false;
  }

  /**
   * Zoom in the graph (animated, centered on viewport)
   */
  zoomIn() {
    const newZoom = Math.min(this.currentZoom * 1.2, 5); // Max zoom 5x
    this.zoomAroundCenter(newZoom, true);
  }

  /**
   * Zoom out the graph (animated, centered on viewport)
   */
  zoomOut() {
    const newZoom = Math.max(this.currentZoom / 1.2, 0.1); // Min zoom 0.1x
    this.zoomAroundCenter(newZoom, true);
  }

  /**
   * Zoom around the center of the SVG (simplified for center-based transform origin)
   * @param {number} newZoom - The new zoom level
   * @param {boolean} animated - Whether to animate the zoom
   */
  zoomAroundCenter(newZoom, animated = false) {
    if (newZoom === this.currentZoom) return;

    // With transform-origin: center center, we don't need to adjust pan offset
    // for center-based zooming - the browser handles it automatically
    this.currentZoom = newZoom;
    this.applyTransform(newZoom, this.panOffset, animated);
  }

  /**
   * Fit the graph to the modal view (animated)
   */
  fitToView() {
    const svg = this.elements.modalContent?.querySelector("svg");
    if (svg) {
      this.currentZoom = 1;
      this.panOffset = { x: 0, y: 0 };
      this.fitGraphToModal(svg);
      // Apply the fit with animation
      this.applyTransform(this.currentZoom, this.panOffset, true);
    }
  }

  /**
   * Apply zoom and pan transformations to the SVG
   * @param {number} zoom - The zoom level to apply
   * @param {Object} panOffset - The pan offset {x, y}
   * @param {boolean} animated - Whether to animate the transformation
   */
  applyTransform(
    zoom = this.currentZoom,
    panOffset = this.panOffset,
    animated = false
  ) {
    const svg = this.elements.modalContent?.querySelector("svg");
    if (svg) {
      // Enable or disable transition animation
      if (animated) {
        svg.classList.add("zoom-transition");
      } else {
        svg.classList.remove("zoom-transition");
      }

      svg.style.transform = `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`;
      svg.style.transformOrigin = "center center";

      // Remove transition class after animation completes to avoid interfering with interactions
      if (animated) {
        setTimeout(() => {
          svg.classList.remove("zoom-transition");
        }, 300); // Match the CSS transition duration
      }
    }
  }

  /**
   * Apply zoom transformation to the SVG (legacy method, kept for compatibility)
   * @param {number} zoom - The zoom level to apply
   * @param {boolean} animated - Whether to animate the transformation
   */
  applyZoom(zoom, animated = false) {
    this.applyTransform(zoom, this.panOffset, animated);
  }

  /**
   * Handle mouse wheel events for zooming
   * @param {WheelEvent} e - The wheel event
   */
  handleWheel(e) {
    e.preventDefault();

    const svg = this.elements.modalContent?.querySelector("svg");
    if (!svg) return;

    // Determine zoom direction and amount (reduced sensitivity)
    const zoomDelta = e.deltaY > 0 ? 0.97 : 1.03;
    const newZoom = Math.max(0.1, Math.min(5, this.currentZoom * zoomDelta));

    if (newZoom === this.currentZoom) return; // No change needed

    // Get the SVG's bounding rect (after current transforms)
    const svgRect = svg.getBoundingClientRect();

    // Get mouse position relative to the SVG element
    const mouseX = e.clientX - svgRect.left;
    const mouseY = e.clientY - svgRect.top;

    // Get the center point of the SVG
    const centerX = svgRect.width / 2;
    const centerY = svgRect.height / 2;

    // Calculate how far the mouse is from the center
    const deltaX = mouseX - centerX;
    const deltaY = mouseY - centerY;

    // When zooming with center origin, we need to adjust the translation
    // to compensate for the scale change
    const zoomChange = newZoom / this.currentZoom;

    // Adjust the pan offset to keep the mouse point stationary
    this.panOffset.x += deltaX * (1 - zoomChange);
    this.panOffset.y += deltaY * (1 - zoomChange);

    this.currentZoom = newZoom;
    this.applyTransform();
  }

  /**
   * Handle mouse down events for panning
   * @param {MouseEvent} e - The mouse event
   */
  handleMouseDown(e) {
    if (e.button === 0) {
      this.startPan(e.clientX, e.clientY);
      e.preventDefault();
    }
  }

  /**
   * Handle mouse move events for panning
   * @param {MouseEvent} e - The mouse event
   */
  handleMouseMove(e) {
    if (!this.isPanning) return;
    this.movePan(e.clientX, e.clientY);
    e.preventDefault();
  }

  /**
   * Handle mouse up events to stop panning
   * @param {MouseEvent} e - The mouse event
   */
  handleMouseUp(e) {
    this.endPan();
  }

  /**
   * Handle touch start events for panning
   * @param {TouchEvent} e - The touch event
   */
  handleTouchStart(e) {
    if (e.touches.length !== 1) return; // ignore multi-touch (reserved for browser zoom)
    const touch = e.touches[0];
    this.startPan(touch.clientX, touch.clientY);
    e.preventDefault();
  }

  /**
   * Handle touch move events for panning
   * @param {TouchEvent} e - The touch event
   */
  handleTouchMove(e) {
    if (!this.isPanning || e.touches.length !== 1) return;
    const touch = e.touches[0];
    this.movePan(touch.clientX, touch.clientY);
    e.preventDefault();
  }

  /**
   * Handle touch end/cancel events
   * @param {TouchEvent} e - The touch event
   */
  handleTouchEnd(e) {
    this.endPan();
    e.preventDefault();
  }

  /**
   * Begin a pan interaction
   * @param {number} clientX
   * @param {number} clientY
   */
  startPan(clientX, clientY) {
    this.isPanning = true;
    this.hasDragged = false;
    this.panStart.x = clientX - this.panOffset.x;
    this.panStart.y = clientY - this.panOffset.y;
    if (this.elements.modalContent) {
      this.elements.modalContent.style.cursor = "grabbing";
    }
  }

  /**
   * Continue a pan interaction
   * @param {number} clientX
   * @param {number} clientY
   */
  movePan(clientX, clientY) {
    const newPanX = clientX - this.panStart.x;
    const newPanY = clientY - this.panStart.y;

    // Check if we've moved beyond the drag threshold
    const deltaX = Math.abs(newPanX - this.panOffset.x);
    const deltaY = Math.abs(newPanY - this.panOffset.y);

    if (deltaX > this.dragThreshold || deltaY > this.dragThreshold) {
      this.hasDragged = true;
    }

    this.panOffset.x = newPanX;
    this.panOffset.y = newPanY;
    this.applyTransform();
  }

  /**
   * End a pan interaction
   */
  endPan() {
    if (this.isPanning) {
      this.isPanning = false;
      if (this.elements.modalContent) {
        this.elements.modalContent.style.cursor = "grab";
      }
    }
  }

  /**
   * Handle click events to prevent link following during drag operations
   * @param {MouseEvent} e - The mouse event
   */
  handleClick(e) {
    // If we've dragged, prevent the click from following links
    if (this.hasDragged) {
      e.preventDefault();
      e.stopPropagation();
      this.hasDragged = false; // Reset for next interaction
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
