import { MapboxOverlay } from '@deck.gl/mapbox';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { Layer } from '@deck.gl/core';

/**
 * Manages the deck.gl overlay integration with MapLibre GL.
 * Handles adding, removing, and updating deck.gl layers.
 */
export class DeckOverlay {
  private _map: MapLibreMap;
  private _overlay: MapboxOverlay;
  private _layers: Map<string, Layer>;

  constructor(map: MapLibreMap) {
    this._map = map;
    this._layers = new Map();
    this._overlay = new MapboxOverlay({
      interleaved: false, // Use non-interleaved mode for better compatibility
      layers: [],
    });
    // Add the overlay as a control (compatible with MapLibre)
    this._map.addControl(this._overlay as unknown as maplibregl.IControl);
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
      this._map.removeControl(this._overlay as unknown as maplibregl.IControl);
    } catch {
      // Ignore errors if already removed
    }
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
