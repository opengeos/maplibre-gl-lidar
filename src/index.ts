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
