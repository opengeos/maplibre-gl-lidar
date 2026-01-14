import { load } from '@loaders.gl/core';
import { LASLoader } from '@loaders.gl/las';
import proj4 from 'proj4';
import type {
  NodeKey,
  StreamingLoaderOptions,
  ViewportInfo,
  StreamingProgressEvent,
  StreamingLoaderEvent,
  StreamingLoaderEventHandler,
} from './streaming-types';
import type {
  EptMetadata,
  EptDimension,
  EptHierarchy,
  EptCachedNode,
  ParsedDimension,
} from './ept-types';
import type { PointCloudData, ExtraPointAttributes, AttributeArray } from './types';
import type { PointCloudBounds } from '../core/types';

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
  'OriginId': { arrayType: 'uint32' },
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
 * Streams Entwine Point Tile (EPT) data on-demand based on viewport.
 * Implements center-first priority loading and respects point budget.
 *
 * EPT format uses:
 * - ept.json for metadata
 * - ept-hierarchy/ for octree node structure
 * - ept-data/ for point data (LAZ or binary)
 */
export class EptStreamingLoader {
  private _baseUrl: string;
  private _options: Required<StreamingLoaderOptions>;
  private _metadata: EptMetadata | null = null;

  // Hierarchy cache
  private _hierarchyCache: Map<string, EptHierarchy> = new Map();
  private _subtreeRoots: Set<string> = new Set();
  private _rootHierarchyLoaded: boolean = false;

  // Node cache
  private _nodeCache: Map<string, EptCachedNode> = new Map();

  // Point data buffers
  private _positions: Float32Array | null = null;
  private _colors: Uint8Array | null = null;
  private _intensities: Float32Array | null = null;
  private _classifications: Uint8Array | null = null;
  private _extraAttributes: ExtraPointAttributes = {};
  private _coordinateOrigin: [number, number, number] = [0, 0, 0];
  private _bounds: PointCloudBounds | null = null;

