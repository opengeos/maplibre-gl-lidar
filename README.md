# maplibre-gl-lidar

A MapLibre GL JS plugin for visualizing LiDAR point clouds using deck.gl.

[![npm version](https://img.shields.io/npm/v/maplibre-gl-lidar.svg)](https://www.npmjs.com/package/maplibre-gl-lidar)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- Load and visualize LAS/LAZ/COPC point cloud files (LAS 1.0 - 1.4)
- **Dynamic COPC streaming** - viewport-based loading for large cloud-optimized point clouds
- **EPT (Entwine Point Tile) support** - stream large point cloud datasets from EPT servers
- Multiple color schemes: elevation, intensity, classification, RGB
- **Classification legend with toggle** - interactive legend to show/hide individual classification types
- **Percentile-based coloring** - use 2-98% percentile range for better color distribution (clips outliers)
- Interactive GUI control panel with scrollable content
- **Point picking** - hover over points to see all available attributes (coordinates, elevation, intensity, classification, RGB, GPS time, return number, etc.)
- **Z offset adjustment** - shift point clouds vertically for alignment
- **Elevation filtering** - filter points by elevation range
- Automatic coordinate transformation (projected CRS to WGS84)
- Programmatic API for loading and styling
- React integration with hooks
- deck.gl PointCloudLayer with optimized chunking for large datasets
- TypeScript support

## Demo

Try the [live demo](https://opengeos.org/maplibre-gl-lidar).

![](https://github.com/user-attachments/assets/db03b60d-918d-438d-9f3f-1f922b1a0a2b)

## Online Viewer

Use the [Online Viewer](https://opengeos.org/maplibre-gl-lidar/viewer/) to load and visualize any COPC point cloud by entering a URL. You can also use URL parameters for direct linking:

```
https://opengeos.org/maplibre-gl-lidar/viewer/?url=https://s3.amazonaws.com/hobu-lidar/autzen-classified.copc.laz
```

This allows you to share links that automatically load specific point clouds.

## Installation

```bash
npm install maplibre-gl-lidar
```

## Quick Start

### Basic Usage (Vanilla JS/TypeScript)

```typescript
import maplibregl from 'maplibre-gl';
import { LidarControl } from 'maplibre-gl-lidar';
import 'maplibre-gl-lidar/style.css';
import 'maplibre-gl/dist/maplibre-gl.css';

const map = new maplibregl.Map({
  container: 'map',
  style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  center: [-122.4, 37.8],
  zoom: 12,
  pitch: 60,
  maxPitch: 85, // Allow higher pitch for better 3D viewing
});

map.on('load', () => {
  // Add the LiDAR control
  const lidarControl = new LidarControl({
    title: 'LiDAR Viewer',
    collapsed: true,
    pointSize: 2,
    colorScheme: 'elevation',
    pickable: true, // Enable point picking for hover tooltips
  });

  map.addControl(lidarControl, 'top-right');

  // Listen for events
  lidarControl.on('load', (event) => {
    console.log('Point cloud loaded:', event.pointCloud);
    lidarControl.flyToPointCloud();
  });

  // Load a point cloud programmatically
  lidarControl.loadPointCloud('https://s3.amazonaws.com/hobu-lidar/autzen-classified.copc.laz');
});
```

### React Usage

```tsx
import { useEffect, useRef, useState } from 'react';
import maplibregl, { Map } from 'maplibre-gl';
import { LidarControlReact, useLidarState } from 'maplibre-gl-lidar/react';
import 'maplibre-gl-lidar/style.css';
import 'maplibre-gl/dist/maplibre-gl.css';

function App() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<Map | null>(null);
  const { state, setColorScheme, setPointSize } = useLidarState();

  useEffect(() => {
    if (!mapContainer.current) return;

    const mapInstance = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: [-122.4, 37.8],
      zoom: 12,
      pitch: 60,
      maxPitch: 85, // Allow higher pitch for better 3D viewing
    });

    mapInstance.on('load', () => setMap(mapInstance));

    return () => mapInstance.remove();
  }, []);

  return (
    <div style={{ width: '100%', height: '100vh' }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />
      {map && (
        <LidarControlReact
          map={map}
          title="LiDAR Viewer"
          pointSize={state.pointSize}
          colorScheme={state.colorScheme}
          onLoad={(pc) => console.log('Loaded:', pc)}
          defaultUrl="https://s3.amazonaws.com/hobu-lidar/autzen-classified.copc.laz"
        />
      )}
    </div>
  );
}
```

## API Reference

### LidarControl

The main control class implementing MapLibre's `IControl` interface.

#### Constructor Options

```typescript
interface LidarControlOptions {
  // Panel settings
  collapsed?: boolean;        // Start collapsed (default: true)
  position?: string;          // 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  title?: string;             // Panel title (default: 'LiDAR Viewer')
  panelWidth?: number;        // Panel width in pixels (default: 365)
  panelMaxHeight?: number;    // Panel max height with scrollbar (default: 500)
  className?: string;         // Custom CSS class

  // Point cloud styling
  pointSize?: number;         // Point size in pixels (default: 2)
  opacity?: number;           // Opacity 0-1 (default: 1.0)
  colorScheme?: ColorScheme;  // Color scheme (default: 'elevation')
  usePercentile?: boolean;    // Use 2-98% percentile for coloring (default: true)
  pointBudget?: number;       // Max points to display (default: 1000000)

  // Filters and adjustments
  elevationRange?: [number, number] | null;  // Elevation filter
  zOffsetEnabled?: boolean;   // Enable Z offset adjustment (default: false)
  zOffset?: number;           // Z offset in meters (default: 0)

  // Interaction
  pickable?: boolean;         // Enable point picking/hover tooltips (default: false)
  pickInfoFields?: string[];  // Fields to show in tooltip (default: all)

  // Behavior
  autoZoom?: boolean;         // Auto zoom to data after loading (default: true)

  // COPC Streaming (dynamic loading)
  copcLoadingMode?: 'full' | 'dynamic';  // Loading mode for COPC files (default: 'dynamic')
  streamingPointBudget?: number;         // Max points for streaming (default: 5000000)
  streamingMaxConcurrentRequests?: number; // Concurrent node requests (default: 4)
  streamingViewportDebounceMs?: number;  // Viewport change debounce (default: 150)
}
```

#### Methods

```typescript
// Loading
loadPointCloud(source: string | File | ArrayBuffer, options?: { loadingMode?: 'full' | 'dynamic' }): Promise<PointCloudInfo>
loadPointCloudStreaming(source: string | File | ArrayBuffer, options?: StreamingLoaderOptions): Promise<PointCloudInfo>
stopStreaming(): void  // Stop dynamic loading and clean up
unloadPointCloud(id?: string): void
getPointClouds(): PointCloudInfo[]
flyToPointCloud(id?: string): void

// Styling
setPointSize(size: number): void
setOpacity(opacity: number): void
setColorScheme(scheme: ColorScheme): void
setUsePercentile(usePercentile: boolean): void
getUsePercentile(): boolean
setElevationRange(min: number, max: number): void
clearElevationRange(): void
setPickable(pickable: boolean): void

// Z Offset
setZOffsetEnabled(enabled: boolean): void
setZOffset(offset: number): void
getZOffset(): number

// Pick info customization
setPickInfoFields(fields?: string[]): void
getPickInfoFields(): string[] | undefined

// Classification visibility (when using 'classification' color scheme)
setClassificationVisibility(code: number, visible: boolean): void
showAllClassifications(): void
hideAllClassifications(): void
getHiddenClassifications(): number[]
getAvailableClassifications(): number[]

// Panel control
toggle(): void
expand(): void
collapse(): void

// Events
on(event: LidarControlEvent, handler: LidarControlEventHandler): void
off(event: LidarControlEvent, handler: LidarControlEventHandler): void

// State
getState(): LidarState
getMap(): MapLibreMap | undefined
```

#### Events

- `load` - Point cloud loaded successfully
- `loadstart` - Loading started
- `loaderror` - Loading failed
- `unload` - Point cloud unloaded
- `statechange` - Control state changed
- `stylechange` - Styling changed
- `collapse` - Panel collapsed
- `expand` - Panel expanded
- `streamingstart` - Dynamic streaming started
- `streamingstop` - Dynamic streaming stopped
- `streamingprogress` - Streaming progress update
- `budgetreached` - Point budget limit reached

### Color Schemes

- `'elevation'` - Viridis-like color ramp based on Z values
- `'intensity'` - Grayscale based on intensity attribute
- `'classification'` - ASPRS standard classification colors
- `'rgb'` - Use embedded RGB colors (if available)

### Percentile-Based Coloring

By default, elevation and intensity coloring uses the 2nd-98th percentile range instead of the full min-max range. This clips outliers and provides better color distribution across the point cloud.

```typescript
// Percentile coloring is enabled by default
const control = new LidarControl({
  colorScheme: 'elevation',
  usePercentile: true,  // default
});

// Disable to use full value range (min-max)
control.setUsePercentile(false);

// Check current setting
console.log(control.getUsePercentile()); // true or false
```

The percentile toggle is also available in the GUI panel when using "Elevation" or "Intensity" color schemes. Uncheck "Use percentile range (2-98%)" to use the full value range.

### Point Picking

When `pickable` is enabled, hovering over points displays a tooltip with all available attributes:

- **X, Y, Z** - Coordinates and elevation
- **Intensity** - Reflectance value
- **Classification** - ASPRS class name (Ground, Building, Vegetation, etc.)
- **Red, Green, Blue** - RGB color values (if available)
- **GpsTime** - GPS timestamp
- **ReturnNumber / NumberOfReturns** - Return information
- **PointSourceId** - Scanner source ID
- **ScanAngle** - Scan angle
- And more (EdgeOfFlightLine, ScanDirectionFlag, UserData, etc.)

Enable via constructor option or toggle in the GUI panel:

```typescript
// Via constructor
const control = new LidarControl({ pickable: true });

// Or programmatically
control.setPickable(true);

// Optionally filter which fields to display
control.setPickInfoFields(['Classification', 'Intensity', 'GpsTime', 'ReturnNumber']);
```

### Z Offset

Shift point clouds vertically for alignment with terrain or other data:

```typescript
// Via constructor
const control = new LidarControl({
  zOffsetEnabled: true,
  zOffset: 50, // Shift up 50 meters
});

// Or programmatically
control.setZOffsetEnabled(true);
control.setZOffset(50);

// Get current offset
console.log(control.getZOffset()); // 50
```

The Z offset can also be adjusted interactively via the "Z Offset" checkbox and slider in the GUI panel.

### Classification Legend

When using the "Classification" color scheme, an interactive legend appears showing all classification types found in the point cloud data. Each classification displays:

- A color swatch matching the ASPRS standard colors
- The classification name (Ground, Building, Vegetation, etc.)
- A checkbox to toggle visibility

**Features:**
- **Show All / Hide All buttons** - Quickly toggle all classifications at once
- **Individual toggles** - Show or hide specific classification types
- **Auto-detection** - Classifications are automatically detected from loaded data
- **Streaming support** - Classifications update as data streams in for COPC files

```typescript
// Via GUI: Select "Classification" from the Color By dropdown
// The legend automatically appears with checkboxes for each class

// Programmatically control visibility
control.setColorScheme('classification');

// Hide specific classifications (e.g., hide noise points)
control.setClassificationVisibility(7, false);  // Hide "Low Point (Noise)"
control.setClassificationVisibility(18, false); // Hide "High Noise"

// Show only ground and buildings
control.hideAllClassifications();
control.setClassificationVisibility(2, true);  // Ground
control.setClassificationVisibility(6, true);  // Building

// Get available classifications in the data
const available = control.getAvailableClassifications();
console.log('Classifications:', available); // [2, 3, 4, 5, 6, ...]

// Get currently hidden classifications
const hidden = control.getHiddenClassifications();
console.log('Hidden:', hidden); // [7, 18]
```

**ASPRS Classification Codes:**
| Code | Name |
|------|------|
| 2 | Ground |
| 3 | Low Vegetation |
| 4 | Medium Vegetation |
| 5 | High Vegetation |
| 6 | Building |
| 7 | Low Point (Noise) |
| 9 | Water |
| 17 | Bridge Deck |

### Dynamic COPC Streaming

For large COPC (Cloud Optimized Point Cloud) files, dynamic streaming loads only the points visible in the current viewport, dramatically reducing initial load time and memory usage.

**Key features:**
- **Viewport-based loading** - Only loads octree nodes visible in the current map view
- **Level-of-detail (LOD)** - Automatically selects appropriate detail level based on zoom
- **Center-first priority** - Points near the viewport center load first
- **Point budget** - Limits total points in memory (default: 5 million)

**How it works:**
1. When loading a COPC file (from URL or local file), dynamic mode is used by default
2. As you pan/zoom the map, new nodes are streamed based on viewport
3. Deeper octree levels (more detail) load as you zoom in
4. Parent nodes provide coverage where child nodes don't exist

```typescript
// Dynamic loading is the default for COPC files
const control = new LidarControl();
control.loadPointCloud('https://example.com/large-pointcloud.copc.laz');

// Explicitly set loading mode
const control = new LidarControl({
  copcLoadingMode: 'dynamic',  // or 'full' for complete load
  streamingPointBudget: 10_000_000,  // 10 million points max
});

// Override per-load
control.loadPointCloud(file, { loadingMode: 'full' });  // Force full load
control.loadPointCloud(url, { loadingMode: 'dynamic' }); // Force streaming
```

**Loading modes:**
- `'dynamic'` (default for COPC) - Stream nodes based on viewport, ideal for large files
- `'full'` - Load entire point cloud upfront, better for small files

**Note:** Non-COPC files (regular LAS/LAZ) always use full loading mode since they don't have the octree structure required for streaming.

### EPT (Entwine Point Tile) Support

maplibre-gl-lidar supports [Entwine Point Tile (EPT)](https://entwine.io/en/latest/entwine-point-tile.html) datasets, a widely-used format for serving large point clouds over HTTP with viewport-based streaming.

**Key features:**
- **Directory-based format** - Metadata in ept.json, hierarchy in ept-hierarchy/, data in ept-data/
- **Viewport-based streaming** - Points load dynamically based on current map view
- **LAZ compression** - Efficient data transfer using LAZ compression
- **Automatic CRS transformation** - Coordinates transformed from source CRS to WGS84

**Loading EPT data:**

```typescript
// Load EPT dataset by URL (automatically detected via ept.json)
lidarControl.loadPointCloud('https://na-c.entwine.io/dublin/ept.json');

// Or load programmatically
lidarControl.loadPointCloudEptStreaming('https://na-c.entwine.io/dublin/ept.json', {
  pointBudget: 5_000_000,  // Max points in memory
});
```

**Sample EPT datasets:**
- Dublin, Ireland: `https://na-c.entwine.io/dublin/ept.json`
- New York City (4.7B points): `https://na-c.entwine.io/nyc/ept.json`
- Red Rocks: `https://na-c.entwine.io/red-rocks/ept.json`

**Note:** EPT datasets require CORS support from the server. The sample datasets from entwine.io are CORS-enabled.

### React Hooks

#### useLidarState

```typescript
const {
  state,
  setState,
  setPointSize,
  setOpacity,
  setColorScheme,
  setUsePercentile,
  setElevationRange,
  setZOffsetEnabled,
  setZOffset,
  toggle,
  reset,
} = useLidarState(initialState?);
```

#### usePointCloud

```typescript
const { data, loading, error, progress, load, reset } = usePointCloud();

// Load a file
await load(file);
console.log(`Loaded ${data.pointCount} points`);
```

## Supported Formats

- LAS 1.0 - 1.4 (all versions supported via copc.js + loaders.gl fallback)
- LAZ (compressed LAS)
- COPC (Cloud Optimized Point Cloud) - with dynamic streaming support
- EPT (Entwine Point Tile) - viewport-based streaming from HTTP servers

**Note:** LAS 1.2 and 1.4 are loaded using copc.js for optimal performance. LAS 1.0, 1.1, and 1.3 files automatically fall back to @loaders.gl/las.

## Coordinate Systems

Point clouds are automatically transformed to WGS84 (EPSG:4326) for display on the map. The loader reads the WKT coordinate reference system from the file and uses proj4 to transform coordinates. Supported features:

- Projected coordinate systems (State Plane, UTM, etc.)
- Compound coordinate systems (horizontal + vertical)
- Automatic unit conversion (feet to meters for elevation)

## Docker

The examples can be run using Docker. The image is automatically built and published to GitHub Container Registry.

### Pull and Run

```bash
# Pull the latest image
docker pull ghcr.io/opengeos/maplibre-gl-lidar:latest

# Run the container
docker run -p 8080:80 ghcr.io/opengeos/maplibre-gl-lidar:latest
```

Then open http://localhost:8080/maplibre-gl-lidar/ in your browser to view the examples.

### Build Locally

```bash
# Build the image
docker build -t maplibre-gl-lidar .

# Run the container
docker run -p 8080:80 maplibre-gl-lidar
```

### Available Tags

| Tag | Description |
|-----|-------------|
| `latest` | Latest release |
| `x.y.z` | Specific version (e.g., `1.0.0`) |
| `x.y` | Minor version (e.g., `1.0`) |


## Dependencies

- [deck.gl](https://deck.gl/) - WebGL visualization layers
- [copc.js](https://github.com/connormanning/copc.js) - COPC/LAS/LAZ parsing (LAS 1.2/1.4)
- [@loaders.gl/las](https://loaders.gl/modules/las/docs) - LAS parsing fallback (LAS 1.0/1.1/1.3)
- [laz-perf](https://github.com/hobu/laz-perf) - LAZ decompression
- [proj4](http://proj4js.org/) - Coordinate transformation
- [maplibre-gl](https://maplibre.org/) - Map rendering

## License

MIT

## Credits

The sample dataset [autzen-classified.copc.laz](https://s3.amazonaws.com/hobu-lidar/autzen-classified.copc.laz) is from [Hobu, Inc.](https://hobu.co). Credits to [Howard Butler](https://github.com/hobu).