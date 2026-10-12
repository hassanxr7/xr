// Installable app (PWA) service worker. Network first so every deployment is picked up at once; the cached copy of the
// app shell is used only when the phone is offline. API calls (/api/...) are never cached.
const CACHE = 'hubdex-shell-v1';
const SHELL = ['/', 'index.html', 'styles.css', 'app.js', 'core.js', 'views.js', 'i18n.js', 'i18n_more.js', 'i18n_err.js', 'i18n_docs.js', 'i18n_v3.js', 'v_dash.js', 'v_sell.js', 'v_stock.js', 'v_money.js', 'v_admin.js', 'v_shop.js', 'scan.js', 'vendor/jsQR.js', 'brand/icon-192.png', 'manifest.webmanifest'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  e.respondWith(fetch(e.request).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)).catch(() => {}); } return r; }).catch(() => caches.match(e.request).then((m) => m || caches.match('/'))));
});
