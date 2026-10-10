/* ITrackZen - lightweight vanilla JS (no dependencies) */
(function () {
  'use strict';
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* ---------- Mobile nav ---------- */
  var toggle = $('.nav-toggle');
  if (toggle) {
    toggle.addEventListener('click', function () {
      var open = document.documentElement.classList.toggle('nav-open');
      document.body.classList.toggle('nav-open', open);
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    });
    $$('#primary-nav a').forEach(function (a) {
      a.addEventListener('click', function () { document.body.classList.remove('nav-open'); document.documentElement.classList.remove('nav-open'); toggle.setAttribute('aria-expanded', 'false'); });
    });
  }
  // keep mobile menu state on <body> too (CSS targets .nav-open on ancestors of nav)
  var mo = new MutationObserver(function () { document.body.classList.toggle('nav-open', document.documentElement.classList.contains('nav-open')); });
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

  /* ---------- Scroll reveal ---------- */
  var reveals = $$('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
    reveals.forEach(function (el, i) { el.style.transitionDelay = Math.min((i % 6) * 60, 300) + 'ms'; io.observe(el); });
  } else { reveals.forEach(function (el) { el.classList.add('in'); }); }

  /* ---------- Count-up ---------- */
  var counters = $$('[data-count]');
  if (counters.length && 'IntersectionObserver' in window) {
    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) { return; }
        cio.unobserve(en.target);
        var el = en.target, end = parseInt(el.getAttribute('data-count'), 10) || 0, t0 = null; el.textContent = '0';
        function step(ts) { t0 = t0 || ts; var p = Math.min((ts - t0) / 1200, 1); el.textContent = Math.floor(end * (1 - Math.pow(1 - p, 3))) + (end >= 50 ? '+' : ''); if (p < 1) { requestAnimationFrame(step); } }
        requestAnimationFrame(step);
      });
    }, { threshold: 0.4 });
    counters.forEach(function (c) { cio.observe(c); });
  }

  /* ---------- Video-style product tour ---------- */
  var tour = $('[data-tour]');
  if (tour) {
    var tabs = $$('.tour-tabs button', tour), scenes = $$('.scene-wrap', tour), bar = $('.tour-progress b', tour);
    var idx = 0, DUR = 6000, timer = null, start = 0, raf = null, paused = false, visible = true;
    var show = function (i) {
      idx = (i + tabs.length) % tabs.length;
      tabs.forEach(function (t, n) { var on = n === idx; t.classList.toggle('active', on); t.setAttribute('aria-selected', on ? 'true' : 'false'); });
      scenes.forEach(function (s, n) { s.classList.toggle('is-active', n === idx); });
      start = performance.now();
    };
    var tick = function (now) {
      if (!paused && visible) {
        var p = (now - start) / DUR;
        if (bar) { bar.style.width = Math.min(p * 100, 100) + '%'; }
        if (p >= 1) { show(idx + 1); }
      } else { start = now - (bar ? parseFloat(bar.style.width || 0) / 100 * DUR : 0); }
      raf = requestAnimationFrame(tick);
    };
    tabs.forEach(function (t, n) {
      t.addEventListener('click', function () { show(n); });
      t.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowRight') { show(idx + 1); tabs[idx].focus(); e.preventDefault(); }
        if (e.key === 'ArrowLeft') { show(idx - 1); tabs[idx].focus(); e.preventDefault(); }
      });
    });
    tour.addEventListener('mouseenter', function () { paused = true; });
    tour.addEventListener('mouseleave', function () { paused = false; });
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      if ('IntersectionObserver' in window) { new IntersectionObserver(function (e) { visible = e[0].isIntersecting; }, { threshold: 0.25 }).observe(tour); }
      show(0); raf = requestAnimationFrame(tick);
    }
    var play = $('.play-btn', tour);
    if (play) {
      play.addEventListener('click', function () {
        var url = play.getAttribute('data-video'), stage = $('.tour-stage', tour), el;
        paused = true;
        var yt = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([\w-]{11})/), vm = url.match(/vimeo\.com\/(\d+)/);
        if (yt) { el = document.createElement('iframe'); el.src = 'https://www.youtube-nocookie.com/embed/' + yt[1] + '?autoplay=1&rel=0'; el.allow = 'autoplay; fullscreen'; el.allowFullscreen = true; }
        else if (vm) { el = document.createElement('iframe'); el.src = 'https://player.vimeo.com/video/' + vm[1] + '?autoplay=1'; el.allow = 'autoplay; fullscreen'; el.allowFullscreen = true; }
        else { el = document.createElement('video'); el.src = url; el.controls = true; el.autoplay = true; el.playsInline = true; }
        stage.appendChild(el); play.remove();
      });
    }
  }

  /* ---------- Supported trackers: search + filters ---------- */
  var grid = $('#brand-grid');
  if (grid) {
    var input = $('#tracker-search'), chips = $$('#tracker-filters button'), count = $('#tracker-count'), empty = $('#tracker-empty');
    var cards = $$('.brand-card', grid), active = 'all';
    var apply = function () {
      var q = (input.value || '').toLowerCase().trim(), shown = 0;
      cards.forEach(function (card) {
        var brandHit = q && card.getAttribute('data-brand').indexOf(q) > -1, any = 0;
        $$('.model-list li', card).forEach(function (li) {
          var name = li.getAttribute('data-name'), tags = ' ' + li.getAttribute('data-tags') + ' ';
          var okTag = active === 'all' || tags.indexOf(' ' + active + ' ') > -1;
          var okQ = !q || brandHit || name.indexOf(q) > -1 || tags.indexOf(q) > -1;
          var ok = okTag && okQ; li.hidden = !ok; if (ok) { any++; }
        });
        card.hidden = any === 0; shown += any;
      });
      count.innerHTML = 'Showing <b>' + shown + '</b> model' + (shown === 1 ? '' : 's') + (q ? ' for "' + q.replace(/[<>&"]/g, '') + '"' : '');
      empty.hidden = shown !== 0;
    };
    var setFilter = function (f) {
      active = f;
      chips.forEach(function (c) { var on = c.getAttribute('data-filter') === f; c.classList.toggle('active', on); c.setAttribute('aria-pressed', on ? 'true' : 'false'); });
      apply();
    };
    input.addEventListener('input', apply);
    chips.forEach(function (c) { c.addEventListener('click', function () { setFilter(c.getAttribute('data-filter')); }); });
    $$('[data-set-filter]').forEach(function (b) {
      b.addEventListener('click', function () { setFilter(b.getAttribute('data-set-filter')); var t = $('#catalog'); if (t) { t.scrollIntoView({ behavior: 'smooth' }); } });
    });
    var h = (location.hash || '').replace('#', ''), qs = new URLSearchParams(location.search);
    if (chips.some(function (c) { return c.getAttribute('data-filter') === h; })) { setFilter(h); }
    if (qs.get('q')) { input.value = qs.get('q'); apply(); }
  }

  /* ---------- Forms (AJAX with graceful fallback) ---------- */
  var qs2 = new URLSearchParams(location.search);
  $$('form[data-ajax]').forEach(function (form) {
    var status = $('.form-status', form), btn = $('button[type=submit]', form);
    var svc = qs2.get('service'), topic = qs2.get('topic');
    if (svc && form.elements.service) { Array.prototype.forEach.call(form.elements.service.options, function (o) { if (o.value === svc) { form.elements.service.value = svc; } }); }
    if (topic && form.elements.message && !form.elements.message.value) { form.elements.message.value = 'I am interested in: ' + topic + '.\n'; }
    if (qs2.get('form_error')) { status.className = 'form-status err'; status.textContent = qs2.get('form_error'); }
    var say = function (cls, msg) { status.className = 'form-status ' + cls; status.textContent = msg; status.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); };
    form.addEventListener('submit', function (e) {
      var bad = null;
      $$('input[required],select[required],textarea[required]', form).forEach(function (f) {
        var invalid = f.type === 'checkbox' ? !f.checked : !f.value.trim();
        if (f.type === 'email' && f.value && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.value)) { invalid = true; }
        f.classList.toggle('invalid', invalid); if (invalid && !bad) { bad = f; }
      });
      if (bad) { e.preventDefault(); say('err', 'Please complete the highlighted required fields.'); bad.focus(); return; }
      if (!window.fetch || !window.FormData) { return; }
      e.preventDefault();
      btn.disabled = true; var label = btn.innerHTML; btn.textContent = 'Sending...'; status.className = 'form-status'; status.textContent = '';
      fetch(form.action, { method: 'POST', body: new FormData(form), headers: { 'Accept': 'application/json', 'X-Requested-With': 'fetch' }, credentials: 'same-origin' })
        .then(function (r) { return r.json().catch(function () { return { ok: false, message: 'Unexpected server response. Please email us directly.' }; }); })
        .then(function (res) {
          if (res.ok) {
            if (window.gtag) { gtag('event', 'generate_lead', { form_type: form.elements.form_type.value }); }
            if (window.fbq) { fbq('track', 'Lead'); }
            if (res.redirect) { window.location.href = res.redirect; return; }
            say('ok', res.message); form.reset();
          } else { say('err', res.message || 'Something went wrong. Please try again.'); }
        })
        .catch(function () { say('err', 'Network error. Please check your connection or email us directly.'); })
        .then(function () { btn.disabled = false; btn.innerHTML = label; });
    });
    form.addEventListener('input', function (e) { e.target.classList.remove('invalid'); });
  });

  /* ---------- Cookie consent + analytics + chat ---------- */
  var A = window.ITZ_ANALYTICS, KEY = 'itz_consent';
  var get = function () { try { return localStorage.getItem(KEY); } catch (e) { return null; } };
  var set = function (v) { try { localStorage.setItem(KEY, v); } catch (e) {} };
  function load(src, attrs) { var s = document.createElement('script'); s.async = true; s.src = src; for (var k in (attrs || {})) { s.setAttribute(k, attrs[k]); } document.head.appendChild(s); }
  function loadAnalytics() {
    if (!A || window.__itzA) { return; } window.__itzA = true;
    if (A.gtm) {
      window.dataLayer = window.dataLayer || []; window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' }); load('https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(A.gtm));
    } else if (A.ga4) {
      window.dataLayer = window.dataLayer || []; window.gtag = function () { window.dataLayer.push(arguments); };
      gtag('js', new Date()); gtag('config', A.ga4, { anonymize_ip: true }); load('https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(A.ga4));
    }
    if (A.fb) {
      !function (f, b, e, v, n, t, s) { if (f.fbq) { return; } n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); }; if (!f._fbq) { f._fbq = n; } n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = []; t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s); }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
      fbq('init', A.fb); fbq('track', 'PageView');
    }
  }
  function loadChat() {
    if (!window.ITZ_TAWK || window.__itzC) { return; } window.__itzC = true;
    var id = String(window.ITZ_TAWK).split('/'); window.Tawk_API = window.Tawk_API || {};
    load('https://embed.tawk.to/' + (id.length > 1 ? id[0] + '/' + id[1] : id[0] + '/default'), { crossorigin: '*', charset: 'UTF-8' });
  }
  var consent = get(), banner = $('#cookie');
  if (A && A.banner && banner) {
    if (consent === 'yes') { loadAnalytics(); } else if (consent === null) { banner.hidden = false; }
    $$('[data-cookie]', banner).forEach(function (b) { b.addEventListener('click', function () { var v = b.getAttribute('data-cookie'); set(v); banner.hidden = true; if (v === 'yes') { loadAnalytics(); } }); });
  } else if (A) { loadAnalytics(); }
  if ('requestIdleCallback' in window) { requestIdleCallback(loadChat, { timeout: 4000 }); } else { setTimeout(loadChat, 3000); }
})();
