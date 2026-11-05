/* Service Worker – wird beim Build mit Build-ID und Dateiliste befüllt. */
const BUILD_ID = '__BUILD_ID__'
const PRECACHE = __PRECACHE__
const APP_CACHE = `app-${BUILD_ID}`
const RUNTIME_CACHE = 'runtime-v1' // z. B. OCR-Sprachdaten von CDNs
const BASE = new URL('./', self.location).pathname

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(APP_CACHE)
      .then((cache) => cache.addAll(PRECACHE.map((f) => BASE + f)))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('app-') && k !== APP_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  // Seitenaufrufe: Netzwerk zuerst, offline die App-Hülle (index.html)
  if (req.mode === 'navigate' && url.origin === self.location.origin) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) caches.open(APP_CACHE).then((c) => c.put(BASE, res.clone()))
          return res.status === 404 ? caches.match(BASE).then((r) => r || res) : res
        })
        .catch(() => caches.match(BASE)),
    )
    return
  }

  // Eigene Dateien: Cache zuerst (Dateinamen enthalten einen Hash)
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone()
              caches.open(APP_CACHE).then((c) => c.put(req, copy))
            }
            return res
          }),
      ),
    )
    return
  }

  // OCR-Bausteine & Sprachdaten (Tesseract via CDN) nach erstem Laden offline verfügbar machen
  if (/(cdn\.jsdelivr\.net|unpkg\.com|tessdata)/.test(url.href)) {
    event.respondWith(
      caches.open(RUNTIME_CACHE).then((cache) =>
        cache.match(req).then(
          (hit) =>
            hit ||
            fetch(req).then((res) => {
              if (res.ok || res.type === 'opaque') cache.put(req, res.clone())
              return res
            }),
        ),
      ),
    )
  }
})
