import type { Map } from 'maplibre-gl';

/**
 * COPC loading mode options
 */
export type CopcLoadingMode = 'full' | 'dynamic';

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
   * Maximum height of the control panel in pixels.
   * When content exceeds this height, a vertical scrollbar appears.
   * @default 500
   */
  panelMaxHeight?: number;

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
   * Whether to use percentile range (2-98%) for elevation/intensity coloring.
   * When true, outliers are clipped for better color distribution.
   * @default true
   */
  usePercentile?: boolean;

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

  /**
   * List of attribute names to display in the pick point info panel.
   * If not specified or empty, all available attributes will be shown.
   * Example: ['GpsTime', 'ReturnNumber', 'Classification', 'Intensity']
   * @default undefined (show all)
   */
  pickInfoFields?: string[];

  /**
   * Whether Z offset adjustment is enabled
   * @default false
   */
  zOffsetEnabled?: boolean;

  /**
   * Z offset value in meters (shifts point cloud vertically)
   * @default 0
   */
  zOffset?: number;

  /**
   * Whether to automatically calculate and apply Z offset based on the 2nd percentile
   * of elevation values. This brings point clouds down to ground level by offsetting
   * the minimum elevation to near zero.
   * @default true
   */
  autoZOffset?: boolean;

  /**
   * Loading mode for COPC files: 'full' loads entire file, 'dynamic' streams based on viewport
   * @default 'full'
   */
  copcLoadingMode?: CopcLoadingMode;

  /**
   * Whether 3D terrain is enabled
   * @default false
   */
  terrainEnabled?: boolean;

  /**
   * Terrain exaggeration factor (1.0 = actual elevation)
   * @default 1.0
   */
  terrainExaggeration?: number;

  /**
   * Point budget for streaming mode (maximum points in memory)
   * @default 5000000
   */
  streamingPointBudget?: number;

  /**
   * Maximum concurrent requests for streaming mode
   * @default 4
   */
  streamingMaxConcurrentRequests?: number;

  /**
   * Debounce time for viewport changes in streaming mode (ms)
   * @default 150
   */
  streamingViewportDebounceMs?: number;
}

/**
 * Internal state of the LiDAR control
 */
export interface LidarState {
  collapsed: boolean;
  panelWidth: number;
  panelMaxHeight: number;
  pointClouds: PointCloudInfo[];
  activePointCloudId: string | null;
  pointSize: number;
  opacity: number;
  colorScheme: ColorScheme;
  /** Whether to use percentile range (2-98%) for elevation/intensity coloring */
  usePercentile: boolean;
  elevationRange: [number, number] | null;
  pointBudget: number;
  pickable: boolean;
  loading: boolean;
  error: string | null;
  /** List of attribute names to show in pick info, or undefined to show all */
  pickInfoFields?: string[];
  /** Whether Z offset adjustment is enabled */
  zOffsetEnabled: boolean;
  /** Z offset value in meters */
  zOffset: number;
  /** Base value for Z offset slider range (2% percentile of elevation) */
  zOffsetBase?: number;
  /** Whether streaming mode is active */
  streamingActive?: boolean;
  /** Current streaming progress */
  streamingProgress?: {
    loadedNodes: number;
    loadedPoints: number;
    queueSize: number;
    isLoading: boolean;
  };
  /** Set of classification codes that are currently hidden (toggled off) */
  hiddenClassifications: Set<number>;
  /** Set of classification codes present in loaded point cloud data */
  availableClassifications: Set<number>;
  /** Whether 3D terrain is enabled */
  terrainEnabled: boolean;
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
  | 'stylechange'
  | 'streamingprogress'
  | 'streamingstart'
  | 'streamingstop'
  | 'budgetreached';

/**
 * Event data passed to event handlers
 */
export interface LidarEventData {
  type: LidarControlEvent;
  state: LidarState;
  /** Full point cloud info (for load events) or just the id (for unload events) */
  pointCloud?: PointCloudInfo | { id: string };
  error?: Error;
}

/**
 * Event handler function type
 */
export type LidarControlEventHandler = (event: LidarEventData) => void;

/**
 * Ref type for accessing the internal LidarControl instance
 */
export interface LidarControlRef {
  /** The internal LidarControl instance */
  getControl(): import('./LidarControl').LidarControl | null;
}

/**
 * Props for the React wrapper component
 */
export interface LidarControlReactProps extends LidarControlOptions {
  /**
   * MapLibre GL map instance
   */
  map: Map;

  /**
   * URL to load automatically when the control is added to the map
   */
  defaultUrl?: string;

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

  /**
   * Callback to receive the internal LidarControl instance.
   * Use this to integrate with other controls like maplibre-gl-layer-control.
   */
  onControlReady?: (control: import('./LidarControl').LidarControl) => void;
}
