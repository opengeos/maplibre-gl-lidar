import { useEffect, useRef } from 'react';
import { LidarControl } from './LidarControl';
import type { LidarControlReactProps } from './types';

/**
 * React wrapper component for LidarControl.
 *
 * This component manages the lifecycle of a LidarControl instance,
 * adding it to the map on mount and removing it on unmount.
 *
 * @example
 * ```tsx
 * import { LidarControlReact } from 'maplibre-gl-lidar/react';
 *
 * function MyMap() {
 *   const [map, setMap] = useState<Map | null>(null);
 *
 *   return (
 *     <>
 *       <div ref={mapContainer} />
 *       {map && (
 *         <LidarControlReact
 *           map={map}
 *           title="LiDAR Viewer"
 *           collapsed={false}
 *           onLoad={(pc) => console.log('Loaded:', pc)}
 *         />
 *       )}
 *     </>
 *   );
 * }
 * ```
 *
 * @param props - Component props including map instance and control options
 * @returns null - This component renders nothing directly
 */
export function LidarControlReact({
  map,
  defaultUrl,
  onStateChange,
  onLoad,
  onError,
  onControlReady,
  ...options
}: LidarControlReactProps): null {
  const controlRef = useRef<LidarControl | null>(null);

  useEffect(() => {
    if (!map) return;

    // Create the control instance
    const control = new LidarControl(options);
    controlRef.current = control;

    // Register event handlers
    if (onStateChange) {
      control.on('statechange', (event) => {
        onStateChange(event.state);
      });
    }

    if (onLoad) {
      control.on('load', (event) => {
        // Load events always provide full PointCloudInfo (with 'name' field)
        if (event.pointCloud && 'name' in event.pointCloud) {
          onLoad(event.pointCloud);
        }
      });
    }

    if (onError) {
      control.on('loaderror', (event) => {
        if (event.error) {
          onError(event.error);
        }
      });
    }

    // Add control to map
    map.addControl(control, options.position || 'top-right');

    // Notify that control is ready
    if (onControlReady) {
      onControlReady(control);
    }

    // Load default URL if provided
    if (defaultUrl) {
      control.loadPointCloud(defaultUrl).catch((err) => {
        console.error('Failed to load default URL:', err);
      });
    }

    // Cleanup on unmount
    return () => {
      if (map.hasControl(control)) {
        map.removeControl(control);
      }
      controlRef.current = null;
    };
  }, [map]);

  // Update options when they change
  useEffect(() => {
    if (controlRef.current) {
      // Handle collapsed state changes
      const currentState = controlRef.current.getState();
      if (options.collapsed !== undefined && options.collapsed !== currentState.collapsed) {
        if (options.collapsed) {
          controlRef.current.collapse();
        } else {
          controlRef.current.expand();
        }
      }

      // Handle style changes
      if (options.pointSize !== undefined && options.pointSize !== currentState.pointSize) {
        controlRef.current.setPointSize(options.pointSize);
      }

      if (options.opacity !== undefined && options.opacity !== currentState.opacity) {
        controlRef.current.setOpacity(options.opacity);
      }

      if (options.colorScheme !== undefined && options.colorScheme !== currentState.colorScheme) {
        controlRef.current.setColorScheme(options.colorScheme);
      }
    }
  }, [options.collapsed, options.pointSize, options.opacity, options.colorScheme]);

  return null;
}
