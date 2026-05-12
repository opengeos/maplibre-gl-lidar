import { describe, expect, it } from 'vitest';
import type { LidarState } from '../src/lib/core/types';
import {
  LIDAR_SHARE_PARAM,
  createLidarSharePayload,
  createLidarShareUrl,
  decodeLidarSharePayload,
  encodeLidarSharePayload,
  hasLidarShareParams,
  parseLidarSharePayloadFromUrl,
} from '../src/lib/utils/share-url';

function createState(overrides: Partial<LidarState> = {}): LidarState {
  return {
    collapsed: false,
    panelWidth: 365,
    maxHeight: 500,
    pointClouds: [
      {
        id: 'pc-1',
        name: 'remote.copc.laz',
        pointCount: 100,
        bounds: {
          minX: -123,
          minY: 44,
          maxX: -122,
          maxY: 45,
          minZ: 10,
          maxZ: 120,
        },
        hasRGB: true,
        hasIntensity: true,
        hasClassification: true,
        source: 'data/remote.copc.laz',
      },
      {
        id: 'pc-2',
        name: 'local.laz',
        pointCount: 50,
        bounds: {
          minX: 0,
          minY: 0,
          maxX: 1,
          maxY: 1,
          minZ: 0,
          maxZ: 1,
        },
        hasRGB: false,
        hasIntensity: true,
        hasClassification: false,
        source: 'file',
      },
    ],
    activePointCloudId: 'pc-1',
    pointSize: 4,
    opacity: 0.65,
    colorScheme: 'classification',
    colormap: 'turbo',
    colorRange: {
      mode: 'absolute',
      percentileLow: 2,
      percentileHigh: 98,
      absoluteMin: 10,
      absoluteMax: 90,
    },
    showColorbar: true,
    usePercentile: true,
    elevationRange: [20, 80],
    pointBudget: 1000000,
    pickable: true,
    loading: false,
    error: null,
    zOffsetEnabled: true,
    zOffset: -12,
    hiddenClassifications: new Set([7, 2]),
    availableClassifications: new Set([1, 2, 7]),
    terrainEnabled: true,
    ...overrides,
  };
}

describe('share URL helpers', () => {
  it('round-trips map and visualization settings', () => {
    const payload = createLidarSharePayload(
      createState(),
      {
        center: [-122.5, 44.5],
        zoom: 12,
        bearing: 15,
        pitch: 60,
      },
      'https://example.com/viewer/index.html?foo=bar'
    );

    const decoded = decodeLidarSharePayload(encodeLidarSharePayload(payload));

    expect(decoded).toEqual(payload);
    expect(decoded?.pointClouds).toEqual([
      'https://example.com/viewer/data/remote.copc.laz',
    ]);
    expect(decoded?.visualization.hiddenClassifications).toEqual([2, 7]);
  });

  it('creates readable query parameters and strips hash state', () => {
    const payload = createLidarSharePayload(createState());
    const url = createLidarShareUrl(
      'https://example.com/viewer?foo=bar&url=https%3A%2F%2Fold.example%2Ffile.laz#12/44/-122',
      payload
    );
    const parsed = new URL(url);

    expect(parsed.searchParams.get('foo')).toBe('bar');
    expect(parsed.searchParams.getAll('url')).toEqual(['data/remote.copc.laz']);
    expect(parsed.searchParams.has(LIDAR_SHARE_PARAM)).toBe(false);
    expect(parsed.searchParams.get('color')).toBe('classification');
    expect(parsed.searchParams.get('cmap')).toBe('turbo');
    expect(parsed.searchParams.get('zoff')).toBe('-12');
    expect(parsed.hash).toBe('');
    expect(parseLidarSharePayloadFromUrl(url)).toEqual(payload);
    expect(hasLidarShareParams(url)).toBe(true);
    expect(hasLidarShareParams('https://example.com/viewer?url=https://example.com/file.laz')).toBe(false);
  });

  it('rejects malformed payloads safely', () => {
    expect(decodeLidarSharePayload('not-valid-base64')).toBeNull();
    expect(parseLidarSharePayloadFromUrl('https://example.com/viewer')).toBeNull();

    const url = new URL('https://example.com/viewer');
    url.searchParams.set(LIDAR_SHARE_PARAM, encodeLidarSharePayload({
      v: 1,
      pointClouds: ['https://example.com/file.laz'],
      visualization: {
        pointSize: Number.NaN,
        opacity: 1,
        colorScheme: 'elevation',
        colormap: 'viridis',
        colorRange: { mode: 'percentile', percentileLow: 2, percentileHigh: 98 },
        elevationRange: null,
        pickable: false,
        zOffsetEnabled: false,
        zOffset: 0,
        terrainEnabled: false,
        hiddenClassifications: [],
      },
    }));

    expect(parseLidarSharePayloadFromUrl(url.toString())).toBeNull();
  });

  it('omits non-shareable local file sources', () => {
    const payload = createLidarSharePayload(createState({
      pointClouds: [
        {
          id: 'pc-local',
          name: 'local.laz',
          pointCount: 1,
          bounds: {
            minX: 0,
            minY: 0,
            maxX: 0,
            maxY: 0,
            minZ: 0,
            maxZ: 0,
          },
          hasRGB: false,
          hasIntensity: false,
          hasClassification: false,
          source: 'file',
        },
      ],
    }));

    expect(payload.pointClouds).toEqual([]);
  });
});
