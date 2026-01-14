import type { LidarState, ColorScheme, PointCloudInfo } from '../core/types';
import { FileInput } from './FileInput';
import { RangeSlider } from './RangeSlider';
import { DualRangeSlider } from './DualRangeSlider';
import { ClassificationLegend } from './ClassificationLegend';
import { formatNumber } from '../utils/helpers';

/**
 * Callbacks for panel interactions
 */
export interface PanelBuilderCallbacks {
  onFileSelect: (file: File) => void;
  onUrlSubmit: (url: string) => void;
  onPointSizeChange: (size: number) => void;
  onOpacityChange: (opacity: number) => void;
  onColorSchemeChange: (scheme: ColorScheme) => void;
  onUsePercentileChange: (usePercentile: boolean) => void;
  onElevationRangeChange: (range: [number, number] | null) => void;
  onPickableChange: (pickable: boolean) => void;
  onZOffsetEnabledChange: (enabled: boolean) => void;
  onZOffsetChange: (offset: number) => void;
  onTerrainChange: (enabled: boolean) => void;
  onUnload: (id: string) => void;
  onZoomTo: (id: string) => void;
  onClassificationToggle: (classificationCode: number, visible: boolean) => void;
  onClassificationShowAll: () => void;
  onClassificationHideAll: () => void;
}

/**
 * Builds and manages the LiDAR control panel UI.
 */
export class PanelBuilder {
  private _callbacks: PanelBuilderCallbacks;
  private _state: LidarState;

  // UI component references
  private _contentElement?: HTMLElement;
  private _fileInput?: FileInput;
  private _urlInput?: HTMLInputElement;
  private _loadButton?: HTMLButtonElement;
  private _colorSelect?: HTMLSelectElement;
  private _percentileCheckbox?: HTMLInputElement;
  private _percentileGroup?: HTMLElement;
  private _pointSizeSlider?: RangeSlider;
  private _opacitySlider?: RangeSlider;
  private _pointCloudsList?: HTMLElement;
  private _pickableCheckbox?: HTMLInputElement;
  private _elevationSlider?: DualRangeSlider;
  private _elevationCheckbox?: HTMLInputElement;
  private _zOffsetCheckbox?: HTMLInputElement;
  private _zOffsetSlider?: RangeSlider;
  private _zOffsetSliderContainer?: HTMLElement;
  private _terrainCheckbox?: HTMLInputElement;
  private _loadingIndicator?: HTMLElement;
  private _errorMessage?: HTMLElement;
  private _classificationLegend?: ClassificationLegend;
  private _classificationLegendContainer?: HTMLElement;

  constructor(callbacks: PanelBuilderCallbacks, initialState: LidarState) {
    this._callbacks = callbacks;
    this._state = initialState;
  }

  /**
   * Builds and returns the panel content.
   *
   * @returns The panel content element
   */
  build(): HTMLElement {
    const content = document.createElement('div');
    content.className = 'lidar-control-content';
    // Apply max height from state
    if (this._state.panelMaxHeight) {
      content.style.maxHeight = `${this._state.panelMaxHeight}px`;
    }
    this._contentElement = content;

    // File input section
    content.appendChild(this._buildFileSection());

    // Styling section
    content.appendChild(this._buildStylingSection());

    // Point clouds list
    content.appendChild(this._buildPointCloudsList());

    // Loading indicator
    content.appendChild(this._buildLoadingIndicator());

    // Error message
    content.appendChild(this._buildErrorMessage());

    return content;
  }

