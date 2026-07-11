import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [
    vue(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./frontend', import.meta.url))
    }
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000'
    }
  },
  build: {
    chunkSizeWarningLimit: 700,
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/primevue')) return 'primevue';
          if (id.includes('node_modules/vue')) return 'vue-vendor';
        }
      }
    }
  }
})