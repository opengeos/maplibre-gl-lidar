import type { PointCloudData } from '../loaders/types';
import type { ColorScheme, ColorSchemeConfig, ColormapName, ColorRangeConfig } from '../core/types';
import type { RGBColor, ColorRamp, ClassificationColorMap } from './types';
import { computePercentileBounds } from '../utils/helpers';
import { COLORMAPS } from './Colormaps';

/**
 * ASPRS LAS classification standard colors
 */
export const CLASSIFICATION_COLORS: ClassificationColorMap = {
  0: [128, 128, 128],   // Created, never classified
  1: [128, 128, 128],   // Unclassified
  2: [165, 113, 78],    // Ground (brown)
  3: [144, 238, 144],   // Low Vegetation (light green)
  4: [34, 139, 34],     // Medium Vegetation (green)
  5: [0, 100, 0],       // High Vegetation (dark green)
  6: [255, 165, 0],     // Building (orange)
  7: [255, 0, 0],       // Low Point (noise) (red)
  8: [128, 128, 128],   // Reserved
  9: [0, 0, 255],       // Water (blue)
  10: [139, 90, 43],    // Rail
  11: [128, 128, 128],  // Road Surface
  12: [128, 128, 128],  // Reserved
  13: [255, 255, 0],    // Wire - Guard (yellow)
  14: [255, 200, 0],    // Wire - Conductor
  15: [200, 200, 0],    // Transmission Tower
  16: [100, 100, 100],  // Wire-Structure Connector
  17: [0, 128, 255],    // Bridge Deck
  18: [255, 0, 255],    // High Noise
};

/**
 * Options for color generation
 */
export interface ColorOptions {
  /** Whether to use percentile range (2-98%) for elevation/intensity coloring (deprecated) */
  usePercentile?: boolean;
  /** Colormap to use for elevation/intensity coloring */
  colormap?: ColormapName;
  /** Configuration for color range mapping */
  colorRange?: ColorRangeConfig;
  /** Set of classification codes to hide (set alpha to 0) */
  hiddenClassifications?: Set<number>;
}

/**
 * Result of color processing including computed bounds
 */
export interface ColorResult {
  /** The color array */
  colors: Uint8Array;
  /** The computed bounds used for coloring */
  bounds?: { min: number; max: number };
}

/**
 * Processes point cloud data into color arrays based on color scheme.
 */
export class ColorSchemeProcessor {
  /** Last computed color bounds (for colorbar display) */
  private _lastComputedBounds?: { min: number; max: number };

  /**
   * Generates a color array for the point cloud based on the color scheme.
   *
   * @param data - Point cloud data
   * @param scheme - Color scheme to apply
   * @param options - Optional color generation options
   * @returns Uint8Array of RGBA colors (length = pointCount * 4)
   */
  getColors(data: PointCloudData, scheme: ColorScheme, options: ColorOptions = {}): Uint8Array {
    const result = this.getColorsWithBounds(data, scheme, options);
    return result.colors;
  }

  /**
   * Generates a color array and returns the computed bounds.
   *
   * @param data - Point cloud data
   * @param scheme - Color scheme to apply
   * @param options - Optional color generation options
   * @returns ColorResult containing colors and computed bounds
   */
  getColorsWithBounds(data: PointCloudData, scheme: ColorScheme, options: ColorOptions = {}): ColorResult {
    const colors = new Uint8Array(data.pointCount * 4);
    const colormap = options.colormap ?? 'viridis';
    const colorRange = options.colorRange;
    const usePercentile = options.usePercentile ?? true;

    if (typeof scheme === 'string') {
      switch (scheme) {
        case 'elevation':
          return this._colorByElevation(data, colors, colormap, colorRange, usePercentile);
        case 'intensity':
          return this._colorByIntensity(data, colors, colormap, colorRange, usePercentile);
        case 'classification':
          return { colors: this._colorByClassification(data, colors, options.hiddenClassifications) };
        case 'rgb':
          return { colors: this._colorByRGB(data, colors) };
        default:
          return this._colorByElevation(data, colors, colormap, colorRange, usePercentile);
      }
    } else {
      return { colors: this._colorByCustom(data, colors, scheme, colormap, colorRange, usePercentile) };
    }
  }

  /**
   * Gets the last computed color bounds (for colorbar display).
   *
   * @returns The last computed bounds or undefined
   */
  getLastComputedBounds(): { min: number; max: number } | undefined {
    return this._lastComputedBounds;
  }

