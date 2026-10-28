import { describe, expect, it, vi } from 'vitest';
import type { PointCloudData, PointCloudStyleOverride } from '../src/index';
import { PointCloudManager } from '../src/index';
import type { DeckOverlay } from '../src/lib/core/DeckOverlay';
import type { ColorRangeConfig } from '../src/lib/core/types';
import { ColorSchemeProcessor } from '../src/lib/colorizers/ColorScheme';

vi.mock('@deck.gl/maplibre', () => ({ MapLibreOverlay: class {} }));

interface FakeLayer {
  props: {
    pointSize: number;
    data: {
      attributes: {
        getPosition: { value: Float32Array };
        getColor: { value: Uint8Array };
      };
    };
  };
}

/** A cloud of points at elevations `zs`, with intensities falling 1..0 (the reverse of elevation). */
function cloud(zs: number[]): PointCloudData {
  const positions = new Float32Array(zs.length * 3);
  zs.forEach((z, i) => (positions[i * 3 + 2] = z));
  return {
    positions,
    coordinateOrigin: [0, 0, 0],
    intensities: Float32Array.from(zs.map((_, i) => 1 - i / Math.max(1, zs.length - 1))),
    pointCount: zs.length,
    bounds: { minX: 0, minY: 0, minZ: Math.min(...zs), maxX: 0, maxY: 0, maxZ: Math.max(...zs) },
    hasRGB: false,
    hasIntensity: true,
    hasClassification: false,
  };
}

/** An absolute 0..10 color range, as a fresh object on every call. */
function absoluteRange(): ColorRangeConfig {
  return { mode: 'absolute', percentileLow: 2, percentileHigh: 98, absoluteMin: 0, absoluteMax: 10 };
}

function setup(options: ConstructorParameters<typeof PointCloudManager>[1] = {}) {
  const layers = new Map<string, FakeLayer>();
  const overlay = {
    addLayer: (id: string, layer: FakeLayer) => layers.set(id, layer),
    removeLayer: (id: string) => layers.delete(id),
  } as unknown as DeckOverlay;
  const manager = new PointCloudManager(overlay, { pointSize: 2, zOffset: 0, ...options });
  const layer = (id: string) => layers.get(`pointcloud-${id}-chunk0`)!;
  const colors = (id: string) => [...layer(id).props.data.attributes.getColor.value];
  const z = (id: string) => layer(id).props.data.attributes.getPosition.value[2];
  return { manager, layer, colors, z };
}

