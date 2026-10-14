/* Demo Betting — casino lobby and instant games: Crash, Mines, Dice, Fruit Slots. */
'use strict';
(function () {
  const DB = window.DB;
  const U = DB.U;
  const S = DB.S;
  const t = (k, v) => DB.t(k, v);
  const V = (DB.V = DB.V || {});
  const CS = (DB.CS = {});

  const loginGate = () => {
    if (S.user) return true;
    DB.A.openAuth('register');
    U.toast(t('need_login'), 'warn');
    return false;
  };
  const takeStake = (v, game) => {
    const stake = U.parseAmount(v);
    if (!(stake >= S.MIN_STAKE)) {
      U.toast(t('err_min', { n: S.MIN_STAKE }), 'warn');
      return 0;
    }
    if (stake > S.MAX_STAKE) {
      U.toast(t('err_max', { n: U.money(S.MAX_STAKE) }), 'warn');
      return 0;
    }
    if (!S.canAfford(stake)) {
      U.toast(t('need_coins'), 'warn');
      return 0;
    }
    S.adjust(-stake, 'casino_bet', game);
    return stake;
  };
  const stakeField = (id, value) =>
    '<label for="' + id + '">' + U.esc(t('bet_amount')) + '</label>' +
    '<div class="stake-box"><input id="' + id + '" class="inp" type="text" inputmode="decimal" autocomplete="off" value="' + U.esc(value) + '">' +
    '<button type="button" class="seg" data-act="stake-half" data-for="' + id + '">½</button>' +
    '<button type="button" class="seg" data-act="stake-double" data-for="' + id + '">2×</button></div>';
  CS.stakeAdjust = (id, f) => {
    const inp = document.getElementById(id);
    if (!inp) return;
    inp.value = String(U.clamp(U.round2(U.parseAmount(inp.value) * f), S.MIN_STAKE, S.MAX_STAKE));
    inp.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const gameHead = (id, note) =>
    '<nav class="crumbs"><a href="#casino" data-go="casino">' + U.icon('cards') + U.esc(t('nav_casino')) + '</a>' + U.icon('chev') + '<span>' + U.esc(t('g_' + id)) + '</span></nav>' +
    '<header class="page-head"><h1>' + U.esc(t('g_' + id)) + '</h1><span class="pill">' + U.esc(note) + '</span></header>';

  /* ================= Crash ================= */
  const K = 0.00007; // multiplier = e^(K * ms)
  const WAIT = 7000;
  const AFTER = 3000;
  let round = U.store.get('db_crash_round', null);
  let hist = (U.store.get('db_crash_hist', []) || []).filter((h) => h && h.id); // [{ id, x }] newest first
  let crashStake = '10';
  let crashAuto = '';
  let raf = 0;
  let lastMsg = '';

  function newRound(start) {
    const u = U.rand();
    const x = U.clamp(Math.floor((0.97 / (1 - u)) * 100) / 100, 1, 1000);
    const flyAt = start + WAIT;
    return { id: 'r' + Math.round(start).toString(36), flyAt, crash: x, crashAt: flyAt + Math.log(x) / K };
  }
  function settleCrashBet(r) {
    const b = S.data && S.data.crash;
    if (!b || b.round !== r.id || b.status !== 'active') return;
    if (r.crash == null) {
      // round result no longer known (very old bet): give the stake back
      b.status = 'void';
      S.adjust(b.stake, 'refund', 'crash');
      return;
    }
    if (b.auto && b.auto <= r.crash) {
      b.status = 'cashed';
      b.x = b.auto;
      b.win = U.floor2(b.stake * b.auto);
      S.adjust(b.win, 'casino_win', 'crash');
      lastMsg = t('crash_won', { x: b.auto.toFixed(2) + '×', v: U.money(b.win - b.stake) });
    } else {
      b.status = 'lost';
      S.save();
      lastMsg = t('crash_lost');
    }
  }
  function ensureRound(now) {
    let changed = false;
    if (!round) {
      round = newRound(now);
      changed = true;
    }
    while (now >= round.crashAt + AFTER) {
      settleCrashBet(round);
      hist.unshift({ id: round.id, x: round.crash });
      if (hist.length > 24) hist.length = 24;
      const startNext = now - (round.crashAt + AFTER) > 60000 ? now : round.crashAt + AFTER;
      round = newRound(startNext);
      changed = true;
    }
    if (changed) {
      U.store.set('db_crash_round', round);
      U.store.set('db_crash_hist', hist);
    }
  }
  function phase(now) {
    if (now < round.flyAt) return 'wait';
    if (now < round.crashAt) return 'fly';
    return 'crashed';
  }
  const mult = (now) => Math.exp(K * Math.max(0, now - round.flyAt));

  CS.crashTick = (now) => {
    ensureRound(now);
    const b = S.data && S.data.crash;
    if (!b) return;
    const ph = phase(now);
    if (b.round === 'next' && ph === 'wait') {
      b.round = round.id;
      S.save();
    }
    if (b.round === round.id && b.status === 'active') {
      if (b.auto && b.auto <= round.crash && now >= round.flyAt + Math.log(b.auto) / K) settleCrashBet(round);
      else if (now >= round.crashAt) settleCrashBet(round);
    } else if (b.status === 'active' && b.round !== 'next') {
      const old = hist.find((h) => h.id === b.round);
      settleCrashBet({ id: b.round, crash: old ? old.x : null });
    }
  };

  CS.crashBet = () => {
    if (!loginGate()) return;
    const now = Date.now();
    CS.crashTick(now);
    const b = S.data.crash;
    if (b && (b.status === 'active' || b.round === 'next')) return;
    const stake = takeStake(crashStake, 'crash');
    if (!stake) return;
    const auto = U.parseAmount(crashAuto);
    S.data.crash = { round: phase(now) === 'wait' ? round.id : 'next', stake, auto: auto >= 1.01 ? auto : null, status: 'active' };
    S.save();
    lastMsg = '';
    renderCrashControls();
  };
  CS.crashCancel = () => {
    const b = S.data && S.data.crash;
    if (!b || b.status !== 'active') return;
    const now = Date.now();
    if (b.round === 'next' || (b.round === round.id && phase(now) === 'wait')) {
      S.adjust(b.stake, 'refund', 'crash');
      S.data.crash = null;
      S.save();
      renderCrashControls();
    }
  };
  CS.crashCash = () => {
    const now = Date.now();
    CS.crashTick(now);
    const b = S.data && S.data.crash;
    if (!b || b.status !== 'active' || b.round !== round.id || phase(now) !== 'fly') return;
    const x = Math.floor(mult(now) * 100) / 100;
    b.status = 'cashed';
    b.x = x;
    b.win = U.floor2(b.stake * x);
    S.adjust(b.win, 'casino_win', 'crash');
    lastMsg = t('crash_won', { x: x.toFixed(2) + '×', v: U.money(b.win - b.stake) });
    U.toast(lastMsg, 'ok');
    renderCrashControls();
  };

  function crashBtnState(now) {
    const b = S.user && S.data.crash;
    const ph = phase(now);
    if (b && b.status === 'active') {
      if (b.round === 'next') return { key: 'queued', html: '<button type="button" class="btn btn-block" data-act="crash-cancel">' + U.esc(t('crash_queued')) + ' · ' + U.esc(t('crash_cancel')) + '</button>' };
      if (b.round === round.id && ph === 'wait') return { key: 'placed', html: '<button type="button" class="btn btn-block" data-act="crash-cancel">' + U.esc(t('crash_cancel')) + ' · ' + U.money(b.stake) + '</button>' };
      if (b.round === round.id && ph === 'fly') {
        const v = U.floor2(b.stake * Math.floor(mult(now) * 100) / 100);
        return { key: 'cash', html: '<button type="button" class="btn btn-warn btn-block btn-xl" data-act="crash-cash">' + U.esc(t('crash_cash', { v: '' })) + '<b data-crash-cash>' + U.money(v) + '</b></button>' };
      }
    }
    const label = ph === 'wait' ? t('crash_bet_btn', { v: U.money(U.parseAmount(crashStake)) }) : t('crash_next');
    return { key: 'bet:' + ph + ':' + crashStake, html: '<button type="button" class="btn btn-go btn-block btn-xl" data-act="crash-bet">' + U.esc(label) + '</button>' };
  }
  function renderCrashControls() {
    const box = U.$('[data-crash-btn]');
    if (!box) return;
    const now = Date.now();
    const s = crashBtnState(now);
    if (box.dataset.key !== s.key) {
      box.dataset.key = s.key;
      box.innerHTML = s.html;
    } else if (s.key === 'cash') {
      const b = S.data.crash;
      const el = box.querySelector('[data-crash-cash]');
      if (el) el.textContent = U.money(U.floor2(b.stake * Math.floor(mult(now) * 100) / 100));
    }
    const msg = U.$('[data-crash-msg]');
    if (msg && msg.textContent !== lastMsg) msg.textContent = lastMsg;
    const h = U.$('[data-crash-hist]');
    if (h) {
      const key = hist.slice(0, 16).map((r) => r.id).join();
      if (h.dataset.key !== key) {
        h.dataset.key = key;
        h.innerHTML = hist
          .slice(0, 16)
          .map((r) => '<span class="hx ' + (r.x >= 10 ? 'hx-hi' : r.x >= 2 ? 'hx-mid' : 'hx-lo') + '">' + r.x.toFixed(2) + '×</span>')
          .join('');
      }
    }
  }

  let colors = null;
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    const g = (n) => cs.getPropertyValue(n).trim();
    colors = { fg: g('--fg'), muted: g('--muted'), line: g('--line'), accent: g('--go'), down: g('--down'), gold: g('--gold'), panel: g('--panel-2') };
  }
  function drawCrash(now) {
    const cv = U.$('#crash-cv');
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    const w = cv.clientWidth;
    const h = cv.clientHeight;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!colors) readColors();
    const ph = phase(now);
    const big = U.$('[data-crash-x]');
    const sub = U.$('[data-crash-sub]');
    const padL = 44;
    const padB = 26;
    const padT = 16;
    const padR = 16;
    if (ph === 'wait') {
      const left = (round.flyAt - now) / WAIT;
      if (big) {
        big.textContent = '1.00×';
        big.className = 'cx-big wait';
      }
      if (sub) sub.textContent = t('crash_wait', { s: ((round.flyAt - now) / 1000).toFixed(1) });
      ctx.fillStyle = colors.line;
      ctx.fillRect(padL, h / 2 + 50, w - padL - padR, 6);
      ctx.fillStyle = colors.accent;
      ctx.fillRect(padL, h / 2 + 50, (w - padL - padR) * left, 6);
      return;
    }
    const tEnd = ph === 'fly' ? now - round.flyAt : round.crashAt - round.flyAt;
    const m = Math.exp(K * tEnd);
    const xMax = Math.max(8000, tEnd * 1.2);
    const yMax = Math.max(2, 1 + (m - 1) * 1.25);
    const X = (tt) => padL + (tt / xMax) * (w - padL - padR);
    const Y = (mm) => h - padB - ((mm - 1) / (yMax - 1)) * (h - padB - padT);
    // grid
    ctx.strokeStyle = colors.line;
    ctx.fillStyle = colors.muted;
    ctx.lineWidth = 1;
    ctx.font = '11px ' + getComputedStyle(document.body).fontFamily;
    const ySteps = [0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];
    const ys = ySteps.find((s) => (yMax - 1) / s <= 5) || 1000;
    for (let v = 1; v <= yMax; v += ys) {
      const y = Math.round(Y(v)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(w - padR, y);
      ctx.stroke();
      ctx.fillText(v.toFixed(v < 10 && ys < 1 ? 1 : 0) + '×', 6, y + 4);
    }
    const xs = xMax > 40000 ? 10000 : xMax > 16000 ? 5000 : 2000;
    for (let s = 0; s <= xMax; s += xs) ctx.fillText(Math.round(s / 1000) + 's', X(s) - 6, h - 8);
    // curve
    const pts = [];
    const N = 60;
    for (let i = 0; i <= N; i++) {
      const tt = (tEnd * i) / N;
      pts.push([X(tt), Y(Math.exp(K * tt))]);
    }
    const col = ph === 'fly' ? colors.accent : colors.down;
    const grad = ctx.createLinearGradient(0, padT, 0, h - padB);
    grad.addColorStop(0, col);
    grad.addColorStop(1, 'transparent');
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], h - padB);
    pts.forEach((p) => ctx.lineTo(p[0], p[1]));
    ctx.lineTo(pts[N][0], h - padB);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = col;
    ctx.lineWidth = 3;
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.stroke();
    if (ph === 'fly') {
      ctx.font = '26px serif';
      ctx.fillText('🚀', pts[N][0] - 6, pts[N][1] - 4);
    }
    if (big) {
      big.textContent = m.toFixed(2) + '×';
      big.className = 'cx-big ' + (ph === 'fly' ? 'fly' : 'crashed');
    }
    if (sub) sub.textContent = ph === 'fly' ? t('crash_fly') : t('crash_crashed', { x: round.crash.toFixed(2) + '×' });
  }
  function crashLoop() {
    const now = Date.now();
    CS.crashTick(now);
    drawCrash(now);
    renderCrashControls();
    raf = requestAnimationFrame(crashLoop);
  }

  const games = {};
  games.crash = {
    render() {
      CS.crashTick(Date.now());
      return (
        gameHead('crash', t('rtp', { n: 97 })) +
        '<div class="game crash">' +
        '<div class="crash-stage panel"><canvas id="crash-cv" aria-hidden="true"></canvas>' +
        '<div class="cx-over"><div class="cx-big" data-crash-x>1.00×</div><div class="cx-sub" data-crash-sub></div></div></div>' +
        '<div class="game-ctl panel form">' +
        stakeField('crash-stake', crashStake) +
        '<label for="crash-auto">' + U.esc(t('crash_auto')) + '</label>' +
        '<input id="crash-auto" class="inp" type="text" inputmode="decimal" autocomplete="off" placeholder="' + U.esc(t('crash_auto_off')) + ' · 2.00" value="' + U.esc(crashAuto) + '">' +
        '<div data-crash-btn></div>' +
        '<p class="game-msg" data-crash-msg aria-live="polite"></p>' +
        '<h3 class="mini-h">' + U.esc(t('crash_history')) + '</h3><div class="hist" data-crash-hist></div>' +
        '</div></div>'
      );
    },
    mount() {
      readColors();
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(crashLoop);
    },
    unmount() {
      cancelAnimationFrame(raf);
    },
    input(el) {
      if (el.id === 'crash-stake') crashStake = el.value;
      if (el.id === 'crash-auto') crashAuto = el.value;
    },
  };

  /* ================= Mines ================= */
  const TILES = 25;
  let minesStake = '10';
  let minesCount = 3;
  const minesMult = (k, n) => {
    let m = 0.97;
    for (let i = 0; i < k; i++) m *= (TILES - i) / (TILES - n - i);
    return m;
  };
  const mg = () => S.user && S.data.mines;

  CS.minesStart = () => {
    if (!loginGate()) return;
    const g = mg();
    if (g && !g.over) return;
    const stake = takeStake(minesStake, 'mines');
    if (!stake) return;
    const idx = Array.from({ length: TILES }, (_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) {
      const j = Math.floor(U.rand() * (i + 1));
      const x = idx[i];
      idx[i] = idx[j];
      idx[j] = x;
    }
    S.data.mines = { stake, n: minesCount, mines: idx.slice(0, minesCount), open: [], over: false, win: 0 };
    S.save();
    renderMines();
  };
  CS.minesPick = (i) => {
    const g = mg();
    if (!g || g.over || g.open.indexOf(i) >= 0) return;
    if (g.mines.indexOf(i) >= 0) {
      g.over = true;
      g.boom = i;
      S.save();
      U.toast(t('mines_boom'), 'warn');
    } else {
      g.open.push(i);
      S.save();
      if (g.open.length === TILES - g.n) return CS.minesCash();
    }
    renderMines();
  };
  CS.minesCash = () => {
    const g = mg();
    if (!g || g.over || !g.open.length) return;
    g.over = true;
    g.win = U.floor2(g.stake * minesMult(g.open.length, g.n));
    S.adjust(g.win, 'casino_win', 'mines');
    U.toast(t('mines_win', { v: U.money(g.win) }), 'ok');
    renderMines();
  };
  CS.setMinesCount = (n) => {
    minesCount = U.clamp(n, 1, 24);
  };

  function minesGridHTML() {
    const g = mg();
    let h = '';
    for (let i = 0; i < TILES; i++) {
      let cls = 'mt';
      let glyph = '';
      if (g) {
        const isMine = g.mines.indexOf(i) >= 0;
        const opened = g.open.indexOf(i) >= 0;
        if (opened) {
          cls += ' gem';
          glyph = '💎';
        } else if (g.over && isMine) {
          cls += ' mine' + (g.boom === i ? ' boom' : '');
          glyph = '💣';
        } else if (g.over) {
          cls += ' dim';
          glyph = '💎';
        }
      }
      const live = g && !g.over;
      h += '<button type="button" class="' + cls + '" data-act="mines-pick" data-i="' + i + '"' + (live && !glyph ? '' : ' disabled') + ' aria-label="' + (i + 1) + '">' + glyph + '</button>';
    }
    return h;
  }
  function minesCtlHTML() {
    const g = mg();
    const live = g && !g.over;
    let h = stakeField('mines-stake', minesStake);
    h +=
      '<label for="mines-n">' + U.esc(t('mines_count')) + '</label><select id="mines-n" class="inp" ' + (live ? 'disabled' : '') + '>' +
      [1, 2, 3, 5, 8, 10, 15, 20, 24].map((n) => '<option value="' + n + '"' + (n === minesCount ? ' selected' : '') + '>' + n + '</option>').join('') +
      '</select>';
    if (live) {
      const k = g.open.length;
      const cur = minesMult(k, g.n);
      const next = minesMult(k + 1, g.n);
      h += '<div class="kv"><span>' + U.esc(t('dice_mult')) + '</span><b>' + cur.toFixed(2) + '×</b></div>';
      h += '<div class="kv"><span>' + U.esc(t('mines_next', { x: '' })) + '</span><b>' + next.toFixed(2) + '×</b></div>';
      h += k
        ? '<button type="button" class="btn btn-warn btn-block btn-xl" data-act="mines-cash">' + U.esc(t('mines_cash', { v: U.money(U.floor2(g.stake * cur)) })) + '</button>'
        : '<p class="game-msg">' + U.esc(t('mines_pick')) + '</p>';
    } else {
      h += '<button type="button" class="btn btn-go btn-block btn-xl" data-act="mines-start">' + U.esc(t('mines_start')) + '</button>';
      if (g && g.over) h += '<p class="game-msg">' + U.esc(g.win ? t('mines_win', { v: U.money(g.win) }) : t('mines_boom')) + '</p>';
    }
    return h;
  }
  function renderMines() {
    const grid = U.$('[data-mines-grid]');
    const ctl = U.$('[data-mines-ctl]');
    if (grid) grid.innerHTML = minesGridHTML();
    if (ctl) ctl.innerHTML = minesCtlHTML();
  }
  games.mines = {
    render() {
      return (
        gameHead('mines', t('house_edge', { n: 3 })) +
        '<div class="game mines"><div class="mines-grid panel" data-mines-grid>' + minesGridHTML() + '</div>' +
        '<div class="game-ctl panel form" data-mines-ctl>' + minesCtlHTML() + '</div></div>'
      );
    },
    input(el) {
      if (el.id === 'mines-stake') minesStake = el.value;
    },
    change(el) {
      if (el.id === 'mines-n') CS.setMinesCount(parseInt(el.value, 10));
    },
  };

  /* ================= Dice ================= */
  let diceStake = '10';
  let diceTarget = 50;
  let diceMode = 'under';
  const diceHist = [];
  let rolling = false;
  const diceChance = () => (diceMode === 'under' ? diceTarget : 100 - diceTarget);
  const diceMult = () => Math.floor((99 / diceChance()) * 10000) / 10000;

  function diceInfo() {
    const set = (sel, v) => {
      const el = U.$(sel);
      if (el) el.textContent = v;
    };
    set('[data-dice-chance]', diceChance().toFixed(2) + '%');
    set('[data-dice-mult]', diceMult().toFixed(4) + '×');
    set('[data-dice-target]', (diceMode === 'under' ? '< ' : '≥ ') + diceTarget.toFixed(2));
    const track = U.$('.dice-track');
    if (track) {
      track.style.setProperty('--p', diceTarget + '%');
      track.classList.toggle('over', diceMode === 'over');
    }
  }
  CS.diceRoll = () => {
    if (rolling || !loginGate()) return;
    const stake = takeStake(diceStake, 'dice');
    if (!stake) return;
    const roll = Math.floor(U.rand() * 10000) / 100;
    const win = diceMode === 'under' ? roll < diceTarget : roll >= diceTarget;
    const payout = win ? U.floor2(stake * diceMult()) : 0;
    rolling = true;
    const out = U.$('[data-dice-out]');
    const marker = U.$('.dice-mark');
    const finish = () => {
      rolling = false;
      if (out) {
        out.textContent = roll.toFixed(2);
        out.className = 'dice-out ' + (win ? 'win' : 'lose');
      }
      if (marker) {
        marker.style.left = roll + '%';
        marker.hidden = false;
      }
      if (payout) S.adjust(payout, 'casino_win', 'dice');
      diceHist.unshift([roll, win]);
      if (diceHist.length > 14) diceHist.length = 14;
      const h = U.$('[data-dice-hist]');
      if (h) h.innerHTML = diceHist.map((x) => '<span class="hx ' + (x[1] ? 'hx-mid' : 'hx-lo') + '">' + x[0].toFixed(2) + '</span>').join('');
      const msg = U.$('[data-dice-msg]');
      if (msg) msg.textContent = win ? t('dice_win', { r: roll.toFixed(2), v: U.money(payout - stake) }) : t('dice_lose', { r: roll.toFixed(2) });
    };
    if (U.reducedMotion() || !out) return finish();
    const t0 = performance.now();
    const spin = (now) => {
      if (now - t0 > 450) return finish();
      out.textContent = (U.rand() * 100).toFixed(2);
      out.className = 'dice-out';
      requestAnimationFrame(spin);
    };
    requestAnimationFrame(spin);
  };
  CS.diceMode = (m) => {
    diceMode = m;
    U.$$('[data-act="dice-mode"]').forEach((b) => b.classList.toggle('on', b.dataset.m === m));
    diceInfo();
  };
  games.dice = {
    render() {
      return (
        gameHead('dice', t('house_edge', { n: 1 })) +
        '<div class="game dice">' +
        '<div class="dice-stage panel">' +
        '<div class="dice-out" data-dice-out>50.00</div>' +
        '<div class="dice-track' + (diceMode === 'over' ? ' over' : '') + '" style="--p:' + diceTarget + '%"><span class="dice-mark" hidden></span></div>' +
        '<label class="sr" for="dice-range">' + U.esc(t('dice_target')) + '</label>' +
        '<input id="dice-range" class="range" type="range" min="2" max="98" step="1" value="' + diceTarget + '">' +
        '<div class="dice-scale"><span>0</span><span>25</span><span>50</span><span>75</span><span>100</span></div>' +
        '<div class="dice-info"><div><span>' + U.esc(t('dice_target')) + '</span><b data-dice-target></b></div>' +
        '<div><span>' + U.esc(t('dice_chance')) + '</span><b data-dice-chance></b></div>' +
        '<div><span>' + U.esc(t('dice_mult')) + '</span><b data-dice-mult></b></div></div>' +
        '</div>' +
        '<div class="game-ctl panel form">' +
        '<div class="segs" role="group">' +
        '<button type="button" class="seg' + (diceMode === 'under' ? ' on' : '') + '" data-act="dice-mode" data-m="under">' + U.esc(t('dice_under')) + '</button>' +
        '<button type="button" class="seg' + (diceMode === 'over' ? ' on' : '') + '" data-act="dice-mode" data-m="over">' + U.esc(t('dice_over')) + '</button></div>' +
        stakeField('dice-stake', diceStake) +
        '<button type="button" class="btn btn-go btn-block btn-xl" data-act="dice-roll">' + U.esc(t('dice_roll')) + '</button>' +
        '<p class="game-msg" data-dice-msg aria-live="polite"></p>' +
        '<div class="hist" data-dice-hist>' + diceHist.map((x) => '<span class="hx ' + (x[1] ? 'hx-mid' : 'hx-lo') + '">' + x[0].toFixed(2) + '</span>').join('') + '</div>' +
        '</div></div>'
      );
    },
    mount() {
      diceInfo();
    },
    input(el) {
      if (el.id === 'dice-stake') diceStake = el.value;
      if (el.id === 'dice-range') {
        diceTarget = parseInt(el.value, 10);
        diceInfo();
      }
    },
  };

  /* ================= Fruit Slots ================= */
  // independent weighted cells, 5 lines; RTP = sum(w^3 * pay) + P(cherry, cherry, other) ≈ 94.6%
  const SYM = [
    { g: '🍒', w: 30, pay: 9 },
    { g: '🍋', w: 25, pay: 15 },
    { g: '🍇', w: 18, pay: 30 },
    { g: '🔔', w: 12, pay: 60 },
    { g: '⭐', w: 9, pay: 100 },
    { g: '7', w: 6, pay: 250, cls: 'seven' },
  ];
  const LINES = [[0, 0, 0], [1, 1, 1], [2, 2, 2], [0, 1, 2], [2, 1, 0]];
  CS.SLOT_SYMBOLS = SYM;
  CS.SLOT_LINES = LINES;
  let slotStake = '10';
  let slotSpinning = false;
  let slotGrid = [[0, 1, 2], [3, 0, 4], [1, 5, 0]]; // [reel][row]
  const drawSym = () => U.weighted(SYM.map((s, i) => i), (i) => SYM[i].w);
  const symHTML = (i) => '<span class="sym' + (SYM[i].cls ? ' ' + SYM[i].cls : '') + '">' + SYM[i].g + '</span>';

  CS.slotEval = (grid, lineBet) => {
    let win = 0;
    const cells = [];
    LINES.forEach((ln) => {
      const a = grid[0][ln[0]];
      const b = grid[1][ln[1]];
      const c = grid[2][ln[2]];
      if (a === b && b === c) {
        win += lineBet * SYM[a].pay;
        cells.push([0, ln[0]], [1, ln[1]], [2, ln[2]]);
      } else if (a === 0 && b === 0) {
        win += lineBet;
        cells.push([0, ln[0]], [1, ln[1]]);
      }
    });
    return { win: U.floor2(win), cells };
  };

  CS.slotSpin = () => {
    if (slotSpinning || !loginGate()) return;
    const stake = takeStake(slotStake, 'slots');
    if (!stake) return;
    slotSpinning = true;
    const grid = [0, 1, 2].map(() => [drawSym(), drawSym(), drawSym()]);
    const res = CS.slotEval(grid, stake / LINES.length);
    const reels = U.$$('.reel-strip');
    const btn = U.$('[data-act="slot-spin"]');
    if (btn) btn.disabled = true;
    U.$$('.reel .win').forEach((el) => el.classList.remove('win'));
    const msg = U.$('[data-slot-msg]');
    if (msg) msg.textContent = '';
    const reduce = U.reducedMotion() || !reels.length;
    const STRIP = 16;
    reels.forEach((strip, r) => {
      const fill = [];
      for (let i = 0; i < STRIP; i++) fill.push(drawSym());
      const all = slotGrid[r].concat(fill, grid[r]);
      strip.style.transition = 'none';
      strip.style.transform = 'translateY(0)';
      strip.innerHTML = all.map((s) => '<div class="cell">' + symHTML(s) + '</div>').join('');
      void strip.offsetHeight;
      const pct = ((all.length - 3) / all.length) * 100;
      strip.style.transition = reduce ? 'none' : 'transform ' + (900 + r * 350) + 'ms cubic-bezier(.2,.8,.25,1)';
      strip.style.transform = 'translateY(-' + pct + '%)';
    });
    setTimeout(() => {
      slotGrid = grid;
      reels.forEach((strip, r) => {
        strip.style.transition = 'none';
        strip.style.transform = 'translateY(0)';
        strip.innerHTML = grid[r].map((s) => '<div class="cell">' + symHTML(s) + '</div>').join('');
      });
      res.cells.forEach(([r, row]) => {
        const cell = reels[r] && reels[r].children[row];
        if (cell) cell.classList.add('win');
      });
      if (res.win) S.adjust(res.win, 'casino_win', 'slots');
      if (msg) msg.textContent = res.win ? t('slots_win', { v: U.money(res.win) }) : '';
      slotSpinning = false;
      if (btn) btn.disabled = false;
    }, reduce ? 30 : 900 + 2 * 350 + 120);
  };

  games.slots = {
    render() {
      const reels = [0, 1, 2]
        .map((r) => '<div class="reel"><div class="reel-strip">' + slotGrid[r].map((s) => '<div class="cell">' + symHTML(s) + '</div>').join('') + '</div></div>')
        .join('');
      const pay = SYM.slice()
        .reverse()
        .map((s, i) => '<li><span>' + symHTML(SYM.length - 1 - i).repeat(3) + '</span><b>' + s.pay + '×</b></li>')
        .join('');
      return (
        gameHead('slots', t('rtp', { n: 94.6 })) +
        '<div class="game slots">' +
        '<div class="slot-stage panel"><div class="reels">' + reels + '</div><p class="slot-msg" data-slot-msg aria-live="polite"></p></div>' +
        '<div class="game-ctl panel form">' +
        stakeField('slot-stake', slotStake) +
        '<p class="fine">' + U.esc(t('slots_lines')) + '</p>' +
        '<button type="button" class="btn btn-go btn-block btn-xl" data-act="slot-spin">' + U.esc(t('slots_spin')) + '</button>' +
        '<h3 class="mini-h">' + U.esc(t('slots_pay')) + '</h3><ul class="paytable">' + pay +
        '<li><span>' + symHTML(0).repeat(2) + '</span><b>1×</b></li></ul>' +
        '<p class="fine">' + U.esc(t('slots_two_cherry')) + ' = 1×</p>' +
        '</div></div>'
      );
    },
    input(el) {
      if (el.id === 'slot-stake') slotStake = el.value;
    },
  };

  /* ================= lobby + routing ================= */
  let active = null;
  V.casino = {
    sig(arg) {
      return (games[arg] ? arg : 'lobby') + ':' + S.settings.lang + ':' + (S.user ? S.user.name : '');
    },
    render(arg) {
      if (games[arg]) return games[arg].render();
      return (
        '<header class="page-head"><h1>' + U.icon('cards') + U.esc(t('casino_title')) + '</h1><span class="pill">' + U.esc(t('casino_sub')) + '</span></header>' +
        DB.SV.casinoTiles()
      );
    },
    mount(arg) {
      active = games[arg] || null;
      if (active && active.mount) active.mount();
    },
    unmount() {
      if (active && active.unmount) active.unmount();
      active = null;
    },
    input(el) {
      if (active && active.input) active.input(el);
    },
    change(el) {
      if (active && active.change) active.change(el);
    },
  };
})();
