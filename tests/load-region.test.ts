import { describe, expect, it } from 'vitest';
import { CopcStreamingLoader } from '../src/index';

type TestNode = {
  key: string;
  keyArray: [number, number, number, number];
  state: string;
  pointCount: number;
  bufferStartIndex?: number;
  boundsWgs84: { minX: number; minY: number; maxX: number; maxY: number };
};

type Internals = {
  _isInitialized: boolean;
  _loadedHierarchyKeys: Set<string>;
  _nodeCache: Map<string, TestNode>;
  _options: { pointBudget: number; maxConcurrentRequests: number };
  _positions: Float32Array;
  _intensities: Float32Array;
  _classifications: Uint8Array;
  _totalLoadedPoints: number;
  _loadingQueue: TestNode[];
  _loadNode: (node: TestNode) => Promise<void>;
};

/** A node covering `[x0, x1] x [0, 1]` degrees at `depth`. */
function node(key: string, x0: number, x1: number, pointCount: number): TestNode {
  const depth = Number(key.split('-')[0]);
  return {
    key,
    keyArray: [depth, 0, 0, 0],
    state: 'pending',
    pointCount,
    boundsWgs84: { minX: x0, minY: 0, maxX: x1, maxY: 1 },
  };
}

/** A loader with an in-memory hierarchy whose node loads append to the buffers. */
function setup(budget: number, nodes: TestNode[]) {
  const loader = new CopcStreamingLoader('https://example.com/a.copc.laz');
  const internals = loader as unknown as Internals;
  internals._isInitialized = true;
  internals._loadedHierarchyKeys = new Set(['0-0-0-0']);
  internals._options.pointBudget = budget;
  internals._positions = new Float32Array(budget * 3);
  internals._intensities = new Float32Array(budget);
  internals._classifications = new Uint8Array(budget);
  for (const entry of nodes) internals._nodeCache.set(entry.key, entry);
  const loaded: string[] = [];
  internals._loadNode = async (entry) => {
    entry.bufferStartIndex = internals._totalLoadedPoints;
    internals._totalLoadedPoints += entry.pointCount;
    // Tag the node's points so compaction can be checked.
    internals._classifications.fill(
      Number(entry.key.split('-')[1]) + 1,
      entry.bufferStartIndex,
      entry.bufferStartIndex + entry.pointCount
    );
    entry.state = 'loaded';
    loaded.push(entry.key);
  };
  return { loader, internals, loaded };
}

describe('CopcStreamingLoader.loadRegion', () => {
  it('loads every intersecting node at every depth and pins them', async () => {
    const { loader, internals, loaded } = setup(100, [
      node('0-0-0-0', 0, 10, 5),
      node('1-0-0-0', 0, 5, 5),
      node('1-1-0-0', 5, 10, 5),
      node('5-0-0-0', 1, 1.1, 4),
      node('5-9-0-0', 9, 9.1, 4),
    ]);
    const result = await loader.loadRegion([0.5, 0, 2, 1]);
    expect(result).toEqual({ nodes: 3, points: 14 });
    expect(loaded.sort()).toEqual(['0-0-0-0', '1-0-0-0', '5-0-0-0']);
    expect(loader.hasPinnedRegion()).toBe(true);

    // Viewport eviction keeps the pinned nodes, even outside the view.
    const viewport = { bounds: [8, 0, 10, 1], center: [9, 0.5] } as Parameters<
      typeof loader.evictLoadedNodesOutsideViewport
    >[0];
    expect(loader.evictLoadedNodesOutsideViewport(viewport)).toBe(true);
    expect(internals._nodeCache.get('5-0-0-0')!.state).toBe('loaded');
    loader.clearPinnedRegion();
    loader.evictLoadedNodesOutsideViewport(viewport);
    expect(internals._nodeCache.get('5-0-0-0')!.state).toBe('pending');
  });

  it('refuses a region larger than the cap', async () => {
    const { loader, loaded } = setup(100, [node('0-0-0-0', 0, 10, 60), node('1-0-0-0', 0, 5, 30)]);
    await expect(loader.loadRegion([0, 0, 1, 1], { maxPoints: 50 })).rejects.toThrow(/90 points/);
    expect(loaded).toEqual([]);
    expect(loader.hasPinnedRegion()).toBe(false);
  });

  it('evicts nodes outside the region to make room, compacting the buffers', async () => {
    const { loader, internals } = setup(10, [
      node('1-0-0-0', 0, 1, 4),
      node('1-1-0-0', 5, 6, 4),
      node('2-2-0-0', 0, 0.5, 4),
    ]);
    // Two nodes are already loaded; the region needs 4 more, which do not fit.
    await (internals._loadNode as (n: TestNode) => Promise<void>)(internals._nodeCache.get('1-1-0-0')!);
    await (internals._loadNode as (n: TestNode) => Promise<void>)(internals._nodeCache.get('1-0-0-0')!);
    expect(internals._totalLoadedPoints).toBe(8);
    await loader.loadRegion([0, 0, 1, 1]);
    expect(internals._nodeCache.get('1-1-0-0')!.state).toBe('pending');
    // The kept node moved to the front; the new one follows it.
    expect(internals._nodeCache.get('1-0-0-0')!.bufferStartIndex).toBe(0);
    expect([...internals._classifications.subarray(0, 4)]).toEqual([1, 1, 1, 1]);
    expect(internals._nodeCache.get('2-2-0-0')!.bufferStartIndex).toBe(4);
    expect(internals._totalLoadedPoints).toBe(8);
  });

  it('never moves loaded points while paused, and says why it cannot fit', async () => {
    const { loader, internals } = setup(10, [node('1-0-0-0', 0, 1, 4), node('1-1-0-0', 5, 6, 8)]);
    await (internals._loadNode as (n: TestNode) => Promise<void>)(internals._nodeCache.get('1-1-0-0')!);
    loader.setPaused(true);
    await expect(loader.loadRegion([0, 0, 1, 1])).rejects.toThrow(/while streaming is paused/);
    expect(internals._nodeCache.get('1-1-0-0')!.bufferStartIndex).toBe(0);
    // A region that fits loads while paused (points are only appended).
    internals._nodeCache.get('1-0-0-0')!.pointCount = 2;
    await loader.loadRegion([0, 0, 1, 1]);
    expect(internals._nodeCache.get('1-0-0-0')!.bufferStartIndex).toBe(8);
  });

  it('holds back viewport nodes until the region has loaded', async () => {
    const { loader, internals, loaded } = setup(100, [node('1-0-0-0', 0, 1, 4)]);
    const queued = node('1-5-0-0', 50, 51, 4);
    internals._nodeCache.set(queued.key, queued);
    let release!: () => void;
    const original = internals._loadNode;
    internals._loadNode = async (entry) => {
      if (entry.key === '1-0-0-0') await new Promise<void>((resolve) => (release = resolve));
      await original(entry);
    };
    const region = loader.loadRegion([0, 0, 1, 1]);
    await new Promise((resolve) => setTimeout(resolve, 0));
    internals._loadingQueue = [queued];
    await loader.loadQueuedNodes();
    expect(loaded).toEqual([]);
    release();
    await region;
    expect(loaded[0]).toBe('1-0-0-0');
  });
});
