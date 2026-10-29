/* The Guardia — service worker: push alerts and an offline fallback. */
'use strict';
var BASE = self.registration.scope.replace(/\/$/, '');
var CACHE = 'tg-v1';
var OFFLINE = BASE + '/offline';

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll([OFFLINE]); }).catch(function () {}));
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

// Network first for pages (keeps a copy of recently read stories), cache first for fonts/CSS/JS.
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.indexOf('/admin') !== -1 || url.pathname.indexOf('/api/') !== -1) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then(function (res) {
      if (res.ok) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) { return hit || caches.match(OFFLINE); });
    }));
    return;
  }
  if (/\/assets\/(fonts|css|js|img)\//.test(url.pathname)) {
    e.respondWith(caches.match(req).then(function (hit) {
      return hit || fetch(req).then(function (res) {
        if (res.ok) { var copy = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, copy); }); }
        return res;
      });
    }));
  }
});

self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (err) { d = { title: e.data ? e.data.text() : 'News alert' }; }
  var title = d.title || 'The Guardia';
  var opts = {
    body: d.body || '',
    icon: d.icon || BASE + '/assets/img/icon-192.png',
    badge: BASE + '/assets/img/icon-192.png',
    image: d.image || undefined,
    tag: d.tag || 'tg-news',
    renotify: true,
    data: { url: d.url || BASE + '/', id: d.id || 0 }
  };
  e.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  var data = e.notification.data || {};
  var target = data.url || BASE + '/';
  var track = data.id ? fetch(BASE + '/api/push/click/' + data.id, { method: 'POST' }).catch(function () {}) : Promise.resolve();
  e.waitUntil(Promise.all([track, self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].url === target && 'focus' in list[i]) return list[i].focus();
    }
    return self.clients.openWindow(target);
  })]));
});
