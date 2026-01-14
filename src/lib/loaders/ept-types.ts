import type { PointCloudBounds } from '../core/types';
import type { NodeKey, NodeState } from './streaming-types';

/**
 * EPT metadata from ept.json
 */
export interface EptMetadata {
  /** Bounds of the octree cube [minX, minY, minZ, maxX, maxY, maxZ] */
  bounds: [number, number, number, number, number, number];
  /** Tighter bounds conforming to actual data */
  boundsConforming: [number, number, number, number, number, number];
  /** Data encoding format */
  dataType: 'laszip' | 'binary' | 'zstandard';
  /** Hierarchy file compression type */
  hierarchyType: 'json' | 'gzip';
  /** Total number of points (some EPT versions use 'points' instead) */
  numPoints: number;
  /** Schema definition for point attributes */
  schema: EptDimension[];
  /** Voxel grid dimension per axis (e.g., 256) */
  span: number;
  /** Spatial reference system */
  srs: EptSrs;
  /** EPT format version */
  version: string;
}

/**
 * EPT dimension schema entry
 */
export interface EptDimension {
  /** Dimension name (e.g., "X", "Y", "Z", "Intensity") */
  name: string;
  /** Data type */
  type: 'signed' | 'unsigned' | 'float';
  /** Size in bytes (1, 2, 4, or 8) */
  size: number;
  /** Scale factor to apply when reading */
  scale?: number;
  /** Offset to add after scaling */
  offset?: number;
}

/**
 * EPT Spatial Reference System
 */
export interface EptSrs {
  /** Authority name (e.g., "EPSG") */
  authority?: string;
  /** Horizontal coordinate system code */
  horizontal?: string;
  /** Vertical coordinate system code */
  vertical?: string;
  /** Well-Known Text representation */
  wkt?: string;
}

/**
 * EPT hierarchy JSON structure
 * Key format: "D-X-Y-Z" (depth-x-y-z)
 * Value: point count (>=0) or -1 (subtree in separate file)
 */
export type EptHierarchy = Record<string, number>;

/**
 * Cached EPT node with loading state
 */
export interface EptCachedNode {
  /** String format key: "depth-x-y-z" */
  key: string;
  /** Array format key: [depth, x, y, z] */
  keyArray: NodeKey;
  /** Current state of the node */
  state: NodeState;
  /** Number of points in this node */
  pointCount: number;
  /** Bounding box in source CRS */
  bounds: PointCloudBounds;
  /** Bounding box in WGS84 (for viewport intersection) */
  boundsWgs84: PointCloudBounds;
  /** Distance from viewport center (for priority queue) */
  priority?: number;
  /** Points array slice start index in the main buffer */
  bufferStartIndex?: number;
  /** Error message if state is 'error' */
  error?: string;
  /** Number of load retry attempts */
  retryCount?: number;
  /** Timestamp of last failed attempt (for retry cooldown) */
  lastFailedAt?: number;
}

/**
 * Parsed schema dimension with getter function
 */
export interface ParsedDimension {
  /** Original dimension definition */
  dimension: EptDimension;
  /** Byte offset within a point record */
  byteOffset: number;
  /** Function to read value from DataView */
  getter: (dataView: DataView, pointByteOffset: number) => number;
}
