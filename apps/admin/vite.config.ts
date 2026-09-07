import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'node:path'
export default defineConfig({
  root:resolve('apps/admin'),plugins:[vue()],
  server:{host:'127.0.0.1',port:5180,strictPort:true,proxy:{'/api':'http://127.0.0.1:4310'}},
  build:{outDir:'dist',emptyOutDir:true,rollupOptions:{output:{manualChunks:{'ui-vendor':['element-plus','vue']}}}}
})
