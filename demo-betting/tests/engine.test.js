/* Engine + settlement checks. Run with: node demo-betting/tests/engine.test.js
 * - every market's probabilities sum to 1 (double chance to 2)
 * - predicted probabilities match simulated outcomes (calibration)
 * - placed bets settle exactly as E.settle says, with correct payouts
 * - slot paytable RTP matches the advertised figure
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const dir = path.join(__dirname, '..', 'js');
const ctx = {
  console, Intl, Math, Date, JSON, Map, Set, Float64Array, Uint32Array, performance,
  crypto: require('crypto').webcrypto,
  document: { querySelector: () => null, querySelectorAll: () => [] },
};
ctx.window = ctx;
vm.createContext(ctx);
for (const f of ['util.js', 'data.js', 'engine.js', 'i18n.js', 'store.js', 'sports.js', 'casino.js']) {
  vm.runInContext(fs.readFileSync(path.join(dir, f), 'utf8'), ctx, { filename: f });
}
const { E, S, U, CS } = ctx.DB;
const now = Date.now();
let passed = 0;
const ok = (name) => {
  passed++;
  console.log('  ✓ ' + name);
};

// 1. probability sums
E.tick(now);
E.maintain(now, new Set());
for (const ev of E.events) {
  const v = E.view(ev, now);
  for (const m of v.list) {
    const s = m.outs.reduce((a, o) => a + o.p, 0);
    assert(Math.abs(s - (m.key === 'dc' ? 2 : 1)) < 1e-3, `${ev.sport} ${m.key} sums to ${s}`);
    m.outs.forEach((o) => assert(o.o == null || o.o * o.p < 1, `${m.key} odds beat the true price`));
  }
}
ok('market probabilities sum to 1 and every price carries a margin');

// 2. calibration per sport
for (const cfg of ctx.DB.SPORTS) {
  const bins = Array.from({ length: 5 }, () => [0, 0, 0]);
  const N = cfg.kind === 'goals' && !cfg.cs ? 250 : 700;
  for (let i = 0; i < N; i++) {
    const ev = E._create(cfg, now, new Set());
    for (const f of [-0.01, 0.4, 0.8]) {
      const t = ev.start + (ev.end - ev.start) * f;
      if (E.state(ev, t).susp) continue;
      for (const m of E.view(ev, t).list) {
        const o = m.outs[0];
        if (o.p < 0.01 || o.p > 0.99) continue;
        const b = Math.min(4, Math.floor(o.p * 5));
        bins[b][0] += o.p;
        bins[b][1] += E.settle(ev, m.key, o.k) === 'won' ? 1 : 0;
        bins[b][2]++;
      }
    }
  }
  bins.forEach(([p, w, n]) => {
    if (n < 300) return;
    assert(Math.abs(p / n - w / n) < 0.07, `${cfg.id} calibration off: predicted ${(p / n).toFixed(3)}, actual ${(w / n).toFixed(3)}`);
  });
}
ok('predicted probabilities match simulated results for all sports');

// 3. settlement
assert.strictEqual(S.register('tester', 'pass1234'), null);
assert.strictEqual(S.balance(), S.WELCOME_BONUS);
let placed = 0;
for (const ev of E.events.filter((e) => E.state(e, now).status !== 'done').slice(0, 25)) {
  const v = E.view(ev, now);
  for (const m of v.list) {
    for (const o of m.outs) {
      if (!o.o) continue;
      S.placeBet('single', [{ eid: ev.id, mkt: m.key, out: o.k, odds: o.o, sport: ev.sport, home: ev.home, away: ev.away, league: ev.league, start: ev.start }], 1);
      placed++;
    }
  }
}
assert.strictEqual(S.openBets().length, placed, 'open bets must never be trimmed from history');
S.openBets().forEach((b) => assert(S.cashoutValue(b, now) <= b.pot + 1e-9, 'cash out above potential win'));
const later = now + 3 * 3600e3;
E.tick(later);
E.maintain(later, S.openEventIds());
S.settleAll(later);
assert.strictEqual(S.openBets().length, 0, 'all bets settled');
S.data.bets.forEach((b) => {
  const s = b.sels[0];
  const r = E.settle(E.find(s.eid), s.mkt, s.out);
  assert.strictEqual(b.status, r, `bet ${b.id} ${s.mkt}/${s.out}`);
  if (r === 'won') assert(Math.abs(b.payout - U.round2(b.stake * s.odds)) < 0.011, 'payout');
});
ok(`${placed} single bets settled with correct results and payouts`);

// 4. slots RTP
const W = CS.SLOT_SYMBOLS.reduce((a, s) => a + s.w, 0);
const pc = CS.SLOT_SYMBOLS[0].w / W;
let rtp = pc * pc * (1 - pc);
CS.SLOT_SYMBOLS.forEach((s) => (rtp += Math.pow(s.w / W, 3) * s.pay));
assert(Math.abs(rtp - 0.946) < 0.001, 'slots RTP ' + rtp);
ok('slots RTP is 94.6%');

console.log(`\n${passed} checks passed`);
