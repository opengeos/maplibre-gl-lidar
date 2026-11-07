import { afterEach, describe, expect, it, vi } from 'vitest';
import { Copc } from 'copc';
import {
  CopcStreamingLoader,
  EptStreamingLoader,
  LidarControl,
} from '../src/index';

type ControlInternals = { _map?: unknown };
type LoaderInternals = {
  _performLayerUpdate: () => void;
  _loadNode: (node: Record<string, unknown>) => Promise<void>;
  _extractPointData: () => Promise<void>;
  _source: unknown;
  _copc: unknown;
  _lazPerf: unknown;
};

const initResult = {
  bounds: { minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 1, maxZ: 1 },
  totalPoints: 10,
  hasRGB: false,
  spacing: 1,
};

/**
 * A control that is "on a map" until its loader's initialize() runs, which
 * removes it, like a host unmounting while the first request is in flight.
 */
function removeDuringInitialize(
  loader: typeof CopcStreamingLoader | typeof EptStreamingLoader
) {
  const control = new LidarControl();
  const internals = control as unknown as ControlInternals;
  internals._map = {};
  vi.spyOn(loader.prototype, 'initialize').mockImplementation(async () => {
    internals._map = undefined;
    return initResult as Awaited<ReturnType<CopcStreamingLoader['initialize']>>;
  });
  const destroy = vi.spyOn(loader.prototype, 'destroy');
  const loadError = vi.fn();
  control.on('loaderror', loadError);
  return { control, destroy, loadError };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('streaming load after the control is removed', () => {
  it('aborts a COPC load without reporting a load error', async () => {
    const { control, destroy, loadError } =
      removeDuringInitialize(CopcStreamingLoader);

    await expect(
      control.loadPointCloudStreaming('https://example.com/a.copc.laz')
    ).rejects.toMatchObject({ name: 'AbortError' });

    expect(destroy).toHaveBeenCalled();
    expect(loadError).not.toHaveBeenCalled();
    expect(control.getState().error).toBeNull();
  });

  it('aborts an EPT load without reporting a load error', async () => {
    const { control, destroy, loadError } =
      removeDuringInitialize(EptStreamingLoader);

    await expect(
      control.loadPointCloudEptStreaming('https://example.com/ept.json')
    ).rejects.toMatchObject({ name: 'AbortError' });

    expect(destroy).toHaveBeenCalled();
    expect(loadError).not.toHaveBeenCalled();
    expect(control.getState().error).toBeNull();
  });
});

describe.each([
  ['CopcStreamingLoader', () => new CopcStreamingLoader('https://example.com/a.copc.laz')],
  ['EptStreamingLoader', () => new EptStreamingLoader('https://example.com/ept.json')],
])('%s.destroy()', (_name, create) => {
  it('drops the points-loaded callback so a late fetch is a no-op', () => {
    const loader = create();
    const onPointsLoaded = vi.fn();
    loader.setOnPointsLoaded(onPointsLoaded);

    loader.destroy();
    (loader as unknown as LoaderInternals)._performLayerUpdate();

    expect(onPointsLoaded).not.toHaveBeenCalled();
  });
});

describe('streaming load abort while the control stays mounted', () => {
  it('reports a COPC fetch abort as a load failure', async () => {
    const control = new LidarControl();
    (control as unknown as ControlInternals)._map = {};
    const abort = new Error('The user aborted a request.');
    abort.name = 'AbortError';
    vi.spyOn(CopcStreamingLoader.prototype, 'initialize').mockRejectedValue(abort);
    const loadError = vi.fn();
    control.on('loaderror', loadError);

    await expect(
      control.loadPointCloudStreaming(new ArrayBuffer(8))
    ).rejects.toBe(abort);

    expect(loadError).toHaveBeenCalledTimes(1);
    expect(control.getState().loading).toBe(false);
    expect(control.getState().error).toContain('aborted');
  });
  it('reports an EPT fetch abort as a load failure', async () => {
    const control = new LidarControl();
    (control as unknown as ControlInternals)._map = {};
    const abort = new Error('The user aborted a request.');
    abort.name = 'AbortError';
    vi.spyOn(EptStreamingLoader.prototype, 'initialize').mockRejectedValue(abort);
    const loadError = vi.fn();
    control.on('loaderror', loadError);

    await expect(
      control.loadPointCloudEptStreaming('https://example.com/ept.json')
    ).rejects.toBe(abort);

    expect(loadError).toHaveBeenCalledTimes(1);
    expect(control.getState().loading).toBe(false);
    expect(control.getState().error).toContain('aborted');
  });
});

describe('CopcStreamingLoader node load finishing after destroy()', () => {
  it('does not extract into released buffers or report an error', async () => {
    const loader = new CopcStreamingLoader('https://example.com/a.copc.laz');
    const internals = loader as unknown as LoaderInternals;
    internals._source = 'https://example.com/a.copc.laz';
    internals._copc = {};
    internals._lazPerf = {};
    let resolveView: (view: unknown) => void = () => {};
    vi.spyOn(Copc, 'loadPointDataView').mockReturnValue(
      new Promise((resolve) => {
        resolveView = resolve;
      }) as ReturnType<typeof Copc.loadPointDataView>
    );
    const extract = vi.spyOn(internals, '_extractPointData');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const pending = internals._loadNode({
      key: '0-0-0-0',
      state: 'pending',
      pointCount: 4,
      pointDataOffset: 0,
      pointDataLength: 16,
    });
    loader.destroy();
    resolveView({ dimensions: {} });
    await pending;

    expect(extract).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('CopcStreamingLoader.loadRegion interrupted by destroy()', () => {
  it('rejects instead of reporting the region as loaded', async () => {
    const loader = new CopcStreamingLoader('https://example.com/a.copc.laz');
    const internals = loader as unknown as Record<string, unknown>;
    internals._isInitialized = true;
    internals._loadedHierarchyKeys = new Set(['0-0-0-0']);
    (internals._options as { pointBudget: number }).pointBudget = 10;
    internals._positions = new Float32Array(30);
    internals._intensities = new Float32Array(10);
    internals._classifications = new Uint8Array(10);
    (internals._nodeCache as Map<string, unknown>).set('0-0-0-0', {
      key: '0-0-0-0',
      keyArray: [0, 0, 0, 0],
      state: 'pending',
      pointCount: 4,
      boundsWgs84: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    });
    internals._loadNode = async () => {
      loader.destroy();
    };

    await expect(
      loader.loadRegion([0, 0, 1, 1])
    ).rejects.toMatchObject({ name: 'AbortError' });
  });
});
