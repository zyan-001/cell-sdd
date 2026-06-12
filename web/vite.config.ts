import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import os from 'node:os'
import path from 'node:path'

const viteTmpDir = process.env.VITE_TMP_DIR?.trim()
const cacheDir = viteTmpDir && viteTmpDir.length > 0
  ? path.resolve(viteTmpDir)
  : path.resolve(os.tmpdir(), 'cell-sdd-vite-cache')
const tmpDirSource = viteTmpDir && viteTmpDir.length > 0 ? 'VITE_TMP_DIR' : 'os.tmpdir fallback'

if (process.env.VITE_TMP_DEBUG === '1') {
  console.log(`[cell-sdd] Vite cacheDir = ${cacheDir} (${tmpDirSource})`)
}

export default defineConfig({
  plugins: [react()],
  cacheDir,
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3210',
        changeOrigin: true,
      },
    },
  },
})
