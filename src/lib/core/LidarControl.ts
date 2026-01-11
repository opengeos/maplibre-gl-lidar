import type { IControl, Map as MapLibreMap } from 'maplibre-gl';
import type {
  LidarControlOptions,
  LidarState,
  LidarControlEvent,
  LidarControlEventHandler,
  LidarEventData,
  PointCloudInfo,
  ColorScheme,
} from './types';
import type { PickedPointInfo } from '../layers/types';
import { DeckOverlay } from './DeckOverlay';
import { PointCloudLoader } from '../loaders/PointCloudLoader';
import { PointCloudManager } from '../layers/PointCloudManager';
import { PanelBuilder } from '../gui/PanelBuilder';
import { generateId, getFilename } from '../utils/helpers';

/**
 * Default options for the LidarControl
 */
const DEFAULT_OPTIONS: Required<LidarControlOptions> = {
  collapsed: true,
  position: 'top-right',
  title: 'LiDAR Viewer',
  panelWidth: 365,
  className: '',
  pointSize: 2,
  opacity: 1.0,
  colorScheme: 'elevation',
  pointBudget: 1000000,
  elevationRange: null,
  pickable: false,
  autoZoom: true,
};

/**
 * Event handlers map type
 */
type EventHandlersMap = globalThis.Map<LidarControlEvent, Set<LidarControlEventHandler>>;

/**
 * A MapLibre GL control for visualizing and styling LiDAR point clouds.
 *
 * @example
 * ```typescript
 * const lidarControl = new LidarControl({
 *   title: 'LiDAR Viewer',
 *   collapsed: true,
 *   pointSize: 2,
 *   colorScheme: 'elevation',
 * });
 * map.addControl(lidarControl, 'top-right');
 *
 * // Load a point cloud
 * await lidarControl.loadPointCloud('https://example.com/pointcloud.laz');
 * ```
 */
export class LidarControl implements IControl {
  private _map?: MapLibreMap;
  private _container?: HTMLElement;
  private _panel?: HTMLElement;
  private _options: Required<LidarControlOptions>;
  private _state: LidarState;
  private _eventHandlers: EventHandlersMap = new globalThis.Map();

  // Core components
  private _deckOverlay?: DeckOverlay;
  private _pointCloudManager?: PointCloudManager;
  private _loader: PointCloudLoader;
  private _panelBuilder?: PanelBuilder;
  private _tooltip?: HTMLElement;

  /**
   * Creates a new LidarControl instance.
   *
   * @param options - Configuration options for the control
   */
  constructor(options?: Partial<LidarControlOptions>) {
    this._options = { ...DEFAULT_OPTIONS, ...options };
    this._state = {
      collapsed: this._options.collapsed,
      panelWidth: this._options.panelWidth,
      pointClouds: [],
      activePointCloudId: null,
      pointSize: this._options.pointSize,
      opacity: this._options.opacity,
      colorScheme: this._options.colorScheme,
      elevationRange: this._options.elevationRange,
      pointBudget: this._options.pointBudget,
      pickable: this._options.pickable,
      loading: false,
      error: null,
    };
    this._loader = new PointCloudLoader();
  }

  /**
   * Called when the control is added to the map.
   * Implements the IControl interface.
   *
   * @param map - The MapLibre GL map instance
   * @returns The control's container element
   */
  onAdd(map: MapLibreMap): HTMLElement {
    this._map = map;

    // Initialize deck.gl overlay
    this._deckOverlay = new DeckOverlay(map);

    // Initialize point cloud manager
    this._pointCloudManager = new PointCloudManager(this._deckOverlay, {
      pointSize: this._state.pointSize,
      opacity: this._state.opacity,
      colorScheme: this._state.colorScheme,
      elevationRange: this._state.elevationRange,
      pickable: this._state.pickable,
      onHover: (info) => this._handlePointHover(info),
    });

    // Create tooltip element
    this._tooltip = this._createTooltip();
    document.body.appendChild(this._tooltip);

    // Create UI
    this._container = this._createContainer();
    this._panel = this._createPanel();
    this._container.appendChild(this._panel);

    // Set initial panel state
    if (!this._state.collapsed) {
      this._panel.classList.add('expanded');
    }

    return this._container;
  }

