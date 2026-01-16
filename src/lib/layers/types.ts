import type { ColorScheme, ColormapName, ColorRangeConfig } from '../core/types';

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
  /** Red color component (0-255) if available */
  red?: number;
  /** Green color component (0-255) if available */
  green?: number;
  /** Blue color component (0-255) if available */
  blue?: number;
  /** Dynamic map of all extra attributes available for this point */
  attributes?: Record<string, number>;
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
   * Whether to use percentile range (2-98%) for elevation/intensity coloring
   * @default true
   * @deprecated Use colorRange instead
   */
  usePercentile: boolean;

  /**
   * Colormap to use for elevation/intensity coloring
   * @default 'viridis'
   */
  colormap?: ColormapName;

  /**
   * Configuration for color range mapping (percentile or absolute bounds)
   */
  colorRange?: ColorRangeConfig;

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
   * Z offset in meters (shifts point cloud vertically)
   * @default 0
   */
  zOffset: number;

  /**
   * Set of classification codes to hide (only applies when colorScheme is 'classification')
   */
  hiddenClassifications?: Set<number>;

  /**
   * Callback when a point is hovered (requires pickable: true)
   */
  onHover?: (info: PickedPointInfo | null) => void;
}
