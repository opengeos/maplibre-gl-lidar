import { Copc, Hierarchy, Getter, Las } from 'copc';
import type { Copc as CopcType } from 'copc';
import { createLazPerf, type LazPerf } from 'laz-perf';
import { load } from '@loaders.gl/core';
import { LASLoader } from '@loaders.gl/las';
import proj4 from 'proj4';
import type { PointCloudData, ExtraPointAttributes, AttributeArray } from './types';
import type { PointCloudBounds } from '../core/types';

/**
 * Configuration for attribute storage types
 */
interface AttributeConfig {
  arrayType: 'float64' | 'float32' | 'uint32' | 'uint16' | 'uint8' | 'int32' | 'int16' | 'int8';
  scale?: number; // Optional scale factor to apply when reading
}

/**
 * Known LAS dimension configurations
 * Maps dimension names to their optimal storage types
 */
const DIMENSION_CONFIGS: Record<string, AttributeConfig> = {
  // Standard LAS dimensions
  'GpsTime': { arrayType: 'float64' },
  'ReturnNumber': { arrayType: 'uint8' },
  'NumberOfReturns': { arrayType: 'uint8' },
  'ScanDirectionFlag': { arrayType: 'uint8' },
  'EdgeOfFlightLine': { arrayType: 'uint8' },
  'ScanAngleRank': { arrayType: 'int8' },
  'ScanAngle': { arrayType: 'float32' },
  'UserData': { arrayType: 'uint8' },
  'PointSourceId': { arrayType: 'uint16' },
  // LAS 1.4 dimensions
  'ScannerChannel': { arrayType: 'uint8' },
  'Synthetic': { arrayType: 'uint8' },
  'KeyPoint': { arrayType: 'uint8' },
  'Withheld': { arrayType: 'uint8' },
  'Overlap': { arrayType: 'uint8' },
  'ClassFlags': { arrayType: 'uint8' },
  // NIR if available
  'Nir': { arrayType: 'uint16' },
  'NearInfrared': { arrayType: 'uint16' },
};

/**
 * Core dimensions that are handled separately (not as extra attributes)
 */
const CORE_DIMENSIONS = new Set([
  'X', 'Y', 'Z',
  'Intensity',
  'Classification',
  'Red', 'Green', 'Blue',
]);

/**
 * Creates a typed array of the appropriate type for an attribute
 */
function createAttributeArray(type: AttributeConfig['arrayType'], length: number): AttributeArray {
  switch (type) {
    case 'float64': return new Float64Array(length);
    case 'float32': return new Float32Array(length);
    case 'uint32': return new Uint32Array(length);
    case 'uint16': return new Uint16Array(length);
    case 'uint8': return new Uint8Array(length);
    case 'int32': return new Int32Array(length);
    case 'int16': return new Int16Array(length);
    case 'int8': return new Int8Array(length);
    default: return new Float32Array(length);
  }
}

// LazPerf instance for COPC decompression
let lazPerfInstance: LazPerf | null = null;

async function getLazPerf(): Promise<LazPerf> {
  if (!lazPerfInstance) {
    lazPerfInstance = await createLazPerf({
      locateFile: (path: string) => {
        // Load WASM from public folder, accounting for base URL
        if (path.endsWith('.wasm')) {
          // Use Vite's BASE_URL or fallback to root
          const base = import.meta.env?.BASE_URL || '/';
          return `${base}laz-perf.wasm`;
        }
        return path;
      },
    });
  }
  return lazPerfInstance;
}

/**
 * Creates a getter function from an ArrayBuffer for copc.js
 */
function createBufferGetter(buffer: ArrayBuffer): Getter {
  const uint8 = new Uint8Array(buffer);
  return async (begin: number, end: number): Promise<Uint8Array> => {
    return uint8.slice(begin, end);
  };
}

/**
 * Extracts the PROJCS section from a WKT string (handles COMPD_CS)
 */
function extractProjcsFromWkt(wkt: string): string {
  // If it's a compound CS, extract the PROJCS part
  if (wkt.startsWith('COMPD_CS[')) {
    const projcsStart = wkt.indexOf('PROJCS[');
    if (projcsStart === -1) return wkt;

    // Find matching bracket for PROJCS
    let depth = 0;
    let projcsEnd = projcsStart;
    for (let i = projcsStart; i < wkt.length; i++) {
      if (wkt[i] === '[') depth++;
      if (wkt[i] === ']') {
        depth--;
        if (depth === 0) {
          projcsEnd = i + 1;
          break;
        }
      }
    }
    return wkt.substring(projcsStart, projcsEnd);
  }
  return wkt;
}

