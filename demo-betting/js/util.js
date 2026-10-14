/* Demo Betting — shared helpers: DOM, random numbers, storage, formatting, toasts, modal, icons. */
'use strict';
(function () {
  const DB = (window.DB = window.DB || {});
  const U = (DB.U = {});

  /* ---------- DOM ---------- */
  U.$ = (sel, root) => (root || document).querySelector(sel);
  U.$$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  U.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ESC[c]);

  /* ---------- random ---------- */
  const rbuf = new Uint32Array(1);
  U.rand = () => {
    try {
      crypto.getRandomValues(rbuf);
      return rbuf[0] / 4294967296;
    } catch (e) {
      return Math.random();
    }
  };
  U.uniform = (a, b) => a + (b - a) * U.rand();
  U.randInt = (a, b) => a + Math.floor(U.rand() * (b - a + 1));
  U.pick = (arr) => arr[Math.floor(U.rand() * arr.length)];
  U.weighted = (arr, w) => {
    let total = 0;
    arr.forEach((x) => (total += w(x)));
    let r = U.rand() * total;
    for (const x of arr) {
      r -= w(x);
      if (r <= 0) return x;
    }
    return arr[arr.length - 1];
  };
  // Small deterministic PRNG (mulberry32) for reproducible in-match sequences
  U.seeded = (seed) => {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  // cyrb53 string hash, used for local demo password hashing and stable offsets
  U.hash = (str, seed = 0) => {
    let h1 = 0xdeadbeef ^ seed;
    let h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < str.length; i++) {
      const ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
  };
  U.clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  U.betId = () => String(U.randInt(1, 9)) + String(U.randInt(100000000, 999999999));

  /* ---------- storage (falls back to memory when localStorage is unavailable) ---------- */
  const mem = {};
  let ls = null;
  try {
    ls = window.localStorage;
    ls.setItem('__db_probe', '1');
    ls.removeItem('__db_probe');
  } catch (e) {
    ls = null;
  }
  U.store = {
    get(k, d) {
      try {
        const raw = k in mem ? mem[k] : ls ? ls.getItem(k) : null;
        return raw == null ? d : JSON.parse(raw);
      } catch (e) {
        return d;
      }
    },
    set(k, v) {
      const raw = JSON.stringify(v);
      try {
        if (!ls) throw new Error('no storage');
        ls.setItem(k, raw);
        delete mem[k];
      } catch (e) {
        mem[k] = raw;
      }
    },
    del(k) {
      delete mem[k];
      try {
        if (ls) ls.removeItem(k);
      } catch (e) {
        /* ignore */
      }
    },
    persistent: () => !!ls,
  };

  /* ---------- formatting ---------- */
  const nf2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  U.round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  U.floor2 = (n) => Math.floor(n * 100 + 1e-7) / 100;
  U.money = (n) => nf2.format(U.round2(n));
  U.pad = (n) => String(n).padStart(2, '0');
  U.hm = (ts) => {
    const d = new Date(ts);
    return U.pad(d.getHours()) + ':' + U.pad(d.getMinutes());
  };
  U.dmy = (ts) => {
    const d = new Date(ts);
    return U.pad(d.getDate()) + '.' + U.pad(d.getMonth() + 1) + '.' + d.getFullYear();
  };
  U.dt = (ts) => U.dmy(ts) + ' ' + U.hm(ts);
  U.mmss = (sec) => U.pad(Math.floor(sec / 60)) + ':' + U.pad(Math.floor(sec % 60));
  U.parseAmount = (v) => {
    const n = parseFloat(String(v).replace(',', '.'));
    return isFinite(n) ? U.round2(n) : 0;
  };

  /* ---------- tiny event bus ---------- */
  const handlers = {};
  DB.bus = {
    on(ev, fn) {
      (handlers[ev] = handlers[ev] || []).push(fn);
    },
    emit(ev, data) {
      (handlers[ev] || []).forEach((fn) => {
        try {
          fn(data);
        } catch (e) {
          console.error(e);
        }
      });
    },
  };

  /* ---------- toasts ---------- */
  U.toast = (msg, kind, ms) => {
    const root = U.$('#toasts');
    if (!root) return;
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || 'info');
    el.setAttribute('role', 'status');
    el.textContent = msg;
    root.appendChild(el);
    while (root.children.length > 4) root.firstChild.remove();
    setTimeout(() => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 320);
    }, ms || 3400);
  };

  /* ---------- modal ---------- */
  let lastFocus = null;
  U.modal = {
    open(html, opts) {
      opts = opts || {};
      const root = U.$('#modal');
      lastFocus = document.activeElement;
      root.innerHTML =
        '<div class="modal-back" data-act="modal-close"></div>' +
        '<div class="modal-card ' + (opts.cls || '') + '" role="dialog" aria-modal="true" aria-label="' + U.esc(opts.label || '') + '">' +
        '<button type="button" class="modal-x" data-act="modal-close" aria-label="' + U.esc(DB.t ? DB.t('close') : 'Close') + '">' + U.icon('close') + '</button>' +
        html +
        '</div>';
      root.hidden = false;
      document.body.classList.add('noscroll');
      const f = root.querySelector('input:not([type=hidden]), select, .modal-card button:not(.modal-x)');
      if (f) f.focus();
      if (opts.onMount) opts.onMount(root);
    },
    close() {
      const root = U.$('#modal');
      if (root.hidden) return;
      root.hidden = true;
      root.innerHTML = '';
      document.body.classList.remove('noscroll');
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    },
    isOpen: () => !U.$('#modal').hidden,
  };

  /* ---------- icons (inline SVG, stroke = currentColor) ---------- */
  const P = {
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.6-3.6"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-6.5 8-6.5s8 2.5 8 6.5"/>',
    wallet: '<path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H18v3"/><rect x="3" y="8" width="18" height="12" rx="2"/><path d="M16 14h2"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    slip: '<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
    live: '<circle cx="12" cy="12" r="2.6"/><path d="M7.1 7.1a7 7 0 0 0 0 9.8M16.9 7.1a7 7 0 0 1 0 9.8M4.2 4.2a11 11 0 0 0 0 15.6M19.8 4.2a11 11 0 0 1 0 15.6"/>',
    ball: '<circle cx="12" cy="12" r="9"/><path d="M12 7l4 3-1.5 4.5h-5L8 10z"/><path d="M12 3v4M16 10l4.5-1.5M14.5 14.5l2.5 4M9.5 14.5L7 18.5M8 10L3.5 8.5"/>',
    cards: '<rect x="6" y="3" width="12" height="18" rx="2"/><path d="M12 8l3 4-3 4-3-4z"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8 21h8M10 17h4"/>',
    gift: '<rect x="4" y="11" width="16" height="9"/><rect x="3" y="7" width="18" height="4"/><path d="M12 7v13M12 7C11 4 7 3 7 6c0 1 1 1 5 1zM12 7c1-3 5-4 5-1 0 1-1 1-5 1z"/>',
    gear: '<circle cx="12" cy="12" r="3.5"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
    logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l-5-5 5-5M5 12h11"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    chev: '<path d="M9 6l6 6-6 6"/>',
    chevDown: '<path d="M6 9l6 6 6-6"/>',
    back: '<path d="M15 6l-6 6 6 6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/>',
    bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
    rocket: '<path d="M5 15c-1.5 1.5-2 5-2 5s3.5-.5 5-2M9 15l-3-3c1-4 5-9 13-9 0 8-5 12-9 13z"/><circle cx="14.5" cy="9.5" r="1.8"/>',
  };
  U.icon = (name, cls) => '<svg class="ic ' + (cls || '') + '" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + (P[name] || '') + '</svg>';

  U.reducedMotion = () => {
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch (e) {
      return false;
    }
  };
})();
