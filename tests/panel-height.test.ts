import { describe, expect, it } from 'vitest';
import { LidarControl } from '../src/lib/core/LidarControl';

type ControlInternals = {
  _container: HTMLElement;
  _panel: HTMLElement;
  _mapContainer: HTMLElement;
  _userPanelWidth: number | null;
  _userPanelHeight: number | null;
  _updatePanelPosition(): void;
  _addResizeHandles(panel: HTMLElement): void;
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

describe('LidarControl bottom-corner resize handles', () => {
  /** Simulates a pointer drag on a handle from one screen point to another. */
  function dragHandle(
    handle: HTMLElement,
    from: { x: number; y: number },
    to: { x: number; y: number }
  ) {
    const make = (type: string, x: number, y: number) =>
      new MouseEvent(type, { bubbles: true, clientX: x, clientY: y }) as unknown as PointerEvent;
    handle.dispatchEvent(make('pointerdown', from.x, from.y));
    handle.dispatchEvent(make('pointermove', to.x, to.y));
    handle.dispatchEvent(make('pointerup', to.x, to.y));
  }

  it('creates exactly two handles, one in each bottom corner', () => {
    const { panel, internals } = setupControl();
    internals._addResizeHandles(panel);

    const handles = panel.querySelectorAll('.lidar-control-resize-handle');
    expect(handles.length).toBe(2);
    expect(panel.querySelector('.lidar-control-resize-left')).not.toBeNull();
    expect(panel.querySelector('.lidar-control-resize-right')).not.toBeNull();
    // The legacy single adaptive handle (corner-* classes) is gone.
    expect(panel.querySelector('.corner-bottom-left')).toBeNull();
    expect(panel.querySelector('.corner-bottom-right')).toBeNull();
  });

  it('grows and shrinks the panel when dragging the bottom-right handle', () => {
    const { panel, internals } = setupControl();
    internals._addResizeHandles(panel);
    // Panel near the top-left of the map so there is room to grow rightward:
    // 300px wide, 200px tall.
    panel.getBoundingClientRect = () =>
      ({ top: 45, bottom: 245, left: 50, right: 350, width: 300, height: 200 }) as DOMRect;
    const right = panel.querySelector('.lidar-control-resize-right') as HTMLElement;

    // Drag down-right: the panel grows wider and taller.
    dragHandle(right, { x: 350, y: 245 }, { x: 500, y: 400 });
    expect(internals._userPanelWidth).toBeGreaterThan(300);
    expect(internals._userPanelHeight).toBeGreaterThan(200);

    // Drag back up-left from the new bottom-right corner: it shrinks again.
    panel.getBoundingClientRect = () =>
      ({ top: 45, bottom: 400, left: 50, right: 500, width: 450, height: 355 }) as DOMRect;
    dragHandle(right, { x: 500, y: 400 }, { x: 250, y: 100 });
    expect(internals._userPanelWidth).toBeLessThan(450);
    expect(internals._userPanelHeight).toBeLessThan(355);
  });

  it('grows the panel leftward when dragging the bottom-left handle', () => {
    const { panel, internals } = setupControl();
    internals._addResizeHandles(panel);
    panel.getBoundingClientRect = () =>
      ({ top: 45, bottom: 245, left: 630, right: 995, width: 365, height: 200 }) as DOMRect;
    const left = panel.querySelector('.lidar-control-resize-left') as HTMLElement;

    // Dragging the bottom-left handle leftward widens the panel.
    dragHandle(left, { x: 630, y: 245 }, { x: 400, y: 400 });
    expect(internals._userPanelWidth).toBeGreaterThan(365);
    expect(internals._userPanelHeight).toBeGreaterThan(200);
  });
});
