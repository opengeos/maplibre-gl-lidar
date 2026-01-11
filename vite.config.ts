import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import dts from 'vite-plugin-dts';

const loadersGlPath = '/home/qiusheng/Documents/Code/loaders.gl';

export default defineConfig({
  plugins: [
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
      // Point to source files so WASM paths work correctly
      '@loaders.gl/core': `${loadersGlPath}/modules/core/src/index.ts`,
      '@loaders.gl/las': `${loadersGlPath}/modules/las/src/index.ts`,
      '@loaders.gl/loader-utils': `${loadersGlPath}/modules/loader-utils/src/index.ts`,
      '@loaders.gl/schema': `${loadersGlPath}/modules/schema/src/index.ts`,
      '@loaders.gl/schema-utils': `${loadersGlPath}/modules/schema-utils/src/index.ts`,
      '@loaders.gl/worker-utils': `${loadersGlPath}/modules/worker-utils/src/index.ts`,
    },
  },
  server: {
    fs: {
      // Allow serving files from loaders.gl directory
      allow: ['.', loadersGlPath],
    },
  },
  optimizeDeps: {
    exclude: ['@loaders.gl/las', '@loaders.gl/core', '@loaders.gl/loader-utils', '@loaders.gl/schema', '@loaders.gl/schema-utils', '@loaders.gl/worker-utils'],
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
