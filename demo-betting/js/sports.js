/* Demo Betting — sportsbook views: home, live, upcoming line, event page, results, search. */
'use strict';
(function () {
  const DB = window.DB;
  const U = DB.U;
  const E = DB.E;
  const t = (k, v) => DB.t(k, v);
  const V = (DB.V = DB.V || {});
  const SV = (DB.SV = {});

  /* ================= shared pieces ================= */
  SV.oddBtn = (ev, mkt, out, label, cls) => {
    const sid = ev.id + '|' + mkt + '|' + out;
    const o = E.odds(ev, mkt, out);
    const c = 'odd' + (o == null ? ' lock' : '') + (DB.B && DB.B.has(sid) ? ' on' : '') + (cls ? ' ' + cls : '');
    return (
      '<button type="button" class="' + c + '" data-act="odd" data-sid="' + sid + '" data-o="' + (o || '') + '">' +
      (label != null ? '<span class="lbl">' + U.esc(label) + '</span>' : '') +
      '<span class="v">' + (o == null ? U.icon('lock') : DB.fmtOdds(o)) + '</span></button>'
    );
  };

  // columns of the compact row: [mkt, out, colClass] or { line, cls }
  SV.cols = (ev) => {
    const cfg = E.sport(ev.sport);
    const T = E.mainTotal(ev);
    if (cfg.kind === 'goals' && cfg.threeWay) {
      return [
        ['1x2', '1', 'c-m'], ['1x2', 'X', 'c-m'], ['1x2', '2', 'c-m'],
        ['dc', '1X', 'c-d'], ['dc', '12', 'c-d'], ['dc', 'X2', 'c-d'],
        ['total:' + T, 'over', 'c-t'], { line: T, cls: 'c-t' }, ['total:' + T, 'under', 'c-t'],
      ];
    }
    const H = E.mainHcp(ev);
    const hk = cfg.kind === 'sets' ? 'sets_hcp:' : 'hcp:';
    const tk = cfg.kind === 'sets' ? 'sets_total:' : 'total:';
    return [
      ['ml', '1', 'c-m'], ['ml', '2', 'c-m'],
      [hk + H, '1', 'c-d'], { line: DB.fmtLine(H), cls: 'c-d' }, [hk + H, '2', 'c-d'],
      [tk + T, 'over', 'c-t'], { line: T, cls: 'c-t' }, [tk + T, 'under', 'c-t'],
    ];
  };
  SV.heads = (cfg) => {
    if (cfg.kind === 'goals' && cfg.threeWay) {
      return [['1', 'c-m'], ['X', 'c-m'], ['2', 'c-m'], ['1X', 'c-d'], ['12', 'c-d'], ['X2', 'c-d'], ['O', 'c-t'], [t('total_short'), 'c-t'], ['U', 'c-t']];
    }
    return [['1', 'c-m'], ['2', 'c-m'], ['1', 'c-d'], [t('hcp_short'), 'c-d'], ['2', 'c-d'], ['O', 'c-t'], [t('total_short'), 'c-t'], ['U', 'c-t']];
  };

  const evLink = (ev) => 'href="#event.' + ev.id + '" data-go="event.' + ev.id + '"';

  SV.row = (ev) => {
    const st = E.st(ev);
    const sc = DB.score(ev, st);
    const cells = SV.cols(ev)
      .map((c) => (c.line != null ? '<span class="ln ' + c.cls + '">' + c.line + '</span>' : SV.oddBtn(ev, c[0], c[1], null, c[2])))
      .join('');
    return (
      '<div class="ev' + (st.status === 'live' ? ' is-live' : '') + '">' +
      '<a class="ev-info" ' + evLink(ev) + '>' +
      '<span class="ev-clock" data-clock="' + ev.id + '">' + DB.clockHTML(ev, st) + '</span>' +
      '<span class="ev-team"><span class="nm">' + U.esc(ev.home) + '</span><b class="sc" data-sh="' + ev.id + '">' + (sc ? sc[0] : '') + '</b></span>' +
      '<span class="ev-team"><span class="nm">' + U.esc(ev.away) + '</span><b class="sc" data-sa="' + ev.id + '">' + (sc ? sc[1] : '') + '</b></span>' +
      '</a>' +
      '<div class="ev-odds">' + cells + '</div>' +
      '<a class="ev-more" ' + evLink(ev) + ' aria-label="' + U.esc(t('all_markets')) + '">+' + E.marketCount(ev) + '</a>' +
      '</div>'
    );
  };

  SV.group = (lg, evs) => {
    const cfg = E.sport(lg.sport);
    const heads = SV.heads(cfg).map((h) => '<span class="' + h[1] + '">' + U.esc(h[0]) + '</span>').join('');
    return (
      '<section class="lg">' +
      '<header class="lg-head">' +
      '<span class="lg-title"><span class="lg-ic" aria-hidden="true">' + cfg.icon + '</span><span class="cc">' + lg.cc + '</span><h3>' + U.esc(lg.name) + '</h3></span>' +
      '<span class="lg-cols">' + heads + '</span><span class="lg-sp"></span>' +
      '</header>' +
      evs.map(SV.row).join('') +
      '</section>'
    );
  };

  // group events by league; leagues ordered by sport order, then top/weight
  SV.groups = (evs) => {
    const by = new Map();
    evs.forEach((ev) => {
      if (!by.has(ev.league)) by.set(ev.league, []);
      by.get(ev.league).push(ev);
    });
    const sportIdx = {};
    DB.SPORTS.forEach((s, i) => (sportIdx[s.id] = i));
    const lgs = Array.from(by.keys()).map((id) => E.league(id));
    lgs.sort((a, b) => sportIdx[a.sport] - sportIdx[b.sport] || (b.top ? 1 : 0) - (a.top ? 1 : 0) || (b.w || 1) - (a.w || 1));
    return lgs.map((lg) => SV.group(lg, by.get(lg.id).sort((a, b) => a.start - b.start))).join('');
  };

  SV.sportTabs = (base, active, counts, key) => {
    const total = DB.SPORTS.reduce((n, s) => n + counts[s.id][key], 0);
    let h = '<nav class="chips" aria-label="' + U.esc(t('sports_list')) + '">';
    h += '<a class="chip' + (!active ? ' on' : '') + '" href="#' + base + '" data-go="' + base + '">' + U.esc(t('all')) + ' <b>' + total + '</b></a>';
    DB.SPORTS.forEach((s) => {
      const n = counts[s.id][key];
      if (!n && active !== s.id) return;
      h += '<a class="chip' + (active === s.id ? ' on' : '') + '" href="#' + base + '.' + s.id + '" data-go="' + base + '.' + s.id + '">' +
        '<span aria-hidden="true">' + s.icon + '</span> ' + U.esc(DB.sportName(s.id)) + ' <b>' + n + '</b></a>';
    });
    return h + '</nav>';
  };

  SV.empty = (msg, cta) =>
    '<div class="empty">' + U.icon('clock', 'empty-ic') + '<p>' + U.esc(msg) + '</p>' + (cta || '') + '</div>';

  /* compact card for home carousels */
  SV.card = (ev) => {
    const cfg = E.sport(ev.sport);
    const st = E.st(ev);
    const sc = DB.score(ev, st);
    const lg = E.league(ev.league);
    const odds = cfg.kind === 'goals' && cfg.threeWay
      ? SV.oddBtn(ev, '1x2', '1', '1') + SV.oddBtn(ev, '1x2', 'X', 'X') + SV.oddBtn(ev, '1x2', '2', '2')
      : SV.oddBtn(ev, 'ml', '1', '1') + SV.oddBtn(ev, 'ml', '2', '2');
    return (
      '<article class="cev' + (st.status === 'live' ? ' is-live' : '') + '">' +
      '<a class="cev-top" ' + evLink(ev) + '><span class="cev-lg"><span aria-hidden="true">' + cfg.icon + '</span> ' + U.esc(lg.name) + '</span></a>' +
      '<a class="cev-teams" ' + evLink(ev) + '>' +
      '<span class="cev-clock" data-clock="' + ev.id + '">' + DB.clockHTML(ev, st) + '</span>' +
      '<span class="cev-t"><span class="nm">' + U.esc(ev.home) + '</span><b data-sh="' + ev.id + '">' + (sc ? sc[0] : '') + '</b></span>' +
      '<span class="cev-t"><span class="nm">' + U.esc(ev.away) + '</span><b data-sa="' + ev.id + '">' + (sc ? sc[1] : '') + '</b></span>' +
      '</a>' +
      '<div class="cev-odds n' + (cfg.threeWay && cfg.kind === 'goals' ? 3 : 2) + '">' + odds + '</div>' +
      '</article>'
    );
  };

  SV.casinoTiles = () => {
    const games = [
      ['crash', 'g-crash', '🚀'],
      ['mines', 'g-mines', '💎'],
      ['dice', 'g-dice', '🎲'],
      ['slots', 'g-slots', '🍒'],
    ];
    let h = games
      .map(([id, cls, glyph]) =>
        '<a class="tile ' + cls + '" href="#casino.' + id + '" data-go="casino.' + id + '">' +
        '<span class="tile-glyph" aria-hidden="true">' + glyph + '</span>' +
        '<span class="tile-name">' + U.esc(t('g_' + id)) + '</span>' +
        '<span class="tile-d">' + U.esc(t('g_' + id + '_d')) + '</span></a>'
      )
      .join('');
    h += '<a class="tile g-wheel" href="#promo" data-go="promo"><span class="tile-glyph" aria-hidden="true">🎡</span>' +
      '<span class="tile-name">' + U.esc(t('g_wheel')) + '</span><span class="tile-d">' + U.esc(t('g_wheel_d')) + '</span></a>';
    return '<div class="tiles">' + h + '</div>';
  };

  /* ================= home ================= */
  const sportRank = {};
  DB.SPORTS.forEach((s, i) => (sportRank[s.id] = i));
  function topLive() {
    return E.live().sort((a, b) => sportRank[a.sport] - sportRank[b.sport] || (E.league(b.league).w || 1) - (E.league(a.league).w || 1)).slice(0, 6);
  }
  function topUpcoming() {
    return E.upcoming()
      .filter((ev) => E.league(ev.league).top)
      .sort((a, b) => a.start - b.start)
      .slice(0, 6);
  }
  let heroIdx = 0;
  let heroTimer = null;
  function heroHTML() {
    const logged = !!DB.S.user;
    const slides = [
      ['h1', t('hero1_t'), t('hero1'), logged ? t('hero_cta_dep') : t('hero_cta_reg'), logged ? 'data-act="deposit"' : 'data-act="register"'],
      ['h2', t('hero2_t'), t('hero2'), t('hero_cta_live'), 'data-go="live" href="#live"'],
      ['h3', t('hero3_t'), t('hero3'), t('hero_cta_play'), 'data-go="casino.crash" href="#casino.crash"'],
    ];
    return (
      '<section class="hero" aria-roledescription="carousel">' +
      slides
        .map(([cls, title, text, cta, attr], i) =>
          '<div class="slide ' + cls + (i === heroIdx ? ' on' : '') + '" ' + (i === heroIdx ? '' : 'aria-hidden="true"') + '>' +
          '<div class="slide-art" aria-hidden="true"></div>' +
          '<div class="slide-txt"><h2>' + U.esc(title) + '</h2><p>' + U.esc(text) + '</p>' +
          '<' + (attr.indexOf('href') >= 0 ? 'a' : 'button type="button"') + ' class="btn btn-go" ' + attr + '>' + U.esc(cta) + '</' + (attr.indexOf('href') >= 0 ? 'a' : 'button') + '></div></div>'
        )
        .join('') +
      '<div class="dots">' +
      slides.map((s, i) => '<button type="button" class="dot' + (i === heroIdx ? ' on' : '') + '" data-act="hero" data-i="' + i + '" aria-label="' + (i + 1) + '"></button>').join('') +
      '</div></section>'
    );
  }
  SV.showHero = (i) => {
    heroIdx = i;
    U.$$('.hero .slide').forEach((s, j) => {
      s.classList.toggle('on', j === i);
      if (j === i) s.removeAttribute('aria-hidden');
      else s.setAttribute('aria-hidden', 'true');
    });
    U.$$('.hero .dot').forEach((d, j) => d.classList.toggle('on', j === i));
  };

  V.home = {
    sig() {
      return topLive().map((e) => e.id).join() + '/' + topUpcoming().map((e) => e.id).join();
    },
    render() {
      const live = topLive();
      const up = topUpcoming();
      const strip = (title, icon, route, evs, empty) =>
        '<section class="strip">' +
        '<header class="sec-head"><h2>' + icon + U.esc(title) + '</h2><a href="#' + route + '" data-go="' + route + '" class="more">' + U.esc(t('see_all')) + U.icon('chev') + '</a></header>' +
        (evs.length ? '<div class="cards">' + evs.map(SV.card).join('') + '</div>' : SV.empty(empty)) +
        '</section>';
      return (
        heroHTML() +
        strip(t('top_live'), '<span class="live-dot" aria-hidden="true"></span>', 'live', live, t('no_live')) +
        strip(t('top_upcoming'), U.icon('clock'), 'sports', up, t('no_upcoming')) +
        '<section class="strip"><header class="sec-head"><h2>' + U.icon('cards') + U.esc(t('casino_title')) + '</h2><a href="#casino" data-go="casino" class="more">' + U.esc(t('see_all')) + U.icon('chev') + '</a></header>' +
        SV.casinoTiles() + '</section>'
      );
    },
    mount() {
      clearInterval(heroTimer);
      if (!U.reducedMotion()) heroTimer = setInterval(() => SV.showHero((heroIdx + 1) % 3), 6500);
    },
    unmount() {
      clearInterval(heroTimer);
    },
  };

  /* ================= live & line ================= */
  let lineWindow = 0; // minutes, 0 = all
  V.live = {
    sig(arg) {
      return E.live(arg || null).map((e) => e.id).join();
    },
    render(arg) {
      const sport = E.sport(arg) ? arg : null;
      const evs = E.live(sport);
      return (
        '<header class="page-head"><h1><span class="live-dot" aria-hidden="true"></span>' + U.esc(t('live_now')) + '</h1></header>' +
        SV.sportTabs('live', sport, E.counts(), 'live') +
        (evs.length ? SV.groups(evs) : SV.empty(t('no_live'), '<a class="btn" href="#sports" data-go="sports">' + U.esc(t('upcoming')) + '</a>'))
      );
    },
  };

  function lineEvents(sport) {
    const now = E.now;
    return E.upcoming(sport).filter((ev) => !lineWindow || ev.start - now <= lineWindow * 60000);
  }
  V.sports = {
    sig(arg) {
      return lineWindow + ':' + lineEvents(E.sport(arg) ? arg : null).map((e) => e.id).join();
    },
    render(arg) {
      const sport = E.sport(arg) ? arg : null;
      const evs = lineEvents(sport);
      const win = [0, 15, 30, 60]
        .map((m) => '<button type="button" class="seg' + (lineWindow === m ? ' on' : '') + '" data-act="line-window" data-m="' + m + '">' + U.esc(m ? t('within', { n: m }) : t('all')) + '</button>')
        .join('');
      return (
        '<header class="page-head"><h1>' + (sport ? '<span aria-hidden="true">' + E.sport(sport).icon + '</span> ' + U.esc(DB.sportName(sport)) : U.esc(t('nav_sports'))) + '</h1>' +
        '<div class="segs" role="group">' + win + '</div></header>' +
        SV.sportTabs('sports', sport, E.counts(), 'pre') +
        (evs.length ? SV.groups(evs) : SV.empty(t('no_upcoming')))
      );
    },
  };
  SV.setLineWindow = (m) => {
    lineWindow = m;
  };

  /* ================= single league ================= */
  function leagueEvents(id) {
    return E.events.filter((ev) => ev.league === id && E.st(ev).status !== 'done');
  }
  V.league = {
    sig(id) {
      return leagueEvents(id).map((e) => e.id + E.st(e).status).join();
    },
    render(id) {
      const lg = E.league(id);
      if (!lg) return SV.empty(t('ev_not_found'), '<a class="btn" href="#sports" data-go="sports">' + U.esc(t('back_home')) + '</a>');
      const evs = leagueEvents(id);
      const live = evs.filter((ev) => E.st(ev).status === 'live');
      const pre = evs.filter((ev) => E.st(ev).status === 'pre');
      const cfg = E.sport(lg.sport);
      return (
        '<nav class="crumbs"><a href="#sports.' + lg.sport + '" data-go="sports.' + lg.sport + '"><span aria-hidden="true">' + cfg.icon + '</span> ' + U.esc(DB.sportName(lg.sport)) + '</a>' +
        U.icon('chev') + '<span>' + U.esc(lg.name) + '</span></nav>' +
        '<header class="page-head"><h1><span class="cc">' + lg.cc + '</span> ' + U.esc(lg.name) + '</h1></header>' +
        (live.length ? '<h2 class="sub-h"><span class="live-dot" aria-hidden="true"></span>' + U.esc(t('live_now')) + '</h2>' + SV.group(lg, live) : '') +
        (pre.length ? '<h2 class="sub-h">' + U.icon('clock') + U.esc(t('upcoming')) + '</h2>' + SV.group(lg, pre.sort((a, b) => a.start - b.start)) : '') +
        (!evs.length ? SV.empty(t('no_upcoming')) : '')
      );
    },
  };

  /* ================= search ================= */
  SV.query = '';
  function searchEvents() {
    const q = SV.query.trim().toLowerCase();
    if (q.length < 2) return [];
    return E.events.filter((ev) => {
      if (E.st(ev).status === 'done') return false;
      return (ev.home + ' ' + ev.away + ' ' + E.league(ev.league).name + ' ' + DB.sportName(ev.sport)).toLowerCase().indexOf(q) >= 0;
    });
  }
  V.search = {
    sig() {
      return SV.query + ':' + searchEvents().map((e) => e.id + E.st(e).status).join();
    },
    render() {
      const evs = searchEvents();
      return (
        '<header class="page-head"><h1>' + U.icon('search') + U.esc(t('search_title', { q: SV.query })) + '</h1></header>' +
        (evs.length ? SV.groups(evs) : SV.empty(t('search_none', { q: SV.query })))
      );
    },
  };

  /* ================= results ================= */
  SV.finalText = (ev) => {
    const f = E.final(ev);
    if (f.h != null) return f.h + ':' + f.a;
    return f.sh + ':' + f.sa + ' <span class="sets">(' + ev.sets.map((s) => s.hp + '-' + s.ap).join(', ') + ')</span>';
  };
  V.results = {
    sig(arg) {
      return E.finished(E.sport(arg) ? arg : null).slice(0, 80).map((e) => e.id).join();
    },
    render(arg) {
      const sport = E.sport(arg) ? arg : null;
      const evs = E.finished(sport).slice(0, 80);
      const counts = {};
      DB.SPORTS.forEach((s) => (counts[s.id] = { done: 0 }));
      E.finished().forEach((ev) => counts[ev.sport].done++);
      const rows = evs
        .map((ev) => {
          const cfg = E.sport(ev.sport);
          const lg = E.league(ev.league);
          return (
            '<div class="res-row">' +
            '<span class="res-t">' + U.hm(ev.end) + '</span>' +
            '<span class="res-lg"><span aria-hidden="true">' + cfg.icon + '</span> ' + U.esc(lg.name) + '</span>' +
            '<span class="res-ev">' + U.esc(ev.home) + ' — ' + U.esc(ev.away) + '</span>' +
            '<b class="res-sc">' + SV.finalText(ev) + '</b>' +
            '</div>'
          );
        })
        .join('');
      return (
        '<header class="page-head"><h1>' + U.icon('trophy') + U.esc(t('results_title')) + '</h1></header>' +
        SV.sportTabs('results', sport, counts, 'done') +
        (evs.length ? '<div class="panel res-list">' + rows + '</div>' : SV.empty(t('results_none')))
      );
    },
  };

  /* ================= event page ================= */
  let mktFilter = 'all';
  const collapsed = new Set();
  const famGroup = {
    '1x2': 'main', ml: 'main', dc: 'main', set: 'main', ng: 'score',
    total: 'totals', tt1: 'totals', tt2: 'totals', oe: 'totals', sets_total: 'totals',
    hcp: 'hcp', sets_hcp: 'hcp', btts: 'score', cs: 'score',
  };
  const famCols = { '1x2': 3, dc: 3, ng: 3, cs: 3 };

  function crest(name) {
    const h = U.hash(name) % 360;
    const initials = name
      .replace(/[^A-Za-z0-9 ]/g, '')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase();
    return '<span class="crest" style="--h:' + h + '" aria-hidden="true">' + U.esc(initials) + '</span>';
  }

  SV.extraHTML = (ev, st) => {
    const cfg = E.sport(ev.sport);
    if (st.status === 'pre') return '';
    if (cfg.kind === 'goals') {
      const plen = cfg.dur / cfg.periods;
      const m = st.status === 'done' ? cfg.dur : st.m;
      const cur = Math.min(cfg.periods, Math.floor(m / plen) + 1);
      const per = [];
      for (let p = 1; p <= cfg.periods; p++) {
        if (p > cur) {
          per.push(['–', '–']);
          continue;
        }
        let h = 0;
        let a = 0;
        ev.g.forEach((g) => {
          if (g[0] >= (p - 1) * plen && g[0] < p * plen && g[0] <= m) g[1] ? a++ : h++;
        });
        per.push([h, a]);
      }
      let html =
        '<div class="ptable"><table><caption>' + U.esc(t('periods_title')) + '</caption><thead><tr><th></th>' +
        per.map((x, i) => '<th>' + (i + 1) + '</th>').join('') + '<th>Σ</th></tr></thead><tbody>' +
        '<tr><th>' + U.esc(ev.home) + '</th>' + per.map((x) => '<td>' + x[0] + '</td>').join('') + '<td><b>' + st.h + '</b></td></tr>' +
        '<tr><th>' + U.esc(ev.away) + '</th>' + per.map((x) => '<td>' + x[1] + '</td>').join('') + '<td><b>' + st.a + '</b></td></tr>' +
        '</tbody></table></div>';
      if (cfg.nextGoal) {
        const goals = ev.g.filter((g) => g[0] <= m);
        if (goals.length) {
          html +=
            '<ol class="goals" aria-label="' + U.esc(t('goals_title')) + '">' +
            goals
              .map((g) => '<li class="' + (g[1] ? 'g-a' : 'g-h') + '"><b>' + Math.min(cfg.dur, Math.floor(g[0]) + 1) + "'</b> " + U.esc(g[1] ? ev.away : ev.home) + '</li>')
              .join('') +
            '</ol>';
        }
      }
      return html;
    }
    const w = DB.setWord(ev.sport);
    const n = st.status === 'done' ? ev.sets.length : st.cur;
    const cells = [];
    for (let i = 0; i < n; i++) {
      const s = ev.sets[i];
      if (st.status === 'live' && i === st.cur - 1) cells.push([st.ph, st.pa, true]);
      else cells.push([s.hp, s.ap, false]);
    }
    return (
      '<div class="ptable"><table><caption>' + U.esc(t('sets_title', { w })) + '</caption><thead><tr><th></th>' +
      cells.map((c, i) => '<th' + (c[2] ? ' class="cur"' : '') + '>' + (i + 1) + '</th>').join('') + '<th>Σ</th></tr></thead><tbody>' +
      '<tr><th>' + U.esc(ev.home) + '</th>' + cells.map((c) => '<td' + (c[2] ? ' class="cur"' : '') + '>' + c[0] + '</td>').join('') + '<td><b>' + st.sh + '</b></td></tr>' +
      '<tr><th>' + U.esc(ev.away) + '</th>' + cells.map((c) => '<td' + (c[2] ? ' class="cur"' : '') + '>' + c[1] + '</td>').join('') + '<td><b>' + st.sa + '</b></td></tr>' +
      '</tbody></table></div>'
    );
  };

  // a market whose result is already certain (e.g. Over 0.5 after a goal) is taken off the page
  SV.decided = (m) => m.key !== 'cs' && m.outs.some((o) => o.p > 0.999);

  function marketsHTML(ev, v) {
    const fams = [];
    const byFam = {};
    v.list.filter((m) => !SV.decided(m)).forEach((m) => {
      const f = DB.mktFamily(m.key);
      if (!byFam[f]) {
        byFam[f] = [];
        fams.push(f);
      }
      byFam[f].push(m);
    });
    const show = (f, m) => mktFilter === 'all' || famGroup[f] === mktFilter || (mktFilter === 'main' && m.group === 'main');
    let html = '';
    fams.forEach((f) => {
      const ms = byFam[f].filter((m) => show(f, m));
      if (!ms.length) return;
      const closed = collapsed.has(f);
      const cols = famCols[f] || 2;
      const body = ms
        .map((m) => '<div class="mkt-row c' + cols + '">' + m.outs.map((o) => SV.oddBtn(ev, m.key, o.k, DB.outLabel(m.key, o.k, ev), 'wide')).join('') + '</div>')
        .join('');
      html +=
        '<section class="mkt' + (closed ? ' closed' : '') + '">' +
        '<button type="button" class="mkt-head" data-act="mkt-toggle" data-fam="' + f + '" aria-expanded="' + !closed + '">' +
        '<h3>' + U.esc(DB.mktTitle(ms[0].key, ev)) + '</h3>' + U.icon('chevDown') + '</button>' +
        '<div class="mkt-body">' + body + '</div></section>';
    });
    return html;
  }

  V.event = {
    sig(id) {
      const ev = E.find(id);
      if (!ev) return 'none';
      const v = E.view(ev);
      return v.st.status + ':' + mktFilter + ':' + v.list.filter((m) => !SV.decided(m)).map((m) => m.key).join();
    },
    render(id) {
      const ev = E.find(id);
      if (!ev) return SV.empty(t('ev_not_found'), '<a class="btn" href="#sports" data-go="sports">' + U.esc(t('back_home')) + '</a>');
      const cfg = E.sport(ev.sport);
      const lg = E.league(ev.league);
      const v = E.view(ev);
      const st = v.st;
      const sc = DB.score(ev, st);
      const filters = ['all', 'main', 'totals', 'hcp', 'score']
        .map((f) => '<button type="button" class="seg' + (mktFilter === f ? ' on' : '') + '" data-act="mkt-filter" data-f="' + f + '">' + U.esc(t('f_' + f)) + '</button>')
        .join('');
      const status =
        st.status === 'pre'
          ? '<div class="eh-when">' + U.icon('clock') + U.esc(t('starts_at', { d: U.dt(ev.start) })) + '</div>'
          : '';
      let body;
      if (st.status === 'done') {
        body = '<div class="panel ev-done"><p>' + U.esc(t('ev_finished')) + '</p><p class="final">' + U.esc(t('final_score')) + ': <b>' + SV.finalText(ev) + '</b></p>' +
          '<a class="btn" href="#results" data-go="results">' + U.esc(t('nav_results')) + '</a></div>';
      } else {
        body =
          '<div class="mkt-bar"><div class="segs" role="group" aria-label="' + U.esc(t('markets')) + '">' + filters + '</div>' +
          (v.susp ? '<span class="susp">' + U.icon('lock') + U.esc(t('susp')) + '</span>' : '') + '</div>' +
          '<div class="mkts">' + marketsHTML(ev, v) + '</div>';
      }
      return (
        '<nav class="crumbs"><a href="#sports.' + ev.sport + '" data-go="sports.' + ev.sport + '"><span aria-hidden="true">' + cfg.icon + '</span> ' + U.esc(DB.sportName(ev.sport)) + '</a>' +
        U.icon('chev') + '<span>' + U.esc(lg.name) + '</span></nav>' +
        '<section class="ev-hero sp-' + ev.sport + (st.status === 'live' ? ' is-live' : '') + '">' +
        '<div class="eh-main">' +
        '<div class="eh-team">' + crest(ev.home) + '<span class="nm">' + U.esc(ev.home) + '</span></div>' +
        '<div class="eh-mid">' +
        '<div class="eh-score"><b data-sh="' + ev.id + '">' + (sc ? sc[0] : '–') + '</b><i>:</i><b data-sa="' + ev.id + '">' + (sc ? sc[1] : '–') + '</b></div>' +
        '<div class="eh-clock" data-clock="' + ev.id + '">' + DB.clockHTML(ev, st) + '</div>' + status +
        '</div>' +
        '<div class="eh-team">' + crest(ev.away) + '<span class="nm">' + U.esc(ev.away) + '</span></div>' +
        '</div>' +
        '<div class="eh-extra" data-extra="' + ev.id + '">' + SV.extraHTML(ev, st) + '</div>' +
        '</section>' +
        body
      );
    },
  };
  SV.setFilter = (f) => {
    mktFilter = f;
  };
  SV.toggleFam = (f) => {
    if (collapsed.has(f)) collapsed.delete(f);
    else collapsed.add(f);
  };
})();
