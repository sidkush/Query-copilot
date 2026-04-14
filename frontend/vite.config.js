import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://localhost:8002',
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/echarts') || id.includes('echarts-for-react')) return 'vendor-echarts';
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
