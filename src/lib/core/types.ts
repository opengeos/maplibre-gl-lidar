import type { Map } from 'maplibre-gl';

/**
 * Color scheme options for point cloud visualization
 */
export type ColorSchemeType = 'elevation' | 'intensity' | 'classification' | 'rgb';

/**
 * Custom color scheme configuration
 */
export interface ColorSchemeConfig {
  type: 'gradient' | 'categorical';
  attribute: string;
  colors?: string[];
  domain?: [number, number];
}

/**
 * Color scheme can be a preset string or custom configuration
 */
export type ColorScheme = ColorSchemeType | ColorSchemeConfig;

/**
 * Point cloud bounding box
 */
export interface PointCloudBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

/**
 * Information about a loaded point cloud
 */
export interface PointCloudInfo {
  id: string;
  name: string;
  pointCount: number;
  bounds: PointCloudBounds;
  hasRGB: boolean;
  hasIntensity: boolean;
  hasClassification: boolean;
  source: string;
  /** WKT string describing the coordinate reference system */
  wkt?: string;
}

/**
 * Options for configuring the LidarControl
 */
export interface LidarControlOptions {
  /**
   * Whether the control panel should start collapsed
   * @default true
   */
  collapsed?: boolean;

  /**
   * Position of the control on the map
   * @default 'top-right'
   */
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

  /**
   * Title displayed in the control header
   * @default 'LiDAR Viewer'
   */
  title?: string;

  /**
   * Width of the control panel in pixels
   * @default 320
   */
  panelWidth?: number;

  /**
   * Custom CSS class name for the control container
   */
  className?: string;

  /**
   * Point size in pixels
   * @default 2
   */
  pointSize?: number;

  /**
   * Point cloud opacity (0-1)
   * @default 1.0
   */
  opacity?: number;

  /**
   * Color scheme for visualization
   * @default 'elevation'
   */
  colorScheme?: ColorScheme;

  /**
   * Maximum number of points to display
   * @default 1000000
   */
  pointBudget?: number;

  /**
   * Elevation range filter [min, max] or null for no filter
   * @default null
   */
  elevationRange?: [number, number] | null;

  /**
   * Whether points are pickable (enables hover/click interactions)
   * @default false
   */
  pickable?: boolean;

  /**
   * Whether to automatically zoom to the data extent after loading
   * @default true
   */
  autoZoom?: boolean;
}

/**
 * Internal state of the LiDAR control
 */
export interface LidarState {
  collapsed: boolean;
  panelWidth: number;
  pointClouds: PointCloudInfo[];
  activePointCloudId: string | null;
  pointSize: number;
  opacity: number;
  colorScheme: ColorScheme;
  elevationRange: [number, number] | null;
  pointBudget: number;
  pickable: boolean;
  loading: boolean;
  error: string | null;
}

/**
 * Event types emitted by the LiDAR control
 */
export type LidarControlEvent =
  | 'collapse'
  | 'expand'
  | 'statechange'
  | 'load'
  | 'loadstart'
  | 'loaderror'
  | 'unload'
  | 'stylechange';

/**
 * Event data passed to event handlers
 */
export interface LidarEventData {
  type: LidarControlEvent;
  state: LidarState;
  pointCloud?: PointCloudInfo;
  error?: Error;
}

/**
 * Event handler function type
 */
export type LidarControlEventHandler = (event: LidarEventData) => void;

/**
 * Props for the React wrapper component
 */
export interface LidarControlReactProps extends LidarControlOptions {
  /**
   * MapLibre GL map instance
   */
  map: Map;

  /**
   * Callback fired when the control state changes
   */
  onStateChange?: (state: LidarState) => void;

  /**
   * Callback fired when a point cloud is loaded
   */
  onLoad?: (pointCloud: PointCloudInfo) => void;

  /**
   * Callback fired when an error occurs
   */
  onError?: (error: Error) => void;
}
