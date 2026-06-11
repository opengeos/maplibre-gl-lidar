/**
 * Integration code to add range request caching to CopcStreamingLoader
 * This shows how to integrate the cache into the loader
 */

import type { RangeRequestCache } from './RangeRequestCache';
import { RangeRequestCache } from './RangeRequestCache';
import { createCachedRangeGetter } from './CachedRangeGetter';
import type { Getter } from 'copc';

/**
 * Creates a buffer getter with optional caching for COPC loading
 */
export function createCopcBufferGetter(
  buffer: ArrayBuffer,
  cache?: RangeRequestCache
): Getter {
  const uint8 = new Uint8Array(buffer);
  return async (begin: number, end: number): Promise<Uint8Array> => {
    // For ArrayBuffer sources, no HTTP caching needed
    // Just create a view
    return new Uint8Array(uint8.subarray(begin, end));
  };
}

/**
 * Creates a URL getter with optional range request caching
 */
export function createCopcUrlGetter(
  url: string,
  enableCache: boolean = true,
  cacheSize: number = 50 * 1024 * 1024,
  mergeThreshold: number = 4 * 1024
): { getter: Getter; cache: RangeRequestCache | null } {
  let cache: RangeRequestCache | null = null;

  if (enableCache) {
    cache = new RangeRequestCache(cacheSize, mergeThreshold);
  }

  const getter = createCachedRangeGetter(url, cache || undefined);

  return { getter, cache };
}

/**
 * Integration point in CopcStreamingLoader.initialize()
 * Replace the existing copc.js getter creation with:
 * 
 * ```typescript
 * const { getter, cache } = createCopcUrlGetter(
 *   this._source,
 *   this._options.enableRangeCache ?? true,
 *   this._options.rangeCacheSize ?? 50 * 1024 * 1024,
 *   this._options.rangeCacheMergeThreshold ?? 4 * 1024
 * );
 * this._rangeCache = cache;
 * this._copc = await Copc.create(getter);
 * ```
 * 
 * And store the cache in the loader:
 * private _rangeCache: RangeRequestCache | null = null;
 */