  /**
   * Called when the control is removed from the map.
   * Implements the IControl interface.
   */
  onRemove(): void {
    // Clean up deck.gl overlay
    this._deckOverlay?.destroy();

    // Remove tooltip
    this._tooltip?.parentNode?.removeChild(this._tooltip);

    // Remove DOM elements
    this._container?.parentNode?.removeChild(this._container);

    // Clear references
    this._map = undefined;
    this._container = undefined;
    this._panel = undefined;
    this._deckOverlay = undefined;
    this._pointCloudManager = undefined;
    this._panelBuilder = undefined;
    this._tooltip = undefined;
    this._eventHandlers.clear();
  }

  /**
   * Gets the current state of the control.
   *
   * @returns The current LiDAR state
   */
  getState(): LidarState {
    return { ...this._state };
  }

  /**
   * Updates the control state.
   *
   * @param newState - Partial state to merge with current state
   */
  setState(newState: Partial<LidarState>): void {
    this._state = { ...this._state, ...newState };
    this._panelBuilder?.updateState(this._state);
    this._emit('statechange');
  }

  /**
   * Toggles the collapsed state of the control panel.
   */
  toggle(): void {
    this._state.collapsed = !this._state.collapsed;

    if (this._panel) {
      if (this._state.collapsed) {
        this._panel.classList.remove('expanded');
        this._emit('collapse');
      } else {
        this._panel.classList.add('expanded');
        this._emit('expand');
      }
    }

    this._emit('statechange');
  }

  /**
   * Expands the control panel.
   */
  expand(): void {
    if (this._state.collapsed) {
      this.toggle();
    }
  }

  /**
   * Collapses the control panel.
   */
  collapse(): void {
    if (!this._state.collapsed) {
      this.toggle();
    }
  }

  /**
   * Registers an event handler.
   *
   * @param event - The event type to listen for
   * @param handler - The callback function
   */
  on(event: LidarControlEvent, handler: LidarControlEventHandler): void {
    if (!this._eventHandlers.has(event)) {
      this._eventHandlers.set(event, new Set());
    }
    this._eventHandlers.get(event)!.add(handler);
  }

  /**
   * Removes an event handler.
   *
   * @param event - The event type
   * @param handler - The callback function to remove
   */
  off(event: LidarControlEvent, handler: LidarControlEventHandler): void {
    this._eventHandlers.get(event)?.delete(handler);
  }

  /**
   * Gets the map instance.
   *
   * @returns The MapLibre GL map instance or undefined if not added to a map
   */
  getMap(): MapLibreMap | undefined {
    return this._map;
  }

  /**
   * Gets the control container element.
   *
   * @returns The container element or undefined if not added to a map
   */
  getContainer(): HTMLElement | undefined {
    return this._container;
  }

  /**
   * Gets the deck.gl overlay instance.
   *
   * @returns The DeckOverlay or undefined if not added to a map
   */
  getDeckOverlay(): DeckOverlay | undefined {
    return this._deckOverlay;
  }

  // ==================== LiDAR API ====================

