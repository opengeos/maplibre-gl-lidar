import { CLASSIFICATION_COLORS, getClassificationName } from '../colorizers/ColorScheme';

/**
 * Options for creating a classification legend
 */
export interface ClassificationLegendOptions {
  /** Classification codes to display */
  classifications: number[];
  /** Set of currently hidden classification codes */
  hiddenClassifications: Set<number>;
  /** Callback when a classification visibility is toggled */
  onToggle: (classificationCode: number, visible: boolean) => void;
  /** Callback to show all classifications */
  onShowAll: () => void;
  /** Callback to hide all classifications */
  onHideAll: () => void;
}

/**
 * Creates a classification legend with toggleable visibility checkboxes.
 * Shows color swatches and names for each classification type found in the data.
 */
export class ClassificationLegend {
  private _options: ClassificationLegendOptions;
  private _container?: HTMLElement;
  private _listContainer?: HTMLElement;
  private _checkboxes: Map<number, HTMLInputElement> = new Map();

  constructor(options: ClassificationLegendOptions) {
    this._options = options;
  }

  /**
   * Renders the legend element.
   *
   * @returns The legend container element
   */
  render(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'lidar-classification-legend';
    this._container = container;

    // Header with Show All / Hide All buttons
    const header = document.createElement('div');
    header.className = 'lidar-classification-legend-header';

    const showAllBtn = document.createElement('button');
    showAllBtn.type = 'button';
    showAllBtn.className = 'lidar-legend-action-btn';
    showAllBtn.textContent = 'Show All';
    showAllBtn.addEventListener('click', () => this._options.onShowAll());

    const hideAllBtn = document.createElement('button');
    hideAllBtn.type = 'button';
    hideAllBtn.className = 'lidar-legend-action-btn';
    hideAllBtn.textContent = 'Hide All';
    hideAllBtn.addEventListener('click', () => this._options.onHideAll());

    header.appendChild(showAllBtn);
    header.appendChild(hideAllBtn);
    container.appendChild(header);

    // Legend items list
    const list = document.createElement('div');
    list.className = 'lidar-classification-legend-list';
    this._listContainer = list;

    // Sort classifications by code for consistent ordering
    const sortedClassifications = [...this._options.classifications].sort((a, b) => a - b);

    if (sortedClassifications.length === 0) {
      // Show placeholder message
      const placeholder = document.createElement('div');
      placeholder.className = 'lidar-classification-empty';
      placeholder.textContent = 'Loading classifications...';
      list.appendChild(placeholder);
    } else {
      for (const code of sortedClassifications) {
        list.appendChild(this._buildLegendItem(code));
      }
    }

    container.appendChild(list);
    return container;
  }

  /**
   * Builds a single legend item with checkbox, color swatch, and label.
   *
   * @param code - Classification code
   * @returns The legend item element
   */
  private _buildLegendItem(code: number): HTMLElement {
    const item = document.createElement('div');
    item.className = 'lidar-classification-legend-item';

    // Checkbox
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = !this._options.hiddenClassifications.has(code);
    checkbox.id = `lidar-class-${code}`;
    checkbox.addEventListener('change', () => {
      this._options.onToggle(code, checkbox.checked);
    });
    this._checkboxes.set(code, checkbox);

    // Color swatch
    const swatch = document.createElement('span');
    swatch.className = 'lidar-classification-swatch';
    const color = CLASSIFICATION_COLORS[code] || [128, 128, 128];
    swatch.style.backgroundColor = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;

    // Label
    const label = document.createElement('label');
    label.htmlFor = `lidar-class-${code}`;
    label.className = 'lidar-classification-label';
    label.textContent = getClassificationName(code);

    item.appendChild(checkbox);
    item.appendChild(swatch);
    item.appendChild(label);

    return item;
  }

  /**
   * Updates visibility of a specific classification checkbox.
   *
   * @param code - Classification code
   * @param visible - Whether it should be visible (checked)
   */
  updateClassification(code: number, visible: boolean): void {
    const checkbox = this._checkboxes.get(code);
    if (checkbox) {
      checkbox.checked = visible;
    }
  }

  /**
   * Updates all classification checkboxes at once.
   *
   * @param hiddenClassifications - Set of hidden classification codes
   */
  updateAll(hiddenClassifications: Set<number>): void {
    for (const [code, checkbox] of this._checkboxes) {
      checkbox.checked = !hiddenClassifications.has(code);
    }
  }

  /**
   * Updates the list of available classifications and re-renders the list.
   *
   * @param classifications - Array of classification codes to display
   * @param hiddenClassifications - Set of hidden classification codes
   */
  setClassifications(classifications: number[], hiddenClassifications: Set<number>): void {
    this._options.classifications = classifications;
    this._options.hiddenClassifications = hiddenClassifications;

    // Re-render the list
    if (this._listContainer) {
      // Clear existing items
      this._listContainer.innerHTML = '';
      this._checkboxes.clear();

      if (classifications.length === 0) {
        // Show placeholder message
        const placeholder = document.createElement('div');
        placeholder.className = 'lidar-classification-empty';
        placeholder.textContent = 'No classifications found';
        this._listContainer.appendChild(placeholder);
      } else {
        // Sort and rebuild
        const sortedClassifications = [...classifications].sort((a, b) => a - b);

        for (const code of sortedClassifications) {
          this._listContainer.appendChild(this._buildLegendItem(code));
        }
      }
    }
  }

  /**
   * Gets the container element.
   *
   * @returns The container element or undefined if not rendered
   */
  getContainer(): HTMLElement | undefined {
    return this._container;
  }
}
