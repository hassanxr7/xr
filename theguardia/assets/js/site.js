/* The Guardia — public site script: menu, search, sharing, ads, analytics beacon and push alerts. */
(function () {
  'use strict';
  var body = document.body;
  var base = body.getAttribute('data-base') || '';
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };

  function toast(msg) {
    var t = $('.toast');
    if (!t) return;
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast.timer);
    toast.timer = setTimeout(function () { t.hidden = true; }, 3500);
  }

  // ---- Menu drawer ----
  var drawer = $('#drawer');
  var menuBtn = $('.js-menu');
  function closeDrawer() { if (drawer) { drawer.hidden = true; menuBtn && menuBtn.setAttribute('aria-expanded', 'false'); document.documentElement.style.overflow = ''; } }
  if (menuBtn && drawer) {
    menuBtn.addEventListener('click', function () {
      drawer.hidden = false;
      menuBtn.setAttribute('aria-expanded', 'true');
      document.documentElement.style.overflow = 'hidden';
      var first = $('a, input', drawer);
      first && first.focus();
    });
    drawer.addEventListener('click', function (e) { if (e.target === drawer || e.target.closest('.js-menu-close')) closeDrawer(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDrawer(); });
  }

  // ---- Search toggle ----
  var bar = $('.searchbar');
  $$('.js-search-toggle').forEach(function (a) {
    a.addEventListener('click', function (e) {
      if (!bar) return;
      e.preventDefault();
      bar.hidden = !bar.hidden;
      if (!bar.hidden) $('input', bar).focus();
    });
  });

  // ---- Copy link ----
  $$('.share-copy').forEach(function (b) {
    b.addEventListener('click', function () {
      var url = b.getAttribute('data-copy');
      if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
        navigator.share({ title: document.title, url: url.replace('utm_source=copy', 'utm_source=native') }).catch(function () {});
        return;
      }
      (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(function () { toast('Link copied'); }, function () { window.prompt('Copy this link:', url); });
    });
  });

  // ---- Ads ----
  if ($('ins.adsbygoogle')) {
    $$('ins.adsbygoogle').forEach(function () { try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (e) {} });
  }
  var anchorClose = $('.js-anchor-close');
  anchorClose && anchorClose.addEventListener('click', function () { anchorClose.parentNode.remove(); });

  // ---- Google Analytics 4 (optional, set in the dashboard) ----
  var ga = body.getAttribute('data-ga');
  if (ga) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', ga);
  }

  // ---- Own analytics beacon (counts views, countries, cities and where readers come from) ----
  function visitorId() {
    var id = store.get('tg_vid'), isNew = 0;
    if (!id) {
      id = (Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
      store.set('tg_vid', id);
      isNew = 1;
    }
    return { id: id, isNew: isNew };
  }
  function track() {
    if (navigator.webdriver || /bot|crawl|spider|preview/i.test(navigator.userAgent)) return;
    var v = visitorId();
    var adIds = $$('[data-ad-id]').map(function (el) { return el.getAttribute('data-ad-id'); });
    var payload = JSON.stringify({
      p: location.pathname, q: location.search.slice(0, 300), r: document.referrer.slice(0, 500),
      a: parseInt(body.getAttribute('data-article'), 10) || 0, v: v.id, n: v.isNew, ads: adIds, w: window.screen ? screen.width : 0
    });
    var url = base + '/api/track';
    if (navigator.sendBeacon && navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }))) return;
    fetch(url, { method: 'POST', body: payload, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(function () {});
  }
  if (document.visibilityState === 'prerender') {
    document.addEventListener('visibilitychange', function once() { if (document.visibilityState === 'visible') { track(); document.removeEventListener('visibilitychange', once); } });
  } else {
    track();
  }
  var views = (parseInt(store.get('tg_views'), 10) || 0) + 1;
  store.set('tg_views', String(views));

  // ---- Push alerts ----
  var vapid = body.getAttribute('data-vapid');
  var pushSupported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && !!vapid;
  var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;

  var swReady = 'serviceWorker' in navigator
    ? navigator.serviceWorker.register(base + '/sw.js', { scope: base + '/' }).then(function () { return navigator.serviceWorker.ready; }).catch(function () { return null; })
    : Promise.resolve(null);

  function keyToBytes(b64) {
    var pad = '='.repeat((4 - b64.length % 4) % 4);
    var raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    var out = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }

  function subscribe(topic) {
    if (isIOS && !standalone) {
      toast('On iPhone: tap Share → “Add to Home Screen”, open the app, then turn on alerts.');
      return;
    }
    if (!pushSupported) { toast('Alerts are not supported in this browser.'); return; }
    Notification.requestPermission().then(function (perm) {
      if (perm !== 'granted') { toast('Alerts are blocked. You can allow them in your browser settings.'); store.set('tg_alerts', 'no'); return; }
      return swReady.then(function (reg) {
        if (!reg) throw new Error('no sw');
        return reg.pushManager.getSubscription().then(function (sub) {
          return sub || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(vapid) });
        });
      }).then(function (sub) {
        return fetch(base + '/api/push/subscribe', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subscription: sub.toJSON(), topic: topic || 0 })
        });
      }).then(function (r) {
        if (!r.ok) throw new Error('save failed');
        store.set('tg_alerts', 'yes');
        hidePrompt();
        toast('Alerts are on. We will notify you about breaking news.');
      });
    }).catch(function () { toast('Could not turn on alerts. Please try again.'); });
  }

  $$('.js-alerts').forEach(function (b) {
    b.addEventListener('click', function () { subscribe(parseInt(b.getAttribute('data-topic'), 10) || 0); });
  });

  var prompt = $('.alerts-prompt');
  function hidePrompt() { if (prompt) prompt.hidden = true; }
  if (prompt) {
    $('.js-alerts-yes', prompt).addEventListener('click', function () { subscribe(0); });
    $('.js-alerts-no', prompt).addEventListener('click', function () { hidePrompt(); store.set('tg_alerts_later', String(Date.now())); });
    var later = parseInt(store.get('tg_alerts_later'), 10) || 0;
    var answered = store.get('tg_alerts');
    if (pushSupported && Notification.permission === 'default' && !answered && Date.now() - later > 7 * 864e5 && views >= 2) {
      setTimeout(function () { prompt.hidden = false; }, 12000);
    }
  }
})();