  /**
   * Computes the color bounds based on the configuration.
   *
   * @param values - Array of values to compute bounds for
   * @param dataBounds - Data bounds (min/max)
   * @param colorRange - Color range configuration
   * @param usePercentile - Legacy percentile flag
   * @returns Computed min and max bounds
   */
  private _computeBounds(
    values: Float32Array,
    dataBounds: { min: number; max: number },
    colorRange?: ColorRangeConfig,
    usePercentile?: boolean
  ): { min: number; max: number } {
    if (colorRange) {
      if (colorRange.mode === 'absolute') {
        return {
          min: colorRange.absoluteMin ?? dataBounds.min,
          max: colorRange.absoluteMax ?? dataBounds.max,
        };
      } else {
        // Percentile mode with configurable values
        const pLow = colorRange.percentileLow ?? 2;
        const pHigh = colorRange.percentileHigh ?? 98;
        return computePercentileBounds(values, pLow, pHigh);
      }
    } else if (usePercentile) {
      // Legacy behavior: 2-98% percentile
      return computePercentileBounds(values, 2, 98);
    } else {
      // Full range
      return dataBounds;
    }
  }

  /**
   * Colors points by elevation using the specified colormap.
   *
   * @param data - Point cloud data
   * @param colors - Output color array
   * @param colormap - Colormap name to use
   * @param colorRange - Color range configuration
   * @param usePercentile - Legacy percentile flag
   * @returns ColorResult with colors and computed bounds
   */
  private _colorByElevation(
    data: PointCloudData,
    colors: Uint8Array,
    colormap: ColormapName,
    colorRange?: ColorRangeConfig,
    usePercentile?: boolean
  ): ColorResult {
    // Guard against missing positions
    if (!data.positions || data.positions.length === 0) {
      return { colors };
    }

    // Extract Z values
    const zValues = new Float32Array(data.pointCount);
    for (let i = 0; i < data.pointCount; i++) {
      zValues[i] = data.positions[i * 3 + 2] ?? 0;
    }

    // Compute data bounds
    const dataBounds = {
      min: data.bounds?.minZ ?? 0,
      max: data.bounds?.maxZ ?? 1,
    };

    // Compute color bounds based on configuration
    const bounds = this._computeBounds(zValues, dataBounds, colorRange, usePercentile);
    this._lastComputedBounds = bounds;

    const { min: minZ, max: maxZ } = bounds;
    const range = maxZ - minZ || 1;
    const ramp = COLORMAPS[colormap] || COLORMAPS.viridis;

    for (let i = 0; i < data.pointCount; i++) {
      const z = zValues[i];
      const t = (z - minZ) / range;
      const color = this._interpolateRamp(ramp, t);
      colors[i * 4] = color[0];
      colors[i * 4 + 1] = color[1];
      colors[i * 4 + 2] = color[2];
      colors[i * 4 + 3] = 255;
    }

    return { colors, bounds };
  }

  /**
   * Colors points by intensity using the specified colormap.
   *
   * @param data - Point cloud data
   * @param colors - Output color array
   * @param colormap - Colormap name to use
   * @param colorRange - Color range configuration
   * @param usePercentile - Legacy percentile flag
   * @returns ColorResult with colors and computed bounds
   */
  private _colorByIntensity(
    data: PointCloudData,
    colors: Uint8Array,
    colormap: ColormapName,
    colorRange?: ColorRangeConfig,
    usePercentile?: boolean
  ): ColorResult {
    if (!data.hasIntensity || !data.intensities) {
      // Fall back to elevation if no intensity data
      return this._colorByElevation(data, colors, colormap, colorRange, usePercentile);
    }

    // Compute data bounds
    let minI = Infinity;
    let maxI = -Infinity;
    for (let i = 0; i < data.pointCount; i++) {
      const intensity = data.intensities[i];
      if (intensity < minI) minI = intensity;
      if (intensity > maxI) maxI = intensity;
    }
    const dataBounds = { min: minI, max: maxI };

    // Compute color bounds based on configuration
    const bounds = this._computeBounds(data.intensities, dataBounds, colorRange, usePercentile);
    this._lastComputedBounds = bounds;

    const { min: minVal, max: maxVal } = bounds;
    const range = maxVal - minVal || 1;
    const ramp = COLORMAPS[colormap] || COLORMAPS.gray;

    for (let i = 0; i < data.pointCount; i++) {
      const intensity = data.intensities[i];
      const t = (intensity - minVal) / range;
      const color = this._interpolateRamp(ramp, t);
      colors[i * 4] = color[0];
      colors[i * 4 + 1] = color[1];
      colors[i * 4 + 2] = color[2];
      colors[i * 4 + 3] = 255;
    }

    return { colors, bounds };
  }