  // Loading state
  private _loadingQueue: EptCachedNode[] = [];
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
  private _hasIntensity: boolean = false;
  private _totalPointsInFile: number = 0;
  private _pointByteLength: number = 0;
  private _parsedSchema: ParsedDimension[] = [];

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
   * Creates a new EptStreamingLoader instance.
   *
   * @param eptUrl - URL to ept.json or base EPT directory
   * @param options - Streaming options
   */
  constructor(eptUrl: string, options?: StreamingLoaderOptions) {
    // Normalize base URL (remove trailing /ept.json if present)
    this._baseUrl = eptUrl.endsWith('/ept.json')
      ? eptUrl.slice(0, -9)
      : eptUrl.replace(/\/$/, '');
    this._options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Initializes the EPT dataset - reads metadata and root hierarchy.
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
    // Fetch and parse ept.json
    try {
      const response = await fetch(`${this._baseUrl}/ept.json`);
      if (!response.ok) {
        throw new Error(`Failed to fetch ept.json: ${response.status} ${response.statusText}`);
      }
      this._metadata = await response.json() as EptMetadata;
    } catch (error) {
      if (error instanceof TypeError && error.message === 'Failed to fetch') {
        throw new Error(
          `Failed to fetch from URL. This is likely a CORS (Cross-Origin Resource Sharing) error. ` +
          `The server doesn't allow requests from this origin. ` +
          `Solutions: (1) Use a CORS proxy, or (2) Host the EPT data on a CORS-enabled server.`
        );
      }
      throw error;
    }

    // Handle both 'numPoints' (standard) and 'points' (some older versions)
    this._totalPointsInFile = this._metadata.numPoints ?? (this._metadata as unknown as { points?: number }).points ?? 0;

    // Parse schema to build dimension getters
    this._parseSchema();

    // Check for color and intensity
    this._hasColor = this._parsedSchema.some(p => p.dimension.name === 'Red');
    this._hasIntensity = this._parsedSchema.some(p => p.dimension.name === 'Intensity');

    // Setup coordinate transformation if WKT is available
    if (this._metadata.srs?.wkt) {
      try {
        const wktToUse = extractProjcsFromWkt(this._metadata.srs.wkt);
        const projConverter = proj4(wktToUse, 'EPSG:4326');
        this._transformer = (coord: [number, number]) =>
          projConverter.forward(coord) as [number, number];
        this._needsTransform = true;
        this._verticalUnitFactor = getVerticalUnitConversionFactor(this._metadata.srs.wkt);
      } catch (e) {
        console.warn('Failed to setup EPT coordinate transformation:', e);
      }
    }

    // Calculate bounds from boundsConforming (tighter bounds)
    const [minX, minY, minZ, maxX, maxY, maxZ] = this._metadata.boundsConforming;

    if (this._needsTransform && this._transformer) {
      const [minLng, minLat] = this._transformer([minX, minY]);
      const [maxLng, maxLat] = this._transformer([maxX, maxY]);

      // Validate transformed coordinates
      if (isNaN(minLng) || isNaN(minLat) || isNaN(maxLng) || isNaN(maxLat) ||
          !isFinite(minLng) || !isFinite(minLat) || !isFinite(maxLng) || !isFinite(maxLat)) {
        console.error('EPT coordinate transformation produced invalid bounds:', {
          input: { minX, minY, maxX, maxY },
          output: { minLng, minLat, maxLng, maxLat }
        });
        // Fall back to source coordinates
        this._bounds = { minX, minY, minZ, maxX, maxY, maxZ };
        this._needsTransform = false;
        this._transformer = null;
      } else {
        this._bounds = {
          minX: Math.min(minLng, maxLng),
          minY: Math.min(minLat, maxLat),
          minZ: minZ * this._verticalUnitFactor,
          maxX: Math.max(minLng, maxLng),
          maxY: Math.max(minLat, maxLat),
          maxZ: maxZ * this._verticalUnitFactor,
        };
      }
    } else {
      this._bounds = { minX, minY, minZ, maxX, maxY, maxZ };
    }

    // Coordinate origin is the center of the bounding box
    this._coordinateOrigin = [
      (this._bounds.minX + this._bounds.maxX) / 2,
      (this._bounds.minY + this._bounds.maxY) / 2,
      0,
    ];

    // Pre-allocate buffers
    this._allocateBuffers();

    this._isInitialized = true;

    // Calculate spacing from bounds and span
    const cubeSize = this._metadata.bounds[3] - this._metadata.bounds[0];
    const spacing = cubeSize / this._metadata.span;

    return {
      bounds: this._bounds,
      totalPoints: this._totalPointsInFile,
      hasRGB: this._hasColor,
      spacing,
    };
  }

  /**
   * Parses the EPT schema and builds dimension getters.
   */
  private _parseSchema(): void {
    if (!this._metadata) return;

    let byteOffset = 0;
    this._parsedSchema = [];

    for (const dim of this._metadata.schema) {
      const getter = this._createDimensionGetter(dim, byteOffset);
      this._parsedSchema.push({
        dimension: dim,
        byteOffset,
        getter,
      });
      byteOffset += dim.size;
    }

    this._pointByteLength = byteOffset;
  }

