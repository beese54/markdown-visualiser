import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    target: 'es2022',
    // Assets must be inlineable into a standalone export, so keep the
    // threshold low and let the export serialiser do the inlining itself.
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Mermaid is ~482KB and most documents never contain a diagram.
          // Keeping it in its own chunk is what makes the lazy import pay off.
          if (id.includes('node_modules/mermaid')) return 'mermaid'
          if (id.includes('node_modules/shiki')) return 'shiki'
          if (id.includes('node_modules/katex')) return 'katex'
          return undefined
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: { '/api': 'http://localhost:8080', '/healthz': 'http://localhost:8080' },
  },
})
