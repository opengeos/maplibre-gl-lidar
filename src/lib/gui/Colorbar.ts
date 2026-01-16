import type { ColormapName } from '../core/types';
import { COLORMAPS } from '../colorizers/Colormaps';

/**
 * Options for the Colorbar component
 */
export interface ColorbarOptions {
  /** Colormap to display */
  colormap: ColormapName;
  /** Minimum value for the colorbar */
  minValue: number;
  /** Maximum value for the colorbar */
  maxValue: number;
  /** Label for the colorbar (e.g., "Elevation (m)") */
  label?: string;
}

/**
 * A visual colorbar legend component that displays a color gradient
 * with min/max value labels.
 */
export class Colorbar {
  private _options: ColorbarOptions;
  private _canvas?: HTMLCanvasElement;
  private _minLabel?: HTMLElement;
  private _maxLabel?: HTMLElement;

  /**
   * Creates a new Colorbar instance.
   *
   * @param options - Colorbar configuration options
   */
  constructor(options: ColorbarOptions) {
    this._options = { ...options };
  }

  /**
   * Renders the colorbar component.
   *
   * @returns The colorbar container element
   */
  render(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'lidar-colorbar';

    // Optional label
    if (this._options.label) {
      const label = document.createElement('div');
      label.className = 'lidar-colorbar-label';
      label.textContent = this._options.label;
      container.appendChild(label);
    }

    // Canvas for gradient
    const canvas = document.createElement('canvas');
    canvas.className = 'lidar-colorbar-gradient';
    canvas.width = 200;
    canvas.height = 14;
    this._canvas = canvas;
    container.appendChild(canvas);

    // Labels container
    const labelsContainer = document.createElement('div');
    labelsContainer.className = 'lidar-colorbar-labels';

    const minLabel = document.createElement('span');
    minLabel.className = 'lidar-colorbar-min';
    this._minLabel = minLabel;

    const maxLabel = document.createElement('span');
    maxLabel.className = 'lidar-colorbar-max';
    this._maxLabel = maxLabel;

    labelsContainer.appendChild(minLabel);
    labelsContainer.appendChild(maxLabel);
    container.appendChild(labelsContainer);

    // Draw the gradient and update labels
    this._drawGradient();
    this._updateLabels();

    return container;
  }

  /**
   * Updates the colorbar with new options.
   *
   * @param options - Partial options to update
   */
  update(options: Partial<ColorbarOptions>): void {
    if (options.colormap !== undefined) {
      this._options.colormap = options.colormap;
    }
    if (options.minValue !== undefined) {
      this._options.minValue = options.minValue;
    }
    if (options.maxValue !== undefined) {
      this._options.maxValue = options.maxValue;
    }
    if (options.label !== undefined) {
      this._options.label = options.label;
    }

    this._drawGradient();
    this._updateLabels();
  }

  /**
   * Sets the colormap.
   *
   * @param colormap - The colormap name
   */
  setColormap(colormap: ColormapName): void {
    this._options.colormap = colormap;
    this._drawGradient();
  }

  /**
   * Sets the value range.
   *
   * @param min - Minimum value
   * @param max - Maximum value
   */
  setRange(min: number, max: number): void {
    this._options.minValue = min;
    this._options.maxValue = max;
    this._updateLabels();
  }

  /**
   * Gets the current colormap.
   *
   * @returns The current colormap name
   */
  getColormap(): ColormapName {
    return this._options.colormap;
  }

  /**
   * Gets the current value range.
   *
   * @returns Object with min and max values
   */
  getRange(): { min: number; max: number } {
    return {
      min: this._options.minValue,
      max: this._options.maxValue,
    };
  }

  /**
   * Draws the color gradient on the canvas.
   */
  private _drawGradient(): void {
    if (!this._canvas) return;

    const ctx = this._canvas.getContext('2d');
    if (!ctx) return;

    const width = this._canvas.width;
    const height = this._canvas.height;
    const ramp = COLORMAPS[this._options.colormap] || COLORMAPS.viridis;

    // Create gradient
    const gradient = ctx.createLinearGradient(0, 0, width, 0);

    // Add color stops from the ramp
    for (let i = 0; i < ramp.length; i++) {
      const t = i / (ramp.length - 1);
      const [r, g, b] = ramp[i];
      gradient.addColorStop(t, `rgb(${r}, ${g}, ${b})`);
    }

    // Fill with gradient
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  /**
   * Updates the min/max value labels.
   */
  private _updateLabels(): void {
    if (this._minLabel) {
      this._minLabel.textContent = this._formatValue(this._options.minValue);
    }
    if (this._maxLabel) {
      this._maxLabel.textContent = this._formatValue(this._options.maxValue);
    }
  }

  /**
   * Formats a value for display.
   *
   * @param value - The value to format
   * @returns Formatted string
   */
  private _formatValue(value: number): string {
    if (!Number.isFinite(value)) {
      return '—';
    }
    // Use appropriate precision based on the range
    const range = Math.abs(this._options.maxValue - this._options.minValue);
    if (range < 1) {
      return value.toFixed(3);
    } else if (range < 10) {
      return value.toFixed(2);
    } else if (range < 100) {
      return value.toFixed(1);
    } else {
      return value.toFixed(0);
    }
  }
}
