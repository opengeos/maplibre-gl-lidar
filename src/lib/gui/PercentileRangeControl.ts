import type { ColorRangeConfig } from '../core/types';
import { DualRangeSlider } from './DualRangeSlider';

/** Default percentile values */
const DEFAULT_PERCENTILE_LOW = 2;
const DEFAULT_PERCENTILE_HIGH = 98;

/**
 * Options for the PercentileRangeControl component
 */
export interface PercentileRangeControlOptions {
  /** Current color range configuration */
  config: ColorRangeConfig;
  /** Data bounds for reference (used in absolute mode) */
  dataBounds?: { min: number; max: number };
  /** Actual computed bounds from percentile calculation (for mode switching) */
  computedBounds?: { min: number; max: number };
  /** Callback when the configuration changes */
  onChange: (config: ColorRangeConfig) => void;
}

/**
 * A control component for configuring color range mapping.
 * Allows switching between percentile and absolute value modes.
 * Uses dual range sliders for intuitive range selection.
 */
export class PercentileRangeControl {
  private _options: PercentileRangeControlOptions;
  private _percentileRadio?: HTMLInputElement;
  private _absoluteRadio?: HTMLInputElement;
  private _percentileSliderContainer?: HTMLElement;
  private _absoluteSliderContainer?: HTMLElement;
  private _percentileSlider?: DualRangeSlider;
  private _absoluteSlider?: DualRangeSlider;
  private _computedBounds?: { min: number; max: number };

  /**
   * Creates a new PercentileRangeControl instance.
   *
   * @param options - Control configuration options
   */
  constructor(options: PercentileRangeControlOptions) {
    this._options = { ...options };
    this._computedBounds = options.computedBounds;
  }

  /**
   * Renders the control component.
   *
   * @returns The control container element
   */
  render(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'lidar-color-range';

    // Label row with Reset button
    const labelRow = document.createElement('div');
    labelRow.className = 'lidar-color-range-header';

    const label = document.createElement('div');
    label.className = 'lidar-control-label';
    label.textContent = 'Color Range';
    labelRow.appendChild(label);

    // Reset button
    const resetButton = document.createElement('button');
    resetButton.className = 'lidar-range-reset-btn';
    resetButton.textContent = 'Reset';
    resetButton.title = 'Reset to default (2-98% percentile)';
    resetButton.addEventListener('click', () => this._onReset());
    labelRow.appendChild(resetButton);

    container.appendChild(labelRow);

    // Mode toggle (radio buttons)
    const modeContainer = document.createElement('div');
    modeContainer.className = 'lidar-range-mode';

    // Percentile radio
    const percentileLabel = document.createElement('label');
    const percentileRadio = document.createElement('input');
    percentileRadio.type = 'radio';
    percentileRadio.name = 'lidar-range-mode';
    percentileRadio.value = 'percentile';
    percentileRadio.checked = this._options.config.mode === 'percentile';
    this._percentileRadio = percentileRadio;
    percentileLabel.appendChild(percentileRadio);
    percentileLabel.appendChild(document.createTextNode(' Percentile'));
    modeContainer.appendChild(percentileLabel);

    // Absolute radio
    const absoluteLabel = document.createElement('label');
    const absoluteRadio = document.createElement('input');
    absoluteRadio.type = 'radio';
    absoluteRadio.name = 'lidar-range-mode';
    absoluteRadio.value = 'absolute';
    absoluteRadio.checked = this._options.config.mode === 'absolute';
    this._absoluteRadio = absoluteRadio;
    absoluteLabel.appendChild(absoluteRadio);
    absoluteLabel.appendChild(document.createTextNode(' Absolute'));
    modeContainer.appendChild(absoluteLabel);

    container.appendChild(modeContainer);

    // Percentile slider container
    const percentileSliderContainer = document.createElement('div');
    percentileSliderContainer.style.display = this._options.config.mode === 'percentile' ? 'block' : 'none';
    this._percentileSliderContainer = percentileSliderContainer;

    // Create percentile dual range slider (0-100%)
    this._percentileSlider = new DualRangeSlider({
      label: '',
      min: 0,
      max: 100,
      step: 1,
      valueLow: this._options.config.percentileLow ?? DEFAULT_PERCENTILE_LOW,
      valueHigh: this._options.config.percentileHigh ?? DEFAULT_PERCENTILE_HIGH,
      onChange: (low, high) => this._onPercentileChange(low, high),
      formatValue: (v) => `${v.toFixed(0)}%`,
    });
    percentileSliderContainer.appendChild(this._percentileSlider.render());

    container.appendChild(percentileSliderContainer);

    // Absolute slider container
    const absoluteSliderContainer = document.createElement('div');
    absoluteSliderContainer.style.display = this._options.config.mode === 'absolute' ? 'block' : 'none';
    this._absoluteSliderContainer = absoluteSliderContainer;

    // Create absolute dual range slider
    const dataBounds = this._options.dataBounds || { min: 0, max: 100 };
    const absMin = this._options.config.absoluteMin ?? dataBounds.min;
    const absMax = this._options.config.absoluteMax ?? dataBounds.max;

    this._absoluteSlider = new DualRangeSlider({
      label: '',
      min: dataBounds.min,
      max: dataBounds.max,
      step: this._getAbsoluteStep(dataBounds),
      valueLow: absMin,
      valueHigh: absMax,
      onChange: (low, high) => this._onAbsoluteChange(low, high),
      formatValue: (v) => this._formatAbsoluteValue(v),
    });
    absoluteSliderContainer.appendChild(this._absoluteSlider.render());

    container.appendChild(absoluteSliderContainer);

    // Event listeners for mode toggle
    percentileRadio.addEventListener('change', () => this._onModeChange());
    absoluteRadio.addEventListener('change', () => this._onModeChange());

    return container;
  }

