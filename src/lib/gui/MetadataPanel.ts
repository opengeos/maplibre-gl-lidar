import type { PointCloudFullMetadata, DimensionInfo } from '../core/types';

/**
 * Options for MetadataPanel
 */
export interface MetadataPanelOptions {
  /** Callback when panel is closed */
  onClose: () => void;
}

/**
 * Modal panel for displaying full point cloud metadata.
 * Displays metadata in collapsible sections with copy functionality.
 */
export class MetadataPanel {
  private _container: HTMLElement | null = null;
  private _backdrop: HTMLElement | null = null;
  private _options: MetadataPanelOptions;
  private _metadata: PointCloudFullMetadata | null = null;

  /**
   * Creates a new MetadataPanel instance.
   *
   * @param options - Panel options
   */
  constructor(options: MetadataPanelOptions) {
    this._options = options;
  }

  /**
   * Shows the metadata panel with the given metadata.
   *
   * @param metadata - Full metadata to display
   */
  show(metadata: PointCloudFullMetadata): void {
    this._metadata = metadata;
    this._render();
  }

  /**
   * Hides and destroys the metadata panel.
   */
  hide(): void {
    this._backdrop?.remove();
    this._container?.remove();
    this._backdrop = null;
    this._container = null;
  }

  /**
   * Renders the metadata panel.
   */
  private _render(): void {
    if (!this._metadata) return;

    // Create backdrop
    this._backdrop = document.createElement('div');
    this._backdrop.className = 'lidar-metadata-backdrop';
    this._backdrop.addEventListener('click', () => this._close());
    document.body.appendChild(this._backdrop);

    // Create panel
    this._container = document.createElement('div');
    this._container.className = 'lidar-metadata-panel';
    this._container.addEventListener('click', (e) => e.stopPropagation());

    // Header
    const header = document.createElement('div');
    header.className = 'lidar-metadata-header';
    header.innerHTML = `
      <span class="lidar-metadata-title">Point Cloud Metadata</span>
      <button type="button" class="lidar-metadata-close" title="Close">&times;</button>
    `;
    header.querySelector('.lidar-metadata-close')?.addEventListener('click', () => this._close());
    this._container.appendChild(header);

    // Content
    const content = document.createElement('div');
    content.className = 'lidar-metadata-content';

    // Basic Info section
    content.appendChild(this._buildBasicInfoSection());

    // Bounds section
    content.appendChild(this._buildBoundsSection());

    // CRS section
    content.appendChild(this._buildCrsSection());

    // Point Format section
    content.appendChild(this._buildPointFormatSection());

    // Dimensions section
    content.appendChild(this._buildDimensionsSection());

    this._container.appendChild(content);
    document.body.appendChild(this._container);
  }

  /**
   * Closes the panel and calls the onClose callback.
   */
  private _close(): void {
    this.hide();
    this._options.onClose();
  }

  /**
   * Builds the basic info section.
   *
   * @returns Section element
   */
  private _buildBasicInfoSection(): HTMLElement {
    const section = this._createSection('Basic Info', true);
    const body = section.querySelector('.lidar-metadata-section-body')!;

    const meta = this._metadata!;
    const basic = meta.basic;

    const rows = [
      { label: 'Name', value: basic.name },
      { label: 'Type', value: meta.type.toUpperCase() },
      { label: 'Point Count', value: this._formatNumber(basic.pointCount) },
      { label: 'Has RGB', value: basic.hasRGB ? 'Yes' : 'No' },
      { label: 'Has Intensity', value: basic.hasIntensity ? 'Yes' : 'No' },
      { label: 'Has Classification', value: basic.hasClassification ? 'Yes' : 'No' },
      { label: 'Source', value: basic.source },
    ];

    // Add type-specific info
    if (meta.type === 'copc' && meta.copc) {
      rows.push({ label: 'LAS Version', value: meta.copc.lasVersion });
      rows.push({ label: 'Point Format', value: String(meta.copc.pointDataRecordFormat) });
      rows.push({ label: 'Generating Software', value: meta.copc.generatingSoftware });
      if (meta.copc.creationDate) {
        rows.push({
          label: 'Creation Date',
          value: `${meta.copc.creationDate.year}, Day ${meta.copc.creationDate.dayOfYear}`
        });
      }
      if (meta.copc.copcInfo) {
        rows.push({ label: 'COPC Spacing', value: meta.copc.copcInfo.spacing.toFixed(2) + ' m' });
      }
    }

    if (meta.type === 'ept' && meta.ept) {
      rows.push({ label: 'EPT Version', value: meta.ept.version });
      rows.push({ label: 'Data Type', value: meta.ept.dataType });
      rows.push({ label: 'Hierarchy Type', value: meta.ept.hierarchyType });
      rows.push({ label: 'Span', value: String(meta.ept.span) });
    }

    for (const row of rows) {
      body.appendChild(this._createRow(row.label, row.value));
    }

    return section;
  }

