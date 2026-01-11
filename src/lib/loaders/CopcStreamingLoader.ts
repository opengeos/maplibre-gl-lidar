import { Copc, Hierarchy, Getter } from 'copc';
import type { Copc as CopcType } from 'copc';
import { createLazPerf, type LazPerf } from 'laz-perf';
import proj4 from 'proj4';
import type {
  NodeKey,
  CachedNode,
  StreamingLoaderOptions,
  ViewportInfo,
  StreamingProgressEvent,
  StreamingLoaderEvent,
  StreamingLoaderEventHandler,
} from './streaming-types';
import type { PointCloudData, ExtraPointAttributes, AttributeArray } from './types';
import type { PointCloudBounds } from '../core/types';

/**
 * Source type for streaming loader - can be URL, File, or ArrayBuffer
 */
export type StreamingSource = string | File | ArrayBuffer;

/**
 * Creates a getter function from an ArrayBuffer for copc.js
 * Uses subarray for better performance (no copy, just a view)
 */
function createBufferGetter(buffer: ArrayBuffer): Getter {
  const uint8 = new Uint8Array(buffer);
  return async (begin: number, end: number): Promise<Uint8Array> => {
    // Use subarray for performance - creates a view without copying
    // Then create a copy since copc.js might modify the data
    return new Uint8Array(uint8.subarray(begin, end));
  };
}

/**
 * Configuration for attribute storage types
 */
interface AttributeConfig {
  arrayType: 'float64' | 'float32' | 'uint32' | 'uint16' | 'uint8' | 'int32' | 'int16' | 'int8';
}

/**
 * Known LAS dimension configurations
 */
const DIMENSION_CONFIGS: Record<string, AttributeConfig> = {
  'GpsTime': { arrayType: 'float64' },
  'ReturnNumber': { arrayType: 'uint8' },
  'NumberOfReturns': { arrayType: 'uint8' },
  'ScanDirectionFlag': { arrayType: 'uint8' },
  'EdgeOfFlightLine': { arrayType: 'uint8' },
  'ScanAngleRank': { arrayType: 'int8' },
  'ScanAngle': { arrayType: 'float32' },
  'UserData': { arrayType: 'uint8' },
  'PointSourceId': { arrayType: 'uint16' },
  'ScannerChannel': { arrayType: 'uint8' },
  'Synthetic': { arrayType: 'uint8' },
  'KeyPoint': { arrayType: 'uint8' },
  'Withheld': { arrayType: 'uint8' },
  'Overlap': { arrayType: 'uint8' },
  'ClassFlags': { arrayType: 'uint8' },
  'Nir': { arrayType: 'uint16' },
  'NearInfrared': { arrayType: 'uint16' },
};

/**
 * Core dimensions that are handled separately
 */
const CORE_DIMENSIONS = new Set([
  'X', 'Y', 'Z',
  'Intensity',
  'Classification',
  'Red', 'Green', 'Blue',
]);

/**
 * Creates a typed array of the appropriate type
 */
function createAttributeArray(type: AttributeConfig['arrayType'], length: number): AttributeArray {
  switch (type) {
    case 'float64': return new Float64Array(length);
    case 'float32': return new Float32Array(length);
    case 'uint32': return new Uint32Array(length);
    case 'uint16': return new Uint16Array(length);
    case 'uint8': return new Uint8Array(length);
    case 'int32': return new Int32Array(length);
    case 'int16': return new Int16Array(length);
    case 'int8': return new Int8Array(length);
    default: return new Float32Array(length);
  }
}

// LazPerf instance for COPC decompression
let lazPerfInstance: LazPerf | null = null;

async function getLazPerf(): Promise<LazPerf> {
  if (!lazPerfInstance) {
    lazPerfInstance = await createLazPerf({
      locateFile: (path: string) => {
        if (path.endsWith('.wasm')) {
          const base = import.meta.env?.BASE_URL || '/';
          return `${base}laz-perf.wasm`;
        }
        return path;
      },
    });
  }
  return lazPerfInstance;
}

