import type { PointCloudBounds } from '../core/types';

/**
 * COPC loading mode options
 */
export type CopcLoadingMode = 'full' | 'dynamic';

/**
 * Represents an octree node key in COPC format
 * Format: [depth, x, y, z]
 */
export type NodeKey = [number, number, number, number];

/**
 * Streaming loader options
 */
export interface StreamingLoaderOptions {
  /**
   * Maximum number of points to keep in memory
   * @default 5_000_000
   */
  pointBudget?: number;

  /**
   * Maximum concurrent node requests
   * @default 4
   */
  maxConcurrentRequests?: number;

  /**
   * Debounce time for viewport changes in ms
   * @default 150
   */
  viewportDebounceMs?: number;

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
}

/**
 * State of a node in the streaming cache
 */
export type NodeState = 'pending' | 'loading' | 'loaded' | 'error';

/**
 * Cached node data
 */
export interface CachedNode {
  /** String format key: "depth-x-y-z" */
  key: string;
  /** Array format key: [depth, x, y, z] */
  keyArray: NodeKey;
  /** Current state of the node */
  state: NodeState;
  /** Number of points in this node */
  pointCount: number;
  /** Offset in the COPC file for point data */
  pointDataOffset: number;
  /** Length of point data in bytes */
  pointDataLength: number;
  /** Bounding box in source CRS */
  bounds: PointCloudBounds;
  /** Bounding box in WGS84 (for viewport intersection) */
  boundsWgs84: PointCloudBounds;
  /** Distance from viewport center (for priority queue) - lower = higher priority */
  priority?: number;
  /** Points array slice start index in the main buffer */
  bufferStartIndex?: number;
  /** Error message if state is 'error' */
  error?: string;
}

/**
 * Viewport information for node selection
 */
export interface ViewportInfo {
  /** Viewport bounds in WGS84 [west, south, east, north] */
  bounds: [number, number, number, number];
  /** Viewport center in WGS84 [lng, lat] */
  center: [number, number];
  /** Current zoom level */
  zoom: number;
  /** Current pitch (tilt angle in degrees) */
  pitch: number;
  /** Target octree depth based on zoom and pitch */
  targetDepth: number;
}

/**
 * Streaming progress event data
 */
export interface StreamingProgressEvent {
  /** Total nodes in viewport */
  totalNodesInView: number;
  /** Nodes currently loaded */
  loadedNodes: number;
  /** Points currently loaded */
  loadedPoints: number;
  /** Point budget limit */
  pointBudget: number;
  /** Whether loading is in progress */
  isLoading: boolean;
  /** Current loading queue size */
  queueSize: number;
}

/**
 * Events emitted by the streaming loader
 */
export type StreamingLoaderEvent =
  | 'progress'
  | 'nodeloaded'
  | 'viewportchange'
  | 'budgetreached'
  | 'error';

/**
 * Event handler for streaming loader events
 */
export type StreamingLoaderEventHandler = (
  event: StreamingLoaderEvent,
  data: StreamingProgressEvent | CachedNode | Error
) => void;

/**
 * Load options that can be passed to loadPointCloud for streaming
 */
export interface StreamingLoadOptions extends StreamingLoaderOptions {
  /**
   * Loading mode: 'full' for complete load, 'dynamic' for viewport-based streaming
   * @default 'full'
   */
  loadingMode?: CopcLoadingMode;
}
