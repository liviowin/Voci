/**
 * Kleines Vite-Plugin für GitHub Pages + Offline-Betrieb:
 *  1. erzeugt sw.js mit Liste aller Build-Dateien (Precache) und eindeutiger Build-ID
 *  2. kopiert index.html nach 404.html, damit direkte Aufrufe / Neuladen von
 *     Unterseiten (z. B. /franzoesisch-lernen/statistik) auf GitHub Pages funktionieren
 */
import { copyFileSync, existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Plugin, ResolvedConfig } from 'vite'

export function githubPagesPwa(): Plugin {
  let config: ResolvedConfig
  return {
    name: 'github-pages-pwa',
    apply: 'build',
    configResolved(c) {
      config = c
    },
    generateBundle(_opts, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map') && f !== 'sw.js')
      const publicFiles = ['manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png']
      const precache = ['', ...files.filter((f) => f !== 'index.html'), ...publicFiles]
      const buildId = Date.now().toString(36)
      const template = readFileSync(join(config.root, 'pwa', 'sw.js'), 'utf8')
      const source = template.replace('__BUILD_ID__', buildId).replace('__PRECACHE__', JSON.stringify(precache))
      this.emitFile({ type: 'asset', fileName: 'sw.js', source })
    },
    closeBundle() {
      const out = join(config.root, config.build.outDir)
      const index = join(out, 'index.html')
      if (existsSync(index)) copyFileSync(index, join(out, '404.html'))
    },
  }
}
