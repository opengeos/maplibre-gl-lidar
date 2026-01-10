/**
 * Clamps a value between a minimum and maximum.
 *
 * @param value - The value to clamp
 * @param min - The minimum allowed value
 * @param max - The maximum allowed value
 * @returns The clamped value
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/**
 * Formats a numeric value with appropriate decimal places based on step size.
 *
 * @param value - The value to format
 * @param step - The step size to determine decimal places
 * @returns The formatted value as a string
 */
export function formatNumericValue(value: number, step: number): string {
  if (step === 0) return value.toString();
  const decimals = Math.max(0, -Math.floor(Math.log10(step)));
  return value.toFixed(decimals);
}

/**
 * Generates a unique ID string.
 *
 * @param prefix - Optional prefix for the ID
 * @returns A unique ID string
 */
export function generateId(prefix?: string): string {
  const id = Math.random().toString(36).substring(2, 9);
  return prefix ? `${prefix}-${id}` : id;
}

/**
 * Debounces a function call.
 *
 * @param fn - The function to debounce
 * @param delay - The delay in milliseconds
 * @returns A debounced version of the function
 */
export function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, delay);
  };
}

/**
 * Throttles a function call.
 *
 * @param fn - The function to throttle
 * @param limit - The minimum time between calls in milliseconds
 * @returns A throttled version of the function
 */
export function throttle<T extends (...args: unknown[]) => void>(
  fn: T,
  limit: number
): (...args: Parameters<T>) => void {
  let inThrottle = false;

  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      fn(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
}

/**
 * Creates a CSS class string from an object of class names.
 *
 * @param classes - Object with class names as keys and boolean values
 * @returns A space-separated string of class names
 */
export function classNames(classes: Record<string, boolean>): string {
  return Object.entries(classes)
    .filter(([, value]) => value)
    .map(([key]) => key)
    .join(' ');
}

/**
 * Formats a number with thousand separators.
 *
 * @param num - The number to format
 * @returns Formatted string with commas
 */
export function formatNumber(num: number): string {
  return num.toLocaleString();
}

/**
 * Formats bytes into human-readable size.
 *
 * @param bytes - Number of bytes
 * @returns Human-readable size string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

/**
 * Extracts filename from a path or URL.
 *
 * @param path - File path or URL
 * @returns Filename without path
 */
export function getFilename(path: string): string {
  // Handle both Unix and Windows path separators
  const normalized = path.replace(/\\/g, '/');
  return normalized.split('/').pop()?.split('?')[0] || 'unknown';
}
