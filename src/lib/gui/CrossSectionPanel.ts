import type { ElevationProfile, ColormapName } from '../core/types';
import { ElevationProfileChart } from './ElevationProfileChart';

/**
 * Callbacks for CrossSectionPanel interactions
 */
export interface CrossSectionPanelCallbacks {
  /** Called when draw mode is toggled */
  onDrawToggle: (enabled: boolean) => void;
  /** Called when clear button is clicked */
  onClear: () => void;
  /** Called when buffer distance changes */
  onBufferDistanceChange: (meters: number) => void;
}

/**
 * Options for CrossSectionPanel
 */
export interface CrossSectionPanelOptions {
  /** Initial buffer distance in meters */
  bufferDistance?: number;
  /** Chart colormap */
  colormap?: ColormapName;
  /** Chart height */
  chartHeight?: number;
}

/**
 * UI panel for cross-section tool containing controls and elevation profile chart.
 */
export class CrossSectionPanel {
  private _container: HTMLElement;
  private _callbacks: CrossSectionPanelCallbacks;
  private _options: Required<CrossSectionPanelOptions>;

  // UI elements
  private _drawButton?: HTMLButtonElement;
  private _clearButton?: HTMLButtonElement;
  private _downloadButton?: HTMLButtonElement;
  private _expandButton?: HTMLButtonElement;
  private _bufferSlider?: HTMLInputElement;
  private _bufferValue?: HTMLSpanElement;
  private _statsContainer?: HTMLElement;
  private _chartContainer?: HTMLElement;
  private _chart: ElevationProfileChart;

  // Popup elements
  private _popupBackdrop?: HTMLElement;
  private _popupContainer?: HTMLElement;
  private _popupChartContainer?: HTMLElement;
  private _popupChart?: ElevationProfileChart;
  private _popupResizeObserver?: ResizeObserver;

  private _isDrawing: boolean = false;
  private _profile: ElevationProfile | null = null;

  // Popup resize state
  private _isResizing: boolean = false;
  private _ignoreBackdropClick: boolean = false;
  private _resizeStartX: number = 0;
  private _resizeStartY: number = 0;
  private _resizeStartWidth: number = 0;
  private _resizeStartHeight: number = 0;
  private _resizeObserver?: ResizeObserver;

  // Bound handlers for cleanup
  private _handlePopupResizeMouseMove: (e: MouseEvent) => void;
  private _handlePopupResizeMouseUp: (e: MouseEvent) => void;

  /**
   * Creates a new CrossSectionPanel instance.
   *
   * @param callbacks - Panel callbacks
   * @param options - Panel options
   */
  constructor(callbacks: CrossSectionPanelCallbacks, options?: CrossSectionPanelOptions) {
    this._callbacks = callbacks;
    this._options = {
      bufferDistance: options?.bufferDistance ?? 10,
      colormap: options?.colormap ?? 'viridis',
      chartHeight: options?.chartHeight ?? 180,
    };

    // Create container
    this._container = document.createElement('div');
    this._container.className = 'lidar-crosssection-panel';

    // Create inline chart (smaller, for panel)
    this._chart = new ElevationProfileChart({
      width: 320,
      height: this._options.chartHeight,
      colormap: this._options.colormap,
    });

    // Bind popup resize handlers
    this._handlePopupResizeMouseMove = this._onPopupResizeMouseMove.bind(this);
    this._handlePopupResizeMouseUp = this._onPopupResizeMouseUp.bind(this);

    this._build();
    this._setupResizeObserver();
  }

  /**
   * Renders the panel element.
   *
   * @returns Container element
   */
  render(): HTMLElement {
    return this._container;
  }

  /**
   * Updates the elevation profile display.
   *
   * @param profile - Elevation profile data
   */
  setProfile(profile: ElevationProfile | null): void {
    this._profile = profile;
    this._chart.setProfile(profile);
    this._popupChart?.setProfile(profile);
    this._updateStats();
    // Enable/disable buttons based on data availability
    const hasData = profile && profile.points.length > 0;
    if (this._downloadButton) {
      this._downloadButton.disabled = !hasData;
    }
    if (this._expandButton) {
      this._expandButton.disabled = !hasData;
    }
  }

  /**
   * Sets the drawing state.
   *
   * @param isDrawing - Whether drawing mode is active
   */
  setDrawing(isDrawing: boolean): void {
    this._isDrawing = isDrawing;
    if (this._drawButton) {
      this._drawButton.textContent = isDrawing ? 'Cancel' : 'Draw Line';
      this._drawButton.classList.toggle('active', isDrawing);
    }
  }

