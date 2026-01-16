import { useState, useCallback } from 'react';
import type { LidarState, ColorScheme } from '../core/types';

/**
 * Default initial state for the LiDAR control
 */
const DEFAULT_STATE: LidarState = {
  collapsed: true,
  panelWidth: 365,
  panelMaxHeight: 600,
  pointClouds: [],
  activePointCloudId: null,
  pointSize: 2,
  opacity: 1.0,
  colorScheme: 'elevation',
  colormap: 'viridis',
  colorRange: {
    mode: 'percentile',
    percentileLow: 2,
    percentileHigh: 98,
  },
  showColorbar: true,
  usePercentile: true,
  elevationRange: null,
  pointBudget: 1000000,
  pickable: false,
  loading: false,
  error: null,
  zOffsetEnabled: false,
  zOffset: 0,
  hiddenClassifications: new Set(),
  availableClassifications: new Set(),
  terrainEnabled: false,
};

/**
 * Custom hook for managing LiDAR state in React applications.
 *
 * This hook provides a simple way to track and update the state
 * of a LidarControl from React components.
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { state, setPointSize, setColorScheme, toggle } = useLidarState();
 *
 *   return (
 *     <div>
 *       <button onClick={toggle}>
 *         {state.collapsed ? 'Expand' : 'Collapse'}
 *       </button>
 *       <button onClick={() => setColorScheme('intensity')}>
 *         Show Intensity
 *       </button>
 *       <LidarControlReact
 *         map={map}
 *         collapsed={state.collapsed}
 *         pointSize={state.pointSize}
 *         colorScheme={state.colorScheme}
 *         onStateChange={(newState) => setState(newState)}
 *       />
 *     </div>
 *   );
 * }
 * ```
 *
 * @param initialState - Optional initial state values
 * @returns Object containing state and update functions
 */
export function useLidarState(initialState?: Partial<LidarState>) {
  const [state, setState] = useState<LidarState>({
    ...DEFAULT_STATE,
    ...initialState,
  });

  /**
   * Sets the collapsed state
   */
  const setCollapsed = useCallback((collapsed: boolean) => {
    setState((prev) => ({ ...prev, collapsed }));
  }, []);

  /**
   * Sets the panel width
   */
  const setPanelWidth = useCallback((panelWidth: number) => {
    setState((prev) => ({ ...prev, panelWidth }));
  }, []);

  /**
   * Sets the point size
   */
  const setPointSize = useCallback((pointSize: number) => {
    setState((prev) => ({ ...prev, pointSize }));
  }, []);

  /**
   * Sets the opacity
   */
  const setOpacity = useCallback((opacity: number) => {
    setState((prev) => ({ ...prev, opacity }));
  }, []);

  /**
   * Sets the color scheme
   */
  const setColorScheme = useCallback((colorScheme: ColorScheme) => {
    setState((prev) => ({ ...prev, colorScheme }));
  }, []);

  /**
   * Sets whether to use percentile range for coloring
   */
  const setUsePercentile = useCallback((usePercentile: boolean) => {
    setState((prev) => ({ ...prev, usePercentile }));
  }, []);

  /**
   * Sets the elevation range filter
   */
  const setElevationRange = useCallback((elevationRange: [number, number] | null) => {
    setState((prev) => ({ ...prev, elevationRange }));
  }, []);

  /**
   * Sets the point budget
   */
  const setPointBudget = useCallback((pointBudget: number) => {
    setState((prev) => ({ ...prev, pointBudget }));
  }, []);

  /**
   * Sets whether Z offset is enabled
   */
  const setZOffsetEnabled = useCallback((zOffsetEnabled: boolean) => {
    setState((prev) => ({ ...prev, zOffsetEnabled }));
  }, []);

  /**
   * Sets the Z offset value
   */
  const setZOffset = useCallback((zOffset: number) => {
    setState((prev) => ({ ...prev, zOffset }));
  }, []);

  /**
   * Sets whether 3D terrain is enabled
   */
  const setTerrainEnabled = useCallback((terrainEnabled: boolean) => {
    setState((prev) => ({ ...prev, terrainEnabled }));
  }, []);

  /**
   * Resets the state to default values
   */
  const reset = useCallback(() => {
    setState({ ...DEFAULT_STATE, ...initialState });
  }, [initialState]);

  /**
   * Toggles the collapsed state
   */
  const toggle = useCallback(() => {
    setState((prev) => ({ ...prev, collapsed: !prev.collapsed }));
  }, []);

  return {
    state,
    setState,
    setCollapsed,
    setPanelWidth,
    setPointSize,
    setOpacity,
    setColorScheme,
    setUsePercentile,
    setElevationRange,
    setPointBudget,
    setZOffsetEnabled,
    setZOffset,
    setTerrainEnabled,
    reset,
    toggle,
  };
}
