# maplibre-gl-lidar

A MapLibre GL JS plugin for visualizing LiDAR point clouds using deck.gl.

## Features

- Load and visualize LAS/LAZ/COPC point cloud files
- Multiple color schemes: elevation, intensity, classification, RGB
- Interactive GUI control panel
- Programmatic API for loading and styling
- React integration with hooks
- deck.gl PointCloudLayer under the hood
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
  style: 'https://demotiles.maplibre.org/style.json',
  center: [-122.4, 37.8],
  zoom: 12,
  pitch: 60,
});

map.on('load', () => {
  // Add the LiDAR control
  const lidarControl = new LidarControl({
    title: 'LiDAR Viewer',
    collapsed: true,
    pointSize: 2,
    colorScheme: 'elevation',
  });

  map.addControl(lidarControl, 'top-right');

  // Listen for events
  lidarControl.on('load', (event) => {
    console.log('Point cloud loaded:', event.pointCloud);
    lidarControl.flyToPointCloud();
  });

  // Load a point cloud programmatically
  lidarControl.loadPointCloud('https://example.com/pointcloud.laz');
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
      style: 'https://demotiles.maplibre.org/style.json',
      center: [-122.4, 37.8],
      zoom: 12,
      pitch: 60,
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
  collapsed?: boolean;        // Start collapsed (default: true)
  position?: string;          // 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  title?: string;             // Panel title (default: 'LiDAR Viewer')
  panelWidth?: number;        // Panel width in pixels (default: 320)
  className?: string;         // Custom CSS class
  pointSize?: number;         // Point size in pixels (default: 2)
  opacity?: number;           // Opacity 0-1 (default: 1.0)
  colorScheme?: ColorScheme;  // Color scheme (default: 'elevation')
  pointBudget?: number;       // Max points to display (default: 1000000)
  elevationRange?: [number, number] | null;  // Elevation filter
}
```

#### Methods

```typescript
// Loading
loadPointCloud(source: string | File | ArrayBuffer): Promise<PointCloudInfo>
unloadPointCloud(id?: string): void
getPointClouds(): PointCloudInfo[]
flyToPointCloud(id?: string): void

// Styling
setPointSize(size: number): void
setOpacity(opacity: number): void
setColorScheme(scheme: ColorScheme): void
setElevationRange(min: number, max: number): void
clearElevationRange(): void

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

### Color Schemes

- `'elevation'` - Viridis-like color ramp based on Z values
- `'intensity'` - Grayscale based on intensity attribute
- `'classification'` - ASPRS standard classification colors
- `'rgb'` - Use embedded RGB colors (if available)

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
- COPC (Cloud Optimized Point Cloud)

## Dependencies

- [deck.gl](https://deck.gl/) - WebGL visualization layers
- [loaders.gl](https://loaders.gl/) - LAS/LAZ parsing
- [maplibre-gl](https://maplibre.org/) - Map rendering

## License

MIT

## Credits

Developed by [Qiusheng Wu](https://github.com/giswqs) at [Open Geospatial Solutions](https://github.com/opengeos).
