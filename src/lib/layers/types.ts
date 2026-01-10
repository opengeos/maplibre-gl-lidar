import type { ColorScheme } from '../core/types';

/**
 * Options for configuring point cloud layer styling
 */
export interface PointCloudLayerOptions {
  /**
   * Point size in pixels
   */
  pointSize: number;

  /**
   * Opacity (0-1)
   */
  opacity: number;

  /**
   * Color scheme for visualization
   */
  colorScheme: ColorScheme;

  /**
   * Elevation range filter [min, max] or null for no filter
   */
  elevationRange: [number, number] | null;
}