  /**
   * Loads a point cloud from a URL, File, or ArrayBuffer.
   *
   * @param source - URL string, File object, or ArrayBuffer
   * @returns Promise resolving to the point cloud info
   */
  async loadPointCloud(source: string | File | ArrayBuffer): Promise<PointCloudInfo> {
    const id = generateId('pc');

    // Determine name
    let name: string;
    if (typeof source === 'string') {
      name = getFilename(source);
    } else if (source instanceof File) {
      name = source.name;
    } else {
      name = `PointCloud ${id}`;
    }

    // Update state
    this.setState({ loading: true, error: null });
    this._emit('loadstart');

    // Progress callback to update the UI
    const onProgress = (progress: number, message: string) => {
      this._panelBuilder?.updateLoadingProgress(progress, message);
    };

    try {
      // Load the point cloud with progress reporting
      const data = await this._loader.load(source, onProgress);

      // Report final progress
      onProgress(95, 'Creating visualization layers...');

      // Add to manager
      this._pointCloudManager?.addPointCloud(id, data);

      onProgress(100, 'Complete!');

      // Create info object
      const info: PointCloudInfo = {
        id,
        name,
        pointCount: data.pointCount,
        bounds: data.bounds,
        hasRGB: data.hasRGB,
        hasIntensity: data.hasIntensity,
        hasClassification: data.hasClassification,
        source: typeof source === 'string' ? source : 'file',
        wkt: data.wkt,
      };

      // Update state
      const pointClouds = [...this._state.pointClouds, info];
      this.setState({
        loading: false,
        pointClouds,
        activePointCloudId: id,
      });

      // Emit load event
      this._emitWithData('load', { pointCloud: info });

      // Auto-zoom to the loaded point cloud
      if (this._options.autoZoom) {
        this.flyToPointCloud(id);
      }

      return info;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.setState({
        loading: false,
        error: `Failed to load: ${error.message}`,
      });
      this._emitWithData('loaderror', { error });
      throw error;
    }
  }

  /**
   * Unloads a point cloud.
   *
   * @param id - ID of the point cloud to unload (or undefined to unload all)
   */
  unloadPointCloud(id?: string): void {
    if (id) {
      this._pointCloudManager?.removePointCloud(id);
      const pointClouds = this._state.pointClouds.filter((pc) => pc.id !== id);
      this.setState({
        pointClouds,
        activePointCloudId:
          this._state.activePointCloudId === id
            ? pointClouds[0]?.id || null
            : this._state.activePointCloudId,
      });
      this._emit('unload');
    } else {
      // Unload all
      this._pointCloudManager?.clear();
      this.setState({ pointClouds: [], activePointCloudId: null });
      this._emit('unload');
    }
  }

  /**
   * Sets the point size.
   *
   * @param size - Point size in pixels
   */
  setPointSize(size: number): void {
    this._state.pointSize = size;
    this._pointCloudManager?.setPointSize(size);
    this._emit('stylechange');
    this._emit('statechange');
  }

  /**
   * Sets the opacity.
   *
   * @param opacity - Opacity value (0-1)
   */
  setOpacity(opacity: number): void {
    this._state.opacity = opacity;
    this._pointCloudManager?.setOpacity(opacity);
    this._emit('stylechange');
    this._emit('statechange');
  }

  /**
   * Sets the color scheme.
   *
   * @param scheme - Color scheme to apply
   */
  setColorScheme(scheme: ColorScheme): void {
    this._state.colorScheme = scheme;
    this._pointCloudManager?.setColorScheme(scheme);
    this._emit('stylechange');
    this._emit('statechange');
  }

  /**
   * Sets the elevation range filter.
   *
   * @param min - Minimum elevation
   * @param max - Maximum elevation
   */
  setElevationRange(min: number, max: number): void {
    this._state.elevationRange = [min, max];
    this._pointCloudManager?.setElevationRange([min, max]);
    this._emit('stylechange');
    this._emit('statechange');
  }

  /**
   * Clears the elevation range filter.
   */
  clearElevationRange(): void {
    this._state.elevationRange = null;
    this._pointCloudManager?.setElevationRange(null);
    this._emit('stylechange');
    this._emit('statechange');
  }

  /**
   * Sets the point budget.
   *
   * @param budget - Maximum number of points to display
   */
  setPointBudget(budget: number): void {
    this._state.pointBudget = budget;
    this._emit('statechange');
  }

