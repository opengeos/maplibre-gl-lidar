import maplibregl from 'maplibre-gl';
import { LidarControl, LidarLayerAdapter } from '../../src/index';
import { LayerControl } from 'maplibre-gl-layer-control';
import '../../src/index.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import 'maplibre-gl-layer-control/style.css';

const BASEMAP_STYLE = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

// Create map with 3D terrain enabled
const map = new maplibregl.Map({
  container: 'map',
  style: BASEMAP_STYLE,
  center: [-123.06171, 44.0499], // Near Autzen Stadium, Oregon (sample data location)
  zoom: 14,
  pitch: 60,
  maxPitch: 85, // Allow higher pitch for better 3D viewing
  bearing: -17,
});

// Add navigation controls
map.addControl(new maplibregl.NavigationControl(), 'top-right');

// Add fullscreen control
map.addControl(new maplibregl.FullscreenControl(), 'top-right');

// Add Globe control to the map
map.addControl(new maplibregl.GlobeControl(), 'top-right');

// Add scale control
map.addControl(new maplibregl.ScaleControl(), 'bottom-right');

// Add LiDAR control when map loads
map.on('load', () => {
  // Add Google Satellite basemap
  map.addSource('google-satellite', {
    type: 'raster',
    tiles: ['https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}'],
    tileSize: 256,
    attribution: '&copy; Google',
  });

  map.addLayer(
    {
      id: 'google-satellite',
      type: 'raster',
      source: 'google-satellite',
      paint: {
        'raster-opacity': 1,
      },
      layout: {
        visibility: 'visible',
      },
      minzoom: 16,
    },
  );

  // Create the LiDAR control with options
  // COPC files from URLs automatically use dynamic streaming mode
  // Non-COPC files or local files use full download mode
  const lidarControl = new LidarControl({
    title: 'LiDAR Viewer',
    collapsed: true, // Start with just the 29x29 button visible
    panelWidth: 360,
    pointSize: 2,
    opacity: 1.0,
    colorScheme: 'elevation',
    // Colormap options (new features)
    colormap: 'viridis',           // Choose from: viridis, plasma, inferno, magma, cividis, turbo, jet, rainbow, terrain, coolwarm, gray
    showColorbar: true,            // Show colorbar legend with min/max values
    colorRange: {                  // Customize the color range mapping
      mode: 'percentile',          // 'percentile' or 'absolute'
      percentileLow: 2,            // Lower percentile bound (default: 2)
      percentileHigh: 98,          // Upper percentile bound (default: 98)
    },
    // copcLoadingMode: 'dynamic',  // Auto-detected for COPC URLs, use 'full' to force download
    // streamingPointBudget: 5_000_000  // Max points in memory for streaming mode
    // panelMaxHeight: 600,
  });

  // Create layer adapter for the layer control
  const lidarAdapter = new LidarLayerAdapter(lidarControl);

  // Add layer control with the lidar adapter (add first so it appears above LidarControl)
  const layerControl = new LayerControl({
    collapsed: true,
    customLayerAdapters: [lidarAdapter],
    showStyleEditor: true, // Style editor doesn't work with custom layers
    basemapStyleUrl: BASEMAP_STYLE,
  });
  map.addControl(layerControl, 'top-right');

  // Add LidarControl after LayerControl
  map.addControl(lidarControl, 'top-right');



  // Load a point cloud programmatically
  lidarControl.loadPointCloud('https://s3.amazonaws.com/hobu-lidar/autzen-classified.copc.laz');

  // Listen for point cloud load events
  lidarControl.on('load', (event) => {
    console.log('Point cloud loaded:', event.pointCloud);
    if (event.pointCloud) {
      console.log(`  - Name: ${event.pointCloud.name}`);
      console.log(`  - Points: ${event.pointCloud.pointCount.toLocaleString()}`);
      console.log(`  - Has RGB: ${event.pointCloud.hasRGB}`);
      console.log(`  - Has Intensity: ${event.pointCloud.hasIntensity}`);
      console.log(`  - Has Classification: ${event.pointCloud.hasClassification}`);
    }
  });

  // lidarControl.on('loaderror', (event) => {
  //   console.error('Error loading point cloud:', event.error);
  // });

  // lidarControl.on('statechange', (event) => {
  //   console.log('LiDAR state changed:', event.state);
  // });

  // lidarControl.on('stylechange', () => {
  //   console.log('LiDAR style changed');
  // });

  // lidarControl.on('collapse', () => {
  //   console.log('LiDAR panel collapsed');
  // });

  // lidarControl.on('expand', () => {
  //   console.log('LiDAR panel expanded');
  // });

  // console.log('LiDAR control added to map');
  // console.log('Open the control panel and load a LAS/LAZ file to visualize point cloud data.');

  // Example: Load a local file (full download)
  // lidarControl.loadPointCloud('/data/autzen-classified.copc.laz')
  //   .then((info) => {
  //     console.log('Loaded programmatically:', info);
  //     lidarControl.flyToPointCloud();
  //   })
  //   .catch((err) => console.error('Failed to load:', err));

  // Example: Load COPC from URL - automatically uses dynamic streaming mode
  // Points are loaded on-demand based on viewport and zoom level
  // lidarControl.loadPointCloud('https://s3.amazonaws.com/hobu-lidar/autzen-classified.copc.laz');

  // To force full download for COPC URL (not recommended for large files):
  // lidarControl.loadPointCloud('https://example.com/large-pointcloud.copc.laz', {
  //   loadingMode: 'full'
  // });

  // Or use direct streaming method with custom options:
  // lidarControl.loadPointCloudStreaming('https://s3.amazonaws.com/hobu-lidar/autzen-classified.copc.laz', {
  //   pointBudget: 5_000_000,       // Max points in memory (default: 5M)
  //   maxConcurrentRequests: 4,     // Parallel HTTP requests (default: 4)
  //   viewportDebounceMs: 150       // Debounce viewport changes (default: 150ms)
  // });

  // Listen for streaming events
  // lidarControl.on('streamingprogress', (event) => {
  //   console.log('Streaming progress:', event.state.streamingProgress);
  // });
  // lidarControl.on('budgetreached', () => {
  //   console.log('Point budget reached');
  // });

  // Colormap API examples:
  // Change colormap programmatically
  // lidarControl.setColormap('turbo');        // Switch to turbo colormap
  // lidarControl.setColormap('terrain');      // Good for elevation visualization
  // lidarControl.setColormap('plasma');       // Perceptually uniform colormap
  //
  // Change color range programmatically
  // lidarControl.setColorRange({
  //   mode: 'percentile',
  //   percentileLow: 5,
  //   percentileHigh: 95,
  // });
  //
  // Use absolute value range
  // lidarControl.setColorRange({
  //   mode: 'absolute',
  //   absoluteMin: 100,      // Minimum elevation in meters
  //   absoluteMax: 200,      // Maximum elevation in meters
  // });
  //
  // Get current colormap
  // console.log('Current colormap:', lidarControl.getColormap());
  // console.log('Current color range:', lidarControl.getColorRange());
});
