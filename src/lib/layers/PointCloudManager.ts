import { PointCloudLayer } from '@deck.gl/layers';
import { COORDINATE_SYSTEM } from '@deck.gl/core';
import type { DeckOverlay } from '../core/DeckOverlay';
import type { PointCloudData } from '../loaders/types';
import type { ColorScheme, PointCloudBounds } from '../core/types';
import type { PointCloudLayerOptions } from './types';
import { ColorSchemeProcessor } from '../colorizers/ColorScheme';

/**
 * Internal point cloud data with computed colors
 */
interface ManagedPointCloud {
  id: string;
  data: PointCloudData;
  colors: Uint8Array;
}

/**
 * Manages deck.gl PointCloudLayer instances for visualization.
 */
export class PointCloudManager {
  private _deckOverlay: DeckOverlay;
  private _pointClouds: Map<string, ManagedPointCloud>;
  private _options: PointCloudLayerOptions;
  private _colorProcessor: ColorSchemeProcessor;

  constructor(deckOverlay: DeckOverlay, options: Partial<PointCloudLayerOptions> = {}) {
    this._deckOverlay = deckOverlay;
    this._pointClouds = new Map();
    this._colorProcessor = new ColorSchemeProcessor();
    this._options = {
      pointSize: options.pointSize ?? 2,
      opacity: options.opacity ?? 1.0,
      colorScheme: options.colorScheme ?? 'elevation',
      elevationRange: options.elevationRange ?? null,
    };
  }

  /**
   * Adds a point cloud to the visualization.
   *
   * @param id - Unique identifier for the point cloud
   * @param data - Point cloud data
   */
  addPointCloud(id: string, data: PointCloudData): void {
    const colors = this._colorProcessor.getColors(data, this._options.colorScheme);
    this._pointClouds.set(id, { id, data, colors });
    this._createLayer(id);
  }

  /**
   * Removes a point cloud from the visualization.
   *
   * @param id - ID of the point cloud to remove
   */
  removePointCloud(id: string): void {
    this._pointClouds.delete(id);
    this._deckOverlay.removeLayer(`pointcloud-${id}`);
  }

  /**
   * Checks if a point cloud exists.
   *
   * @param id - Point cloud ID
   * @returns True if exists
   */
  hasPointCloud(id: string): boolean {
    return this._pointClouds.has(id);
  }

  /**
   * Gets all point cloud IDs.
   *
   * @returns Array of point cloud IDs
   */
  getPointCloudIds(): string[] {
    return Array.from(this._pointClouds.keys());
  }

  /**
   * Gets the bounds of a point cloud.
   *
   * @param id - Point cloud ID
   * @returns Bounds or undefined if not found
   */
  getPointCloudBounds(id: string): PointCloudBounds | undefined {
    return this._pointClouds.get(id)?.data.bounds;
  }

  /**
   * Updates styling options for all point clouds.
   *
   * @param options - New style options
   */
  updateStyle(options: Partial<PointCloudLayerOptions>): void {
    const colorSchemeChanged = options.colorScheme !== undefined &&
      options.colorScheme !== this._options.colorScheme;

    this._options = { ...this._options, ...options };

    // If color scheme changed, recompute colors for all point clouds
    if (colorSchemeChanged) {
      for (const [id, pc] of this._pointClouds) {
        const colors = this._colorProcessor.getColors(pc.data, this._options.colorScheme);
        this._pointClouds.set(id, { ...pc, colors });
      }
    }

    // Recreate all layers with new options
    this._updateAllLayers();
  }

  /**
   * Sets the point size.
   *
   * @param size - Point size in pixels
   */
  setPointSize(size: number): void {
    this.updateStyle({ pointSize: size });
  }

  /**
   * Sets the opacity.
   *
   * @param opacity - Opacity value (0-1)
   */
  setOpacity(opacity: number): void {
    this.updateStyle({ opacity });
  }

  /**
   * Sets the color scheme.
   *
   * @param scheme - Color scheme to apply
   */
  setColorScheme(scheme: ColorScheme): void {
    this.updateStyle({ colorScheme: scheme });
  }

  /**
   * Sets the elevation range filter.
   *
   * @param range - [min, max] elevation or null to disable
   */
  setElevationRange(range: [number, number] | null): void {
    this.updateStyle({ elevationRange: range });
  }

  /**
   * Clears all point clouds.
   */
  clear(): void {
    for (const id of this._pointClouds.keys()) {
      this._deckOverlay.removeLayer(`pointcloud-${id}`);
    }
    this._pointClouds.clear();
  }

  /**
   * Gets the current options.
   */
  getOptions(): PointCloudLayerOptions {
    return { ...this._options };
  }

  /**
   * Creates a deck.gl layer for a point cloud.
   */
  private _createLayer(id: string): void {
    const pc = this._pointClouds.get(id);
    if (!pc) return;

    const { data, colors } = pc;

    // Build layer props
    const layerProps: ConstructorParameters<typeof PointCloudLayer>[0] = {
      id: `pointcloud-${id}`,
      data: {
        length: data.pointCount,
        attributes: {
          getPosition: { value: data.positions, size: 3 },
          getColor: { value: colors, size: 4 },
        },
      },
      pointSize: this._options.pointSize,
      opacity: this._options.opacity,
      coordinateSystem: COORDINATE_SYSTEM.LNGLAT,
      getNormal: [0, 0, 1],
      pickable: true,
      // parameters: {
      //   depthTest: true,
      // },
    };

    const layer = new PointCloudLayer(layerProps);
    this._deckOverlay.addLayer(`pointcloud-${id}`, layer);
  }

  /**
   * Updates all layers with current options.
   */
  private _updateAllLayers(): void {
    for (const id of this._pointClouds.keys()) {
      this._createLayer(id);
    }
  }
}