  /**
   * Sets whether points are pickable (enables hover/click interactions).
   *
   * @param pickable - Whether points should be pickable
   */
  setPickable(pickable: boolean): void {
    this._state.pickable = pickable;
    this._pointCloudManager?.setPickable(pickable);
    this._emit('stylechange');
    this._emit('statechange');
  }

  /**
   * Gets information about loaded point clouds.
   *
   * @returns Array of point cloud info objects
   */
  getPointClouds(): PointCloudInfo[] {
    return [...this._state.pointClouds];
  }

  /**
   * Flies the map to a point cloud's bounds.
   *
   * @param id - ID of the point cloud (or undefined for active/first)
   */
  flyToPointCloud(id?: string): void {
    const targetId = id || this._state.activePointCloudId || this._state.pointClouds[0]?.id;
    if (!targetId) return;

    const bounds = this._pointCloudManager?.getPointCloudBounds(targetId);
    if (!bounds || !this._map) return;

    // Bounds are already in WGS84 (transformed during loading if needed)
    // Validate coordinates are in valid lat/lng range
    if (Math.abs(bounds.minY) > 90 || Math.abs(bounds.maxY) > 90 ||
        Math.abs(bounds.minX) > 180 || Math.abs(bounds.maxX) > 180) {
      console.error('Cannot fly to point cloud: coordinates are not in WGS84 range');
      return;
    }

    // Fly to bounds
    this._map.fitBounds(
      [
        [bounds.minX, bounds.minY],
        [bounds.maxX, bounds.maxY],
      ],
      {
        padding: 50,
        duration: 1000,
      }
    );
  }

  // ==================== Private Methods ====================

  /**
   * Emits an event to all registered handlers.
   *
   * @param event - The event type to emit
   */
  private _emit(event: LidarControlEvent): void {
    const handlers = this._eventHandlers.get(event);
    if (handlers) {
      const eventData: LidarEventData = { type: event, state: this.getState() };
      handlers.forEach((handler) => handler(eventData));
    }
  }

  /**
   * Emits an event with additional data.
   *
   * @param event - The event type to emit
   * @param data - Additional event data
   */
  private _emitWithData(event: LidarControlEvent, data: Partial<LidarEventData>): void {
    const handlers = this._eventHandlers.get(event);
    if (handlers) {
      const eventData: LidarEventData = { type: event, state: this.getState(), ...data };
      handlers.forEach((handler) => handler(eventData));
    }
  }

  /**
   * Creates the main container element for the control.
   *
   * @returns The container element
   */
  private _createContainer(): HTMLElement {
    const container = document.createElement('div');
    container.className = `maplibregl-ctrl maplibregl-ctrl-group lidar-control${
      this._options.className ? ` ${this._options.className}` : ''
    }`;

    // Create toggle button (29x29 to match navigation control)
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'lidar-control-toggle';
    toggleBtn.type = 'button';
    toggleBtn.setAttribute('aria-label', this._options.title);
    toggleBtn.innerHTML = `
      <span class="lidar-control-icon">
        <svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="1.5" fill="none">
          <circle cx="12" cy="12" r="2"/>
          <circle cx="12" cy="5" r="1.5"/>
          <circle cx="12" cy="19" r="1.5"/>
          <circle cx="5" cy="12" r="1.5"/>
          <circle cx="19" cy="12" r="1.5"/>
          <circle cx="7" cy="7" r="1"/>
          <circle cx="17" cy="7" r="1"/>
          <circle cx="7" cy="17" r="1"/>
          <circle cx="17" cy="17" r="1"/>
        </svg>
      </span>
    `;
    toggleBtn.addEventListener('click', () => this.toggle());

    container.appendChild(toggleBtn);

    return container;
  }

  /**
   * Creates the panel element with header and content areas.
   *
   * @returns The panel element
   */
  private _createPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'lidar-control-panel';
    panel.style.width = `${this._options.panelWidth}px`;

