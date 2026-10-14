/* Demo Betting — SovaMoney sandbox deposits (browser side).
 * Talks only to this site's own server (/api/...); merchant keys never reach the browser.
 * The balance is credited only after the server has verified SovaMoney's notification,
 * and each confirmed deposit is handed to the wallet once (server-side "delivered" flag).
 */
'use strict';
(function () {
  const DB = window.DB;
  const U = DB.U;
  const S = DB.S;
  const t = (k, v) => DB.t(k, v);
  const V = (DB.V = DB.V || {});
  const P = (DB.P = { cfg: null, checked: false });

  P.enabled = () => !!(P.cfg && P.cfg.sovamoney && P.cfg.sovamoney.enabled);
  P.sova = () => (P.cfg && P.cfg.sovamoney) || { enabled: false };

  // per-account secret that ties deposits on the server to this browser account
  P.token = () => {
    if (!S.data) return '';
    if (!/^[a-f0-9]{64}$/.test(S.data.payToken || '')) {
      const b = new Uint8Array(32);
      crypto.getRandomValues(b);
      S.data.payToken = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
      S.save();
    }
    return S.data.payToken;
  };
  const localDeposits = () => {
    if (!S.data) return [];
    if (!Array.isArray(S.data.sova)) S.data.sova = [];
    return S.data.sova;
  };

  async function api(path, opts) {
    const res = await fetch(path, Object.assign({ cache: 'no-store', headers: { 'Content-Type': 'application/json', 'X-Wallet-Token': P.token() } }, opts));
    let body = {};
    try {
      body = await res.json();
    } catch (e) {
      /* empty or non-JSON */
    }
    if (!res.ok) throw Object.assign(new Error(body.error || 'HTTP ' + res.status), { status: res.status, body });
    return body;
  }

  P.init = async () => {
    if (location.protocol === 'file:') {
      P.checked = true;
      return;
    }
    try {
      const res = await fetch('api/config', { cache: 'no-store' });
      P.cfg = res.ok ? await res.json() : null;
    } catch (e) {
      P.cfg = null;
    }
    P.checked = true;
    DB.bus.emit('pay-config');
    P.resume();
  };

  // remember a deposit locally so it can be resumed after the round trip to SovaMoney
  function remember(dep) {
    const list = localDeposits();
    const i = list.findIndex((d) => d.id === dep.id);
    const rec = { id: dep.id, amount: dep.amount, currency: dep.currency, status: dep.status, t: dep.createdAt, delivered: !!(i >= 0 && list[i].delivered) };
    if (i >= 0) list[i] = Object.assign(list[i], rec);
    else list.unshift(rec);
    if (list.length > 30) list.length = 30;
    S.save();
    return rec;
  }

  // ask the server to release a confirmed deposit to this wallet; credits at most once
  async function collect(id) {
    const r = await api('api/deposits/' + id + '/collect', { method: 'POST' });
    const rec = remember(r.deposit);
    if (r.delivered) {
      const coins = U.parseAmount(r.deposit.amount);
      rec.delivered = true;
      S.save();
      S.adjust(coins, 'sova_deposit', id);
      U.toast(t('sova_credited', { n: U.money(coins) }), 'ok', 5000);
    } else if (r.deposit.delivered) {
      rec.delivered = true;
      S.save();
    }
    return r.deposit;
  }

  P.refresh = async (id) => {
    const r = await api('api/deposits/' + id);
    remember(r.deposit);
    if (r.deposit.status === 'confirmed' && !r.deposit.delivered) return collect(id);
    return r.deposit;
  };

  // pick up deposits that were still open when the page was left
  P.resume = () => {
    if (!P.enabled() || !S.user) return;
    localDeposits()
      .filter((d) => !d.delivered && (d.status === 'pending' || d.status === 'confirmed' || d.status === 'cancelled'))
      .slice(0, 5)
      .forEach((d) => P.refresh(d.id).catch(() => {}));
  };
  DB.bus.on('auth', () => P.resume());

  P.start = async (form) => {
    const f = new FormData(form);
    const sv = P.sova();
    const amount = String(f.get('amount') || '').trim().replace(',', '.');
    const name = String(f.get('name') || '').trim();
    const email = String(f.get('email') || '').trim();
    const err = (k, v) => {
      const el = U.$('[data-sova-err]');
      if (el) el.textContent = t(k, v);
    };
    const n = Number(amount);
    if (!/^\d+(\.\d{1,2})?$/.test(amount) || n < Number(sv.min) || n > Number(sv.max)) return err('sova_err_amount', { min: sv.min, max: sv.max });
    if (!name || name.length > 30) return err('sova_err_name');
    if (email.length > 30 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return err('sova_err_email');
    S.settings.sovaName = name;
    S.settings.sovaEmail = email;
    S.saveSettings();
    const btn = form.querySelector('button[type=submit]');
    btn.disabled = true;
    btn.textContent = t('sova_redirect');
    try {
      const r = await api('api/deposits', { method: 'POST', body: JSON.stringify({ amount, name, email }) });
      remember(r.deposit);
      const u = new URL(r.checkoutUrl);
      if (u.protocol !== 'https:' && !(u.protocol === 'http:' && /^(localhost|127\.0\.0\.1)(:|$)/.test(u.host))) throw new Error('unexpected checkout address');
      location.assign(u.href);
    } catch (e) {
      btn.disabled = false;
      btn.textContent = t('sova_btn');
      err('sova_err_start', { m: e.message });
    }
  };

  /* ---------- deposit modal tab ---------- */
  const badge = (status) => '<span class="badge ds-' + status + '">' + U.esc(t('ds_' + status)) + '</span>';
  P.tabHTML = () => {
    const sv = P.sova();
    if (!sv.enabled) {
      return '<div class="notice">' + U.icon('info') + '<p>' + U.esc(P.checked ? t('sova_off') : t('sova_checking')) + '</p></div>';
    }
    const recent = localDeposits().slice(0, 4);
    return (
      '<form id="sova-form" class="form" novalidate>' +
      '<div class="notice sandbox">' + '<span class="sbx">SANDBOX</span><p>' + U.esc(t('sova_note')) + '</p></div>' +
      '<div class="amt-grid">' + ['5', '10', '25', '50'].map((v) => '<button type="button" class="seg" data-act="sova-amt" data-v="' + v + '">' + v + ' ' + U.esc(sv.currency) + '</button>').join('') + '</div>' +
      '<label for="sova-amount">' + U.esc(t('sova_amount', { c: sv.currency })) + '</label>' +
      '<input id="sova-amount" name="amount" class="inp" type="text" inputmode="decimal" autocomplete="off" value="10">' +
      '<label for="sova-name">' + U.esc(t('sova_name')) + '</label>' +
      '<input id="sova-name" name="name" class="inp" maxlength="30" autocomplete="name" value="' + U.esc(S.settings.sovaName || (S.user ? S.user.name : '')) + '">' +
      '<label for="sova-email">' + U.esc(t('sova_email')) + '</label>' +
      '<input id="sova-email" name="email" class="inp" type="email" maxlength="30" autocomplete="email" value="' + U.esc(S.settings.sovaEmail || '') + '">' +
      (sv.testAccount ? '<p class="fine">' + U.icon('info') + U.esc(t('sova_test', { email: sv.testAccount.email, code: sv.testAccount.code })) + '</p>' : '') +
      '<p class="form-err" data-sova-err role="alert"></p>' +
      '<button class="btn btn-go btn-block" type="submit">' + U.esc(t('sova_btn')) + '</button>' +
      '<p class="fine">' + U.icon('shield') + U.esc(t('sova_leave')) + '</p>' +
      '</form>' +
      (recent.length
        ? '<h3 class="mini-h">' + U.esc(t('sova_recent')) + '</h3><ul class="dep-list">' +
          recent
            .map((d) => '<li><a href="#deposit.' + d.id + '" data-go="deposit.' + d.id + '"><span>' + U.esc(d.amount + ' ' + d.currency) + '</span><span class="muted">' + U.dt(d.t) + '</span>' + badge(d.status) + '</a></li>')
            .join('') +
          '</ul>'
        : '')
    );
  };

  /* ---------- deposit status page (#deposit.<id>) ---------- */
  const pageState = {}; // id -> { dep, error, busy, last }
  function pollDue(id) {
    const s = pageState[id] || (pageState[id] = {});
    if (s.busy || (s.dep && s.dep.status !== 'pending' && (s.dep.status !== 'confirmed' || s.dep.delivered))) return;
    if (s.last && Date.now() - s.last < 3000) return;
    s.busy = true;
    s.last = Date.now();
    P.refresh(id)
      .then((dep) => {
        s.dep = dep;
        s.error = null;
      })
      .catch((e) => {
        s.error = e.status === 404 ? 'missing' : 'offline';
      })
      .then(() => {
        s.busy = false;
        if (DB.A.route === 'deposit' && DB.A.arg === id) DB.A.refreshView();
      });
  }

  V.deposit = {
    sig(id) {
      const s = pageState[id] || {};
      return [S.user ? S.user.name : '', S.settings.lang, s.error || '', s.dep ? s.dep.status + s.dep.delivered : 'none'].join(':');
    },
    render(id) {
      const head = '<header class="page-head"><h1>' + U.icon('wallet') + U.esc(t('dpst_title')) + '</h1><span class="pill">SANDBOX</span></header>';
      if (!S.user) return head + '<div class="empty">' + U.icon('user', 'empty-ic') + '<p>' + U.esc(t('need_login')) + '</p><button type="button" class="btn btn-go" data-act="login">' + U.esc(t('login')) + '</button></div>';
      const s = pageState[id] || {};
      const local = localDeposits().find((d) => d.id === id);
      const dep = s.dep || local;
      let msg;
      let status = dep ? dep.status : 'pending';
      if (s.error === 'missing') {
        msg = t('dpst_missing');
        status = null;
      } else if (status === 'confirmed') msg = t('dpst_confirmed', { n: U.money(U.parseAmount(dep.amount)) });
      else if (status === 'cancelled') msg = t('dpst_cancelled');
      else if (status === 'failed') msg = t('dpst_failed') + (dep && dep.message ? ' (' + dep.message + ')' : '');
      else msg = t('dpst_pending');
      return (
        head +
        '<section class="panel dep-card">' +
        (dep
          ? '<dl class="dep-facts"><div><dt>' + U.esc(t('dpst_amount')) + '</dt><dd>' + U.esc(dep.amount + ' ' + dep.currency) + '</dd></div>' +
            '<div><dt>' + U.esc(t('dpst_ref')) + '</dt><dd><code>' + U.esc(id) + '</code></dd></div>' +
            '<div><dt>' + U.esc(t('tx_date')) + '</dt><dd>' + U.dt(dep.createdAt || dep.t) + '</dd></div></dl>'
          : '') +
        '<div class="dep-status">' + (status ? badge(status) : '') + '<p>' + U.esc(msg) + '</p></div>' +
        (s.error === 'offline' ? '<p class="muted">' + U.esc(t('dpst_offline')) + '</p>' : '') +
        '<div class="row-btns"><a class="btn" href="#sports" data-go="sports">' + U.esc(t('back_home')) + '</a>' +
        '<button type="button" class="btn btn-go" data-act="deposit" data-tab="sova">' + U.esc(t('dpst_new')) + '</button></div>' +
        '</section>'
      );
    },
    mount(id) {
      pollDue(id);
    },
    update(id) {
      pollDue(id);
    },
  };
})();
