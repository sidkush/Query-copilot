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
})