  /**
   * Updates the control with new configuration.
   *
   * @param config - New color range configuration
   */
  setConfig(config: ColorRangeConfig): void {
    this._options.config = { ...config };

    if (this._percentileRadio && this._absoluteRadio) {
      this._percentileRadio.checked = config.mode === 'percentile';
      this._absoluteRadio.checked = config.mode === 'absolute';
    }

    if (this._percentileSlider) {
      this._percentileSlider.setRange(
        config.percentileLow ?? DEFAULT_PERCENTILE_LOW,
        config.percentileHigh ?? DEFAULT_PERCENTILE_HIGH
      );
    }

    if (this._absoluteSlider) {
      const dataBounds = this._options.dataBounds || { min: 0, max: 100 };
      this._absoluteSlider.setRange(
        config.absoluteMin ?? dataBounds.min,
        config.absoluteMax ?? dataBounds.max
      );
    }

    this._updateSlidersVisibility();
  }

  /**
   * Updates the data bounds (for absolute mode reference).
   *
   * @param bounds - Data bounds
   */
  setDataBounds(bounds: { min: number; max: number }): void {
    this._options.dataBounds = bounds;

    // Update absolute slider bounds and step
    if (this._absoluteSlider) {
      this._absoluteSlider.setBounds(bounds.min, bounds.max);
      this._absoluteSlider.setStep(this._getAbsoluteStep(bounds));

      // If absolute values not explicitly set, use the bounds
      if (this._options.config.absoluteMin === undefined) {
        this._options.config.absoluteMin = bounds.min;
      }
      if (this._options.config.absoluteMax === undefined) {
        this._options.config.absoluteMax = bounds.max;
      }

      // Clamp existing values to new bounds
      const currentMin = this._options.config.absoluteMin ?? bounds.min;
      const currentMax = this._options.config.absoluteMax ?? bounds.max;
      const clampedMin = Math.max(bounds.min, Math.min(bounds.max, currentMin));
      const clampedMax = Math.max(bounds.min, Math.min(bounds.max, currentMax));

      this._absoluteSlider.setRange(clampedMin, clampedMax);
    }
  }

  /**
   * Sets the actual computed bounds from percentile calculation.
   * These bounds are used when switching from percentile to absolute mode.
   *
   * @param bounds - The actual computed bounds
   */
  setComputedBounds(bounds: { min: number; max: number }): void {
    this._computedBounds = bounds;
  }

  /**
   * Gets the current configuration.
   *
   * @returns The current color range configuration
   */
  getConfig(): ColorRangeConfig {
    return { ...this._options.config };
  }

  /**
   * Handles percentile slider change.
   */
  private _onPercentileChange(low: number, high: number): void {
    this._options.config.percentileLow = low;
    this._options.config.percentileHigh = high;
    this._emitChange();
  }

  /**
   * Handles absolute slider change.
   */
  private _onAbsoluteChange(low: number, high: number): void {
    this._options.config.absoluteMin = low;
    this._options.config.absoluteMax = high;
    this._emitChange();
  }

