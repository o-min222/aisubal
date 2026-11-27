// AI쓰발 service worker: makes the site installable, caches hashed /_next/static assets,
// and shows a small offline page for navigations. HTML documents always come from the network
// (pages are per-member).
const STATIC_CACHE = 'aisubal-static-v1'
self.addEventListener('install', () => self.skipWaiting())
// A67: navigation preload starts the page request while the worker boots (cold opens / PWA launch).
self.addEventListener('activate', (e) =>
  e.waitUntil(
    Promise.all([
      self.clients.claim(),
      self.registration.navigationPreload ? self.registration.navigationPreload.enable().catch(() => {}) : null,
      caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('aisubal-static-') && k !== STATIC_CACHE).map((k) => caches.delete(k)))),
    ])
  )
)
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  if (e.request.method === 'GET' && url.origin === self.location.origin && url.pathname.startsWith('/_next/static/')) {
    e.respondWith(
      caches.open(STATIC_CACHE).then((cache) =>
        cache.match(e.request).then((hit) => {
          if (hit) return hit
          return fetch(e.request).then((res) => {
            if (res.ok) cache.put(e.request, res.clone())
            return res
          })
        })
      )
    )
    return
  }
  if (e.request.mode !== 'navigate') return
  e.respondWith(
    Promise.resolve(e.preloadResponse)
      .then((r) => r || fetch(e.request))
      .catch(() => fetch(e.request))
      .catch(
      () =>
        new Response(
          '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AI쓰발</title>' +
            '<body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;background:#f4f4f2;color:#111">' +
            '<div style="text-align:center;padding:24px"><p style="font-size:18px;font-weight:700;margin:0 0 6px">오프라인이에요</p>' +
            '<p style="font-size:14px;color:#666;margin:0">연결되면 다시 열어 주세요. · You are offline.</p></div>',
          { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        )
    )
  )
})

// Web push (D1): what the dispatcher sends is { title, body, url, tag, badge } (see lib/push-rules.ts).
self.addEventListener('push', (e) => {
  let d = {}
  try {
    d = e.data ? e.data.json() : {}
  } catch (_) {
    d = { body: e.data ? e.data.text() : '' }
  }
  const url = typeof d.url === 'string' && d.url.startsWith('/') && !d.url.startsWith('//') ? d.url : '/notifications'
  const jobs = [
    self.registration.showNotification(d.title || 'AI쓰발', {
      body: d.body || '',
      icon: '/icons/icon-192.png',
      tag: d.tag || undefined,
      renotify: Boolean(d.tag),
      data: { url },
    }),
  ]
  if (typeof d.badge === 'number' && self.navigator && 'setAppBadge' in self.navigator) jobs.push(self.navigator.setAppBadge(d.badge).catch(() => {}))
  e.waitUntil(Promise.all(jobs))
})

self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const path = (e.notification.data && e.notification.data.url) || '/notifications'
  const target = new URL(path, self.location.origin)
  if (target.origin !== self.location.origin) return
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (new URL(c.url).origin === target.origin && 'focus' in c) {
          return c.focus().then((w) => (w && 'navigate' in w ? w.navigate(target.href) : self.clients.openWindow(target.href)))
        }
      }
      return self.clients.openWindow(target.href)
    })
  )
})

// The browser rotated the subscription: save the new one (same member session cookie).
self.addEventListener('pushsubscriptionchange', (e) => {
  const opts = e.oldSubscription && e.oldSubscription.options
  if (!opts) return
  e.waitUntil(
    self.registration.pushManager.subscribe(opts).then((sub) =>
      fetch('/api/push/subscribe', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sub.toJSON()) })
    ).catch(() => {})
  )
})
