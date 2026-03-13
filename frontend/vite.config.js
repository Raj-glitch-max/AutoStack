import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [tailwindcss(), react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor': ['react', 'react-dom', 'react-router-dom'],
          'ui-icons': ['lucide-react'],
          'ui-charts': ['recharts'],
          'analytics': ['posthog-js'],
          'error-tracking': ['@sentry/react']
        }
      }
    }
  }
})
