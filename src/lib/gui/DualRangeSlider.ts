/**
 * Options for creating a dual-handle range slider
 */
export interface DualRangeSliderOptions {
  label: string;
  min: number;
  max: number;
  step: number;
  valueLow: number;
  valueHigh: number;
  onChange: (low: number, high: number) => void;
  formatValue?: (value: number) => string;
}

/**
 * Creates a dual-handle range slider for selecting a range.
 */
export class DualRangeSlider {
  private _options: DualRangeSliderOptions;
  private _sliderLow?: HTMLInputElement;
  private _sliderHigh?: HTMLInputElement;
  private _valueDisplay?: HTMLElement;
  private _rangeHighlight?: HTMLElement;

  constructor(options: DualRangeSliderOptions) {
    this._options = options;
  }

  /**
   * Renders the dual slider element.
   *
   * @returns The slider container element
   */
  render(): HTMLElement {
    const group = document.createElement('div');
    group.className = 'lidar-control-group';

    const labelRow = document.createElement('div');
    labelRow.className = 'lidar-control-label-row';

    const label = document.createElement('label');
    label.className = 'lidar-control-label';
    label.textContent = this._options.label;

    const valueSpan = document.createElement('span');
    valueSpan.className = 'lidar-control-value';
    valueSpan.textContent = this._formatRange(this._options.valueLow, this._options.valueHigh);
    this._valueDisplay = valueSpan;

    labelRow.appendChild(label);
    labelRow.appendChild(valueSpan);
    group.appendChild(labelRow);

    // Slider container with relative positioning for overlapping sliders
    const sliderContainer = document.createElement('div');
    sliderContainer.style.cssText = `
      position: relative;
      height: 20px;
      margin-top: 8px;
    `;

    // Track background
    const track = document.createElement('div');
    track.style.cssText = `
      position: absolute;
      top: 8px;
      left: 0;
      right: 0;
      height: 4px;
      background: #e0e0e0;
      border-radius: 2px;
    `;
    sliderContainer.appendChild(track);

    // Selected range highlight
    const range = document.createElement('div');
    range.style.cssText = `
      position: absolute;
      top: 8px;
      height: 4px;
      background: #159895;
      border-radius: 2px;
    `;
    this._rangeHighlight = range;
    sliderContainer.appendChild(range);

    // Low slider
    const sliderLow = document.createElement('input');
    sliderLow.type = 'range';
    sliderLow.min = String(this._options.min);
    sliderLow.max = String(this._options.max);
    sliderLow.step = String(this._options.step);
    sliderLow.value = String(this._options.valueLow);
    sliderLow.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 20px;
      -webkit-appearance: none;
      appearance: none;
      background: transparent;
      pointer-events: none;
      z-index: 2;
    `;
    this._sliderLow = sliderLow;

    // High slider
    const sliderHigh = document.createElement('input');
    sliderHigh.type = 'range';
    sliderHigh.min = String(this._options.min);
    sliderHigh.max = String(this._options.max);
    sliderHigh.step = String(this._options.step);
    sliderHigh.value = String(this._options.valueHigh);
    sliderHigh.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 20px;
      -webkit-appearance: none;
      appearance: none;
      background: transparent;
      pointer-events: none;
      z-index: 2;
    `;
    this._sliderHigh = sliderHigh;

    // Add thumb styles
    const style = document.createElement('style');
    style.textContent = `
      .dual-range-slider input[type="range"]::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: #159895;
        cursor: pointer;
        pointer-events: auto;
        border: 2px solid #fff;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
      }
      .dual-range-slider input[type="range"]::-moz-range-thumb {
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: #159895;
        cursor: pointer;
        pointer-events: auto;
        border: 2px solid #fff;
        box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
      }
    `;
    group.appendChild(style);

    sliderContainer.classList.add('dual-range-slider');
    sliderContainer.appendChild(sliderLow);
    sliderContainer.appendChild(sliderHigh);
    group.appendChild(sliderContainer);

    // Update range highlight
    const updateRange = () => {
      const low = parseFloat(sliderLow.value);
      const high = parseFloat(sliderHigh.value);
      const min = this._options.min;
      const max = this._options.max;
      const percentLow = ((low - min) / (max - min)) * 100;
      const percentHigh = ((high - min) / (max - min)) * 100;
      range.style.left = `${percentLow}%`;
      range.style.width = `${percentHigh - percentLow}%`;
    };

    updateRange();

    // Event handlers
    sliderLow.addEventListener('input', () => {
      let low = parseFloat(sliderLow.value);
      const high = parseFloat(sliderHigh.value);

      // Prevent low from exceeding high
      if (low > high) {
        low = high;
        sliderLow.value = String(low);
      }

      this._valueDisplay!.textContent = this._formatRange(low, high);
      updateRange();
      this._options.onChange(low, high);
    });

    sliderHigh.addEventListener('input', () => {
      const low = parseFloat(sliderLow.value);
      let high = parseFloat(sliderHigh.value);

      // Prevent high from going below low
      if (high < low) {
        high = low;
        sliderHigh.value = String(high);
      }

      this._valueDisplay!.textContent = this._formatRange(low, high);
      updateRange();
      this._options.onChange(low, high);
    });

    return group;
  }

  /**
   * Sets the slider range programmatically.
   */
  setRange(low: number, high: number): void {
    if (this._sliderLow) {
      this._sliderLow.value = String(low);
    }
    if (this._sliderHigh) {
      this._sliderHigh.value = String(high);
    }
    if (this._valueDisplay) {
      this._valueDisplay.textContent = this._formatRange(low, high);
    }
    this._updateRangeHighlight();
  }

  /**
   * Updates the min/max bounds of the slider.
   */
  setBounds(min: number, max: number): void {
    this._options.min = min;
    this._options.max = max;
    if (this._sliderLow) {
      this._sliderLow.min = String(min);
      this._sliderLow.max = String(max);
    }
    if (this._sliderHigh) {
      this._sliderHigh.min = String(min);
      this._sliderHigh.max = String(max);
    }
    this._updateRangeHighlight();
  }

  /**
   * Updates the step value of the slider.
   */
  setStep(step: number): void {
    this._options.step = step;
    if (this._sliderLow) {
      this._sliderLow.step = String(step);
    }
    if (this._sliderHigh) {
      this._sliderHigh.step = String(step);
    }
  }

  /**
   * Updates the visual range highlight bar.
   */
  private _updateRangeHighlight(): void {
    if (!this._rangeHighlight || !this._sliderLow || !this._sliderHigh) return;

    const low = parseFloat(this._sliderLow.value);
    const high = parseFloat(this._sliderHigh.value);
    const min = this._options.min;
    const max = this._options.max;
    const percentLow = ((low - min) / (max - min)) * 100;
    const percentHigh = ((high - min) / (max - min)) * 100;
    this._rangeHighlight.style.left = `${percentLow}%`;
    this._rangeHighlight.style.width = `${percentHigh - percentLow}%`;
  }

  /**
   * Gets the current range values.
   */
  getRange(): [number, number] {
    const low = this._sliderLow ? parseFloat(this._sliderLow.value) : this._options.valueLow;
    const high = this._sliderHigh ? parseFloat(this._sliderHigh.value) : this._options.valueHigh;
    return [low, high];
  }

  /**
   * Formats the range for display.
   */
  private _formatRange(low: number, high: number): string {
    const format = this._options.formatValue || ((v: number) => v.toFixed(1));
    return `${format(low)} - ${format(high)}`;
  }
}
