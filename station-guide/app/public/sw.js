// 지하에서 신호가 약해도 앱과 역 데이터가 열리도록 캐시한다.
// - 화면(HTML): 네트워크 우선, 실패하면 캐시
// - 빌드 산출물(/assets, /samples, 아이콘): 캐시 우선
// - Tesseract 인식 엔진·데이터(jsdelivr): 한 번 받으면 캐시 우선 → 이후 오프라인에서도 OCR
// - /api/*: 실시간 데이터라 캐시하지 않음
const CACHE = 'station-guide-v1'

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin === location.origin && url.pathname.includes('/api/')) return

  const cacheFirst = async () => {
    const hit = await caches.match(req)
    if (hit) return hit
    const res = await fetch(req)
    if (res.ok) (await caches.open(CACHE)).put(req, res.clone())
    return res
  }
  const networkFirst = async () => {
    try {
      const res = await fetch(req)
      if (res.ok) (await caches.open(CACHE)).put(req, res.clone())
      return res
    } catch {
      return (await caches.match(req)) ?? (await caches.match('./')) ?? Response.error()
    }
  }

  if (req.mode === 'navigate') return e.respondWith(networkFirst())
  if (url.origin === location.origin) return e.respondWith(cacheFirst())
  if (url.hostname === 'cdn.jsdelivr.net' && url.pathname.includes('tesseract')) return e.respondWith(cacheFirst())
})
