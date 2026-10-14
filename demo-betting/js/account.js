/* Demo Betting — account screens: registration/login, demo top-up, my bets, profile, promotions, about. */
'use strict';
(function () {
  const DB = window.DB;
  const U = DB.U;
  const E = DB.E;
  const S = DB.S;
  const t = (k, v) => DB.t(k, v);
  const V = (DB.V = DB.V || {});
  const AC = (DB.AC = {});

  /* ================= auth modal ================= */
  let regMode = 'oneclick';

  function authHTML(tab, msg) {
    const err = msg ? '<p class="form-err" role="alert">' + U.esc(msg) + '</p>' : '';
    const head =
      '<div class="auth-tabs" role="tablist">' +
      '<button type="button" role="tab" class="' + (tab === 'register' ? 'on' : '') + '" data-act="auth-tab" data-tab="register">' + U.esc(t('register')) + '</button>' +
      '<button type="button" role="tab" class="' + (tab === 'login' ? 'on' : '') + '" data-act="auth-tab" data-tab="login">' + U.esc(t('login')) + '</button>' +
      '</div>';
    let body;
    if (tab === 'login') {
      body =
        '<form id="login-form" class="form" novalidate>' +
        '<label for="li-name">' + U.esc(t('username')) + '</label><input id="li-name" name="name" class="inp" autocomplete="username" required>' +
        '<label for="li-pass">' + U.esc(t('password')) + '</label><input id="li-pass" name="pass" class="inp" type="password" autocomplete="current-password" required>' +
        err +
        '<button class="btn btn-go btn-block" type="submit">' + U.esc(t('login')) + '</button>' +
        '<p class="fine">' + U.icon('info') + U.esc(t('demo_store_note')) + '</p></form>';
    } else {
      const modes =
        '<div class="segs" role="group">' +
        '<button type="button" class="seg' + (regMode === 'oneclick' ? ' on' : '') + '" data-act="reg-mode" data-m="oneclick">' + U.icon('bolt') + U.esc(t('reg_oneclick')) + '</button>' +
        '<button type="button" class="seg' + (regMode === 'username' ? ' on' : '') + '" data-act="reg-mode" data-m="username">' + U.icon('user') + U.esc(t('reg_username')) + '</button></div>';
      const age =
        '<label class="check" for="reg-age"><input id="reg-age" name="age" type="checkbox"><span>' + U.esc(t('age_ok')) + '</span></label>';
      if (regMode === 'oneclick') {
        body =
          modes +
          '<form id="oneclick-form" class="form" novalidate>' +
          '<div class="bonus-badge">' + U.icon('gift') + '<b>+' + U.money(S.WELCOME_BONUS) + ' ' + U.esc(t('coins')) + '</b></div>' +
          '<p class="muted">' + U.esc(t('oneclick_note', { n: U.money(S.WELCOME_BONUS) })) + '</p>' +
          age + err +
          '<button class="btn btn-go btn-block" type="submit">' + U.esc(t('oneclick_btn')) + '</button>' +
          '<p class="fine">' + U.icon('info') + U.esc(t('demo_store_note')) + '</p></form>';
      } else {
        body =
          modes +
          '<form id="reg-form" class="form" novalidate>' +
          '<label for="rg-name">' + U.esc(t('username')) + '</label><input id="rg-name" name="name" class="inp" autocomplete="username" maxlength="16" required>' +
          '<label for="rg-pass">' + U.esc(t('password')) + '</label><input id="rg-pass" name="pass" class="inp" type="password" autocomplete="new-password" required>' +
          '<label for="rg-pass2">' + U.esc(t('password2')) + '</label><input id="rg-pass2" name="pass2" class="inp" type="password" autocomplete="new-password" required>' +
          age + err +
          '<button class="btn btn-go btn-block" type="submit">' + U.esc(t('register')) + '</button>' +
          '<p class="fine">' + U.icon('info') + U.esc(t('demo_store_note')) + '</p></form>';
      }
    }
    return '<h2 class="modal-title">' + U.esc(tab === 'login' ? t('login') : t('reg_title')) + '</h2>' + head + '<div class="auth-body" data-tab="' + tab + '">' + body + '</div>';
  }

  AC.openAuth = (tab, msg) => U.modal.open(authHTML(tab || 'register', msg), { cls: 'auth', label: t(tab === 'login' ? 'login' : 'register') });
  AC.setRegMode = (m) => {
    regMode = m;
    AC.openAuth('register');
  };

  AC.submit = (form) => {
    const f = new FormData(form);
    const id = form.id;
    if (id === 'login-form') {
      const e = S.login(f.get('name'), f.get('pass'));
      if (e) return AC.openAuth('login', t(e));
      U.modal.close();
      U.toast(t('logged_in', { name: S.user.name }), 'ok');
    } else if (id === 'reg-form') {
      if (!f.get('age')) return AC.openAuth('register', t('err_age'));
      if (f.get('pass') !== f.get('pass2')) return AC.openAuth('register', t('err_match'));
      const e = S.register(f.get('name'), f.get('pass'));
      if (e) return AC.openAuth('register', t(e));
      U.modal.close();
      U.toast(t('welcome', { name: S.user.name, n: U.money(S.WELCOME_BONUS) }), 'ok', 5000);
    } else if (id === 'oneclick-form') {
      if (!f.get('age')) return AC.openAuth('register', t('err_age'));
      const c = S.oneClick();
      U.modal.open(
        '<h2 class="modal-title">' + U.esc(t('creds_title')) + '</h2>' +
        '<div class="bonus-badge">' + U.icon('gift') + '<b>+' + U.money(S.WELCOME_BONUS) + ' ' + U.esc(t('coins')) + '</b></div>' +
        '<p class="muted">' + U.esc(t('creds_note')) + '</p>' +
        '<dl class="creds">' +
        '<div><dt>' + U.esc(t('username')) + '</dt><dd><code id="cred-name">' + U.esc(c.name) + '</code><button type="button" class="btn btn-sm" data-act="copy" data-target="cred-name">' + U.esc(t('copy')) + '</button></dd></div>' +
        '<div><dt>' + U.esc(t('password')) + '</dt><dd><code id="cred-pass">' + U.esc(c.pass) + '</code><button type="button" class="btn btn-sm" data-act="copy" data-target="cred-pass">' + U.esc(t('copy')) + '</button></dd></div>' +
        '</dl>' +
        '<button type="button" class="btn btn-go btn-block" data-act="modal-close">' + U.esc(t('start_betting')) + '</button>',
        { cls: 'auth', label: t('creds_title') }
      );
    } else if (id === 'dep-form') {
      const v = U.parseAmount(f.get('amount'));
      if (!(v >= 1)) return;
      const amt = Math.min(10000, v);
      S.adjust(amt, 'deposit', 'demo');
      U.modal.close();
      U.toast(t('dep_ok', { n: U.money(amt) }), 'ok');
    } else if (id === 'sova-form') {
      DB.P.start(form);
    }
  };

  AC.copy = (btn) => {
    const el = document.getElementById(btn.dataset.target);
    if (!el) return;
    const done = () => {
      btn.textContent = t('copied');
      setTimeout(() => (btn.textContent = t('copy')), 1600);
    };
    const select = () => {
      const r = document.createRange();
      r.selectNodeContents(el);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
    };
    try {
      navigator.clipboard.writeText(el.textContent).then(done, select);
    } catch (e) {
      select();
    }
  };

  /* ================= deposit ================= */
  // Deposits start from the cashier page (#deposit); each method opens its own window.
  AC.openDeposit = (method) => {
    if (!S.user) return AC.openAuth('register');
    if (method === 'sova') return DB.P.openSova();
    U.modal.open(
      '<h2 class="modal-title">' + U.esc(t('dep_tab_demo')) + '</h2>' +
        '<form id="dep-form" class="form" novalidate>' +
        '<p class="muted">' + U.esc(t('dep_note')) + '</p>' +
        '<div class="amt-grid">' +
        [100, 500, 1000, 5000].map((v) => '<button type="button" class="seg" data-act="dep-amt" data-v="' + v + '">' + U.money(v) + '</button>').join('') +
        '</div>' +
        '<label for="dep-amount">' + U.esc(t('dep_amount')) + ' (' + U.esc(t('coins')) + ')</label>' +
        '<input id="dep-amount" name="amount" class="inp" type="text" inputmode="decimal" value="1000" autocomplete="off">' +
        '<p class="fine">' + U.esc(t('dep_max')) + '</p>' +
        '<button class="btn btn-go btn-block" type="submit" data-dep-btn>' + U.esc(t('dep_btn', { n: U.money(1000) })) + '</button></form>',
      { cls: 'auth', label: t('dep_tab_demo') }
    );
  };
  AC.depAmountChanged = () => {
    const inp = U.$('#dep-amount');
    const btn = U.$('[data-dep-btn]');
    if (inp && btn) btn.textContent = t('dep_btn', { n: U.money(Math.min(10000, U.parseAmount(inp.value))) });
  };

  /* ================= bet cards ================= */
  const coArm = {};
  const resIcon = { won: 'check', lost: 'close', void: 'back' };

  AC.betCard = (bet, compact) => {
    const sels = bet.sels
      .map((s) => {
        const ev = E.find(s.eid);
        const evl = ev || { home: s.home, away: s.away, sport: s.sport };
        const sp = E.sport(s.sport);
        let sc = '';
        if (s.res && s.score) sc = '<span class="bs-sc fin">' + s.score + '</span>';
        else if (ev) {
          const st = E.st(ev);
          const v = DB.score(ev, st);
          sc =
            '<span class="bs-sc"><b data-sh="' + ev.id + '">' + (v ? v[0] : '') + '</b>' + (v ? ':' : '') + '<b data-sa="' + ev.id + '">' + (v ? v[1] : '') + '</b></span>' +
            '<span class="bs-clock" data-clock="' + ev.id + '">' + DB.clockHTML(ev, st) + '</span>';
        }
        const r = s.res || 'open';
        return (
          '<li class="bs r-' + r + '">' +
          '<span class="bs-res" aria-label="' + U.esc(t('st_' + (r === 'open' ? 'open' : r))) + '">' + (resIcon[r] ? U.icon(resIcon[r]) : '') + '</span>' +
          '<div class="bs-main">' +
          '<a class="bs-ev" href="#event.' + s.eid + '" data-go="event.' + s.eid + '"><span aria-hidden="true">' + sp.icon + '</span> ' + U.esc(s.home) + ' — ' + U.esc(s.away) + '</a>' +
          '<div class="bs-row">' + sc + '</div>' +
          '<div class="bs-pick"><span>' + U.esc(DB.mktTitle(s.mkt, evl)) + ':</span> <b>' + U.esc(DB.outLabel(s.mkt, s.out, evl)) + '</b></div>' +
          '</div>' +
          '<b class="bs-o">' + DB.fmtOdds(s.odds) + '</b>' +
          '</li>'
        );
      })
      .join('');
    const open = bet.status === 'open';
    const co = open ? S.cashoutValue(bet, E.now) : 0;
    const armed = coArm[bet.id] && Date.now() - coArm[bet.id] < 4000;
    return (
      '<article class="bet st-' + bet.status + (compact ? ' compact' : '') + '" data-bet="' + bet.id + '">' +
      '<header class="bet-head"><span class="bet-type">' + U.esc(bet.type === 'acca' ? t('acca') + ' (' + bet.sels.length + ')' : t('single')) + '</span>' +
      '<span class="bet-id">#' + bet.id + '</span>' +
      '<span class="badge b-' + bet.status + '">' + U.esc(t('st_' + bet.status)) + '</span></header>' +
      (compact ? '' : '<div class="bet-date">' + U.dt(bet.t) + '</div>') +
      '<ul class="bet-sels">' + sels + '</ul>' +
      '<footer class="bet-foot">' +
      '<div><span>' + U.esc(t('stake')) + '</span><b>' + U.money(bet.stake) + '</b></div>' +
      '<div><span>' + U.esc(t('odds')) + '</span><b>' + DB.fmtOdds(bet.odds) + (bet.boost > 1 ? ' <small class="boost">+10%</small>' : '') + '</b></div>' +
      '<div><span>' + U.esc(open ? t('pot_win') : t('payout')) + '</span><b class="' + (bet.status === 'won' || bet.status === 'cashed' ? 'pos' : '') + '">' + U.money(open ? bet.pot : bet.payout) + '</b></div>' +
      '</footer>' +
      (open
        ? '<button type="button" class="btn btn-cash' + (armed ? ' arm' : '') + '" data-act="cashout" data-bet="' + bet.id + '"' + (co ? '' : ' hidden') + '>' +
          '<span data-co-lbl="' + bet.id + '">' + U.esc(armed ? t('cashout_confirm', { v: U.money(co) }) : t('cashout')) + '</span> <b data-co="' + bet.id + '">' + U.money(co) + '</b></button>'
        : '') +
      '</article>'
    );
  };

  AC.cashoutClick = (betId) => {
    if (coArm[betId] && Date.now() - coArm[betId] < 4000) {
      delete coArm[betId];
      const v = S.cashout(betId, Date.now());
      if (v) U.toast(t('cashed_ok', { v: U.money(v) }), 'ok');
      else U.toast(t('unavailable'), 'warn');
      return;
    }
    coArm[betId] = Date.now();
    AC.patchCashout();
  };

  // refresh cash out offers in place
  AC.patchCashout = () => {
    if (!S.user) return;
    U.$$('.btn-cash[data-bet]').forEach((btn) => {
      const id = btn.dataset.bet;
      const bet = S.data.bets.find((b) => b.id === id);
      if (!bet) return;
      const v = S.cashoutValue(bet, E.now);
      btn.hidden = !v;
      const armed = coArm[id] && Date.now() - coArm[id] < 4000;
      btn.classList.toggle('arm', !!armed);
      const b = btn.querySelector('[data-co]');
      if (b) b.textContent = U.money(v);
      const l = btn.querySelector('[data-co-lbl]');
      if (l) l.textContent = armed ? t('cashout_confirm', { v: U.money(v) }) : t('cashout');
    });
  };

  const needLogin = () =>
    '<div class="empty">' + U.icon('user', 'empty-ic') + '<p>' + U.esc(t('need_login')) + '</p>' +
    '<div class="row-btns"><button type="button" class="btn" data-act="login">' + U.esc(t('login')) + '</button>' +
    '<button type="button" class="btn btn-go" data-act="register">' + U.esc(t('register')) + '</button></div></div>';

  /* ================= my bets ================= */
  V.mybets = {
    sig(arg) {
      if (!S.user) return 'anon';
      return (arg || 'open') + ':' + S.data.bets.map((b) => b.id + b.status).join();
    },
    render(arg) {
      const tab = ['open', 'settled', 'all'].indexOf(arg) >= 0 ? arg : 'open';
      const head = '<header class="page-head"><h1>' + U.icon('list') + U.esc(t('my_bets')) + '</h1></header>';
      if (!S.user) return head + needLogin();
      const bets = S.data.bets.filter((b) => (tab === 'all' ? true : tab === 'open' ? b.status === 'open' : b.status !== 'open'));
      const tabs =
        '<nav class="chips">' +
        ['open', 'settled', 'all']
          .map((k) => '<a class="chip' + (tab === k ? ' on' : '') + '" href="#mybets.' + k + '" data-go="mybets.' + k + '">' + U.esc(t('mb_' + k)) + '</a>')
          .join('') +
        '</nav>';
      return (
        head + tabs +
        (bets.length
          ? '<div class="bets">' + bets.slice(0, 100).map((b) => AC.betCard(b)).join('') + '</div>'
          : SV().empty(t('mb_none'), '<a class="btn" href="#sports" data-go="sports">' + U.esc(t('mb_none_cta')) + '</a>'))
      );
    },
  };
  const SV = () => DB.SV;

  /* ================= account ================= */
  let resetArmed = false;
  function settingsHTML() {
    const sel = (key, opts) =>
      '<select id="set-' + key + '" class="inp" data-setting="' + key + '">' +
      opts.map(([v, l]) => '<option value="' + v + '"' + (S.settings[key] === v ? ' selected' : '') + '>' + U.esc(l) + '</option>').join('') +
      '</select>';
    return (
      '<div class="panel form settings">' +
      '<label for="set-lang">' + U.esc(t('lang_label')) + '</label>' + sel('lang', [['en', 'English'], ['so', 'Soomaali']]) +
      '<label for="set-theme">' + U.esc(t('theme_label')) + '</label>' + sel('theme', [['auto', t('theme_auto')], ['dark', t('theme_dark')], ['light', t('theme_light')]]) +
      '<label for="set-oddsFmt">' + U.esc(t('odds_fmt')) + '</label>' + sel('oddsFmt', [['dec', t('fmt_dec')], ['frac', t('fmt_frac')], ['us', t('fmt_us')]]) +
      '<label for="set-accept">' + U.esc(t('accept_label')) + '</label>' + sel('accept', [['any', t('accept_any')], ['up', t('accept_up')], ['none', t('accept_none')]]) +
      '<p class="fine">' + U.icon('info') + U.esc(t('settings_note')) + '</p></div>'
    );
  }
  function profileHTML() {
    const st = S.stats();
    const profit = st.returned - st.staked + S.openBets().reduce((a, b) => a + b.stake, 0);
    const cell = (k, v, cls) => '<div class="stat"><span>' + U.esc(t(k)) + '</span><b class="' + (cls || '') + '">' + v + '</b></div>';
    return (
      '<div class="panel profile">' +
      '<div class="pf-head"><span class="avatar" aria-hidden="true">' + U.esc(S.user.name[0].toUpperCase()) + '</span>' +
      '<div><h2>' + U.esc(S.user.name) + '</h2><p class="muted">' + U.esc(t('member_since', { d: U.dmy(S.user.created) })) + '</p></div>' +
      '<div class="pf-bal"><span>' + U.esc(t('balance')) + '</span><b data-balance>' + U.money(S.balance()) + '</b> <small>' + U.esc(t('coins')) + '</small></div></div>' +
      '<div class="stats">' +
      cell('stat_bets', st.bets) + cell('stat_won', st.won) + cell('stat_lost', st.lost) +
      cell('stat_staked', U.money(st.staked)) + cell('stat_returned', U.money(st.returned)) +
      cell('stat_profit', (profit >= 0 ? '+' : '') + U.money(profit), profit >= 0 ? 'pos' : 'neg') +
      '</div>' +
      '<div class="row-btns">' +
      '<button type="button" class="btn btn-go" data-act="deposit">' + U.icon('plus') + U.esc(t('deposit')) + '</button>' +
      (resetArmed
        ? '<span class="confirm-inline">' + U.esc(t('reset_confirm')) + ' <button type="button" class="btn btn-danger" data-act="reset-yes">' + U.esc(t('reset_yes')) + '</button>' +
          '<button type="button" class="btn" data-act="reset-no">' + U.esc(t('cancel')) + '</button></span>'
        : '<button type="button" class="btn" data-act="reset-arm">' + U.icon('trash') + U.esc(t('reset_acc')) + '</button>') +
      '<button type="button" class="btn" data-act="logout">' + U.icon('logout') + U.esc(t('logout')) + '</button>' +
      '</div></div>'
    );
  }
  function historyHTML() {
    const tx = S.data.tx;
    if (!tx.length) return SV().empty(t('tx_none'));
    return (
      '<div class="panel tbl-wrap"><table class="tbl"><thead><tr><th>' + U.esc(t('tx_date')) + '</th><th>' + U.esc(t('tx_type')) + '</th>' +
      '<th class="num">' + U.esc(t('tx_amount')) + '</th><th class="num">' + U.esc(t('tx_balance')) + '</th></tr></thead><tbody>' +
      tx
        .slice(0, 150)
        .map(
          (x) =>
            '<tr><td>' + U.dt(x.t) + '</td><td>' + U.esc(DB.txLabel(x.type)) + (x.note && /^(\d+|DB[A-Z0-9]{18})$/.test(x.note) ? ' <span class="muted">#' + x.note + '</span>' : '') + '</td>' +
            '<td class="num ' + (x.amount >= 0 ? 'pos' : 'neg') + '">' + (x.amount >= 0 ? '+' : '') + U.money(x.amount) + '</td>' +
            '<td class="num">' + U.money(x.bal) + '</td></tr>'
        )
        .join('') +
      '</tbody></table></div>'
    );
  }
  V.account = {
    sig(arg) {
      return (arg || 'profile') + ':' + (S.user ? S.user.name + ':' + S.data.tx.length + ':' + resetArmed : 'anon') + ':' + S.settings.lang;
    },
    render(arg) {
      const tab = ['profile', 'history', 'settings'].indexOf(arg) >= 0 ? arg : 'profile';
      const head = '<header class="page-head"><h1>' + U.icon('user') + U.esc(t('nav_account')) + '</h1></header>';
      const tabs =
        '<nav class="chips">' +
        [['profile', 'acc_profile'], ['history', 'acc_history'], ['settings', 'acc_settings']]
          .map(([k, l]) => '<a class="chip' + (tab === k ? ' on' : '') + '" href="#account.' + k + '" data-go="account.' + k + '">' + U.esc(t(l)) + '</a>')
          .join('') +
        '</nav>';
      if (tab === 'settings') return head + tabs + settingsHTML();
      if (!S.user) return head + tabs + needLogin();
      return head + tabs + (tab === 'history' ? historyHTML() : profileHTML());
    },
  };
  AC.setResetArmed = (v) => {
    resetArmed = v;
  };

  /* ================= promotions + daily wheel ================= */
  const WHEEL = [
    [50, 20], [100, 16], [75, 16], [250, 8], [50, 18], [500, 5], [100, 14], [1000, 2], [150, 10], [2000, 1],
  ];
  const DAY = 24 * 3600e3;
  let wheelRot = 0;
  let spinning = false;

  function wheelHTML() {
    const n = WHEEL.length;
    const seg = 360 / n;
    const stops = WHEEL.map((w, i) => 'var(' + (w[0] >= 1000 ? '--gold' : i % 2 ? '--wheel-b' : '--wheel-a') + ') ' + i * seg + 'deg ' + (i + 1) * seg + 'deg').join(',');
    const labels = WHEEL.map((w, i) => '<span class="wl" style="--a:' + (i * seg + seg / 2) + 'deg"><b>' + w[0] + '</b></span>').join('');
    return (
      '<div class="wheel-wrap"><div class="wheel-ptr" aria-hidden="true"></div>' +
      '<div class="wheel" id="wheel" style="background:conic-gradient(' + stops + ');transform:rotate(' + wheelRot + 'deg)">' + labels + '</div>' +
      '<div class="wheel-hub" aria-hidden="true">DB</div></div>'
    );
  }
  function wheelState() {
    if (!S.user) return { can: false, login: true };
    const left = (S.data.lastWheel || 0) + DAY - Date.now();
    return { can: left <= 0 && !spinning, left };
  }
  const hms = (ms) => {
    const s = Math.max(0, Math.ceil(ms / 1000));
    return U.pad(Math.floor(s / 3600)) + ':' + U.pad(Math.floor((s % 3600) / 60)) + ':' + U.pad(s % 60);
  };
  function wheelBtn() {
    const ws = wheelState();
    if (ws.login) return '<button type="button" class="btn btn-go" data-act="login">' + U.esc(t('spin_login')) + '</button>';
    if (spinning) return '<button type="button" class="btn btn-go" disabled>' + U.esc(t('spin')) + '…</button>';
    if (!ws.can) return '<button type="button" class="btn" disabled>' + U.esc(t('spin_again', { t: hms(ws.left) })) + '</button>';
    return '<button type="button" class="btn btn-go" data-act="wheel-spin">' + U.esc(t('spin')) + '</button>';
  }

  AC.spinWheel = () => {
    const ws = wheelState();
    if (!ws.can) return;
    const total = WHEEL.reduce((a, w) => a + w[1], 0);
    let r = U.rand() * total;
    let idx = 0;
    for (; idx < WHEEL.length; idx++) {
      r -= WHEEL[idx][1];
      if (r <= 0) break;
    }
    idx = Math.min(idx, WHEEL.length - 1);
    const seg = 360 / WHEEL.length;
    const theta = idx * seg + seg / 2;
    const base = wheelRot;
    const fine = U.uniform(-seg * 0.3, seg * 0.3);
    wheelRot = base + 360 * 6 + ((((360 - theta - fine - (base % 360)) % 360) + 360) % 360);
    spinning = true;
    S.data.lastWheel = Date.now();
    S.save();
    const prize = WHEEL[idx][0];
    const el = U.$('#wheel');
    const dur = U.reducedMotion() ? 50 : 4800;
    if (el) {
      el.style.transition = 'transform ' + dur + 'ms cubic-bezier(.15,.7,.12,1)';
      el.style.transform = 'rotate(' + wheelRot + 'deg)';
    }
    AC.patchWheel();
    setTimeout(() => {
      spinning = false;
      if (S.user) {
        S.adjust(prize, 'bonus', 'wheel');
        U.toast(t('spin_win', { n: U.money(prize) }), 'ok', 5000);
      }
      AC.patchWheel();
    }, dur + 80);
  };
  AC.patchWheel = () => {
    const box = U.$('[data-wheel-btn]');
    if (!box) return;
    const html = wheelBtn();
    if (box.dataset.html !== html) {
      box.dataset.html = html;
      box.innerHTML = html;
    }
  };

  V.promo = {
    sig() {
      return (S.user ? S.user.name : 'anon') + ':' + S.settings.lang;
    },
    render() {
      const card = (cls, icon, title, text, extra) =>
        '<article class="promo ' + cls + '"><div class="promo-ic" aria-hidden="true">' + icon + '</div><div><h3>' + U.esc(title) + '</h3><p>' + U.esc(text) + '</p>' + (extra || '') + '</div></article>';
      return (
        '<header class="page-head"><h1>' + U.icon('gift') + U.esc(t('promo_title')) + '</h1></header>' +
        '<section class="wheel-sec panel"><div class="wheel-copy"><h2>' + U.esc(t('promo_wheel_t')) + '</h2><p>' + U.esc(t('promo_wheel')) + '</p>' +
        '<div data-wheel-btn>' + wheelBtn() + '</div></div>' + wheelHTML() + '</section>' +
        '<div class="promos">' +
        card('p-welcome', U.icon('gift'), t('promo_welcome_t'), t('promo_welcome', { n: U.money(S.WELCOME_BONUS) }),
          S.user ? '' : '<button type="button" class="btn btn-go btn-sm" data-act="register">' + U.esc(t('register')) + '</button>') +
        card('p-boost', U.icon('bolt'), t('promo_boost_t'), t('promo_boost')) +
        card('p-cash', U.icon('wallet'), t('promo_cash_t'), t('promo_cash')) +
        '</div>'
      );
    },
    mount() {
      AC.patchWheel();
    },
    update() {
      AC.patchWheel();
    },
  };

  /* ================= about ================= */
  V.info = {
    sig() {
      return S.settings.lang;
    },
    render() {
      return (
        '<article class="panel prose">' +
        '<h1>' + U.esc(t('info_title')) + '</h1>' +
        '<p>' + U.esc(t('info_p1')) + '</p><p>' + U.esc(t('info_p2')) + '</p><p>' + U.esc(t('info_p3')) + '</p>' +
        '<h2>' + U.icon('shield') + U.esc(t('info_rg_t')) + '</h2><p>' + U.esc(t('info_rg')) + '</p>' +
        '<h2>' + U.icon('info') + U.esc(t('info_data_t')) + '</h2><p>' + U.esc(t('info_data')) + '</p>' +
        '</article>'
      );
    },
  };
})();
