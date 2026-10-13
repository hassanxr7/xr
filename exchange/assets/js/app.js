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

  $$('[data-confirm-click]').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      if (!window.confirm(btn.getAttribute('data-confirm-click'))) e.preventDefault();
    });
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
    var data = window.HUFAN || {};
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