/**
 * Extracts the PROJCS section from a WKT string (handles COMPD_CS)
 */
function extractProjcsFromWkt(wkt: string): string {
  if (wkt.startsWith('COMPD_CS[')) {
    const projcsStart = wkt.indexOf('PROJCS[');
    if (projcsStart === -1) return wkt;

    let depth = 0;
    let projcsEnd = projcsStart;
    for (let i = projcsStart; i < wkt.length; i++) {
      if (wkt[i] === '[') depth++;
      if (wkt[i] === ']') {
        depth--;
        if (depth === 0) {
          projcsEnd = i + 1;
          break;
        }
      }
    }
    return wkt.substring(projcsStart, projcsEnd);
  }
  return wkt;
}

/**
 * Detects if the WKT uses feet as the linear unit
 */
function getVerticalUnitConversionFactor(wkt: string): number {
  const FEET_TO_METERS = 0.3048;
  const US_SURVEY_FEET_TO_METERS = 0.3048006096012192;

  const wktLower = wkt.toLowerCase();

  if (wktLower.includes('us survey foot') ||
      wktLower.includes('us_survey_foot') ||
      wktLower.includes('foot_us')) {
    return US_SURVEY_FEET_TO_METERS;
  }

  const footPatterns = [
    /unit\s*\[\s*"foot/i,
    /unit\s*\[\s*"international foot/i,
    /,\s*foot\s*\]/i,
    /"ft"/i,
  ];

  for (const pattern of footPatterns) {
    if (pattern.test(wkt)) {
      return FEET_TO_METERS;
    }
  }

  return 1.0;
}

/**
 * Default options for streaming loader
 */
const DEFAULT_OPTIONS: Required<StreamingLoaderOptions> = {
  pointBudget: 5_000_000,
  maxConcurrentRequests: 4,
  viewportDebounceMs: 150,
  minDetailZoom: 10,
  maxOctreeDepth: 20,
};

/**
 * Streams COPC point cloud data on-demand based on viewport.
 * Implements center-first priority loading and respects point budget.
 * Supports both URL and local file (File/ArrayBuffer) sources.
 */
export class CopcStreamingLoader {
  private _originalSource: StreamingSource;
  private _source: string | Getter | null = null; // URL string or Getter for buffer
  private _copc: CopcType | null = null;
  private _lazPerf: LazPerf | null = null;
  private _options: Required<StreamingLoaderOptions>;

  // Hierarchy cache - loaded on-demand per page
  private _hierarchyPages: Map<string, Hierarchy.Subtree> = new Map();
  private _loadedHierarchyKeys: Set<string> = new Set();
  private _rootHierarchyPage: Hierarchy.Page | null = null;

  // Node cache - tracks all known nodes and their state
  private _nodeCache: Map<string, CachedNode> = new Map();

  // Point data buffers - pre-allocated for point budget
  private _positions: Float32Array | null = null;
  private _colors: Uint8Array | null = null;
  private _intensities: Float32Array | null = null;
  private _classifications: Uint8Array | null = null;
  private _extraAttributes: ExtraPointAttributes = {};
  private _coordinateOrigin: [number, number, number] = [0, 0, 0];
  private _bounds: PointCloudBounds | null = null;

  // Loading state
  private _loadingQueue: CachedNode[] = [];
  private _activeRequests: number = 0;
  private _totalLoadedPoints: number = 0;
  private _totalLoadedNodes: number = 0;
  private _isInitialized: boolean = false;

  // Coordinate transformation
  private _transformer: ((coord: [number, number]) => [number, number]) | null = null;
  private _verticalUnitFactor: number = 1.0;
  private _needsTransform: boolean = false;

  // Point format info
  private _hasColor: boolean = false;
  private _totalPointsInFile: number = 0;
  private _octreeCube: number[] = [];
  private _spacing: number = 0;

  // Extra dimensions detection
  private _availableDimensions: Set<string> = new Set();
  private _dimensionsDetected: boolean = false;

  // Events
  private _eventHandlers: Map<StreamingLoaderEvent, Set<StreamingLoaderEventHandler>> = new Map();

  // Batched layer update
  private _pendingLayerUpdate: boolean = false;
  private _updateBatchTimeout: ReturnType<typeof setTimeout> | null = null;
  private _onPointsLoaded?: (data: PointCloudData) => void;

  /**
   * Creates a new CopcStreamingLoader instance.
   *
   * @param source - URL string, File object, or ArrayBuffer
   * @param options - Streaming options
   */
  constructor(source: StreamingSource, options?: StreamingLoaderOptions) {
    this._originalSource = source;
    this._options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Initializes the COPC file - reads header and root hierarchy.
   * Must be called before any loading operations.
   *
   * @returns Initial info about the point cloud
   */
  async initialize(): Promise<{
    bounds: PointCloudBounds;
    totalPoints: number;
    hasRGB: boolean;
    spacing: number;
  }> {
    // Initialize LazPerf for decompression
    this._lazPerf = await getLazPerf();

    // Setup source - URL string or Getter for local files
    if (typeof this._originalSource === 'string') {
      // URL source
      this._source = this._originalSource;
      try {
        this._copc = await Copc.create(this._source);
      } catch (error) {
        // Check if this is likely a CORS error
        if (error instanceof TypeError && error.message === 'Failed to fetch') {
          throw new Error(
            `Failed to fetch from URL. This is likely a CORS (Cross-Origin Resource Sharing) error. ` +
            `The server at "${new URL(this._source).hostname}" doesn't allow requests from this origin. ` +
            `Solutions: (1) Download the file locally and load it as a file, ` +
            `(2) Use a CORS proxy, or (3) Host the file on a CORS-enabled server.`
          );
        }
        throw error;
      }
    } else if (this._originalSource instanceof File) {
      // File source - read into buffer first
      const buffer = await this._originalSource.arrayBuffer();
      this._source = createBufferGetter(buffer);
      this._copc = await Copc.create(this._source);
    } else {
      // ArrayBuffer source
      this._source = createBufferGetter(this._originalSource);
      this._copc = await Copc.create(this._source);
    }

    const { header, info } = this._copc;

    // Store root hierarchy page for later traversal
    this._rootHierarchyPage = info.rootHierarchyPage;
    this._octreeCube = info.cube;
    this._spacing = info.spacing;
    this._totalPointsInFile = header.pointCount;

    // Check if color data is available
    const colorFormats = [2, 3, 5, 7, 8, 10];
    this._hasColor = colorFormats.includes(header.pointDataRecordFormat);

    // Setup coordinate transformation if WKT is available
    if (this._copc.wkt) {
      try {
        const wktToUse = extractProjcsFromWkt(this._copc.wkt);
        const projConverter = proj4(wktToUse, 'EPSG:4326');
        this._transformer = (coord: [number, number]) =>
          projConverter.forward(coord) as [number, number];
        this._needsTransform = true;
        this._verticalUnitFactor = getVerticalUnitConversionFactor(this._copc.wkt);
      } catch (e) {
        console.warn('Failed to setup coordinate transformation:', e);
      }
    }

    // Calculate bounds
    if (this._needsTransform && this._transformer) {
      const [minLng, minLat] = this._transformer([header.min[0], header.min[1]]);
      const [maxLng, maxLat] = this._transformer([header.max[0], header.max[1]]);

      this._bounds = {
        minX: Math.min(minLng, maxLng),
        minY: Math.min(minLat, maxLat),
        minZ: header.min[2] * this._verticalUnitFactor,
        maxX: Math.max(minLng, maxLng),
        maxY: Math.max(minLat, maxLat),
        maxZ: header.max[2] * this._verticalUnitFactor,
      };
    } else {
      this._bounds = {
        minX: header.min[0],
        minY: header.min[1],
        minZ: header.min[2],
        maxX: header.max[0],
        maxY: header.max[1],
        maxZ: header.max[2],
      };
    }

    // Coordinate origin is the center of the bounding box
    this._coordinateOrigin = [
      (this._bounds.minX + this._bounds.maxX) / 2,
      (this._bounds.minY + this._bounds.maxY) / 2,
      0,
    ];

    // Pre-allocate buffers for point budget
    this._allocateBuffers();

    this._isInitialized = true;

    return {
      bounds: this._bounds,
      totalPoints: this._totalPointsInFile,
      hasRGB: this._hasColor,
      spacing: this._spacing,
    };
  }

  /**
   * Pre-allocates buffers for the point budget.
   */
  private _allocateBuffers(): void {
    const budget = this._options.pointBudget;
    this._positions = new Float32Array(budget * 3);
    this._intensities = new Float32Array(budget);
    this._classifications = new Uint8Array(budget);
    if (this._hasColor) {
      this._colors = new Uint8Array(budget * 4);
    }
  }

  /**
   * Gets the octree spacing value (useful for ViewportManager).
   */
  getSpacing(): number {
    return this._spacing;
  }

  /**
   * Parses a node key string to array format.
   *
   * @param key - Node key in format "depth-x-y-z"
   * @returns NodeKey array [depth, x, y, z]
   */
  private _parseNodeKey(key: string): NodeKey {
    const parts = key.split('-').map(Number);
    return [parts[0], parts[1], parts[2], parts[3]];
  }

  /**
   * Calculates the bounding box of an octree node.
   *
   * @param key - Node key [depth, x, y, z]
   * @returns Node bounds in source CRS and WGS84
   */
  private _calculateNodeBounds(key: NodeKey): {
    bounds: PointCloudBounds;
    boundsWgs84: PointCloudBounds;
  } {
    const [depth, x, y, z] = key;

    // Root cube from copc.info.cube: [minX, minY, minZ, maxX, maxY, maxZ]
    const cube = this._octreeCube;
    const cubeMinX = cube[0];
    const cubeMinY = cube[1];
    const cubeMinZ = cube[2];
    const cubeMaxX = cube[3];

    const cubeSize = cubeMaxX - cubeMinX; // Assuming cubic octree

    // Each level subdivides by 2 in each dimension
    const scale = 1 / Math.pow(2, depth);
    const nodeSize = cubeSize * scale;

    const minX = cubeMinX + x * nodeSize;
    const minY = cubeMinY + y * nodeSize;
    const minZ = cubeMinZ + z * nodeSize;

    const bounds: PointCloudBounds = {
      minX,
      minY,
      minZ,
      maxX: minX + nodeSize,
      maxY: minY + nodeSize,
      maxZ: minZ + nodeSize,
    };

    // Transform to WGS84 for viewport intersection
    let boundsWgs84 = bounds;
    if (this._needsTransform && this._transformer) {
      const [sw_lng, sw_lat] = this._transformer([minX, minY]);
      const [ne_lng, ne_lat] = this._transformer([minX + nodeSize, minY + nodeSize]);
      boundsWgs84 = {
        minX: Math.min(sw_lng, ne_lng),
        minY: Math.min(sw_lat, ne_lat),
        minZ: minZ * this._verticalUnitFactor,
        maxX: Math.max(sw_lng, ne_lng),
        maxY: Math.max(sw_lat, ne_lat),
        maxZ: (minZ + nodeSize) * this._verticalUnitFactor,
      };
    }

    return { bounds, boundsWgs84 };
  }

  /**
   * Checks if a node's bounds intersect the viewport.
   * Adds a buffer around viewport to catch edge/corner nodes.
   *
   * @param nodeBounds - Node bounds in WGS84
   * @param viewport - Current viewport info
   * @returns True if bounds intersect
   */
  private _boundsIntersectsViewport(
    nodeBounds: PointCloudBounds,
    viewport: ViewportInfo
  ): boolean {
    const [west, south, east, north] = viewport.bounds;

    // Add 20% buffer around viewport to catch edge/corner nodes
    // This helps with:
    // 1. Tilted views where getBounds() underestimates visible area
    // 2. Nodes at the edge that might be partially visible
    const width = east - west;
    const height = north - south;
    const bufferX = width * 0.2;
    const bufferY = height * 0.2;

    const bufferedWest = west - bufferX;
    const bufferedEast = east + bufferX;
    const bufferedSouth = south - bufferY;
    const bufferedNorth = north + bufferY;

    return !(
      nodeBounds.maxX < bufferedWest ||
      nodeBounds.minX > bufferedEast ||
      nodeBounds.maxY < bufferedSouth ||
      nodeBounds.minY > bufferedNorth
    );
  }

  /**
   * Calculates node priority based on distance from viewport center.
   * Lower values = higher priority (closer to center).
   *
   * @param nodeBounds - Node bounds in WGS84
   * @param viewport - Current viewport info
   * @returns Priority value (distance from center)
   */
  private _calculateNodePriority(
    nodeBounds: PointCloudBounds,
    viewport: ViewportInfo
  ): number {
    const nodeCenterX = (nodeBounds.minX + nodeBounds.maxX) / 2;
    const nodeCenterY = (nodeBounds.minY + nodeBounds.maxY) / 2;

    const dx = nodeCenterX - viewport.center[0];
    const dy = nodeCenterY - viewport.center[1];

    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Ensures the hierarchy page containing a node key is loaded.
   *
   * @param nodeKey - Node key to ensure hierarchy for
   */
  private async _ensureHierarchyLoaded(nodeKey: string): Promise<void> {
    if (this._loadedHierarchyKeys.has(nodeKey)) return;
    if (!this._rootHierarchyPage) return;

    // Check if we have a hierarchy page for this key's region
    // For now, we load all pages from root
    if (this._hierarchyPages.size === 0) {
      await this._loadHierarchyRecursive(this._rootHierarchyPage);
    }
  }

  /**
   * Recursively loads hierarchy pages.
   *
   * @param page - Hierarchy page to load
   */
  private async _loadHierarchyRecursive(page: Hierarchy.Page): Promise<void> {
    const subtree = await Hierarchy.load(this._source!, page);

    // Store all nodes from this page
    for (const [key, node] of Object.entries(subtree.nodes)) {
      if (node) {
        this._loadedHierarchyKeys.add(key);
        // Create cached node entry if not exists
        if (!this._nodeCache.has(key)) {
          const keyArray = this._parseNodeKey(key);
          const { bounds, boundsWgs84 } = this._calculateNodeBounds(keyArray);
          this._nodeCache.set(key, {
            key,
            keyArray,
            state: 'pending',
            pointCount: node.pointCount,
            pointDataOffset: node.pointDataOffset,
            pointDataLength: node.pointDataLength,
            bounds,
            boundsWgs84,
          });
        }
      }
    }

    // Recursively load sub-pages
    for (const [, subPage] of Object.entries(subtree.pages)) {
      if (subPage) {
        await this._loadHierarchyRecursive(subPage);
      }
    }
  }

  /**
   * Finds nodes that intersect the viewport and should be loaded.
   * Implements center-first priority and LOD selection.
   * Loads nodes at ALL depths up to targetDepth to ensure full coverage
   * (parent nodes fill gaps where child nodes don't exist in sparse octrees).
   *
   * @param viewport - Current viewport information
   * @returns Sorted array of nodes to load (by priority)
   */
  async selectNodesForViewport(viewport: ViewportInfo): Promise<CachedNode[]> {
    if (!this._isInitialized) {
      throw new Error('CopcStreamingLoader not initialized. Call initialize() first.');
    }

    // Ensure hierarchy is loaded
    await this._ensureHierarchyLoaded('0-0-0-0');

    const nodesToLoad: CachedNode[] = [];
    const targetDepth = viewport.targetDepth;

    // Load ALL nodes that intersect viewport, from depth 0 up to targetDepth + 1
    // This ensures parent nodes provide coverage where child nodes don't exist
    for (const [, node] of this._nodeCache) {
      const depth = node.keyArray[0];

      // Skip nodes deeper than we need
      if (depth > targetDepth + 1) continue;

      // Check viewport intersection
      if (!this._boundsIntersectsViewport(node.boundsWgs84, viewport)) {
        continue;
      }

      // Add to load list if not already loaded/loading
      if (node.state !== 'loaded' && node.state !== 'loading') {
        // Calculate priority: distance from center, with depth bonus
        // Deeper nodes (more detail) get slightly higher priority
        const distPriority = this._calculateNodePriority(node.boundsWgs84, viewport);
        // Normalize depth bonus: deeper = lower priority number = higher priority
        node.priority = distPriority - (depth * 0.0001);
        nodesToLoad.push(node);
      }
    }

    // Sort by priority (center-first, deeper nodes slightly preferred)
    nodesToLoad.sort((a, b) => (a.priority || Infinity) - (b.priority || Infinity));

    return nodesToLoad;
  }

  /**
   * Queues a node for loading.
   *
   * @param node - Node to queue
   */
  queueNode(node: CachedNode): void {
    if (node.state !== 'pending') return;

    // Check if already in queue
    if (this._loadingQueue.find((n) => n.key === node.key)) return;

    this._loadingQueue.push(node);

    // Sort queue by priority
    this._loadingQueue.sort((a, b) => (a.priority || Infinity) - (b.priority || Infinity));
  }

  /**
   * Loads nodes from the queue, respecting point budget and concurrency limits.
   */
  async loadQueuedNodes(): Promise<void> {
    while (
      this._loadingQueue.length > 0 &&
      this._activeRequests < this._options.maxConcurrentRequests &&
      this._totalLoadedPoints < this._options.pointBudget
    ) {
      const node = this._loadingQueue.shift()!;

      // Check if loading this node would exceed budget
      if (this._totalLoadedPoints + node.pointCount > this._options.pointBudget) {
        this._emit('budgetreached', this._getProgressEvent());
        break;
      }

      // Start loading node (don't await, let multiple load in parallel)
      this._loadNode(node);
    }
  }

  /**
   * Loads a single node's point data.
   *
   * @param node - Node to load
   */
  private async _loadNode(node: CachedNode): Promise<void> {
    if (node.state === 'loaded' || node.state === 'loading') return;

    node.state = 'loading';
    this._activeRequests++;

    // IMPORTANT: Reserve buffer space BEFORE async operations to prevent race conditions
    // When multiple nodes load concurrently, each must have its own unique buffer region
    const startIndex = this._totalLoadedPoints;
    node.bufferStartIndex = startIndex;
    this._totalLoadedPoints += node.pointCount; // Reserve space immediately

    try {
      const hierarchyNode: Hierarchy.Node = {
        pointCount: node.pointCount,
        pointDataOffset: node.pointDataOffset,
        pointDataLength: node.pointDataLength,
      };

      const view = await Copc.loadPointDataView(
        this._source!,
        this._copc!,
        hierarchyNode,
        { lazPerf: this._lazPerf! }
      );

      // Detect dimensions on first node
      if (!this._dimensionsDetected) {
        const allDimensions = Object.keys(view.dimensions || {});
        for (const dimName of allDimensions) {
          if (!CORE_DIMENSIONS.has(dimName)) {
            this._availableDimensions.add(dimName);
            const config = DIMENSION_CONFIGS[dimName] || { arrayType: 'float32' };
            this._extraAttributes[dimName] = createAttributeArray(
              config.arrayType,
              this._options.pointBudget
            );
          }
        }
        this._dimensionsDetected = true;
      }

      // Extract point data into buffers (using pre-reserved startIndex)
      await this._extractPointData(view, node, startIndex);

      node.state = 'loaded';
      this._totalLoadedNodes++;

      this._emit('nodeloaded', node);
      this._emit('progress', this._getProgressEvent());

      // Schedule batched layer update
      this._scheduleLayerUpdate();
    } catch (error) {
      node.state = 'error';
      node.error = error instanceof Error ? error.message : String(error);
      console.warn(`Failed to load node ${node.key}:`, error);
      this._emit('error', error as Error);
    } finally {
      this._activeRequests--;
      // Continue loading more nodes
      this.loadQueuedNodes();
    }
  }

  /**
   * Extracts point data from a view into the buffers.
   *
   * @param view - Point data view from copc.js
   * @param node - Node being loaded
   * @param startIndex - Starting index in buffers
   */
  private async _extractPointData(
    view: Awaited<ReturnType<typeof Copc.loadPointDataView>>,
    node: CachedNode,
    startIndex: number
  ): Promise<void> {
    const xGetter = view.getter('X');
    const yGetter = view.getter('Y');
    const zGetter = view.getter('Z');
    const intensityGetter = view.getter('Intensity');
    const classGetter = view.getter('Classification');
    const redGetter = this._hasColor ? view.getter('Red') : null;
    const greenGetter = this._hasColor ? view.getter('Green') : null;
    const blueGetter = this._hasColor ? view.getter('Blue') : null;

    // Build getters for extra dimensions
    const extraGetters: Map<string, (i: number) => number> = new Map();
    for (const dimName of this._availableDimensions) {
      try {
        const getter = view.getter(dimName);
        if (getter) {
          extraGetters.set(dimName, getter);
        }
      } catch {
        // Dimension not available in this node
      }
    }

    for (let i = 0; i < node.pointCount; i++) {
      const pointIndex = startIndex + i;

      const x = xGetter(i);
      const y = yGetter(i);
      const z = zGetter(i);

      // Transform coordinates to WGS84 if needed
      if (this._needsTransform && this._transformer) {
        const [lng, lat] = this._transformer([x, y]);
        this._positions![pointIndex * 3] = lng - this._coordinateOrigin[0];
        this._positions![pointIndex * 3 + 1] = lat - this._coordinateOrigin[1];
        this._positions![pointIndex * 3 + 2] = z * this._verticalUnitFactor;
      } else {
        this._positions![pointIndex * 3] = x - this._coordinateOrigin[0];
        this._positions![pointIndex * 3 + 1] = y - this._coordinateOrigin[1];
        this._positions![pointIndex * 3 + 2] = z;
      }

      // Intensity (normalize to 0-1)
      this._intensities![pointIndex] = intensityGetter(i) / 65535;

      // Classification
      this._classifications![pointIndex] = classGetter(i);

      // Color (if available)
      if (this._colors && redGetter && greenGetter && blueGetter) {
        this._colors[pointIndex * 4] = redGetter(i) >> 8;
        this._colors[pointIndex * 4 + 1] = greenGetter(i) >> 8;
        this._colors[pointIndex * 4 + 2] = blueGetter(i) >> 8;
        this._colors[pointIndex * 4 + 3] = 255;
      }

      // Extra attributes
      for (const [dimName, getter] of extraGetters) {
        const arr = this._extraAttributes[dimName];
        if (arr) {
          arr[pointIndex] = getter(i);
        }
      }
    }
  }

  /**
   * Schedules a batched layer update.
   */
  private _scheduleLayerUpdate(): void {
    if (this._pendingLayerUpdate) return;
    this._pendingLayerUpdate = true;

    // Batch updates every 100ms
    this._updateBatchTimeout = setTimeout(() => {
      this._performLayerUpdate();
      this._pendingLayerUpdate = false;
      this._updateBatchTimeout = null;
    }, 100);
  }

  /**
   * Performs the layer update callback.
   */
  private _performLayerUpdate(): void {
    if (this._onPointsLoaded) {
      const data = this.getLoadedPointCloudData();
      this._onPointsLoaded(data);
    }
  }

  /**
   * Sets the callback for when points are loaded.
   *
   * @param callback - Function to call with updated point cloud data
   */
  setOnPointsLoaded(callback: (data: PointCloudData) => void): void {
    this._onPointsLoaded = callback;
  }

  /**
   * Gets the current loaded point cloud data for rendering.
   *
   * @returns Current loaded data
   */
  getLoadedPointCloudData(): PointCloudData {
    const pointCount = this._totalLoadedPoints;

    // Build trimmed extra attributes
    const trimmedExtraAttributes: ExtraPointAttributes = {};
    for (const [name, arr] of Object.entries(this._extraAttributes)) {
      trimmedExtraAttributes[name] = arr.subarray(0, pointCount) as AttributeArray;
    }

    return {
      positions: this._positions!.subarray(0, pointCount * 3),
      coordinateOrigin: this._coordinateOrigin,
      colors: this._colors?.subarray(0, pointCount * 4),
      intensities: this._intensities!.subarray(0, pointCount),
      classifications: this._classifications!.subarray(0, pointCount),
      extraAttributes:
        Object.keys(trimmedExtraAttributes).length > 0
          ? trimmedExtraAttributes
          : undefined,
      pointCount,
      bounds: this._bounds!,
      hasRGB: this._hasColor,
      hasIntensity: true,
      hasClassification: true,
      wkt: this._copc?.wkt,
    };
  }

  /**
   * Gets the current streaming progress.
   *
   * @returns Progress event data
   */
  private _getProgressEvent(): StreamingProgressEvent {
    return {
      totalNodesInView: this._nodeCache.size,
      loadedNodes: this._totalLoadedNodes,
      loadedPoints: this._totalLoadedPoints,
      pointBudget: this._options.pointBudget,
      isLoading: this._activeRequests > 0 || this._loadingQueue.length > 0,
      queueSize: this._loadingQueue.length,
    };
  }

  /**
   * Registers an event handler.
   *
   * @param event - Event type
   * @param handler - Handler function
   */
  on(event: StreamingLoaderEvent, handler: StreamingLoaderEventHandler): void {
    if (!this._eventHandlers.has(event)) {
      this._eventHandlers.set(event, new Set());
    }
    this._eventHandlers.get(event)!.add(handler);
  }

  /**
   * Removes an event handler.
   *
   * @param event - Event type
   * @param handler - Handler function
   */
  off(event: StreamingLoaderEvent, handler: StreamingLoaderEventHandler): void {
    this._eventHandlers.get(event)?.delete(handler);
  }

  /**
   * Emits an event to all registered handlers.
   *
   * @param event - Event type
   * @param data - Event data
   */
  private _emit(
    event: StreamingLoaderEvent,
    data: StreamingProgressEvent | CachedNode | Error
  ): void {
    const handlers = this._eventHandlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        handler(event, data);
      }
    }
  }

  /**
   * Gets the total number of loaded points.
   */
  getLoadedPointCount(): number {
    return this._totalLoadedPoints;
  }

  /**
   * Gets the total number of loaded nodes.
   */
  getLoadedNodeCount(): number {
    return this._totalLoadedNodes;
  }

  /**
   * Checks if the loader is currently loading.
   */
  isLoading(): boolean {
    return this._activeRequests > 0 || this._loadingQueue.length > 0;
  }

  /**
   * Destroys the streaming loader and cleans up resources.
   */
  destroy(): void {
    // Clear timeout
    if (this._updateBatchTimeout) {
      clearTimeout(this._updateBatchTimeout);
    }

    // Clear all state
    this._loadingQueue = [];
    this._nodeCache.clear();
    this._hierarchyPages.clear();
    this._loadedHierarchyKeys.clear();
    this._eventHandlers.clear();

    // Release buffers
    this._positions = null;
    this._colors = null;
    this._intensities = null;
    this._classifications = null;
    this._extraAttributes = {};
  }
}