  /**
   * Updates the UI to reflect the current state.
   *
   * @param state - New state
   */
  updateState(state: LidarState): void {
    this._state = state;

    // Update max height if changed
    if (this._contentElement && state.panelMaxHeight) {
      this._contentElement.style.maxHeight = `${state.panelMaxHeight}px`;
    }

    // Update loading state
    if (this._loadingIndicator) {
      if (state.loading) {
        this._loadingIndicator.classList.add('active');
      } else {
        this._loadingIndicator.classList.remove('active');
      }
    }

    // Update error message
    if (this._errorMessage) {
      if (state.error) {
        this._errorMessage.textContent = state.error;
        this._errorMessage.style.display = 'block';
      } else {
        this._errorMessage.style.display = 'none';
      }
    }

    // Update point clouds list
    this._updatePointCloudsList();

    // Update sliders
    if (this._pointSizeSlider) {
      this._pointSizeSlider.setValue(state.pointSize);
    }
    if (this._opacitySlider) {
      this._opacitySlider.setValue(state.opacity);
    }

    // Update color scheme
    if (this._colorSelect && typeof state.colorScheme === 'string') {
      this._colorSelect.value = state.colorScheme;
      this._updatePercentileVisibility(state.colorScheme);
    }

    // Update percentile checkbox
    if (this._percentileCheckbox) {
      this._percentileCheckbox.checked = state.usePercentile ?? true;
    }

    // Update pickable checkbox
    if (this._pickableCheckbox) {
      this._pickableCheckbox.checked = state.pickable ?? false;
    }

    // Update Z offset controls
    if (this._zOffsetCheckbox) {
      this._zOffsetCheckbox.checked = state.zOffsetEnabled ?? false;
    }
    if (this._zOffsetSliderContainer) {
      this._zOffsetSliderContainer.style.display = state.zOffsetEnabled ? 'block' : 'none';
    }
    if (this._zOffsetSlider) {
      // Update slider bounds centered around -zOffsetBase (the default z-offset)
      if (state.zOffsetBase !== undefined) {
        const defaultOffset = -state.zOffsetBase;
        const sliderMin = defaultOffset - 100;
        const sliderMax = defaultOffset + 100;
        this._zOffsetSlider.setBounds(sliderMin, sliderMax);
      }
      this._zOffsetSlider.setValue(state.zOffset ?? 0);
    }

    // Update terrain checkbox
    if (this._terrainCheckbox) {
      this._terrainCheckbox.checked = state.terrainEnabled ?? false;
    }

    // Update elevation slider bounds when point clouds change
    if (this._elevationSlider && state.pointClouds.length > 0) {
      const bounds = this._getElevationBounds();
      this._elevationSlider.setBounds(bounds.min, bounds.max);
      // If filter is not active, reset range to full bounds
      if (!this._elevationCheckbox?.checked) {
        this._elevationSlider.setRange(bounds.min, bounds.max);
      }
    }

    // Update classification legend
    if (this._classificationLegend && state.availableClassifications) {
      this._classificationLegend.setClassifications(
        Array.from(state.availableClassifications),
        state.hiddenClassifications || new Set()
      );
    }

    // Disable/enable inputs during loading
    const enabled = !state.loading;
    this._fileInput?.setEnabled(enabled);
    if (this._urlInput) this._urlInput.disabled = !enabled;
    if (this._loadButton) this._loadButton.disabled = !enabled;
  }

  /**
   * Updates the loading progress display.
   *
   * @param progress - Progress value (0-100)
   * @param message - Optional progress message
   */
  updateLoadingProgress(progress: number, message?: string): void {
    if (!this._loadingIndicator) return;

    const progressBar = this._loadingIndicator.querySelector('.lidar-loading-bar-fill') as HTMLElement;
    const progressText = this._loadingIndicator.querySelector('.lidar-loading-progress') as HTMLElement;

    if (progressBar) {
      progressBar.style.width = `${progress}%`;
    }

    if (progressText && message) {
      progressText.textContent = message;
    }
  }