describe('per-cloud style overrides', () => {
  it('applies overrides to one cloud and leaves the others on the manager-wide style', () => {
    const { manager, layer, colors, z } = setup({ colorScheme: 'elevation' });
    manager.addPointCloud('a', cloud([0, 10]));
    manager.addPointCloud('b', cloud([0, 10]), {
      colorScheme: 'intensity',
      pointSize: 5,
      zOffset: 3,
    });

    expect(layer('a').props.pointSize).toBe(2);
    expect(z('a')).toBe(0);
    expect(layer('b').props.pointSize).toBe(5);
    expect(z('b')).toBe(3);
    // Intensity runs opposite to elevation, so the two schemes color differently.
    expect(colors('b')).not.toEqual(colors('a'));
  });

  it('keeps an override through manager-wide changes, and follows the rest', () => {
    const { manager, layer, z } = setup();
    manager.addPointCloud('a', cloud([0, 1]), { pointSize: 7 });
    manager.setPointSize(4);
    manager.setZOffset(2);
    expect(layer('a').props.pointSize).toBe(7);
    expect(z('a')).toBe(2);
  });

  it('keeps an override colorScheme when the manager-wide scheme changes', () => {
    const { manager, colors } = setup({ colorScheme: 'elevation' });
    manager.addPointCloud('a', cloud([0, 10]), { colorScheme: 'intensity' });
    const before = colors('a');
    manager.setColorScheme('classification');
    expect(colors('a')).toEqual(before);
  });

  it('sets, replaces and clears overrides at runtime', () => {
    const { manager, layer, colors, z } = setup({ colorScheme: 'elevation' });
    manager.addPointCloud('a', cloud([0, 10]));
    const followed = colors('a');

    manager.setPointCloudStyle('a', { colorScheme: 'intensity', zOffset: 1 });
    expect(manager.getPointCloudStyle('a')).toEqual({ colorScheme: 'intensity', zOffset: 1 });
    expect(z('a')).toBe(1);

    // Replacing (not merging): zOffset falls back to the manager-wide 0.
    manager.setPointCloudStyle('a', { pointSize: 9 });
    expect(manager.getPointCloudStyle('a')).toEqual({ pointSize: 9 });
    expect(z('a')).toBe(0);
    expect(layer('a').props.pointSize).toBe(9);
    expect(colors('a')).toEqual(followed);

    manager.setPointCloudStyle('a', null);
    expect(manager.getPointCloudStyle('a')).toEqual({});
    expect(layer('a').props.pointSize).toBe(2);
  });

  it('treats undefined fields as not overridden', () => {
    const { manager, layer } = setup();
    const style: PointCloudStyleOverride = { pointSize: undefined };
    manager.addPointCloud('a', cloud([0, 1]), style);
    expect(manager.getPointCloudStyle('a')).toEqual({});
    expect(layer('a').props.pointSize).toBe(2);
  });

  it('keeps overrides when streamed data replaces the cloud', () => {
    const { manager, layer, colors, z } = setup({ colorScheme: 'elevation' });
    manager.addPointCloud('a', cloud([0, 1]), { colorScheme: 'intensity', pointSize: 6, zOffset: 4 });
    manager.addPointCloud('b', cloud([0, 1]));
    manager.updatePointCloud('a', cloud([0, 1, 2]));
    manager.updatePointCloud('b', cloud([0, 1, 2]));
    expect(colors('a')).not.toEqual(colors('b'));
    expect(layer('a').props.pointSize).toBe(6);
    expect(z('a')).toBe(4);
  });

  it('reports colorbar bounds only from clouds on the manager-wide colors', () => {
    const { manager } = setup({ colorScheme: 'elevation', usePercentile: false });
    manager.addPointCloud('a', cloud([0, 10]));
    const bounds = manager.getLastComputedBounds();
    manager.addPointCloud('b', cloud([100, 200]), { colorScheme: 'elevation', colormap: 'plasma' });
    expect(manager.getLastComputedBounds()).toEqual(bounds);
  });

  it('falls back to a remaining cloud for the bounds when the source gets a color override', () => {
    const { manager } = setup({ colorScheme: 'elevation', usePercentile: false });
    manager.addPointCloud('a', cloud([0, 10]));
    const boundsA = manager.getLastComputedBounds();
    manager.addPointCloud('b', cloud([100, 200]));
    expect(manager.getLastComputedBounds()).not.toEqual(boundsA);

    manager.setPointCloudStyle('b', { colormap: 'plasma' });
    expect(manager.getLastComputedBounds()).toEqual(boundsA);

    manager.setPointCloudStyle('a', { colormap: 'plasma' });
    expect(manager.getLastComputedBounds()).toBeUndefined();
  });

  it('falls back to a remaining cloud for the bounds when the source is removed', () => {
    const { manager } = setup({ colorScheme: 'elevation', usePercentile: false });
    manager.addPointCloud('a', cloud([0, 10]));
    const boundsA = manager.getLastComputedBounds();
    manager.addPointCloud('b', cloud([100, 200]));

    manager.removePointCloud('b');
    expect(manager.getLastComputedBounds()).toEqual(boundsA);

    manager.clear();
    expect(manager.getLastComputedBounds()).toBeUndefined();
  });

  it('does not share nested color settings with callers', () => {
    const { manager, colors } = setup({ colorScheme: 'elevation' });
    const colorRange = absoluteRange();
    manager.addPointCloud('a', cloud([0, 5, 10]), { colorRange });
    const before = colors('a');

    colorRange.absoluteMax = 100;
    expect(manager.getPointCloudStyle('a')?.colorRange?.absoluteMax).toBe(10);
    manager.getPointCloudStyle('a')!.colorRange!.absoluteMax = 100;
    expect(manager.getPointCloudStyle('a')?.colorRange?.absoluteMax).toBe(10);

    // Passing the edited range back is a real change, so the cloud recolors.
    manager.setPointCloudStyle('a', { colorRange });
    expect(colors('a')).not.toEqual(before);
  });

  it('reuses colors when the color settings are equal by value', () => {
    const { manager } = setup({ colorScheme: 'elevation' });
    manager.addPointCloud('a', cloud([0, 5, 10]), { colorRange: absoluteRange() });
    const compute = vi.spyOn(ColorSchemeProcessor.prototype, 'getColorsWithBounds');
    manager.setPointCloudStyle('a', { colorRange: absoluteRange(), pointSize: 4 });
    expect(compute).not.toHaveBeenCalled();
    compute.mockRestore();
  });

  it('ignores unknown ids', () => {
    const { manager } = setup();
    expect(() => manager.setPointCloudStyle('missing', { pointSize: 3 })).not.toThrow();
    expect(manager.getPointCloudStyle('missing')).toBeUndefined();
  });
});
