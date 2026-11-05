/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { githubPagesPwa } from './pwa/plugin'

/**
 * Basis-Pfad für GitHub Pages.
 * Projektseite: https://USERNAME.github.io/REPO/  →  "/REPO/"
 * Der GitHub-Actions-Workflow setzt BASE_PATH automatisch aus dem Repository-Namen.
 */
function normalizeBase(b: string | undefined): string {
  const v = (b ?? '/franzoesisch-lernen/').trim().replace(/^\/+|\/+$/g, '')
  return v ? `/${v}/` : '/'
}

export default defineConfig({
  base: normalizeBase(process.env.BASE_PATH),
  plugins: [react(), tailwindcss(), githubPagesPwa()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
    sourcemap: false,
  },
  worker: { format: 'es' },
  optimizeDeps: { esbuildOptions: { target: 'es2022' } },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
})