  /**
   * Sets the colormap.
   *
   * @param colormap - Colormap name
   */
  setColormap(colormap: ColormapName): void {
    this._options.colormap = colormap;
    this._chart.setColormap(colormap);
    this._popupChart?.setColormap(colormap);
  }

  /**
   * Sets the buffer distance.
   *
   * @param meters - Buffer distance in meters
   */
  setBufferDistance(meters: number): void {
    this._options.bufferDistance = meters;
    if (this._bufferSlider) {
      this._bufferSlider.value = String(meters);
    }
    if (this._bufferValue) {
      this._bufferValue.textContent = `${meters} m`;
    }
  }

  /**
   * Builds the panel UI.
   */
  private _build(): void {
    // Controls row
    const controls = document.createElement('div');
    controls.className = 'lidar-crosssection-controls';

    // Draw button
    this._drawButton = document.createElement('button');
    this._drawButton.type = 'button';
    this._drawButton.className = 'lidar-control-button lidar-crosssection-draw';
    this._drawButton.textContent = 'Draw Line';
    this._drawButton.addEventListener('click', (e) => {
      e.stopPropagation();
      this._isDrawing = !this._isDrawing;
      this.setDrawing(this._isDrawing);
      this._callbacks.onDrawToggle(this._isDrawing);
    });
    controls.appendChild(this._drawButton);

    // Clear button
    this._clearButton = document.createElement('button');
    this._clearButton.type = 'button';
    this._clearButton.className = 'lidar-control-button lidar-crosssection-clear';
    this._clearButton.textContent = 'Clear';
    this._clearButton.addEventListener('click', (e) => {
      e.stopPropagation();
      this._callbacks.onClear();
      this.setDrawing(false);
    });
    controls.appendChild(this._clearButton);

    // Download CSV button
    this._downloadButton = document.createElement('button');
    this._downloadButton.type = 'button';
    this._downloadButton.className = 'lidar-control-button secondary';
    this._downloadButton.textContent = 'CSV';
    this._downloadButton.title = 'Download profile data as CSV';
    this._downloadButton.disabled = true;
    this._downloadButton.addEventListener('click', (e) => {
      e.stopPropagation();
      this._downloadCSV();
    });
    controls.appendChild(this._downloadButton);

    // Expand button
    this._expandButton = document.createElement('button');
    this._expandButton.type = 'button';
    this._expandButton.className = 'lidar-control-button secondary';
    this._expandButton.innerHTML = '⤢';
    this._expandButton.title = 'Expand chart in popup';
    this._expandButton.disabled = true;
    this._expandButton.addEventListener('click', (e) => {
      e.stopPropagation();
      this._openPopup();
    });
    controls.appendChild(this._expandButton);

    this._container.appendChild(controls);

    // Buffer distance slider
    const bufferGroup = document.createElement('div');
    bufferGroup.className = 'lidar-control-group';

    const bufferLabel = document.createElement('label');
    bufferLabel.className = 'lidar-control-label';
    bufferLabel.textContent = 'Buffer Distance: ';

    this._bufferValue = document.createElement('span');
    this._bufferValue.textContent = `${this._options.bufferDistance} m`;
    bufferLabel.appendChild(this._bufferValue);
    bufferGroup.appendChild(bufferLabel);

    this._bufferSlider = document.createElement('input');
    this._bufferSlider.type = 'range';
    this._bufferSlider.className = 'lidar-control-slider';
    this._bufferSlider.min = '1';
    this._bufferSlider.max = '100';
    this._bufferSlider.step = '1';
    this._bufferSlider.value = String(this._options.bufferDistance);
    this._bufferSlider.addEventListener('input', (e) => {
      e.stopPropagation();
      const meters = parseInt(this._bufferSlider!.value, 10);
      this._bufferValue!.textContent = `${meters} m`;
      this._callbacks.onBufferDistanceChange(meters);
    });
    bufferGroup.appendChild(this._bufferSlider);

    this._container.appendChild(bufferGroup);

    // Chart container (simple, no resize handle)
    this._chartContainer = document.createElement('div');
    this._chartContainer.className = 'lidar-crosssection-chart';
    this._chartContainer.appendChild(this._chart.render());
    this._container.appendChild(this._chartContainer);

    // Statistics container
    this._statsContainer = document.createElement('div');
    this._statsContainer.className = 'lidar-crosssection-stats';
    this._container.appendChild(this._statsContainer);
    this._updateStats();
  }

