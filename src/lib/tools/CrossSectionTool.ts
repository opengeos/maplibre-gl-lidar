import type { Map as MapLibreMap, MapMouseEvent } from 'maplibre-gl';
import type { CrossSectionLine } from '../core/types';
import type { DeckOverlay } from '../core/DeckOverlay';
import { GeoJsonLayer } from '@deck.gl/layers';
import { ElevationProfileExtractor } from './ElevationProfileExtractor';

/**
 * Cross-section drawing tool for MapLibre.
 * Allows users to draw a line on the map and visualize the buffer zone.
 */
export class CrossSectionTool {
  private _map: MapLibreMap;
  private _deckOverlay: DeckOverlay;
  private _enabled: boolean = false;
  private _isDrawing: boolean = false;
  private _startPoint: [number, number] | null = null;
  private _endPoint: [number, number] | null = null;
  private _bufferDistance: number = 10; // meters

  // deck.gl layer ID
  private readonly LAYER_ID = 'lidar-cross-section-layer';

  // Event callbacks
  private _onLineChange?: (line: CrossSectionLine | null) => void;

  // Bound event handlers
  private _handleClickBound: (e: MapMouseEvent) => void;
  private _handleMouseMoveBound: (e: MapMouseEvent) => void;

  /**
   * Creates a new CrossSectionTool instance.
   *
   * @param map - MapLibre map instance
   * @param deckOverlay - DeckOverlay instance for rendering
   */
  constructor(map: MapLibreMap, deckOverlay: DeckOverlay) {
    this._map = map;
    this._deckOverlay = deckOverlay;
    this._handleClickBound = this._handleClick.bind(this);
    this._handleMouseMoveBound = this._handleMouseMove.bind(this);
  }

  /**
   * Enables cross-section drawing mode.
   */
  enable(): void {
    if (this._enabled) return;

    this._enabled = true;
    this._addEventListeners();
    this._map.getCanvas().style.cursor = 'crosshair';
  }

  /**
   * Disables cross-section drawing mode.
   */
  disable(): void {
    if (!this._enabled) return;

    this._enabled = false;
    this._removeEventListeners();
    this._map.getCanvas().style.cursor = '';
    this._isDrawing = false;
  }

  /**
   * Checks if the tool is enabled.
   *
   * @returns True if enabled
   */
  isEnabled(): boolean {
    return this._enabled;
  }

  /**
   * Gets the current cross-section line.
   *
   * @returns Cross-section line or null if not defined
   */
  getLine(): CrossSectionLine | null {
    if (!this._startPoint || !this._endPoint) return null;

    return {
      start: this._startPoint,
      end: this._endPoint,
      bufferDistance: this._bufferDistance,
    };
  }

  /**
   * Sets the buffer distance.
   *
   * @param meters - Buffer distance in meters
   */
  setBufferDistance(meters: number): void {
    this._bufferDistance = meters;
    this._updateVisualization();
    this._notifyLineChange();
  }

  /**
   * Gets the current buffer distance.
   *
   * @returns Buffer distance in meters
   */
  getBufferDistance(): number {
    return this._bufferDistance;
  }

  /**
   * Clears the current cross-section line.
   */
  clearLine(): void {
    this._startPoint = null;
    this._endPoint = null;
    this._isDrawing = false;
    // Remove the deck.gl layer when clearing
    this._removeDeckLayers();
    this._notifyLineChange();
  }

  /**
   * Sets the callback for line changes.
   *
   * @param callback - Callback function
   */
  setOnLineChange(callback: (line: CrossSectionLine | null) => void): void {
    this._onLineChange = callback;
  }

  /**
   * Destroys the tool and cleans up resources.
   */
  destroy(): void {
    this.disable();
    this._removeDeckLayers();
  }

  /**
   * Removes deck.gl layers.
   */
  private _removeDeckLayers(): void {
    if (this._deckOverlay.hasLayer(this.LAYER_ID)) {
      this._deckOverlay.removeLayer(this.LAYER_ID);
    }
  }

  /**
   * Adds event listeners for drawing.
   */
  private _addEventListeners(): void {
    this._map.on('click', this._handleClickBound);
    this._map.on('mousemove', this._handleMouseMoveBound);
  }

  /**
   * Removes event listeners.
   */
  private _removeEventListeners(): void {
    this._map.off('click', this._handleClickBound);
    this._map.off('mousemove', this._handleMouseMoveBound);
  }

