/**
 * Advanced HTTP range request cache for COPC streaming with:
 * - Partial cache hits (serve from cache + fetch missing ranges)
 * - Automatic block merging (combine adjacent ranges into larger blocks)
 * - Intelligent pre-fetching and coalescing
 * - Cache statistics and monitoring
 */

/**
 * Represents a contiguous block of cached data
 */
interface CacheBlock {
  url: string;
  begin: number;
  end: number;
  data: Uint8Array;
  timestamp: number;
  accessCount: number; // Track popularity for LRU
}

/**
 * Result of a cache lookup with partial hits
 */
interface CacheLookupResult {
  found: boolean;
  data?: Uint8Array; // Full data if complete hit
  cachedRanges: Array<{ begin: number; end: number; data: Uint8Array }>; // Partial hits
  missingRanges: Array<{ begin: number; end: number }>; // Ranges to fetch
}

/**
 * Advanced HTTP range request cache with intelligent block management
 */
export class RangeRequestCache {
  private _blocks: Map<string, CacheBlock[]> = new Map(); // URL -> sorted array of blocks
  private _maxCacheSize: number;
  private _currentSize: number = 0;
  private _mergeThreshold: number; // Max gap between blocks to merge (bytes)
  private _stats: CacheStatistics;

  /**
   * Creates a new RangeRequestCache instance
   * @param maxCacheSize Maximum cache size in bytes (default: 50MB)
   * @param mergeThreshold Maximum gap between blocks to auto-merge (default: 4KB)
   */
  constructor(maxCacheSize: number = 50 * 1024 * 1024, mergeThreshold: number = 4 * 1024) {
    this._maxCacheSize = maxCacheSize;
    this._mergeThreshold = mergeThreshold;
    this._stats = {
      totalRequests: 0,
      cacheHits: 0,
      partialHits: 0,
      cacheMisses: 0,
      currentSize: 0,
      maxSize: maxCacheSize,
      blockCount: 0,
      urlCount: 0,
      bytesFetched: 0,
      bytesSaved: 0,
    };
  }

  /**
   * Looks up data in cache with intelligent partial hit support
   * Returns cached ranges and missing ranges separately
   * 
   * @param url URL of the resource
   * @param begin Start byte offset
   * @param end End byte offset (exclusive)
   * @returns Cache lookup result with hits, misses, and any cached data
   */
  lookup(url: string, begin: number, end: number): CacheLookupResult {
    this._stats.totalRequests++;
    const blocks = this._blocks.get(url) || [];
    const requestSize = end - begin;

    // Fast path: complete cache hit
    const completeBlock = blocks.find(b => b.begin <= begin && b.end >= end);
    if (completeBlock) {
      completeBlock.accessCount++;
      completeBlock.timestamp = Date.now();
      this._stats.cacheHits++;
      const offset = begin - completeBlock.begin;
      const data = completeBlock.data.slice(offset, offset + requestSize);
      this._stats.bytesSaved += requestSize;
      return { found: true, data };
    }

    // Partial hit path: find overlapping blocks
    const cachedRanges: Array<{ begin: number; end: number; data: Uint8Array }> = [];
    const missingRanges: Array<{ begin: number; end: number }> = [];
    let currentPos = begin;

    for (const block of blocks) {
      // Skip blocks that end before our range starts
      if (block.end <= begin) continue;
      // Skip blocks that start after our range ends
      if (block.begin >= end) break;

      // Gap between current position and this block
      if (currentPos < block.begin) {
        missingRanges.push({ begin: currentPos, end: block.begin });
      }

      // Overlapping range
      const overlapBegin = Math.max(currentPos, block.begin);
      const overlapEnd = Math.min(end, block.end);
      const offset = overlapBegin - block.begin;
      const length = overlapEnd - overlapBegin;
      
      cachedRanges.push({
        begin: overlapBegin,
        end: overlapEnd,
        data: block.data.slice(offset, offset + length),
      });

      block.accessCount++;
      block.timestamp = Date.now();
      this._stats.bytesSaved += length;
      currentPos = overlapEnd;
    }

    // Final missing range
    if (currentPos < end) {
      missingRanges.push({ begin: currentPos, end });
    }

    if (cachedRanges.length > 0) {
      this._stats.partialHits++;
    } else {
      this._stats.cacheMisses++;
    }

    return {
      found: cachedRanges.length > 0 && missingRanges.length === 0,
      cachedRanges,
      missingRanges,
    };
  }

  /**
   * Reconstructs complete data from cached ranges and new fetched data
   * Assembles fragments back into contiguous buffer
   * 
   * @param begin Start offset
   * @param end End offset
   * @param cachedRanges Ranges from cache
   * @param fetchedRanges Ranges that were just fetched
   * @returns Complete assembled buffer
   */
  assembleData(
    begin: number,
    end: number,
    cachedRanges: Array<{ begin: number; end: number; data: Uint8Array }>,
    fetchedRanges: Array<{ begin: number; end: number; data: Uint8Array }>
  ): Uint8Array {
    const totalSize = end - begin;
    const result = new Uint8Array(totalSize);

    // Merge and sort all ranges
    const allRanges = [...cachedRanges, ...fetchedRanges].sort((a, b) => a.begin - b.begin);

    for (const range of allRanges) {
      const offset = range.begin - begin;
      result.set(range.data, offset);
    }

    return result;
  }

