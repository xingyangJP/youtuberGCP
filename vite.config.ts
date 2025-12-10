import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    outDir: 'dist',
    ssr: 'src/index.tsx',
    rollupOptions: {
      input: 'src/index.tsx',
      output: {
        entryFileNames: '_worker.js',
        format: 'esm'
      }
    }
  }
})