  /**
   * Builds the bounds section.
   *
   * @returns Section element
   */
  private _buildBoundsSection(): HTMLElement {
    const section = this._createSection('Bounds', false);
    const body = section.querySelector('.lidar-metadata-section-body')!;

    const meta = this._metadata!;
    const basic = meta.basic;

    // WGS84 bounds (transformed)
    body.appendChild(this._createSubheader('Geographic (WGS84)'));
    body.appendChild(this._createRow('Min X (Lng)', basic.bounds.minX.toFixed(6) + '°'));
    body.appendChild(this._createRow('Max X (Lng)', basic.bounds.maxX.toFixed(6) + '°'));
    body.appendChild(this._createRow('Min Y (Lat)', basic.bounds.minY.toFixed(6) + '°'));
    body.appendChild(this._createRow('Max Y (Lat)', basic.bounds.maxY.toFixed(6) + '°'));
    body.appendChild(this._createRow('Min Z', basic.bounds.minZ.toFixed(2) + ' m'));
    body.appendChild(this._createRow('Max Z', basic.bounds.maxZ.toFixed(2) + ' m'));

    // Native bounds if available
    if (meta.type === 'copc' && meta.copc?.nativeBounds) {
      body.appendChild(this._createSubheader('Native CRS'));
      const nb = meta.copc.nativeBounds;
      body.appendChild(this._createRow('Min X', nb.min[0].toFixed(3)));
      body.appendChild(this._createRow('Max X', nb.max[0].toFixed(3)));
      body.appendChild(this._createRow('Min Y', nb.min[1].toFixed(3)));
      body.appendChild(this._createRow('Max Y', nb.max[1].toFixed(3)));
      body.appendChild(this._createRow('Min Z', nb.min[2].toFixed(3)));
      body.appendChild(this._createRow('Max Z', nb.max[2].toFixed(3)));
    }

    if (meta.type === 'ept' && meta.ept?.nativeBounds && meta.ept.nativeBounds.length >= 6) {
      body.appendChild(this._createSubheader('Native CRS'));
      const nb = meta.ept.nativeBounds;
      body.appendChild(this._createRow('Min X', nb[0].toFixed(3)));
      body.appendChild(this._createRow('Max X', nb[3].toFixed(3)));
      body.appendChild(this._createRow('Min Y', nb[1].toFixed(3)));
      body.appendChild(this._createRow('Max Y', nb[4].toFixed(3)));
      body.appendChild(this._createRow('Min Z', nb[2].toFixed(3)));
      body.appendChild(this._createRow('Max Z', nb[5].toFixed(3)));
    }

    return section;
  }

  /**
   * Builds the CRS section.
   *
   * @returns Section element
   */
  private _buildCrsSection(): HTMLElement {
    const section = this._createSection('Coordinate Reference System', false);
    const body = section.querySelector('.lidar-metadata-section-body')!;

    const meta = this._metadata!;
    const wkt = meta.basic.wkt;

    if (wkt) {
      // WKT display with copy button
      const wktContainer = document.createElement('div');
      wktContainer.className = 'lidar-metadata-wkt';

      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.className = 'lidar-metadata-copy-btn';
      copyBtn.textContent = 'Copy WKT';
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(wkt).then(() => {
          copyBtn.textContent = 'Copied!';
          setTimeout(() => {
            copyBtn.textContent = 'Copy WKT';
          }, 2000);
        });
      });
      wktContainer.appendChild(copyBtn);

      const wktCode = document.createElement('pre');
      wktCode.className = 'lidar-metadata-code';
      // Format WKT for better readability
      wktCode.textContent = this._formatWkt(wkt);
      wktContainer.appendChild(wktCode);