  /**
   * Creates a getter function for a dimension.
   *
   * @param dim - Dimension definition
   * @param offset - Byte offset within point record
   * @returns Getter function
   */
  private _createDimensionGetter(
    dim: EptDimension,
    offset: number
  ): (dataView: DataView, pointByteOffset: number) => number {
    const scale = dim.scale ?? 1;
    const dimOffset = dim.offset ?? 0;

    if (dim.type === 'float') {
      if (dim.size === 4) {
        return (dv, po) => dv.getFloat32(po + offset, true) * scale + dimOffset;
      }
      if (dim.size === 8) {
        return (dv, po) => dv.getFloat64(po + offset, true) * scale + dimOffset;
      }
    } else if (dim.type === 'signed') {
      if (dim.size === 1) {
        return (dv, po) => dv.getInt8(po + offset) * scale + dimOffset;
      }
      if (dim.size === 2) {
        return (dv, po) => dv.getInt16(po + offset, true) * scale + dimOffset;
      }
      if (dim.size === 4) {
        return (dv, po) => dv.getInt32(po + offset, true) * scale + dimOffset;
      }
      if (dim.size === 8) {
        // JavaScript doesn't have native int64, use BigInt
        return (dv, po) => Number(dv.getBigInt64(po + offset, true)) * scale + dimOffset;
      }
    } else { // unsigned
      if (dim.size === 1) {
        return (dv, po) => dv.getUint8(po + offset) * scale + dimOffset;
      }
      if (dim.size === 2) {
        return (dv, po) => dv.getUint16(po + offset, true) * scale + dimOffset;
      }
      if (dim.size === 4) {
        return (dv, po) => dv.getUint32(po + offset, true) * scale + dimOffset;
      }
      if (dim.size === 8) {
        return (dv, po) => Number(dv.getBigUint64(po + offset, true)) * scale + dimOffset;
      }
    }

    return () => 0;
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
   * Gets the octree spacing value.
   */
  getSpacing(): number {
    if (!this._metadata) return 1;
    const cubeSize = this._metadata.bounds[3] - this._metadata.bounds[0];
    return cubeSize / this._metadata.span;
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
    if (!this._metadata) {
      throw new Error('Metadata not loaded');
    }

    const [depth, x, y, z] = key;
    const [cubeMinX, cubeMinY, cubeMinZ, cubeMaxX] = this._metadata.bounds;
    const cubeSize = cubeMaxX - cubeMinX;

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

    // Add 20% buffer around viewport
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
   *
   * @param nodeBounds - Node bounds in WGS84
   * @param viewport - Current viewport info
   * @returns Priority value (lower = higher priority)
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
   * Loads hierarchy from a hierarchy JSON file.
   *
   * @param key - Hierarchy key (e.g., "0-0-0-0")
   */
  private async _loadHierarchy(key: string): Promise<void> {
    if (this._hierarchyCache.has(key)) return;

    const url = `${this._baseUrl}/ept-hierarchy/${key}.json`;
    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.warn(`Failed to load hierarchy ${key}: ${response.status}`);
        return;
      }

      const hierarchy: EptHierarchy = await response.json();
      this._hierarchyCache.set(key, hierarchy);

      // Process hierarchy entries
      for (const [nodeKey, value] of Object.entries(hierarchy)) {
        const keyArray = this._parseNodeKey(nodeKey);
        const { bounds, boundsWgs84 } = this._calculateNodeBounds(keyArray);

        if (value === -1) {
          // Subtree root - create a placeholder entry and mark for later loading
          this._subtreeRoots.add(nodeKey);
          if (!this._nodeCache.has(nodeKey)) {
            this._nodeCache.set(nodeKey, {
              key: nodeKey,
              keyArray,
              state: 'subtree', // Special state for subtree roots
              pointCount: 0,
              bounds,
              boundsWgs84,
            });
          }
        } else if (value > 0 && !this._nodeCache.has(nodeKey)) {
          // Create node cache entry
          this._nodeCache.set(nodeKey, {
            key: nodeKey,
            keyArray,
            state: 'pending',
            pointCount: value,
            bounds,
            boundsWgs84,
          });
        }
      }
    } catch (error) {
      console.warn(`Error loading hierarchy ${key}:`, error);
    }
  }

  /**
   * Ensures root hierarchy is loaded.
   * Subtree hierarchies are loaded on-demand in selectNodesForViewport.
   */
  private async _ensureHierarchyLoaded(): Promise<void> {
    // Load root hierarchy first
    if (!this._rootHierarchyLoaded) {
      await this._loadHierarchy('0-0-0-0');
      this._rootHierarchyLoaded = true;
    }
    // Note: Subtree hierarchies are loaded on-demand when they intersect the viewport
  }

