import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { visualizer } from 'rollup-plugin-visualizer'

const plugins = [react(), tailwindcss()];
if (process.env.ANALYZE) {
  plugins.push(visualizer({
    filename: 'dist/bundle-report.html',
    gzipSize: true,
    template: 'treemap',
  }));
}

export default defineConfig({
  plugins,
  server: {
    proxy: {
      '/api': 'http://localhost:8002',
    },
  },
  build: {
    modulePreload: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/regl')) return 'vendor-vizql';
          if (id.includes('node_modules/framer-motion')) return 'vendor-motion';
          if (id.includes('node_modules/html2canvas') || id.includes('node_modules/jspdf')) return 'vendor-export';
          if (id.includes('node_modules/three') || id.includes('@react-three')) return 'vendor-three';
          if (id.includes('node_modules/react-syntax-highlighter')) return 'vendor-syntax';
          // Phase 4 wow-factor deps — own chunks, lazy-loaded by engines
          if (id.includes('node_modules/@deck.gl') || id.includes('node_modules/deck.gl') || id.includes('node_modules/@luma.gl') || id.includes('node_modules/@math.gl') || id.includes('node_modules/@loaders.gl')) return 'vendor-deckgl';
          if (id.includes('node_modules/d3-shape') || id.includes('node_modules/d3-scale') || id.includes('node_modules/d3-selection') || id.includes('node_modules/d3-path') || id.includes('node_modules/d3-array') || id.includes('node_modules/d3-interpolate') || id.includes('node_modules/d3-color') || id.includes('node_modules/d3-format') || id.includes('node_modules/d3-time')) return 'vendor-d3';
        },
      },
    },
  },
})
