import { describe, expect, it, vi } from 'vitest';
import type { PointCloudData } from '../src/index';
import { CopcStreamingLoader, PointCloudManager } from '../src/index';
import type { DeckOverlay } from '../src/lib/core/DeckOverlay';

vi.mock('@deck.gl/maplibre', () => ({ MapLibreOverlay: class {} }));

function overlayStub() {
  const layers = new Map<string, unknown>();
  return {
    layers,
    overlay: {
      addLayer: (id: string, layer: unknown) => layers.set(id, layer),
      removeLayer: (id: string) => layers.delete(id),
    } as unknown as DeckOverlay,
  };
}

function cloud(classes: number[]): PointCloudData {
  const count = classes.length;
  return {
    positions: new Float32Array(count * 3),
    coordinateOrigin: [0, 0, 0],
    classifications: Uint8Array.from(classes),
    pointCount: count,
    bounds: { minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 1, maxZ: 1 },
    hasRGB: false,
    hasIntensity: false,
    hasClassification: true,
    nodeRanges: [{ key: 'file', start: 0, count }],
  };
}

function layerColors(layers: Map<string, unknown>, id: string): Uint8Array {
  const layer = layers.get(`pointcloud-${id}-chunk0`) as {
    props: { data: { attributes: { getColor: { value: Uint8Array } } } };
  };
  return layer.props.data.attributes.getColor.value;
}

describe('PointCloudManager point editing', () => {
  it('exposes the live data and recolours after an in-place edit', () => {
    const { overlay, layers } = overlayStub();
    const manager = new PointCloudManager(overlay, { colorScheme: 'classification' });
    manager.addPointCloud('a', cloud([2, 2]));
    // Ground (2) is brown.
    expect([...layerColors(layers, 'a').subarray(0, 3)]).toEqual([165, 113, 78]);

    const data = manager.getPointCloudData('a');
    expect(data?.nodeRanges).toEqual([{ key: 'file', start: 0, count: 2 }]);
    data!.classifications![0] = 6;
    manager.refreshColors();
    // Building (6) is orange.
    expect([...layerColors(layers, 'a').subarray(0, 3)]).toEqual([255, 165, 0]);
    expect(manager.getPointCloudData('missing')).toBeNull();
  });
});

describe('CopcStreamingLoader.getLoadedNodeRanges', () => {
  it('lists only loaded nodes, ascending by buffer start', () => {
    const loader = new CopcStreamingLoader('https://example.com/a.copc.laz');
    const cache = (loader as unknown as { _nodeCache: Map<string, unknown> })._nodeCache;
    cache.set('1-0-0-0', { key: '1-0-0-0', state: 'loaded', bufferStartIndex: 10, pointCount: 5 });
    cache.set('0-0-0-0', { key: '0-0-0-0', state: 'loaded', bufferStartIndex: 0, pointCount: 10 });
    cache.set('1-1-0-0', { key: '1-1-0-0', state: 'loading', bufferStartIndex: 15, pointCount: 7 });
    cache.set('1-0-1-0', { key: '1-0-1-0', state: 'pending', pointCount: 3 });
    expect(loader.getLoadedNodeRanges()).toEqual([
      { key: '0-0-0-0', start: 0, count: 10 },
      { key: '1-0-0-0', start: 10, count: 5 },
    ]);
  });
});

describe('streaming pause', () => {
  it('stops queued node dispatch and eviction while paused', async () => {
    const loader = new CopcStreamingLoader('https://example.com/a.copc.laz');
    const internals = loader as unknown as {
      _loadingQueue: unknown[];
      _loadNode: (node: unknown) => Promise<void>;
    };
    const started: unknown[] = [];
    internals._loadNode = async (node) => {
      started.push(node);
    };
    internals._loadingQueue = [{ key: '0-0-0-0', pointCount: 1 }];
    loader.setPaused(true);
    expect(loader.isPaused()).toBe(true);
    await loader.loadQueuedNodes();
    expect(started).toHaveLength(0);
    expect(
      loader.evictLoadedNodesOutsideViewport({} as Parameters<typeof loader.evictLoadedNodesOutsideViewport>[0]),
    ).toBe(false);
    loader.setPaused(false);
    await loader.loadQueuedNodes();
    expect(started).toHaveLength(1);
  });
});

describe('DeckOverlay.getViewport', () => {
  it('relies on a _deck field the installed @deck.gl/maplibre still has', async () => {
    // getViewport reads MapLibreOverlay's private `_deck`; fail loudly on a
    // bump that renames it rather than returning null in the field.
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const overlayPath = join(process.cwd(), 'node_modules/@deck.gl/maplibre/dist/overlay.js');
    expect(readFileSync(overlayPath, 'utf8')).toMatch(/const deck = this\._deck;/);
  });
});
