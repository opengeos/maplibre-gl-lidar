import { describe, expect, it } from 'vitest';
import { LidarControl } from '../src/lib/core/LidarControl';

type ControlInternals = {
  _container: HTMLElement;
  _panel: HTMLElement;
  _mapContainer: HTMLElement;
  _userPanelHeight: number | null;
  _updatePanelPosition(): void;
};

/**
 * Builds the minimal DOM that the panel-position logic reads, with controllable
 * bounding rectangles, and wires it onto a freshly constructed control without
 * going through `onAdd` (which needs a real map).
 */
function setupControl(options?: ConstructorParameters<typeof LidarControl>[0]) {
  const control = new LidarControl(options);
  const internals = control as unknown as ControlInternals;

  const mapContainer = document.createElement('div');
  const ctrlGroup = document.createElement('div');
  ctrlGroup.className = 'maplibregl-ctrl-top-right';
  const container = document.createElement('div');
  const button = document.createElement('button');
  button.className = 'lidar-control-toggle';
  container.appendChild(button);
  ctrlGroup.appendChild(container);
  mapContainer.appendChild(ctrlGroup);

  const panel = document.createElement('div');
  mapContainer.appendChild(panel);

  mapContainer.getBoundingClientRect = () =>
    ({ top: 0, bottom: 800, left: 0, right: 1000, width: 1000, height: 800 }) as DOMRect;
  button.getBoundingClientRect = () =>
    ({ top: 10, bottom: 40, left: 950, right: 990, width: 40, height: 30 }) as DOMRect;

  internals._container = container;
  internals._panel = panel;
  internals._mapContainer = mapContainer;

  return { panel, internals };
}

describe('LidarControl panel height sizing', () => {
  it('sizes to content by default (no explicit inline height)', () => {
    const { panel, internals } = setupControl();
    internals._updatePanelPosition();
    // The panel may grow up to the available space, so maxHeight is capped,
    // but no explicit height is forced so it stays content-sized and reducible.
    expect(panel.style.maxHeight).not.toBe('');
    expect(panel.style.height).toBe('');
  });

  it('caps to content up to the maxHeight when the caller sets it', () => {
    const { panel, internals } = setupControl({ maxHeight: 300 });
    internals._updatePanelPosition();
    expect(panel.style.maxHeight).toBe('300px');
    expect(panel.style.height).toBe('');
  });
});

describe('LidarControl resize handle reducibility', () => {
  it('applies a user-dragged height clamped to the minimum, allowing shrink and grow', () => {
    const { panel, internals } = setupControl();

    // A tiny dragged height shrinks the panel; below the minimum it clamps.
    internals._userPanelHeight = 10;
    internals._updatePanelPosition();
    expect(panel.style.height).toBe('160px');

    // A larger dragged height grows the panel.
    internals._userPanelHeight = 400;
    internals._updatePanelPosition();
    expect(panel.style.height).toBe('400px');
  });
});
