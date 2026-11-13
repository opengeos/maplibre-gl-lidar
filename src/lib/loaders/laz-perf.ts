import { createLazPerf, type LazPerf } from "laz-perf";
import lazPerfWasmUrl from "laz-perf/lib/web/laz-perf.wasm?url";

// One laz-perf instance shared by every COPC loader.
let lazPerfInstance: Promise<LazPerf> | null = null;

/**
 * Returns the shared laz-perf instance used for COPC decompression.
 *
 * The wasm file comes from the installed laz-perf package, so it always
 * matches the bundled JS glue and loads without a CDN request.
 */
export function getLazPerf(): Promise<LazPerf> {
  if (lazPerfInstance) return lazPerfInstance;
  const instance = createLazPerf({
    locateFile: (path: string) =>
      path.endsWith(".wasm") ? lazPerfWasmUrl : path,
  }).catch((error: unknown) => {
    lazPerfInstance = null;
    throw error;
  });
  lazPerfInstance = instance;
  return instance;
}
