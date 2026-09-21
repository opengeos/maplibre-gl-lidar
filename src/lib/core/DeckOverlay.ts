import { MapLibreOverlay } from '@deck.gl/maplibre';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { Layer } from '@deck.gl/core';

/** Marks the deck.gl canvas wrapper so a host can style or find it. */
export const DECK_CANVAS_CLASS = 'maplibre-gl-lidar-canvas';

/**
 * Manages the deck.gl overlay integration with MapLibre GL.
 * Handles adding, removing, and updating deck.gl layers.
 */
export class DeckOverlay {
  private _map: MapLibreMap;
  private _overlay: MapLibreOverlay;
  private _layers: Map<string, Layer>;
  /** The deck.gl canvas wrapper, re-parented out of the control container. */
  private _container: HTMLDivElement | null = null;

  constructor(map: MapLibreMap) {
    this._map = map;
    this._layers = new Map();
    this._overlay = new MapLibreOverlay({
      interleaved: false, // Use non-interleaved mode for better compatibility
      layers: [],
    });
    // MapLibreOverlay implements MapLibre's IControl, so no cast is needed.
    // Capture the element it hands back: MapLibre drops it into one of the four
    // corner containers, which is the wrong place for it (see _moveBelowUi).
    const onAdd = this._overlay.onAdd.bind(this._overlay);
    this._overlay.onAdd = (addedTo) => {
      this._container = onAdd(addedTo);
      return this._container;
    };
    this._map.addControl(this._overlay);
    this._moveBelowUi();
  }

  /**
   * Moves the deck.gl canvas out of MapLibre's control container and into the
   * canvas container, directly after the base map canvas.
   *
   * In overlaid mode the overlay is an `IControl`, so MapLibre appends its
   * absolutely positioned, map-sized canvas wrapper to a corner of
   * `.maplibregl-control-container`. Everything else in that container is
   * statically positioned, so the wrapper paints *above* every control panel it
   * overlaps (and above every Marker, which lives further down in the canvas
   * container) -- a loaded point cloud then hides measure, legend, colorbar and
   * similar UI. The canvas is map content, not a control, so it belongs beside
   * the base map canvas: above the basemap, below markers, popups and controls.
   */
  private _moveBelowUi(): void {
    const container: HTMLDivElement | null = this._container;
    if (!container) return;
    container.classList.add(DECK_CANVAS_CLASS);
    const canvasContainer = this._map.getCanvasContainer();
    const mapCanvas = this._map.getCanvas();
    const anchor = mapCanvas.parentNode === canvasContainer ? mapCanvas.nextSibling : null;
    canvasContainer.insertBefore(container, anchor);
  }

  /**
   * Adds a layer to the overlay.
   *
   * @param id - Unique layer ID
   * @param layer - The deck.gl layer to add
   */
  addLayer(id: string, layer: Layer): void {
    this._layers.set(id, layer);
    this._updateOverlay();
  }

  /**
   * Removes a layer from the overlay.
   *
   * @param id - ID of the layer to remove
   */
  removeLayer(id: string): void {
    this._layers.delete(id);
    this._updateOverlay();
  }

  /**
   * Updates an existing layer with new props.
   *
   * @param id - ID of the layer to update
   * @param layer - New layer instance with updated props
   */
  updateLayer(id: string, layer: Layer): void {
    if (this._layers.has(id)) {
      this._layers.set(id, layer);
      this._updateOverlay();
    }
  }

  /**
   * Gets all current layers.
   *
   * @returns Array of deck.gl layers
   */
  getLayers(): Layer[] {
    return Array.from(this._layers.values());
  }

  /**
   * Checks if a layer exists.
   *
   * @param id - Layer ID to check
   * @returns True if layer exists
   */
  hasLayer(id: string): boolean {
    return this._layers.has(id);
  }

  /**
   * Clears all layers from the overlay.
   */
  clearLayers(): void {
    this._layers.clear();
    this._updateOverlay();
  }

  /**
   * Gets the MapLibre map instance.
   *
   * @returns The MapLibre map
   */
  getMap(): MapLibreMap {
    return this._map;
  }

  /**
   * Destroys the overlay and removes it from the map.
   */
  destroy(): void {
    this._layers.clear();
    try {
      this._map.removeControl(this._overlay);
    } catch {
      // Ignore errors if already removed
    }
    // MapLibre detaches a control's element for it, but only from the corner
    // container it put it in; the canvas wrapper now lives elsewhere, so drop
    // it here rather than leaving a dead canvas over the map.
    this._container?.remove();
    this._container = null;
  }

  /**
   * Updates the overlay with current layers.
   * Layers are sorted so that overlay layers (like cross-section) render on top.
   */
  private _updateOverlay(): void {
    // Sort layers: point cloud layers first, overlay layers (cross-section) last
    const sortedLayers = Array.from(this._layers.entries()).sort(([idA], [idB]) => {
      // Cross-section layer should render last (on top)
      const isOverlayA = idA.includes('cross-section');
      const isOverlayB = idB.includes('cross-section');
      if (isOverlayA && !isOverlayB) return 1;
      if (!isOverlayA && isOverlayB) return -1;
      return 0;
    }).map(([, layer]) => layer);

    this._overlay.setProps({
      layers: sortedLayers,
    });
    // Trigger a map repaint to ensure the deck overlay is rendered
    this._map.triggerRepaint();
  }
}
