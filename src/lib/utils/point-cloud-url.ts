/**
 * URL routing rules {@link LidarControl.loadPointCloud} uses to decide whether a
 * URL streams or downloads whole. Hosts can call them to treat a URL the way
 * the control will (for example, to size-check only whole downloads).
 *
 * This module has no dependencies, so importing it does not pull in the rest of
 * the package.
 */

/** How COPC sources load: streamed by viewport (`'dynamic'`) or whole (`'full'`). */
type LoadingMode = 'full' | 'dynamic';

/**
 * Whether a URL names an Entwine Point Tile dataset (an `ept.json` file), which
 * always streams.
 *
 * @param url - Point cloud URL
 * @returns True for an EPT URL
 */
export function isEptUrl(url: string): boolean {
  return url.endsWith('/ept.json') || url.includes('/ept.json?');
}

/**
 * Whether a URL names a remote COPC file: an `http(s)` URL with `.copc.` in it.
 *
 * @param url - Point cloud URL
 * @returns True for a remote COPC URL
 */
export function isCopcUrl(url: string): boolean {
  return (url.startsWith('http://') || url.startsWith('https://')) && /\.copc\./i.test(url);
}

/**
 * Whether {@link LidarControl.loadPointCloud} streams a URL rather than
 * downloading the whole file: EPT datasets always stream, and remote COPC
 * files stream unless the loading mode is `'full'`.
 *
 * @param url - Point cloud URL
 * @param loadingMode - The loading mode the load will use (the `loadingMode`
 *   option passed to `loadPointCloud`, else the control's `copcLoadingMode`).
 *   Defaults to `'dynamic'`, the control's default for COPC.
 * @returns True when the URL streams
 */
export function isStreamedPointCloudUrl(url: string, loadingMode: LoadingMode = 'dynamic'): boolean {
  if (isEptUrl(url)) return true;
  return loadingMode === 'dynamic' && isCopcUrl(url);
}
