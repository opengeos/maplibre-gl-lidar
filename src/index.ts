// Import styles
import './lib/styles/lidar-control.css';

// Main entry point - Core exports
export { LidarControl } from './lib/core/LidarControl';
export { DeckOverlay } from './lib/core/DeckOverlay';
export { ViewportManager } from './lib/core/ViewportManager';
export { PointCloudLoader } from './lib/loaders/PointCloudLoader';
export { CopcStreamingLoader } from './lib/loaders/CopcStreamingLoader';
export { EptStreamingLoader } from './lib/loaders/EptStreamingLoader';
export { PointCloudManager } from './lib/layers/PointCloudManager';
export { ColorSchemeProcessor, getClassificationName } from './lib/colorizers/ColorScheme';
export { COLORMAPS, COLORMAP_NAMES, COLORMAP_LABELS, getColormap } from './lib/colorizers/Colormaps';

// Tools exports
export { CrossSectionTool, ElevationProfileExtractor } from './lib/tools';

// GUI exports
export { MetadataPanel } from './lib/gui/MetadataPanel';
export { CrossSectionPanel } from './lib/gui/CrossSectionPanel';
export { ElevationProfileChart } from './lib/gui/ElevationProfileChart';

// Layer control adapter
export { LidarLayerAdapter } from './lib/adapters';

// Type exports
export type {
  LidarControlOptions,
  LidarState,
  LidarControlEvent,
  LidarControlEventHandler,
  LidarEventData,
  PointCloudInfo,
  PointCloudBounds,
  ColorScheme,
  ColorSchemeType,
  ColorSchemeConfig,
  CopcLoadingMode,
  ColormapName,
  ColorRangeConfig,
  // Metadata types
  DimensionInfo,
  CopcMetadata,
  EptExtendedMetadata,
  PointCloudFullMetadata,
  // Cross-section types
  CrossSectionLine,
  ProfilePoint,
  ElevationProfile,
} from './lib/core/types';

export type {
  PointCloudData,
  LoaderOptions,
} from './lib/loaders/types';

export type {
  StreamingLoaderOptions,
  StreamingProgressEvent,
  ViewportInfo,
  CachedNode,
  NodeKey,
  NodeState,
  StreamingLoaderEvent,
  StreamingLoaderEventHandler,
  StreamingLoadOptions,
} from './lib/loaders/streaming-types';

export type {
  EptMetadata,
  EptDimension,
  EptSrs,
  EptHierarchy,
  EptCachedNode,
} from './lib/loaders/ept-types';

export type {
  PointCloudLayerOptions,
} from './lib/layers/types';

// Utility exports
export {
  clamp,
  formatNumericValue,
  generateId,
  debounce,
  throttle,
  classNames,
  formatNumber,
  formatBytes,
  getFilename,
} from './lib/utils';
