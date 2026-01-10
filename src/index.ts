// Import styles
import './lib/styles/lidar-control.css';

// Main entry point - Core exports
export { LidarControl } from './lib/core/LidarControl';
export { DeckOverlay } from './lib/core/DeckOverlay';
export { PointCloudLoader } from './lib/loaders/PointCloudLoader';
export { PointCloudManager } from './lib/layers/PointCloudManager';
export { ColorSchemeProcessor, getClassificationName } from './lib/colorizers/ColorScheme';

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
} from './lib/core/types';

export type {
  PointCloudData,
  LoaderOptions,
} from './lib/loaders/types';

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
