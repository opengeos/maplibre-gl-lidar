import type { IControl, Map as MapLibreMap } from 'maplibre-gl';
import type {
  LidarControlOptions,
  LidarState,
  LidarControlEvent,
  LidarControlEventHandler,
  LidarEventData,
  PointCloudInfo,
  ColorScheme,
  CopcLoadingMode,
} from './types';
import type { PickedPointInfo } from '../layers/types';
import type { StreamingLoaderOptions, ViewportInfo, StreamingProgressEvent } from '../loaders/streaming-types';
import { DeckOverlay } from './DeckOverlay';
import { PointCloudLoader } from '../loaders/PointCloudLoader';
import { CopcStreamingLoader } from '../loaders/CopcStreamingLoader';
import { EptStreamingLoader } from '../loaders/EptStreamingLoader';
import { PointCloudManager } from '../layers/PointCloudManager';
import { ViewportManager } from './ViewportManager';
import { PanelBuilder } from '../gui/PanelBuilder';
import { generateId, getFilename, computePercentileBounds } from '../utils/helpers';
import { getAvailableClassifications } from '../colorizers/ColorScheme';

/**
 * Default options for the LidarControl
 */
const DEFAULT_OPTIONS: Required<Omit<LidarControlOptions, 'pickInfoFields' | 'copcLoadingMode'>> & Pick<LidarControlOptions, 'pickInfoFields' | 'copcLoadingMode'> = {
  collapsed: true,
  position: 'top-right',
  title: 'LiDAR Viewer',
  panelWidth: 365,
  panelMaxHeight: 600,
  className: '',
  pointSize: 2,
  opacity: 1.0,
  colorScheme: 'elevation',
  usePercentile: true,
  pointBudget: 1000000,
  elevationRange: null,
  pickable: false,
  autoZoom: true,
  pickInfoFields: undefined, // Show all fields by default
  zOffsetEnabled: false,
  zOffset: 0,
  autoZOffset: true, // Automatically calculate Z offset from 2nd percentile
  copcLoadingMode: undefined, // Auto-detect: 'dynamic' for COPC URLs, 'full' otherwise
  streamingPointBudget: 5_000_000,
  streamingMaxConcurrentRequests: 4,
  streamingViewportDebounceMs: 150,
  terrainEnabled: false,
  terrainExaggeration: 1.0,
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
  private _mapContainer?: HTMLElement;
  private _container?: HTMLElement;
  private _panel?: HTMLElement;
  private _options: Required<Omit<LidarControlOptions, 'pickInfoFields' | 'copcLoadingMode'>> & Pick<LidarControlOptions, 'pickInfoFields' | 'copcLoadingMode'>;
  private _state: LidarState;
  private _eventHandlers: EventHandlersMap = new globalThis.Map();

  // Panel positioning handlers
  private _resizeHandler: (() => void) | null = null;
  private _mapResizeHandler: (() => void) | null = null;
  private _clickOutsideHandler: ((e: MouseEvent) => void) | null = null;

  // Core components
  private _deckOverlay?: DeckOverlay;
  private _pointCloudManager?: PointCloudManager;
  private _loader: PointCloudLoader;
  private _panelBuilder?: PanelBuilder;
  private _tooltip?: HTMLElement;

  // Streaming components - Maps to support multiple streaming datasets
  private _streamingLoaders: Map<string, CopcStreamingLoader> = new Map();
  private _eptStreamingLoaders: Map<string, EptStreamingLoader> = new Map();
  private _viewportManagers: Map<string, ViewportManager> = new Map();

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
      panelMaxHeight: this._options.panelMaxHeight,
      pointClouds: [],
      activePointCloudId: null,
      pointSize: this._options.pointSize,
      opacity: this._options.opacity,
      colorScheme: this._options.colorScheme,
      usePercentile: this._options.usePercentile,
      elevationRange: this._options.elevationRange,
      pointBudget: this._options.pointBudget,
      pickable: this._options.pickable,
      loading: false,
      error: null,
      pickInfoFields: this._options.pickInfoFields,
      zOffsetEnabled: this._options.zOffsetEnabled ?? false,
      zOffset: this._options.zOffset ?? 0,
      hiddenClassifications: new Set(),
      availableClassifications: new Set(),
      terrainEnabled: this._options.terrainEnabled ?? false,
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
    this._mapContainer = map.getContainer();

    // Initialize deck.gl overlay
    this._deckOverlay = new DeckOverlay(map);

    // Initialize point cloud manager
    this._pointCloudManager = new PointCloudManager(this._deckOverlay, {
      pointSize: this._state.pointSize,
      opacity: this._state.opacity,
      colorScheme: this._state.colorScheme,
      usePercentile: this._state.usePercentile,
      elevationRange: this._state.elevationRange,
      pickable: this._state.pickable,
      zOffset: this._state.zOffset,
      onHover: (info) => this._handlePointHover(info),
    });

    // Create tooltip element
    this._tooltip = this._createTooltip();
    document.body.appendChild(this._tooltip);

    // Create UI
    this._container = this._createContainer();
    this._panel = this._createPanel();

    // Append panel to map container for independent positioning (avoids overlap with other controls)
    this._mapContainer.appendChild(this._panel);

    // Setup event listeners for panel positioning and click-outside
    this._setupEventListeners();

    // Set initial panel state
    if (!this._state.collapsed) {
      this._panel.classList.add('expanded');
      // Update position after control is added to DOM
      requestAnimationFrame(() => {
        this._updatePanelPosition();
      });
    }

    // Apply initial terrain state if enabled in options
    if (this._state.terrainEnabled) {
      this.setTerrain(true);
    }

    return this._container;
  }

  /**
   * Called when the control is removed from the map.
   * Implements the IControl interface.
   */
  onRemove(): void {
    // Stop streaming if active
    this.stopStreaming();

    // Clean up deck.gl overlay
    this._deckOverlay?.destroy();

    // Remove event listeners
    if (this._resizeHandler) {
      window.removeEventListener('resize', this._resizeHandler);
      this._resizeHandler = null;
    }
    if (this._mapResizeHandler && this._map) {
      this._map.off('resize', this._mapResizeHandler);
      this._mapResizeHandler = null;
    }
    if (this._clickOutsideHandler) {
      document.removeEventListener('click', this._clickOutsideHandler);
      this._clickOutsideHandler = null;
    }

    // Remove tooltip
    this._tooltip?.parentNode?.removeChild(this._tooltip);

    // Remove panel from map container
    this._panel?.parentNode?.removeChild(this._panel);

    // Remove button container from control stack
    this._container?.parentNode?.removeChild(this._container);

    // Clear references
    this._map = undefined;
    this._mapContainer = undefined;
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
        this._updatePanelPosition();
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
   * For COPC files loaded from URL, defaults to dynamic streaming mode.
   * Non-COPC files or local files use full download mode.
   *
   * @param source - URL string, File object, or ArrayBuffer
   * @param options - Optional loading options including loadingMode override
   * @returns Promise resolving to the point cloud info
   */
  async loadPointCloud(
    source: string | File | ArrayBuffer,
    options?: { loadingMode?: CopcLoadingMode }
  ): Promise<PointCloudInfo> {
    // Check if this is an EPT dataset (URL ending with ept.json)
    const isEptUrl =
      typeof source === 'string' &&
      (source.endsWith('/ept.json') || source.includes('/ept.json?'));

    // Route EPT URLs to EPT streaming loader
    if (isEptUrl) {
      return this.loadPointCloudEptStreaming(source as string);
    }

    // Check if this is a COPC file
    const isCopcUrl =
      typeof source === 'string' &&
      (source.startsWith('http://') || source.startsWith('https://')) &&
      /\.copc\./i.test(source);

    const isCopcFile =
      source instanceof File && /\.copc\./i.test(source.name);

    const isCopc = isCopcUrl || isCopcFile;

    // Determine loading mode:
    // - If explicitly specified in options, use that
    // - If set in control options, use that
    // - For COPC (URL or local file), default to 'dynamic'
    // - Otherwise default to 'full'
    const mode =
      options?.loadingMode ??
      this._options.copcLoadingMode ??
      (isCopc ? 'dynamic' : 'full');

    // Use streaming mode for COPC sources with dynamic mode
    if (mode === 'dynamic' && isCopc) {
      return this.loadPointCloudStreaming(source);
    }

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

      // Auto Z offset: calculate and apply based on 2nd percentile of elevation
      let zOffsetBase: number | undefined;
      let zOffset: number | undefined;
      let zOffsetEnabled = this._state.zOffsetEnabled;

      if (this._options.autoZOffset && data.positions && data.pointCount > 0) {
        // Extract Z values and compute 2nd percentile (same as used for elevation coloring)
        const zValues = new Float32Array(data.pointCount);
        for (let i = 0; i < data.pointCount; i++) {
          zValues[i] = data.positions[i * 3 + 2] ?? 0;
        }
        const percentileBounds = computePercentileBounds(zValues, 2, 98);
        zOffsetBase = percentileBounds.min; // 2% percentile value (ground level)
        // Apply negative offset to convert absolute elevation to relative height above ground
        zOffset = -zOffsetBase;
        zOffsetEnabled = true;
        this._pointCloudManager?.setZOffset(zOffset);
        console.log(`Auto Z offset applied: zOffsetBase=${zOffsetBase.toFixed(1)}, zOffset=${zOffset.toFixed(1)}, enabled=${zOffsetEnabled}`);
      } else {
        console.log('Auto Z offset skipped - conditions not met');
      }

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

      // Extract available classifications and merge with existing
      const newClassifications = getAvailableClassifications(data);
      const mergedClassifications = new Set([
        ...this._state.availableClassifications,
        ...newClassifications,
      ]);

      // Update state (include z-offset values to trigger panel update)
      const pointClouds = [...this._state.pointClouds, info];
      this.setState({
        loading: false,
        pointClouds,
        activePointCloudId: id,
        availableClassifications: mergedClassifications,
        zOffsetBase,
        zOffset: zOffset ?? this._state.zOffset,
        zOffsetEnabled,
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

      // Check if this is a CORS error and source is a URL - fallback to download
      const isCorsError =
        error.message.includes('CORS') ||
        error.message === 'Failed to fetch' ||
        (err instanceof TypeError && error.message === 'Failed to fetch');

      const isUrl =
        typeof source === 'string' &&
        (source.startsWith('http://') || source.startsWith('https://'));

      if (isCorsError && isUrl) {
        console.warn(
          `CORS error detected for ${source}. Falling back to download mode...`
        );

        this._panelBuilder?.updateLoadingProgress(5, 'CORS blocked - downloading file...');

        // Fallback to full download
        return this._loadPointCloudFullDownload(source);
      }

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
      // Check if this is a streaming point cloud (COPC or EPT)
      if (this._streamingLoaders.has(id) || this._eptStreamingLoaders.has(id)) {
        this.stopStreaming(id);
        return;
      }

      this._pointCloudManager?.removePointCloud(id);
      const pointClouds = this._state.pointClouds.filter((pc) => pc.id !== id);

      // Reset classification state when removing datasets
      // (classifications will be re-extracted when new data is loaded)
      const stateUpdate: Partial<LidarState> = {
        pointClouds,
        activePointCloudId:
          this._state.activePointCloudId === id
            ? pointClouds[0]?.id || null
            : this._state.activePointCloudId,
        availableClassifications: new Set(),
        hiddenClassifications: new Set(),
      };

      this.setState(stateUpdate);
      this._emitWithData('unload', { pointCloud: { id } });
    } else {
      // Unload all including streaming
      // Emit unload events for each point cloud before clearing
      const allIds = this._state.pointClouds.map((pc) => pc.id);
      this.stopStreaming();
      this._pointCloudManager?.clear();
      this.setState({
        pointClouds: [],
        activePointCloudId: null,
        availableClassifications: new Set(),
        hiddenClassifications: new Set(),
      });
      // Emit unload event for each removed point cloud
      for (const removedId of allIds) {
        this._emitWithData('unload', { pointCloud: { id: removedId } });
      }
    }
  }

  /**
   * Loads a point cloud using streaming (on-demand) loading.
   * Ideal for large COPC files - supports both URLs and local files.
   * Points are loaded dynamically based on viewport and zoom level.
   *
   * @param source - URL string, File object, or ArrayBuffer
   * @param options - Optional streaming options
   * @returns Promise resolving to initial point cloud info
   */
  async loadPointCloudStreaming(
    source: string | File | ArrayBuffer,
    options?: StreamingLoaderOptions
  ): Promise<PointCloudInfo> {
    const id = generateId('pc-stream');

    // Determine name based on source type
    let name: string;
    if (typeof source === 'string') {
      name = getFilename(source);
    } else if (source instanceof File) {
      name = source.name;
    } else {
      name = `PointCloud ${id}`;
    }

    this.setState({ loading: true, error: null, streamingActive: true });
    this._emit('loadstart');
    this._emit('streamingstart');

    try {
      // Create streaming loader with options
      const streamingLoader = new CopcStreamingLoader(source, {
        pointBudget: options?.pointBudget ?? this._options.streamingPointBudget,
        maxConcurrentRequests:
          options?.maxConcurrentRequests ?? this._options.streamingMaxConcurrentRequests,
        viewportDebounceMs:
          options?.viewportDebounceMs ?? this._options.streamingViewportDebounceMs,
        minDetailZoom: options?.minDetailZoom ?? 10,
        maxOctreeDepth: options?.maxOctreeDepth ?? 20,
      });

      // Initialize - reads header and root hierarchy
      this._panelBuilder?.updateLoadingProgress(10, 'Initializing COPC file...');
      const { bounds, totalPoints, hasRGB, spacing } =
        await streamingLoader.initialize();

      this._panelBuilder?.updateLoadingProgress(20, 'Setting up streaming...');

      // Track if auto Z offset has been applied for this streaming dataset
      let autoZOffsetApplied = false;

      // Setup callback for when points are loaded
      streamingLoader.setOnPointsLoaded((data) => {
        this._pointCloudManager?.updatePointCloud(id, data);

        // Auto Z offset: use bounds.minZ from the COPC header (reliable source)
        if (this._options.autoZOffset && !autoZOffsetApplied && data.bounds) {
          // Use bounds.minZ as the ground level (from file header, always accurate)
          const zOffsetBase = data.bounds.minZ;

          // Apply negative offset to convert absolute elevation to relative height above ground
          const zOffset = -zOffsetBase;
          this._pointCloudManager?.setZOffset(zOffset);
          console.log(`Auto Z offset applied (streaming): ${zOffset.toFixed(1)}m (ground level from bounds: ${zOffsetBase.toFixed(1)}m)`);
          // Update state to trigger panel slider update
          this.setState({
            zOffsetBase,
            zOffset,
            zOffsetEnabled: true,
          });
          autoZOffsetApplied = true;
        }

        // Extract and merge classifications from streamed data
        const newClassifications = getAvailableClassifications(data);
        if (newClassifications.size > 0) {
          const mergedClassifications = new Set([
            ...this._state.availableClassifications,
            ...newClassifications,
          ]);
          // Only update if we have new classifications
          if (mergedClassifications.size > this._state.availableClassifications.size) {
            this.setState({ availableClassifications: mergedClassifications });
          }
        }
      });

      // Setup event handlers
      streamingLoader.on('progress', (_, data) => {
        const progress = data as StreamingProgressEvent;
        this.setState({
          streamingProgress: {
            loadedNodes: progress.loadedNodes,
            loadedPoints: progress.loadedPoints,
            queueSize: progress.queueSize,
            isLoading: progress.isLoading,
          },
        });

        const percent = Math.min(
          99,
          20 + Math.round((progress.loadedPoints / progress.pointBudget) * 70)
        );
        this._panelBuilder?.updateLoadingProgress(
          percent,
          `Streaming: ${progress.loadedPoints.toLocaleString()} points loaded`
        );

        this._emit('streamingprogress');
      });

      streamingLoader.on('budgetreached', () => {
        this._emit('budgetreached');
      });

      // Store the streaming loader
      this._streamingLoaders.set(id, streamingLoader);

      // Create viewport manager for this dataset
      const viewportManager = new ViewportManager(
        this._map!,
        (viewport) => this._handleViewportChangeForStreaming(viewport, id),
        {
          debounceMs:
            options?.viewportDebounceMs ?? this._options.streamingViewportDebounceMs,
          minDetailZoom: options?.minDetailZoom ?? 10,
          maxOctreeDepth: options?.maxOctreeDepth ?? 20,
          spacing,
        }
      );

      // Store the viewport manager
      this._viewportManagers.set(id, viewportManager);

      // Create initial point cloud info
      const info: PointCloudInfo = {
        id,
        name: `${name}`,
        pointCount: totalPoints,
        bounds,
        hasRGB,
        hasIntensity: true,
        hasClassification: true,
        source: typeof source === 'string' ? source : name,
        wkt: undefined, // Will be available after first load
      };

      // Update state
      const pointClouds = [...this._state.pointClouds, info];
      this.setState({
        loading: false,
        pointClouds,
        activePointCloudId: id,
      });

      // Start viewport-based loading
      viewportManager.start();

      // Auto-zoom if enabled
      if (this._options.autoZoom) {
        // Validate and clamp bounds to valid WGS84 range before calling fitBounds
        const clampedMinY = Math.max(-90, Math.min(90, bounds.minY));
        const clampedMaxY = Math.max(-90, Math.min(90, bounds.maxY));
        const clampedMinX = Math.max(-180, Math.min(180, bounds.minX));
        const clampedMaxX = Math.max(-180, Math.min(180, bounds.maxX));

        // First fly to bounds
        this._map?.fitBounds(
          [
            [clampedMinX, clampedMinY],
            [clampedMaxX, clampedMaxY],
          ],
          {
            padding: 50,
            duration: 1000,
          }
        );

        // Wait for fly animation then trigger viewport update
        setTimeout(() => {
          viewportManager.forceUpdate();
        }, 1100);
      }

      this._emitWithData('load', { pointCloud: info });

      return info;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));

      // Check if this is a CORS error - fallback to downloading the file (only for URL sources)
      const isCorsError =
        error.message.includes('CORS') ||
        error.message === 'Failed to fetch' ||
        (err instanceof TypeError && error.message === 'Failed to fetch');

      if (isCorsError && typeof source === 'string') {
        console.warn(
          `CORS error detected for ${source}. Falling back to download mode...`
        );

        // Clean up streaming state for this dataset
        const streamingLoader = this._streamingLoaders.get(id);
        if (streamingLoader) {
          streamingLoader.destroy();
          this._streamingLoaders.delete(id);
        }
        const viewportManager = this._viewportManagers.get(id);
        if (viewportManager) {
          viewportManager.destroy();
          this._viewportManagers.delete(id);
        }

        // Update streamingActive state based on remaining loaders
        const hasActiveStreaming = this._streamingLoaders.size > 0;

        // Reset state and try downloading
        this.setState({
          loading: true,
          streamingActive: hasActiveStreaming,
          error: null,
        });

        this._panelBuilder?.updateLoadingProgress(5, 'CORS blocked - downloading file...');

        // Fallback to full download
        return this._loadPointCloudFullDownload(source);
      }

      this.setState({
        loading: false,
        streamingActive: false,
        error: `Failed to load: ${error.message}`,
      });
      this._emitWithData('loaderror', { error });
      throw error;
    }
  }

  /**
   * Loads an EPT (Entwine Point Tile) dataset using streaming (on-demand) loading.
   * Points are loaded dynamically based on viewport and zoom level.
   *
   * @param eptUrl - URL to ept.json file
   * @param options - Optional streaming options
   * @returns Promise resolving to initial point cloud info
   */
  async loadPointCloudEptStreaming(
    eptUrl: string,
    options?: StreamingLoaderOptions
  ): Promise<PointCloudInfo> {
    const id = generateId('ept-stream');
    const name = getFilename(eptUrl.replace('/ept.json', ''));

    this.setState({ loading: true, error: null, streamingActive: true });
    this._emit('loadstart');
    this._emit('streamingstart');

    try {
      // Create EPT streaming loader
      const eptLoader = new EptStreamingLoader(eptUrl, {
        pointBudget: options?.pointBudget ?? this._options.streamingPointBudget,
        maxConcurrentRequests:
          options?.maxConcurrentRequests ?? this._options.streamingMaxConcurrentRequests,
        viewportDebounceMs:
          options?.viewportDebounceMs ?? this._options.streamingViewportDebounceMs,
        minDetailZoom: options?.minDetailZoom ?? 10,
        maxOctreeDepth: options?.maxOctreeDepth ?? 20,
      });

      // Initialize - reads ept.json metadata
      this._panelBuilder?.updateLoadingProgress(10, 'Initializing EPT dataset...');
      const { bounds, totalPoints, hasRGB, spacing } = await eptLoader.initialize();

      this._panelBuilder?.updateLoadingProgress(20, 'Setting up streaming...');

      // Track if auto Z offset has been applied
      let autoZOffsetApplied = false;

      // Setup callback for when points are loaded
      eptLoader.setOnPointsLoaded((data) => {
        this._pointCloudManager?.updatePointCloud(id, data);

        // Auto Z offset
        if (this._options.autoZOffset && !autoZOffsetApplied && data.bounds) {
          const zOffsetBase = data.bounds.minZ;
          const zOffset = -zOffsetBase;
          this._pointCloudManager?.setZOffset(zOffset);
          console.log(`Auto Z offset applied (EPT streaming): ${zOffset.toFixed(1)}m`);
          this.setState({
            zOffsetBase,
            zOffset,
            zOffsetEnabled: true,
          });
          autoZOffsetApplied = true;
        }

        // Extract and merge classifications
        const newClassifications = getAvailableClassifications(data);
        if (newClassifications.size > 0) {
          const mergedClassifications = new Set([
            ...this._state.availableClassifications,
            ...newClassifications,
          ]);
          if (mergedClassifications.size > this._state.availableClassifications.size) {
            this.setState({ availableClassifications: mergedClassifications });
          }
        }
      });

      // Setup event handlers
      eptLoader.on('progress', (_, data) => {
        const progress = data as StreamingProgressEvent;
        this.setState({
          streamingProgress: {
            loadedNodes: progress.loadedNodes,
            loadedPoints: progress.loadedPoints,
            queueSize: progress.queueSize,
            isLoading: progress.isLoading,
          },
        });

        const percent = Math.min(
          99,
          20 + Math.round((progress.loadedPoints / progress.pointBudget) * 70)
        );
        this._panelBuilder?.updateLoadingProgress(
          percent,
          `Streaming EPT: ${progress.loadedPoints.toLocaleString()} points loaded`
        );

        this._emit('streamingprogress');
      });

      eptLoader.on('budgetreached', () => {
        this._emit('budgetreached');
      });

      // Store the EPT loader
      this._eptStreamingLoaders.set(id, eptLoader);

      // Create viewport manager for this dataset
      const viewportManager = new ViewportManager(
        this._map!,
        (viewport) => this._handleViewportChangeForEptStreaming(viewport, id),
        {
          debounceMs:
            options?.viewportDebounceMs ?? this._options.streamingViewportDebounceMs,
          minDetailZoom: options?.minDetailZoom ?? 10,
          maxOctreeDepth: options?.maxOctreeDepth ?? 20,
          spacing,
        }
      );

      this._viewportManagers.set(id, viewportManager);

      // Get metadata for WKT
      const metadata = eptLoader.getMetadata();

      // Create initial point cloud info
      const info: PointCloudInfo = {
        id,
        name: `${name} (EPT)`,
        pointCount: totalPoints,
        bounds,
        hasRGB,
        hasIntensity: true,
        hasClassification: true,
        source: eptUrl,
        wkt: metadata?.srs?.wkt,
      };

      // Update state
      const pointClouds = [...this._state.pointClouds, info];
      this.setState({
        loading: false,
        pointClouds,
        activePointCloudId: id,
      });

      // Start viewport-based loading
      viewportManager.start();

      // Auto-zoom if enabled
      if (this._options.autoZoom) {
        // Validate and clamp bounds to valid WGS84 range before calling fitBounds
        const clampedMinY = Math.max(-90, Math.min(90, bounds.minY));
        const clampedMaxY = Math.max(-90, Math.min(90, bounds.maxY));
        const clampedMinX = Math.max(-180, Math.min(180, bounds.minX));
        const clampedMaxX = Math.max(-180, Math.min(180, bounds.maxX));

        this._map?.fitBounds(
          [
            [clampedMinX, clampedMinY],
            [clampedMaxX, clampedMaxY],
          ],
          {
            padding: 50,
            duration: 1000,
          }
        );

        setTimeout(() => {
          viewportManager.forceUpdate();
        }, 1100);
      }

      this._emitWithData('load', { pointCloud: info });

      return info;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));

      // Clean up on error
      const eptLoader = this._eptStreamingLoaders.get(id);
      if (eptLoader) {
        eptLoader.destroy();
        this._eptStreamingLoaders.delete(id);
      }
      const viewportManager = this._viewportManagers.get(id);
      if (viewportManager) {
        viewportManager.destroy();
        this._viewportManagers.delete(id);
      }

      const hasActiveStreaming = this._streamingLoaders.size > 0 || this._eptStreamingLoaders.size > 0;

      this.setState({
        loading: false,
        streamingActive: hasActiveStreaming,
        error: `Failed to load EPT: ${error.message}`,
      });
      this._emitWithData('loaderror', { error });
      throw error;
    }
  }

  /**
   * Handles viewport changes for EPT streaming mode.
   *
   * @param viewport - Current viewport information
   * @param datasetId - ID of the EPT dataset
   */
  private async _handleViewportChangeForEptStreaming(
    viewport: ViewportInfo,
    datasetId: string
  ): Promise<void> {
    const eptLoader = this._eptStreamingLoaders.get(datasetId);
    if (!eptLoader) return;

    try {
      const nodesToLoad = await eptLoader.selectNodesForViewport(viewport);

      for (const node of nodesToLoad) {
        eptLoader.queueNode(node);
      }

      await eptLoader.loadQueuedNodes();
    } catch (err) {
      console.warn('Failed to load EPT nodes for viewport:', err);
    }
  }

  /**
   * Downloads a file from URL and loads it fully.
   * Used as fallback when streaming fails due to CORS.
   */
  private async _loadPointCloudFullDownload(url: string): Promise<PointCloudInfo> {
    const id = generateId('pc');
    const name = getFilename(url);

    try {
      this._panelBuilder?.updateLoadingProgress(10, 'Downloading file...');

      // Download the entire file
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const contentLength = response.headers.get('content-length');
      const total = contentLength ? parseInt(contentLength, 10) : 0;

      // Stream download with progress
      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('Failed to get response reader');
      }

      const chunks: Uint8Array[] = [];
      let received = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        chunks.push(value);
        received += value.length;

        if (total > 0) {
          const percent = Math.round((received / total) * 50); // 0-50% for download
          this._panelBuilder?.updateLoadingProgress(
            10 + percent,
            `Downloading: ${(received / 1024 / 1024).toFixed(1)} MB`
          );
        }
      }

      // Combine chunks into ArrayBuffer
      const buffer = new Uint8Array(received);
      let offset = 0;
      for (const chunk of chunks) {
        buffer.set(chunk, offset);
        offset += chunk.length;
      }

      this._panelBuilder?.updateLoadingProgress(60, 'Processing point cloud...');

      // Load from buffer using the standard loader
      const onProgress = (progress: number, message: string) => {
        // Map 0-100 to 60-100
        const mappedProgress = 60 + (progress * 0.4);
        this._panelBuilder?.updateLoadingProgress(mappedProgress, message);
      };

      const data = await this._loader.load(buffer.buffer, onProgress);

      this._panelBuilder?.updateLoadingProgress(95, 'Creating visualization layers...');

      // Add to manager
      this._pointCloudManager?.addPointCloud(id, data);

      // Auto Z offset: calculate and apply based on 2nd percentile of elevation
      let zOffsetBase: number | undefined;
      let zOffset: number | undefined;
      let zOffsetEnabled = this._state.zOffsetEnabled;

      if (this._options.autoZOffset && data.positions && data.pointCount > 0) {
        const zValues = new Float32Array(data.pointCount);
        for (let i = 0; i < data.pointCount; i++) {
          zValues[i] = data.positions[i * 3 + 2] ?? 0;
        }
        const percentileBounds = computePercentileBounds(zValues, 2, 98);
        zOffsetBase = percentileBounds.min; // 2% percentile value (ground level)
        // Apply negative offset to convert absolute elevation to relative height above ground
        zOffset = -zOffsetBase;
        zOffsetEnabled = true;
        this._pointCloudManager?.setZOffset(zOffset);
        console.log(`Auto Z offset applied (download): ${zOffset.toFixed(1)}m (ground level: ${zOffsetBase.toFixed(1)}m)`);
      }

      this._panelBuilder?.updateLoadingProgress(100, 'Complete!');

      // Create info object
      const info: PointCloudInfo = {
        id,
        name,
        pointCount: data.pointCount,
        bounds: data.bounds,
        hasRGB: data.hasRGB,
        hasIntensity: data.hasIntensity,
        hasClassification: data.hasClassification,
        source: url,
        wkt: data.wkt,
      };

      // Extract available classifications and merge with existing
      const newClassifications = getAvailableClassifications(data);
      const mergedClassifications = new Set([
        ...this._state.availableClassifications,
        ...newClassifications,
      ]);

      // Update state (include z-offset values to trigger panel update)
      const pointClouds = [...this._state.pointClouds, info];
      this.setState({
        loading: false,
        pointClouds,
        activePointCloudId: id,
        availableClassifications: mergedClassifications,
        zOffsetBase,
        zOffset: zOffset ?? this._state.zOffset,
        zOffsetEnabled,
      });

      this._emitWithData('load', { pointCloud: info });

      // Auto-zoom
      if (this._options.autoZoom) {
        this.flyToPointCloud(id);
      }

      return info;
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));

      // Check if this is also a CORS error
      const isCorsError =
        error.message.includes('CORS') ||
        error.message === 'Failed to fetch' ||
        (err instanceof TypeError && error.message === 'Failed to fetch');

      let errorMessage: string;
      if (isCorsError) {
        const hostname = new URL(url).hostname;
        errorMessage =
          `Cannot load from "${hostname}" - server blocks cross-origin requests (CORS). ` +
          `Please download the file manually and load it using the file picker above.`;
      } else {
        errorMessage = `Failed to download: ${error.message}`;
      }

      this.setState({
        loading: false,
        error: errorMessage,
      });
      this._emitWithData('loaderror', { error: new Error(errorMessage) });
      throw new Error(errorMessage);
    }
  }

  /**
   * Handles viewport changes for streaming mode.
   * Selects and loads nodes based on current viewport.
   *
   * @param viewport - Current viewport information
   * @param datasetId - ID of the dataset to load nodes for
   */
  private async _handleViewportChangeForStreaming(
    viewport: ViewportInfo,
    datasetId: string
  ): Promise<void> {
    const streamingLoader = this._streamingLoaders.get(datasetId);
    if (!streamingLoader) return;

    try {
      // Select nodes for this viewport
      const nodesToLoad =
        await streamingLoader.selectNodesForViewport(viewport);

      // Queue nodes for loading
      for (const node of nodesToLoad) {
        streamingLoader.queueNode(node);
      }

      // Start loading
      await streamingLoader.loadQueuedNodes();
    } catch (err) {
      console.warn('Failed to load nodes for viewport:', err);
    }
  }

  /**
   * Stops streaming loading and cleans up resources.
   *
   * @param id - Optional ID of specific streaming dataset to stop. If not provided, stops all.
   */
  stopStreaming(id?: string): void {
    if (id) {
      // Stop specific streaming dataset
      const viewportManager = this._viewportManagers.get(id);
      if (viewportManager) {
        viewportManager.destroy();
        this._viewportManagers.delete(id);
      }

      // Check COPC streaming loader
      const streamingLoader = this._streamingLoaders.get(id);
      if (streamingLoader) {
        streamingLoader.destroy();
        this._streamingLoaders.delete(id);
      }

      // Check EPT streaming loader
      const eptLoader = this._eptStreamingLoaders.get(id);
      if (eptLoader) {
        eptLoader.destroy();
        this._eptStreamingLoaders.delete(id);
      }

      // Remove point cloud from manager
      this._pointCloudManager?.removePointCloud(id);

      // Remove from state
      const pointClouds = this._state.pointClouds.filter((pc) => pc.id !== id);
      const hasActiveStreaming = this._streamingLoaders.size > 0 || this._eptStreamingLoaders.size > 0;

      // Reset classification state when removing datasets
      this.setState({
        pointClouds,
        activePointCloudId:
          this._state.activePointCloudId === id
            ? pointClouds[0]?.id || null
            : this._state.activePointCloudId,
        streamingActive: hasActiveStreaming,
        streamingProgress: hasActiveStreaming ? this._state.streamingProgress : undefined,
        availableClassifications: new Set(),
        hiddenClassifications: new Set(),
      });

      this._emit('streamingstop');
      this._emitWithData('unload', { pointCloud: { id } });
    } else {
      // Stop all streaming datasets (COPC and EPT)
      const streamingIds = [
        ...Array.from(this._streamingLoaders.keys()),
        ...Array.from(this._eptStreamingLoaders.keys()),
      ];

      // Destroy all viewport managers
      for (const viewportManager of this._viewportManagers.values()) {
        viewportManager.destroy();
      }
      this._viewportManagers.clear();

      // Destroy all COPC streaming loaders
      for (const streamingLoader of this._streamingLoaders.values()) {
        streamingLoader.destroy();
      }
      this._streamingLoaders.clear();

      // Destroy all EPT streaming loaders
      for (const eptLoader of this._eptStreamingLoaders.values()) {
        eptLoader.destroy();
      }
      this._eptStreamingLoaders.clear();

      // Remove all streaming point clouds from manager
      for (const streamingId of streamingIds) {
        this._pointCloudManager?.removePointCloud(streamingId);
      }

      // Remove streaming point clouds from state
      const pointClouds = this._state.pointClouds.filter(
        (pc) => !streamingIds.includes(pc.id)
      );

      // Reset classification state when removing datasets
      this.setState({
        pointClouds,
        activePointCloudId:
          streamingIds.includes(this._state.activePointCloudId || '')
            ? pointClouds[0]?.id || null
            : this._state.activePointCloudId,
        streamingActive: false,
        streamingProgress: undefined,
        availableClassifications: new Set(),
        hiddenClassifications: new Set(),
      });

      if (streamingIds.length > 0) {
        this._emit('streamingstop');
        // Emit unload event for each removed streaming layer
        for (const removedId of streamingIds) {
          this._emitWithData('unload', { pointCloud: { id: removedId } });
        }
      }
    }
  }

  /**
   * Checks if streaming mode is currently active.
   *
   * @param id - Optional ID to check specific dataset. If not provided, checks if any streaming is active.
   * @returns True if streaming is active
   */
  isStreaming(id?: string): boolean {
    if (id) {
      return this._streamingLoaders.has(id) || this._eptStreamingLoaders.has(id);
    }
    return this._streamingLoaders.size > 0 || this._eptStreamingLoaders.size > 0;
  }

  /**
   * Gets the current streaming progress.
   *
   * @returns Streaming progress or undefined if not streaming
   */
  getStreamingProgress(): LidarState['streamingProgress'] {
    return this._state.streamingProgress;
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
   * Sets whether to use percentile range for elevation/intensity coloring.
   *
   * @param usePercentile - Whether to use percentile range (2-98%)
   */
  setUsePercentile(usePercentile: boolean): void {
    this._state.usePercentile = usePercentile;
    this._pointCloudManager?.setUsePercentile(usePercentile);
    this._emit('stylechange');
    this._emit('statechange');
  }

  /**
   * Gets whether percentile range is being used for coloring.
   *
   * @returns True if using percentile range
   */
  getUsePercentile(): boolean {
    return this._state.usePercentile;
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

    // Hide tooltip when disabling pickable
    if (!pickable && this._tooltip) {
      this._tooltip.style.display = 'none';
    }

    this._emit('stylechange');
    this._emit('statechange');
  }

  /**
   * Sets whether Z offset adjustment is enabled.
   *
   * @param enabled - Whether Z offset is enabled
   */
  setZOffsetEnabled(enabled: boolean): void {
    this._state.zOffsetEnabled = enabled;
    if (!enabled) {
      // Reset offset to 0 when disabled
      this._state.zOffset = 0;
      this._pointCloudManager?.setZOffset(0);
    }
    this._emit('stylechange');
    this._emit('statechange');
  }

  /**
   * Sets the Z offset value for vertical adjustment.
   *
   * @param offset - Z offset in meters
   */
  setZOffset(offset: number): void {
    this._state.zOffset = offset;
    this._pointCloudManager?.setZOffset(offset);
    this._emit('stylechange');
    this._emit('statechange');
  }

  /**
   * Gets the current Z offset value.
   *
   * @returns Z offset in meters
   */
  getZOffset(): number {
    return this._state.zOffset;
  }

  /**
   * Enables or disables 3D terrain visualization.
   *
   * @param enabled - Whether terrain should be enabled
   */
  setTerrain(enabled: boolean): void {
    if (!this._map) return;

    this._state.terrainEnabled = enabled;

    if (enabled) {
      // Add terrain source if not present (using AWS Terrain Tiles - free)
      if (!this._map.getSource('terrain-dem')) {
        this._map.addSource('terrain-dem', {
          type: 'raster-dem',
          tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
          encoding: 'terrarium',
          tileSize: 256,
          maxzoom: 15,
        });
      }

      // Enable terrain
      this._map.setTerrain({
        source: 'terrain-dem',
        exaggeration: this._options.terrainExaggeration ?? 1.0,
      });
    } else {
      // Disable terrain
      this._map.setTerrain(null);
    }

    this._emit('stylechange');
    this._emit('statechange');
  }

  /**
   * Gets whether 3D terrain is currently enabled.
   *
   * @returns True if terrain is enabled
   */
  getTerrain(): boolean {
    return this._state.terrainEnabled;
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
    if (!targetId || !this._map) return;

    // Try to get bounds from point cloud manager first (for loaded data)
    let bounds = this._pointCloudManager?.getPointCloudBounds(targetId);

    // Fall back to bounds from PointCloudInfo (for EPT streaming before data loads)
    if (!bounds) {
      const pcInfo = this._state.pointClouds.find(pc => pc.id === targetId);
      bounds = pcInfo?.bounds;
    }

    if (!bounds) {
      console.warn('Cannot fly to point cloud: no bounds available');
      return;
    }

    // Validate coordinates are in valid lat/lng range
    if (Math.abs(bounds.minY) > 90 || Math.abs(bounds.maxY) > 90 ||
        Math.abs(bounds.minX) > 180 || Math.abs(bounds.maxX) > 180) {
      console.error('Cannot fly to point cloud: coordinates are not in WGS84 range', bounds);
      return;
    }

    // Check for NaN or invalid values
    if (isNaN(bounds.minX) || isNaN(bounds.minY) || isNaN(bounds.maxX) || isNaN(bounds.maxY)) {
      console.error('Cannot fly to point cloud: bounds contain NaN values', bounds);
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
      {
        onFileSelect: (file) => this.loadPointCloud(file),
        onUrlSubmit: (url) => this.loadPointCloud(url),
        onPointSizeChange: (size) => this.setPointSize(size),
        onOpacityChange: (opacity) => this.setOpacity(opacity),
        onColorSchemeChange: (scheme) => this.setColorScheme(scheme),
        onUsePercentileChange: (usePercentile) => this.setUsePercentile(usePercentile),
        onElevationRangeChange: (range) => {
          if (range) {
            this.setElevationRange(range[0], range[1]);
          } else {
            this.clearElevationRange();
          }
        },
        onPickableChange: (pickable) => this.setPickable(pickable),
        onZOffsetEnabledChange: (enabled) => this.setZOffsetEnabled(enabled),
        onZOffsetChange: (offset) => this.setZOffset(offset),
        onUnload: (id) => this.unloadPointCloud(id),
        onZoomTo: (id) => this.flyToPointCloud(id),
        onClassificationToggle: (code, visible) => this._toggleClassification(code, visible),
        onClassificationShowAll: () => this._showAllClassifications(),
        onClassificationHideAll: () => this._hideAllClassifications(),
        onTerrainChange: (enabled) => this.setTerrain(enabled),
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
   * Formats a GPS time value (GPS Week Seconds) to a readable string.
   */
  private _formatGpsTime(gpsTime: number): string {
    // GPS epoch is January 6, 1980
    // GPS time is typically in seconds since GPS epoch or week seconds
    // We'll detect based on magnitude
    if (gpsTime > 1e9) {
      // Likely GPS seconds since epoch - convert to date
      const gpsEpoch = Date.UTC(1980, 0, 6, 0, 0, 0);
      const leapSeconds = 18; // Current leap seconds offset (as of 2024)
      const utcTime = gpsEpoch + (gpsTime - leapSeconds) * 1000;
      const date = new Date(utcTime);
      return date.toISOString().replace('T', ' ').slice(0, 19);
    }
    // Otherwise return as raw seconds (week seconds format)
    return gpsTime.toFixed(6);
  }

  /**
   * Formats a value for display in the tooltip.
   */
  private _formatAttributeValue(name: string, value: number): string {
    // Special formatting for known attribute types
    const lowerName = name.toLowerCase();

    if (lowerName === 'gpstime') {
      return this._formatGpsTime(value);
    }
    if (lowerName === 'intensity') {
      // Intensity is already normalized to 0-1
      return `${(value * 100).toFixed(1)}%`;
    }
    if (lowerName === 'classification') {
      return this._getClassificationName(value);
    }
    if (lowerName.includes('angle')) {
      return `${value.toFixed(1)}°`;
    }
    // Boolean-like flags
    if (['synthetic', 'keypoint', 'withheld', 'overlap', 'edgeofflightline', 'scandirectionflag'].includes(lowerName)) {
      return value === 0 ? '0' : '1';
    }
    // Integer values
    if (Number.isInteger(value) || ['returnnumber', 'numberofreturns', 'pointsourceid', 'userdata', 'scannerchannel'].includes(lowerName)) {
      return Math.round(value).toString();
    }
    // Default: decimal with appropriate precision
    if (Math.abs(value) < 0.01 || Math.abs(value) > 100000) {
      return value.toExponential(4);
    }
    return value.toFixed(2);
  }

  /**
   * Gets the classification name for a code.
   */
  private _getClassificationName(code: number): string {
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
    return classNames[code] || `Class ${code}`;
  }

  /**
   * Checks if an attribute should be shown based on pickInfoFields config.
   */
  private _shouldShowAttribute(name: string): boolean {
    const fields = this._state.pickInfoFields;
    if (!fields || fields.length === 0) {
      return true; // Show all if not specified
    }
    // Case-insensitive match
    return fields.some(f => f.toLowerCase() === name.toLowerCase());
  }

  /**
   * Handles point hover events from the point cloud layer.
   *
   * @param info - Picked point information or null if no point
   */
  private _handlePointHover(info: PickedPointInfo | null): void {
    if (!this._tooltip) return;

    if (info && this._state.pickable) {
      let html = `
        <div style="margin-bottom: 4px; font-weight: 600; border-bottom: 1px solid rgba(255,255,255,0.3); padding-bottom: 4px;">Point Info</div>
      `;

      // Core attributes (always available)
      if (this._shouldShowAttribute('X') || this._shouldShowAttribute('Longitude')) {
        html += `<div>X: ${info.longitude.toFixed(6)}</div>`;
      }
      if (this._shouldShowAttribute('Y') || this._shouldShowAttribute('Latitude')) {
        html += `<div>Y: ${info.latitude.toFixed(6)}</div>`;
      }
      if (this._shouldShowAttribute('Z') || this._shouldShowAttribute('Elevation')) {
        html += `<div>Z: ${info.elevation.toFixed(2)}</div>`;
      }

      // Intensity
      if (info.intensity !== undefined && this._shouldShowAttribute('Intensity')) {
        html += `<div>Intensity: ${this._formatAttributeValue('Intensity', info.intensity)}</div>`;
      }

      // Classification
      if (info.classification !== undefined && this._shouldShowAttribute('Classification')) {
        html += `<div>Classification: ${this._getClassificationName(info.classification)}</div>`;
      }

      // RGB colors
      if (info.red !== undefined && this._shouldShowAttribute('Red')) {
        html += `<div>Red: ${info.red}</div>`;
      }
      if (info.green !== undefined && this._shouldShowAttribute('Green')) {
        html += `<div>Green: ${info.green}</div>`;
      }
      if (info.blue !== undefined && this._shouldShowAttribute('Blue')) {
        html += `<div>Blue: ${info.blue}</div>`;
      }

      // All extra attributes
      if (info.attributes) {
        for (const [name, value] of Object.entries(info.attributes)) {
          if (this._shouldShowAttribute(name)) {
            const formattedValue = this._formatAttributeValue(name, value);
            html += `<div>${name}: ${formattedValue}</div>`;
          }
        }
      }

      this._tooltip.innerHTML = html;
      this._tooltip.style.display = 'block';

      // Get map container offset for correct positioning in embedded contexts (Jupyter, iframes)
      const containerRect = this._mapContainer?.getBoundingClientRect();
      const offsetX = containerRect?.left ?? 0;
      const offsetY = containerRect?.top ?? 0;

      this._tooltip.style.left = `${info.x + offsetX + 15}px`;
      this._tooltip.style.top = `${info.y + offsetY + 15}px`;
    } else {
      this._tooltip.style.display = 'none';
    }
  }

  /**
   * Sets which fields to display in the pick point info panel.
   *
   * @param fields - Array of attribute names to show, or undefined/empty to show all
   */
  setPickInfoFields(fields?: string[]): void {
    this._state.pickInfoFields = fields;
    this._emit('statechange');
  }

  /**
   * Gets the current list of fields shown in pick point info.
   */
  getPickInfoFields(): string[] | undefined {
    return this._state.pickInfoFields;
  }

  // ==================== Classification Visibility API ====================

  /**
   * Toggles visibility of a specific classification.
   *
   * @param code - Classification code to toggle
   * @param visible - Whether to show the classification
   */
  private _toggleClassification(code: number, visible: boolean): void {
    const newHidden = new Set(this._state.hiddenClassifications);
    if (visible) {
      newHidden.delete(code);
    } else {
      newHidden.add(code);
    }
    this._pointCloudManager?.setHiddenClassifications(newHidden);
    this.setState({ hiddenClassifications: newHidden });
    this._emit('stylechange');
  }

  /**
   * Shows all classifications.
   */
  private _showAllClassifications(): void {
    const newHidden = new Set<number>();
    this._pointCloudManager?.setHiddenClassifications(newHidden);
    this.setState({ hiddenClassifications: newHidden });
    this._emit('stylechange');
  }

  /**
   * Hides all classifications.
   */
  private _hideAllClassifications(): void {
    const newHidden = new Set(this._state.availableClassifications);
    this._pointCloudManager?.setHiddenClassifications(newHidden);
    this.setState({ hiddenClassifications: newHidden });
    this._emit('stylechange');
  }

  /**
   * Sets visibility for a specific classification.
   *
   * @param code - Classification code
   * @param visible - Whether to show the classification
   */
  setClassificationVisibility(code: number, visible: boolean): void {
    this._toggleClassification(code, visible);
  }

  /**
   * Gets the set of hidden classification codes.
   *
   * @returns Array of hidden classification codes
   */
  getHiddenClassifications(): number[] {
    return Array.from(this._state.hiddenClassifications);
  }

  /**
   * Gets the set of available classification codes in the loaded data.
   *
   * @returns Array of available classification codes
   */
  getAvailableClassifications(): number[] {
    return Array.from(this._state.availableClassifications);
  }

  /**
   * Shows all classifications (makes all visible).
   */
  showAllClassifications(): void {
    this._showAllClassifications();
  }

  /**
   * Hides all classifications.
   */
  hideAllClassifications(): void {
    this._hideAllClassifications();
  }

  /**
   * Setup event listeners for panel positioning and click-outside behavior.
   */
  private _setupEventListeners(): void {
    // Click outside to close (check both container and panel since they're now separate)
    this._clickOutsideHandler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        this._container &&
        this._panel &&
        !this._container.contains(target) &&
        !this._panel.contains(target)
      ) {
        this.collapse();
      }
    };
    document.addEventListener('click', this._clickOutsideHandler);

    // Update panel position on window resize
    this._resizeHandler = () => {
      if (!this._state.collapsed) {
        this._updatePanelPosition();
      }
    };
    window.addEventListener('resize', this._resizeHandler);

    // Update panel position on map resize (e.g., sidebar toggle)
    this._mapResizeHandler = () => {
      if (!this._state.collapsed) {
        this._updatePanelPosition();
      }
    };
    this._map?.on('resize', this._mapResizeHandler);
  }

  /**
   * Detect which corner the control is positioned in.
   *
   * @returns The position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
   */
  private _getControlPosition(): 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' {
    const parent = this._container?.parentElement;
    if (!parent) return 'top-right'; // Default

    if (parent.classList.contains('maplibregl-ctrl-top-left')) return 'top-left';
    if (parent.classList.contains('maplibregl-ctrl-top-right')) return 'top-right';
    if (parent.classList.contains('maplibregl-ctrl-bottom-left')) return 'bottom-left';
    if (parent.classList.contains('maplibregl-ctrl-bottom-right')) return 'bottom-right';

    return 'top-right'; // Default
  }

  /**
   * Update the panel position based on button location and control corner.
   * Positions the panel next to the button, expanding in the appropriate direction.
   */
  private _updatePanelPosition(): void {
    if (!this._container || !this._panel || !this._mapContainer) return;

    // Get the toggle button (first child of container)
    const button = this._container.querySelector('.lidar-control-toggle');
    if (!button) return;

    const buttonRect = button.getBoundingClientRect();
    const mapRect = this._mapContainer.getBoundingClientRect();
    const position = this._getControlPosition();

    // Calculate button position relative to map container
    const buttonTop = buttonRect.top - mapRect.top;
    const buttonBottom = mapRect.bottom - buttonRect.bottom;
    const buttonLeft = buttonRect.left - mapRect.left;
    const buttonRight = mapRect.right - buttonRect.right;

    const panelGap = 5; // Gap between button and panel

    // Reset all positioning
    this._panel.style.top = '';
    this._panel.style.bottom = '';
    this._panel.style.left = '';
    this._panel.style.right = '';

    switch (position) {
      case 'top-left':
        // Panel expands down and to the right
        this._panel.style.top = `${buttonTop + buttonRect.height + panelGap}px`;
        this._panel.style.left = `${buttonLeft}px`;
        break;

      case 'top-right':
        // Panel expands down and to the left
        this._panel.style.top = `${buttonTop + buttonRect.height + panelGap}px`;
        this._panel.style.right = `${buttonRight}px`;
        break;

      case 'bottom-left':
        // Panel expands up and to the right
        this._panel.style.bottom = `${buttonBottom + buttonRect.height + panelGap}px`;
        this._panel.style.left = `${buttonLeft}px`;
        break;

      case 'bottom-right':
        // Panel expands up and to the left
        this._panel.style.bottom = `${buttonBottom + buttonRect.height + panelGap}px`;
        this._panel.style.right = `${buttonRight}px`;
        break;
    }
  }
}
