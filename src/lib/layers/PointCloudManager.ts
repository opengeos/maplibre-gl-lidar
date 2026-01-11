import { PointCloudLayer } from '@deck.gl/layers';
import { COORDINATE_SYSTEM } from '@deck.gl/core';
import type { PickingInfo } from '@deck.gl/core';
import type { DeckOverlay } from '../core/DeckOverlay';
import type { PointCloudData } from '../loaders/types';
import type { ColorScheme, PointCloudBounds } from '../core/types';
import type { PointCloudLayerOptions, PickedPointInfo } from './types';
import { ColorSchemeProcessor } from '../colorizers/ColorScheme';

/**
 * Internal point cloud data with computed colors
 */
interface ManagedPointCloud {
  id: string;
  data: PointCloudData;
  colors: Uint8Array;
  coordinateOrigin: [number, number, number]; // [lng, lat, 0] center point
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
      pickable: options.pickable ?? false,
      zOffset: options.zOffset ?? 0,
      onHover: options.onHover,
    };
  }

  /**
   * Sets the hover callback.
   *
   * @param callback - Function called when a point is hovered
   */
  setOnHover(callback: ((info: PickedPointInfo | null) => void) | undefined): void {
    this._options.onHover = callback;
  }

  /**
   * Adds a point cloud to the visualization.
   *
   * @param id - Unique identifier for the point cloud
   * @param data - Point cloud data (positions are already offsets from coordinateOrigin)
   */
  addPointCloud(id: string, data: PointCloudData): void {
    const colors = this._colorProcessor.getColors(data, this._options.colorScheme);

    // Use the coordinate origin from the data - positions are already stored as offsets
    const coordinateOrigin = data.coordinateOrigin;

    this._pointClouds.set(id, { id, data, colors, coordinateOrigin });
    this._createLayer(id);
  }

  /**
   * Removes a point cloud from the visualization.
   *
   * @param id - ID of the point cloud to remove
   */
  removePointCloud(id: string): void {
    const pc = this._pointClouds.get(id);
    if (pc) {
      // Remove all chunk layers
      const CHUNK_SIZE = 1000000;
      const numChunks = Math.ceil(pc.data.pointCount / CHUNK_SIZE);
      for (let chunk = 0; chunk < numChunks; chunk++) {
        this._deckOverlay.removeLayer(`pointcloud-${id}-chunk${chunk}`);
      }
    }
    this._pointClouds.delete(id);
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
        this._pointClouds.set(id, { ...pc, colors, coordinateOrigin: pc.coordinateOrigin });
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
   * Sets whether points are pickable (enables hover/click interactions).
   *
   * @param pickable - Whether points should be pickable
   */
  setPickable(pickable: boolean): void {
    this.updateStyle({ pickable });
  }

  /**
   * Sets the Z offset for vertical adjustment.
   *
   * @param offset - Z offset in meters
   */
  setZOffset(offset: number): void {
    this.updateStyle({ zOffset: offset });
  }

  /**
   * Clears all point clouds.
   */
  clear(): void {
    for (const [id, pc] of this._pointClouds) {
      // Remove all chunk layers
      const CHUNK_SIZE = 1000000;
      const numChunks = Math.ceil(pc.data.pointCount / CHUNK_SIZE);
      for (let chunk = 0; chunk < numChunks; chunk++) {
        this._deckOverlay.removeLayer(`pointcloud-${id}-chunk${chunk}`);
      }
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
   * Chunks large point clouds into multiple layers to avoid WebGL buffer limits.
   * Uses coordinateOrigin + LNGLAT_OFFSETS to maintain Float32 precision.
   * Applies elevation filter if set.
   */
  private _createLayer(id: string): void {
    const pc = this._pointClouds.get(id);
    if (!pc) return;

    const { data, colors, coordinateOrigin } = pc;
    const elevationRange = this._options.elevationRange;
    const zOffset = this._options.zOffset ?? 0;

    // Remove existing chunk layers first (use a generous upper bound)
    const maxPossibleChunks = Math.ceil(data.pointCount / 1000000) + 1;
    for (let chunk = 0; chunk < maxPossibleChunks; chunk++) {
      this._deckOverlay.removeLayer(`pointcloud-${id}-chunk${chunk}`);
    }

    // Build filtered indices list
    const filteredIndices: number[] = [];

    for (let i = 0; i < data.pointCount; i++) {
      const elevation = data.positions[i * 3 + 2];
      if (elevationRange === null ||
          (elevation >= elevationRange[0] && elevation <= elevationRange[1])) {
        filteredIndices.push(i);
      }
    }

    // If no points pass the filter, don't create any layers
    if (filteredIndices.length === 0) {
      return;
    }

    // Chunk size - 1 million points per layer to stay within WebGL limits
    const CHUNK_SIZE = 1000000;
    const numChunks = Math.ceil(filteredIndices.length / CHUNK_SIZE);

    for (let chunk = 0; chunk < numChunks; chunk++) {
      const chunkStart = chunk * CHUNK_SIZE;
      const chunkEnd = Math.min(chunkStart + CHUNK_SIZE, filteredIndices.length);
      const chunkSize = chunkEnd - chunkStart;

      const chunkPositions = new Float32Array(chunkSize * 3);
      const chunkColors = new Uint8Array(chunkSize * 4);
      const originalIndices: number[] = [];

      for (let i = 0; i < chunkSize; i++) {
        const srcIdx = filteredIndices[chunkStart + i];
        originalIndices.push(srcIdx);

        chunkPositions[i * 3] = data.positions[srcIdx * 3];
        chunkPositions[i * 3 + 1] = data.positions[srcIdx * 3 + 1];
        // Apply Z offset to elevation
        chunkPositions[i * 3 + 2] = data.positions[srcIdx * 3 + 2] + zOffset;

        chunkColors[i * 4] = colors[srcIdx * 4];
        chunkColors[i * 4 + 1] = colors[srcIdx * 4 + 1];
        chunkColors[i * 4 + 2] = colors[srcIdx * 4 + 2];
        chunkColors[i * 4 + 3] = colors[srcIdx * 4 + 3];
      }

      // Create hover handler for this chunk
      const handleHover = (info: PickingInfo) => {
        if (!this._options.onHover) return;

        if (info.index >= 0 && info.picked && info.index < originalIndices.length) {
          const originalIndex = originalIndices[info.index];
          const pointInfo: PickedPointInfo = {
            index: originalIndex,
            longitude: coordinateOrigin[0] + chunkPositions[info.index * 3],
            latitude: coordinateOrigin[1] + chunkPositions[info.index * 3 + 1],
            elevation: chunkPositions[info.index * 3 + 2],
            x: info.x,
            y: info.y,
          };

          if (data.intensities) {
            pointInfo.intensity = data.intensities[originalIndex];
          }

          if (data.classifications) {
            pointInfo.classification = data.classifications[originalIndex];
          }

          // Add RGB colors if available
          if (data.colors && data.hasRGB) {
            pointInfo.red = data.colors[originalIndex * 4];
            pointInfo.green = data.colors[originalIndex * 4 + 1];
            pointInfo.blue = data.colors[originalIndex * 4 + 2];
          }

          // Add all extra attributes dynamically
          if (data.extraAttributes) {
            const attributes: Record<string, number> = {};
            for (const [name, arr] of Object.entries(data.extraAttributes)) {
              if (arr && originalIndex < arr.length) {
                attributes[name] = arr[originalIndex];
              }
            }
            if (Object.keys(attributes).length > 0) {
              pointInfo.attributes = attributes;
            }
          }

          this._options.onHover(pointInfo);
        } else {
          this._options.onHover(null);
        }
      };

      // Create a unique data fingerprint to force deck.gl to update
      const elevationKey = elevationRange ? `${elevationRange[0]}-${elevationRange[1]}` : 'none';
      const zOffsetKey = zOffset;

      const layer = new PointCloudLayer({
        id: `pointcloud-${id}-chunk${chunk}`,
        coordinateSystem: COORDINATE_SYSTEM.LNGLAT_OFFSETS,
        coordinateOrigin: coordinateOrigin,
        data: {
          length: chunkSize,
          attributes: {
            getPosition: { value: chunkPositions, size: 3 },
            getColor: { value: chunkColors, size: 4 },
          },
        },
        pointSize: this._options.pointSize,
        sizeUnits: 'pixels',
        opacity: this._options.opacity,
        getNormal: [0, 0, 1],
        pickable: this._options.pickable,
        onHover: this._options.pickable ? handleHover : undefined,
        autoHighlight: this._options.pickable,
        highlightColor: [255, 255, 0, 200],
        // Force update when these values change
        updateTriggers: {
          getPosition: [elevationKey, zOffsetKey, chunkSize],
          getColor: [elevationKey, chunkSize],
        },
      });

      this._deckOverlay.addLayer(`pointcloud-${id}-chunk${chunk}`, layer);
    }
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
