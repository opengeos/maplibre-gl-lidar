import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';
import replace from '@rollup/plugin-replace';

// Browser-safe shim for Node.js 'path' module (used by @rollup/plugin-replace)
// This code is inside ENVIRONMENT_IS_NODE guards and never executes in browsers,
// but we provide a correct implementation for safety
const PATH_SHIM = `({
  dirname: (p) => { const i = p.lastIndexOf('/'); return i <= 0 ? (i === 0 ? '/' : '.') : p.substring(0, i); },
  normalize: (p) => p,
  join: (...a) => a.filter(Boolean).join('/').replace(/\\/+/g, '/')
})`;

export default defineConfig({
  plugins: [
    react(),
    dts({
      include: ['src'],
      entryRoot: 'src',
      outDirs: 'dist/types',
      insertTypesEntry: true,
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
      plugins: [
        // Replace require("fs") and require("path") with browser-safe shims
        // These are in @loaders.gl/las Emscripten code inside ENVIRONMENT_IS_NODE guards
        // (never executed in browsers, but static analyzers still try to resolve them)
        replace({
          preventAssignment: true,
          delimiters: ['', ''],
          values: {
            'require("fs")': '{}',
            "require('fs')": '{}',
            'require("path")': PATH_SHIM,
            "require('path')": PATH_SHIM,
          },
        }),
      ],
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
