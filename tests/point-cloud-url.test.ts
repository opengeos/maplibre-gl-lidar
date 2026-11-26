import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CLASSIFICATION_COLORS,
  ColorSchemeProcessor,
  LidarControl,
  getClassificationColor,
  isCopcUrl,
  isEptUrl,
  isStreamedPointCloudUrl,
} from '../src/index';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('point cloud URL routing helpers', () => {
  it('recognises EPT datasets', () => {
    expect(isEptUrl('https://example.com/data/ept.json')).toBe(true);
    expect(isEptUrl('https://example.com/data/ept.json?token=1')).toBe(true);
    expect(isEptUrl('https://example.com/data/ept.jsonl')).toBe(false);
  });

  it('recognises remote COPC files only over http(s)', () => {
    expect(isCopcUrl('https://example.com/a.copc.laz')).toBe(true);
    expect(isCopcUrl('http://example.com/A.COPC.LAZ')).toBe(true);
    expect(isCopcUrl('blob:https://example.com/a.copc.laz')).toBe(false);
    expect(isCopcUrl('https://example.com/a.laz')).toBe(false);
  });

  it('reports which URLs stream for a loading mode', () => {
    expect(isStreamedPointCloudUrl('https://example.com/ept.json')).toBe(true);
    expect(isStreamedPointCloudUrl('https://example.com/ept.json', 'full')).toBe(true);
    expect(isStreamedPointCloudUrl('https://example.com/a.copc.laz')).toBe(true);
    expect(isStreamedPointCloudUrl('https://example.com/a.copc.laz', 'full')).toBe(false);
    expect(isStreamedPointCloudUrl('https://example.com/a.laz')).toBe(false);
  });

  it('matches how loadPointCloud routes each URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('no network')));
    const control = new LidarControl();
    const copc = vi
      .spyOn(control, 'loadPointCloudStreaming')
      .mockResolvedValue({} as Awaited<ReturnType<LidarControl['loadPointCloud']>>);
    const ept = vi
      .spyOn(control, 'loadPointCloudEptStreaming')
      .mockResolvedValue({} as Awaited<ReturnType<LidarControl['loadPointCloud']>>);

    const urls = [
      'https://example.com/ept.json',
      'https://example.com/a.copc.laz',
      'https://example.com/a.laz',
    ];
    for (const url of urls) {
      copc.mockClear();
      ept.mockClear();
      await control.loadPointCloud(url).catch(() => undefined);
      const streamed = copc.mock.calls.length + ept.mock.calls.length > 0;
      expect(streamed, url).toBe(isStreamedPointCloudUrl(url));
    }
  });
});

describe('CLASSIFICATION_COLORS', () => {
  it('is the table the classification colour scheme draws with', () => {
    for (const [code, color] of Object.entries(CLASSIFICATION_COLORS)) {
      expect(getClassificationColor(Number(code))).toEqual(color);
    }
    expect(CLASSIFICATION_COLORS[2]).toEqual([165, 113, 78]);
    expect(ColorSchemeProcessor).toBeTypeOf('function');
  });
});
