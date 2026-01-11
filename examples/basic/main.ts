import maplibregl from 'maplibre-gl';
import { LidarControl } from '../../src/index';
import '../../src/index.css';
import 'maplibre-gl/dist/maplibre-gl.css';

// Create map with 3D terrain enabled
const map = new maplibregl.Map({
  container: 'map',
  style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
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

// Add scale control
map.addControl(new maplibregl.ScaleControl(), 'bottom-right');

// Add LiDAR control when map loads
map.on('load', () => {
  // Create the LiDAR control with options
  const lidarControl = new LidarControl({
    title: 'LiDAR Viewer',
    collapsed: true, // Start with just the 29x29 button visible
    panelWidth: 320,
    pointSize: 2,
    opacity: 1.0,
    colorScheme: 'elevation',
    // panelMaxHeight: 600,
  });

  // Add control to the map
  map.addControl(lidarControl, 'top-right');

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

  // Example: Load a point cloud programmatically (uncomment to use)
  // lidarControl.loadPointCloud('/data/autzen-classified.copc.laz')
  //   .then((info) => {
  //     console.log('Loaded programmatically:', info);
  //     lidarControl.flyToPointCloud();
  //   })
  //   .catch((err) => console.error('Failed to load:', err));
});
