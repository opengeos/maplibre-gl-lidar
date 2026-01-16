import type { ColorRangeConfig } from '../core/types';

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
  /** Callback when the configuration changes */
  onChange: (config: ColorRangeConfig) => void;
}

/**
 * A control component for configuring color range mapping.
 * Allows switching between percentile and absolute value modes.
 */
export class PercentileRangeControl {
  private _options: PercentileRangeControlOptions;
  private _percentileRadio?: HTMLInputElement;
  private _absoluteRadio?: HTMLInputElement;
  private _percentileInputsContainer?: HTMLElement;
  private _absoluteInputsContainer?: HTMLElement;
  private _percentileLowInput?: HTMLInputElement;
  private _percentileHighInput?: HTMLInputElement;
  private _absoluteMinInput?: HTMLInputElement;
  private _absoluteMaxInput?: HTMLInputElement;

  /**
   * Creates a new PercentileRangeControl instance.
   *
   * @param options - Control configuration options
   */
  constructor(options: PercentileRangeControlOptions) {
    this._options = { ...options };
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

    // Percentile inputs container
    const percentileInputsContainer = document.createElement('div');
    percentileInputsContainer.className = 'lidar-range-inputs';
    percentileInputsContainer.style.display = this._options.config.mode === 'percentile' ? 'flex' : 'none';
    this._percentileInputsContainer = percentileInputsContainer;

    // Low percentile input
    const lowLabel = document.createElement('label');
    lowLabel.textContent = 'Low:';
    lowLabel.className = 'lidar-range-input-label';
    const percentileLowInput = document.createElement('input');
    percentileLowInput.type = 'number';
    percentileLowInput.className = 'lidar-range-input';
    percentileLowInput.min = '0';
    percentileLowInput.max = '100';
    percentileLowInput.step = '1';
    percentileLowInput.value = String(this._options.config.percentileLow ?? 2);
    this._percentileLowInput = percentileLowInput;

    // High percentile input
    const highLabel = document.createElement('label');
    highLabel.textContent = 'High:';
    highLabel.className = 'lidar-range-input-label';
    const percentileHighInput = document.createElement('input');
    percentileHighInput.type = 'number';
    percentileHighInput.className = 'lidar-range-input';
    percentileHighInput.min = '0';
    percentileHighInput.max = '100';
    percentileHighInput.step = '1';
    percentileHighInput.value = String(this._options.config.percentileHigh ?? 98);
    this._percentileHighInput = percentileHighInput;

    // Percentage labels
    const pctLabel1 = document.createElement('span');
    pctLabel1.textContent = '%';
    pctLabel1.className = 'lidar-range-unit';
    const pctLabel2 = document.createElement('span');
    pctLabel2.textContent = '%';
    pctLabel2.className = 'lidar-range-unit';

    percentileInputsContainer.appendChild(lowLabel);
    percentileInputsContainer.appendChild(percentileLowInput);
    percentileInputsContainer.appendChild(pctLabel1);
    percentileInputsContainer.appendChild(highLabel);
    percentileInputsContainer.appendChild(percentileHighInput);
    percentileInputsContainer.appendChild(pctLabel2);

    container.appendChild(percentileInputsContainer);

    // Absolute inputs container
    const absoluteInputsContainer = document.createElement('div');
    absoluteInputsContainer.className = 'lidar-range-inputs';
    absoluteInputsContainer.style.display = this._options.config.mode === 'absolute' ? 'flex' : 'none';
    this._absoluteInputsContainer = absoluteInputsContainer;

    // Min value input
    const minLabel = document.createElement('label');
    minLabel.textContent = 'Min:';
    minLabel.className = 'lidar-range-input-label';
    const absoluteMinInput = document.createElement('input');
    absoluteMinInput.type = 'number';
    absoluteMinInput.className = 'lidar-range-input';
    absoluteMinInput.step = 'any';
    absoluteMinInput.value = String(this._options.config.absoluteMin ?? this._options.dataBounds?.min ?? 0);
    this._absoluteMinInput = absoluteMinInput;

    // Max value input
    const maxLabel = document.createElement('label');
    maxLabel.textContent = 'Max:';
    maxLabel.className = 'lidar-range-input-label';
    const absoluteMaxInput = document.createElement('input');
    absoluteMaxInput.type = 'number';
    absoluteMaxInput.className = 'lidar-range-input';
    absoluteMaxInput.step = 'any';
    absoluteMaxInput.value = String(this._options.config.absoluteMax ?? this._options.dataBounds?.max ?? 100);
    this._absoluteMaxInput = absoluteMaxInput;

    absoluteInputsContainer.appendChild(minLabel);
    absoluteInputsContainer.appendChild(absoluteMinInput);
    absoluteInputsContainer.appendChild(maxLabel);
    absoluteInputsContainer.appendChild(absoluteMaxInput);

    container.appendChild(absoluteInputsContainer);

    // Event listeners
    percentileRadio.addEventListener('change', () => this._onModeChange());
    absoluteRadio.addEventListener('change', () => this._onModeChange());
    percentileLowInput.addEventListener('change', () => this._onInputChange());
    percentileHighInput.addEventListener('change', () => this._onInputChange());
    absoluteMinInput.addEventListener('change', () => this._onInputChange());
    absoluteMaxInput.addEventListener('change', () => this._onInputChange());

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

    if (this._percentileLowInput) {
      this._percentileLowInput.value = String(config.percentileLow ?? 2);
    }
    if (this._percentileHighInput) {
      this._percentileHighInput.value = String(config.percentileHigh ?? 98);
    }
    if (this._absoluteMinInput) {
      this._absoluteMinInput.value = String(config.absoluteMin ?? this._options.dataBounds?.min ?? 0);
    }
    if (this._absoluteMaxInput) {
      this._absoluteMaxInput.value = String(config.absoluteMax ?? this._options.dataBounds?.max ?? 100);
    }

    this._updateInputsVisibility();
  }