      body.appendChild(wktContainer);
    } else {
      body.appendChild(this._createRow('WKT', 'Not available'));
    }

    // EPT SRS info
    if (meta.type === 'ept' && meta.ept?.srs) {
      const srs = meta.ept.srs;
      if (srs.authority) {
        body.appendChild(this._createRow('Authority', srs.authority));
      }
      if (srs.horizontal) {
        body.appendChild(this._createRow('Horizontal', srs.horizontal));
      }
      if (srs.vertical) {
        body.appendChild(this._createRow('Vertical', srs.vertical));
      }
    }

    // COPC scale/offset
    if (meta.type === 'copc' && meta.copc) {
      body.appendChild(this._createSubheader('Scale & Offset'));
      body.appendChild(this._createRow('Scale X', meta.copc.scale[0].toExponential(4)));
      body.appendChild(this._createRow('Scale Y', meta.copc.scale[1].toExponential(4)));
      body.appendChild(this._createRow('Scale Z', meta.copc.scale[2].toExponential(4)));
      body.appendChild(this._createRow('Offset X', meta.copc.offset[0].toFixed(3)));
      body.appendChild(this._createRow('Offset Y', meta.copc.offset[1].toFixed(3)));
      body.appendChild(this._createRow('Offset Z', meta.copc.offset[2].toFixed(3)));
    }

    return section;
  }

  /**
   * Builds the point format section.
   *
   * @returns Section element
   */
  private _buildPointFormatSection(): HTMLElement {
    const section = this._createSection('Point Format', false);
    const body = section.querySelector('.lidar-metadata-section-body')!;

    const meta = this._metadata!;

    if (meta.type === 'copc' && meta.copc) {
      body.appendChild(this._createRow('Point Data Record Format', String(meta.copc.pointDataRecordFormat)));
      body.appendChild(this._createRow('LAS Version', meta.copc.lasVersion));

      // Describe point format
      const format = meta.copc.pointDataRecordFormat;
      const formatDescriptions: Record<number, string> = {
        0: 'Core (XYZ, Intensity, Return, Classification)',
        1: 'Format 0 + GPS Time',
        2: 'Format 0 + RGB',
        3: 'Format 0 + GPS Time + RGB',
        6: 'Extended (14-bit Classification, NIR)',
        7: 'Format 6 + RGB',
        8: 'Format 6 + RGB + NIR',
      };
      if (formatDescriptions[format]) {
        body.appendChild(this._createRow('Description', formatDescriptions[format]));
      }
    }

    if (meta.type === 'ept' && meta.ept) {
      body.appendChild(this._createRow('Data Encoding', meta.ept.dataType));
    }

    return section;
  }

  /**
   * Builds the dimensions section.
   *
   * @returns Section element
   */
  private _buildDimensionsSection(): HTMLElement {
    const section = this._createSection('Dimensions', false);
    const body = section.querySelector('.lidar-metadata-section-body')!;

    const meta = this._metadata!;
    let dimensions: DimensionInfo[] = [];

    if (meta.type === 'copc' && meta.copc?.dimensions) {
      dimensions = meta.copc.dimensions;
    } else if (meta.type === 'ept' && meta.ept?.dimensions) {
      dimensions = meta.ept.dimensions;
    }

    if (dimensions.length > 0) {
      // Create table
      const table = document.createElement('table');
      table.className = 'lidar-metadata-table';
      table.innerHTML = `
        <thead>
          <tr>
            <th>Name</th>
            <th>Type</th>
            <th>Size</th>
          </tr>
        </thead>
        <tbody></tbody>
      `;
      const tbody = table.querySelector('tbody')!;

      for (const dim of dimensions) {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${dim.name}</td>
          <td>${dim.type}</td>
          <td>${dim.size} bytes</td>
        `;
        tbody.appendChild(tr);
      }

      body.appendChild(table);
    } else {
      body.appendChild(this._createRow('Dimensions', 'Not available'));
    }

    return section;
  }

  /**
   * Creates a collapsible section.
   *
   * @param title - Section title
   * @param expanded - Whether section starts expanded
   * @returns Section element
   */
  private _createSection(title: string, expanded: boolean): HTMLElement {
    const section = document.createElement('div');
    section.className = 'lidar-metadata-section';

    const header = document.createElement('div');
    header.className = 'lidar-metadata-section-header';
    header.innerHTML = `
      <span class="lidar-metadata-section-toggle">${expanded ? '▼' : '▶'}</span>
      <span class="lidar-metadata-section-title">${title}</span>
    `;

    const body = document.createElement('div');
    body.className = 'lidar-metadata-section-body';
    body.style.display = expanded ? 'block' : 'none';

    header.addEventListener('click', () => {
      const toggle = header.querySelector('.lidar-metadata-section-toggle')!;
      if (body.style.display === 'none') {
        body.style.display = 'block';
        toggle.textContent = '▼';
      } else {
        body.style.display = 'none';
        toggle.textContent = '▶';
      }
    });

    section.appendChild(header);
    section.appendChild(body);

    return section;
  }

  /**
   * Creates a key-value row.
   *
   * @param label - Row label
   * @param value - Row value
   * @returns Row element
   */
  private _createRow(label: string, value: string): HTMLElement {
    const row = document.createElement('div');
    row.className = 'lidar-metadata-row';
    row.innerHTML = `
      <span class="lidar-metadata-label">${label}:</span>
      <span class="lidar-metadata-value">${value}</span>
    `;
    return row;
  }

  /**
   * Creates a subheader element.
   *
   * @param title - Subheader title
   * @returns Subheader element
   */
  private _createSubheader(title: string): HTMLElement {
    const subheader = document.createElement('div');
    subheader.className = 'lidar-metadata-subheader';
    subheader.textContent = title;
    return subheader;
  }

  /**
   * Formats a number with commas.
   *
   * @param n - Number to format
   * @returns Formatted string
   */
  private _formatNumber(n: number): string {
    return n.toLocaleString();
  }

  /**
   * Formats a WKT string for display.
   *
   * @param wkt - WKT string
   * @returns Formatted WKT
   */
  private _formatWkt(wkt: string): string {
    // Simple formatting: add newlines after [ and before ]
    let formatted = '';
    let indent = 0;
    for (let i = 0; i < wkt.length; i++) {
      const char = wkt[i];
      if (char === '[') {
        formatted += '[\n' + '  '.repeat(++indent);
      } else if (char === ']') {
        formatted += '\n' + '  '.repeat(--indent) + ']';
      } else if (char === ',') {
        formatted += ',\n' + '  '.repeat(indent);
      } else {
        formatted += char;
      }
    }
    return formatted;
  }
}
