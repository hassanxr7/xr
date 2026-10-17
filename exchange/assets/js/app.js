/* Hufan Exchange — front-end behaviour (no dependencies). */
(function () {
  'use strict';

  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };

  // ---- Mobile navigation / generic toggles --------------------------------
  $$('[data-toggle]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var target = $(btn.getAttribute('data-toggle'));
      if (target) target.classList.toggle('open');
    });
  });

  // ---- Copy to clipboard -------------------------------------------------
  $$('[data-copy]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var text = btn.getAttribute('data-copy');
      var done = function () {
        btn.classList.add('copied');
        setTimeout(function () { btn.classList.remove('copied'); }, 1400);
      };
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(done);
      } else {
        var ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
        document.body.appendChild(ta); ta.select();
        try { document.execCommand('copy'); done(); } catch (e) { /* ignore */ }
        document.body.removeChild(ta);
      }
    });
  });

  // ---- Confirmations -----------------------------------------------------
  document.addEventListener('submit', function (e) {
    var form = e.target;
    var msg = form.getAttribute('data-confirm');
    if (msg && !window.confirm(msg)) e.preventDefault();
  });

  // ---- Pay button waiting state -------------------------------------------
  // CSP (script-src without 'unsafe-inline') blocks inline onsubmit handlers,
  // so real-time pay forms declare data-paywait and are handled here.
  var CLOCK_SVG = '<svg class="icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (e.defaultPrevented || !form.getAttribute) return;
    var waitText = form.getAttribute('data-paywait');
    if (!waitText) return;
    if (form.hasAttribute('data-paywait-active')) { e.preventDefault(); return; }
    form.setAttribute('data-paywait-active', '1');
    var btns = $$('button[type=submit]', form);
    var clicked = e.submitter || btns[0];
    btns.forEach(function (b) { if (b !== clicked) b.disabled = true; });
    if (clicked) {
      clicked.style.pointerEvents = 'none';
      clicked.style.opacity = '0.7';
      clicked.setAttribute('aria-busy', 'true');
      clicked.innerHTML = CLOCK_SVG + ' ';
      clicked.appendChild(document.createTextNode(waitText));
    }
  });

  $$('[data-confirm-click]').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      if (!window.confirm(btn.getAttribute('data-confirm-click'))) e.preventDefault();
    });
  });

  $$('[data-autosubmit]').forEach(function (el) {
    el.addEventListener('change', function () { if (el.form) el.form.submit(); });
  });

  // ---- SovaMoney U-ID check (checkout) -----------------------------------
  $$('[data-sova-verify]').forEach(function (input) {
    var form = input.form;
    var out = form && $('[data-sova-result]', form);
    var tokenEl = form && $('input[name="_csrf"]', form);
    if (!out || !tokenEl || !window.fetch) return;
    var last = '';
    var seq = 0;
    function show(text, ok) {
      out.hidden = !text;
      out.textContent = text || '';
      out.style.color = ok === true ? 'var(--brand)' : (ok === false ? '#dc2626' : '');
      out.style.fontWeight = ok === true ? '600' : '';
    }
    function check() {
      var uid = input.value.trim();
      if (uid === last) return;
      last = uid;
      if (uid.length < 3) { show(''); return; }
      var mine = ++seq;
      show(input.getAttribute('data-sova-checking'));
      var body = new URLSearchParams();
      body.append('_csrf', tokenEl.value);
      body.append('uid', uid);
      fetch(input.getAttribute('data-sova-verify'), {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString()
      }).then(function (r) { return r.json(); }).then(function (res) {
        if (mine !== seq) return;
        show(res.message || '', !!res.ok);
      }).catch(function () {
        if (mine !== seq) return;
        last = '';
        show('');
      });
    }
    input.addEventListener('change', check);
    input.addEventListener('blur', check);
    if (input.value.trim() !== '') check();
  });

  // ---- SovaMoney withdrawal estimate (admin) ------------------------------
  $$('[data-swd-form]').forEach(function (form) {
    var out = $('[data-swd-estimate]', form);
    var amountIn = $('input[name="amount"]', form);
    var i18nEl = document.getElementById('swd-i18n');
    var t = i18nEl ? JSON.parse(i18nEl.textContent) : {};
    if (!out || !amountIn) return;
    function fill(tpl, vals) {
      return String(tpl || '').replace(/:(\w+)/g, function (m, k) { return k in vals ? vals[k] : m; });
    }
    function update() {
      var opt = $('input[name="user_method_id"]:checked', form);
      var amount = parseFloat(String(amountIn.value).replace(/,/g, ''));
      if (!opt || isNaN(amount) || amount <= 0) { out.textContent = ''; return; }
      var d = opt.dataset;
      var fixed = parseFloat(d.fixed) || 0, pct = parseFloat(d.pct) || 0, rate = parseFloat(d.rate) || 1;
      var min = parseFloat(d.min) || 0, max = parseFloat(d.max) || 0;
      var charge = Math.round((fixed + amount * pct / 100) * 100) / 100;
      var final = Math.round(Math.max(0, amount - charge) * rate * 100) / 100;
      var bad = amount < min || (max > 0 && amount > max);
      out.style.color = bad ? '#dc2626' : '';
      out.textContent = bad
        ? fill(t.limits, { min: min.toFixed(2), max: max > 0 ? max.toFixed(2) : '∞', cur: d.cur })
        : fill(t.est, { charge: charge.toFixed(2), final: final.toFixed(2), cur: d.cur });
    }
    form.addEventListener('input', update);
    form.addEventListener('change', update);
    update();
  });

  // ---- Print -------------------------------------------------------------
  $$('[data-print]').forEach(function (btn) {
    btn.addEventListener('click', function () { window.print(); });
  });
  if (document.body.hasAttribute('data-autoprint')) {
    window.addEventListener('load', function () { setTimeout(function () { window.print(); }, 350); });
  }

  // ---- Countdown (order payment window) ----------------------------------
  $$('[data-countdown]').forEach(function (el) {
    var end = parseInt(el.getAttribute('data-countdown'), 10) * 1000;
    var tick = function () {
      var left = Math.max(0, Math.floor((end - Date.now()) / 1000));
      var m = Math.floor(left / 60), s = left % 60;
      el.textContent = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
      if (left <= 0) { clearInterval(timer); setTimeout(function () { location.reload(); }, 1500); }
    };
    var timer = setInterval(tick, 1000);
    tick();
  });

  // ---- File input label --------------------------------------------------
  $$('input[type=file][data-file-label]').forEach(function (input) {
    input.addEventListener('change', function () {
      var label = $(input.getAttribute('data-file-label'));
      if (label && input.files.length) label.textContent = input.files[0].name;
    });
  });

  // ---- Exchange calculator ----------------------------------------------
  // Mirrors quote() in app/helpers.php: fee = send × fee% + fixed; receive = (send − fee) × rate.
  function pow10(d) { return Math.pow(10, d); }
  function roundDec(n, d) { var m = pow10(d); return Math.round((n + Number.EPSILON) * m) / m; }
  function floorDec(n, d) { var m = pow10(d); return Math.floor(n * m + 1e-7) / m; }
  function ceilDec(n, d) { var m = pow10(d); return Math.ceil(n * m - 1e-7) / m; }
  function fmt(n, d) {
    return Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function parseNum(v) {
    v = String(v || '').replace(/,/g, '').trim();
    if (v === '' || isNaN(v)) return NaN;
    return parseFloat(v);
  }
  function quote(p, send) {
    send = roundDec(send, p.from.decimals);
    var fee = roundDec(send * p.feePct / 100 + p.feeFix, p.from.decimals);
    var net = Math.max(0, send - fee);
    return { send: send, fee: fee, receive: floorDec(net * p.rate, p.to.decimals) };
  }
  function sendFor(p, receive) {
    if (p.rate <= 0 || p.feePct >= 100) return NaN;
    var send = ceilDec((receive / p.rate + p.feeFix) / (1 - p.feePct / 100), p.from.decimals);
    // nudge up until the forward quote reaches the requested amount
    for (var i = 0; i < 5 && quote(p, send).receive < receive; i++) send = roundDec(send + 1 / pow10(p.from.decimals), p.from.decimals);
    return send;
  }
  function badge(g) {
    if (g.logo) return '<span class="gw"><img src="' + g.logo + '" alt=""></span>';
    var ini = g.name.replace(/\(.*?\)/g, '').trim().split(/\s+/).map(function (w) { return w.charAt(0).toUpperCase(); }).join('').slice(0, 2);
    return '<span class="gw" style="--gw:' + g.color + '">' + ini + '</span>';
  }

  $$('[data-calc]').forEach(function (form) {
    var dataEl = document.getElementById('hufan-data');
    var data = dataEl ? JSON.parse(dataEl.textContent) : {};
    var pairs = data.pairs || [];
    var t = data.i18n || {};
    if (!pairs.length) return;

    var fromSel = $('[data-from]', form), toSel = $('[data-to]', form);
    var sendIn = $('[data-send]', form), recvIn = $('[data-receive]', form);
    var pairIn = $('[data-pair-id]', form);
    var errBox = $('[data-error]', form), submit = $('[data-submit]', form);
    var swapBtn = $('[data-swap]', form);
    var mode = 'send';
    var current = pairs[0];

    if (data.selected) {
      pairs.forEach(function (p) { if (p.id === data.selected) current = p; });
    }

    function uniqueFrom() {
      var seen = {}, out = [];
      pairs.forEach(function (p) { if (!seen[p.from.id]) { seen[p.from.id] = 1; out.push(p.from); } });
      return out;
    }
    function pairsFrom(fromId) { return pairs.filter(function (p) { return p.from.id === fromId; }); }
    function findPair(fromId, toId) {
      for (var i = 0; i < pairs.length; i++) if (pairs[i].from.id === fromId && pairs[i].to.id === toId) return pairs[i];
      return null;
    }
    function fillFrom() {
      if (!fromSel) return;
      fromSel.innerHTML = uniqueFrom().map(function (g) {
        return '<option value="' + g.id + '"' + (g.id === current.from.id ? ' selected' : '') + '>' + g.name + '</option>';
      }).join('');
    }
    function fillTo() {
      if (!toSel) return;
      toSel.innerHTML = pairsFrom(current.from.id).map(function (p) {
        return '<option value="' + p.to.id + '"' + (p.to.id === current.to.id ? ' selected' : '') + '>' + p.to.name + '</option>';
      }).join('');
    }
    function setText(sel, html) { var el = $(sel, form); if (el) el.innerHTML = html; }

    function render() {
      var p = current;
      if (pairIn) pairIn.value = p.id;
      setText('[data-from-badge]', badge(p.from));
      setText('[data-to-badge]', badge(p.to));
      setText('[data-rate-line]', '1 ' + p.from.currency + ' = ' + fmt(p.rate, 4) + ' ' + p.to.currency);
      setText('[data-limits]', fmt(p.min, p.from.decimals) + ' – ' + fmt(p.max, p.from.decimals) + ' ' + p.from.currency);
      setText('[data-reserve]', fmt(p.reserve, p.to.decimals) + ' ' + p.to.currency);
      setText('[data-cur-from]', p.from.currency);
      setText('[data-cur-to]', p.to.currency);
      if (swapBtn) swapBtn.disabled = !findPair(p.to.id, p.from.id);

      var q;
      if (mode === 'send') {
        var s = parseNum(sendIn.value);
        q = isNaN(s) ? null : quote(p, s);
        if (recvIn) recvIn.value = q ? fmt(q.receive, p.to.decimals).replace(/,/g, '') : '';
      } else {
        var r = parseNum(recvIn.value);
        var s2 = isNaN(r) ? NaN : sendFor(p, r);
        q = isNaN(s2) ? null : quote(p, s2);
        sendIn.value = q ? q.send.toFixed(p.from.decimals) : '';
      }

      var pct = (Math.round(p.feePct * 100) / 100) + '%';
      setText('[data-fee]', q ? pct + ' (' + fmt(q.fee, p.from.decimals) + ' ' + p.from.currency + ')' : pct);
      setText('[data-total-receive]', q ? fmt(q.receive, p.to.decimals) + ' ' + p.to.currency : '—');
      setText('[data-total-fee]', q ? fmt(q.fee, p.from.decimals) + ' ' + p.from.currency : '—');
      setText('[data-total-send]', q ? fmt(q.send, p.from.decimals) + ' ' + p.from.currency : '—');

      var err = '';
      if (!q || q.send <= 0) err = t.invalid || 'Invalid amount';
      else if (q.send < p.min) err = (t.min || 'Minimum') + ': ' + fmt(p.min, p.from.decimals) + ' ' + p.from.currency;
      else if (q.send > p.max) err = (t.max || 'Maximum') + ': ' + fmt(p.max, p.from.decimals) + ' ' + p.from.currency;
      else if (q.receive > p.reserve) err = (t.reserve || 'Reserve') + ': ' + fmt(p.reserve, p.to.decimals) + ' ' + p.to.currency;
      if (errBox) { errBox.textContent = err; errBox.hidden = !err; }
      if (submit) submit.disabled = !!err;
    }

    if (fromSel) fromSel.addEventListener('change', function () {
      var list = pairsFrom(parseInt(fromSel.value, 10));
      current = findPair(parseInt(fromSel.value, 10), current.to.id) || list[0];
      fillTo(); render();
    });
    if (toSel) toSel.addEventListener('change', function () {
      current = findPair(current.from.id, parseInt(toSel.value, 10)) || current;
      render();
    });
    sendIn.addEventListener('input', function () { mode = 'send'; render(); });
    if (recvIn) recvIn.addEventListener('input', function () { mode = 'receive'; render(); });
    if (swapBtn) swapBtn.addEventListener('click', function () {
      var rev = findPair(current.to.id, current.from.id);
      if (!rev) return;
      var amount = parseNum(recvIn.value);
      current = rev; mode = 'send';
      if (!isNaN(amount)) sendIn.value = amount;
      fillFrom(); fillTo(); render();
    });
    form.addEventListener('submit', function (e) {
      render();
      if (submit && submit.disabled) { e.preventDefault(); return; }
      var s = parseNum(sendIn.value);
      if (!isNaN(s)) sendIn.value = s;
    });

    fillFrom(); fillTo(); render();
  });
})();
