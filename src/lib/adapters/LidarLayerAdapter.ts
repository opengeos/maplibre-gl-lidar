import type { CustomLayerAdapter, LayerState } from 'maplibre-gl-layer-control';
import type { LidarControl } from '../core/LidarControl';

/**
 * Adapter for integrating LiDAR point cloud layers with maplibre-gl-layer-control.
 *
 * This adapter allows LiDAR point clouds to appear in the layer control panel,
 * enabling visibility toggles and opacity sliders for each loaded point cloud.
 *
 * @example
 * ```typescript
 * import { LidarControl, LidarLayerAdapter } from 'maplibre-gl-lidar';
 * import { LayerControl } from 'maplibre-gl-layer-control';
 *
 * const lidarControl = new LidarControl({ ... });
 * map.addControl(lidarControl, 'top-right');
 *
 * // Create adapter after adding lidar control
 * const lidarAdapter = new LidarLayerAdapter(lidarControl);
 *
 * // Add layer control with the adapter
 * const layerControl = new LayerControl({
 *   customLayerAdapters: [lidarAdapter],
 * });
 * map.addControl(layerControl, 'top-left');
 * ```
 */
export class LidarLayerAdapter implements CustomLayerAdapter {
  readonly type = 'lidar';

  private _lidarControl: LidarControl;
  private _changeCallbacks: Array<(event: 'add' | 'remove', layerId: string) => void> = [];
  private _unsubscribe?: () => void;

  /**
   * Creates a new LidarLayerAdapter.
   *
   * @param lidarControl - The LidarControl instance to adapt
   */
  constructor(lidarControl: LidarControl) {
    this._lidarControl = lidarControl;
    this._setupEventListeners();
  }

  /**
   * Sets up event listeners on the LidarControl to detect layer changes.
   */
  private _setupEventListeners(): void {
    // Listen for load and unload events
    const handleLoad = (event: { pointCloud?: { id: string } }) => {
      if (event.pointCloud?.id) {
        this._notifyLayerAdded(event.pointCloud.id);
      }
    };

    const handleUnload = (event: { pointCloud?: { id: string } }) => {
      if (event.pointCloud?.id) {
        this.notifyLayerRemoved(event.pointCloud.id);
      }
    };

    this._lidarControl.on('load', handleLoad as any);
    this._lidarControl.on('unload', handleUnload as any);

    this._unsubscribe = () => {
      this._lidarControl.off('load', handleLoad as any);
      this._lidarControl.off('unload', handleUnload as any);
    };
  }

  /**
   * Gets all layer IDs managed by this adapter.
   *
   * @returns Array of point cloud layer IDs
   */
  getLayerIds(): string[] {
    return this._lidarControl.getPointClouds().map((pc) => pc.id);
  }

  /**
   * Gets the current state of a layer.
   *
   * @param layerId - Point cloud ID
   * @returns LayerState or null if not found
   */
  getLayerState(layerId: string): LayerState | null {
    const pointClouds = this._lidarControl.getPointClouds();
    const pc = pointClouds.find((p) => p.id === layerId);
    if (!pc) return null;

    // Access the point cloud manager through internal state
    const state = this._lidarControl.getState();
    const manager = (this._lidarControl as any)._pointCloudManager;

    const visible = manager?.getPointCloudVisibility(layerId) ?? true;
    const opacity = manager?.getPointCloudOpacity(layerId) ?? state.opacity;

    return {
      visible,
      opacity,
      name: this.getName(layerId),
      isCustomLayer: true,
      customLayerType: 'lidar',
    };
  }

  /**
   * Sets layer visibility.
   *
   * @param layerId - Point cloud ID
   * @param visible - Whether the layer should be visible
   */
  setVisibility(layerId: string, visible: boolean): void {
    const manager = (this._lidarControl as any)._pointCloudManager;
    manager?.setPointCloudVisibility(layerId, visible);
  }

  /**
   * Sets layer opacity.
   *
   * @param layerId - Point cloud ID
   * @param opacity - Opacity value (0-1)
   */
  setOpacity(layerId: string, opacity: number): void {
    const manager = (this._lidarControl as any)._pointCloudManager;
    manager?.setPointCloudOpacity(layerId, opacity);
  }

  /**
   * Gets display name for a layer.
   *
   * @param layerId - Point cloud ID
   * @returns Display name for the layer
   */
  getName(layerId: string): string {
    const pointClouds = this._lidarControl.getPointClouds();
    const pc = pointClouds.find((p) => p.id === layerId);
    if (pc) {
      return pc.name;
    }
    // Generate friendly name from ID
    return layerId.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  /**
   * Gets layer symbol type for UI display.
   *
   * @param _layerId - Point cloud ID (unused)
   * @returns Symbol type string
   */
  getSymbolType(_layerId: string): string {
    // Use 'circle' symbol for point clouds
    return 'circle';
  }

  /**
   * Subscribes to layer changes (add/remove).
   *
   * @param callback - Function to call when layers are added or removed
   * @returns Unsubscribe function
   */
  onLayerChange(callback: (event: 'add' | 'remove', layerId: string) => void): () => void {
    this._changeCallbacks.push(callback);
    return () => {
      const idx = this._changeCallbacks.indexOf(callback);
      if (idx >= 0) this._changeCallbacks.splice(idx, 1);
    };
  }

  /**
   * Notifies subscribers that a layer was added.
   *
   * @param layerId - ID of the added layer
   */
  private _notifyLayerAdded(layerId: string): void {
    this._changeCallbacks.forEach((cb) => cb('add', layerId));
  }

  /**
   * Notifies subscribers that a layer was removed.
   * Currently unused as unload events don't provide specific layer IDs.
   *
   * @param layerId - ID of the removed layer
   */
  notifyLayerRemoved(layerId: string): void {
    this._changeCallbacks.forEach((cb) => cb('remove', layerId));
  }

  /**
   * Cleans up event listeners.
   */
  destroy(): void {
    this._unsubscribe?.();
    this._changeCallbacks = [];
  }
}
