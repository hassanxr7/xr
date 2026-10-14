/* Demo Betting — bet slip: selections, singles and accumulators, odds-change handling, placing bets. */
'use strict';
(function () {
  const DB = window.DB;
  const U = DB.U;
  const E = DB.E;
  const S = DB.S;
  const t = (k, v) => DB.t(k, v);
  const B = (DB.B = {});

  const MAX_SELS = 20;
  const saved = U.store.get('db_slip', null) || {};
  B.sels = Array.isArray(saved.sels) ? saved.sels : [];
  B.mode = saved.mode === 'acca' ? 'acca' : 'single';
  B.stakes = saved.stakes || {};
  B.accaStake = saved.accaStake || '10';
  B.tab = 'slip';
  let error = '';
  let needAccept = false;

  const save = () => U.store.set('db_slip', { sels: B.sels, mode: B.mode, stakes: B.stakes, accaStake: B.accaStake });
  const defStake = () => String(S.settings.lastStake || 10);

  B.has = (sid) => B.sels.some((s) => s.sid === sid);
  B.count = () => B.sels.length;
  const conflictIds = () => {
    const seen = {};
    const dup = new Set();
    B.sels.forEach((s) => {
      if (seen[s.eid]) dup.add(s.eid);
      seen[s.eid] = 1;
    });
    return dup;
  };

  B.toggle = (sid) => {
    error = '';
    needAccept = false;
    const i = B.sels.findIndex((s) => s.sid === sid);
    if (i >= 0) {
      B.sels.splice(i, 1);
      delete B.stakes[sid];
    } else {
      const p = E.sidParts(sid);
      const ev = E.find(p.eid);
      const o = E.odds(ev, p.mkt, p.out);
      if (o == null) {
        U.toast(t('unavailable'), 'warn');
        return;
      }
      if (B.sels.length >= MAX_SELS) {
        U.toast(t('max_sel'), 'warn');
        return;
      }
      B.sels.push({ sid, eid: p.eid, mkt: p.mkt, out: p.out, odds: o, ack: o, sport: ev.sport, home: ev.home, away: ev.away, league: ev.league, start: ev.start });
      B.stakes[sid] = B.stakes[sid] || defStake();
    }
    if (B.sels.length >= 2 && !conflictIds().size) B.mode = 'acca';
    if (B.sels.length < 2) B.mode = 'single';
    save();
    B.render();
    DB.bus.emit('slip');
  };

  B.remove = (sid) => {
    if (B.has(sid)) B.toggle(sid);
  };
  B.clear = () => {
    B.sels = [];
    B.stakes = {};
    error = '';
    needAccept = false;
    B.mode = 'single';
    save();
    B.render();
    DB.bus.emit('slip');
  };
  B.setMode = (m) => {
    if (m === 'acca' && (B.sels.length < 2 || conflictIds().size)) return;
    B.mode = m;
    error = '';
    save();
    B.render();
  };
  B.setStake = (sid, v) => {
    if (sid === 'acca') B.accaStake = v;
    else B.stakes[sid] = v;
    error = '';
    save();
    B.refresh();
  };
  B.quick = (amount) => {
    if (B.mode === 'acca') B.accaStake = String(amount);
    else B.sels.forEach((s) => (B.stakes[s.sid] = String(amount)));
    save();
    U.$$('[data-stake]').forEach((inp) => (inp.value = inp.dataset.stake === 'acca' ? B.accaStake : B.stakes[inp.dataset.stake] || ''));
    error = '';
    B.refresh();
  };
  B.acceptChanges = () => {
    B.sels.forEach((s) => (s.ack = s.odds));
    needAccept = false;
    error = '';
    save();
    B.render();
  };

  const accaOdds = () => U.round2(B.sels.reduce((p, s) => p * s.odds, 1));
  const boostOn = () => B.sels.length >= S.ACCA_BOOST_MIN && B.sels.every((s) => s.odds >= S.ACCA_BOOST_ODDS);
  const needsAck = (s) => {
    const pol = S.settings.accept;
    if (pol === 'any') return false;
    if (pol === 'up') return s.odds < s.ack;
    return s.odds !== s.ack;
  };

  /* ---------- rendering ---------- */
  function tabs() {
    const open = S.openBets().length;
    return (
      '<div class="slip-tabs" role="tablist">' +
      '<button type="button" role="tab" aria-selected="' + (B.tab === 'slip') + '" class="' + (B.tab === 'slip' ? 'on' : '') + '" data-act="slip-tab" data-tab="slip">' +
      U.esc(t('slip')) + ' <b class="cnt">' + B.sels.length + '</b></button>' +
      '<button type="button" role="tab" aria-selected="' + (B.tab === 'mybets') + '" class="' + (B.tab === 'mybets' ? 'on' : '') + '" data-act="slip-tab" data-tab="mybets">' +
      U.esc(t('my_bets')) + ' <b class="cnt">' + open + '</b></button>' +
      '<button type="button" class="icon-btn slip-x" data-act="close-drawers" aria-label="' + U.esc(t('close')) + '">' + U.icon('close') + '</button>' +
      '</div>'
    );
  }

  function itemHTML(s, dup) {
    const sp = E.sport(s.sport);
    const ev = E.find(s.eid) || { home: s.home, away: s.away, sport: s.sport };
    const single = B.mode === 'single';
    return (
      '<li class="sl-item' + (dup.has(s.eid) && B.mode === 'acca' ? ' conf' : '') + '" data-sid="' + s.sid + '">' +
      '<div class="sl-ev"><span aria-hidden="true">' + sp.icon + '</span><span class="sl-teams">' + U.esc(s.home) + ' — ' + U.esc(s.away) + '</span>' +
      '<button type="button" class="sl-rm" data-act="slip-remove" data-sid="' + s.sid + '" aria-label="' + U.esc(t('remove')) + '">' + U.icon('close') + '</button></div>' +
      '<div class="sl-pick"><span class="sl-mkt">' + U.esc(DB.mktTitle(s.mkt, ev)) + '</span><b class="sl-out">' + U.esc(DB.outLabel(s.mkt, s.out, ev)) + '</b>' +
      '<span class="sl-odds" data-odds>' + DB.fmtOdds(s.odds) + '</span></div>' +
      '<div class="sl-note" data-note></div>' +
      (single
        ? '<div class="sl-stake"><label class="sr" for="stk-' + s.sid.replace(/[^a-z0-9]/gi, '') + '">' + U.esc(t('stake')) + '</label>' +
          '<input id="stk-' + s.sid.replace(/[^a-z0-9]/gi, '') + '" class="inp" type="text" inputmode="decimal" autocomplete="off" data-stake="' + s.sid + '" value="' + U.esc(B.stakes[s.sid] || '') + '" placeholder="' + U.esc(t('stake')) + '">' +
          '<span class="sl-pot">' + U.esc(t('pot_win')) + ' <b data-pot="' + s.sid + '"></b></span></div>'
        : '') +
      '</li>'
    );
  }

  function slipHTML() {
    if (!B.sels.length) {
      return '<div class="slip-empty">' + U.icon('slip', 'empty-ic') + '<h3>' + U.esc(t('slip_empty_t')) + '</h3><p>' + U.esc(t('slip_empty')) + '</p></div>';
    }
    const dup = conflictIds();
    const canAcca = B.sels.length >= 2 && !dup.size;
    let h =
      '<div class="segs slip-mode" role="group">' +
      '<button type="button" class="seg' + (B.mode === 'single' ? ' on' : '') + '" data-act="slip-mode" data-m="single">' + U.esc(t('single')) + '</button>' +
      '<button type="button" class="seg' + (B.mode === 'acca' ? ' on' : '') + '" data-act="slip-mode" data-m="acca"' + (canAcca ? '' : ' disabled') + '>' + U.esc(t('acca')) + (B.sels.length > 1 ? ' (' + B.sels.length + ')' : '') + '</button>' +
      '</div>';
    if (dup.size && B.sels.length > 1) h += '<p class="sl-warn">' + U.esc(t('conflict')) + '</p>';
    h += '<ul class="sl-items">' + B.sels.map((s) => itemHTML(s, dup)).join('') + '</ul>';
    h += '<div class="sl-foot">';
    if (B.mode === 'acca') {
      h += '<div class="sl-line"><span>' + U.esc(t('total_odds')) + '</span><b data-total-odds></b></div>';
      h += '<div class="sl-boost" data-boost></div>';
      h += '<label class="sl-line" for="stk-acca"><span>' + U.esc(t('stake')) + '</span><input id="stk-acca" class="inp" type="text" inputmode="decimal" autocomplete="off" data-stake="acca" value="' + U.esc(B.accaStake) + '"></label>';
    } else {
      h += '<div class="sl-line"><span>' + U.esc(t('total_stake')) + '</span><b data-total-stake></b></div>';
    }
    h += '<div class="quick">' + [10, 50, 100, 500].map((v) => '<button type="button" class="seg" data-act="slip-quick" data-v="' + v + '">' + v + '</button>').join('') + '</div>';
    h += '<div class="sl-line big"><span>' + U.esc(t('pot_win')) + '</span><b data-pot-total></b></div>';
    h +=
      '<label class="sl-accept" for="slip-accept"><span>' + U.esc(t('accept_label')) + '</span><select id="slip-accept" class="inp" data-setting="accept">' +
      ['any', 'up', 'none'].map((k) => '<option value="' + k + '"' + (S.settings.accept === k ? ' selected' : '') + '>' + U.esc(t('accept_' + k)) + '</option>').join('') +
      '</select></label>';
    h += '<p class="sl-err" data-err role="alert"></p>';
    if (needAccept) h += '<button type="button" class="btn btn-warn btn-block" data-act="slip-accept">' + U.esc(t('accept_changes')) + '</button>';
    h += S.user
      ? '<button type="button" class="btn btn-go btn-block" data-act="slip-place">' + U.esc(t('place_bet')) + '</button>'
      : '<button type="button" class="btn btn-go btn-block" data-act="login">' + U.esc(t('login_to_bet')) + '</button>';
    h += '<button type="button" class="link-btn" data-act="slip-clear">' + U.icon('trash') + U.esc(t('clear_all')) + '</button>';
    h += '</div>';
    return h;
  }

  function myBetsHTML() {
    if (!S.user) return '<div class="slip-empty">' + U.icon('list', 'empty-ic') + '<p>' + U.esc(t('need_login')) + '</p><button type="button" class="btn btn-go" data-act="login">' + U.esc(t('login')) + '</button></div>';
    const open = S.openBets().slice(0, 8);
    if (!open.length) return '<div class="slip-empty">' + U.icon('list', 'empty-ic') + '<p>' + U.esc(t('mb_none')) + '</p></div>';
    return '<div class="mini-bets">' + open.map((b) => DB.AC.betCard(b, true)).join('') + '</div>' +
      '<a class="link-btn" href="#mybets" data-go="mybets">' + U.esc(t('view_all_bets')) + U.icon('chev') + '</a>';
  }

  B.render = () => {
    const root = U.$('#slip');
    if (!root) return;
    const focusId = document.activeElement && root.contains(document.activeElement) ? document.activeElement.id : null;
    root.innerHTML = tabs() + '<div class="slip-pane">' + (B.tab === 'slip' ? slipHTML() : myBetsHTML()) + '</div>';
    if (focusId) {
      const f = document.getElementById(focusId);
      if (f) f.focus();
    }
    B.refresh();
    DB.bus.emit('slip-count');
  };

  // update odds/potential wins in place, without re-rendering inputs
  B.refresh = () => {
    const root = U.$('#slip');
    if (!root || B.tab !== 'slip' || !B.sels.length) return;
    B.sels.forEach((s) => {
      const li = root.querySelector('.sl-item[data-sid="' + CSS.escape(s.sid) + '"]');
      if (!li) return;
      li.classList.toggle('na', !!s.na);
      li.classList.toggle('chg-up', !s.na && s.odds > s.ack);
      li.classList.toggle('chg-down', !s.na && s.odds < s.ack);
      li.querySelector('[data-odds]').textContent = s.na ? '—' : DB.fmtOdds(s.odds);
      const note = li.querySelector('[data-note]');
      note.textContent = s.na ? t('unavailable') : s.odds !== s.ack ? t('odds_changed') + ': ' + DB.fmtOdds(s.ack) + ' → ' + DB.fmtOdds(s.odds) : '';
      const pot = li.querySelector('[data-pot]');
      if (pot) pot.textContent = U.money(U.parseAmount(B.stakes[s.sid] || 0) * s.odds);
    });
    if (B.mode === 'acca') {
      const o = accaOdds();
      const boost = boostOn();
      const el = root.querySelector('[data-total-odds]');
      if (el) el.textContent = DB.fmtOdds(o);
      const be = root.querySelector('[data-boost]');
      if (be) {
        const missing = Math.max(0, S.ACCA_BOOST_MIN - B.sels.length);
        be.textContent = boost ? t('boost_on') : missing ? t('boost_hint', { n: missing, o: S.ACCA_BOOST_ODDS.toFixed(2) }) : '';
        be.classList.toggle('on', boost);
      }
      const pot = Math.min(S.MAX_WIN, U.parseAmount(B.accaStake) * o * (boost ? S.ACCA_BOOST : 1));
      const pt = root.querySelector('[data-pot-total]');
      if (pt) pt.textContent = U.money(pot) + ' ' + t('coins');
    } else {
      let stake = 0;
      let pot = 0;
      B.sels.forEach((s) => {
        const v = U.parseAmount(B.stakes[s.sid] || 0);
        stake += v;
        pot += v * s.odds;
      });
      const ts = root.querySelector('[data-total-stake]');
      if (ts) ts.textContent = U.money(stake) + ' ' + t('coins');
      const pt = root.querySelector('[data-pot-total]');
      if (pt) pt.textContent = U.money(pot) + ' ' + t('coins');
    }
    const er = root.querySelector('[data-err]');
    if (er) er.textContent = error;
  };

  // called every tick: pull fresh odds into the slip
  B.tick = () => {
    if (!B.sels.length) return;
    let dirty = false;
    B.sels.forEach((s) => {
      const o = E.odds(E.find(s.eid), s.mkt, s.out);
      const na = o == null;
      if (na !== !!s.na) {
        s.na = na;
        dirty = true;
      }
      if (!na && o !== s.odds) {
        s.odds = o;
        if (S.settings.accept === 'any') s.ack = o;
        dirty = true;
      }
    });
    if (dirty) {
      save();
      const canAcca = B.sels.length >= 2 && !conflictIds().size;
      if (!canAcca && B.mode === 'acca') B.render();
      else B.refresh();
    }
  };

  function fail(key, vars) {
    error = t(key, vars);
    B.refresh();
    U.toast(error, 'warn');
  }

  B.place = () => {
    if (!S.user) {
      DB.A.openAuth('login');
      return;
    }
    const now = Date.now();
    error = '';
    let na = false;
    B.sels.forEach((s) => {
      const o = E.odds(E.find(s.eid), s.mkt, s.out, now);
      if (o == null) {
        s.na = true;
        na = true;
      } else {
        s.na = false;
        s.odds = o;
        if (S.settings.accept === 'any') s.ack = o;
      }
    });
    if (na) return fail('err_unavail');
    if (B.sels.some(needsAck)) {
      needAccept = true;
      B.render();
      return fail('err_changed');
    }
    const snap = (s) => {
      const ev = E.find(s.eid);
      return Object.assign({}, s, { live: E.state(ev, now).status === 'live' });
    };
    if (B.mode === 'acca') {
      if (B.sels.length < 2) return fail('err_acca2');
      if (conflictIds().size) return fail('conflict');
      const stake = U.parseAmount(B.accaStake);
      if (!stake) return fail('err_stake');
      if (stake < S.MIN_STAKE) return fail('err_min', { n: S.MIN_STAKE });
      if (stake > S.MAX_STAKE) return fail('err_max', { n: U.money(S.MAX_STAKE) });
      if (!S.canAfford(stake)) return fail('err_funds');
      const bet = S.placeBet('acca', B.sels.map(snap), stake);
      S.settings.lastStake = stake;
      S.saveSettings();
      U.toast(t('bet_ok', { id: bet.id }), 'ok');
    } else {
      const stakes = B.sels.map((s) => U.parseAmount(B.stakes[s.sid] || 0));
      if (stakes.some((v) => !v)) return fail('err_stake');
      if (stakes.some((v) => v < S.MIN_STAKE)) return fail('err_min', { n: S.MIN_STAKE });
      if (stakes.some((v) => v > S.MAX_STAKE)) return fail('err_max', { n: U.money(S.MAX_STAKE) });
      const total = stakes.reduce((a, b) => a + b, 0);
      if (!S.canAfford(total)) return fail('err_funds');
      const bets = B.sels.map((s, i) => S.placeBet('single', [snap(s)], stakes[i]));
      S.settings.lastStake = stakes[stakes.length - 1];
      S.saveSettings();
      U.toast(bets.length === 1 ? t('bet_ok', { id: bets[0].id }) : t('bets_ok', { n: bets.length }), 'ok');
    }
    B.clear();
  };
})();
