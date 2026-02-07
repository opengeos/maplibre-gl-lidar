import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { GaussianSplatControl } from '../../src';

const BASEMAP_STYLE = 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json';

const map = new maplibregl.Map({
  container: 'map',
  style: BASEMAP_STYLE,
  center: [0, 0],
  zoom: 2,
  pitch: 60,
  maxPitch: 85,
  antialias: true,
});

// Add navigation control
map.addControl(new maplibregl.NavigationControl(), 'top-left');

// Add Gaussian Splat control
const splatControl = new GaussianSplatControl({
  collapsed: false,
  title: 'Gaussian Splats',
  // Example splat URL - users can enter their own
  defaultUrl: 'https://sparkjs.dev/assets/splats/butterfly.spz',
});

map.addControl(splatControl, 'top-right');

// Listen for events
splatControl.on('splatload', (event) => {
  console.log('Splat loaded:', event.url, 'id:', event.splatId);
});

splatControl.on('splatremove', (event) => {
  console.log('Splat removed:', event.splatId);
});

splatControl.on('error', (event) => {
  console.error('Splat error:', event.error);
});

// Log when map is ready
map.on('load', () => {
  console.log('Map loaded. Enter a .splat, .ply, or .spz URL and click Load Splat.');
  console.log('Example URLs:');
  console.log('  - https://sparkjs.dev/assets/splats/butterfly.spz');
  console.log('  - Your own Gaussian splat files');
});