  /**
   * Updates the data bounds (for absolute mode reference).
   *
   * @param bounds - Data bounds
   */
  setDataBounds(bounds: { min: number; max: number }): void {
    this._options.dataBounds = bounds;

    // Update absolute inputs if they don't have values set
    if (this._absoluteMinInput && !this._options.config.absoluteMin) {
      this._absoluteMinInput.value = String(bounds.min);
    }
    if (this._absoluteMaxInput && !this._options.config.absoluteMax) {
      this._absoluteMaxInput.value = String(bounds.max);
    }
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
   * Handles mode change (percentile/absolute toggle).
   * Syncs values when switching between modes.
   */
  private _onModeChange(): void {
    const newMode = this._percentileRadio?.checked ? 'percentile' : 'absolute';
    const oldMode = this._options.config.mode;

    // Sync values when switching modes
    if (newMode !== oldMode) {
      if (newMode === 'absolute' && this._options.dataBounds) {
        // Switching from percentile to absolute: calculate absolute values from percentile
        const { min: dataMin, max: dataMax } = this._options.dataBounds;
        const range = dataMax - dataMin;
        const pLow = this._options.config.percentileLow ?? DEFAULT_PERCENTILE_LOW;
        const pHigh = this._options.config.percentileHigh ?? DEFAULT_PERCENTILE_HIGH;

        // Calculate absolute values from percentile (approximate)
        const absoluteMin = dataMin + range * (pLow / 100);
        const absoluteMax = dataMin + range * (pHigh / 100);

        this._options.config.absoluteMin = parseFloat(absoluteMin.toFixed(2));
        this._options.config.absoluteMax = parseFloat(absoluteMax.toFixed(2));

        // Update input fields
        if (this._absoluteMinInput) {
          this._absoluteMinInput.value = String(this._options.config.absoluteMin);
        }
        if (this._absoluteMaxInput) {
          this._absoluteMaxInput.value = String(this._options.config.absoluteMax);
        }
      }
      // When switching from absolute to percentile, keep existing percentile values
    }

    this._options.config.mode = newMode;
    this._updateInputsVisibility();
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
    if (this._percentileLowInput) {
      this._percentileLowInput.value = String(DEFAULT_PERCENTILE_LOW);
    }
    if (this._percentileHighInput) {
      this._percentileHighInput.value = String(DEFAULT_PERCENTILE_HIGH);
    }
    if (this._absoluteMinInput) {
      this._absoluteMinInput.value = String(this._options.config.absoluteMin ?? 0);
    }
    if (this._absoluteMaxInput) {
      this._absoluteMaxInput.value = String(this._options.config.absoluteMax ?? 100);
    }

    this._updateInputsVisibility();
    this._emitChange();
  }

  /**
   * Handles input value changes.
   */
  private _onInputChange(): void {
    if (this._options.config.mode === 'percentile') {
      const low = parseFloat(this._percentileLowInput?.value ?? '2');
      const high = parseFloat(this._percentileHighInput?.value ?? '98');
      this._options.config.percentileLow = Math.max(0, Math.min(100, low));
      this._options.config.percentileHigh = Math.max(0, Math.min(100, high));
    } else {
      const min = parseFloat(this._absoluteMinInput?.value ?? '0');
      const max = parseFloat(this._absoluteMaxInput?.value ?? '100');
      this._options.config.absoluteMin = min;
      this._options.config.absoluteMax = max;
    }
    this._emitChange();
  }

  /**
   * Updates the visibility of input containers based on mode.
   */
  private _updateInputsVisibility(): void {
    if (this._percentileInputsContainer) {
      this._percentileInputsContainer.style.display =
        this._options.config.mode === 'percentile' ? 'flex' : 'none';
    }
    if (this._absoluteInputsContainer) {
      this._absoluteInputsContainer.style.display =
        this._options.config.mode === 'absolute' ? 'flex' : 'none';
    }
  }

  /**
   * Emits a change event with the current configuration.
   */
  private _emitChange(): void {
    this._options.onChange({ ...this._options.config });
  }
}
