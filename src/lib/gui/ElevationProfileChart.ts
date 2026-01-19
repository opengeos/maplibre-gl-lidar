import type { ElevationProfile, ProfilePoint } from '../core/types';
import type { ColormapName } from '../core/types';
import { getColormap } from '../colorizers/Colormaps';

/**
 * Options for ElevationProfileChart
 */
export interface ElevationProfileChartOptions {
  /** Chart width in pixels */
  width?: number;
  /** Chart height in pixels */
  height?: number;
  /** Colormap for elevation coloring */
  colormap?: ColormapName;
  /** Callback when a point is hovered */
  onPointHover?: (point: ProfilePoint | null, x: number, y: number) => void;
}

/**
 * Canvas-based elevation profile chart.
 * Plots distance (x-axis) vs elevation (y-axis) with interactive hover.
 */
export class ElevationProfileChart {
  private _container: HTMLElement;
  private _canvas: HTMLCanvasElement;
  private _ctx: CanvasRenderingContext2D;
  private _tooltip: HTMLElement;
  private _options: Required<ElevationProfileChartOptions>;
  private _profile: ElevationProfile | null = null;
  private _hoveredPointIndex: number = -1;

  // Chart dimensions (with margins)
  private readonly MARGIN = { top: 20, right: 20, bottom: 40, left: 60 };

  /**
   * Creates a new ElevationProfileChart instance.
   *
   * @param options - Chart options
   */
  constructor(options?: ElevationProfileChartOptions) {
    this._options = {
      width: options?.width ?? 300,
      height: options?.height ?? 150,
      colormap: options?.colormap ?? 'viridis',
      onPointHover: options?.onPointHover ?? (() => {}),
    };

    // Create container
    this._container = document.createElement('div');
    this._container.className = 'lidar-profile-chart-container';

    // Create canvas
    this._canvas = document.createElement('canvas');
    this._canvas.className = 'lidar-profile-chart';
    this._canvas.width = this._options.width;
    this._canvas.height = this._options.height;
    this._container.appendChild(this._canvas);

    this._ctx = this._canvas.getContext('2d')!;

    // Create tooltip
    this._tooltip = document.createElement('div');
    this._tooltip.className = 'lidar-profile-tooltip';
    this._tooltip.style.display = 'none';
    this._container.appendChild(this._tooltip);

    // Setup mouse events
    this._canvas.addEventListener('mousemove', this._handleMouseMove.bind(this));
    this._canvas.addEventListener('mouseleave', this._handleMouseLeave.bind(this));
  }

  /**
   * Renders the chart container element.
   *
   * @returns Container element
   */
  render(): HTMLElement {
    return this._container;
  }

  /**
   * Sets the elevation profile data and redraws the chart.
   *
   * @param profile - Elevation profile to display
   */
  setProfile(profile: ElevationProfile | null): void {
    this._profile = profile;
    this._draw();
  }

  /**
   * Sets the colormap and redraws the chart.
   *
   * @param colormap - Colormap name
   */
  setColormap(colormap: ColormapName): void {
    this._options.colormap = colormap;
    this._draw();
  }

  /**
   * Resizes the chart.
   *
   * @param width - New width
   * @param height - New height
   */
  resize(width: number, height: number): void {
    // Ensure valid dimensions
    const safeWidth = Math.max(100, Math.round(width));
    const safeHeight = Math.max(80, Math.round(height));

    this._options.width = safeWidth;
    this._options.height = safeHeight;
    this._canvas.width = safeWidth;
    this._canvas.height = safeHeight;

    // Re-acquire context after resize (some browsers need this)
    const ctx = this._canvas.getContext('2d');
    if (ctx) {
      this._ctx = ctx;
    }

    this._draw();
  }

