import { load } from '@loaders.gl/core';
import { LASLoader } from '@loaders.gl/las';
import type { PointCloudData } from './types';
import type { PointCloudBounds } from '../core/types';

/**
 * Loads and parses LiDAR point cloud files (LAS, LAZ, COPC).
 */
export class PointCloudLoader {
  /**
   * Creates a new PointCloudLoader instance.
   */
  constructor() {
    // Reserved for future options
  }

  /**
   * Loads a point cloud from a URL, File, or ArrayBuffer.
   *
   * @param source - URL string, File object, or ArrayBuffer
   * @returns Normalized point cloud data
   */
  async load(source: string | File | ArrayBuffer): Promise<PointCloudData> {
    const skip = this._calculateSkip();

    const loaderOptions = {
      las: {
        skip,
        shape: 'columnar-table',
      },
      worker: false, // Use main thread for now
    };

    let data;

    if (typeof source === 'string') {
      // URL
      data = await load(source, LASLoader, loaderOptions);
    } else if (source instanceof File) {
      // File object - convert to ArrayBuffer
      const arrayBuffer = await source.arrayBuffer();
      data = await load(arrayBuffer, LASLoader, loaderOptions);
    } else {
      // ArrayBuffer
      data = await load(source, LASLoader, loaderOptions);
    }

    return this._normalizeData(data);
  }

  /**
   * Calculates the skip factor for decimation based on point budget.
   */
  private _calculateSkip(): number {
    // Skip factor for decimation (1 = no skip, 2 = every other point, etc.)
    // We'll determine this dynamically based on the file if needed
    return 1;
  }

  /**
   * Normalizes the loaders.gl output to our standard format.
   */
  private _normalizeData(rawData: unknown): PointCloudData {
    const data = rawData as {
      shape?: string;
      data?: {
        POSITION?: Float32Array | Float64Array;
        COLOR_0?: Uint8Array;
        intensity?: Float32Array | Uint16Array;
        classification?: Uint8Array;
      };
      attributes?: {
        POSITION?: { value: Float32Array | Float64Array };
        COLOR_0?: { value: Uint8Array };
        intensity?: { value: Float32Array | Uint16Array };
        classification?: { value: Uint8Array };
      };
      header?: {
        vertexCount?: number;
        mins?: number[];
        maxs?: number[];
        boundingBox?: [[number, number, number], [number, number, number]];
      };
      loaderData?: {
        header?: {
          vertexCount?: number;
          mins?: number[];
          maxs?: number[];
          boundingBox?: [[number, number, number], [number, number, number]];
        };
      };
    };

    // Handle different data shapes from loaders.gl
    let positions: Float32Array;
    let colors: Uint8Array | undefined;
    let intensities: Float32Array | undefined;
    let classifications: Uint8Array | undefined;

    // Try to extract data from different possible structures
    const attrs = data.data || data.attributes;

    if (attrs) {
      // Columnar table format or attributes format
      const posData = (attrs.POSITION as Float32Array | Float64Array) ||
                      (attrs.POSITION as { value: Float32Array | Float64Array })?.value;

      if (posData instanceof Float64Array) {
        positions = new Float32Array(posData);
      } else if (posData) {
        positions = posData;
      } else {
        throw new Error('No position data found in point cloud');
      }

      const colorData = (attrs.COLOR_0 as Uint8Array) ||
                        (attrs.COLOR_0 as { value: Uint8Array })?.value;
      if (colorData) {
        colors = colorData;
      }

      const intensityData = (attrs.intensity as Float32Array | Uint16Array) ||
                            (attrs.intensity as { value: Float32Array | Uint16Array })?.value;
      if (intensityData) {
        if (intensityData instanceof Uint16Array) {
          // Normalize Uint16 to Float32
          intensities = new Float32Array(intensityData.length);
          for (let i = 0; i < intensityData.length; i++) {
            intensities[i] = intensityData[i] / 65535;
          }
        } else {
          intensities = intensityData;
        }
      }

      const classData = (attrs.classification as Uint8Array) ||
                        (attrs.classification as { value: Uint8Array })?.value;
      if (classData) {
        classifications = classData;
      }
    } else {
      throw new Error('Unsupported point cloud data format');
    }

    const pointCount = positions.length / 3;

    // Extract bounds from header
    const header = data.header || data.loaderData?.header;
    let bounds: PointCloudBounds;

    if (header?.boundingBox) {
      const [[minX, minY, minZ], [maxX, maxY, maxZ]] = header.boundingBox;
      bounds = { minX, minY, minZ, maxX, maxY, maxZ };
    } else if (header?.mins && header?.maxs) {
      bounds = {
        minX: header.mins[0],
        minY: header.mins[1],
        minZ: header.mins[2],
        maxX: header.maxs[0],
        maxY: header.maxs[1],
        maxZ: header.maxs[2],
      };
    } else {
      // Calculate bounds from positions
      bounds = this._calculateBounds(positions);
    }

    return {
      positions,
      colors,
      intensities,
      classifications,
      pointCount,
      bounds,
      hasRGB: !!colors,
      hasIntensity: !!intensities,
      hasClassification: !!classifications,
    };
  }

  /**
   * Calculates bounding box from positions array.
   */
  private _calculateBounds(positions: Float32Array): PointCloudBounds {
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    for (let i = 0; i < positions.length; i += 3) {
      const x = positions[i];
      const y = positions[i + 1];
      const z = positions[i + 2];

      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }

    return { minX, maxX, minY, maxY, minZ, maxZ };
  }
}
