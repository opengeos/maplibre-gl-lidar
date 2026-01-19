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
  private _bufferSlider?: HTMLInputElement;
  private _bufferValue?: HTMLSpanElement;
  private _statsContainer?: HTMLElement;
  private _chartWrapper?: HTMLElement;
  private _chartContainer?: HTMLElement;
  private _resizeHandle?: HTMLElement;
  private _chart: ElevationProfileChart;

  private _isDrawing: boolean = false;
  private _profile: ElevationProfile | null = null;

  // Resize state
  private _isResizing: boolean = false;
  private _resizeStartY: number = 0;
  private _resizeStartHeight: number = 0;
  private _resizeObserver?: ResizeObserver;

  // Bound handlers for cleanup
  private _handleResizeMouseMove: (e: MouseEvent) => void;
  private _handleResizeMouseUp: (e: MouseEvent) => void;

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
      chartHeight: options?.chartHeight ?? 200,
    };

    // Create container
    this._container = document.createElement('div');
    this._container.className = 'lidar-crosssection-panel';

    // Create chart with responsive width
    this._chart = new ElevationProfileChart({
      width: 320,
      height: this._options.chartHeight,
      colormap: this._options.colormap,
    });

    // Bind resize handlers
    this._handleResizeMouseMove = this._onResizeMouseMove.bind(this);
    this._handleResizeMouseUp = this._onResizeMouseUp.bind(this);

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
    this._updateStats();
    // Enable/disable download button based on data availability
    if (this._downloadButton) {
      this._downloadButton.disabled = !profile || profile.points.length === 0;
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
    // Header
    const header = document.createElement('div');
    header.className = 'lidar-crosssection-header';
    header.innerHTML = '<span>Cross-Section Profile</span>';
    this._container.appendChild(header);

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
    this._downloadButton.className = 'lidar-control-button lidar-crosssection-download secondary';
    this._downloadButton.textContent = 'CSV';
    this._downloadButton.title = 'Download profile data as CSV';
    this._downloadButton.disabled = true;
    this._downloadButton.addEventListener('click', (e) => {
      e.stopPropagation();
      this._downloadCSV();
    });
    controls.appendChild(this._downloadButton);

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

    // Chart wrapper (for resize functionality)
    this._chartWrapper = document.createElement('div');
    this._chartWrapper.className = 'lidar-crosssection-chart-wrapper';

    // Chart container
    this._chartContainer = document.createElement('div');
    this._chartContainer.className = 'lidar-crosssection-chart';
    this._chartContainer.appendChild(this._chart.render());
    this._chartWrapper.appendChild(this._chartContainer);

    // Resize handle
    this._resizeHandle = document.createElement('div');
    this._resizeHandle.className = 'lidar-chart-resize-handle';
    this._resizeHandle.title = 'Drag to resize chart height';
    this._resizeHandle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._startResize(e);
    });
    this._chartWrapper.appendChild(this._resizeHandle);

    this._container.appendChild(this._chartWrapper);

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
          // Calculate chart width (container width minus padding)
          const chartWidth = Math.max(200, containerWidth - 16);
          this._chart.resize(chartWidth, this._options.chartHeight);
        }
      }
    });
    this._resizeObserver.observe(this._container);
  }

  /**
   * Starts the chart height resize operation.
   *
   * @param e - Mouse event
   */
  private _startResize(e: MouseEvent): void {
    this._isResizing = true;
    this._resizeStartY = e.clientY;
    this._resizeStartHeight = this._options.chartHeight;
    document.addEventListener('mousemove', this._handleResizeMouseMove);
    document.addEventListener('mouseup', this._handleResizeMouseUp);
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
  }

  /**
   * Handles mouse move during resize.
   *
   * @param e - Mouse event
   */
  private _onResizeMouseMove(e: MouseEvent): void {
    if (!this._isResizing) return;

    const deltaY = e.clientY - this._resizeStartY;
    const newHeight = Math.max(100, Math.min(500, this._resizeStartHeight + deltaY));
    this._options.chartHeight = newHeight;

    // Get current width from container
    const containerWidth = this._container.getBoundingClientRect().width;
    const chartWidth = Math.max(200, containerWidth - 16);
    this._chart.resize(chartWidth, newHeight);
  }

  /**
   * Handles mouse up to end resize.
   *
   * @param e - Mouse event
   */
  private _onResizeMouseUp(_e: MouseEvent): void {
    this._isResizing = false;
    document.removeEventListener('mousemove', this._handleResizeMouseMove);
    document.removeEventListener('mouseup', this._handleResizeMouseUp);
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
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
    // Clean up resize observer
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = undefined;
    }

    // Remove document event listeners if resizing
    if (this._isResizing) {
      document.removeEventListener('mousemove', this._handleResizeMouseMove);
      document.removeEventListener('mouseup', this._handleResizeMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    this._chart.destroy();
    this._container.remove();
  }
}
