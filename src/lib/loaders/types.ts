import type { PointCloudBounds } from '../core/types';

/**
 * Generic typed array for point attribute storage
 */
export type AttributeArray = Float64Array | Float32Array | Uint32Array | Uint16Array | Uint8Array | Int32Array | Int16Array | Int8Array;

/**
 * Extra point attributes loaded from LAS/COPC files
 * Uses a dynamic map to store any available attributes
 */
export type ExtraPointAttributes = Record<string, AttributeArray>;

/**
 * Normalized point cloud data structure
 */
export interface PointCloudData {
  /**
   * Float32Array of XYZ positions as offsets from coordinateOrigin (length = pointCount * 3)
   * Format: [deltaLng, deltaLat, elevation] for each point
   */
  positions: Float32Array;

  /**
   * Coordinate origin [lng, lat, 0] - positions are offsets from this point
   * This allows Float32Array to maintain precision for geographic coordinates
   */
  coordinateOrigin: [number, number, number];

  /**
   * Optional Uint8Array of RGB colors (length = pointCount * 4, RGBA format)
   */
  colors?: Uint8Array;

  /**
   * Optional Float32Array of intensity values (length = pointCount)
   */
  intensities?: Float32Array;

  /**
   * Optional Uint8Array of classification values (length = pointCount)
   */
  classifications?: Uint8Array;

  /**
   * Extra point attributes (GpsTime, ReturnNumber, etc.)
   */
  extraAttributes?: ExtraPointAttributes;

  /**
   * Number of points in the cloud
   */
  pointCount: number;

  /**
   * Bounding box of the point cloud (in absolute coordinates, not offsets)
   */
  bounds: PointCloudBounds;

  /**
   * Whether the point cloud has RGB color data
   */
  hasRGB: boolean;

  /**
   * Whether the point cloud has intensity data
   */
  hasIntensity: boolean;

  /**
   * Whether the point cloud has classification data
   */
  hasClassification: boolean;

  /**
   * WKT string describing the coordinate reference system
   */
  wkt?: string;
}

/**
 * Options for the point cloud loader
 */
export interface LoaderOptions {
  /**
   * URL of the worker script (null for main thread)
   */
  workerUrl?: string | null;

  /**
   * Progress callback
   */
  onProgress?: ((progress: number) => void) | null;

  /**
   * Maximum number of points to load
   */
  pointBudget?: number;
}
