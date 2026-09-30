import { describe, expect, it } from 'vitest';
import { isLazCompressed } from '../src/lib/loaders/PointCloudLoader';

function header(formatByte: number): Uint8Array {
  const bytes = new Uint8Array(375);
  bytes[104] = formatByte;
  return bytes;
}

describe('isLazCompressed', () => {
  it('reads the compression bits from the raw point format byte', () => {
    // LAS 1.4 format 7 written by PDAL, laz-rs, GeoLibre: no "laszip" in the name.
    expect(isLazCompressed(header(7 | 0x80), 'PDAL')).toBe(true);
    expect(isLazCompressed(header(6 | 0x40), 'laz-rs')).toBe(true);
    expect(isLazCompressed(header(7), 'PDAL')).toBe(false);
  });

  it('still honours the generating-software fallback', () => {
    expect(isLazCompressed(header(3), 'LASzip DLL 3.4')).toBe(true);
  });
});
