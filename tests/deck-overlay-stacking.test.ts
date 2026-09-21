import { describe, expect, it, vi } from 'vitest';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { DECK_CANVAS_CLASS, DeckOverlay } from '../src/lib/core/DeckOverlay';

vi.mock('@deck.gl/maplibre', () => {
  class MapLibreOverlay {
    onAdd(): HTMLDivElement {
      return document.createElement('div');
    }
    onRemove(): void {}
    setProps(): void {}
  }
  return { MapLibreOverlay };
});

/**
 * Builds the DOM MapLibre puts around a map, plus a map stub whose `addControl`
 * behaves like MapLibre's: it calls `onAdd` and appends the returned element to
 * a corner of the control container.
 */
function setupMap() {
  const root = document.createElement('div');
  root.className = 'maplibregl-map';

  const canvasContainer = document.createElement('div');
  canvasContainer.className = 'maplibregl-canvas-container';
  const canvas = document.createElement('canvas');
  canvas.className = 'maplibregl-canvas';
  canvasContainer.appendChild(canvas);

  const controlContainer = document.createElement('div');
  controlContainer.className = 'maplibregl-control-container';
  const topLeft = document.createElement('div');
  topLeft.className = 'maplibregl-ctrl-top-left';
  controlContainer.appendChild(topLeft);

  root.appendChild(canvasContainer);
  root.appendChild(controlContainer);
  document.body.appendChild(root);

  const map = {
    addControl(control: { onAdd(map: unknown): HTMLElement }) {
      topLeft.appendChild(control.onAdd(map));
      return map;
    },
    removeControl(control: { onRemove(map: unknown): void }) {
      control.onRemove(map);
      return map;
    },
    getCanvas: () => canvas,
    getCanvasContainer: () => canvasContainer,
    triggerRepaint: () => {},
  };

  return { map: map as unknown as MapLibreMap, canvas, canvasContainer, topLeft };
}

describe('DeckOverlay canvas stacking', () => {
  it('moves the deck canvas out of the control container, just after the map canvas', () => {
    const { map, canvas, canvasContainer, topLeft } = setupMap();

    const overlay = new DeckOverlay(map);

    expect(topLeft.children).toHaveLength(0);
    const deckCanvas = canvasContainer.querySelector(`.${DECK_CANVAS_CLASS}`);
    expect(deckCanvas).not.toBeNull();
    // Directly after the base map canvas: above the basemap, below every marker
    // MapLibre appends to this container later.
    expect(canvas.nextSibling).toBe(deckCanvas);

    overlay.destroy();
    expect(canvasContainer.querySelector(`.${DECK_CANVAS_CLASS}`)).toBeNull();
  });

  it('keeps later markers above the deck canvas', () => {
    const { map, canvasContainer } = setupMap();

    new DeckOverlay(map);
    const marker = document.createElement('div');
    marker.className = 'maplibregl-marker';
    canvasContainer.appendChild(marker);

    const children = Array.from(canvasContainer.children);
    const deckCanvas = canvasContainer.querySelector(`.${DECK_CANVAS_CLASS}`)!;
    expect(children.indexOf(deckCanvas)).toBeLessThan(children.indexOf(marker));
  });
});
