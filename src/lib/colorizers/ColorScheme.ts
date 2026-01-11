import type { PointCloudData } from '../loaders/types';
import type { ColorScheme, ColorSchemeConfig } from '../core/types';
import type { RGBColor, ColorRamp, ClassificationColorMap } from './types';

/**
 * Viridis-like elevation color ramp
 */
const ELEVATION_RAMP: ColorRamp = [
  [68, 1, 84],     // dark purple
  [72, 40, 120],   // purple
  [62, 74, 137],   // blue-purple
  [49, 104, 142],  // blue
  [38, 130, 142],  // teal-blue
  [31, 158, 137],  // teal
  [53, 183, 121],  // green-teal
  [109, 205, 89],  // green
  [180, 222, 44],  // yellow-green
  [253, 231, 37],  // yellow
];

/**
 * Intensity grayscale ramp
 */
const INTENSITY_RAMP: ColorRamp = [
  [0, 0, 0],       // black
  [64, 64, 64],
  [128, 128, 128],
  [192, 192, 192],
  [255, 255, 255], // white
];

/**
 * ASPRS LAS classification standard colors
 */
const CLASSIFICATION_COLORS: ClassificationColorMap = {
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
 * Processes point cloud data into color arrays based on color scheme.
 */
export class ColorSchemeProcessor {
  /**
   * Generates a color array for the point cloud based on the color scheme.
   *
   * @param data - Point cloud data
   * @param scheme - Color scheme to apply
   * @returns Uint8Array of RGBA colors (length = pointCount * 4)
   */
  getColors(data: PointCloudData, scheme: ColorScheme): Uint8Array {
    const colors = new Uint8Array(data.pointCount * 4);

    if (typeof scheme === 'string') {
      switch (scheme) {
        case 'elevation':
          return this._colorByElevation(data, colors);
        case 'intensity':
          return this._colorByIntensity(data, colors);
        case 'classification':
          return this._colorByClassification(data, colors);
        case 'rgb':
          return this._colorByRGB(data, colors);
        default:
          return this._colorByElevation(data, colors);
      }
    } else {
      return this._colorByCustom(data, colors, scheme);
    }
  }

  /**
   * Colors points by elevation using viridis-like ramp.
   */
  private _colorByElevation(data: PointCloudData, colors: Uint8Array): Uint8Array {
    // Guard against undefined bounds
    const minZ = data.bounds?.minZ ?? 0;
    const maxZ = data.bounds?.maxZ ?? 1;
    const range = maxZ - minZ || 1;

    // Guard against missing positions
    if (!data.positions || data.positions.length === 0) {
      return colors;
    }

    for (let i = 0; i < data.pointCount; i++) {
      const z = data.positions[i * 3 + 2] ?? 0;
      const t = (z - minZ) / range;
      const color = this._interpolateRamp(ELEVATION_RAMP, t);
      colors[i * 4] = color[0];
      colors[i * 4 + 1] = color[1];
      colors[i * 4 + 2] = color[2];
      colors[i * 4 + 3] = 255;
    }
    return colors;
  }

  /**
   * Colors points by intensity using grayscale ramp.
   */
  private _colorByIntensity(data: PointCloudData, colors: Uint8Array): Uint8Array {
    if (!data.hasIntensity || !data.intensities) {
      // Fall back to elevation if no intensity data
      return this._colorByElevation(data, colors);
    }

    // Find intensity range
    let minI = Infinity, maxI = -Infinity;
    for (let i = 0; i < data.pointCount; i++) {
      const intensity = data.intensities[i];
      if (intensity < minI) minI = intensity;
      if (intensity > maxI) maxI = intensity;
    }
    const range = maxI - minI || 1;

    for (let i = 0; i < data.pointCount; i++) {
      const intensity = data.intensities[i];
      const t = (intensity - minI) / range;
      const color = this._interpolateRamp(INTENSITY_RAMP, t);
      colors[i * 4] = color[0];
      colors[i * 4 + 1] = color[1];
      colors[i * 4 + 2] = color[2];
      colors[i * 4 + 3] = 255;
    }
    return colors;
  }

  /**
   * Colors points by classification using ASPRS standard colors.
   */
  private _colorByClassification(data: PointCloudData, colors: Uint8Array): Uint8Array {
    if (!data.hasClassification || !data.classifications) {
      // Fall back to elevation if no classification data
      return this._colorByElevation(data, colors);
    }

    for (let i = 0; i < data.pointCount; i++) {
      const cls = data.classifications[i];
      const color = CLASSIFICATION_COLORS[cls] || [128, 128, 128];
      colors[i * 4] = color[0];
      colors[i * 4 + 1] = color[1];
      colors[i * 4 + 2] = color[2];
      colors[i * 4 + 3] = 255;
    }
    return colors;
  }

  /**
   * Uses embedded RGB colors from the point cloud.
   */
  private _colorByRGB(data: PointCloudData, colors: Uint8Array): Uint8Array {
    if (!data.hasRGB || !data.colors) {
      // Fall back to elevation if no RGB data
      return this._colorByElevation(data, colors);
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
   */
  private _colorByCustom(
    data: PointCloudData,
    colors: Uint8Array,
    _config: ColorSchemeConfig
  ): Uint8Array {
    // For now, fall back to elevation for custom configs
    // This can be extended to support custom gradients
    return this._colorByElevation(data, colors);
  }

  /**
   * Interpolates a color from a color ramp.
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
