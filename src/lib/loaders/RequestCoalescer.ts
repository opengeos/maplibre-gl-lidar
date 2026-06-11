/**
 * Intelligently merges multiple close range requests into larger batch requests
 * Reduces HTTP round-trips by combining requests that are within a threshold distance
 */

/**
 * A pending fetch request
 */
interface PendingRequest {
  begin: number;
  end: number;
  resolve: (data: Uint8Array) => void;
  reject: (error: Error) => void;
}

/**
 * Coalesces multiple range requests into fewer, larger HTTP requests
 * Dramatically reduces network overhead for tiny/overlapping requests
 */
export class RequestCoalescer {
  private _url: string;
  private _pendingRequests: PendingRequest[] = [];
  private _coalesceThreshold: number; // Max gap to merge requests (default: 64KB)
  private _maxBatchSize: number; // Max size of a coalesced request (default: 10MB)
  private _coalesceTimeoutMs: number; // Wait this long to batch requests (default: 10ms)
  private _timeoutId: ReturnType<typeof setTimeout> | null = null;
  private _isProcessing: boolean = false;

  /**
   * Creates a new RequestCoalescer
   * @param url URL to fetch from
   * @param coalesceThreshold Max gap between requests to merge (default: 64KB)
   * @param maxBatchSize Max size of a coalesced request (default: 10MB)
   * @param coalesceTimeoutMs Debounce time for batching (default: 10ms)
   */
  constructor(
    url: string,
    coalesceThreshold: number = 64 * 1024,
    maxBatchSize: number = 10 * 1024 * 1024,
    coalesceTimeoutMs: number = 10
  ) {
    this._url = url;
    this._coalesceThreshold = coalesceThreshold;
    this._maxBatchSize = maxBatchSize;
    this._coalesceTimeoutMs = coalesceTimeoutMs;
  }

  /**
   * Requests a byte range, potentially coalescing with other pending requests
   * 
   * @param begin Start byte offset
   * @param end End byte offset (exclusive)
   * @returns Promise that resolves to the fetched data
   */
  async request(begin: number, end: number): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      this._pendingRequests.push({ begin, end, resolve, reject });

      // Schedule batch processing
      this._scheduleProcess();
    });
  }

  /**
   * Schedules batch processing with debouncing
   */
  private _scheduleProcess(): void {
    if (this._timeoutId) clearTimeout(this._timeoutId);

    this._timeoutId = setTimeout(() => {
      this._processBatch();
      this._timeoutId = null;
    }, this._coalesceTimeoutMs);
  }

  /**
   * Processes pending requests by coalescing them into batches
   */
  private async _processBatch(): Promise<void> {
    if (this._isProcessing || this._pendingRequests.length === 0) return;

    this._isProcessing = true;

    try {
      // Sort requests by begin offset
      this._pendingRequests.sort((a, b) => a.begin - b.begin);

      // Coalesce requests into batches
      const batches = this._coalesceRequests();

      // Process each batch
      for (const batch of batches) {
        await this._fetchBatch(batch);
      }
    } catch (error) {
      // Reject all pending requests on error
      for (const req of this._pendingRequests) {
        req.reject(error instanceof Error ? error : new Error(String(error)));
      }
      this._pendingRequests = [];
    } finally {
      this._isProcessing = false;
    }
  }

  /**
   * Coalesces pending requests into batches based on proximity and size
   * @returns Array of request batches
   */
  private _coalesceRequests(): Array<PendingRequest[]> {
    const batches: Array<PendingRequest[]> = [];
    let currentBatch: PendingRequest[] = [];
    let batchBegin = this._pendingRequests[0].begin;
    let batchEnd = this._pendingRequests[0].end;
    let batchSize = batchEnd - batchBegin;

    for (let i = 0; i < this._pendingRequests.length; i++) {
      const req = this._pendingRequests[i];
      const gap = req.begin - batchEnd;
      const newBatchSize = req.end - batchBegin;

      // Check if we should add to current batch or start a new one
      const shouldMerge =
        gap <= this._coalesceThreshold && // Gap is small enough
        newBatchSize <= this._maxBatchSize; // New size stays under limit

      if (shouldMerge && currentBatch.length > 0) {
        // Add to current batch
        currentBatch.push(req);
        batchEnd = Math.max(batchEnd, req.end);
        batchSize = batchEnd - batchBegin;
      } else if (currentBatch.length > 0) {
        // Start new batch
        batches.push(currentBatch);
        currentBatch = [req];
        batchBegin = req.begin;
        batchEnd = req.end;
        batchSize = batchEnd - batchBegin;
      } else {
        // First request
        currentBatch.push(req);
      }
    }

    // Add final batch
    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }

    return batches;
  }

  /**
   * Fetches a batch of requests as a single range request
   * @param batch Array of requests in the batch
   */
  private async _fetchBatch(batch: PendingRequest[]): Promise<void> {
    if (batch.length === 0) return;

    // Calculate batch boundaries
    const batchBegin = batch[0].begin;
    const batchEnd = batch[batch.length - 1].end;

    try {
      // Fetch the entire batch range
      const batchData = await this._fetchRange(batchBegin, batchEnd);

      // Distribute batch data to individual requests
      for (const req of batch) {
        const offset = req.begin - batchBegin;
        const length = req.end - req.begin;
        const data = batchData.slice(offset, offset + length);
        req.resolve(data);
      }
    } catch (error) {
      // Reject all requests in batch
      const err = error instanceof Error ? error : new Error(String(error));
      for (const req of batch) {
        req.reject(err);
      }
    }
  }

  /**
   * Fetches a byte range using HTTP Range header
   */
  private async _fetchRange(begin: number, end: number): Promise<Uint8Array> {
    const response = await fetch(this._url, {
      headers: {
        Range: `bytes=${begin}-${end - 1}`,
      },
    });

    if (!response.ok) {
      throw new Error(
        `Failed to fetch range ${begin}-${end - 1}: ${response.status} ${response.statusText}`
      );
    }

    return new Uint8Array(await response.arrayBuffer());
  }

  /**
   * Gets statistics about coalescing
   */
  getStats() {
    return {
      pendingRequests: this._pendingRequests.length,
      isProcessing: this._isProcessing,
    };
  }

  /**
   * Clears all pending requests
   */
  clear(): void {
    if (this._timeoutId) clearTimeout(this._timeoutId);
    for (const req of this._pendingRequests) {
      req.reject(new Error('RequestCoalescer cleared'));
    }
    this._pendingRequests = [];
  }
}
