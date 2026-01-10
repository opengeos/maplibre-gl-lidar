import { formatNumericValue } from '../utils/helpers';

/**
 * Options for creating a range slider
 */
export interface RangeSliderOptions {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
  formatValue?: (value: number) => string;
}

/**
 * Creates a styled range slider with label and value display.
 */
export class RangeSlider {
  private _options: RangeSliderOptions;
  private _slider?: HTMLInputElement;
  private _valueDisplay?: HTMLElement;

  constructor(options: RangeSliderOptions) {
    this._options = options;
  }

  /**
   * Renders the slider element.
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
    valueSpan.textContent = this._formatValue(this._options.value);
    this._valueDisplay = valueSpan;

    labelRow.appendChild(label);
    labelRow.appendChild(valueSpan);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.className = 'lidar-control-slider';
    slider.min = String(this._options.min);
    slider.max = String(this._options.max);
    slider.step = String(this._options.step);
    slider.value = String(this._options.value);
    this._slider = slider;

    slider.addEventListener('input', () => {
      const value = parseFloat(slider.value);
      this._valueDisplay!.textContent = this._formatValue(value);
      this._options.onChange(value);
    });

    group.appendChild(labelRow);
    group.appendChild(slider);

    return group;
  }

  /**
   * Sets the slider value programmatically.
   *
   * @param value - New value
   */
  setValue(value: number): void {
    if (this._slider) {
      this._slider.value = String(value);
    }
    if (this._valueDisplay) {
      this._valueDisplay.textContent = this._formatValue(value);
    }
  }

  /**
   * Gets the current value.
   *
   * @returns Current slider value
   */
  getValue(): number {
    return this._slider ? parseFloat(this._slider.value) : this._options.value;
  }

  /**
   * Enables or disables the slider.
   *
   * @param enabled - Whether to enable
   */
  setEnabled(enabled: boolean): void {
    if (this._slider) {
      this._slider.disabled = !enabled;
    }
  }

  /**
   * Formats the value for display.
   */
  private _formatValue(value: number): string {
    if (this._options.formatValue) {
      return this._options.formatValue(value);
    }
    return formatNumericValue(value, this._options.step);
  }
}
