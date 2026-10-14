/* Demo Betting — app shell: layout chrome, router, event delegation and the 1-second live tick. */
'use strict';
(function () {
  const DB = window.DB;
  const U = DB.U;
  const E = DB.E;
  const S = DB.S;
  const B = DB.B;
  const SV = DB.SV;
  const AC = DB.AC;
  const CS = DB.CS;
  const t = (k, v) => DB.t(k, v);
  const A = (DB.A = {});

  A.route = 'home';
  A.arg = '';
  A.sideMode = 'live';
  let view = null;
  let lastSig = '';
  const hostTheme = document.documentElement.getAttribute('data-theme');

  /* ================= routing ================= */
  // routes are bare tokens (letters, digits, '.', '_') so they survive any host's fragment rules
  function parse(h) {
    h = String(h || '').replace(/^#/, '');
    if (!/^[a-z_]+(\.[A-Za-z0-9_]+)?$/.test(h)) return { name: 'home', arg: '' };
    const i = h.indexOf('.');
    const name = i < 0 ? h : h.slice(0, i);
    const arg = i < 0 ? '' : h.slice(i + 1);
    if (!DB.V[name]) return { name: 'home', arg: '' };
    return { name, arg };
  }
  const routeStr = () => A.route + (A.arg ? '.' + A.arg : '');

  A.go = (route) => {
    const r = parse(route);
    closeDrawers();
    closeUserPop();
    try {
      if (location.hash !== '#' + route) history.pushState(null, '', '#' + route);
    } catch (e) {
      /* sandboxed hosts may refuse history changes; in-page state still works */
    }
    show(r, true);
  };

  function show(r, scrollTop) {
    if (view && view.unmount) view.unmount();
    A.route = r.name;
    A.arg = r.arg;
    view = DB.V[r.name];
    renderView();
    if (scrollTop) window.scrollTo(0, 0);
    renderNavState();
  }

  function renderView(keepScroll) {
    const root = U.$('#view');
    const y = window.scrollY;
    if (view && view.unmount && keepScroll) view.unmount();
    lastSig = view.sig ? view.sig(A.arg) : '';
    root.innerHTML = view.render(A.arg);
    if (view.mount) view.mount(A.arg);
    if (keepScroll) window.scrollTo(0, y);
  }
  A.refreshView = () => renderView(true);

  /* ================= chrome ================= */
  const NAV = [
    ['sports', 'nav_sports', 'ball'],
    ['live', 'nav_live', 'live'],
    ['sports.esports', 'nav_esports', null, '🎮'],
    ['casino', 'nav_casino', 'cards'],
    ['casino.crash', 'nav_crash', 'rocket'],
    ['results', 'nav_results', 'trophy'],
    ['promo', 'nav_promo', 'gift'],
  ];
  function activeNav() {
    const full = routeStr();
    const exact = NAV.find((n) => n[0] === full);
    if (exact) return exact[0];
    const byName = NAV.find((n) => n[0] === A.route);
    return byName ? byName[0] : '';
  }
  const effTheme = () => {
    if (S.settings.theme !== 'auto') return S.settings.theme;
    if (hostTheme) return hostTheme;
    try {
      return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    } catch (e) {
      return 'dark';
    }
  };
  function applyTheme() {
    const root = document.documentElement;
    if (S.settings.theme === 'auto') {
      if (hostTheme) root.setAttribute('data-theme', hostTheme);
      else root.removeAttribute('data-theme');
    } else root.setAttribute('data-theme', S.settings.theme);
  }

  function renderTop() {
    const nav = NAV.map(
      (n) => '<a href="#' + n[0] + '" data-go="' + n[0] + '" data-nav="' + n[0] + '">' + (n[2] ? U.icon(n[2]) : '<span class="nav-emoji" aria-hidden="true">' + n[3] + '</span>') + '<span>' + U.esc(t(n[1])) + '</span>' +
        (n[0] === 'live' ? '<b class="nav-cnt" data-live-total></b>' : '') + '</a>'
    ).join('');
    U.$('#mainnav').innerHTML = nav;
    const tools =
      '<button type="button" class="icon-btn hide-sm" data-act="lang" aria-label="' + U.esc(t('lang_label')) + '">' + U.icon('globe') + '<span class="lang-code">' + (DB.lang === 'so' ? 'SO' : 'EN') + '</span></button>' +
      '<button type="button" class="icon-btn hide-sm" data-act="theme" aria-label="' + U.esc(t('theme_label')) + '">' + U.icon(effTheme() === 'dark' ? 'sun' : 'moon') + '</button>';
    let acts;
    if (S.user) {
      acts =
        tools +
        '<a class="bal" href="#account" data-go="account" aria-label="' + U.esc(t('balance')) + '">' + U.icon('wallet') + '<span><small>' + U.esc(t('balance')) + '</small><b data-balance>' + U.money(S.balance()) + '</b></span><em>' + U.esc(t('coins')) + '</em></a>' +
        '<button type="button" class="btn btn-go btn-dep" data-act="deposit">' + U.icon('plus') + '<span class="hide-xs">' + U.esc(t('deposit')) + '</span></button>' +
        '<div class="user-wrap"><button type="button" class="avatar-btn" data-act="user-menu" aria-haspopup="true" aria-expanded="false" aria-label="' + U.esc(S.user.name) + '">' + U.esc(S.user.name[0].toUpperCase()) + '</button>' +
        '<div class="user-pop" id="user-pop" hidden>' +
        '<div class="up-head"><b>' + U.esc(S.user.name) + '</b><span><b data-balance>' + U.money(S.balance()) + '</b> ' + U.esc(t('coins')) + '</span></div>' +
        '<a href="#mybets" data-go="mybets">' + U.icon('list') + U.esc(t('my_bets')) + '</a>' +
        '<a href="#account" data-go="account">' + U.icon('user') + U.esc(t('acc_profile')) + '</a>' +
        '<a href="#account.history" data-go="account.history">' + U.icon('wallet') + U.esc(t('acc_history')) + '</a>' +
        '<a href="#account.settings" data-go="account.settings">' + U.icon('gear') + U.esc(t('acc_settings')) + '</a>' +
        '<button type="button" data-act="lang">' + U.icon('globe') + U.esc(t('lang_label')) + ': ' + (DB.lang === 'so' ? 'Soomaali' : 'English') + '</button>' +
        '<button type="button" data-act="theme">' + U.icon(effTheme() === 'dark' ? 'sun' : 'moon') + U.esc(t('theme_label')) + '</button>' +
        '<button type="button" data-act="logout">' + U.icon('logout') + U.esc(t('logout')) + '</button>' +
        '</div></div>';
    } else {
      acts =
        tools +
        '<button type="button" class="btn btn-ghost" data-act="login">' + U.esc(t('login')) + '</button>' +
        '<button type="button" class="btn btn-go" data-act="register">' + U.esc(t('register')) + '</button>';
    }
    U.$('#top-actions').innerHTML = acts;
    U.$('#ribbon').innerHTML =
      '<div class="ribbon-in"><span class="demo-tag">DEMO</span><span>' + U.esc(t('demo_ribbon')) + '</span><a href="#info" data-go="info">' + U.esc(t('nav_info')) + '</a></div>';
  }

  function renderSide() {
    const counts = E.counts();
    const key = A.sideMode === 'live' ? 'live' : 'pre';
    const base = A.sideMode === 'live' ? 'live' : 'sports';
    const totLive = DB.SPORTS.reduce((n, s) => n + counts[s.id].live, 0);
    const totPre = DB.SPORTS.reduce((n, s) => n + counts[s.id].pre, 0);
    const sports = DB.SPORTS.map(
      (s) =>
        '<a class="sp-item" href="#' + base + '.' + s.id + '" data-go="' + base + '.' + s.id + '" data-nav="' + base + '.' + s.id + '">' +
        '<span class="sp-ic" aria-hidden="true">' + s.icon + '</span><span class="sp-nm">' + U.esc(DB.sportName(s.id)) + '</span>' +
        '<b class="sp-cnt' + (key === 'live' ? ' is-live' : '') + '" data-cnt="' + s.id + '">' + counts[s.id][key] + '</b></a>'
    ).join('');
    const leagues = DB.LEAGUES.filter((l) => l.top)
      .map((l) => '<a class="lg-item" href="#league.' + l.id + '" data-go="league.' + l.id + '" data-nav="league.' + l.id + '"><span class="sp-ic" aria-hidden="true">' + E.sport(l.sport).icon + '</span><span class="cc">' + l.cc + '</span><span class="sp-nm">' + U.esc(l.name) + '</span></a>')
      .join('');
    const games = ['crash', 'mines', 'dice', 'slots']
      .map((g) => '<a class="lg-item" href="#casino.' + g + '" data-go="casino.' + g + '" data-nav="casino.' + g + '">' + U.icon(g === 'crash' ? 'rocket' : 'cards') + '<span class="sp-nm">' + U.esc(t('g_' + g)) + '</span></a>')
      .join('');
    U.$('#side-left').innerHTML =
      '<div class="side-in">' +
      '<div class="side-top only-drawer"><span class="brand sm"><span class="brand-mark">DEMO</span><span class="brand-word">BETTING</span></span>' +
      '<button type="button" class="icon-btn" data-act="close-drawers" aria-label="' + U.esc(t('close')) + '">' + U.icon('close') + '</button></div>' +
      '<form class="search" id="search-form" role="search"><label class="sr" for="search-q">' + U.esc(t('search_ph')) + '</label>' +
      '<input id="search-q" class="inp" type="search" autocomplete="off" placeholder="' + U.esc(t('search_ph')) + '" value="' + U.esc(SV.query) + '">' +
      '<button type="submit" class="icon-btn" aria-label="' + U.esc(t('search_ph')) + '">' + U.icon('search') + '</button></form>' +
      '<nav class="only-drawer drawer-nav">' +
      NAV.map((n) => '<a href="#' + n[0] + '" data-go="' + n[0] + '">' + (n[2] ? U.icon(n[2]) : '<span class="nav-emoji" aria-hidden="true">' + n[3] + '</span>') + U.esc(t(n[1])) + '</a>').join('') +
      '<a href="#mybets" data-go="mybets">' + U.icon('list') + U.esc(t('my_bets')) + '</a>' +
      '<a href="#account.settings" data-go="account.settings">' + U.icon('gear') + U.esc(t('acc_settings')) + '</a>' +
      '<button type="button" data-act="lang">' + U.icon('globe') + (DB.lang === 'so' ? 'English' : 'Soomaali') + '</button>' +
      '<button type="button" data-act="theme">' + U.icon(effTheme() === 'dark' ? 'sun' : 'moon') + U.esc(t('theme_label')) + '</button>' +
      '</nav>' +
      '<div class="segs side-mode" role="group">' +
      '<button type="button" class="seg' + (A.sideMode === 'live' ? ' on' : '') + '" data-act="side-mode" data-m="live"><span class="live-dot" aria-hidden="true"></span>' + U.esc(t('live')) + ' <b data-side-total="live">' + totLive + '</b></button>' +
      '<button type="button" class="seg' + (A.sideMode === 'pre' ? ' on' : '') + '" data-act="side-mode" data-m="pre">' + U.esc(t('upcoming')) + ' <b data-side-total="pre">' + totPre + '</b></button>' +
      '</div>' +
      '<nav class="sport-list" aria-label="' + U.esc(t('sports_list')) + '">' + sports + '</nav>' +
      '<h4 class="side-h">' + U.esc(t('top_leagues')) + '</h4><nav class="lg-list">' + leagues + '</nav>' +
      '<h4 class="side-h">' + U.esc(t('nav_casino')) + '</h4><nav class="lg-list">' + games + '</nav>' +
      '</div>';
    renderNavState();
  }

  function renderFoot() {
    const link = (r, k) => '<a href="#' + r + '" data-go="' + r + '">' + U.esc(t(k)) + '</a>';
    U.$('#foot').innerHTML =
      '<div class="foot-in">' +
      '<div class="foot-brand"><span class="brand"><span class="brand-mark">DEMO</span><span class="brand-word">BETTING</span></span>' +
      '<p>' + U.esc(t('demo_ribbon')) + '</p><p class="age"><span class="age-b">18+</span>' + U.esc(t('play_resp')) + '</p></div>' +
      '<nav class="foot-cols">' +
      '<div><h4>' + U.esc(t('nav_sports')) + '</h4>' + link('live', 'nav_live') + link('sports.football', 'sp_football') + link('sports.basketball', 'sp_basketball') + link('sports.tennis', 'sp_tennis') + link('results', 'nav_results') + '</div>' +
      '<div><h4>' + U.esc(t('nav_casino')) + '</h4>' + link('casino.crash', 'g_crash') + link('casino.mines', 'g_mines') + link('casino.dice', 'g_dice') + link('casino.slots', 'g_slots') + '</div>' +
      '<div><h4>Info</h4>' + link('info', 'nav_info') + link('promo', 'nav_promo') + link('mybets', 'nav_mybets') + link('account.settings', 'acc_settings') + '</div>' +
      '</nav>' +
      '<p class="foot-copy">' + U.esc(t('foot_copy', { y: new Date().getFullYear() })) + '</p></div>';
  }

  function renderBottom() {
    U.$('#bottomnav').innerHTML =
      '<a href="#home" data-go="home" data-nav="home">' + U.icon('home') + '<span>' + U.esc(t('nav_home')) + '</span></a>' +
      '<a href="#live" data-go="live" data-nav="live">' + U.icon('live') + '<span>' + U.esc(t('nav_live')) + '</span></a>' +
      '<button type="button" class="bn-slip" data-act="open-slip">' + U.icon('slip') + '<span>' + U.esc(t('nav_slip')) + '</span><b class="bn-cnt" data-slip-count hidden></b></button>' +
      '<a href="#casino" data-go="casino" data-nav="casino">' + U.icon('cards') + '<span>' + U.esc(t('nav_casino')) + '</span></a>' +
      '<button type="button" data-act="menu">' + U.icon('menu') + '<span>' + U.esc(t('nav_menu')) + '</span></button>';
    updateSlipBadge();
  }

  function renderNavState() {
    const act = activeNav();
    const full = routeStr();
    U.$$('#mainnav a').forEach((a) => a.classList.toggle('on', a.dataset.nav === act));
    U.$$('#side-left [data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === full));
    U.$$('#bottomnav [data-nav]').forEach((a) => a.classList.toggle('on', a.dataset.nav === A.route || (A.route === 'home' && a.dataset.nav === 'home')));
  }

  function updateSlipBadge() {
    const n = B.count();
    U.$$('[data-slip-count]').forEach((el) => {
      el.textContent = n;
      el.hidden = !n;
    });
  }

  function renderAll() {
    document.documentElement.lang = DB.lang;
    renderTop();
    renderSide();
    renderFoot();
    renderBottom();
    B.render();
    renderView(true);
    renderNavState();
  }

  /* ================= drawers & popovers ================= */
  function openDrawer(which) {
    closeUserPop();
    U.$('#side-left').classList.toggle('open', which === 'left');
    U.$('#side-right').classList.toggle('open', which === 'right');
    U.$('#scrim').hidden = false;
    document.body.classList.add('drawer-open');
  }
  function closeDrawers() {
    U.$('#side-left').classList.remove('open');
    U.$('#side-right').classList.remove('open');
    U.$('#scrim').hidden = true;
    document.body.classList.remove('drawer-open');
  }
  function closeUserPop() {
    const p = U.$('#user-pop');
    if (p && !p.hidden) {
      p.hidden = true;
      const b = U.$('[data-act="user-menu"]');
      if (b) b.setAttribute('aria-expanded', 'false');
    }
  }

  A.openAuth = (tab, msg) => {
    closeDrawers();
    AC.openAuth(tab, msg);
  };

  /* ================= settings ================= */
  A.setSetting = (key, val) => {
    S.settings[key] = val;
    S.saveSettings();
    if (key === 'lang') {
      DB.lang = val === 'so' ? 'so' : 'en';
      renderAll();
    } else if (key === 'theme') {
      applyTheme();
      renderAll();
    } else if (key === 'oddsFmt') {
      B.render();
      renderView(true);
    } else if (key === 'accept') {
      if (val === 'any') B.acceptChanges();
      else B.render();
      if (A.route === 'account') renderView(true);
    }
  };

  /* ================= live patching ================= */
  function patchLive() {
    U.$$('[data-clock]').forEach((el) => {
      const ev = E.find(el.dataset.clock);
      if (!ev) return;
      const html = DB.clockHTML(ev, E.st(ev));
      if (el._h !== html) {
        el._h = html;
        el.innerHTML = html;
      }
    });
    U.$$('[data-sh],[data-sa]').forEach((el) => {
      const home = el.hasAttribute('data-sh');
      const ev = E.find(home ? el.dataset.sh : el.dataset.sa);
      if (!ev) return;
      const v = DB.score(ev, E.st(ev));
      const txt = v ? String(v[home ? 0 : 1]) : el.closest('.eh-score') ? '–' : '';
      if (el.textContent !== txt) {
        const scored = el.textContent !== '' && el.textContent !== '–' && v;
        el.textContent = txt;
        if (scored) {
          el.classList.remove('goal');
          void el.offsetWidth;
          el.classList.add('goal');
        }
      }
    });
    U.$$('[data-extra]').forEach((el) => {
      const ev = E.find(el.dataset.extra);
      if (!ev) return;
      const html = SV.extraHTML(ev, E.st(ev));
      if (el._h !== html) {
        el._h = html;
        el.innerHTML = html;
      }
    });
    U.$$('.odd[data-sid]').forEach((btn) => {
      const p = E.sidParts(btn.dataset.sid);
      const o = E.odds(E.find(p.eid), p.mkt, p.out);
      const prev = btn.dataset.o ? parseFloat(btn.dataset.o) : null;
      if (o !== prev) {
        btn.dataset.o = o || '';
        btn.querySelector('.v').innerHTML = o == null ? U.icon('lock') : DB.fmtOdds(o);
        btn.classList.toggle('lock', o == null);
        if (o != null && prev != null) {
          btn.classList.remove('up', 'down');
          void btn.offsetWidth;
          btn.classList.add(o > prev ? 'up' : 'down');
          clearTimeout(btn._t);
          btn._t = setTimeout(() => btn.classList.remove('up', 'down'), 2600);
        }
      }
    });
  }
  function patchSlipMarks() {
    U.$$('.odd[data-sid]').forEach((btn) => btn.classList.toggle('on', B.has(btn.dataset.sid)));
  }
  function patchCounts() {
    const counts = E.counts();
    const key = A.sideMode === 'live' ? 'live' : 'pre';
    let live = 0;
    let pre = 0;
    DB.SPORTS.forEach((s) => {
      live += counts[s.id].live;
      pre += counts[s.id].pre;
      const el = U.$('[data-cnt="' + s.id + '"]');
      if (el) el.textContent = counts[s.id][key];
    });
    U.$$('[data-side-total="live"]').forEach((el) => (el.textContent = live));
    U.$$('[data-side-total="pre"]').forEach((el) => (el.textContent = pre));
    U.$$('[data-live-total]').forEach((el) => (el.textContent = live));
  }

  function tick() {
    const now = Date.now();
    E.tick(now);
    E.maintain(now, S.openEventIds());
    CS.crashTick(now);
    S.settleAll(now).forEach((b) => {
      if (b.status === 'won') U.toast(t('settled_won', { id: b.id, v: U.money(b.payout) }), 'ok', 5000);
      else if (b.status === 'lost') U.toast(t('settled_lost', { id: b.id }), 'info');
      else if (b.status === 'void') U.toast(t('settled_void', { id: b.id }), 'info');
    });
    B.tick();
    if (view) {
      const sig = view.sig ? view.sig(A.arg) : '';
      if (sig !== lastSig && !U.modal.isOpen()) renderView(true);
      else if (view.update) view.update(A.arg);
    }
    patchLive();
    AC.patchCashout();
    patchCounts();
  }

  /* ================= events ================= */
  document.addEventListener('click', (e) => {
    const go = e.target.closest('[data-go]');
    if (go) {
      if (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1) return;
      e.preventDefault();
      if (U.modal.isOpen()) U.modal.close();
      A.go(go.dataset.go);
      return;
    }
    const el = e.target.closest('[data-act]');
    if (!e.target.closest('.user-wrap')) closeUserPop();
    if (!el) return;
    const d = el.dataset;
    switch (d.act) {
      case 'odd':
        if (el.classList.contains('lock')) return;
        B.toggle(d.sid);
        patchSlipMarks();
        break;
      case 'modal-close':
        U.modal.close();
        break;
      case 'login':
        A.openAuth('login');
        break;
      case 'register':
        A.openAuth('register');
        break;
      case 'auth-tab':
        AC.openAuth(d.tab);
        break;
      case 'reg-mode':
        AC.setRegMode(d.m);
        break;
      case 'deposit':
        closeDrawers();
        AC.openDeposit(d.tab);
        break;
      case 'sova-amt': {
        const inp = U.$('#sova-amount');
        if (inp) inp.value = d.v;
        break;
      }
      case 'dep-tab':
        AC.openDeposit(d.tab);
        break;
      case 'dep-amt': {
        const inp = U.$('#dep-amount');
        if (inp) inp.value = d.v;
        AC.depAmountChanged();
        break;
      }
      case 'copy':
        AC.copy(el);
        break;
      case 'logout':
        S.logout();
        U.toast(t('logged_out'));
        break;
      case 'user-menu': {
        const p = U.$('#user-pop');
        p.hidden = !p.hidden;
        el.setAttribute('aria-expanded', String(!p.hidden));
        break;
      }
      case 'lang':
        A.setSetting('lang', DB.lang === 'so' ? 'en' : 'so');
        break;
      case 'theme':
        A.setSetting('theme', effTheme() === 'dark' ? 'light' : 'dark');
        break;
      case 'menu':
        openDrawer('left');
        break;
      case 'open-slip':
        openDrawer('right');
        break;
      case 'close-drawers':
        closeDrawers();
        break;
      case 'side-mode':
        A.sideMode = d.m;
        renderSide();
        break;
      case 'slip-tab':
        B.tab = d.tab;
        B.render();
        break;
      case 'slip-remove':
        B.remove(d.sid);
        patchSlipMarks();
        break;
      case 'slip-clear':
        B.clear();
        patchSlipMarks();
        break;
      case 'slip-mode':
        B.setMode(d.m);
        break;
      case 'slip-quick':
        B.quick(Number(d.v));
        break;
      case 'slip-place':
        B.place();
        patchSlipMarks();
        break;
      case 'slip-accept':
        B.acceptChanges();
        break;
      case 'cashout':
        AC.cashoutClick(d.bet);
        break;
      case 'hero':
        SV.showHero(Number(d.i));
        break;
      case 'line-window':
        SV.setLineWindow(Number(d.m));
        renderView(true);
        break;
      case 'mkt-filter':
        SV.setFilter(d.f);
        renderView(true);
        break;
      case 'mkt-toggle': {
        SV.toggleFam(d.fam);
        const sec = el.closest('.mkt');
        sec.classList.toggle('closed');
        el.setAttribute('aria-expanded', String(!sec.classList.contains('closed')));
        break;
      }
      case 'reset-arm':
        AC.setResetArmed(true);
        renderView(true);
        break;
      case 'reset-no':
        AC.setResetArmed(false);
        renderView(true);
        break;
      case 'reset-yes':
        AC.setResetArmed(false);
        S.resetAccount();
        U.toast(t('reset_done', { n: U.money(S.WELCOME_BONUS) }), 'ok');
        renderView(true);
        break;
      case 'wheel-spin':
        AC.spinWheel();
        break;
      case 'crash-bet':
        CS.crashBet();
        break;
      case 'crash-cancel':
        CS.crashCancel();
        break;
      case 'crash-cash':
        CS.crashCash();
        break;
      case 'stake-half':
        CS.stakeAdjust(d.for, 0.5);
        break;
      case 'stake-double':
        CS.stakeAdjust(d.for, 2);
        break;
      case 'mines-start':
        CS.minesStart();
        break;
      case 'mines-pick':
        CS.minesPick(Number(d.i));
        break;
      case 'mines-cash':
        CS.minesCash();
        break;
      case 'dice-mode':
        CS.diceMode(d.m);
        break;
      case 'dice-roll':
        CS.diceRoll();
        break;
      case 'slot-spin':
        CS.slotSpin();
        break;
    }
  });

  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset && el.dataset.stake) B.setStake(el.dataset.stake, el.value);
    else if (el.id === 'dep-amount') AC.depAmountChanged();
    else if (el.id === 'search-q') {
      SV.query = el.value;
      if (A.route === 'search') {
        if (el.value.trim().length >= 2) renderView(true);
      }
    } else if (view && view.input && U.$('#view').contains(el)) view.input(el);
  });
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset && el.dataset.setting) A.setSetting(el.dataset.setting, el.value);
    else if (view && view.change && U.$('#view').contains(el)) view.change(el);
  });
  document.addEventListener('submit', (e) => {
    e.preventDefault();
    const f = e.target;
    if (f.id === 'search-form') {
      const q = U.$('#search-q').value.trim();
      SV.query = q;
      if (q.length >= 2) A.go('search');
      return;
    }
    AC.submit(f);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (U.modal.isOpen()) U.modal.close();
    closeDrawers();
    closeUserPop();
  });
  window.addEventListener('popstate', () => show(parse(location.hash), false));
  window.addEventListener('hashchange', () => {
    const r = parse(location.hash);
    if (r.name !== A.route || r.arg !== A.arg) show(r, true);
  });
  try {
    window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
      if (S.settings.theme === 'auto') renderAll();
    });
  } catch (e) {
    /* older browsers */
  }

  DB.bus.on('balance', () => {
    U.$$('[data-balance]').forEach((el) => (el.textContent = U.money(S.balance())));
  });
  DB.bus.on('auth', () => {
    renderTop();
    B.render();
    renderView(true);
  });
  DB.bus.on('bets', () => {
    if (B.tab === 'mybets') B.render();
    else {
      const c = U.$$('.slip-tabs .cnt');
      if (c[1]) c[1].textContent = S.openBets().length;
    }
  });
  DB.bus.on('slip', updateSlipBadge);
  DB.bus.on('slip-count', updateSlipBadge);

  /* ================= boot ================= */
  function boot() {
    DB.lang = S.settings.lang === 'so' ? 'so' : 'en';
    applyTheme();
    E.load();
    S.restore();
    const now = Date.now();
    E.tick(now);
    E.maintain(now, S.openEventIds());
    CS.crashTick(now);
    S.settleAll(now);
    document.documentElement.lang = DB.lang;
    renderTop();
    renderSide();
    renderFoot();
    renderBottom();
    B.render();
    show(parse(location.hash), false);
    setInterval(tick, 1000);
    DB.P.init();
  }
  boot();
})();
