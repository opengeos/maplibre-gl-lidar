import type {
  ColorRangeConfig,
  ColorScheme,
  ColormapName,
  LidarState,
} from '../core/types';

export const LIDAR_SHARE_PARAM = 'lidar';
export const LIDAR_SHARE_VERSION = 1;
const LEGACY_URL_PARAM = 'url';
const FLAT_SHARE_PARAMS = [
  'url',
  'lon',
  'lat',
  'zoom',
  'bearing',
  'pitch',
  'size',
  'opacity',
  'color',
  'cmap',
  'range',
  'plow',
  'phigh',
  'amin',
  'amax',
  'emin',
  'emax',
  'pick',
  'zoff',
  'zoffEnabled',
  'terrain',
  'hidden',
];

export interface LidarShareMapState {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
}

export interface LidarShareVisualization {
  pointSize: number;
  opacity: number;
  colorScheme: ColorScheme;
  colormap: ColormapName;
  colorRange: ColorRangeConfig;
  elevationRange: [number, number] | null;
  pickable: boolean;
  zOffsetEnabled: boolean;
  zOffset: number;
  terrainEnabled: boolean;
  hiddenClassifications: number[];
}

export interface LidarSharePayload {
  v: typeof LIDAR_SHARE_VERSION;
  map?: LidarShareMapState;
  pointClouds: string[];
  visualization: LidarShareVisualization;
}

function encodeBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';

  for (let i = 0; i < bytes.length; i += 0x8000) {
    const chunk = bytes.subarray(i, i + 0x8000);
    binary += String.fromCharCode(...chunk);
  }

  const base64 =
    typeof btoa === 'function'
      ? btoa(binary)
      : Buffer.from(bytes).toString('base64');

  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeBase64Url(value: string): string {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');

  if (typeof atob === 'function') {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return new TextDecoder().decode(bytes);
  }

  return Buffer.from(padded, 'base64').toString('utf-8');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isMapState(value: unknown): value is LidarShareMapState {
  if (!isRecord(value)) return false;

  const center = value.center;
  return (
    Array.isArray(center) &&
    center.length === 2 &&
    center.every(isNumber) &&
    isNumber(value.zoom) &&
    isNumber(value.bearing) &&
    isNumber(value.pitch)
  );
}

function isElevationRange(value: unknown): value is [number, number] | null {
  return (
    value === null ||
    (Array.isArray(value) &&
      value.length === 2 &&
      isNumber(value[0]) &&
      isNumber(value[1]))
  );
}

function isColorRange(value: unknown): value is ColorRangeConfig {
  if (!isRecord(value)) return false;
  if (value.mode !== 'percentile' && value.mode !== 'absolute') return false;
  if (!isNumber(value.percentileLow) || !isNumber(value.percentileHigh)) return false;
  if (value.absoluteMin !== undefined && !isNumber(value.absoluteMin)) return false;
  if (value.absoluteMax !== undefined && !isNumber(value.absoluteMax)) return false;
  return true;
}

function isVisualization(value: unknown): value is LidarShareVisualization {
  if (!isRecord(value)) return false;

  return (
    isNumber(value.pointSize) &&
    isNumber(value.opacity) &&
    value.colorScheme !== undefined &&
    typeof value.colormap === 'string' &&
    isColorRange(value.colorRange) &&
    isElevationRange(value.elevationRange) &&
    typeof value.pickable === 'boolean' &&
    typeof value.zOffsetEnabled === 'boolean' &&
    isNumber(value.zOffset) &&
    typeof value.terrainEnabled === 'boolean' &&
    Array.isArray(value.hiddenClassifications) &&
    value.hiddenClassifications.every(isNumber)
  );
}

function normalizePointCloudSource(source: string, baseUrl?: string): string | null {
  if (!source || source === 'file') return null;

  if (!baseUrl) return source;

  try {
    return new URL(source, baseUrl).toString();
  } catch {
    return source;
  }
}

export function createLidarSharePayload(
  state: LidarState,
  map?: LidarShareMapState,
  baseUrl?: string
): LidarSharePayload {
  const sources = new Set<string>();

  for (const pointCloud of state.pointClouds) {
    const source = normalizePointCloudSource(pointCloud.source, baseUrl);
    if (source) {
      sources.add(source);
    }
  }

  return {
    v: LIDAR_SHARE_VERSION,
    map,
    pointClouds: Array.from(sources),
    visualization: {
      pointSize: state.pointSize,
      opacity: state.opacity,
      colorScheme: state.colorScheme,
      colormap: state.colormap,
      colorRange: state.colorRange,
      elevationRange: state.elevationRange,
      pickable: state.pickable,
      zOffsetEnabled: state.zOffsetEnabled,
      zOffset: state.zOffset,
      terrainEnabled: state.terrainEnabled,
      hiddenClassifications: Array.from(state.hiddenClassifications).sort((a, b) => a - b),
    },
  };
}

export function encodeLidarSharePayload(payload: LidarSharePayload): string {
  return encodeBase64Url(JSON.stringify(payload));
}

export function decodeLidarSharePayload(value: string): LidarSharePayload | null {
  try {
    const payload = JSON.parse(decodeBase64Url(value)) as unknown;
    if (!isRecord(payload)) return null;
    if (payload.v !== LIDAR_SHARE_VERSION) return null;
    if (!Array.isArray(payload.pointClouds) || !payload.pointClouds.every((source) => typeof source === 'string')) {
      return null;
    }
    if (!isVisualization(payload.visualization)) return null;
    if (payload.map !== undefined && !isMapState(payload.map)) return null;

    return {
      v: LIDAR_SHARE_VERSION,
      map: payload.map,
      pointClouds: [...payload.pointClouds],
      visualization: {
        ...payload.visualization,
        hiddenClassifications: [...payload.visualization.hiddenClassifications],
      },
    };
  } catch {
    return null;
  }
}

export function createLidarShareUrl(currentUrl: string, payload: LidarSharePayload): string {
  const url = new URL(currentUrl);
  for (const param of FLAT_SHARE_PARAMS) {
    url.searchParams.delete(param);
  }
  url.searchParams.delete(LIDAR_SHARE_PARAM);

  for (const source of payload.pointClouds) {
    url.searchParams.append(LEGACY_URL_PARAM, source);
  }

  if (payload.map) {
    url.searchParams.set('lon', formatQueryNumber(payload.map.center[0]));
    url.searchParams.set('lat', formatQueryNumber(payload.map.center[1]));
    url.searchParams.set('zoom', formatQueryNumber(payload.map.zoom));
    url.searchParams.set('bearing', formatQueryNumber(payload.map.bearing));
    url.searchParams.set('pitch', formatQueryNumber(payload.map.pitch));
  }

  const visualization = payload.visualization;
  url.searchParams.set('size', formatQueryNumber(visualization.pointSize));
  url.searchParams.set('opacity', formatQueryNumber(visualization.opacity));
  url.searchParams.set(
    'color',
    typeof visualization.colorScheme === 'string'
      ? visualization.colorScheme
      : JSON.stringify(visualization.colorScheme)
  );
  url.searchParams.set('cmap', visualization.colormap);
  url.searchParams.set('range', visualization.colorRange.mode);
  url.searchParams.set('plow', formatQueryNumber(visualization.colorRange.percentileLow));
  url.searchParams.set('phigh', formatQueryNumber(visualization.colorRange.percentileHigh));
  if (visualization.colorRange.absoluteMin !== undefined) {
    url.searchParams.set('amin', formatQueryNumber(visualization.colorRange.absoluteMin));
  }
  if (visualization.colorRange.absoluteMax !== undefined) {
    url.searchParams.set('amax', formatQueryNumber(visualization.colorRange.absoluteMax));
  }
  if (visualization.elevationRange) {
    url.searchParams.set('emin', formatQueryNumber(visualization.elevationRange[0]));
    url.searchParams.set('emax', formatQueryNumber(visualization.elevationRange[1]));
  }
  url.searchParams.set('pick', formatQueryBoolean(visualization.pickable));
  url.searchParams.set('zoffEnabled', formatQueryBoolean(visualization.zOffsetEnabled));
  url.searchParams.set('zoff', formatQueryNumber(visualization.zOffset));
  url.searchParams.set('terrain', formatQueryBoolean(visualization.terrainEnabled));
  if (visualization.hiddenClassifications.length > 0) {
    url.searchParams.set('hidden', visualization.hiddenClassifications.join(','));
  }
  url.hash = '';
  return url.toString();
}

export function parseLidarSharePayloadFromUrl(url: string): LidarSharePayload | null {
  try {
    const parsed = new URL(url);
    const flatPayload = parseFlatLidarSharePayload(parsed.searchParams);
    if (flatPayload) return flatPayload;

    const value = parsed.searchParams.get(LIDAR_SHARE_PARAM);
    return value ? decodeLidarSharePayload(value) : null;
  } catch {
    return null;
  }
}

export function hasLidarShareParams(url: string): boolean {
  try {
    const params = new URL(url).searchParams;
    if (params.has(LIDAR_SHARE_PARAM)) return true;
    return hasFlatLidarShareParams(params);
  } catch {
    return false;
  }
}

function formatQueryNumber(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : Number(value.toFixed(8)).toString();
}

function formatQueryBoolean(value: boolean): string {
  return value ? '1' : '0';
}

function parseQueryNumber(value: string | null): number | undefined {
  if (value === null || value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseQueryBoolean(value: string | null, fallback: boolean): boolean {
  if (value === null) return fallback;
  return value === '1' || value.toLowerCase() === 'true';
}

function parseColorScheme(value: string | null): ColorScheme {
  if (!value) return 'elevation';
  if (value.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (isRecord(parsed) && (parsed.type === 'gradient' || parsed.type === 'categorical') && typeof parsed.attribute === 'string') {
        return parsed as unknown as ColorScheme;
      }
    } catch {
      return 'elevation';
    }
  }
  return value as ColorScheme;
}

function hasFlatLidarShareParams(params: URLSearchParams): boolean {
  return FLAT_SHARE_PARAMS.some((param) => param !== LEGACY_URL_PARAM && params.has(param));
}

function parseFlatLidarSharePayload(params: URLSearchParams): LidarSharePayload | null {
  if (!hasFlatLidarShareParams(params)) return null;

  const lon = parseQueryNumber(params.get('lon'));
  const lat = parseQueryNumber(params.get('lat'));
  const zoom = parseQueryNumber(params.get('zoom'));
  const bearing = parseQueryNumber(params.get('bearing')) ?? 0;
  const pitch = parseQueryNumber(params.get('pitch')) ?? 0;
  const pointSize = parseQueryNumber(params.get('size')) ?? 2;
  const opacity = parseQueryNumber(params.get('opacity')) ?? 1;
  const percentileLow = parseQueryNumber(params.get('plow')) ?? 2;
  const percentileHigh = parseQueryNumber(params.get('phigh')) ?? 98;
  const absoluteMin = parseQueryNumber(params.get('amin'));
  const absoluteMax = parseQueryNumber(params.get('amax'));
  const elevationMin = parseQueryNumber(params.get('emin'));
  const elevationMax = parseQueryNumber(params.get('emax'));
  const zOffset = parseQueryNumber(params.get('zoff')) ?? 0;
  const hiddenClassifications = (params.get('hidden') ?? '')
    .split(',')
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));

  return {
    v: LIDAR_SHARE_VERSION,
    map:
      lon !== undefined && lat !== undefined && zoom !== undefined
        ? {
            center: [lon, lat],
            zoom,
            bearing,
            pitch,
          }
        : undefined,
    pointClouds: params.getAll(LEGACY_URL_PARAM).filter((source) => source.trim() !== ''),
    visualization: {
      pointSize,
      opacity,
      colorScheme: parseColorScheme(params.get('color')),
      colormap: (params.get('cmap') ?? 'viridis') as ColormapName,
      colorRange: {
        mode: params.get('range') === 'absolute' ? 'absolute' : 'percentile',
        percentileLow,
        percentileHigh,
        ...(absoluteMin !== undefined ? { absoluteMin } : {}),
        ...(absoluteMax !== undefined ? { absoluteMax } : {}),
      },
      elevationRange:
        elevationMin !== undefined && elevationMax !== undefined
          ? [elevationMin, elevationMax]
          : null,
      pickable: parseQueryBoolean(params.get('pick'), false),
      zOffsetEnabled: parseQueryBoolean(params.get('zoffEnabled'), false),
      zOffset,
      terrainEnabled: parseQueryBoolean(params.get('terrain'), false),
      hiddenClassifications,
    },
  };
}
