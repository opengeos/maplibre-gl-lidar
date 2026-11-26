import type { ClassificationColorMap } from './types';

/**
 * Default RGB colour for each ASPRS LAS classification code (0-18), used by the
 * "classification" colour scheme and its legend. Codes not listed draw grey
 * ([128, 128, 128]); per-code overrides go through `ClassificationStyles`.
 *
 * This module has no dependencies, so importing the table does not pull in the
 * rest of the package.
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