  /**
   * Colors points by classification using ASPRS standard colors.
   *
   * @param data - Point cloud data
   * @param colors - Output color array
   * @param hiddenClassifications - Optional set of classification codes to hide (alpha=0)
   * @returns Color array
   */
  private _colorByClassification(
    data: PointCloudData,
    colors: Uint8Array,
    hiddenClassifications?: Set<number>
  ): Uint8Array {
    if (!data.hasClassification || !data.classifications) {
      // Fall back to elevation if no classification data
      const result = this._colorByElevation(data, colors, 'viridis', undefined, true);
      return result.colors;
    }

    for (let i = 0; i < data.pointCount; i++) {
      const cls = data.classifications[i];
      const color = CLASSIFICATION_COLORS[cls] || [128, 128, 128];
      colors[i * 4] = color[0];
      colors[i * 4 + 1] = color[1];
      colors[i * 4 + 2] = color[2];
      // Set alpha to 0 if classification is hidden, otherwise 255
      colors[i * 4 + 3] = hiddenClassifications?.has(cls) ? 0 : 255;
    }
    return colors;
  }

  /**
   * Uses embedded RGB colors from the point cloud.
   *
   * @param data - Point cloud data
   * @param colors - Output color array
   * @returns Color array
   */
  private _colorByRGB(data: PointCloudData, colors: Uint8Array): Uint8Array {
    if (!data.hasRGB || !data.colors) {
      // Fall back to elevation if no RGB data
      const result = this._colorByElevation(data, colors, 'viridis', undefined, true);
      return result.colors;
    }

    // data.colors is stored as RGBA (4 bytes per point)
    for (let i = 0; i < data.pointCount; i++) {
      colors[i * 4] = data.colors[i * 4];
      colors[i * 4 + 1] = data.colors[i * 4 + 1];
      colors[i * 4 + 2] = data.colors[i * 4 + 2];
      colors[i * 4 + 3] = 255;
    }
    return colors;
  }

  /**
   * Applies a custom color scheme configuration.
   *
   * @param data - Point cloud data
   * @param colors - Output color array
   * @param _config - Custom color scheme config
   * @param colormap - Colormap name to use
   * @param colorRange - Color range configuration
   * @param usePercentile - Legacy percentile flag
   * @returns Color array
   */
  private _colorByCustom(
    data: PointCloudData,
    colors: Uint8Array,
    _config: ColorSchemeConfig,
    colormap: ColormapName,
    colorRange?: ColorRangeConfig,
    usePercentile?: boolean
  ): Uint8Array {
    // For now, fall back to elevation for custom configs
    // This can be extended to support custom gradients
    const result = this._colorByElevation(data, colors, colormap, colorRange, usePercentile);
    return result.colors;
  }

  /**
   * Interpolates a color from a color ramp.
   *
   * @param ramp - Color ramp array
   * @param t - Interpolation parameter (0-1)
   * @returns Interpolated RGB color
   */
  private _interpolateRamp(ramp: ColorRamp, t: number): RGBColor {
    // Handle NaN or invalid t values
    if (!Number.isFinite(t)) {
      return ramp[0];
    }

    const clampedT = Math.max(0, Math.min(1, t));
    const idx = Math.min(
      Math.floor(clampedT * (ramp.length - 1)),
      ramp.length - 2
    );
    const localT = clampedT * (ramp.length - 1) - idx;

    return [
      Math.round(ramp[idx][0] + (ramp[idx + 1][0] - ramp[idx][0]) * localT),
      Math.round(ramp[idx][1] + (ramp[idx + 1][1] - ramp[idx][1]) * localT),
      Math.round(ramp[idx][2] + (ramp[idx + 1][2] - ramp[idx][2]) * localT),
    ];
  }
}

/**
 * Gets the name of a classification code.
 */
export function getClassificationName(code: number): string {
  const names: Record<number, string> = {
    0: 'Never Classified',
    1: 'Unclassified',
    2: 'Ground',
    3: 'Low Vegetation',
    4: 'Medium Vegetation',
    5: 'High Vegetation',
    6: 'Building',
    7: 'Low Point (Noise)',
    8: 'Reserved',
    9: 'Water',
    10: 'Rail',
    11: 'Road Surface',
    12: 'Reserved',
    13: 'Wire - Guard',
    14: 'Wire - Conductor',
    15: 'Transmission Tower',
    16: 'Wire-Structure Connector',
    17: 'Bridge Deck',
    18: 'High Noise',
  };
  return names[code] || `Class ${code}`;
}

/**
 * Extracts the set of unique classification codes present in the point cloud data.
 *
 * @param data - Point cloud data
 * @returns Set of classification codes found in the data
 */
export function getAvailableClassifications(data: PointCloudData): Set<number> {
  const classifications = new Set<number>();
  if (data.hasClassification && data.classifications) {
    for (let i = 0; i < data.pointCount; i++) {
      classifications.add(data.classifications[i]);
    }
  }
  return classifications;
}
