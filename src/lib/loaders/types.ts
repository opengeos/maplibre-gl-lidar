import type { PointCloudBounds } from '../core/types';

/**
 * Normalized point cloud data structure
 */
export interface PointCloudData {
  /**
   * Float32Array of XYZ positions (length = pointCount * 3)
   */
  positions: Float32Array;

  /**
   * Optional Uint8Array of RGB colors (length = pointCount * 3)
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
   * Number of points in the cloud
   */
  pointCount: number;

  /**
   * Bounding box of the point cloud
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
