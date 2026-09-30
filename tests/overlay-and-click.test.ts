import { describe, expect, it, vi } from 'vitest';
import type { Map as MapLibreMap } from 'maplibre-gl';
import type { Layer } from '@deck.gl/core';
import { DeckOverlay, PointCloudManager } from '../src/index';
import type { PickedPointInfo, PointCloudData } from '../src/index';

const rendered: { layers: { id: string }[] } = { layers: [] };

vi.mock('@deck.gl/maplibre', () => {
  class MapLibreOverlay {
    onAdd(): HTMLDivElement {
      return document.createElement('div');
    }
    onRemove(): void {}
    setProps(props: { layers: { id: string }[] }): void {
      rendered.layers = props.layers;
    }
  }
  return { MapLibreOverlay };
});

function mapStub(): MapLibreMap {
  const canvasContainer = document.createElement('div');
  const canvas = document.createElement('canvas');
  canvasContainer.appendChild(canvas);
  return {
    addControl(control: { onAdd(map: unknown): HTMLElement }) {
      canvasContainer.appendChild(control.onAdd(this));
      return this;
    },
    removeControl() {
      return this;
    },
    getCanvas: () => canvas,
    getCanvasContainer: () => canvasContainer,
    triggerRepaint: () => {},
  } as unknown as MapLibreMap;
}

const layer = (id: string) => ({ id }) as unknown as Layer;

describe('DeckOverlay overlay layers', () => {
  it('draws overlay layers after every point cloud chunk, even chunks added later', () => {
    const overlay = new DeckOverlay(mapStub());
    overlay.addLayer('pointcloud-a-chunk0', layer('pointcloud-a-chunk0'));
    overlay.addLayer('selection', layer('selection'), { overlay: true });
    overlay.addLayer('boxes', layer('boxes'), { overlay: true });
    // A chunk that streams in afterwards still goes underneath.
    overlay.addLayer('pointcloud-a-chunk1', layer('pointcloud-a-chunk1'));
    expect(rendered.layers.map((entry) => entry.id)).toEqual([
      'pointcloud-a-chunk0',
      'pointcloud-a-chunk1',
      'selection',
      'boxes',
    ]);
    // Replacing an overlay layer keeps its place; re-adding without the flag
    // makes it an ordinary layer again.
    overlay.addLayer('selection', layer('selection'), { overlay: true });
    expect(rendered.layers.map((entry) => entry.id).slice(-2)).toEqual(['selection', 'boxes']);
    // (It keeps its original insertion slot among the ordinary layers.)
    overlay.addLayer('boxes', layer('boxes'));
    expect(rendered.layers.map((entry) => entry.id)).toEqual([
      'pointcloud-a-chunk0',
      'boxes',
      'pointcloud-a-chunk1',
      'selection',
    ]);
    overlay.removeLayer('selection');
    overlay.addLayer('selection', layer('selection'));
    expect(rendered.layers.map((entry) => entry.id).at(-1)).toBe('selection');
  });
});

describe('PointCloudManager click picking', () => {
  it('reports the clicked point with its cloud id', () => {
    const layers = new Map<string, { props: Record<string, unknown> }>();
    const overlay = {
      addLayer: (id: string, entry: { props: Record<string, unknown> }) => layers.set(id, entry),
      removeLayer: (id: string) => layers.delete(id),
    } as unknown as DeckOverlay;
    const clicks: PickedPointInfo[] = [];
    const manager = new PointCloudManager(overlay, {
      pickable: true,
      onClick: (info) => clicks.push(info),
    });
    const data: PointCloudData = {
      positions: Float32Array.from([0.001, 0.002, 10, 0.003, 0.004, 20]),
      coordinateOrigin: [-123, 44, 0],
      classifications: Uint8Array.from([2, 6]),
      pointCount: 2,
      bounds: { minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 1, maxZ: 1 },
      hasRGB: false,
      hasIntensity: false,
      hasClassification: true,
    };
    manager.addPointCloud('cloud-1', data);
    const chunk = layers.get('pointcloud-cloud-1-chunk0')!;
    const onClick = chunk.props.onClick as (info: unknown) => void;
    onClick({ index: 1, picked: true, x: 5, y: 6 });
    onClick({ index: -1, picked: false, x: 0, y: 0 });
    expect(clicks).toHaveLength(1);
    expect(clicks[0].pointCloudId).toBe('cloud-1');
    expect(clicks[0].classification).toBe(6);
    expect(clicks[0].elevation).toBe(20);
    expect(clicks[0].longitude).toBeCloseTo(-122.997, 6);
  });
});
