import type { Map as MapLibreMap } from 'maplibre-gl';
import type { ViewportInfo } from '../loaders/streaming-types';
import { debounce } from '../utils/helpers';

/**
 * Options for the ViewportManager
 */
export interface ViewportManagerOptions {
  /**
   * Debounce time for viewport changes in ms
   * @default 150
   */
  debounceMs?: number;

  /**
   * Minimum zoom level to start loading high-detail nodes
   * @default 10
   */
  minDetailZoom?: number;

  /**
   * Maximum octree depth to load
   * @default 20
   */
  maxOctreeDepth?: number;

  /**
   * Octree spacing value from COPC file (for more accurate depth calculation)
   */
  spacing?: number;
}

/**
 * Manages viewport state and triggers node loading based on map view changes.
 * Listens to MapLibre GL map events and calculates the appropriate octree
 * depth for the current zoom level and pitch.
 */
export class ViewportManager {
  private _map: MapLibreMap;
  private _debounceMs: number;
  private _onViewportChange: (viewport: ViewportInfo) => void;
  private _debouncedHandler: () => void;
  private _isActive: boolean = false;

  // Zoom to octree depth mapping configuration
  private _minDetailZoom: number;
  private _maxOctreeDepth: number;
  private _spacing: number | null;

  /**
   * Creates a new ViewportManager instance.
   *
   * @param map - MapLibre GL map instance
   * @param onViewportChange - Callback fired when viewport changes
   * @param options - Configuration options
   */
  constructor(
    map: MapLibreMap,
    onViewportChange: (viewport: ViewportInfo) => void,
    options?: ViewportManagerOptions
  ) {
    this._map = map;
    this._onViewportChange = onViewportChange;
    this._debounceMs = options?.debounceMs ?? 150;
    this._minDetailZoom = options?.minDetailZoom ?? 10;
    this._maxOctreeDepth = options?.maxOctreeDepth ?? 20;
    this._spacing = options?.spacing ?? null;

    this._debouncedHandler = debounce(
      () => this._handleViewportChange(),
      this._debounceMs
    );
  }

  /**
   * Starts listening to map viewport changes.
   */
  start(): void {
    if (this._isActive) return;
    this._isActive = true;

    this._map.on('moveend', this._debouncedHandler);
    this._map.on('zoomend', this._debouncedHandler);
    this._map.on('pitchend', this._debouncedHandler);

    // Trigger initial viewport calculation
    this._handleViewportChange();
  }

  /**
   * Stops listening to map viewport changes.
   */
  stop(): void {
    if (!this._isActive) return;
    this._isActive = false;

    this._map.off('moveend', this._debouncedHandler);
    this._map.off('zoomend', this._debouncedHandler);
    this._map.off('pitchend', this._debouncedHandler);
  }

  /**
   * Gets the current viewport information.
   *
   * @returns ViewportInfo object with bounds, center, zoom, pitch, and targetDepth
   */
  getCurrentViewport(): ViewportInfo {
    const bounds = this._map.getBounds();
    const center = this._map.getCenter();
    const zoom = this._map.getZoom();
    const pitch = this._map.getPitch();

    return {
      bounds: [
        bounds.getWest(),
        bounds.getSouth(),
        bounds.getEast(),
        bounds.getNorth(),
      ],
      center: [center.lng, center.lat],
      zoom,
      pitch,
      targetDepth: this._calculateTargetDepth(zoom, pitch),
    };
  }

  /**
   * Calculates target octree depth based on zoom level and pitch.
   *
   * Mapping strategy:
   * - Zoom 0-10: depth 0-2 (overview)
   * - Zoom 10-14: depth 2-6 (city level)
   * - Zoom 14-18: depth 6-12 (block level)
   * - Zoom 18+: depth 12+ (detail level)
   *
   * Pitch adjustment: higher pitch (3D view) reduces depth to avoid
   * loading too many nodes in the distance.
   *
   * @param zoom - Current map zoom level
   * @param pitch - Current map pitch in degrees
   * @returns Target octree depth
   */
  private _calculateTargetDepth(zoom: number, pitch: number): number {
    let depth: number;

    if (this._spacing !== null) {
      // Use spacing-based calculation for more accurate depth
      // Ground resolution at current zoom (meters per pixel at equator)
      const groundRes = 156543.03 / Math.pow(2, zoom);

      // Target point spacing on screen (1 point every 2 pixels)
      const targetPointSpacing = groundRes * 2;

      // Calculate depth needed to achieve this spacing
      depth = Math.floor(Math.log2(this._spacing / targetPointSpacing));
      depth = Math.max(0, depth);
    } else {
      // Fallback: simple zoom-based mapping
      if (zoom < this._minDetailZoom) {
        // Low zoom - use very coarse LOD
        depth = Math.floor(zoom / 5);
      } else {
        // Map zoom to depth with a reasonable curve
        // zoom 10 -> depth 2
        // zoom 14 -> depth 6
        // zoom 18 -> depth 10
        // zoom 22 -> depth 14
        depth = Math.floor(2 + (zoom - this._minDetailZoom) * 1.0);
      }
    }

    // Pitch adjustment: reduce depth for tilted views
    // At 60 degrees pitch, reduce depth by 2
    const pitchRadians = (pitch * Math.PI) / 180;
    const pitchFactor = Math.cos(pitchRadians);
    const pitchReduction = Math.floor((1 - pitchFactor) * 3);
    depth = Math.max(0, depth - pitchReduction);

    // Clamp to max depth
    return Math.min(depth, this._maxOctreeDepth);
  }

  /**
   * Handles viewport change events.
   */
  private _handleViewportChange(): void {
    if (!this._isActive) return;
    const viewport = this.getCurrentViewport();
    this._onViewportChange(viewport);
  }

  /**
   * Forces a viewport update (e.g., after initial data load or fly animation).
   */
  forceUpdate(): void {
    this._handleViewportChange();
  }

  /**
   * Updates the spacing value used for depth calculation.
   *
   * @param spacing - Octree spacing from COPC file
   */
  setSpacing(spacing: number): void {
    this._spacing = spacing;
  }

  /**
   * Checks if the viewport manager is currently active.
   *
   * @returns True if listening for viewport changes
   */
  isActive(): boolean {
    return this._isActive;
  }

  /**
   * Destroys the viewport manager and removes all event listeners.
   */
  destroy(): void {
    this.stop();
  }
}