  /**
   * Handles mode change (percentile/absolute toggle).
   * Syncs values when switching between modes using actual computed bounds.
   */
  private _onModeChange(): void {
    const newMode = this._percentileRadio?.checked ? 'percentile' : 'absolute';
    const oldMode = this._options.config.mode;

    // Sync values when switching modes
    if (newMode !== oldMode) {
      if (newMode === 'absolute') {
        // Switching from percentile to absolute: use actual computed bounds
        if (this._computedBounds) {
          // Use the actual computed percentile bounds
          this._options.config.absoluteMin = this._computedBounds.min;
          this._options.config.absoluteMax = this._computedBounds.max;
        } else if (this._options.dataBounds) {
          // Fallback to linear approximation if no computed bounds available
          const { min: dataMin, max: dataMax } = this._options.dataBounds;
          const range = dataMax - dataMin;
          const pLow = this._options.config.percentileLow ?? DEFAULT_PERCENTILE_LOW;
          const pHigh = this._options.config.percentileHigh ?? DEFAULT_PERCENTILE_HIGH;

          this._options.config.absoluteMin = parseFloat((dataMin + range * (pLow / 100)).toFixed(2));
          this._options.config.absoluteMax = parseFloat((dataMin + range * (pHigh / 100)).toFixed(2));
        }

        // Update absolute slider
        if (this._absoluteSlider && this._options.config.absoluteMin !== undefined && this._options.config.absoluteMax !== undefined) {
          this._absoluteSlider.setRange(this._options.config.absoluteMin, this._options.config.absoluteMax);
        }
      }
      // When switching from absolute to percentile, keep existing percentile values
    }

    this._options.config.mode = newMode;
    this._updateSlidersVisibility();
    this._emitChange();
  }

  /**
   * Handles reset button click.
   * Resets to default percentile mode with 2-98% range.
   */
  private _onReset(): void {
    // Reset to default percentile mode
    this._options.config.mode = 'percentile';
    this._options.config.percentileLow = DEFAULT_PERCENTILE_LOW;
    this._options.config.percentileHigh = DEFAULT_PERCENTILE_HIGH;

    // Calculate corresponding absolute values for reference
    if (this._options.dataBounds) {
      const { min: dataMin, max: dataMax } = this._options.dataBounds;
      const range = dataMax - dataMin;
      this._options.config.absoluteMin = parseFloat((dataMin + range * (DEFAULT_PERCENTILE_LOW / 100)).toFixed(2));
      this._options.config.absoluteMax = parseFloat((dataMin + range * (DEFAULT_PERCENTILE_HIGH / 100)).toFixed(2));
    }

    // Update UI
    if (this._percentileRadio) {
      this._percentileRadio.checked = true;
    }
    if (this._absoluteRadio) {
      this._absoluteRadio.checked = false;
    }
    if (this._percentileSlider) {
      this._percentileSlider.setRange(DEFAULT_PERCENTILE_LOW, DEFAULT_PERCENTILE_HIGH);
    }
    if (this._absoluteSlider && this._options.config.absoluteMin !== undefined && this._options.config.absoluteMax !== undefined) {
      this._absoluteSlider.setRange(this._options.config.absoluteMin, this._options.config.absoluteMax);
    }

    this._updateSlidersVisibility();
    this._emitChange();
  }

  /**
   * Updates the visibility of slider containers based on mode.
   */
  private _updateSlidersVisibility(): void {
    if (this._percentileSliderContainer) {
      this._percentileSliderContainer.style.display =
        this._options.config.mode === 'percentile' ? 'block' : 'none';
    }
    if (this._absoluteSliderContainer) {
      this._absoluteSliderContainer.style.display =
        this._options.config.mode === 'absolute' ? 'block' : 'none';
    }
  }

  /**
   * Gets the appropriate step value for absolute slider based on data range.
   */
  private _getAbsoluteStep(bounds: { min: number; max: number }): number {
    const range = bounds.max - bounds.min;
    if (range <= 1) {
      return 0.01;
    } else if (range <= 10) {
      return 0.1;
    } else if (range <= 100) {
      return 1;
    } else if (range <= 1000) {
      return 1;
    } else {
      return Math.round(range / 100);
    }
  }

  /**
   * Formats absolute value for display based on the data range.
   */
  private _formatAbsoluteValue(value: number): string {
    const bounds = this._options.dataBounds || { min: 0, max: 100 };
    const range = bounds.max - bounds.min;

    if (range <= 1) {
      return value.toFixed(2);
    } else if (range <= 10) {
      return value.toFixed(1);
    } else {
      return value.toFixed(0);
    }
  }

  /**
   * Emits a change event with the current configuration.
   */
  private _emitChange(): void {
    this._options.onChange({ ...this._options.config });
  }
}
