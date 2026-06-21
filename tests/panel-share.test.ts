import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LidarState } from '../src/lib/core/types';
import { PanelBuilder, type PanelBuilderCallbacks } from '../src/lib/gui/PanelBuilder';

function createState(): LidarState {
  return {
    collapsed: false,
    panelWidth: 365,
    maxHeight: 500,
    pointClouds: [],
    activePointCloudId: null,
    pointSize: 2,
    opacity: 1,
    colorScheme: 'elevation',
    colormap: 'viridis',
    colorRange: {
      mode: 'percentile',
      percentileLow: 2,
      percentileHigh: 98,
    },
    showColorbar: true,
    usePercentile: true,
    elevationRange: null,
    pointBudget: 1000000,
    pickable: false,
    loading: false,
    error: null,
    zOffsetEnabled: false,
    zOffset: 0,
    hiddenClassifications: new Set(),
    availableClassifications: new Set(),
    terrainEnabled: false,
  };
}

function createCallbacks(overrides: Partial<PanelBuilderCallbacks> = {}): PanelBuilderCallbacks {
  return {
    onFileSelect: vi.fn(),
    onUrlSubmit: vi.fn(),
    onPointSizeChange: vi.fn(),
    onOpacityChange: vi.fn(),
    onColorSchemeChange: vi.fn(),
    onColormapChange: vi.fn(),
    onColorRangeChange: vi.fn(),
    onUsePercentileChange: vi.fn(),
    onElevationRangeChange: vi.fn(),
    onPickableChange: vi.fn(),
    onZOffsetEnabledChange: vi.fn(),
    onZOffsetChange: vi.fn(),
    onTerrainChange: vi.fn(),
    onUnload: vi.fn(),
    onZoomTo: vi.fn(),
    onClassificationToggle: vi.fn(),
    onClassificationShowAll: vi.fn(),
    onClassificationHideAll: vi.fn(),
    ...overrides,
  };
}

describe('PanelBuilder share URL button', () => {
  beforeEach(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      value: vi.fn(() => ({
        createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
        fillRect: vi.fn(),
        fillStyle: '',
      })),
      configurable: true,
    });
  });

  it('copies the share URL and shows success feedback', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    const onShareUrl = vi.fn(() => 'https://example.com/viewer?lidar=abc');
    const panel = new PanelBuilder(createCallbacks({ onShareUrl }), createState()).build();
    const button = panel.querySelector('.lidar-share-button') as HTMLButtonElement;

    button.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(onShareUrl).toHaveBeenCalledTimes(1);
    expect(writeText).toHaveBeenCalledWith('https://example.com/viewer?lidar=abc');
    expect(panel.querySelector('.lidar-share-status')?.textContent).toBe('Copied');
  });

  it('shows failure feedback when clipboard copy fails', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      configurable: true,
    });

    const panel = new PanelBuilder(
      createCallbacks({ onShareUrl: () => 'https://example.com/viewer?lidar=abc' }),
      createState()
    ).build();
    const button = panel.querySelector('.lidar-share-button') as HTMLButtonElement;

    button.click();
    await Promise.resolve();
    await Promise.resolve();

    expect(panel.querySelector('.lidar-share-status')?.textContent).toBe('Copy failed');
  });
});

describe('PanelBuilder sample-data dropdown', () => {
  beforeEach(() => {
    Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
      value: vi.fn(() => ({
        createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
        fillRect: vi.fn(),
        fillStyle: '',
      })),
      configurable: true,
    });
  });

  it('renders no dropdown when no samples are configured', () => {
    const panel = new PanelBuilder(createCallbacks(), createState()).build();
    expect(panel.querySelector('.lidar-sample-menu')).toBeNull();
  });

  it('renders a dropdown that fills the URL input on selection', () => {
    const panel = new PanelBuilder(createCallbacks(), createState(), {
      sampleData: [
        { label: 'Autzen', url: 'https://example.com/autzen.copc.laz' },
        { label: 'Montreal', url: 'https://example.com/montreal.copc.laz' },
      ],
    }).build();

    const trigger = panel.querySelector('.lidar-sample-trigger') as HTMLButtonElement;
    expect(
      trigger.querySelector('.lidar-sample-trigger-label')?.textContent,
    ).toBe('Load sample data...');
    const urlInput = panel.querySelector('.lidar-control-input') as HTMLInputElement;
    expect(urlInput.value).toBe('');

    const options = [...panel.querySelectorAll('.lidar-sample-option')];
    expect(options.map((o) => o.textContent)).toEqual(['Autzen', 'Montreal']);

    (options[1] as HTMLButtonElement).click();
    expect(urlInput.value).toBe('https://example.com/montreal.copc.laz');
  });
});
