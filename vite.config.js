import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html')
      },
      output: {
        manualChunks(id) {
          // Vendor chunks for faster initial load and better caching
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom')) {
            return 'react-vendor';
          }
          if (id.includes('node_modules/recharts') || id.includes('node_modules/d3')) {
            return 'charts-vendor';
          }
          if (id.includes('node_modules/framer-motion')) {
            return 'animation-vendor';
          }
          if (id.includes('node_modules/lucide-react')) {
            return 'icons-vendor';
          }
          if (id.includes('node_modules/zustand')) {
            return 'state-vendor';
          }
          if (id.includes('node_modules/date-fns')) {
            return 'date-vendor';
          }
        }
      }
    }
  },
  server: {
    port: 5173
  }
});