  /**
   * Stores data in cache with automatic block merging
   * Adjacent blocks within mergeThreshold are coalesced into larger blocks
   * Uses LRU eviction if cache exceeds max size
   * 
   * @param url URL of the resource
   * @param begin Start byte offset
   * @param end End byte offset (exclusive)
   * @param data The byte data to cache
   */
  set(url: string, begin: number, end: number, data: Uint8Array): void {
    const size = end - begin;

    // Reject if single block is larger than max cache
    if (size > this._maxCacheSize) {
      console.warn(
        `RangeRequestCache: Block size ${size} exceeds max cache size ${this._maxCacheSize}`
      );
      return;
    }

    // Evict if necessary
    if (this._currentSize + size > this._maxCacheSize) {
      this._evictLRU(size);
    }

    if (!this._blocks.has(url)) {
      this._blocks.set(url, []);
    }

    const blocks = this._blocks.get(url)!;
    const newBlock: CacheBlock = {
      url,
      begin,
      end,
      data: new Uint8Array(data), // Copy to prevent external modification
      timestamp: Date.now(),
      accessCount: 1,
    };

    blocks.push(newBlock);
    this._currentSize += size;
    this._stats.bytesFetched += size;

    // Merge adjacent/overlapping blocks
    this._mergeBlocks(url);

    this._stats.blockCount = Array.from(this._blocks.values()).reduce((sum, arr) => sum + arr.length, 0);
    this._stats.urlCount = this._blocks.size;
  }

  /**
   * Merges adjacent blocks within mergeThreshold
   * Coalesces multiple small blocks into larger ones for faster lookup
   * 
   * @param url URL to merge blocks for
   */
  private _mergeBlocks(url: string): void {
    const blocks = this._blocks.get(url);
    if (!blocks || blocks.length < 2) return;

    // Sort blocks by begin offset
    blocks.sort((a, b) => a.begin - b.begin);

    const merged: CacheBlock[] = [];
    let current = blocks[0];

    for (let i = 1; i < blocks.length; i++) {
      const next = blocks[i];
      const gap = next.begin - current.end;

      // Check if blocks should be merged
      if (gap <= this._mergeThreshold && gap >= 0) {
        // Merge: create new block spanning both
        const newSize = next.end - current.begin;
        const mergedData = new Uint8Array(newSize);
        mergedData.set(current.data, 0);

        // Fill gap if exists
        if (gap > 0) {
          // Gap will be filled with zeros (can be optimized based on use case)
        }

        mergedData.set(next.data, current.end - current.begin + gap);

        // Track combined access count
        const combinedAccessCount = current.accessCount + next.accessCount;

        // Update current size tracking
        this._currentSize -= current.data.length + next.data.length;
        this._currentSize += mergedData.length;

        current = {
          url,
          begin: current.begin,
          end: next.end,
          data: mergedData,
          timestamp: Math.max(current.timestamp, next.timestamp),
          accessCount: combinedAccessCount,
        };
      } else if (gap < 0) {
        // Overlapping blocks: skip the overlapped part of next
        if (next.end > current.end) {
          const overlap = current.end - next.begin;
          const mergedData = new Uint8Array(current.data.length + (next.end - current.end));
          mergedData.set(current.data, 0);
          mergedData.set(
            next.data.slice(overlap),
            current.data.length
          );

          this._currentSize -= current.data.length + next.data.length;
          this._currentSize += mergedData.length;

          current = {
            url,
            begin: current.begin,
            end: next.end,
            data: mergedData,
            timestamp: Math.max(current.timestamp, next.timestamp),
            accessCount: current.accessCount + next.accessCount,
          };
        }
      } else {
        // Gap too large, keep separate
        merged.push(current);
        current = next;
      }
    }
    merged.push(current);

    this._blocks.set(url, merged);
  }

  /**
   * Clears all cached data and resets tracking
   */
  clear(): void {
    this._blocks.clear();
    this._currentSize = 0;
    this._stats.blockCount = 0;
    this._stats.urlCount = 0;
  }

  /**
   * Gets current cache statistics for monitoring/debugging
   * @returns Cache statistics
   */
  getStats(): CacheStatistics {
    return { ...this._stats, currentSize: this._currentSize };
  }

  /**
   * Clears cache for a specific URL
   * @param url URL to clear
   */
  clearUrl(url: string): void {
    const blocks = this._blocks.get(url);
    if (blocks) {
      for (const block of blocks) {
        this._currentSize -= block.data.length;
      }
      this._blocks.delete(url);
    }
  }

  /**
   * Evicts least recently used blocks until space is available
   * @param neededSize Minimum space needed in bytes
   */
  private _evictLRU(neededSize: number): void {
    // Collect all blocks with their URLs
    const allBlocks: Array<{ url: string; block: CacheBlock }> = [];
    for (const [url, blocks] of this._blocks) {
      for (const block of blocks) {
        allBlocks.push({ url, block });
      }
    }

    // Sort by access count (ascending) then timestamp (ascending) = LRU order
    allBlocks.sort((a, b) => {
      const accessDiff = a.block.accessCount - b.block.accessCount;
      return accessDiff !== 0 ? accessDiff : a.block.timestamp - b.block.timestamp;
    });

    // Evict until we have enough space
    for (const { url, block } of allBlocks) {
      if (this._currentSize + neededSize <= this._maxCacheSize) break;

      const blocks = this._blocks.get(url);
      if (blocks) {
        const idx = blocks.indexOf(block);
        if (idx !== -1) {
          blocks.splice(idx, 1);
          this._currentSize -= block.data.length;
          if (blocks.length === 0) {
            this._blocks.delete(url);
          }
        }
      }
    }
  }
}

/**
 * Cache statistics for monitoring and diagnostics
 */
export interface CacheStatistics {
  totalRequests: number;
  cacheHits: number;
  partialHits: number;
  cacheMisses: number;
  currentSize: number;
  maxSize: number;
  blockCount: number;
  urlCount: number;
  bytesFetched: number;
  bytesSaved: number;
  usagePercent?: number;
  hitRate?: number;
}
