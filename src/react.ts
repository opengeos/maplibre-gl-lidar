// React entry point
export { LidarControlReact } from './lib/core/LidarControlReact';
export { LidarControl } from './lib/core/LidarControl';

// Layer control adapter
export { LidarLayerAdapter } from './lib/adapters';

// React hooks
export { useLidarState } from './lib/hooks/useLidarState';
export { usePointCloud } from './lib/hooks/usePointCloud';

// Re-export types for React consumers
export type {
  LidarControlOptions,
  LidarState,
  LidarControlReactProps,
  LidarControlRef,
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
