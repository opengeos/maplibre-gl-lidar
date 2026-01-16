import type { ColorRamp } from './types';

/**
 * Available colormap names (matplotlib-style)
 */
export type ColormapName =
  | 'viridis'
  | 'plasma'
  | 'inferno'
  | 'magma'
  | 'cividis'
  | 'turbo'
  | 'jet'
  | 'rainbow'
  | 'terrain'
  | 'coolwarm'
  | 'gray';

/**
 * Viridis colormap - perceptually uniform, colorblind-friendly (default)
 */
const VIRIDIS: ColorRamp = [
  [68, 1, 84],
  [72, 40, 120],
  [62, 74, 137],
  [49, 104, 142],
  [38, 130, 142],
  [31, 158, 137],
  [53, 183, 121],
  [109, 205, 89],
  [180, 222, 44],
  [253, 231, 37],
];

/**
 * Plasma colormap - perceptually uniform, purple-orange
 */
const PLASMA: ColorRamp = [
  [13, 8, 135],
  [75, 3, 161],
  [125, 3, 168],
  [168, 34, 150],
  [203, 70, 121],
  [229, 107, 93],
  [248, 148, 65],
  [253, 195, 40],
  [240, 249, 33],
  [240, 249, 33],
];

/**
 * Inferno colormap - perceptually uniform, black-red-yellow
 */
const INFERNO: ColorRamp = [
  [0, 0, 4],
  [40, 11, 84],
  [89, 13, 115],
  [137, 31, 107],
  [179, 55, 79],
  [213, 87, 49],
  [240, 130, 24],
  [253, 184, 43],
  [249, 251, 146],
  [252, 255, 164],
];

/**
 * Magma colormap - perceptually uniform, black-purple-pink-white
 */
const MAGMA: ColorRamp = [
  [0, 0, 4],
  [28, 16, 68],
  [79, 18, 123],
  [129, 37, 129],
  [181, 54, 122],
  [229, 80, 100],
  [251, 135, 97],
  [254, 194, 135],
  [254, 247, 187],
  [252, 253, 191],
];

/**
 * Cividis colormap - perceptually uniform, colorblind-friendly (blue-yellow)
 */
const CIVIDIS: ColorRamp = [
  [0, 32, 77],
  [0, 58, 103],
  [52, 77, 105],
  [87, 95, 108],
  [115, 113, 112],
  [143, 132, 108],
  [171, 152, 97],
  [200, 173, 79],
  [231, 196, 55],
  [253, 231, 37],
];

/**
 * Turbo colormap - improved rainbow, perceptually balanced
 */
const TURBO: ColorRamp = [
  [48, 18, 59],
  [70, 107, 227],
  [40, 170, 225],
  [35, 221, 162],
  [122, 249, 85],
  [194, 241, 45],
  [241, 206, 51],
  [250, 144, 42],
  [229, 68, 25],
  [122, 4, 3],
];

/**
 * Jet colormap - classic rainbow (not perceptually uniform)
 */
const JET: ColorRamp = [
  [0, 0, 127],
  [0, 0, 255],
  [0, 127, 255],
  [0, 255, 255],
  [127, 255, 127],
  [255, 255, 0],
  [255, 127, 0],
  [255, 0, 0],
  [127, 0, 0],
  [127, 0, 0],
];

/**
 * Rainbow colormap - HSV-based rainbow
 */
const RAINBOW: ColorRamp = [
  [150, 0, 90],
  [0, 0, 200],
  [0, 125, 255],
  [0, 200, 255],
  [0, 255, 125],
  [125, 255, 0],
  [255, 255, 0],
  [255, 125, 0],
  [255, 0, 0],
  [128, 0, 0],
];

/**
 * Terrain colormap - earth tones for elevation data
 */
const TERRAIN: ColorRamp = [
  [51, 51, 153],
  [51, 102, 153],
  [51, 153, 153],
  [102, 178, 102],
  [153, 204, 102],
  [204, 229, 102],
  [204, 204, 153],
  [178, 153, 102],
  [153, 102, 51],
  [255, 255, 255],
];

/**
 * Coolwarm colormap - diverging blue-red
 */
const COOLWARM: ColorRamp = [
  [59, 76, 192],
  [98, 130, 234],
  [141, 176, 254],
  [184, 208, 249],
  [221, 221, 221],
  [245, 196, 173],
  [244, 154, 123],
  [222, 96, 77],
  [180, 4, 38],
  [180, 4, 38],
];

/**
 * Gray colormap - grayscale
 */
const GRAY: ColorRamp = [
  [0, 0, 0],
  [28, 28, 28],
  [57, 57, 57],
  [85, 85, 85],
  [113, 113, 113],
  [142, 142, 142],
  [170, 170, 170],
  [198, 198, 198],
  [227, 227, 227],
  [255, 255, 255],
];

/**
 * All available colormaps
 */
export const COLORMAPS: Record<ColormapName, ColorRamp> = {
  viridis: VIRIDIS,
  plasma: PLASMA,
  inferno: INFERNO,
  magma: MAGMA,
  cividis: CIVIDIS,
  turbo: TURBO,
  jet: JET,
  rainbow: RAINBOW,
  terrain: TERRAIN,
  coolwarm: COOLWARM,
  gray: GRAY,
};

/**
 * List of all available colormap names
 */
export const COLORMAP_NAMES: ColormapName[] = [
  'viridis',
  'plasma',
  'inferno',
  'magma',
  'cividis',
  'turbo',
  'jet',
  'rainbow',
  'terrain',
  'coolwarm',
  'gray',
];

/**
 * Human-readable display names for colormaps
 */
export const COLORMAP_LABELS: Record<ColormapName, string> = {
  viridis: 'Viridis',
  plasma: 'Plasma',
  inferno: 'Inferno',
  magma: 'Magma',
  cividis: 'Cividis',
  turbo: 'Turbo',
  jet: 'Jet',
  rainbow: 'Rainbow',
  terrain: 'Terrain',
  coolwarm: 'Cool-Warm',
  gray: 'Grayscale',
};

/**
 * Gets a colormap by name.
 *
 * @param name - The colormap name
 * @returns The color ramp array
 */
export function getColormap(name: ColormapName): ColorRamp {
  return COLORMAPS[name] || COLORMAPS.viridis;
}
