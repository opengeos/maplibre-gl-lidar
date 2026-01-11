# maplibre-gl-lidar

A MapLibre GL JS plugin for visualizing LiDAR point clouds using deck.gl.

## Features

- Load and visualize LAS/LAZ/COPC point cloud files (LAS 1.0 - 1.4)
- **Dynamic COPC streaming** - viewport-based loading for large cloud-optimized point clouds
- Multiple color schemes: elevation, intensity, classification, RGB
- Interactive GUI control panel with scrollable content
- **Point picking** - hover over points to see all available attributes (coordinates, elevation, intensity, classification, RGB, GPS time, return number, etc.)
- **Z offset adjustment** - shift point clouds vertically for alignment
- **Elevation filtering** - filter points by elevation range
- Automatic coordinate transformation (projected CRS to WGS84)
- Programmatic API for loading and styling
- React integration with hooks
- deck.gl PointCloudLayer with optimized chunking for large datasets
- TypeScript support

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

### React Hooks

#### useLidarState

```typescript
const {
  state,
  setState,
  setPointSize,
  setOpacity,
  setColorScheme,
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

- LAS 1.0 - 1.4
- LAZ (compressed LAS)
- COPC (Cloud Optimized Point Cloud) - with dynamic streaming support

## Coordinate Systems

Point clouds are automatically transformed to WGS84 (EPSG:4326) for display on the map. The loader reads the WKT coordinate reference system from the file and uses proj4 to transform coordinates. Supported features:

- Projected coordinate systems (State Plane, UTM, etc.)
- Compound coordinate systems (horizontal + vertical)
- Automatic unit conversion (feet to meters for elevation)

## Dependencies

- [deck.gl](https://deck.gl/) - WebGL visualization layers
- [copc.js](https://github.com/connormanning/copc.js) - COPC/LAS/LAZ parsing (supports LAS 1.4)
- [laz-perf](https://github.com/hobu/laz-perf) - LAZ decompression
- [proj4](http://proj4js.org/) - Coordinate transformation
- [maplibre-gl](https://maplibre.org/) - Map rendering

## License

MIT

## Credits

Developed by [Qiusheng Wu](https://github.com/giswqs) at [Open Geospatial Solutions](https://github.com/opengeos).
