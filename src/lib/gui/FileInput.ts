/**
 * Options for creating a file input
 */
export interface FileInputOptions {
  accept?: string;
  onChange: (file: File) => void;
  label?: string;
}

/**
 * Creates a styled file input with drag-and-drop support.
 */
export class FileInput {
  private _options: FileInputOptions;
  private _input?: HTMLInputElement;
  private _label?: HTMLElement;

  constructor(options: FileInputOptions) {
    this._options = {
      accept: '.las,.laz',
      label: 'Drop LAS/LAZ file here or click to browse',
      ...options,
    };
  }

  /**
   * Renders the file input element.
   *
   * @returns The file input container element
   */
  render(): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'lidar-file-input-wrapper';

    const labelEl = document.createElement('div');
    labelEl.className = 'lidar-file-input-label';
    labelEl.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="17 8 12 3 7 8"/>
        <line x1="12" y1="3" x2="12" y2="15"/>
      </svg>
      <span>${this._options.label}</span>
    `;
    this._label = labelEl;

    const input = document.createElement('input');
    input.type = 'file';
    input.className = 'lidar-file-input';
    input.accept = this._options.accept || '';
    this._input = input;

    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (file) {
        this._options.onChange(file);
        // Reset the input so the same file can be selected again
        input.value = '';
      }
    });

    // Drag and drop handling
    labelEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      labelEl.classList.add('drag-over');
    });

    labelEl.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      labelEl.classList.remove('drag-over');
    });

    labelEl.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      labelEl.classList.remove('drag-over');

      const file = e.dataTransfer?.files?.[0];
      if (file && this._isValidFile(file)) {
        this._options.onChange(file);
      }
    });

    wrapper.appendChild(input);
    wrapper.appendChild(labelEl);

    return wrapper;
  }

  /**
   * Sets the label text.
   *
   * @param text - New label text
   */
  setLabel(text: string): void {
    if (this._label) {
      const span = this._label.querySelector('span');
      if (span) {
        span.textContent = text;
      }
    }
  }

  /**
   * Resets the label to default.
   */
  resetLabel(): void {
    this.setLabel(this._options.label || 'Drop LAS/LAZ file here or click to browse');
  }

  /**
   * Enables or disables the input.
   *
   * @param enabled - Whether to enable
   */
  setEnabled(enabled: boolean): void {
    if (this._input) {
      this._input.disabled = !enabled;
    }
    if (this._label) {
      this._label.style.pointerEvents = enabled ? 'auto' : 'none';
      this._label.style.opacity = enabled ? '1' : '0.5';
    }
  }

  /**
   * Checks if a file has a valid extension.
   */
  private _isValidFile(file: File): boolean {
    const accept = this._options.accept || '';
    const extensions = accept.split(',').map((ext) => ext.trim().toLowerCase());
    const fileName = file.name.toLowerCase();
    return extensions.some((ext) => fileName.endsWith(ext.replace('*', '')));
  }
}
