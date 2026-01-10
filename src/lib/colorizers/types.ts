/**
 * RGB color tuple
 */
export type RGBColor = [number, number, number];

/**
 * RGBA color tuple
 */
export type RGBAColor = [number, number, number, number];

/**
 * Color ramp definition (array of RGB colors)
 */
export type ColorRamp = RGBColor[];

/**
 * Classification color map
 */
export type ClassificationColorMap = Record<number, RGBColor>;