  /**
   * Updates the statistics display.
   */
  private _updateStats(): void {
    if (!this._statsContainer) return;

    if (!this._profile || this._profile.points.length === 0) {
      this._statsContainer.innerHTML = '<div class="lidar-crosssection-stat">No profile data</div>';
      return;
    }

    const { stats } = this._profile;
    this._statsContainer.innerHTML = `
      <div class="lidar-crosssection-stat">
        <span class="lidar-crosssection-stat-label">Points:</span>
        <span class="lidar-crosssection-stat-value">${stats.pointCount.toLocaleString()}</span>
      </div>
      <div class="lidar-crosssection-stat">
        <span class="lidar-crosssection-stat-label">Distance:</span>
        <span class="lidar-crosssection-stat-value">${stats.totalDistance.toFixed(1)} m</span>
      </div>
      <div class="lidar-crosssection-stat">
        <span class="lidar-crosssection-stat-label">Elevation:</span>
        <span class="lidar-crosssection-stat-value">${stats.minElevation.toFixed(1)} - ${stats.maxElevation.toFixed(1)} m</span>
      </div>
      <div class="lidar-crosssection-stat">
        <span class="lidar-crosssection-stat-label">Mean:</span>
        <span class="lidar-crosssection-stat-value">${stats.meanElevation.toFixed(1)} m</span>
      </div>
    `;
  }

