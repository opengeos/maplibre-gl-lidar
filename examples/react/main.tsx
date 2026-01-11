import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import maplibregl, { Map } from 'maplibre-gl';
import { LidarControlReact, useLidarState } from '../../src/react';
import type { PointCloudInfo, LidarState } from '../../src/react';
import '../../src/index.css';
import 'maplibre-gl/dist/maplibre-gl.css';

/**
 * Main App component demonstrating the React integration
 */
function App() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<Map | null>(null);
  const {
    state,
    toggle,
    setPointSize,
    setOpacity,
    setColorScheme,
  } = useLidarState({
    collapsed: false,
    pointSize: 2,
    colorScheme: 'elevation',
  });

  // Initialize the map
  useEffect(() => {
    if (!mapContainer.current) return;

    const mapInstance = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://demotiles.maplibre.org/style.json',
      center: [-122.8, 44.05], // Near Autzen Stadium, Oregon
      zoom: 14,
      pitch: 60,
      maxPitch: 85, // Allow higher pitch for better 3D viewing
      bearing: -17,
    });

    // Add navigation controls
    mapInstance.addControl(new maplibregl.NavigationControl(), 'top-right');

    // Add fullscreen control
    mapInstance.addControl(new maplibregl.FullscreenControl(), 'top-right');

    mapInstance.on('load', () => {
      setMap(mapInstance);
    });

    return () => {
      mapInstance.remove();
    };
  }, []);

  const handleStateChange = (newState: LidarState) => {
    console.log('LiDAR state changed:', newState);
  };

  const handleLoad = (pointCloud: PointCloudInfo) => {
    console.log('Point cloud loaded:', pointCloud);
  };

  const handleError = (error: Error) => {
    console.error('Error loading point cloud:', error);
  };

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={mapContainer} style={{ width: '100%', height: '100%' }} />

      {/* External control buttons */}
      <div
        style={{
          position: 'absolute',
          top: 10,
          left: 10,
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        <button onClick={toggle} style={buttonStyle}>
          {state.collapsed ? 'Expand' : 'Collapse'} Panel
        </button>

        <div style={sectionStyle}>
          <span style={labelStyle}>Color Scheme</span>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            <button
              onClick={() => setColorScheme('elevation')}
              style={{
                ...smallButtonStyle,
                background: state.colorScheme === 'elevation' ? '#159895' : '#e0e0e0',
                color: state.colorScheme === 'elevation' ? 'white' : '#333',
              }}
            >
              Elevation
            </button>
            <button
              onClick={() => setColorScheme('intensity')}
              style={{
                ...smallButtonStyle,
                background: state.colorScheme === 'intensity' ? '#159895' : '#e0e0e0',
                color: state.colorScheme === 'intensity' ? 'white' : '#333',
              }}
            >
              Intensity
            </button>
            <button
              onClick={() => setColorScheme('classification')}
              style={{
                ...smallButtonStyle,
                background: state.colorScheme === 'classification' ? '#159895' : '#e0e0e0',
                color: state.colorScheme === 'classification' ? 'white' : '#333',
              }}
            >
              Classification
            </button>
            <button
              onClick={() => setColorScheme('rgb')}
              style={{
                ...smallButtonStyle,
                background: state.colorScheme === 'rgb' ? '#159895' : '#e0e0e0',
                color: state.colorScheme === 'rgb' ? 'white' : '#333',
              }}
            >
              RGB
            </button>
          </div>
        </div>

        <div style={sectionStyle}>
          <span style={labelStyle}>Point Size: {state.pointSize}</span>
          <input
            type="range"
            min="1"
            max="10"
            step="0.5"
            value={state.pointSize}
            onChange={(e) => setPointSize(parseFloat(e.target.value))}
            style={{ width: '100%' }}
          />
        </div>

        <div style={sectionStyle}>
          <span style={labelStyle}>Opacity: {state.opacity.toFixed(2)}</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={state.opacity}
            onChange={(e) => setOpacity(parseFloat(e.target.value))}
            style={{ width: '100%' }}
          />
        </div>
      </div>

      {/* Info box */}
      <div
        style={{
          position: 'absolute',
          bottom: 20,
          left: 20,
          background: 'white',
          padding: '12px 16px',
          borderRadius: 4,
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
          fontSize: 13,
          maxWidth: 300,
          zIndex: 1,
        }}
      >
        <h3 style={{ margin: '0 0 8px 0', fontSize: 14 }}>React Integration</h3>
        <p style={{ margin: 0, color: '#666', lineHeight: 1.5 }}>
          This example shows how to control the LiDAR viewer from React state.
          Use the buttons on the left to change styling options.
        </p>
      </div>

      {/* LiDAR control */}
      {map && (
        <LidarControlReact
          map={map}
          title="LiDAR Viewer"
          collapsed={state.collapsed}
          panelWidth={330}
          pointSize={state.pointSize}
          opacity={state.opacity}
          colorScheme={state.colorScheme}
          onStateChange={handleStateChange}
          onLoad={handleLoad}
          onError={handleError}
        />
      )}
    </div>
  );
}

const buttonStyle: React.CSSProperties = {
  padding: '8px 16px',
  background: '#159895',
  color: 'white',
  border: 'none',
  borderRadius: 4,
  cursor: 'pointer',
  fontWeight: 500,
  fontSize: 13,
};

const smallButtonStyle: React.CSSProperties = {
  padding: '4px 8px',
  border: 'none',
  borderRadius: 3,
  cursor: 'pointer',
  fontWeight: 500,
  fontSize: 11,
};

const sectionStyle: React.CSSProperties = {
  background: 'white',
  padding: '8px 12px',
  borderRadius: 4,
  boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 500,
  color: '#666',
  display: 'block',
  marginBottom: 6,
};

// Mount the app
const root = createRoot(document.getElementById('root')!);
root.render(<App />);
