// React entry point
export { LidarControlReact } from './lib/core/LidarControlReact';

// React hooks
export { useLidarState } from './lib/hooks/useLidarState';
export { usePointCloud } from './lib/hooks/usePointCloud';

// Re-export types for React consumers
export type {
  LidarControlOptions,
  LidarState,
  LidarControlReactProps,
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