  /**
   * Sets up ResizeObserver for responsive chart width.
   */
  private _setupResizeObserver(): void {
    this._resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === this._container) {
          const containerWidth = entry.contentRect.width;
          const chartWidth = Math.max(200, containerWidth - 4);
          this._chart.resize(chartWidth, this._options.chartHeight);
        }
      }
    });
    this._resizeObserver.observe(this._container);
  }

  /**
   * Opens the popup with a larger, resizable chart.
   */
  private _openPopup(): void {
    if (!this._profile) return;

    // Create backdrop
    this._popupBackdrop = document.createElement('div');
    this._popupBackdrop.className = 'lidar-chart-popup-backdrop';
    this._popupBackdrop.addEventListener('click', (e) => {
      if (this._ignoreBackdropClick) {
        this._ignoreBackdropClick = false;
        return;
      }
      if (e.target === this._popupBackdrop) {
        this._closePopup();
      }
    });

    // Create popup container
    this._popupContainer = document.createElement('div');
    this._popupContainer.className = 'lidar-chart-popup';

    // Popup header
    const header = document.createElement('div');
    header.className = 'lidar-chart-popup-header';

    const title = document.createElement('span');
    title.className = 'lidar-chart-popup-title';
    title.textContent = 'Cross-Section Elevation Profile';
    header.appendChild(title);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'lidar-chart-popup-close';
    closeBtn.innerHTML = '×';
    closeBtn.title = 'Close';
    closeBtn.addEventListener('click', () => this._closePopup());
    header.appendChild(closeBtn);

    this._popupContainer.appendChild(header);

    // Create popup chart (larger)
    const popupChartContainer = document.createElement('div');
    popupChartContainer.className = 'lidar-chart-popup-content';
    this._popupChartContainer = popupChartContainer;

    this._popupChart = new ElevationProfileChart({
      width: 700,
      height: 400,
      colormap: this._options.colormap,
    });
    this._popupChart.setProfile(this._profile);
    popupChartContainer.appendChild(this._popupChart.render());

    this._popupContainer.appendChild(popupChartContainer);

    // Stats in popup
    const popupStats = document.createElement('div');
    popupStats.className = 'lidar-chart-popup-stats';
    const { stats } = this._profile;
    popupStats.innerHTML = `
      <span><strong>Points:</strong> ${stats.pointCount.toLocaleString()}</span>
      <span><strong>Distance:</strong> ${stats.totalDistance.toFixed(1)} m</span>
      <span><strong>Elevation:</strong> ${stats.minElevation.toFixed(1)} - ${stats.maxElevation.toFixed(1)} m</span>
      <span><strong>Mean:</strong> ${stats.meanElevation.toFixed(1)} m</span>
    `;
    this._popupContainer.appendChild(popupStats);

    // Resize handle (corner)
    const resizeHandle = document.createElement('div');
    resizeHandle.className = 'lidar-chart-popup-resize';
    resizeHandle.title = 'Drag to resize';
    resizeHandle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._startPopupResize(e);
    });
    this._popupContainer.appendChild(resizeHandle);

    this._popupBackdrop.appendChild(this._popupContainer);
    document.body.appendChild(this._popupBackdrop);

    // Prevent body scroll
    document.body.style.overflow = 'hidden';

    this._popupResizeObserver = new ResizeObserver(() => {
      this._syncPopupChartSize();
    });
    this._popupResizeObserver.observe(popupChartContainer);
    this._syncPopupChartSize();
  }

  /**
   * Closes the popup.
   */
  private _closePopup(): void {
    if (this._popupBackdrop) {
      this._popupBackdrop.remove();
      this._popupBackdrop = undefined;
    }
    if (this._popupChart) {
      this._popupChart.destroy();
      this._popupChart = undefined;
    }
    if (this._popupResizeObserver) {
      this._popupResizeObserver.disconnect();
      this._popupResizeObserver = undefined;
    }
    this._popupContainer = undefined;
    this._popupChartContainer = undefined;
    this._ignoreBackdropClick = false;
    document.body.style.overflow = '';
  }

  /**
   * Starts popup resize operation.
   */
  private _startPopupResize(e: MouseEvent): void {
    if (!this._popupContainer) return;

    this._isResizing = true;
    this._ignoreBackdropClick = true;
    this._resizeStartX = e.clientX;
    this._resizeStartY = e.clientY;
    const rect = this._popupContainer.getBoundingClientRect();
    this._resizeStartWidth = rect.width;
    this._resizeStartHeight = rect.height;

    document.addEventListener('mousemove', this._handlePopupResizeMouseMove);
    document.addEventListener('mouseup', this._handlePopupResizeMouseUp);
    document.body.style.cursor = 'nwse-resize';
    document.body.style.userSelect = 'none';
  }

  /**
   * Handles popup resize mouse move.
   */
  private _onPopupResizeMouseMove(e: MouseEvent): void {
    if (!this._isResizing || !this._popupContainer) return;

    const deltaX = e.clientX - this._resizeStartX;
    const deltaY = e.clientY - this._resizeStartY;

    const newWidth = Math.max(400, Math.min(window.innerWidth - 40, this._resizeStartWidth + deltaX));
    const newHeight = Math.max(300, Math.min(window.innerHeight - 40, this._resizeStartHeight + deltaY));

    this._popupContainer.style.width = `${newWidth}px`;
    this._popupContainer.style.height = `${newHeight}px`;
    this._syncPopupChartSize();
  }

  /**
   * Handles popup resize mouse up.
   */
  private _onPopupResizeMouseUp(): void {
    this._isResizing = false;
    document.removeEventListener('mousemove', this._handlePopupResizeMouseMove);
    document.removeEventListener('mouseup', this._handlePopupResizeMouseUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';

    this._syncPopupChartSize();
    window.setTimeout(() => {
      this._ignoreBackdropClick = false;
    }, 0);

    // Re-apply profile data to ensure chart is properly rendered after resize
    if (this._popupChart && this._profile) {
      this._popupChart.setProfile(this._profile);
    }
  }

  private _syncPopupChartSize(): void {
    if (!this._popupChart || !this._popupChartContainer) return;

    const rect = this._popupChartContainer.getBoundingClientRect();
    const styles = window.getComputedStyle(this._popupChartContainer);
    const paddingX =
      (Number.parseFloat(styles.paddingLeft) || 0) + (Number.parseFloat(styles.paddingRight) || 0);
    const paddingY =
      (Number.parseFloat(styles.paddingTop) || 0) + (Number.parseFloat(styles.paddingBottom) || 0);
    const chartWidth = Math.max(200, rect.width - paddingX);
    const chartHeight = Math.max(150, rect.height - paddingY);

    this._popupChart.resize(chartWidth, chartHeight);
  }

  /**
   * Downloads the profile data as CSV.
   */
  private _downloadCSV(): void {
    if (!this._profile || this._profile.points.length === 0) return;

    const headers = ['distance', 'elevation', 'offsetFromLine', 'longitude', 'latitude', 'intensity', 'classification'];
    const rows = [headers.join(',')];

    for (const point of this._profile.points) {
      const row = [
        point.distance.toFixed(3),
        point.elevation.toFixed(3),
        point.offsetFromLine.toFixed(3),
        point.longitude.toFixed(8),
        point.latitude.toFixed(8),
        point.intensity !== undefined ? point.intensity.toFixed(4) : '',
        point.classification !== undefined ? String(point.classification) : '',
      ];
      rows.push(row.join(','));
    }

    const csvContent = rows.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `cross-section-profile-${Date.now()}.csv`;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Destroys the panel and cleans up resources.
   */
  destroy(): void {
    // Close popup if open
    this._closePopup();

    // Clean up resize observer
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = undefined;
    }

    // Remove document event listeners if resizing
    if (this._isResizing) {
      document.removeEventListener('mousemove', this._handlePopupResizeMouseMove);
      document.removeEventListener('mouseup', this._handlePopupResizeMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    this._chart.destroy();
    this._container.remove();
  }
}