    // Create header with title and close button
    const header = document.createElement('div');
    header.className = 'lidar-control-header';

    const title = document.createElement('span');
    title.className = 'lidar-control-title';
    title.textContent = this._options.title;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'lidar-control-close';
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close panel');
    closeBtn.innerHTML = '&times;';
    closeBtn.addEventListener('click', () => this.collapse());

    header.appendChild(title);
    header.appendChild(closeBtn);

    // Create content area using PanelBuilder
    this._panelBuilder = new PanelBuilder(
      panel,
      {
        onFileSelect: (file) => this.loadPointCloud(file),
        onUrlSubmit: (url) => this.loadPointCloud(url),
        onPointSizeChange: (size) => this.setPointSize(size),
        onOpacityChange: (opacity) => this.setOpacity(opacity),
        onColorSchemeChange: (scheme) => this.setColorScheme(scheme),
        onElevationRangeChange: (range) => {
          if (range) {
            this.setElevationRange(range[0], range[1]);
          } else {
            this.clearElevationRange();
          }
        },
        onPickableChange: (pickable) => this.setPickable(pickable),
        onUnload: (id) => this.unloadPointCloud(id),
        onZoomTo: (id) => this.flyToPointCloud(id),
      },
      this._state
    );

    const content = this._panelBuilder.build();

    panel.appendChild(header);
    panel.appendChild(content);

    return panel;
  }

  /**
   * Creates the tooltip element for point picking.
   *
   * @returns The tooltip element
   */
  private _createTooltip(): HTMLElement {
    const tooltip = document.createElement('div');
    tooltip.className = 'lidar-tooltip';
    tooltip.style.cssText = `
      position: fixed;
      pointer-events: none;
      background: rgba(0, 0, 0, 0.85);
      color: white;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 12px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      z-index: 10000;
      display: none;
      white-space: nowrap;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    `;
    return tooltip;
  }

  /**
   * Handles point hover events from the point cloud layer.
   *
   * @param info - Picked point information or null if no point
   */
  private _handlePointHover(info: PickedPointInfo | null): void {
    if (!this._tooltip) return;

    if (info && this._state.pickable) {
      // Format classification name
      const classNames: Record<number, string> = {
        0: 'Never Classified',
        1: 'Unassigned',
        2: 'Ground',
        3: 'Low Vegetation',
        4: 'Medium Vegetation',
        5: 'High Vegetation',
        6: 'Building',
        7: 'Low Point',
        8: 'Reserved',
        9: 'Water',
        10: 'Rail',
        11: 'Road Surface',
        12: 'Reserved',
        13: 'Wire - Guard',
        14: 'Wire - Conductor',
        15: 'Transmission Tower',
        16: 'Wire - Connector',
        17: 'Bridge Deck',
        18: 'High Noise',
      };

      let html = `
        <div style="margin-bottom: 4px; font-weight: 600; border-bottom: 1px solid rgba(255,255,255,0.3); padding-bottom: 4px;">Point Info</div>
        <div>Lng: ${info.longitude.toFixed(6)}</div>
        <div>Lat: ${info.latitude.toFixed(6)}</div>
        <div>Elevation: ${info.elevation.toFixed(2)} m</div>
      `;

      if (info.intensity !== undefined) {
        html += `<div>Intensity: ${(info.intensity * 100).toFixed(1)}%</div>`;
      }

      if (info.classification !== undefined) {
        const className = classNames[info.classification] || `Class ${info.classification}`;
        html += `<div>Class: ${className}</div>`;
      }

      this._tooltip.innerHTML = html;
      this._tooltip.style.display = 'block';
      this._tooltip.style.left = `${info.x + 15}px`;
      this._tooltip.style.top = `${info.y + 15}px`;
    } else {
      this._tooltip.style.display = 'none';
    }
  }
}