  /**
   * Finds nodes that intersect the viewport and should be loaded.
   *
   * @param viewport - Current viewport information
   * @returns Sorted array of nodes to load (by priority)
   */
  async selectNodesForViewport(viewport: ViewportInfo): Promise<EptCachedNode[]> {
    if (!this._isInitialized) {
      throw new Error('EptStreamingLoader not initialized. Call initialize() first.');
    }

    // Ensure root hierarchy is loaded
    await this._ensureHierarchyLoaded();

    const targetDepth = viewport.targetDepth;

    // First pass: find subtree nodes that intersect viewport and load their hierarchies
    // This handles large datasets where data is nested in subtrees
    const subtreesToLoad: string[] = [];
    for (const [, node] of this._nodeCache) {
      const depth = node.keyArray[0];

      // Only check subtrees within our target depth range
      if (depth > targetDepth + 2) continue;

      // Check if this subtree intersects viewport
      if (node.state === 'subtree' && this._boundsIntersectsViewport(node.boundsWgs84, viewport)) {
        if (!this._hierarchyCache.has(node.key)) {
          subtreesToLoad.push(node.key);
        }
      }
    }

    // Load intersecting subtree hierarchies (limit to prevent too many requests)
    const maxSubtreesToLoad = 10;
    for (const subtreeKey of subtreesToLoad.slice(0, maxSubtreesToLoad)) {
      await this._loadHierarchy(subtreeKey);
    }

    // Second pass: collect loadable nodes
    const nodesToLoad: EptCachedNode[] = [];
    const now = Date.now();
    const retryCooldownMs = 5000; // Wait 5 seconds before retrying failed nodes

    for (const [, node] of this._nodeCache) {
      const depth = node.keyArray[0];

      // Skip subtree placeholders (they have no point data)
      if (node.state === 'subtree') continue;

      // Skip permanently failed nodes
      if (node.state === 'error') continue;

      // Skip nodes that recently failed (cooldown period)
      if (node.lastFailedAt && (now - node.lastFailedAt) < retryCooldownMs) {
        continue;
      }

      // Skip nodes deeper than we need
      if (depth > targetDepth + 1) continue;

      // Check viewport intersection
      if (!this._boundsIntersectsViewport(node.boundsWgs84, viewport)) {
        continue;
      }

      // Add to load list if not already loaded/loading
      if (node.state !== 'loaded' && node.state !== 'loading') {
        const distPriority = this._calculateNodePriority(node.boundsWgs84, viewport);
        node.priority = distPriority - (depth * 0.0001);
        nodesToLoad.push(node);
      }
    }

    // Sort by priority (center-first)
    nodesToLoad.sort((a, b) => (a.priority || Infinity) - (b.priority || Infinity));

    return nodesToLoad;
  }

