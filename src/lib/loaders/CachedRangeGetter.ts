/**
 * Wrapper around fetch that uses range request caching when enabled
 * Handles partial cache hits by combining cached ranges with new fetches
 */

import type { RangeRequestCache, CacheStatistics } from './RangeRequestCache';
import type { CacheLookupResult } from './RangeRequestCache';

/**
 * Creates a range-request getter with optional caching
 * Used by copc.js to fetch byte ranges
 */
export function createCachedRangeGetter(
  url: string,
  cache?: RangeRequestCache
): (begin: number, end: number) => Promise<Uint8Array> {
  return async (begin: number, end: number): Promise<Uint8Array> => {
    if (!cache) {
      // No cache: fetch directly
      return fetchRange(url, begin, end);
    }

    // Check cache for complete or partial hits
    const lookup = cache.lookup(url, begin, end);

    if (lookup.found && lookup.data) {
      // Complete cache hit - no fetch needed
      return lookup.data;
    }

    if (lookup.missingRanges.length === 0) {
      // Partial hit but no missing ranges - shouldn't happen, but handle it
      return cache.assembleData(begin, end, lookup.cachedRanges, []);
    }

    // Partial miss: fetch missing ranges and assemble
    const fetchedRanges: Array<{ begin: number; end: number; data: Uint8Array }> = [];

    for (const range of lookup.missingRanges) {
      const data = await fetchRange(url, range.begin, range.end);
      fetchedRanges.push({ begin: range.begin, end: range.end, data });
      // Cache the newly fetched data
      cache.set(url, range.begin, range.end, data);
    }

    // Assemble from cached + newly fetched ranges
    return cache.assembleData(begin, end, lookup.cachedRanges, fetchedRanges);
  };
}

/**
 * Fetches a byte range from a URL using HTTP Range header
 */
async function fetchRange(url: string, begin: number, end: number): Promise<Uint8Array> {
  const response = await fetch(url, {
    headers: {
      Range: `bytes=${begin}-${end - 1}`,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Failed to fetch range ${begin}-${end - 1} from ${url}: ${response.status} ${response.statusText}`
    );
  }

  return new Uint8Array(await response.arrayBuffer());
}

/**
 * Gets cache statistics for monitoring
 */
export function getCacheStats(cache?: RangeRequestCache): CacheStatistics | null {
  if (!cache) return null;
  return cache.getStats();
}

/**
 * Clears cache for a specific URL
 */
export function clearCacheForUrl(cache: RangeRequestCache, url: string): void {
  cache.clearUrl(url);
}

/**
 * Completely clears the cache
 */
export function clearAllCache(cache: RangeRequestCache): void {
  cache.clear();
}