/**
 * Detects if the WKT uses feet as the linear unit
 * Returns the conversion factor to meters (1.0 if already in meters)
 */
function getVerticalUnitConversionFactor(wkt: string): number {
  // Conversion factor: 1 foot = 0.3048 meters
  const FEET_TO_METERS = 0.3048;
  const US_SURVEY_FEET_TO_METERS = 0.3048006096012192;

  const wktLower = wkt.toLowerCase();

  // Check for US Survey Foot first (more specific)
  if (wktLower.includes('us survey foot') ||
      wktLower.includes('us_survey_foot') ||
      wktLower.includes('foot_us')) {
    return US_SURVEY_FEET_TO_METERS;
  }

  // Check for various foot unit indicators in WKT
  // Look for UNIT["foot" or UNIT["Foot" patterns
  const footPatterns = [
    /unit\s*\[\s*"foot/i,
    /unit\s*\[\s*"international foot/i,
    /,\s*foot\s*\]/i,
    /"ft"/i,
  ];

  for (const pattern of footPatterns) {
    if (pattern.test(wkt)) {
      return FEET_TO_METERS;
    }
  }

  // No feet detected, assume meters
  return 1.0;
}

/**
 * Loads and parses LiDAR point cloud files (LAS, LAZ, COPC).
 * Uses copc.js for COPC/LAZ files with LAS 1.4 support.
 */
export class PointCloudLoader {
  /**
   * Creates a new PointCloudLoader instance.
   */
  constructor() {
    // Reserved for future options
  }

  private _onProgress?: (progress: number, message: string) => void;

  /**
   * Loads a point cloud from a URL, File, or ArrayBuffer.
   *
   * @param source - URL string, File object, or ArrayBuffer
   * @param onProgress - Optional progress callback (progress: 0-100, message: string)
   * @returns Normalized point cloud data
   */
  async load(
    source: string | File | ArrayBuffer,
    onProgress?: (progress: number, message: string) => void
  ): Promise<PointCloudData> {
    this._onProgress = onProgress;

    if (typeof source === 'string') {
      // URL - check if it's HTTP(S) for remote loading
      if (source.startsWith('http://') || source.startsWith('https://')) {
        return await this._loadCopcFromUrl(source);
      } else {
        // Local file path or data URL - fetch and load as buffer
        this._reportProgress(5, 'Fetching file...');
        const response = await fetch(source);
        const buffer = await response.arrayBuffer();
        return await this._loadCopcFromBuffer(buffer);
      }
    } else if (source instanceof File) {
      // File object - read as ArrayBuffer
      this._reportProgress(5, 'Reading file...');
      const buffer = await source.arrayBuffer();
      return await this._loadCopcFromBuffer(buffer);
    } else {
      // ArrayBuffer directly
      return await this._loadCopcFromBuffer(source);
    }
  }

  /**
   * Reports progress to the callback if set.
   */
  private _reportProgress(progress: number, message: string): void {
    if (this._onProgress) {
      this._onProgress(progress, message);
    }
  }

  /**
   * Yields to the event loop to allow UI updates.
   */
  private async _yieldToUI(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  /**
   * Loads a COPC file from a URL using the copc.js library.
   * Falls back to loaders.gl for unsupported LAS versions (e.g., 1.3).
   */
  private async _loadCopcFromUrl(url: string): Promise<PointCloudData> {
    this._reportProgress(5, 'Initializing decoder...');
    await this._yieldToUI();

    // Initialize LazPerf for decompression
    const lazPerf = await getLazPerf();

    this._reportProgress(10, 'Reading file header...');
    await this._yieldToUI();

    // Parse COPC header and metadata
    let copc;
    try {
      copc = await Copc.create(url);
    } catch (error) {
      // Check if this is likely a CORS error
      if (error instanceof TypeError && error.message === 'Failed to fetch') {
        throw new Error(
          `Failed to fetch from URL. This is likely a CORS (Cross-Origin Resource Sharing) error. ` +
          `The server at "${new URL(url).hostname}" doesn't allow requests from this origin. ` +
          `Solutions: (1) Download the file locally and load it as a file, ` +
          `(2) Use a CORS proxy, or (3) Host the file on a CORS-enabled server.`
        );
      }
      // Check if this is an error that requires fallback to loaders.gl:
      // - "Invalid version" - LAS version not supported by copc.js (only 1.2 and 1.4)
      // - "COPC info VLR is required" - Regular LAS file, not COPC format
      if (error instanceof Error && (
        error.message.includes('Invalid version') ||
        error.message.includes('COPC info VLR is required')
      )) {
        console.warn('copc.js cannot load this file, falling back to loaders.gl:', error.message);
        this._reportProgress(10, 'Using alternative decoder...');
        return await this._loadUrlWithLoadersGL(url);
      }
      throw error;
    }

    this._reportProgress(15, 'Loading hierarchy...');
    await this._yieldToUI();

    // Load the full hierarchy using URL as source
    const hierarchy = await this._loadFullHierarchy(url, copc.info);

    return await this._processCopcData(url, copc, hierarchy, lazPerf);
  }

  /**
   * Loads a COPC file from an ArrayBuffer using the copc.js library.
   * Falls back to loaders.gl for unsupported LAS versions (e.g., 1.3).
   */
  private async _loadCopcFromBuffer(buffer: ArrayBuffer): Promise<PointCloudData> {
    this._reportProgress(10, 'Initializing decoder...');
    await this._yieldToUI();

    // Initialize LazPerf for decompression
    const lazPerf = await getLazPerf();

    // Create a getter function from the buffer
    const getter = createBufferGetter(buffer);

    this._reportProgress(15, 'Reading file header...');
    await this._yieldToUI();

    // Parse COPC header and metadata
    try {
      const copc = await Copc.create(getter);

      this._reportProgress(20, 'Loading hierarchy...');
      await this._yieldToUI();

      // Load the full hierarchy (all pages recursively)
      const hierarchy = await this._loadFullHierarchy(getter, copc.info);

      return await this._processCopcData(getter, copc, hierarchy, lazPerf);
    } catch (error) {
      // Check if this is an error that requires fallback:
      // - "Invalid version" - LAS version not supported by copc.js (only 1.2 and 1.4)
      // - "COPC info VLR is required" - Regular LAS file, not COPC format
      if (error instanceof Error) {
        if (error.message.includes('COPC info VLR is required')) {
          // Regular LAS 1.2/1.4 file - try loading with Las module from copc.js
          console.warn('Not a COPC file, trying to load as regular LAS:', error.message);
          this._reportProgress(15, 'Loading as regular LAS file...');
          try {
            return await this._loadRegularLasFromBuffer(buffer, lazPerf);
          } catch (lasError) {
            // If Las module also fails, try loaders.gl
            console.warn('Las module failed, falling back to loaders.gl:', lasError);
            return await this._loadWithLoadersGL(buffer);
          }
        }
        if (error.message.includes('Invalid version')) {
          // LAS 1.0/1.1/1.3 - use loaders.gl
          console.warn('copc.js does not support this LAS version, falling back to loaders.gl:', error.message);
          this._reportProgress(15, 'Using alternative decoder...');
          return await this._loadWithLoadersGL(buffer);
        }
      }
      throw error;
    }
  }

  /**
   * Loads a regular LAS 1.2/1.4 file using copc.js Las module.
   */
  private async _loadRegularLasFromBuffer(buffer: ArrayBuffer, lazPerf: LazPerf): Promise<PointCloudData> {
    this._reportProgress(20, 'Parsing LAS header...');
    await this._yieldToUI();

    const uint8 = new Uint8Array(buffer);

    // Parse header
    const header = Las.Header.parse(uint8);

    // Check if file is compressed (LAZ)
    const isCompressed = (header.pointDataRecordFormat & 0x80) !== 0 ||
      header.generatingSoftware.toLowerCase().includes('laszip');

    let pointData: Uint8Array;

    if (isCompressed) {
      this._reportProgress(30, 'Decompressing LAZ data...');
      await this._yieldToUI();
      pointData = await Las.PointData.decompressFile(uint8, lazPerf);
    } else {
      // For uncompressed LAS, extract point data directly
      pointData = uint8.slice(header.pointDataOffset);
    }

    this._reportProgress(50, 'Processing points...');
    await this._yieldToUI();

    // Setup coordinate transformation
    let transformer: ((coord: [number, number]) => [number, number]) | null = null;
    let needsTransform = false;
    let verticalUnitFactor = 1.0;
    let wkt: string | undefined;

    // Try to get WKT from VLRs
    const getter = createBufferGetter(buffer);
    try {
      const vlrs = await Las.Vlr.walk(getter, header);
      for (const vlr of vlrs) {
        if (vlr.userId === 'LASF_Projection' && vlr.recordId === 2112) {
          const vlrData = await Las.Vlr.fetch(getter, vlr);
          wkt = new TextDecoder().decode(vlrData).replace(/\0/g, '');
          break;
        }
      }
    } catch (e) {
      console.warn('Failed to read VLRs:', e);
    }

    if (wkt) {
      try {
        const wktToUse = extractProjcsFromWkt(wkt);
        const projConverter = proj4(wktToUse, 'EPSG:4326');
        transformer = (coord: [number, number]) => projConverter.forward(coord) as [number, number];
        needsTransform = true;
        verticalUnitFactor = getVerticalUnitConversionFactor(wkt);
      } catch (e) {
        console.warn('Failed to setup coordinate transformation:', e);
      }
    }

    // Create view for reading point data
    const pointFormat = header.pointDataRecordFormat & 0x7F; // Mask off compression bit

    // Create view - it needs header info and the point data buffer
    const view = Las.View.create(pointData, header);

    // Calculate bounds
    let bounds: PointCloudBounds;
    let coordinateOrigin: [number, number, number];

    if (needsTransform && transformer) {
      const [minLng, minLat] = transformer([header.min[0], header.min[1]]);
      const [maxLng, maxLat] = transformer([header.max[0], header.max[1]]);

      bounds = {
        minX: Math.min(minLng, maxLng),
        minY: Math.min(minLat, maxLat),
        minZ: header.min[2] * verticalUnitFactor,
        maxX: Math.max(minLng, maxLng),
        maxY: Math.max(minLat, maxLat),
        maxZ: header.max[2] * verticalUnitFactor,
      };
    } else {
      bounds = {
        minX: header.min[0],
        minY: header.min[1],
        minZ: header.min[2],
        maxX: header.max[0],
        maxY: header.max[1],
        maxZ: header.max[2],
      };
    }

    coordinateOrigin = [
      (bounds.minX + bounds.maxX) / 2,
      (bounds.minY + bounds.maxY) / 2,
      0,
    ];

    const totalPoints = header.pointCount;

    this._reportProgress(60, `Allocating memory for ${totalPoints.toLocaleString()} points...`);
    await this._yieldToUI();

    // Allocate arrays
    const positions = new Float32Array(totalPoints * 3);
    const intensities = new Float32Array(totalPoints);
    const classifications = new Uint8Array(totalPoints);

    // Check if color data is available
    const colorFormats = [2, 3, 5, 7, 8, 10];
    const hasColor = colorFormats.includes(pointFormat);
    let colors: Uint8Array | undefined;
    if (hasColor) {
      colors = new Uint8Array(totalPoints * 4);
    }

    // Get dimension getters
    const xGetter = view.getter('X');
    const yGetter = view.getter('Y');
    const zGetter = view.getter('Z');
    const intensityGetter = view.getter('Intensity');
    const classGetter = view.getter('Classification');
    const redGetter = hasColor ? view.getter('Red') : null;
    const greenGetter = hasColor ? view.getter('Green') : null;
    const blueGetter = hasColor ? view.getter('Blue') : null;

    this._reportProgress(70, 'Processing point coordinates...');
    await this._yieldToUI();

    // Process points
    for (let i = 0; i < totalPoints; i++) {
      const x = xGetter(i);
      const y = yGetter(i);
      const z = zGetter(i) * verticalUnitFactor;

      if (needsTransform && transformer) {
        const [lng, lat] = transformer([x, y]);
        positions[i * 3] = lng - coordinateOrigin[0];
        positions[i * 3 + 1] = lat - coordinateOrigin[1];
        positions[i * 3 + 2] = z;
      } else {
        positions[i * 3] = x - coordinateOrigin[0];
        positions[i * 3 + 1] = y - coordinateOrigin[1];
        positions[i * 3 + 2] = z;
      }

      intensities[i] = intensityGetter(i) / 65535;
      classifications[i] = classGetter(i);

      if (hasColor && colors && redGetter && greenGetter && blueGetter) {
        colors[i * 4] = redGetter(i) >> 8;
        colors[i * 4 + 1] = greenGetter(i) >> 8;
        colors[i * 4 + 2] = blueGetter(i) >> 8;
        colors[i * 4 + 3] = 255;
      }

      // Yield periodically
      if (i % 100000 === 0 && i > 0) {
        const progress = 70 + (i / totalPoints) * 25;
        this._reportProgress(progress, `Processing points... ${i.toLocaleString()} / ${totalPoints.toLocaleString()}`);
        await this._yieldToUI();
      }
    }

    this._reportProgress(95, 'Finalizing...');

    return {
      positions,
      intensities,
      classifications,
      colors,
      pointCount: totalPoints,
      bounds,
      hasRGB: hasColor,
      hasIntensity: true,
      hasClassification: true,
      coordinateOrigin,
      wkt,
    };
  }

  /**
   * Loads a point cloud using loaders.gl (fallback for LAS 1.0/1.1/1.3).
   */
  private async _loadWithLoadersGL(buffer: ArrayBuffer): Promise<PointCloudData> {
    this._reportProgress(20, 'Parsing point cloud data...');
    await this._yieldToUI();

    // Load using loaders.gl LASLoader
    const data = await load(buffer, LASLoader, {
      las: {
        shape: 'mesh',
        fp64: false,
      },
      worker: false,
    });

    this._reportProgress(50, 'Processing points...');
    await this._yieldToUI();

    // Extract header info from loaders.gl result
    // loaders.gl stores header in loaderData.header
    const loaderData = data.loaderData || {};
    const header = loaderData.header || {};
    const totalPoints = header.pointsCount || header.vertexCount ||
      (data.attributes?.POSITION?.value?.length ? data.attributes.POSITION.value.length / 3 : 0);

    // Get position data
    const positionAttr = data.attributes?.POSITION || data.attributes?.positions;
    const sourcePositions = positionAttr?.value;

    if (!sourcePositions || totalPoints === 0) {
      throw new Error('No point data found in file');
    }

    // Setup coordinate transformation if WKT/projection is available
    // loaders.gl stores projection info in various places
    let transformer: ((coord: [number, number]) => [number, number]) | null = null;
    let needsTransform = false;
    let verticalUnitFactor = 1.0;

    // Try to find WKT in various locations where loaders.gl might store it
    let wkt: string | undefined;
    if (loaderData.vlrs) {
      // Look for GeoKeyDirectoryTag or WKT in VLRs
      for (const vlr of loaderData.vlrs) {
        if (vlr.userId === 'LASF_Projection') {
          if (vlr.recordId === 2112) {
            // OGC WKT
            wkt = new TextDecoder().decode(vlr.data);
          }
        }
      }
    }
    // Also check header.wkt as fallback
    wkt = wkt || header.wkt || header.projection?.wkt;

    if (wkt) {
      try {
        const wktToUse = extractProjcsFromWkt(wkt);
        const projConverter = proj4(wktToUse, 'EPSG:4326');
        transformer = (coord: [number, number]) => projConverter.forward(coord) as [number, number];
        needsTransform = true;
        verticalUnitFactor = getVerticalUnitConversionFactor(wkt);
      } catch (e) {
        console.warn('Failed to setup coordinate transformation:', e);
      }
    }

    // Check if coordinates look like they need transformation
    // (i.e., they're not in valid WGS84 range)
    const sampleX = sourcePositions[0];
    const sampleY = sourcePositions[1];
    const looksLikeProjected = Math.abs(sampleX) > 180 || Math.abs(sampleY) > 90;

    if (looksLikeProjected && !needsTransform) {
      console.warn(
        'Point cloud appears to be in a projected coordinate system but no WKT/projection info was found. ' +
        'Coordinates may not display correctly on the map.'
      );
    }

    // Calculate bounds from raw data
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

    for (let i = 0; i < totalPoints; i++) {
      const x = sourcePositions[i * 3];
      const y = sourcePositions[i * 3 + 1];
      const z = sourcePositions[i * 3 + 2];

      if (needsTransform && transformer) {
        const [lng, lat] = transformer([x, y]);
        minX = Math.min(minX, lng);
        maxX = Math.max(maxX, lng);
        minY = Math.min(minY, lat);
        maxY = Math.max(maxY, lat);
      } else {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
      const zScaled = z * verticalUnitFactor;
      minZ = Math.min(minZ, zScaled);
      maxZ = Math.max(maxZ, zScaled);
    }

    // Validate that bounds are in valid WGS84 range
    if (Math.abs(minY) > 90 || Math.abs(maxY) > 90 || Math.abs(minX) > 180 || Math.abs(maxX) > 180) {
      throw new Error(
        'Point cloud coordinates are not in WGS84 (latitude/longitude) format. ' +
        'The file appears to use a projected coordinate system but no valid projection information was found. ' +
        'Please ensure the LAS file contains proper CRS metadata (WKT in VLR records).'
      );
    }

    const bounds: PointCloudBounds = { minX, minY, minZ, maxX, maxY, maxZ };
    const coordinateOrigin: [number, number, number] = [
      (bounds.minX + bounds.maxX) / 2,
      (bounds.minY + bounds.maxY) / 2,
      0,
    ];

    this._reportProgress(70, 'Allocating arrays...');
    await this._yieldToUI();

    // Allocate output arrays
    const positions = new Float32Array(totalPoints * 3);
    const intensities = new Float32Array(totalPoints);
    const classifications = new Uint8Array(totalPoints);

    // Check for color data
    const colorAttr = data.attributes?.COLOR_0 || data.attributes?.colors;
    const sourceColors = colorAttr?.value;
    const hasColor = sourceColors && sourceColors.length >= totalPoints * 3;
    let colors: Uint8Array | undefined;
    if (hasColor) {
      colors = new Uint8Array(totalPoints * 4);
    }

    // Check for intensity
    const intensityAttr = data.attributes?.intensity;
    const sourceIntensity = intensityAttr?.value;
    const hasIntensity = sourceIntensity && sourceIntensity.length >= totalPoints;

    // Check for classification
    const classAttr = data.attributes?.classification;
    const sourceClass = classAttr?.value;
    const hasClassification = sourceClass && sourceClass.length >= totalPoints;

    this._reportProgress(80, 'Transforming coordinates...');
    await this._yieldToUI();

    // Process points
    for (let i = 0; i < totalPoints; i++) {
      const x = sourcePositions[i * 3];
      const y = sourcePositions[i * 3 + 1];
      const z = sourcePositions[i * 3 + 2] * verticalUnitFactor;

      if (needsTransform && transformer) {
        const [lng, lat] = transformer([x, y]);
        positions[i * 3] = lng - coordinateOrigin[0];
        positions[i * 3 + 1] = lat - coordinateOrigin[1];
        positions[i * 3 + 2] = z;
      } else {
        positions[i * 3] = x - coordinateOrigin[0];
        positions[i * 3 + 1] = y - coordinateOrigin[1];
        positions[i * 3 + 2] = z;
      }

      // Intensity (normalize to 0-1)
      if (hasIntensity) {
        intensities[i] = sourceIntensity[i] / 65535;
      }

      // Classification
      if (hasClassification) {
        classifications[i] = sourceClass[i];
      }

      // Colors
      if (hasColor && colors) {
        const colorSize = colorAttr.size || 3;
        if (colorSize === 4) {
          colors[i * 4] = sourceColors[i * 4];
          colors[i * 4 + 1] = sourceColors[i * 4 + 1];
          colors[i * 4 + 2] = sourceColors[i * 4 + 2];
          colors[i * 4 + 3] = sourceColors[i * 4 + 3];
        } else {
          colors[i * 4] = sourceColors[i * 3];
          colors[i * 4 + 1] = sourceColors[i * 3 + 1];
          colors[i * 4 + 2] = sourceColors[i * 3 + 2];
          colors[i * 4 + 3] = 255;
        }
      }
    }

    this._reportProgress(95, 'Finalizing...');

    return {
      positions,
      intensities,
      classifications,
      colors,
      pointCount: totalPoints,
      bounds,
      hasRGB: hasColor,
      hasIntensity,
      hasClassification,
      coordinateOrigin,
      wkt,
    };
  }

  /**
   * Loads a point cloud from URL using loaders.gl (fallback for unsupported LAS versions).
   */
  private async _loadUrlWithLoadersGL(url: string): Promise<PointCloudData> {
    this._reportProgress(15, 'Downloading file...');
    await this._yieldToUI();

    // Fetch the file
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
    }
    const buffer = await response.arrayBuffer();

    return await this._loadWithLoadersGL(buffer);
  }

  /**
   * Recursively loads all hierarchy pages from a COPC file.
   * @param source - URL string or Getter function
   * @param info - COPC info containing root hierarchy page
   */
  private async _loadFullHierarchy(
    source: string | Getter,
    info: { rootHierarchyPage: Hierarchy.Page }
  ): Promise<Hierarchy.Subtree> {
    const allNodes: Record<string, Hierarchy.Node> = {};

    const loadPage = async (page: Hierarchy.Page): Promise<void> => {
      const subtree = await Hierarchy.load(source, page);

      // Add all nodes from this page
      for (const [key, node] of Object.entries(subtree.nodes)) {
        if (node) {
          allNodes[key] = node;
        }
      }

      // Recursively load sub-pages
      for (const [, subPage] of Object.entries(subtree.pages)) {
        if (subPage) {
          await loadPage(subPage);
        }
      }
    };

    await loadPage(info.rootHierarchyPage);

    return { nodes: allNodes, pages: {} };
  }

  /**
   * Process COPC data and extract point cloud information.
   */
  private async _processCopcData(
    source: string | Getter,
    copc: CopcType,
    hierarchy: Hierarchy.Subtree,
    lazPerf: LazPerf
  ): Promise<PointCloudData> {
    const { header } = copc;

    // Setup coordinate transformation if WKT is available
    let transformer: ((coord: [number, number]) => [number, number]) | null = null;
    let needsTransform = false;
    let verticalUnitFactor = 1.0; // Conversion factor for elevation (feet to meters)

    if (copc.wkt) {
      try {
        // Extract PROJCS from compound coordinate system (COMPD_CS) if present
        const wktToUse = extractProjcsFromWkt(copc.wkt);

        // Create a proj4 converter from source CRS to WGS84
        const projConverter = proj4(wktToUse, 'EPSG:4326');
        transformer = (coord: [number, number]) => projConverter.forward(coord) as [number, number];
        needsTransform = true;

        // Detect if vertical units are in feet and need conversion to meters
        verticalUnitFactor = getVerticalUnitConversionFactor(copc.wkt);
      } catch (e) {
        console.warn('Failed to setup coordinate transformation:', e);
      }
    }

    // Collect all nodes to load
    const nodesToLoad: { key: string; node: Hierarchy.Node }[] = [];
    for (const [key, node] of Object.entries(hierarchy.nodes)) {
      if (node) {
        nodesToLoad.push({ key, node });
      }
    }

    // Calculate total points
    const totalPoints = nodesToLoad.reduce((sum, { node }) => sum + node.pointCount, 0);

    // Calculate bounds FIRST - we need these to compute the coordinate origin
    // This avoids Float32 precision loss by storing positions as small offsets
    let bounds: PointCloudBounds;
    let coordinateOrigin: [number, number, number];

    if (needsTransform && transformer) {
      const [minLng, minLat] = transformer([header.min[0], header.min[1]]);
      const [maxLng, maxLat] = transformer([header.max[0], header.max[1]]);

      bounds = {
        minX: Math.min(minLng, maxLng),
        minY: Math.min(minLat, maxLat),
        minZ: header.min[2] * verticalUnitFactor,
        maxX: Math.max(minLng, maxLng),
        maxY: Math.max(minLat, maxLat),
        maxZ: header.max[2] * verticalUnitFactor,
      };
      // Coordinate origin is the center of the bounding box
      coordinateOrigin = [
        (bounds.minX + bounds.maxX) / 2,
        (bounds.minY + bounds.maxY) / 2,
        0,
      ];
    } else {
      bounds = {
        minX: header.min[0],
        minY: header.min[1],
        minZ: header.min[2],
        maxX: header.max[0],
        maxY: header.max[1],
        maxZ: header.max[2],
      };
      coordinateOrigin = [
        (bounds.minX + bounds.maxX) / 2,
        (bounds.minY + bounds.maxY) / 2,
        0,
      ];
    }

    this._reportProgress(25, `Allocating memory for ${totalPoints.toLocaleString()} points...`);
    await this._yieldToUI();

    // Allocate arrays - positions will be stored as OFFSETS from coordinateOrigin
    // This maintains Float32 precision for geographic coordinates
    const positions = new Float32Array(totalPoints * 3);
    const intensities = new Float32Array(totalPoints);
    const classifications = new Uint8Array(totalPoints);
    let colors: Uint8Array | undefined;

    // Check if color data is available (point formats 2, 3, 5, 7, 8, 10)
    const colorFormats = [2, 3, 5, 7, 8, 10];
    const hasColor = colorFormats.includes(header.pointDataRecordFormat);
    if (hasColor) {
      colors = new Uint8Array(totalPoints * 4);
    }

    // Extra attributes will be populated dynamically based on available dimensions
    const extraAttributes: ExtraPointAttributes = {};
    // Track which dimensions we've detected as available
    const availableDimensions: Set<string> = new Set();
    // First pass flag - we'll detect dimensions on first node
    let dimensionsDetected = false;

    let pointIndex = 0;
    let lastYieldTime = Date.now();
    const YIELD_INTERVAL_MS = 50; // Yield every 50ms to keep UI responsive

    // Load point data from each node
    for (let nodeIdx = 0; nodeIdx < nodesToLoad.length; nodeIdx++) {
      const { node } = nodesToLoad[nodeIdx];

      // Report progress (25-90% range for point loading)
      const loadProgress = 25 + (nodeIdx / nodesToLoad.length) * 65;
      const pointsLoaded = pointIndex.toLocaleString();
      this._reportProgress(loadProgress, `Loading points... ${pointsLoaded} / ${totalPoints.toLocaleString()}`);

      try {
        const view = await Copc.loadPointDataView(source, copc, node, { lazPerf });

        // On first node, detect all available dimensions
        if (!dimensionsDetected) {
          // Get all dimension names from the view
          const allDimensions = Object.keys(view.dimensions || {});
          for (const dimName of allDimensions) {
            if (!CORE_DIMENSIONS.has(dimName)) {
              availableDimensions.add(dimName);
              // Allocate array for this dimension
              const config = DIMENSION_CONFIGS[dimName] || { arrayType: 'float32' };
              extraAttributes[dimName] = createAttributeArray(config.arrayType, totalPoints);
            }
          }
          dimensionsDetected = true;
        }

        // Get dimensions - core attributes
        const xGetter = view.getter('X');
        const yGetter = view.getter('Y');
        const zGetter = view.getter('Z');
        const intensityGetter = view.getter('Intensity');
        const classGetter = view.getter('Classification');
        const redGetter = hasColor ? view.getter('Red') : null;
        const greenGetter = hasColor ? view.getter('Green') : null;
        const blueGetter = hasColor ? view.getter('Blue') : null;

        // Build getters for all available extra dimensions
        const extraGetters: Map<string, (i: number) => number> = new Map();
        for (const dimName of availableDimensions) {
          try {
            const getter = view.getter(dimName);
            if (getter) {
              extraGetters.set(dimName, getter);
            }
          } catch {
            // Dimension not available in this node, skip
          }
        }

        for (let i = 0; i < node.pointCount; i++) {
          // copc.js getters already return scaled/offset coordinates, NOT raw integers
          const x = xGetter(i);
          const y = yGetter(i);
          const z = zGetter(i);

          // Transform coordinates to WGS84 if needed
          if (needsTransform && transformer) {
            const [lng, lat] = transformer([x, y]);

            // Store as OFFSET from coordinateOrigin - these small values maintain Float32 precision
            positions[pointIndex * 3] = lng - coordinateOrigin[0];
            positions[pointIndex * 3 + 1] = lat - coordinateOrigin[1];
            positions[pointIndex * 3 + 2] = z * verticalUnitFactor; // elevation in meters
          } else {
            positions[pointIndex * 3] = x - coordinateOrigin[0];
            positions[pointIndex * 3 + 1] = y - coordinateOrigin[1];
            positions[pointIndex * 3 + 2] = z;
          }

          // Intensity (normalize to 0-1)
          intensities[pointIndex] = intensityGetter(i) / 65535;

          // Classification
          classifications[pointIndex] = classGetter(i);

          // Color (if available)
          if (colors && redGetter && greenGetter && blueGetter) {
            // LAS colors are 16-bit, convert to 8-bit
            colors[pointIndex * 4] = redGetter(i) >> 8;
            colors[pointIndex * 4 + 1] = greenGetter(i) >> 8;
            colors[pointIndex * 4 + 2] = blueGetter(i) >> 8;
            colors[pointIndex * 4 + 3] = 255;
          }

          // Extra attributes - dynamically loaded based on available dimensions
          for (const [dimName, getter] of extraGetters) {
            const arr = extraAttributes[dimName];
            if (arr) {
              arr[pointIndex] = getter(i);
            }
          }

          pointIndex++;

          // Periodically yield to the UI thread
          if (i % 50000 === 0) {
            const now = Date.now();
            if (now - lastYieldTime > YIELD_INTERVAL_MS) {
              await this._yieldToUI();
              lastYieldTime = now;
            }
          }
        }
      } catch (e) {
        console.warn(`Failed to load node: ${e}`);
      }
    }

    this._reportProgress(92, 'Processing complete, preparing visualization...');

    // Trim extra attributes arrays to actual point count
    const trimmedExtraAttributes: ExtraPointAttributes = {};
    for (const [name, arr] of Object.entries(extraAttributes)) {
      trimmedExtraAttributes[name] = arr.subarray(0, pointIndex) as AttributeArray;
    }

    return {
      positions: positions.subarray(0, pointIndex * 3),
      coordinateOrigin,
      colors: colors?.subarray(0, pointIndex * 4),
      intensities: intensities.subarray(0, pointIndex),
      classifications: classifications.subarray(0, pointIndex),
      extraAttributes: Object.keys(trimmedExtraAttributes).length > 0 ? trimmedExtraAttributes : undefined,
      pointCount: pointIndex,
      bounds,
      hasRGB: !!colors,
      hasIntensity: true,
      hasClassification: true,
      wkt: copc.wkt,
    };
  }
}
