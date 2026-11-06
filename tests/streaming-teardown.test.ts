import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CopcStreamingLoader,
  EptStreamingLoader,
  LidarControl,
} from '../src/index';

type ControlInternals = { _map?: unknown };
type LoaderInternals = { _performLayerUpdate: () => void };

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