  /**
   * Builds the file input section.
   */
  private _buildFileSection(): HTMLElement {
    const section = document.createElement('div');
    section.className = 'lidar-control-section';

    // File upload
    this._fileInput = new FileInput({
      accept: '.las,.laz',
      onChange: (file) => this._callbacks.onFileSelect(file),
    });
    section.appendChild(this._fileInput.render());

    // URL input
    const urlGroup = document.createElement('div');
    urlGroup.className = 'lidar-control-group';
    urlGroup.style.marginTop = '12px';

    const urlLabel = document.createElement('label');
    urlLabel.className = 'lidar-control-label';
    urlLabel.textContent = 'Load COPC or EPT from URL';
    urlGroup.appendChild(urlLabel);

    const urlRow = document.createElement('div');
    urlRow.className = 'lidar-control-flex';

    const urlInput = document.createElement('input');
    urlInput.type = 'text';
    urlInput.className = 'lidar-control-input';
    urlInput.placeholder = 'https://example.com/pointcloud.laz';
    urlInput.style.flex = '1';
    this._urlInput = urlInput;

    const loadBtn = document.createElement('button');
    loadBtn.type = 'button';
    loadBtn.className = 'lidar-control-button';
    loadBtn.textContent = 'Load';
    loadBtn.addEventListener('click', () => {
      const url = urlInput.value.trim();
      if (url) {
        this._callbacks.onUrlSubmit(url);
        urlInput.value = '';
      }
    });
    this._loadButton = loadBtn;

    // Allow Enter key to submit
    urlInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        loadBtn.click();
      }
    });

    urlRow.appendChild(urlInput);
    urlRow.appendChild(loadBtn);
    urlGroup.appendChild(urlRow);
    section.appendChild(urlGroup);

    return section;
  }

  /**
   * Builds the styling controls section.
   */
  private _buildStylingSection(): HTMLElement {
    const section = document.createElement('div');
    section.className = 'lidar-control-section';

    // Section header
    const header = document.createElement('div');
    header.className = 'lidar-control-section-header';
    header.textContent = 'Styling';
    section.appendChild(header);

    // Color scheme selector
    const colorGroup = document.createElement('div');
    colorGroup.className = 'lidar-control-group';

    const colorLabel = document.createElement('label');
    colorLabel.className = 'lidar-control-label';
    colorLabel.textContent = 'Color By';
    colorGroup.appendChild(colorLabel);

    const colorSelect = document.createElement('select');
    colorSelect.className = 'lidar-control-select';
    colorSelect.innerHTML = `
      <option value="elevation">Elevation</option>
      <option value="intensity">Intensity</option>
      <option value="classification">Classification</option>
      <option value="rgb">RGB (if available)</option>
    `;
    colorSelect.value = typeof this._state.colorScheme === 'string' ? this._state.colorScheme : 'elevation';
    colorSelect.addEventListener('change', () => {
      this._callbacks.onColorSchemeChange(colorSelect.value as ColorScheme);
      // Show/hide percentile option based on color scheme
      this._updatePercentileVisibility(colorSelect.value);
    });
    this._colorSelect = colorSelect;
    colorGroup.appendChild(colorSelect);
    section.appendChild(colorGroup);

    // Classification legend (shown only when classification scheme is selected)
    section.appendChild(this._buildClassificationLegend());

    // Percentile range option (only for elevation and intensity)
    section.appendChild(this._buildPercentileCheckbox());

    // Point size slider
    this._pointSizeSlider = new RangeSlider({
      label: 'Point Size',
      min: 1,
      max: 10,
      step: 0.5,
      value: this._state.pointSize,
      onChange: (v) => this._callbacks.onPointSizeChange(v),
    });
    section.appendChild(this._pointSizeSlider.render());

    // Opacity slider
    this._opacitySlider = new RangeSlider({
      label: 'Opacity',
      min: 0,
      max: 1,
      step: 0.05,
      value: this._state.opacity,
      onChange: (v) => this._callbacks.onOpacityChange(v),
    });
    section.appendChild(this._opacitySlider.render());

    // 3D Terrain toggle
    section.appendChild(this._buildTerrainCheckbox());

    // Pickable checkbox
    section.appendChild(this._buildPickableCheckbox());

    // Elevation filter (collapsible)
    section.appendChild(this._buildElevationFilter());

    // Z offset control (collapsible)
    section.appendChild(this._buildZOffsetControl());

    return section;
  }

  /**
   * Builds the elevation filter controls with checkbox and dual slider.
   */
  private _buildElevationFilter(): HTMLElement {
    const group = document.createElement('div');
    group.className = 'lidar-control-group';

    // Checkbox row
    const labelRow = document.createElement('div');
    labelRow.className = 'lidar-control-label-row';
    labelRow.style.cursor = 'pointer';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'lidar-elevation-filter-checkbox';
    checkbox.style.marginRight = '6px';
    this._elevationCheckbox = checkbox;

    const label = document.createElement('label');
    label.className = 'lidar-control-label';
    label.htmlFor = 'lidar-elevation-filter-checkbox';
    label.style.display = 'inline';
    label.style.cursor = 'pointer';
    label.textContent = 'Elevation Filter';

    labelRow.appendChild(checkbox);
    labelRow.appendChild(label);
    group.appendChild(labelRow);

    // Slider container (hidden by default)
    const sliderContainer = document.createElement('div');
    sliderContainer.style.display = 'none';
    sliderContainer.style.marginTop = '8px';

    // Get elevation bounds from loaded point clouds
    const bounds = this._getElevationBounds();

    // Create dual range slider
    this._elevationSlider = new DualRangeSlider({
      label: 'Range (m)',
      min: bounds.min,
      max: bounds.max,
      step: 1,
      valueLow: bounds.min,
      valueHigh: bounds.max,
      onChange: (low, high) => {
        if (checkbox.checked) {
          this._callbacks.onElevationRangeChange([low, high]);
        }
      },
      formatValue: (v) => v.toFixed(0),
    });

    sliderContainer.appendChild(this._elevationSlider.render());
    group.appendChild(sliderContainer);

    // Toggle visibility and filter
    checkbox.addEventListener('change', () => {
      sliderContainer.style.display = checkbox.checked ? 'block' : 'none';
      if (checkbox.checked) {
        // Update bounds when enabling filter
        const newBounds = this._getElevationBounds();
        this._elevationSlider?.setBounds(newBounds.min, newBounds.max);
        this._elevationSlider?.setRange(newBounds.min, newBounds.max);
        // Apply current range
        const range = this._elevationSlider?.getRange();
        if (range) {
          this._callbacks.onElevationRangeChange(range);
        }
      } else {
        this._callbacks.onElevationRangeChange(null);
      }
    });

    return group;
  }

  /**
   * Builds the Z offset control with checkbox and slider.
   */
  private _buildZOffsetControl(): HTMLElement {
    const group = document.createElement('div');
    group.className = 'lidar-control-group';

    // Checkbox row
    const labelRow = document.createElement('div');
    labelRow.className = 'lidar-control-label-row';
    labelRow.style.cursor = 'pointer';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'lidar-zoffset-checkbox';
    checkbox.checked = this._state.zOffsetEnabled ?? false;
    checkbox.style.marginRight = '6px';
    this._zOffsetCheckbox = checkbox;

    const label = document.createElement('label');
    label.className = 'lidar-control-label';
    label.htmlFor = 'lidar-zoffset-checkbox';
    label.style.display = 'inline';
    label.style.cursor = 'pointer';
    label.textContent = 'Z Offset';

    labelRow.appendChild(checkbox);
    labelRow.appendChild(label);
    group.appendChild(labelRow);

    // Slider container (hidden by default)
    const sliderContainer = document.createElement('div');
    sliderContainer.style.display = this._state.zOffsetEnabled ? 'block' : 'none';
    sliderContainer.style.marginTop = '8px';
    this._zOffsetSliderContainer = sliderContainer;

    // Slider range centered around -zOffsetBase (the default z-offset for relative height)
    // Range: [-zOffsetBase - 100, -zOffsetBase + 100]
    const zOffsetBase = this._state.zOffsetBase ?? 0;
    const defaultOffset = -zOffsetBase;
    const sliderMin = defaultOffset - 100;
    const sliderMax = defaultOffset + 100;

    // Create slider
    this._zOffsetSlider = new RangeSlider({
      label: 'Offset (m)',
      min: sliderMin,
      max: sliderMax,
      step: 1,
      value: this._state.zOffset ?? defaultOffset,
      onChange: (v) => this._callbacks.onZOffsetChange(v),
    });

    sliderContainer.appendChild(this._zOffsetSlider.render());
    group.appendChild(sliderContainer);

    // Toggle visibility and enable/disable offset
    checkbox.addEventListener('change', () => {
      sliderContainer.style.display = checkbox.checked ? 'block' : 'none';
      this._callbacks.onZOffsetEnabledChange(checkbox.checked);
      if (!checkbox.checked) {
        // Reset offset to 0 when disabled
        this._zOffsetSlider?.setValue(0);
        this._callbacks.onZOffsetChange(0);
      }
    });

    return group;
  }

  /**
   * Builds the 3D terrain toggle checkbox.
   */
  private _buildTerrainCheckbox(): HTMLElement {
    const group = document.createElement('div');
    group.className = 'lidar-control-group';

    const labelRow = document.createElement('div');
    labelRow.className = 'lidar-control-label-row';
    labelRow.style.cursor = 'pointer';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'lidar-terrain-checkbox';
    checkbox.checked = this._state.terrainEnabled ?? false;
    checkbox.style.marginRight = '6px';
    this._terrainCheckbox = checkbox;

    const label = document.createElement('label');
    label.className = 'lidar-control-label';
    label.htmlFor = 'lidar-terrain-checkbox';
    label.style.display = 'inline';
    label.style.cursor = 'pointer';
    label.textContent = '3D Terrain';

    labelRow.appendChild(checkbox);
    labelRow.appendChild(label);
    group.appendChild(labelRow);

    checkbox.addEventListener('change', () => {
      this._callbacks.onTerrainChange(checkbox.checked);
    });

    return group;
  }

  /**
   * Gets the elevation bounds from loaded point clouds.
   */
  private _getElevationBounds(): { min: number; max: number } {
    if (this._state.pointClouds.length === 0) {
      return { min: 0, max: 100 };
    }

    let minZ = Infinity;
    let maxZ = -Infinity;

    for (const pc of this._state.pointClouds) {
      minZ = Math.min(minZ, pc.bounds.minZ);
      maxZ = Math.max(maxZ, pc.bounds.maxZ);
    }

    // Round to nice values
    minZ = Math.floor(minZ);
    maxZ = Math.ceil(maxZ);

    return { min: minZ, max: maxZ };
  }

  /**
   * Builds the percentile checkbox control for elevation/intensity coloring.
   */
  private _buildPercentileCheckbox(): HTMLElement {
    const group = document.createElement('div');
    group.className = 'lidar-control-group';
    this._percentileGroup = group;

    const labelRow = document.createElement('div');
    labelRow.className = 'lidar-control-label-row';
    labelRow.style.cursor = 'pointer';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'lidar-percentile-checkbox';
    checkbox.checked = this._state.usePercentile ?? true;
    checkbox.style.marginRight = '6px';
    this._percentileCheckbox = checkbox;

    const label = document.createElement('label');
    label.className = 'lidar-control-label';
    label.htmlFor = 'lidar-percentile-checkbox';
    label.style.display = 'inline';
    label.style.cursor = 'pointer';
    label.textContent = 'Use percentile range (2-98%)';
    label.title = 'Clip outliers for better color distribution';

    checkbox.addEventListener('change', () => {
      this._callbacks.onUsePercentileChange(checkbox.checked);
    });

    labelRow.appendChild(checkbox);
    labelRow.appendChild(label);
    group.appendChild(labelRow);

    // Set initial visibility based on current color scheme
    const currentScheme = typeof this._state.colorScheme === 'string' ? this._state.colorScheme : 'elevation';
    this._updatePercentileVisibility(currentScheme);

    return group;
  }

  /**
   * Updates the visibility of the percentile checkbox and classification legend based on color scheme.
   * Percentile shows for elevation and intensity. Legend shows for classification.
   */
  private _updatePercentileVisibility(colorScheme: string): void {
    if (this._percentileGroup) {
      const showPercentile = colorScheme === 'elevation' || colorScheme === 'intensity';
      this._percentileGroup.style.display = showPercentile ? 'block' : 'none';
    }

    // Show/hide classification legend
    if (this._classificationLegendContainer) {
      this._classificationLegendContainer.style.display =
        colorScheme === 'classification' ? 'block' : 'none';
    }
  }

  /**
   * Builds the classification legend component.
   */
  private _buildClassificationLegend(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'lidar-control-group';
    this._classificationLegendContainer = container;

    // Set initial visibility based on current color scheme
    const currentScheme = typeof this._state.colorScheme === 'string' ? this._state.colorScheme : 'elevation';
    container.style.display = currentScheme === 'classification' ? 'block' : 'none';

    // Create the legend component
    this._classificationLegend = new ClassificationLegend({
      classifications: Array.from(this._state.availableClassifications || new Set()),
      hiddenClassifications: this._state.hiddenClassifications || new Set(),
      onToggle: (code, visible) => this._callbacks.onClassificationToggle(code, visible),
      onShowAll: () => this._callbacks.onClassificationShowAll(),
      onHideAll: () => this._callbacks.onClassificationHideAll(),
    });

    container.appendChild(this._classificationLegend.render());
    return container;
  }

  /**
   * Builds the pickable checkbox control.
   */
  private _buildPickableCheckbox(): HTMLElement {
    const group = document.createElement('div');
    group.className = 'lidar-control-group';

    const labelRow = document.createElement('div');
    labelRow.className = 'lidar-control-label-row';
    labelRow.style.cursor = 'pointer';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.id = 'lidar-pickable-checkbox';
    checkbox.checked = this._state.pickable ?? false;
    checkbox.style.marginRight = '6px';
    this._pickableCheckbox = checkbox;

    const label = document.createElement('label');
    label.className = 'lidar-control-label';
    label.htmlFor = 'lidar-pickable-checkbox';
    label.style.display = 'inline';
    label.style.cursor = 'pointer';
    label.textContent = 'Enable point picking';

    checkbox.addEventListener('change', () => {
      this._callbacks.onPickableChange(checkbox.checked);
    });

    labelRow.appendChild(checkbox);
    labelRow.appendChild(label);
    group.appendChild(labelRow);

    return group;
  }

  /**
   * Builds the loaded point clouds list.
   */
  private _buildPointCloudsList(): HTMLElement {
    const section = document.createElement('div');
    section.className = 'lidar-control-section lidar-pointclouds-section';

    const header = document.createElement('div');
    header.className = 'lidar-control-section-header';
    header.textContent = 'Loaded Point Clouds';
    section.appendChild(header);

    const list = document.createElement('div');
    list.className = 'lidar-pointclouds-list';
    this._pointCloudsList = list;
    section.appendChild(list);

    this._updatePointCloudsList();

    return section;
  }

  /**
   * Updates the point clouds list display.
   */
  private _updatePointCloudsList(): void {
    if (!this._pointCloudsList) return;

    this._pointCloudsList.innerHTML = '';

    if (this._state.pointClouds.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'lidar-pointclouds-empty';
      empty.textContent = 'No point clouds loaded';
      this._pointCloudsList.appendChild(empty);
      return;
    }

    for (const pc of this._state.pointClouds) {
      this._pointCloudsList.appendChild(this._buildPointCloudItem(pc));
    }
  }

  /**
   * Builds a single point cloud list item.
   */
  private _buildPointCloudItem(pc: PointCloudInfo): HTMLElement {
    const item = document.createElement('div');
    item.className = 'lidar-pointcloud-item';

    const info = document.createElement('div');
    info.className = 'lidar-pointcloud-info';

    const name = document.createElement('div');
    name.className = 'lidar-pointcloud-name';
    name.textContent = pc.name;
    name.title = pc.name;

    const details = document.createElement('div');
    details.className = 'lidar-pointcloud-details';
    details.textContent = `${formatNumber(pc.pointCount)} points`;

    info.appendChild(name);
    info.appendChild(details);

    const actions = document.createElement('div');
    actions.className = 'lidar-pointcloud-actions';

    const zoomBtn = document.createElement('button');
    zoomBtn.type = 'button';
    zoomBtn.className = 'lidar-pointcloud-action';
    zoomBtn.textContent = 'Zoom';
    zoomBtn.title = 'Zoom to point cloud';
    zoomBtn.addEventListener('click', () => this._callbacks.onZoomTo(pc.id));

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'lidar-pointcloud-action remove';
    removeBtn.textContent = 'Remove';
    removeBtn.title = 'Remove point cloud';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation(); // Prevent click-outside handler from collapsing panel
      this._callbacks.onUnload(pc.id);
    });

    actions.appendChild(zoomBtn);
    actions.appendChild(removeBtn);

    item.appendChild(info);
    item.appendChild(actions);

    return item;
  }

  /**
   * Builds the loading indicator.
   */
  private _buildLoadingIndicator(): HTMLElement {
    const loading = document.createElement('div');
    loading.className = 'lidar-loading';
    loading.innerHTML = `
      <div class="lidar-loading-spinner"></div>
      <div class="lidar-loading-text">Loading point cloud...</div>
      <div class="lidar-loading-progress">Preparing...</div>
      <div class="lidar-loading-bar">
        <div class="lidar-loading-bar-fill"></div>
      </div>
    `;
    this._loadingIndicator = loading;
    return loading;
  }

  /**
   * Builds the error message display.
   */
  private _buildErrorMessage(): HTMLElement {
    const error = document.createElement('div');
    error.className = 'lidar-error';
    error.style.display = 'none';
    this._errorMessage = error;
    return error;
  }
}
