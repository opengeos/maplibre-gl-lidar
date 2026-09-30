import { describe, expect, it, vi } from 'vitest';
import type { PointCloudData } from '../src/index';
import { getClassificationColor, getClassificationName, PointCloudManager } from '../src/index';
import { ClassificationLegend } from '../src/lib/gui/ClassificationLegend';
import type { DeckOverlay } from '../src/lib/core/DeckOverlay';

vi.mock('@deck.gl/maplibre', () => ({ MapLibreOverlay: class {} }));

function cloud(classes: number[]): PointCloudData {
  return {
    positions: new Float32Array(classes.length * 3),
    coordinateOrigin: [0, 0, 0],
    classifications: Uint8Array.from(classes),
    pointCount: classes.length,
    bounds: { minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 1, maxZ: 1 },
    hasRGB: false,
    hasIntensity: false,
    hasClassification: true,
  };
}

describe('classification styles', () => {
  const styles = { 64: { name: 'Car', color: [10, 20, 30] as [number, number, number] } };

  it('resolves custom names and colours, falling back to ASPRS', () => {
    expect(getClassificationName(64, styles)).toBe('Car');
    expect(getClassificationColor(64, styles)).toEqual([10, 20, 30]);
    expect(getClassificationName(2, styles)).toBe('Ground');
    expect(getClassificationColor(2, styles)).toEqual([165, 113, 78]);
    expect(getClassificationName(65)).toBe('Class 65');
  });

  it('recolours points when styles change', () => {
    const layers = new Map<string, { props: { data: { attributes: { getColor: { value: Uint8Array } } } } }>();
    const overlay = {
      addLayer: (id: string, layer: never) => layers.set(id, layer),
      removeLayer: (id: string) => layers.delete(id),
    } as unknown as DeckOverlay;
    const manager = new PointCloudManager(overlay, { colorScheme: 'classification' });
    manager.addPointCloud('a', cloud([64]));
    const colorOf = () => [...layers.get('pointcloud-a-chunk0')!.props.data.attributes.getColor.value.subarray(0, 3)];
    expect(colorOf()).toEqual([128, 128, 128]);
    manager.updateStyle({ classificationStyles: styles });
    expect(colorOf()).toEqual([10, 20, 30]);
  });

  it('shows custom names and swatches in the legend', () => {
    const legend = new ClassificationLegend({
      classifications: [64],
      hiddenClassifications: new Set(),
      onToggle: () => {},
      onShowAll: () => {},
      onHideAll: () => {},
      styles,
    });
    const element = legend.render();
    expect(element.textContent).toContain('Car');
    const swatch = element.querySelector('.lidar-classification-swatch') as HTMLElement;
    expect(swatch.style.backgroundColor).toBe('rgb(10, 20, 30)');
  });
});

describe('classification styles on the control', () => {
  it('keeps styles set before onAdd, emits stylechange, and hands out copies', async () => {
    const { LidarControl } = await import('../src/index');
    const control = new LidarControl({});
    const events: string[] = [];
    control.on('stylechange', () => events.push('stylechange'));
    control.setClassificationStyles({ 64: { name: 'Car', color: [1, 2, 3] } });
    expect(events).toEqual(['stylechange']);
    const copy = control.getClassificationStyles();
    copy[64].color![0] = 99;
    copy[64].name = 'Changed';
    expect(control.getClassificationStyles()).toEqual({ 64: { name: 'Car', color: [1, 2, 3] } });
    expect(control.getState().classificationStyles).toEqual({ 64: { name: 'Car', color: [1, 2, 3] } });
  });

  it('colours newly added clouds with styles given to the manager constructor', () => {
    const layers = new Map<string, { props: { data: { attributes: { getColor: { value: Uint8Array } } } } }>();
    const overlay = {
      addLayer: (id: string, layer: never) => layers.set(id, layer),
      removeLayer: (id: string) => layers.delete(id),
    } as unknown as DeckOverlay;
    const manager = new PointCloudManager(overlay, {
      colorScheme: 'classification',
      classificationStyles: { 64: { color: [10, 20, 30] } },
    });
    manager.addPointCloud('a', cloud([64]));
    const value = layers.get('pointcloud-a-chunk0')!.props.data.attributes.getColor.value;
    expect([...value.subarray(0, 3)]).toEqual([10, 20, 30]);
  });
});
