import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [
    // Plugin to redirect @loaders.gl/las bundled laz-perf to browser version
    // This avoids Node.js-specific require('fs') and require('path') calls
    {
      name: 'redirect-loaders-gl-laz-perf',
      enforce: 'pre',
      resolveId(id, importer) {
        if (id.includes('laz-perf') && importer?.includes('@loaders.gl/las')) {
          return resolve(__dirname, 'node_modules/laz-perf/lib/web/laz-perf.js');
        }
        return null;
      },
    },
    react(),
    dts({
      include: ['src'],
      outDir: 'dist/types',
      rollupTypes: false,
    }),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      // Force laz-perf to use browser version (no fs/path requires)
      'laz-perf': resolve(__dirname, 'node_modules/laz-perf/lib/web/index.js'),
    },
  },
  assetsInclude: ['**/*.wasm'],
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        react: resolve(__dirname, 'src/react.ts'),
      },
      name: 'MapLibreLidar',
      formats: ['es', 'cjs'],
      fileName: (format, entryName) => {
        const ext = format === 'es' ? 'mjs' : 'cjs';
        return `${entryName}.${ext}`;
      },
    },
    rollupOptions: {
      external: [
        'react',
        'react-dom',
        'maplibre-gl',
        '@deck.gl/core',
        '@deck.gl/layers',
        '@deck.gl/mapbox',
        '@deck.gl/extensions',
      ],
      output: {
        globals: {
          react: 'React',
          'react-dom': 'ReactDOM',
          'maplibre-gl': 'maplibregl',
        },
        assetFileNames: (assetInfo) => {
          if (assetInfo.name === 'style.css') return 'maplibre-gl-lidar.css';
          return assetInfo.name || '';
        },
      },
    },
    cssCodeSplit: false,
    sourcemap: true,
    minify: false,
  },
});
