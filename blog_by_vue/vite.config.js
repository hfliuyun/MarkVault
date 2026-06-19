import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5000', // Set your API base URL here
        changeOrigin: true,
        //rewrite: (path) => path.replace(/^\/api/, '')
      },
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vue-vendor': ['vue', 'vue-router'],
          'element-plus': ['element-plus', '@element-plus/icons-vue'],
          'katex': ['katex'],
          'highlight': ['highlight.js'],
          'md-editor': ['md-editor-v3'],
          'marked': ['marked', 'marked-highlight']
        }
      }
    },
    chunkSizeWarningLimit: 1000,
  }
})