  /**
   * Queues a node for loading.
   *
   * @param node - Node to queue
   */
  queueNode(node: EptCachedNode): void {
    if (node.state !== 'pending') return;
    if (this._loadingQueue.find((n) => n.key === node.key)) return;

    this._loadingQueue.push(node);
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

      if (this._totalLoadedPoints + node.pointCount > this._options.pointBudget) {
        this._emit('budgetreached', this._getProgressEvent());
        break;
      }

      this._loadNode(node);
    }
  }

  /**
   * Gets the data URL for a node.
   *
   * @param key - Node key
   * @returns URL to the data file
   */
  private _getDataUrl(key: string): string {
    const ext = this._metadata?.dataType === 'binary' ? 'bin' : 'laz';
    return `${this._baseUrl}/ept-data/${key}.${ext}`;
  }

  /**
   * Loads a single node's point data.
   *
   * @param node - Node to load
   */
  private async _loadNode(node: EptCachedNode): Promise<void> {
    if (node.state === 'loaded' || node.state === 'loading') return;

    node.state = 'loading';
    this._activeRequests++;

    // Reserve buffer space before async operations
    const startIndex = this._totalLoadedPoints;
    node.bufferStartIndex = startIndex;
    const reservedPoints = node.pointCount;
    this._totalLoadedPoints += reservedPoints;

    try {
      const dataUrl = this._getDataUrl(node.key);

      if (this._metadata?.dataType === 'laszip') {
        // Use @loaders.gl/las to load and decompress LAZ files
        await this._loadLazNode(dataUrl, node, startIndex);
      } else {
        // Binary format - load and parse directly
        await this._loadBinaryNode(dataUrl, node, startIndex);
      }

      node.state = 'loaded';
      this._totalLoadedNodes++;

      this._emit('nodeloaded', node);
      this._emit('progress', this._getProgressEvent());

      this._scheduleLayerUpdate();
    } catch (error) {
      // Release the reserved buffer space on failure
      this._totalLoadedPoints -= reservedPoints;
      node.bufferStartIndex = undefined;

      // Track retry count and set cooldown timestamp
      node.retryCount = (node.retryCount || 0) + 1;
      node.lastFailedAt = Date.now();
      const maxRetries = 3;

      if (node.retryCount < maxRetries) {
        // Mark as pending to allow retry after cooldown
        node.state = 'pending';
        node.error = error instanceof Error ? error.message : String(error);

        // Only log first failure
        if (node.retryCount === 1) {
          console.warn(`Failed to load EPT node ${node.key} (will retry): ${node.error}`);
        }
      } else {
        // Max retries reached, mark as permanently failed
        node.state = 'error';
        node.error = error instanceof Error ? error.message : String(error);
        console.warn(`Failed to load EPT node ${node.key} after ${maxRetries} attempts: ${node.error}`);
      }
    } finally {
      this._activeRequests--;
      this.loadQueuedNodes();
    }
  }

  /**
   * Loads a LAZ node using @loaders.gl/las.
   *
   * @param url - URL to the LAZ file
   * @param _node - Node being loaded (unused, point count from file)
   * @param startIndex - Starting index in buffers
   */
  private async _loadLazNode(
    url: string,
    _node: EptCachedNode,
    startIndex: number
  ): Promise<void> {
    // Load LAZ file using loaders.gl
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await load(url, LASLoader, {
      las: {
        shape: 'mesh',
        fp64: false,
      },
      worker: false,
    }) as any;

    // Get point data from the loaded result (loaders.gl mesh format)
    const positionAttr = data.attributes?.POSITION || data.attributes?.positions;
    const positions = positionAttr?.value as Float64Array | Float32Array | undefined;
    const colorAttr = data.attributes?.COLOR_0 || data.attributes?.colors;
    const colors = colorAttr?.value as Uint8Array | undefined;

    // loaderData contains additional attributes
    const loaderData = data.loaderData || {};

    if (!positions) {
      throw new Error('No position data in LAZ file');
    }

    const actualPointCount = positions.length / 3;

    // Detect extra dimensions on first node
    if (!this._dimensionsDetected) {
      const availableDims = Object.keys(data.attributes || {});
      for (const dimName of availableDims) {
        if (!CORE_DIMENSIONS.has(dimName) && dimName !== 'POSITION' && dimName !== 'COLOR_0' && dimName !== 'positions' && dimName !== 'colors') {
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

    // Get intensity and classification arrays if available
    const intensityAttr = data.attributes?.intensity || loaderData.intensity;
    const intensity = intensityAttr?.value as Uint16Array | undefined;
    const classificationAttr = data.attributes?.classification || loaderData.classification;
    const classification = classificationAttr?.value as Uint8Array | undefined;

    // Copy point data to our buffers
    for (let i = 0; i < actualPointCount; i++) {
      const pointIndex = startIndex + i;
      if (pointIndex >= this._options.pointBudget) break;

      const x = positions[i * 3];
      const y = positions[i * 3 + 1];
      const z = positions[i * 3 + 2];

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
      if (intensity) {
        this._intensities![pointIndex] = intensity[i] / 65535;
      }

      // Classification
      if (classification) {
        this._classifications![pointIndex] = classification[i];
      }

      // Colors
      if (this._colors && colors) {
        // loaders.gl returns RGBA colors
        const colorStride = colors.length / actualPointCount;
        const colorOffset = i * colorStride;
        this._colors[pointIndex * 4] = colors[colorOffset];
        this._colors[pointIndex * 4 + 1] = colors[colorOffset + 1];
        this._colors[pointIndex * 4 + 2] = colors[colorOffset + 2];
        this._colors[pointIndex * 4 + 3] = 255;
      }
    }
  }

  /**
   * Loads a binary node.
   *
   * @param url - URL to the binary file
   * @param node - Node being loaded
   * @param startIndex - Starting index in buffers
   */
  private async _loadBinaryNode(
    url: string,
    node: EptCachedNode,
    startIndex: number
  ): Promise<void> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch binary data: ${response.status}`);
    }

    const buffer = await response.arrayBuffer();
    const dataView = new DataView(buffer);

    // Find dimension getters
    const xGetter = this._parsedSchema.find(p => p.dimension.name === 'X')?.getter;
    const yGetter = this._parsedSchema.find(p => p.dimension.name === 'Y')?.getter;
    const zGetter = this._parsedSchema.find(p => p.dimension.name === 'Z')?.getter;
    const intensityGetter = this._parsedSchema.find(p => p.dimension.name === 'Intensity')?.getter;
    const classGetter = this._parsedSchema.find(p => p.dimension.name === 'Classification')?.getter;
    const redGetter = this._hasColor ? this._parsedSchema.find(p => p.dimension.name === 'Red')?.getter : null;
    const greenGetter = this._hasColor ? this._parsedSchema.find(p => p.dimension.name === 'Green')?.getter : null;
    const blueGetter = this._hasColor ? this._parsedSchema.find(p => p.dimension.name === 'Blue')?.getter : null;

    if (!xGetter || !yGetter || !zGetter) {
      throw new Error('Missing required X, Y, Z dimensions in EPT schema');
    }

    // Detect extra dimensions on first node
    if (!this._dimensionsDetected) {
      for (const parsed of this._parsedSchema) {
        const dimName = parsed.dimension.name;
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

    // Build getters for extra dimensions
    const extraGetters: Map<string, ParsedDimension> = new Map();
    for (const dimName of this._availableDimensions) {
      const parsed = this._parsedSchema.find(p => p.dimension.name === dimName);
      if (parsed) {
        extraGetters.set(dimName, parsed);
      }
    }

    for (let i = 0; i < node.pointCount; i++) {
      const pointIndex = startIndex + i;
      if (pointIndex >= this._options.pointBudget) break;

      const byteOffset = i * this._pointByteLength;

      const x = xGetter(dataView, byteOffset);
      const y = yGetter(dataView, byteOffset);
      const z = zGetter(dataView, byteOffset);

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
      if (intensityGetter) {
        this._intensities![pointIndex] = intensityGetter(dataView, byteOffset) / 65535;
      }

      // Classification
      if (classGetter) {
        this._classifications![pointIndex] = classGetter(dataView, byteOffset);
      }

      // Color (if available)
      if (this._colors && redGetter && greenGetter && blueGetter) {
        // EPT colors can be 8-bit or 16-bit depending on schema
        const redDim = this._parsedSchema.find(p => p.dimension.name === 'Red')?.dimension;
        const is16Bit = redDim?.size === 2;

        if (is16Bit) {
          this._colors[pointIndex * 4] = redGetter(dataView, byteOffset) >> 8;
          this._colors[pointIndex * 4 + 1] = greenGetter(dataView, byteOffset) >> 8;
          this._colors[pointIndex * 4 + 2] = blueGetter(dataView, byteOffset) >> 8;
        } else {
          this._colors[pointIndex * 4] = redGetter(dataView, byteOffset);
          this._colors[pointIndex * 4 + 1] = greenGetter(dataView, byteOffset);
          this._colors[pointIndex * 4 + 2] = blueGetter(dataView, byteOffset);
        }
        this._colors[pointIndex * 4 + 3] = 255;
      }

      // Extra attributes
      for (const [dimName, parsed] of extraGetters) {
        const arr = this._extraAttributes[dimName];
        if (arr) {
          arr[pointIndex] = parsed.getter(dataView, byteOffset);
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
      hasIntensity: this._hasIntensity,
      hasClassification: true,
      wkt: this._metadata?.srs?.wkt,
    };
  }

  /**
   * Gets the current streaming progress.
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
    data: StreamingProgressEvent | EptCachedNode | Error
  ): void {
    const handlers = this._eventHandlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        // Cast EptCachedNode to unknown first to satisfy the handler type
        // (handlers don't use COPC-specific fields like pointDataOffset)
        handler(event, data as Parameters<StreamingLoaderEventHandler>[1]);
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
   * Gets the EPT metadata.
   */
  getMetadata(): EptMetadata | null {
    return this._metadata;
  }

  /**
   * Destroys the streaming loader and cleans up resources.
   */
  destroy(): void {
    if (this._updateBatchTimeout) {
      clearTimeout(this._updateBatchTimeout);
    }

    this._loadingQueue = [];
    this._nodeCache.clear();
    this._hierarchyCache.clear();
    this._subtreeRoots.clear();
    this._eventHandlers.clear();

    this._positions = null;
    this._colors = null;
    this._intensities = null;
    this._classifications = null;
    this._extraAttributes = {};
  }
}