  /**
   * Draws the chart.
   */
  private _draw(): void {
    const { width, height } = this._options;
    const ctx = this._ctx;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw background
    ctx.fillStyle = '#f8f8f8';
    ctx.fillRect(0, 0, width, height);

    if (!this._profile || this._profile.points.length === 0) {
      this._drawNoData();
      return;
    }

    // Calculate plot area
    const plotWidth = width - this.MARGIN.left - this.MARGIN.right;
    const plotHeight = height - this.MARGIN.top - this.MARGIN.bottom;

    // Draw grid
    this._drawGrid(plotWidth, plotHeight);

    // Draw points
    this._drawPoints(plotWidth, plotHeight);

    // Draw axes
    this._drawAxes(plotWidth, plotHeight);
  }

  /**
   * Draws "No data" message.
   */
  private _drawNoData(): void {
    const { width, height } = this._options;
    const ctx = this._ctx;

    ctx.fillStyle = '#888';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Draw a cross-section line to view elevation profile', width / 2, height / 2);
  }

  /**
   * Draws grid lines.
   *
   * @param plotWidth - Plot area width
   * @param plotHeight - Plot area height
   */
  private _drawGrid(plotWidth: number, plotHeight: number): void {
    const ctx = this._ctx;
    const { left, top } = this.MARGIN;

    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1;

    // Horizontal grid lines (5 lines)
    for (let i = 0; i <= 4; i++) {
      const y = top + (plotHeight * i) / 4;
      ctx.beginPath();
      ctx.moveTo(left, y);
      ctx.lineTo(left + plotWidth, y);
      ctx.stroke();
    }

    // Vertical grid lines (5 lines)
    for (let i = 0; i <= 4; i++) {
      const x = left + (plotWidth * i) / 4;
      ctx.beginPath();
      ctx.moveTo(x, top);
      ctx.lineTo(x, top + plotHeight);
      ctx.stroke();
    }
  }

