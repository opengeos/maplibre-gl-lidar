import { Copc, Hierarchy, Getter } from 'copc';
import type { Copc as CopcType } from 'copc';
import { createLazPerf, type LazPerf } from 'laz-perf';
import proj4 from 'proj4';
import type { PointCloudData } from './types';
import type { PointCloudBounds } from '../core/types';

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
   */
  private async _loadCopcFromUrl(url: string): Promise<PointCloudData> {
    this._reportProgress(5, 'Initializing decoder...');
    await this._yieldToUI();

    // Initialize LazPerf for decompression
    const lazPerf = await getLazPerf();

    this._reportProgress(10, 'Reading file header...');
    await this._yieldToUI();

    // Parse COPC header and metadata
    const copc = await Copc.create(url);

    this._reportProgress(15, 'Loading hierarchy...');
    await this._yieldToUI();

    // Load the full hierarchy using URL as source
    const hierarchy = await this._loadFullHierarchy(url, copc.info);

    return await this._processCopcData(url, copc, hierarchy, lazPerf);
  }

  /**
   * Loads a COPC file from an ArrayBuffer using the copc.js library.
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
    const copc = await Copc.create(getter);

    this._reportProgress(20, 'Loading hierarchy...');
    await this._yieldToUI();

    // Load the full hierarchy (all pages recursively)
    const hierarchy = await this._loadFullHierarchy(getter, copc.info);

    return await this._processCopcData(getter, copc, hierarchy, lazPerf);
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

        // Get dimensions
        const xGetter = view.getter('X');
        const yGetter = view.getter('Y');
        const zGetter = view.getter('Z');
        const intensityGetter = view.getter('Intensity');
        const classGetter = view.getter('Classification');
        const redGetter = hasColor ? view.getter('Red') : null;
        const greenGetter = hasColor ? view.getter('Green') : null;
        const blueGetter = hasColor ? view.getter('Blue') : null;

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

    return {
      positions: positions.subarray(0, pointIndex * 3),
      coordinateOrigin,
      colors: colors?.subarray(0, pointIndex * 4),
      intensities: intensities.subarray(0, pointIndex),
      classifications: classifications.subarray(0, pointIndex),
      pointCount: pointIndex,
      bounds,
      hasRGB: !!colors,
      hasIntensity: true,
      hasClassification: true,
      wkt: copc.wkt,
    };
  }
}
