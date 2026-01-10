import { describe, it, expect } from 'vitest';
import {
  clamp,
  formatNumericValue,
  generateId,
  classNames,
  formatNumber,
  formatBytes,
  getFilename,
} from '../src/lib/utils/helpers';

describe('clamp', () => {
  it('should return value when within range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(0, 0, 10)).toBe(0);
    expect(clamp(10, 0, 10)).toBe(10);
  });

  it('should return min when value is below range', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(-100, 0, 10)).toBe(0);
  });

  it('should return max when value is above range', () => {
    expect(clamp(15, 0, 10)).toBe(10);
    expect(clamp(100, 0, 10)).toBe(10);
  });
});

describe('formatNumericValue', () => {
  it('should format integers', () => {
    expect(formatNumericValue(5, 1)).toBe('5');
    expect(formatNumericValue(100, 1)).toBe('100');
  });

  it('should format decimals based on step', () => {
    expect(formatNumericValue(0.5, 0.1)).toBe('0.5');
    expect(formatNumericValue(0.55, 0.01)).toBe('0.55');
    expect(formatNumericValue(1.234, 0.001)).toBe('1.234');
  });

  it('should handle zero step', () => {
    expect(formatNumericValue(5.5, 0)).toBe('5.5');
  });
});

describe('generateId', () => {
  it('should generate a unique ID', () => {
    const id1 = generateId();
    const id2 = generateId();
    expect(id1).not.toBe(id2);
  });

  it('should include prefix when provided', () => {
    const id = generateId('test');
    expect(id).toMatch(/^test-[a-z0-9]+$/);
  });

  it('should work without prefix', () => {
    const id = generateId();
    expect(id).toMatch(/^[a-z0-9]+$/);
  });
});

describe('classNames', () => {
  it('should include truthy classes', () => {
    expect(classNames({ active: true, visible: true })).toBe('active visible');
  });

  it('should exclude falsy classes', () => {
    expect(classNames({ active: true, disabled: false, visible: true })).toBe('active visible');
  });

  it('should return empty string when all false', () => {
    expect(classNames({ active: false, disabled: false })).toBe('');
  });
});

describe('formatNumber', () => {
  it('should format numbers with thousands separators', () => {
    expect(formatNumber(1000)).toBe('1,000');
    expect(formatNumber(1000000)).toBe('1,000,000');
    expect(formatNumber(123456789)).toBe('123,456,789');
  });

  it('should handle small numbers', () => {
    expect(formatNumber(0)).toBe('0');
    expect(formatNumber(999)).toBe('999');
  });
});

describe('formatBytes', () => {
  it('should format bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
  });

  it('should format kilobytes', () => {
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(2048)).toBe('2 KB');
  });

  it('should format megabytes', () => {
    expect(formatBytes(1024 * 1024)).toBe('1 MB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5 MB');
  });

  it('should format gigabytes', () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB');
  });
});

describe('getFilename', () => {
  it('should extract filename from path', () => {
    expect(getFilename('/path/to/file.laz')).toBe('file.laz');
    expect(getFilename('C:\\Users\\data\\cloud.las')).toBe('cloud.las');
  });

  it('should extract filename from URL', () => {
    expect(getFilename('https://example.com/data/pointcloud.laz')).toBe('pointcloud.laz');
    expect(getFilename('https://example.com/data/file.las?token=abc')).toBe('file.las');
  });

  it('should handle simple filenames', () => {
    expect(getFilename('file.laz')).toBe('file.laz');
  });
});
