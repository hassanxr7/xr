/* Demo Betting — match simulator and odds engine.
 *
 * Every event is generated with its full outcome up front (a goal timeline, or a list of
 * sets with point totals), and its live state is derived from the clock alone. Odds come
 * from the same model the outcome was drawn from, so the book is fair before the margin:
 *   goals sports  final score = current score + Poisson(lambda * time left)
 *   sets sports   each set won by home with probability p; the set in play is a race
 *                 to the target from the current points
 */
'use strict';
(function () {
  const DB = window.DB;
  const U = DB.U;
  const E = (DB.E = {});

  const SP = {};
  DB.SPORTS.forEach((s) => (SP[s.id] = s));
  const LG = {};
  DB.LEAGUES.forEach((l) => (LG[l.id] = l));
  E.sport = (id) => SP[id];
  E.league = (id) => LG[id];

  const M2 = 0.05; // margin for two-way markets
  const M3 = 0.065; // margin for three-way markets
  const MX = 0.14; // margin for correct score
  const SUSPEND_MS = 4000; // markets pause after a goal or a finished set
  const ODDS_STEP_MS = 3000; // live odds refresh cadence

  /* ================= math ================= */
  function poisson(l) {
    if (!(l > 1e-9)) return [1];
    const max = Math.ceil(l + 8 * Math.sqrt(l) + 8);
    const p = new Array(max + 1);
    p[0] = Math.exp(-l);
    let s = p[0];
    for (let k = 1; k <= max; k++) {
      p[k] = (p[k - 1] * l) / k;
      s += p[k];
    }
    for (let k = 0; k <= max; k++) p[k] /= s;
    return p;
  }
  function samplePoisson(l) {
    const p = poisson(l);
    let u = U.rand();
    let k = 0;
    while (k < p.length - 1 && u > p[k]) {
      u -= p[k];
      k++;
    }
    return k;
  }
  // distribution of X+Y (sign 1) or X-Y (sign -1); index i means value i - off
  function conv(px, py, sign) {
    const n = px.length + py.length - 1;
    const a = new Float64Array(n);
    const off = sign > 0 ? 0 : py.length - 1;
    for (let i = 0; i < px.length; i++) {
      const pi = px[i];
      if (pi < 1e-13) continue;
      for (let j = 0; j < py.length; j++) a[sign > 0 ? i + j : i - j + off] += pi * py[j];
    }
    return { a, off };
  }
  // P(home reaches a more points before away reaches b more), each point won with prob q
  function race(a, b, q) {
    const qa = Math.pow(q, a);
    let s = 0;
    let c = 1;
    for (let j = 0; j < b; j++) {
      if (j > 0) c = (c * (a - 1 + j)) / j;
      s += c * qa * Math.pow(1 - q, j);
    }
    return s;
  }
  const qCache = new Map();
  function pointProb(p, T) {
    const key = p.toFixed(4) + ':' + T;
    if (qCache.has(key)) return qCache.get(key);
    let lo = 0.01;
    let hi = 0.99;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (race(T, T, mid) < p) lo = mid;
      else hi = mid;
    }
    const q = (lo + hi) / 2;
    qCache.set(key, q);
    return q;
  }
  // margin weighted by p(1-p): a balanced n-way market carries the full margin, while
  // near-certain favourites keep a playable price and longshots absorb more of it
  function oddsFrom(p, margin, n) {
    if (!(p > 0)) return null;
    n = n || 2;
    const raw = 1 / (p + (margin * p * (1 - p) * n) / (n - 1));
    if (raw < 1.01 || raw > 251) return null;
    return Math.max(1.01, Math.floor(raw * 100 + 1e-7) / 100);
  }
  E.math = { poisson, conv, race, pointProb, oddsFrom };

  /* ================= event store ================= */
  E.events = [];
  E.byId = new Map();
  let seq = 1000;

  function index() {
    E.byId = new Map();
    E.events.forEach((ev) => E.byId.set(ev.id, ev));
  }
  E.load = () => {
    E.events = U.store.get('db_events', []) || [];
    seq = U.store.get('db_seq', 1000) || 1000;
    E.events = E.events.filter((ev) => ev && ev.id && SP[ev.sport] && LG[ev.league]);
    index();
  };
  E.save = () => {
    U.store.set('db_events', E.events);
    U.store.set('db_seq', seq);
  };
  E.find = (id) => E.byId.get(id);

  /* ================= generation ================= */
  function setTarget(cfg, setNo) {
    return cfg.lastTarget && setNo === cfg.bestOf ? cfg.lastTarget : cfg.target;
  }
  function setScore(cfg, T) {
    if (cfg.id === 'tennis') {
      const r = U.rand();
      if (r < 0.1) return [7, 5];
      if (r < 0.2) return [7, 6];
      return [6, U.randInt(0, 4)];
    }
    if (U.rand() < (cfg.deuce || 0)) {
      const L = U.randInt(T - 1, T + 1);
      return [L + 2, L];
    }
    return [T, U.randInt(Math.floor(T * 0.35), T - 2)];
  }

  function create(cfg, start, busy) {
    const leagues = DB.LEAGUES.filter((l) => l.sport === cfg.id);
    for (let tries = 0; tries < 24; tries++) {
      const lg = U.weighted(leagues, (l) => l.w || 1);
      const free = lg.teams.filter((n) => !busy.has(cfg.id + ':' + n));
      if (free.length < 2) continue;
      const home = U.pick(free);
      const away = U.pick(free.filter((n) => n !== home));
      busy.add(cfg.id + ':' + home);
      busy.add(cfg.id + ':' + away);
      const rate = (name) => 1 - lg.teams.indexOf(name) / Math.max(1, lg.teams.length - 1) + U.uniform(-0.2, 0.2);
      const d = rate(home) - rate(away);
      const ev = { id: 'e' + (seq++).toString(36), sport: cfg.id, league: lg.id, home, away, start: Math.round(start) };
      if (cfg.kind === 'goals') {
        const tot = U.uniform(cfg.total[0], cfg.total[1]);
        const share = U.clamp(0.5 + cfg.adv + cfg.k * d, 0.5 - cfg.cap, 0.5 + cfg.cap);
        ev.lh = Math.round(tot * share * 1000) / 1000;
        ev.la = Math.round(tot * (1 - share) * 1000) / 1000;
        let nh = samplePoisson(ev.lh);
        let na = samplePoisson(ev.la);
        const g = [];
        const t = () => Math.round(U.uniform(0.05, cfg.dur - 0.05) * 100) / 100;
        for (let i = 0; i < nh; i++) g.push([t(), 0]);
        for (let i = 0; i < na; i++) g.push([t(), 1]);
        if (!cfg.threeWay && nh === na) {
          // no draws in two-way sports: decide it late
          g.push([Math.round(U.uniform(cfg.dur - 1.5, cfg.dur - 0.05) * 100) / 100, U.rand() < 0.5 ? 0 : 1]);
        }
        g.sort((x, y) => x[0] - y[0]);
        ev.g = g;
        if (cfg.step) {
          const tm = Math.floor(ev.lh + ev.la) + 0.5;
          ev.tm = tm;
          ev.tl = [tm - 2 * cfg.step, tm - cfg.step, tm, tm + cfg.step, tm + 2 * cfg.step];
          const hm = -Math.floor(ev.lh - ev.la) - 0.5;
          ev.hm = hm;
          ev.hl = [hm - cfg.hcpStep, hm, hm + cfg.hcpStep];
        }
        ev.end = ev.start + Math.round(cfg.realMin * 60000 * U.uniform(0.97, 1.03));
      } else {
        ev.p = Math.round(U.clamp(0.5 + 0.28 * d, 0.12, 0.88) * 1000) / 1000;
        const need = Math.ceil(cfg.bestOf / 2);
        let x = 0;
        let y = 0;
        const sets = [];
        let dur = 0;
        while (x < need && y < need) {
          const w = U.rand() < ev.p ? 0 : 1;
          if (w) y++;
          else x++;
          const [W, L] = setScore(cfg, setTarget(cfg, sets.length + 1));
          const ms = Math.round(cfg.setMin * 60000 * U.uniform(0.8, 1.2));
          dur += ms;
          sets.push({ w, hp: w ? L : W, ap: w ? W : L, d: ms, sd: U.randInt(1, 2e9) });
        }
        ev.sets = sets;
        ev.end = ev.start + dur;
      }
      return ev;
    }
    return null;
  }

  E._create = create; // used by the calibration test

  function expectedRealMs(cfg) {
    if (cfg.kind === 'goals') return cfg.realMin * 60000;
    const need = Math.ceil(cfg.bestOf / 2);
    return (need + 0.6) * cfg.setMin * 60000;
  }

  // Keeps every sport stocked with upcoming/live events and trims old results.
  // keepIds: events referenced by open bets that must not be pruned.
  E.maintain = (now, keepIds) => {
    let changed = false;
    const fresh = E.events.length === 0;
    const busy = new Set();
    E.events.forEach((ev) => {
      if (now < ev.end) busy.add(ev.sport + ':' + ev.home).add(ev.sport + ':' + ev.away);
    });
    DB.SPORTS.forEach((cfg) => {
      let active = E.events.filter((ev) => ev.sport === cfg.id && now < ev.end).length;
      let guard = 0;
      while (active < cfg.n && guard++ < cfg.n * 2) {
        const start = fresh
          ? now + U.uniform(-0.85 * expectedRealMs(cfg), cfg.win * 60000)
          : now + U.uniform(0.6, cfg.win) * 60000;
        const ev = create(cfg, start, busy);
        if (!ev) break;
        E.events.push(ev);
        active++;
        changed = true;
      }
    });
    // prune finished events: keep 2h of results (max 120) plus anything an open bet needs
    const done = E.events.filter((ev) => now >= ev.end).sort((a, b) => b.end - a.end);
    const drop = new Set();
    done.forEach((ev, i) => {
      if (keepIds && keepIds.has(ev.id)) return;
      if (i >= 120 || now - ev.end > 2 * 3600e3) drop.add(ev.id);
    });
    if (drop.size) {
      E.events = E.events.filter((ev) => !drop.has(ev.id));
      changed = true;
    }
    if (changed) {
      E.events.sort((a, b) => a.start - b.start);
      index();
      E.save();
    }
    return changed;
  };

  /* ================= live state ================= */
  const seqCache = new Map();
  function pointSeq(s, T) {
    let seqArr = seqCache.get(s.sd);
    if (seqArr) return seqArr;
    const rnd = U.seeded(s.sd);
    const W = s.w ? s.ap : s.hp;
    const L = s.w ? s.hp : s.ap;
    const w = s.w;
    const l = 1 - s.w;
    const arr = [];
    const shuffle = (a) => {
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        const t = a[i];
        a[i] = a[j];
        a[j] = t;
      }
      return a;
    };
    if (L >= T - 1) {
      // went past the target: level at T-1, trade points, then the winner closes it out
      const base = [];
      for (let i = 0; i < T - 1; i++) base.push(w, l);
      arr.push(...shuffle(base));
      for (let i = 0; i < L - (T - 1); i++) arr.push(...(rnd() < 0.5 ? [w, l] : [l, w]));
      for (let i = 0; i < W - L; i++) arr.push(w);
    } else {
      const base = [];
      for (let i = 0; i < W - 1; i++) base.push(w);
      for (let i = 0; i < L; i++) base.push(l);
      arr.push(...shuffle(base), w);
    }
    seqCache.set(s.sd, arr);
    if (seqCache.size > 600) seqCache.delete(seqCache.keys().next().value);
    return arr;
  }

  // state: { status: 'pre'|'live'|'done', ... }
  E.state = (ev, now) => {
    const cfg = SP[ev.sport];
    if (now < ev.start) return { status: 'pre', h: 0, a: 0, sh: 0, sa: 0 };
    if (cfg.kind === 'goals') {
      const done = now >= ev.end;
      const msPerMin = (ev.end - ev.start) / cfg.dur;
      const m = done ? cfg.dur : (now - ev.start) / msPerMin;
      let h = 0;
      let a = 0;
      let last = -1;
      for (const g of ev.g) {
        if (g[0] > m) break;
        if (g[1]) a++;
        else h++;
        last = g[0];
      }
      // pause markets briefly after a goal, but not in sports that score every few seconds
      const susp = !!cfg.nextGoal && !done && last >= 0 && (m - last) * msPerMin < SUSPEND_MS;
      return { status: done ? 'done' : 'live', m, h, a, susp, lastGoal: last };
    }
    let t = ev.start;
    let sh = 0;
    let sa = 0;
    for (let i = 0; i < ev.sets.length; i++) {
      const s = ev.sets[i];
      if (now >= t + s.d) {
        if (s.w) sa++;
        else sh++;
        t += s.d;
        continue;
      }
      const T = setTarget(cfg, i + 1);
      const f = (now - t) / s.d;
      const sq = pointSeq(s, T);
      const k = Math.min(sq.length - 1, Math.floor(f * sq.length));
      let ph = 0;
      let pa = 0;
      for (let j = 0; j < k; j++) {
        if (sq[j]) pa++;
        else ph++;
      }
      return { status: 'live', sh, sa, cur: i + 1, ph, pa, f, T, susp: i > 0 && now - t < SUSPEND_MS };
    }
    return { status: 'done', sh, sa, cur: ev.sets.length };
  };

  E.final = (ev) => {
    if (SP[ev.sport].kind === 'goals') {
      let h = 0;
      let a = 0;
      ev.g.forEach((g) => (g[1] ? a++ : h++));
      return { h, a };
    }
    let sh = 0;
    let sa = 0;
    ev.sets.forEach((s) => (s.w ? sa++ : sh++));
    return { sh, sa };
  };

  /* ================= markets ================= */
  function mk(key, group, outs, margin) {
    return { key, group, outs: outs.map(([k, p]) => ({ k, p: U.clamp(p, 0, 1), o: oddsFrom(p, margin, outs.length) })) };
  }

  function goalsMarkets(ev, st) {
    const cfg = SP[ev.sport];
    const r = st.status === 'pre' ? 1 : Math.max(0, (cfg.dur - st.m) / cfg.dur);
    const lh = ev.lh * r;
    const la = ev.la * r;
    const px = poisson(lh);
    const py = poisson(la);
    const gh = st.h;
    const ga = st.a;
    const dd = conv(px, py, -1);
    const tt = conv(px, py, 1);
    const base = gh - ga;
    const tbase = gh + ga;
    const PD = (pred) => {
      let s = 0;
      for (let i = 0; i < dd.a.length; i++) if (dd.a[i] && pred(i - dd.off + base)) s += dd.a[i];
      return s;
    };
    const PT = (pred) => {
      let s = 0;
      for (let i = 0; i < tt.a.length; i++) if (tt.a[i] && pred(i + tbase)) s += tt.a[i];
      return s;
    };
    const list = [];
    const pH = PD((d) => d > 0);
    const pX = PD((d) => d === 0);
    const pA = Math.max(0, 1 - pH - pX);
    if (cfg.threeWay) {
      list.push(mk('1x2', 'main', [['1', pH], ['X', pX], ['2', pA]], M3));
      list.push(mk('dc', 'main', [['1X', pH + pX], ['12', pH + pA], ['X2', pX + pA]], M3));
    } else {
      list.push(mk('ml', 'main', [['1', pH + pX / 2], ['2', pA + pX / 2]], M2));
    }
    const mainT = E.mainTotal(ev);
    (ev.tl || cfg.lines).forEach((L) => {
      const po = PT((t) => t > L);
      list.push(mk('total:' + L, L === mainT ? 'main' : 'totals', [['over', po], ['under', 1 - po]], M2));
    });
    const mainH = ev.hm;
    (ev.hl || cfg.hcp).forEach((L) => {
      const p1 = PD((d) => d + L > 0);
      list.push(mk('hcp:' + L, L === mainH ? 'main' : 'hcp', [['1', p1], ['2', 1 - p1]], M2));
    });
    if (cfg.nextGoal && st.status !== 'done') {
      const k = gh + ga + 1;
      const lt = lh + la;
      const p0 = Math.exp(-lt);
      const ph = (ev.lh / (ev.lh + ev.la)) * (1 - p0);
      list.push(mk('ng:' + k, 'score', [['1', ph], ['none', p0], ['2', Math.max(0, 1 - p0 - ph)]], M3));
    }
    if (cfg.btts) {
      const h0 = gh > 0 ? 0 : px[0];
      const a0 = ga > 0 ? 0 : py[0];
      const yes = (1 - h0) * (1 - a0);
      list.push(mk('btts', 'score', [['yes', yes], ['no', 1 - yes]], M2));
    }
    if (cfg.teamLines) {
      const tail = (arr, from) => {
        let s = 0;
        for (let i = Math.max(0, from); i < arr.length; i++) s += arr[i];
        return s;
      };
      cfg.teamLines.forEach((L) => {
        const p = tail(px, Math.floor(L - gh) + 1);
        list.push(mk('tt1:' + L, 'totals', [['over', p], ['under', 1 - p]], M2));
      });
      cfg.teamLines.forEach((L) => {
        const p = tail(py, Math.floor(L - ga) + 1);
        list.push(mk('tt2:' + L, 'totals', [['over', p], ['under', 1 - p]], M2));
      });
    }
    const odd = PT((t) => t % 2 === 1);
    list.push(mk('oe', 'totals', [['odd', odd], ['even', 1 - odd]], M2));
    if (cfg.cs) {
      const outs = [];
      let sum = 0;
      for (let i = 0; i <= cfg.cs; i++) {
        for (let j = 0; j <= cfg.cs; j++) {
          const p = i >= gh && j >= ga && i - gh < px.length && j - ga < py.length ? px[i - gh] * py[j - ga] : 0;
          sum += p;
          outs.push([i + '-' + j, p]);
        }
      }
      outs.push(['other', Math.max(0, 1 - sum)]);
      list.push(mk('cs', 'score', outs, MX));
    }
    return list;
  }

  function setsMarkets(ev, st) {
    const cfg = SP[ev.sport];
    const need = Math.ceil(cfg.bestOf / 2);
    const p = ev.p;
    let pc = p;
    if (st.status === 'live') {
      const T = st.T;
      const q = pointProb(p, T);
      pc = race(Math.max(1, T - st.ph), Math.max(1, T - st.pa), q);
    }
    // distribution of the final set score
    const fin = {};
    let cur = new Map([[st.sh + ':' + st.sa, 1]]);
    let first = true;
    while (cur.size) {
      const next = new Map();
      const q = first ? pc : p;
      first = false;
      cur.forEach((pr, key) => {
        const [x, y] = key.split(':').map(Number);
        [[x + 1, y, q], [x, y + 1, 1 - q]].forEach(([nx, ny, pq]) => {
          const v = pr * pq;
          if (nx === need || ny === need) fin[nx + '-' + ny] = (fin[nx + '-' + ny] || 0) + v;
          else next.set(nx + ':' + ny, (next.get(nx + ':' + ny) || 0) + v);
        });
      });
      cur = next;
    }
    const P = (pred) => {
      let s = 0;
      Object.keys(fin).forEach((k) => {
        const [x, y] = k.split('-').map(Number);
        if (pred(x, y)) s += fin[k];
      });
      return s;
    };
    const list = [];
    const pw = P((x, y) => x > y);
    list.push(mk('ml', 'main', [['1', pw], ['2', 1 - pw]], M2));
    const setNo = st.status === 'live' ? st.cur : 1;
    list.push(mk('set:' + setNo, 'main', [['1', pc], ['2', 1 - pc]], M2));
    const mainT = E.mainTotal(ev);
    const totals = cfg.bestOf === 3 ? [2.5] : [3.5, 4.5];
    totals.forEach((L) => {
      const po = P((x, y) => x + y > L);
      list.push(mk('sets_total:' + L, L === mainT ? 'main' : 'totals', [['over', po], ['under', 1 - po]], M2));
    });
    const hcps = cfg.bestOf === 3 ? [-1.5, 1.5] : [-1.5, 1.5, -2.5, 2.5];
    hcps.forEach((L) => {
      const p1 = P((x, y) => x - y + L > 0);
      list.push(mk('sets_hcp:' + L, L === -1.5 ? 'main' : 'hcp', [['1', p1], ['2', 1 - p1]], M2));
    });
    const scores = [];
    for (let l = 0; l < need; l++) scores.push(need + '-' + l);
    for (let l = need - 1; l >= 0; l--) scores.push(l + '-' + need);
    list.push(mk('cs', 'score', scores.map((s) => [s, fin[s] || 0]), MX));
    return list;
  }

  E.mainTotal = (ev) => {
    const cfg = SP[ev.sport];
    if (cfg.kind === 'sets') return cfg.bestOf === 3 ? 2.5 : 3.5;
    return ev.tm != null ? ev.tm : cfg.main;
  };
  E.mainHcp = (ev) => {
    const cfg = SP[ev.sport];
    if (cfg.kind === 'sets') return -1.5;
    return ev.hm != null ? ev.hm : null;
  };

  /* ================= cached view of an event at a moment ================= */
  E.now = Date.now();
  const tickStates = new Map();
  const mcache = new Map();

  E.tick = (now) => {
    E.now = now;
    tickStates.clear();
  };
  E.st = (ev, now) => {
    if (now == null || now === E.now) {
      let s = tickStates.get(ev.id);
      if (!s) {
        s = E.state(ev, E.now);
        tickStates.set(ev.id, s);
      }
      return s;
    }
    return E.state(ev, now);
  };

  // returns { st, list, map, susp }
  E.view = (ev, now) => {
    now = now == null ? E.now : now;
    const st = E.st(ev, now);
    if (st.status === 'done') return { st, list: [], map: {}, susp: true };
    const scoreSig = SP[ev.sport].kind === 'goals' ? st.h + ':' + st.a : st.sh + ':' + st.sa + ':' + (st.ph || 0) + ':' + (st.pa || 0);
    const off = U.hash(ev.id) % ODDS_STEP_MS;
    const key = st.status === 'pre' ? 'pre' : Math.floor((now + off) / ODDS_STEP_MS) + '|' + scoreSig;
    let c = mcache.get(ev.id);
    if (!c || c.key !== key) {
      const list = SP[ev.sport].kind === 'goals' ? goalsMarkets(ev, st) : setsMarkets(ev, st);
      const map = {};
      list.forEach((m) => (map[m.key] = m));
      c = { key, list, map };
      mcache.set(ev.id, c);
      if (mcache.size > 400) mcache.delete(mcache.keys().next().value);
    }
    return { st, list: c.list, map: c.map, susp: !!st.susp };
  };

  // current decimal odds of a selection, or null if it cannot be bet on right now
  E.odds = (ev, mkt, out, now) => {
    if (!ev) return null;
    const v = E.view(ev, now);
    if (v.susp) return null;
    const m = v.map[mkt];
    if (!m) return null;
    const o = m.outs.find((x) => x.k === out);
    return o ? o.o : null;
  };

  E.sidParts = (sid) => {
    const i = sid.indexOf('|');
    const j = sid.lastIndexOf('|');
    return { eid: sid.slice(0, i), mkt: sid.slice(i + 1, j), out: sid.slice(j + 1) };
  };

  /* ================= settlement ================= */
  // 'won' | 'lost' | 'void' once decidable, otherwise null
  E.settle = (ev, mkt, out) => {
    const cfg = SP[ev.sport];
    const [name, arg] = mkt.split(':');
    const L = arg != null ? parseFloat(arg) : null;
    const r = E.final(ev);
    const res = (ok) => (ok ? 'won' : 'lost');
    if (cfg.kind === 'goals') {
      const { h, a } = r;
      switch (name) {
        case '1x2':
          return res(out === (h > a ? '1' : h === a ? 'X' : '2'));
        case 'ml':
          return res(out === (h > a ? '1' : '2'));
        case 'dc':
          return res((out === '1X' && h >= a) || (out === '12' && h !== a) || (out === 'X2' && h <= a));
        case 'total':
          return res((out === 'over') === h + a > L);
        case 'hcp':
          return res((out === '1') === h - a + L > 0);
        case 'btts':
          return res((out === 'yes') === (h > 0 && a > 0));
        case 'tt1':
          return res((out === 'over') === h > L);
        case 'tt2':
          return res((out === 'over') === a > L);
        case 'oe':
          return res((out === 'odd') === ((h + a) % 2 === 1));
        case 'cs': {
          const key = h <= cfg.cs && a <= cfg.cs ? h + '-' + a : 'other';
          return res(out === key);
        }
        case 'ng': {
          const g = ev.g[Math.round(L) - 1];
          const who = g ? (g[1] ? '2' : '1') : 'none';
          return res(out === who);
        }
      }
      return 'void';
    }
    const { sh, sa } = r;
    switch (name) {
      case 'ml':
        return res(out === (sh > sa ? '1' : '2'));
      case 'sets_total':
        return res((out === 'over') === sh + sa > L);
      case 'sets_hcp':
        return res((out === '1') === sh - sa + L > 0);
      case 'cs':
        return res(out === sh + '-' + sa);
      case 'set': {
        const s = ev.sets[Math.round(L) - 1];
        if (!s) return 'void';
        return res(out === (s.w ? '2' : '1'));
      }
    }
    return 'void';
  };

  // probability that a selection wins, used for cash out. null = not available right now.
  E.winProb = (ev, mkt, out, now) => {
    if (!ev) return null;
    const st = E.st(ev, now);
    if (st.status === 'done') {
      const r = E.settle(ev, mkt, out);
      return r === 'won' ? 1 : r === 'void' ? 'void' : 0;
    }
    if (st.susp) return null;
    const [name, arg] = mkt.split(':');
    if (name === 'ng' && st.h + st.a >= Number(arg)) {
      const g = ev.g[Number(arg) - 1];
      return out === (g[1] ? '2' : '1') ? 1 : 0;
    }
    if (name === 'set' && st.status === 'live' && Number(arg) < st.cur) {
      return out === (ev.sets[Number(arg) - 1].w ? '2' : '1') ? 1 : 0;
    }
    const v = E.view(ev, now);
    const m = v.map[mkt];
    if (!m) return null;
    const o = m.outs.find((x) => x.k === out);
    return o ? o.p : null;
  };

  /* ================= queries ================= */
  E.list = (filter) => E.events.filter(filter);
  E.live = (sport) => E.events.filter((ev) => (!sport || ev.sport === sport) && E.st(ev).status === 'live');
  E.upcoming = (sport) => E.events.filter((ev) => (!sport || ev.sport === sport) && E.st(ev).status === 'pre');
  E.finished = (sport) =>
    E.events.filter((ev) => (!sport || ev.sport === sport) && E.st(ev).status === 'done').sort((a, b) => b.end - a.end);
  E.counts = () => {
    const c = {};
    DB.SPORTS.forEach((s) => (c[s.id] = { live: 0, pre: 0 }));
    E.events.forEach((ev) => {
      const s = E.st(ev).status;
      if (s === 'live') c[ev.sport].live++;
      else if (s === 'pre') c[ev.sport].pre++;
    });
    return c;
  };
  E.marketCount = (ev) => {
    const v = E.view(ev);
    return v.list.reduce((n, m) => n + m.outs.length, 0);
  };
})();
