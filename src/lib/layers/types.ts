import type { ColorScheme } from '../core/types';

/**
 * Information about a picked point
 */
export interface PickedPointInfo {
  /** Point index within the point cloud */
  index: number;
  /** Longitude coordinate */
  longitude: number;
  /** Latitude coordinate */
  latitude: number;
  /** Elevation in meters */
  elevation: number;
  /** Intensity value (0-1) if available */
  intensity?: number;
  /** Classification code if available */
  classification?: number;
  /** Screen X coordinate */
  x: number;
  /** Screen Y coordinate */
  y: number;
}

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

  /**
   * Whether points are pickable (enables hover/click interactions)
   * @default false
   */
  pickable: boolean;

  /**
   * Callback when a point is hovered (requires pickable: true)
   */
  onHover?: (info: PickedPointInfo | null) => void;
}
