/* Demo Betting — accounts, demo-coin wallet, bets and settlement. Everything stays in this browser. */
'use strict';
(function () {
  const DB = window.DB;
  const U = DB.U;
  const S = (DB.S = {});

  S.WELCOME_BONUS = 1000;
  S.MIN_STAKE = 1;
  S.MAX_STAKE = 10000;
  S.MAX_WIN = 250000;
  S.CASHOUT_MARGIN = 0.92;
  S.ACCA_BOOST_MIN = 5; // selections needed for the accumulator boost
  S.ACCA_BOOST_ODDS = 1.3; // each leg must have at least these odds
  S.ACCA_BOOST = 1.1;

  // v2: English became the default language, so a language saved under v1 is reset once
  const savedSettings = U.store.get('db_settings', {}) || {};
  if ((savedSettings.v || 1) < 2) delete savedSettings.lang;
  S.settings = Object.assign({ lang: 'en', theme: 'auto', oddsFmt: 'dec', accept: 'any' }, savedSettings, { v: 2 });
  S.saveSettings = () => U.store.set('db_settings', S.settings);

  S.users = U.store.get('db_users', {}) || {};
  S.user = null; // { name, created }
  S.data = null; // { balance, bets, tx, lastWheel, crash, mines }

  const ukey = (name) => 'db_u_' + name.toLowerCase();
  const pwHash = (name, pass) => U.hash(name.toLowerCase() + '|' + pass, 7919).toString(36);

  function freshData() {
    return { balance: 0, bets: [], tx: [], lastWheel: 0, crash: null, mines: null };
  }
  function loadUser(name) {
    const rec = S.users[name.toLowerCase()];
    if (!rec) return false;
    S.user = { name: rec.name, created: rec.created };
    S.data = Object.assign(freshData(), U.store.get(ukey(rec.name), {}) || {});
    return true;
  }
  S.save = () => {
    if (!S.user) return;
    U.store.set(ukey(S.user.name), S.data);
  };

  S.restore = () => {
    const name = U.store.get('db_session', null);
    if (name && loadUser(name)) return true;
    U.store.del('db_session');
    return false;
  };

  S.validName = (name) => /^[A-Za-z0-9_]{3,16}$/.test(name);

  // returns null on success or an i18n error key
  S.register = (name, pass) => {
    name = String(name || '').trim();
    if (!S.validName(name)) return 'err_name';
    if (String(pass || '').length < 4) return 'err_pass';
    if (S.users[name.toLowerCase()]) return 'err_taken';
    S.users[name.toLowerCase()] = { name, hash: pwHash(name, pass), created: Date.now() };
    U.store.set('db_users', S.users);
    loadUser(name);
    S.data = freshData();
    U.store.set('db_session', name);
    S.adjust(S.WELCOME_BONUS, 'bonus', 'welcome');
    DB.bus.emit('auth');
    return null;
  };

  S.oneClick = () => {
    let name;
    do name = 'player' + U.randInt(100000, 999999);
    while (S.users[name]);
    const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
    let pass = '';
    for (let i = 0; i < 8; i++) pass += chars[U.randInt(0, chars.length - 1)];
    S.register(name, pass);
    return { name, pass };
  };

  S.login = (name, pass) => {
    name = String(name || '').trim();
    const rec = S.users[name.toLowerCase()];
    if (!rec || rec.hash !== pwHash(rec.name, pass)) return 'err_login';
    loadUser(rec.name);
    U.store.set('db_session', rec.name);
    DB.bus.emit('auth');
    return null;
  };

  S.logout = () => {
    S.save();
    S.user = null;
    S.data = null;
    U.store.del('db_session');
    DB.bus.emit('auth');
  };

  S.resetAccount = () => {
    if (!S.user) return;
    S.data = freshData();
    S.adjust(S.WELCOME_BONUS, 'bonus', 'reset');
    DB.bus.emit('bets');
  };

  /* ---------- wallet ---------- */
  S.balance = () => (S.data ? S.data.balance : 0);
  // positive amount credits, negative debits. type: deposit|bonus|bet|win|cashout|refund|casino_bet|casino_win
  S.adjust = (amount, type, note) => {
    if (!S.data) return;
    amount = U.round2(amount);
    S.data.balance = U.round2(S.data.balance + amount);
    S.data.tx.unshift({ t: Date.now(), type, amount, bal: S.data.balance, note: note || '' });
    if (S.data.tx.length > 300) S.data.tx.length = 300;
    S.save();
    DB.bus.emit('balance');
  };
  S.canAfford = (x) => !!S.data && S.data.balance + 1e-9 >= x;

  /* ---------- bets ---------- */
  S.openEventIds = () => {
    const ids = new Set();
    if (S.data) S.data.bets.forEach((b) => b.status === 'open' && b.sels.forEach((s) => ids.add(s.eid)));
    return ids;
  };
  S.openBets = () => (S.data ? S.data.bets.filter((b) => b.status === 'open') : []);

  // sels: [{ eid, mkt, out, odds, ev snapshot fields }]
  S.placeBet = (type, sels, stake) => {
    const odds = U.round2(sels.reduce((p, s) => p * s.odds, 1));
    const boost =
      type === 'acca' && sels.length >= S.ACCA_BOOST_MIN && sels.every((s) => s.odds >= S.ACCA_BOOST_ODDS) ? S.ACCA_BOOST : 1;
    const bet = {
      id: U.betId(),
      type,
      t: Date.now(),
      stake: U.round2(stake),
      odds,
      boost,
      status: 'open',
      payout: 0,
      sels: sels.map((s) => ({
        eid: s.eid,
        mkt: s.mkt,
        out: s.out,
        odds: s.odds,
        sport: s.sport,
        home: s.home,
        away: s.away,
        league: s.league,
        start: s.start,
        live: s.live,
        res: null,
      })),
    };
    bet.pot = Math.min(S.MAX_WIN, U.round2(bet.stake * odds * boost));
    S.data.bets.unshift(bet);
    // keep history bounded, but never drop a bet that is still open
    for (let i = S.data.bets.length - 1; S.data.bets.length > 400 && i >= 0; i--) {
      if (S.data.bets[i].status !== 'open') S.data.bets.splice(i, 1);
    }
    S.adjust(-bet.stake, 'bet', bet.id);
    DB.bus.emit('bets');
    return bet;
  };

  function finalize(bet, status, payout) {
    bet.status = status;
    bet.payout = U.round2(payout);
    bet.settled = Date.now();
    if (payout > 0) S.adjust(payout, status === 'void' ? 'refund' : status === 'cashed' ? 'cashout' : 'win', bet.id);
  }

  // settle whatever can be settled; returns list of { bet, status } that changed
  S.settleAll = (now) => {
    if (!S.data) return [];
    const changed = [];
    S.data.bets.forEach((bet) => {
      if (bet.status !== 'open') return;
      let dirty = false;
      bet.sels.forEach((s) => {
        if (s.res) return;
        const ev = DB.E.find(s.eid);
        if (!ev) {
          s.res = 'void';
          dirty = true;
          return;
        }
        if (DB.E.st(ev, now).status !== 'done') return;
        s.res = DB.E.settle(ev, s.mkt, s.out);
        const fin = DB.E.final(ev);
        s.score = fin.h != null ? fin.h + ':' + fin.a : fin.sh + ':' + fin.sa;
        dirty = true;
      });
      if (!dirty) return;
      if (bet.sels.some((s) => s.res === 'lost')) {
        finalize(bet, 'lost', 0);
      } else if (bet.sels.every((s) => s.res)) {
        if (bet.sels.every((s) => s.res === 'void')) finalize(bet, 'void', bet.stake);
        else {
          const odds = bet.sels.reduce((p, s) => p * (s.res === 'won' ? s.odds : 1), 1);
          finalize(bet, 'won', Math.min(S.MAX_WIN, bet.stake * odds * bet.boost));
        }
      }
      if (bet.status !== 'open') changed.push(bet);
    });
    if (changed.length) {
      S.save();
      DB.bus.emit('bets');
    }
    return changed;
  };

  // current cash out offer for an open bet, or 0 if not available
  S.cashoutValue = (bet, now) => {
    if (bet.status !== 'open') return 0;
    let fair = bet.stake * bet.boost;
    for (const s of bet.sels) {
      if (s.res === 'void') continue;
      if (s.res === 'lost') return 0;
      const p = DB.E.winProb(DB.E.find(s.eid), s.mkt, s.out, now);
      if (p === null) return 0;
      if (p === 'void') continue;
      if (p <= 0) return 0;
      fair *= s.odds * p;
    }
    const v = U.floor2(Math.min(bet.pot, fair * S.CASHOUT_MARGIN));
    return v >= 0.01 ? v : 0;
  };

  S.cashout = (betId, now) => {
    const bet = S.data && S.data.bets.find((b) => b.id === betId);
    if (!bet || bet.status !== 'open') return 0;
    const v = S.cashoutValue(bet, now);
    if (!v) return 0;
    finalize(bet, 'cashed', v);
    S.save();
    DB.bus.emit('bets');
    return v;
  };

  S.stats = () => {
    const st = { bets: 0, won: 0, lost: 0, staked: 0, returned: 0 };
    if (!S.data) return st;
    S.data.bets.forEach((b) => {
      st.bets++;
      st.staked += b.stake;
      if (b.status === 'won') st.won++;
      if (b.status === 'lost') st.lost++;
      if (b.status !== 'open') st.returned += b.payout;
    });
    return st;
  };
})();