  /**
   * Draws the profile points.
   *
   * @param plotWidth - Plot area width
   * @param plotHeight - Plot area height
   */
  private _drawPoints(plotWidth: number, plotHeight: number): void {
    if (!this._profile) return;

    const ctx = this._ctx;
    const { left, top } = this.MARGIN;
    const { points, stats } = this._profile;
    const colormap = getColormap(this._options.colormap);

    const xScale = plotWidth / stats.totalDistance;
    const yRange = stats.maxElevation - stats.minElevation;
    const yScale = yRange > 0 ? plotHeight / yRange : 1;

    // Draw points
    const pointRadius = Math.max(1, Math.min(3, 500 / points.length));

    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      const x = left + point.distance * xScale;
      const y = top + plotHeight - (point.elevation - stats.minElevation) * yScale;

      // Get color from colormap
      const t = yRange > 0 ? (point.elevation - stats.minElevation) / yRange : 0.5;
      const colorIndex = Math.floor(t * (colormap.length - 1));
      const color = colormap[Math.max(0, Math.min(colormap.length - 1, colorIndex))];

      ctx.fillStyle = `rgb(${color[0]}, ${color[1]}, ${color[2]})`;

      ctx.beginPath();
      ctx.arc(x, y, pointRadius, 0, Math.PI * 2);
      ctx.fill();

      // Highlight hovered point
      if (i === this._hoveredPointIndex) {
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(x, y, pointRadius + 2, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  /**
   * Draws the axes and labels.
   *
   * @param plotWidth - Plot area width
   * @param plotHeight - Plot area height
   */
  private _drawAxes(plotWidth: number, plotHeight: number): void {
    if (!this._profile) return;

    const ctx = this._ctx;
    const { left, top } = this.MARGIN;
    const { width, height } = this._options;
    const { stats } = this._profile;

    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;

    // Y axis
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(left, top + plotHeight);
    ctx.stroke();

    // X axis
    ctx.beginPath();
    ctx.moveTo(left, top + plotHeight);
    ctx.lineTo(left + plotWidth, top + plotHeight);
    ctx.stroke();

    // Axis labels
    ctx.fillStyle = '#333';
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    // X axis labels
    for (let i = 0; i <= 4; i++) {
      const x = left + (plotWidth * i) / 4;
      const dist = (stats.totalDistance * i) / 4;
      ctx.fillText(this._formatDistance(dist), x, top + plotHeight + 5);
    }

    // X axis title
    ctx.textBaseline = 'bottom';
    ctx.fillText('Distance (m)', width / 2, height - 6);

    // Y axis labels
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    const yRange = stats.maxElevation - stats.minElevation;

    for (let i = 0; i <= 4; i++) {
      const y = top + plotHeight - (plotHeight * i) / 4;
      const elev = stats.minElevation + (yRange * i) / 4;
      ctx.fillText(elev.toFixed(1), left - 5, y);
    }

    // Y axis title (rotated)
    ctx.save();
    ctx.translate(12, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('Elevation (m)', 0, 0);
    ctx.restore();
  }

  /**
   * Formats distance for display.
   *
   * @param meters - Distance in meters
   * @returns Formatted string
   */
  private _formatDistance(meters: number): string {
    if (meters >= 1000) {
      return (meters / 1000).toFixed(1) + 'km';
    }
    return Math.round(meters) + '';
  }

  /**
   * Handles mouse move for hover interaction.
   *
   * @param event - Mouse event
   */
  private _handleMouseMove(event: MouseEvent): void {
    if (!this._profile || this._profile.points.length === 0) {
      this._hideTooltip();
      return;
    }

    const rect = this._canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    const { left, top } = this.MARGIN;
    const plotWidth = this._options.width - this.MARGIN.left - this.MARGIN.right;
    const plotHeight = this._options.height - this.MARGIN.top - this.MARGIN.bottom;
    const { points, stats } = this._profile;

    const xScale = plotWidth / stats.totalDistance;
    const yRange = stats.maxElevation - stats.minElevation;
    const yScale = yRange > 0 ? plotHeight / yRange : 1;

    // Find closest point
    let closestIndex = -1;
    let closestDist = Infinity;

    for (let i = 0; i < points.length; i++) {
      const point = points[i];
      const px = left + point.distance * xScale;
      const py = top + plotHeight - (point.elevation - stats.minElevation) * yScale;
      const dist = Math.sqrt((mouseX - px) ** 2 + (mouseY - py) ** 2);

      if (dist < closestDist && dist < 15) {
        closestDist = dist;
        closestIndex = i;
      }
    }

    if (closestIndex !== this._hoveredPointIndex) {
      this._hoveredPointIndex = closestIndex;
      this._draw();

      if (closestIndex >= 0) {
        const point = points[closestIndex];
        this._showTooltip(point, event.clientX, event.clientY);
        this._options.onPointHover(point, event.clientX, event.clientY);
      } else {
        this._hideTooltip();
        this._options.onPointHover(null, 0, 0);
      }
    }
  }

  /**
   * Handles mouse leave.
   */
  private _handleMouseLeave(): void {
    this._hoveredPointIndex = -1;
    this._draw();
    this._hideTooltip();
    this._options.onPointHover(null, 0, 0);
  }

  /**
   * Shows the tooltip.
   *
   * @param point - Profile point
   * @param x - Screen X coordinate
   * @param y - Screen Y coordinate
   */
  private _showTooltip(point: ProfilePoint, x: number, y: number): void {
    const lines = [
      `Distance: ${point.distance.toFixed(1)} m`,
      `Elevation: ${point.elevation.toFixed(2)} m`,
      `Offset: ${point.offsetFromLine.toFixed(2)} m`,
    ];

    if (point.classification !== undefined) {
      lines.push(`Class: ${point.classification}`);
    }

    this._tooltip.innerHTML = lines.join('<br>');
    this._tooltip.style.display = 'block';

    // Position tooltip
    const rect = this._container.getBoundingClientRect();
    this._tooltip.style.left = `${x - rect.left + 10}px`;
    this._tooltip.style.top = `${y - rect.top - 40}px`;
  }

  /**
   * Hides the tooltip.
   */
  private _hideTooltip(): void {
    this._tooltip.style.display = 'none';
  }

  /**
   * Destroys the chart and cleans up resources.
   */
  destroy(): void {
    this._canvas.removeEventListener('mousemove', this._handleMouseMove.bind(this));
    this._canvas.removeEventListener('mouseleave', this._handleMouseLeave.bind(this));
    this._container.remove();
  }
}