  /**
   * Handles map click events.
   *
   * @param e - Map mouse event
   */
  private _handleClick(e: MapMouseEvent): void {
    const lngLat = e.lngLat;

    if (!this._isDrawing) {
      // First click - set start point
      this._startPoint = [lngLat.lng, lngLat.lat];
      this._endPoint = null;
      this._isDrawing = true;
    } else {
      // Second click - set end point
      this._endPoint = [lngLat.lng, lngLat.lat];
      this._isDrawing = false;
      this._notifyLineChange();
    }

    this._updateVisualization();
  }

  /**
   * Handles mouse move events for preview.
   *
   * @param e - Map mouse event
   */
  private _handleMouseMove(e: MapMouseEvent): void {
    if (!this._isDrawing || !this._startPoint) return;

    // Update end point for preview
    this._endPoint = [e.lngLat.lng, e.lngLat.lat];
    this._updateVisualization();
  }

  /**
   * Updates the visualization on the map using deck.gl.
   */
  private _updateVisualization(): void {
    const features: GeoJSON.Feature[] = [];

    // Add start point
    if (this._startPoint) {
      features.push({
        type: 'Feature',
        properties: { type: 'point', position: 'start' },
        geometry: {
          type: 'Point',
          coordinates: this._startPoint,
        },
      });
    }

    // Add end point and line
    if (this._startPoint && this._endPoint) {
      // End point
      features.push({
        type: 'Feature',
        properties: { type: 'point', position: 'end' },
        geometry: {
          type: 'Point',
          coordinates: this._endPoint,
        },
      });

      // Line
      features.push({
        type: 'Feature',
        properties: { type: 'line' },
        geometry: {
          type: 'LineString',
          coordinates: [this._startPoint, this._endPoint],
        },
      });

      // Buffer polygon
      const bufferCoords = ElevationProfileExtractor.createBufferPolygon({
        start: this._startPoint,
        end: this._endPoint,
        bufferDistance: this._bufferDistance,
      });

      features.push({
        type: 'Feature',
        properties: { type: 'buffer' },
        geometry: {
          type: 'Polygon',
          coordinates: [bufferCoords],
        },
      });
    }

    const geojsonData: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features,
    };

    // Create deck.gl GeoJsonLayer with styling for all feature types
    // Use parameters.depthTest: false to ensure it renders on top of point clouds
    const layer = new GeoJsonLayer({
      id: this.LAYER_ID,
      data: geojsonData,
      pickable: false,
      stroked: true,
      filled: true,
      // Disable depth testing so this layer always renders on top
      parameters: {
        depthTest: false,
        depthMask: false,
      },
      // Fill color for polygons (buffer) and points
      getFillColor: (f: GeoJSON.Feature) => {
        if (f.properties?.type === 'point') {
          return [255, 51, 51, 255]; // #ff3333
        }
        if (f.properties?.type === 'buffer') {
          return [51, 136, 255, 50]; // #3388ff with 0.2 opacity
        }
        return [0, 0, 0, 0];
      },
      // Line color for lines and polygon borders
      getLineColor: (f: GeoJSON.Feature) => {
        if (f.properties?.type === 'line') {
          return [51, 136, 255, 255]; // #3388ff
        }
        if (f.properties?.type === 'buffer') {
          return [51, 136, 255, 100]; // Buffer border
        }
        if (f.properties?.type === 'point') {
          return [255, 255, 255, 255]; // White stroke for points
        }
        return [0, 0, 0, 0];
      },
      getLineWidth: (f: GeoJSON.Feature) => {
        if (f.properties?.type === 'line') {
          return 3;
        }
        if (f.properties?.type === 'point') {
          return 2;
        }
        return 1;
      },
      lineWidthUnits: 'pixels',
      // Point styling
      pointType: 'circle',
      getPointRadius: 8,
      pointRadiusUnits: 'pixels',
    });

    // Add or update the layer
    if (this._deckOverlay.hasLayer(this.LAYER_ID)) {
      this._deckOverlay.updateLayer(this.LAYER_ID, layer);
    } else {
      this._deckOverlay.addLayer(this.LAYER_ID, layer);
    }
  }

  /**
   * Notifies listeners of line change.
   */
  private _notifyLineChange(): void {
    if (this._onLineChange) {
      this._onLineChange(this.getLine());
    }
  }
}
