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
    this.handlePointerDown = this.handlePointerDown.bind(this);
    this.handlePointerMove = this.handlePointerMove.bind(this);
    this.handlePointerUp = this.handlePointerUp.bind(this);
    this.handlePointerCancel = this.handlePointerCancel.bind(this);
    this.handleClick = this.handleClick.bind(this);
    this.preventBackgroundScroll = this.preventBackgroundScroll.bind(this);

    this.usingPointerEvents = false;
    this.overlayTouchBlocker = (e) => e.preventDefault();
    this.activeSvg = null;
    this.pointerTarget = null;

    this.minZoom = 0.05;
    this.maxZoom = 20;

    // Multi-pointer / pinch state
    this.activePointers = new Map();
    this.isPinching = false;
    this.pinchStartDistance = 0;
    this.pinchStartZoom = 1;
    this.pinchMidpoint = { x: 0, y: 0 };
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

    // Use the cloned SVG as the primary pointer target when available
    this.pointerTarget = this.activeSvg || this.elements.modalContent;

    // Prefer Pointer Events when available to unify mouse/touch handling
    if (window.PointerEvent) {
      this.usingPointerEvents = true;
      this.pointerTarget.addEventListener(
        "pointerdown",
        this.handlePointerDown,
        { passive: false }
      );
      this.pointerTarget.addEventListener(
        "pointermove",
        this.handlePointerMove,
        {
          passive: false,
        }
      );
      this.pointerTarget.addEventListener("pointerup", this.handlePointerUp, {
        passive: false,
      });
      this.pointerTarget.addEventListener(
        "pointercancel",
        this.handlePointerCancel,
        {
          passive: false,
        }
      );
      // Also listen on document to catch stray moves/up outside content (Firefox quirk)
      document.addEventListener("pointermove", this.handlePointerMove, {
        passive: false,
      });
      document.addEventListener("pointerup", this.handlePointerUp, {
        passive: false,
      });
      document.addEventListener("pointercancel", this.handlePointerCancel, {
        passive: false,
      });
    } else {
      this.usingPointerEvents = false;

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
    }

    // Mouse wheel for zooming (keep for all)
    this.elements.modalContent.addEventListener("wheel", this.handleWheel, {
      passive: false,
    });

    // Prevent touches on overlay from scrolling the background
    this.elements.modal.addEventListener(
      "touchmove",
      this.overlayTouchBlocker,
      {
        passive: false,
      }
    );

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
    if (this.usingPointerEvents) {
      const target = this.pointerTarget || this.elements.modalContent;
      target.removeEventListener("pointerdown", this.handlePointerDown);
      target.removeEventListener("pointermove", this.handlePointerMove);
      target.removeEventListener("pointerup", this.handlePointerUp);
      target.removeEventListener("pointercancel", this.handlePointerCancel);
      document.removeEventListener("pointermove", this.handlePointerMove);
      document.removeEventListener("pointerup", this.handlePointerUp);
      document.removeEventListener("pointercancel", this.handlePointerCancel);
    } else {
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
    }
    this.elements.modal?.removeEventListener(
      "touchmove",
      this.overlayTouchBlocker
    );
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
    clonedSvg.style.touchAction = "none";
    clonedSvg.style.pointerEvents = "auto";
    this.elements.modalContent.innerHTML = "";
    this.elements.modalContent.appendChild(clonedSvg);
    this.activeSvg = clonedSvg;
    this.pointerTarget = clonedSvg;
    this.activePointers.clear();
    this.isPinching = false;

    // Reset zoom and pan state
    this.currentZoom = 1;
    this.panOffset = { x: 0, y: 0 };
    this.fitGraphToModal(clonedSvg);

    // Bind mouse interaction events
    this.bindModalInteractionEvents();

    // Prevent background scroll on touch devices while modal is open
    document.addEventListener("touchmove", this.preventBackgroundScroll, {
      passive: false,
      capture: true,
    });

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
      this.activeSvg = null;
      this.pointerTarget = null;
      this.activePointers.clear();
      this.isPinching = false;

      this.elements.modal.classList.remove("show");
      document.body.classList.remove("modal-open");

      // Remove background scroll prevention
      document.removeEventListener("touchmove", this.preventBackgroundScroll, {
        capture: true,
      });
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
    const newZoom = Math.min(this.currentZoom * 1.2, this.maxZoom);
    this.zoomAroundCenter(newZoom, true);
  }

  /**
   * Zoom out the graph (animated, centered on viewport)
   */
  zoomOut() {
    const newZoom = Math.max(this.currentZoom / 1.2, this.minZoom);
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
    const newZoom = Math.max(
      this.minZoom,
      Math.min(this.maxZoom, this.currentZoom * zoomDelta)
    );

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
    if (this.isPinching || !this.isPanning) return;
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
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      this.isPinching = false;
      this.startPan(touch.clientX, touch.clientY);
    } else if (e.touches.length === 2) {
      this.startTouchPinch(e);
    }
    e.preventDefault();
  }

  /**
   * Handle touch move events for panning
   * @param {TouchEvent} e - The touch event
   */
  handleTouchMove(e) {
    if (e.touches.length === 2) {
      this.continueTouchPinch(e);
      e.preventDefault();
      return;
    }
    if (this.isPinching) {
      e.preventDefault();
      return;
    }
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
    if (this.isPinching) {
      this.endPinch();
    } else {
      this.endPan();
    }
    e.preventDefault();
  }

  /**
   * Pointer down handler (preferred when supported)
   */
  handlePointerDown(e) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    (
      e.target ||
      this.pointerTarget ||
      this.elements.modalContent
    )?.setPointerCapture?.(e.pointerId);
    this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.activePointers.size === 2) {
      this.startPointerPinch();
    } else if (this.activePointers.size === 1) {
      this.isPinching = false;
      this.startPan(e.clientX, e.clientY);
    }
    e.preventDefault();
  }

  handlePointerMove(e) {
    if (!this.activePointers.has(e.pointerId)) return;
    this.activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (this.isPinching || this.activePointers.size >= 2) {
      this.continuePointerPinch();
    } else if (this.isPanning) {
      this.movePan(e.clientX, e.clientY);
    }
    e.preventDefault();
  }

  handlePointerUp(e) {
    (
      e.target ||
      this.pointerTarget ||
      this.elements.modalContent
    )?.releasePointerCapture?.(e.pointerId);
    this.activePointers.delete(e.pointerId);
    if (this.isPinching) {
      this.endPinch();
    } else {
      this.endPan();
    }
    e.preventDefault();
  }

  handlePointerCancel(e) {
    (
      e.target ||
      this.pointerTarget ||
      this.elements.modalContent
    )?.releasePointerCapture?.(e.pointerId);
    this.activePointers.delete(e.pointerId);
    this.endPinch();
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
   * Start a pinch gesture from pointer events
   */
  startPointerPinch() {
    if (this.activePointers.size < 2 || !this.activeSvg) return;
    this.isPinching = true;
    this.isPanning = false;
    const [p1, p2] = Array.from(this.activePointers.values());
    this.pinchStartDistance = this.distanceBetween(p1, p2);
    this.pinchMidpoint = this.midpointBetween(p1, p2);
    this.pinchStartZoom = this.currentZoom;
  }

  /**
   * Continue pinch gesture for pointer events
   */
  continuePointerPinch() {
    if (this.activePointers.size < 2 || !this.isPinching || !this.activeSvg)
      return;
    const [p1, p2] = Array.from(this.activePointers.values());
    this.applyPinchZoom(p1, p2);
  }

  /**
   * Start pinch gesture for touch fallback
   */
  startTouchPinch(e) {
    if (e.touches.length < 2 || !this.activeSvg) return;
    this.isPinching = true;
    this.isPanning = false;
    const p1 = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    const p2 = { x: e.touches[1].clientX, y: e.touches[1].clientY };
    this.pinchStartDistance = this.distanceBetween(p1, p2);
    this.pinchMidpoint = this.midpointBetween(p1, p2);
    this.pinchStartZoom = this.currentZoom;
  }

  /**
   * Continue pinch for touch fallback
   */
  continueTouchPinch(e) {
    if (e.touches.length < 2 || !this.isPinching || !this.activeSvg) return;
    const p1 = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    const p2 = { x: e.touches[1].clientX, y: e.touches[1].clientY };
    this.applyPinchZoom(p1, p2);
  }

  /**
   * End pinch gesture
   */
  endPinch() {
    this.isPinching = false;
    this.pinchStartDistance = 0;
  }

  /**
   * Apply pinch zoom based on two points
   */
  applyPinchZoom(p1, p2) {
    if (!this.activeSvg || !this.pinchStartDistance) return;

    const currentDistance = this.distanceBetween(p1, p2);
    if (currentDistance <= 0) return;

    const rawZoom =
      this.pinchStartZoom * (currentDistance / this.pinchStartDistance);
    const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, rawZoom));
    const zoomChange = newZoom / this.currentZoom;

    const svgRect = this.activeSvg.getBoundingClientRect();
    const mid = this.midpointBetween(p1, p2);
    const midX = mid.x - svgRect.left;
    const midY = mid.y - svgRect.top;
    const centerX = svgRect.width / 2;
    const centerY = svgRect.height / 2;

    // Adjust pan so the midpoint stays under the fingers
    this.panOffset.x += (midX - centerX) * (1 - zoomChange);
    this.panOffset.y += (midY - centerY) * (1 - zoomChange);

    this.currentZoom = newZoom;
    this.applyTransform();
  }

  distanceBetween(p1, p2) {
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return Math.hypot(dx, dy);
  }

  midpointBetween(p1, p2) {
    return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
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
   * Prevent background page scroll when modal is open
   */
  preventBackgroundScroll(e) {
    if (!this.isModalOpen()) return;
    if (
      this.elements.modalContent &&
      this.elements.modalContent.contains(e.target)
    ) {
      return; // allow modal interactions to proceed (handled elsewhere)
    }
    e.preventDefault();
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
