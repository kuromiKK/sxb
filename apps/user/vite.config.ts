import { defineConfig } from 'vite'
import uni from '@dcloudio/vite-plugin-uni'

export default defineConfig({
  plugins: [uni(), {
    name: 'h5-public-chunk-filenames',
    enforce: 'post',
    // uni-app sets chunk names in its config hook; normalize after that hook.
    config() {
      if (process.env.UNI_PLATFORM !== 'h5') return
      return { build: { rollupOptions: { output: {
        chunkFileNames: chunk => `assets/${chunk.name.replace(/[^a-zA-Z0-9_-]/g, '_')}-[hash].js`,
      } } } }
    },
  }],
  server: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
    proxy: { '/api': 'http://127.0.0.1:4310' },
  },
})
