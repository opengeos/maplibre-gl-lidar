import maplibregl from 'maplibre-gl';
import { LidarControl, LidarLayerAdapter } from '../src/index';
import { LayerControl } from 'maplibre-gl-layer-control';
import '../src/index.css';
import 'maplibre-gl/dist/maplibre-gl.css';
import 'maplibre-gl-layer-control/style.css';

// DOM elements
const urlFormContainer = document.getElementById('url-form-container') as HTMLDivElement;
const urlForm = document.getElementById('url-form') as HTMLFormElement;
const urlInput = document.getElementById('url-input') as HTMLInputElement;
const loadBtn = document.getElementById('load-btn') as HTMLButtonElement;
const loadingIndicator = document.getElementById('loading-indicator') as HTMLDivElement;

let map: maplibregl.Map | null = null;
let lidarControl: LidarControl | null = null;
let layerControl: LayerControl | null = null;

// Initialize map (lazy)
function initMap(): maplibregl.Map {
  if (map) return map;

  map = new maplibregl.Map({
    container: 'map',
    style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
    center: [0, 0],
    zoom: 2,
    pitch: 60,
    maxPitch: 85,
  });

  map.addControl(new maplibregl.NavigationControl(), 'top-right');
  map.addControl(new maplibregl.FullscreenControl(), 'top-right');
  map.addControl(new maplibregl.GlobeControl(), 'top-right');
  map.addControl(new maplibregl.ScaleControl(), 'bottom-right');

  // Add Google Satellite basemap when map style loads
  map.on('style.load', () => {
    if (!map) return;

    // Add Google Satellite basemap
    map.addSource('google-satellite', {
      type: 'raster',
      tiles: ['https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}'],
      tileSize: 256,
      attribution: '&copy; Google',
    });

    map.addLayer({
      id: 'google-satellite',
      type: 'raster',
      source: 'google-satellite',
      paint: {
        'raster-opacity': 1,
      },
      layout: {
        visibility: 'none', // Hidden by default
      },
    });
  });

  return map;
}

// Initialize LiDAR control (lazy)
function initLidarControl(): LidarControl {
  if (lidarControl) return lidarControl;

  lidarControl = new LidarControl({
    title: 'LiDAR Viewer',
    collapsed: false,
    panelWidth: 360,
    pointSize: 2,
    opacity: 1.0,
    colorScheme: 'elevation',
  });

  return lidarControl;
}

// Initialize LayerControl (lazy)
function initLayerControl(control: LidarControl): LayerControl {
  if (layerControl) return layerControl;

  const lidarAdapter = new LidarLayerAdapter(control);

  layerControl = new LayerControl({
    collapsed: true,
    customLayerAdapters: [lidarAdapter],
    showStyleEditor: true,
    basemapStyleUrl: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
  });

  return layerControl;
}

// Load point cloud from URL
async function loadPointCloud(url: string): Promise<void> {
  // Show loading indicator
  loadingIndicator.style.display = 'block';
  loadBtn.disabled = true;

  try {
    // Initialize map if needed
    const mapInstance = initMap();

    // Wait for map to load
    if (!mapInstance.loaded()) {
      await new Promise<void>((resolve) => {
        mapInstance.on('load', () => resolve());
      });
    }

    // Initialize LiDAR control if needed
    const control = initLidarControl();

    // Initialize LayerControl if needed (add first so it appears above LidarControl)
    const lc = initLayerControl(control);
    if (!mapInstance.hasControl(lc)) {
      mapInstance.addControl(lc, 'top-right');
    }

    // Add LidarControl after LayerControl
    if (!mapInstance.hasControl(control)) {
      mapInstance.addControl(control, 'top-right');
    }

    // Clear existing point clouds
    const existingClouds = control.getPointClouds();
    for (const cloud of existingClouds) {
      control.removePointCloud(cloud.id);
    }

    // Load the point cloud
    const info = await control.loadPointCloud(url);
    console.log('Point cloud loaded:', info.name);
    console.log(`  - Points: ${info.pointCount.toLocaleString()}`);

    // Fly to point cloud
    control.flyToPointCloud(info.id);

    // Update URL in browser (without reload)
    const newUrl = new URL(window.location.href);
    newUrl.searchParams.set('url', url);
    window.history.pushState({}, '', newUrl.toString());

    // Update page title
    const filename = url.split('/').pop() || 'Point Cloud';
    document.title = `${filename} - MapLibre GL LiDAR`;

    // Hide form
    urlFormContainer.style.display = 'none';
  } catch (err) {
    console.error('Failed to load point cloud:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    alert(`Failed to load point cloud: ${message}`);
  } finally {
    loadingIndicator.style.display = 'none';
    loadBtn.disabled = false;
  }
}

// Event listeners
urlForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const url = urlInput.value.trim();
  if (url) {
    loadPointCloud(url);
  }
});

// Sample URL buttons
document.querySelectorAll('.sample-urls button[data-url]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const url = btn.getAttribute('data-url');
    if (url) {
      urlInput.value = url;
      loadPointCloud(url);
    }
  });
});

// Check for URL parameter on page load
const params = new URLSearchParams(window.location.search);
const initialUrl = params.get('url');

if (initialUrl) {
  urlInput.value = initialUrl;
  loadPointCloud(initialUrl);
}
