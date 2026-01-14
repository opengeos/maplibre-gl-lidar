import maplibregl from 'maplibre-gl';
import { LidarControl } from '../../src/index';
import '../../src/index.css';
import 'maplibre-gl/dist/maplibre-gl.css';

const BASEMAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

// Sample EPT dataset - Dublin, Ireland from Entwine
// Other options:
// - NYC (large): 'https://na-c.entwine.io/nyc/ept.json'
// - Red Rocks: 'https://na-c.entwine.io/red-rocks/ept.json'
const EPT_URL = 'https://na-c.entwine.io/dublin/ept.json';

// Create map centered near Dublin
const map = new maplibregl.Map({
  container: 'map',
  style: BASEMAP_STYLE,
  center: [-6.26, 53.35], // Dublin, Ireland
  zoom: 14,
  pitch: 60,
  maxPitch: 85,
  bearing: -17,
});

// Add navigation controls
map.addControl(new maplibregl.NavigationControl(), 'top-right');
map.addControl(new maplibregl.FullscreenControl(), 'top-right');
map.addControl(new maplibregl.ScaleControl(), 'bottom-right');

map.on('load', () => {
  // Create the LiDAR control
  const lidarControl = new LidarControl({
    title: 'EPT Viewer',
    collapsed: true,
    panelWidth: 360,
    pointSize: 2,
    opacity: 1.0,
    colorScheme: 'elevation',
    streamingPointBudget: 5_000_000, // Max 5 million points in memory
  });

  map.addControl(lidarControl, 'top-right');

  // Load EPT dataset - automatically uses streaming mode
  lidarControl.loadPointCloud(EPT_URL);

  // Listen for events
  lidarControl.on('load', (event) => {
    console.log('EPT dataset loaded:', event.pointCloud);
    const pc = event.pointCloud;
    if (pc && 'name' in pc) {
      console.log(`  - Name: ${pc.name}`);
      console.log(`  - Total Points: ${pc.pointCount.toLocaleString()}`);
      console.log(`  - Has RGB: ${pc.hasRGB}`);
    }
  });

  lidarControl.on('streamingprogress', () => {
    const progress = lidarControl.getStreamingProgress();
    if (progress) {
      console.log(`Streaming: ${progress.loadedPoints.toLocaleString()} points loaded`);
    }
  });

  lidarControl.on('loaderror', (event) => {
    console.error('Failed to load EPT:', event.error);
  });
});
