// Commission ledger. Append-only: every change is a delta row, so history is never rewritten.
//   earned_delta  -> accrual-basis commission EXPENSE (recognised once, when the service/repair is recognised)
//   payable_delta -> liability that has become payable as customer payments are collected (proportional release)
// A payout settles payable rows (settled_payout_id) and is NOT an expense. Refunds post negative deltas.
import { AppError, bad, notFound } from './errors.js';
import { ApprovalNeeded, registerApproval } from './core.js';
import { mulBp, int, divRound, allocate } from './money.js';
import { nowIso } from './time.js';
import { applyPayment, method } from './payments.js';

function post(ctx, br, r) {
  ctx.run(`INSERT INTO commission_ledger(org_id,branch_id,employee_id,source_type,source_id,sale_id,type,base,rate_bp,earned_delta,payable_delta,note,created_at,business_date) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ctx.org_id, br.id, r.employee_id, r.source_type, r.source_id, r.sale_id ?? null, r.type, r.base ?? 0, r.rate_bp ?? 0, r.earned, r.payable, r.note || null, nowIso(), ctx.today(br));
}
function current(ctx, st, sid) { return ctx.get('SELECT COALESCE(SUM(earned_delta),0) e, COALESCE(SUM(payable_delta),0) p, COUNT(*) n FROM commission_ledger WHERE source_type=? AND source_id=? AND org_id=?', st, sid, ctx.org_id); }
function reconcileTo(ctx, br, src, targetE, targetP, reason) {
  const c = current(ctx, src.source_type, src.source_id); const dE = targetE - c.e, dP = targetP - c.p;
  if (dE || dP) post(ctx, br, { ...src, type: c.n === 0 ? 'accrual' : reason, earned: dE, payable: dP });
}
export function syncSaleCommission(ctx, saleId, reason = 'adjustment') {
  const s = ctx.get('SELECT * FROM sales WHERE id=?', saleId); const lines = ctx.all('SELECT * FROM sale_lines WHERE sale_id=? AND commission_bp>0 AND barber_id IS NOT NULL', saleId);
  if (!lines.length) return;
  const br = ctx.get('SELECT * FROM branches WHERE id=?', s.branch_id);
  const totalEff = s.status === 'void' ? 0 : s.total - s.returned_total; const paid = Math.max(s.paid, 0);
  for (const l of lines) {
    const base = s.status === 'void' ? 0 : l.net - l.returned_net; const eT = mulBp(base, l.commission_bp);
    const pT = totalEff <= 0 ? 0 : paid >= totalEff ? eT : Math.floor((eT * paid) / totalEff);
    reconcileTo(ctx, br, { employee_id: l.barber_id, source_type: 'sale_line', source_id: l.id, sale_id: saleId, base, rate_bp: l.commission_bp }, eT, pT, s.status === 'void' ? 'void' : reason === 'payment' ? 'payment_release' : reason);
  }
}
export function syncRepairCommission(ctx, jobId, reason = 'adjustment') {
  const j = ctx.get('SELECT * FROM repair_jobs WHERE id=?', jobId); if (!j.technician_id || !j.tech_commission_bp) return;
  const br = ctx.get('SELECT * FROM branches WHERE id=?', j.branch_id);
  const t = ctx.get(`SELECT COALESCE(SUM(qty*unit_price),0) total, COALESCE(SUM(CASE WHEN kind='labor' THEN qty*unit_price ELSE 0 END),0) labor FROM repair_charges WHERE job_id=? AND approved=1 AND voided=0`, jobId);
  const paid = ctx.get(`SELECT COALESCE(SUM(CASE direction WHEN 'in' THEN amount ELSE -amount END),0) n FROM payments WHERE org_id=? AND party_type='repair' AND party_id=? AND status='confirmed'`, ctx.org_id, jobId).n;
  const recognised = ['completed', 'delivered'].includes(j.status); const eT = recognised ? mulBp(t.labor, j.tech_commission_bp) : 0;
  const pT = !recognised || t.total <= 0 ? 0 : paid >= t.total ? eT : Math.max(0, Math.floor((eT * paid) / t.total));
  reconcileTo(ctx, br, { employee_id: j.technician_id, source_type: 'repair', source_id: jobId, base: t.labor, rate_bp: j.tech_commission_bp }, eT, pT, reason === 'payment' ? 'payment_release' : reason);
}

export function balance(ctx, employeeId, branchId) {
  const w = branchId ? 'AND branch_id=?' : ''; const a = branchId ? [ctx.org_id, employeeId, branchId] : [ctx.org_id, employeeId];
  return ctx.get(`SELECT COALESCE(SUM(earned_delta),0) earned, COALESCE(SUM(payable_delta),0) payable_total, COALESCE(SUM(CASE WHEN settled_payout_id IS NULL THEN payable_delta ELSE 0 END),0) outstanding FROM commission_ledger WHERE org_id=? AND employee_id=? ${w}`, ...a);
}
function staffInBranch(ctx, employeeId, br) {
  const u = ctx.get('SELECT u.*, r.scope FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=? AND u.org_id=? AND u.active=1', employeeId, ctx.org_id); if (!u) throw notFound('employee');
  if (u.scope !== 'org' && !ctx.get('SELECT 1 x FROM user_branches WHERE user_id=? AND branch_id=?', u.id, br.id)) throw bad('not_assigned', 'Employee is not assigned to this branch'); return u;
}
// Authorised deduction (e.g. damaged equipment): reduces what is payable to the employee; no cash moves. Appears in reports and the next payout.
export function recordDeduction(ctx, d) {
  ctx.need('payouts.create'); const br = ctx.branch(d.branch_id);
  return ctx.tx(() => {
    ctx.guardDay(br); const u = staffInBranch(ctx, d.employee_id, br); const amount = int(d.amount, 'amount', { min: 1 }); if (!d.reason) throw bad('reason_required', 'A reason is required for a deduction');
    const lid = ctx.run(`INSERT INTO commission_ledger(org_id,branch_id,employee_id,source_type,source_id,type,earned_delta,payable_delta,note,created_at,business_date) VALUES(?,?,?,'deduction',0,'deduction',0,?,?,?,?)`, ctx.org_id, br.id, u.id, -amount, d.reason, nowIso(), ctx.today(br)).lastInsertRowid;
    ctx.run('UPDATE commission_ledger SET source_id=id WHERE id=?', lid); ctx.audit('commission.deduction', 'ledger', lid, null, { employee_id: u.id, amount, reason: d.reason }, br.id); return { id: lid };
  });
}
export function recordAdvance(ctx, a) {
  ctx.need('payouts.create'); const br = ctx.branch(a.branch_id);
  return ctx.tx(() => {
    ctx.guardDay(br); const u = staffInBranch(ctx, a.employee_id, br); const amount = int(a.amount, 'amount', { min: 1 });
    const lid = ctx.run(`INSERT INTO commission_ledger(org_id,branch_id,employee_id,source_type,source_id,type,earned_delta,payable_delta,note,created_at,business_date) VALUES(?,?,?,?,0,'advance',0,?,?,?,?)`, ctx.org_id, br.id, u.id, 'advance', -amount, a.note || 'Advance', nowIso(), ctx.today(br)).lastInsertRowid;
    ctx.run('UPDATE commission_ledger SET source_id=id WHERE id=?', lid);
    const pid = applyPayment(ctx, br, { direction: 'out', party_type: 'payout', party_id: lid, method_id: a.method_id, amount, note: 'Advance to ' + u.name });
    ctx.audit('commission.advance', 'ledger', lid, null, { employee_id: u.id, amount }, br.id); return { id: lid, payment_id: pid };
  });
}
// Settlement: marks every eligible unsettled payable row as settled by this payout (so nothing can be paid twice).
export function createPayout(ctx, p, opts = {}) {
  ctx.need('payouts.create'); const br = ctx.branch(p.branch_id);
  const u = staffInBranch(ctx, p.employee_id, br);
  const deductions = int(p.deductions ?? 0, 'deductions', { min: 0 }); const paidReq = int(p.amount_paid ?? 0, 'amount_paid', { min: 0 });
  if (deductions && !p.deduction_note) throw bad('deduction_note_required', 'Explain the deduction');
  if (!opts.approvedBy && !ctx.limitOk('payout_max', paidReq)) throw new ApprovalNeeded('payout', br.id, paidReq, `Commission payout ${paidReq} to ${u.name} at ${br.name}`, p);
  return ctx.tx(() => {
    ctx.guardDay(br);
    const to = p.period_to || '9999-12-31';
    const rows = ctx.all('SELECT * FROM commission_ledger WHERE org_id=? AND employee_id=? AND branch_id=? AND settled_payout_id IS NULL AND payable_delta<>0 AND business_date<=?', ctx.org_id, u.id, br.id, to);
    if (!rows.length) throw new AppError(409, 'nothing_to_settle', 'No unsettled commission for this employee in the period');
    const sum = (f) => rows.filter(f).reduce((s, r) => s + r.payable_delta, 0);
    const payable = sum(() => true); const previous = sum((r) => r.type === 'carry'); const advances = -sum((r) => r.type === 'advance'); const ledgerDed = -sum((r) => r.type === 'deduction');
    const earned = rows.filter((r) => !['carry', 'advance', 'deduction'].includes(r.type)).reduce((s, r) => s + r.earned_delta, 0);
    const netDue = payable - deductions;
    if (paidReq > Math.max(netDue, 0)) throw new AppError(409, 'overpayment', 'Amount paid exceeds the net commission due', { net_due: netDue });
    const remaining = netDue - paidReq;
    const id = ctx.run(`INSERT INTO commission_payouts(org_id,branch_id,employee_id,ref,period_from,period_to,earned,payable,advances,deductions,ledger_deductions,previous_balance,net_due,amount_paid,remaining,method_id,note,status,processed_by,approved_by,created_at,business_date)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, ctx.org_id, br.id, u.id, ctx.ref('CPO', br), p.period_from || null, p.period_to || null, earned, payable, advances, deductions, ledgerDed, previous, netDue, paidReq, remaining,
    p.method_id || null, [p.note, p.deduction_note].filter(Boolean).join(' | ') || null, 'paid', ctx.user.id, opts.approvedBy || ctx.user.id, nowIso(), ctx.today(br)).lastInsertRowid;
    for (const r of rows) {
      const ch = ctx.run('UPDATE commission_ledger SET settled_payout_id=? WHERE id=? AND settled_payout_id IS NULL', id, r.id);
      if (ch.changes !== 1) throw new AppError(409, 'already_settled', 'Commission entry was already settled');
    }
    if (paidReq > 0) { method(ctx, p.method_id); const pay = applyPayment(ctx, br, { direction: 'out', party_type: 'payout', party_id: id, method_id: p.method_id, amount: paidReq, note: 'Commission payout ' + u.name }); ctx.run('UPDATE commission_payouts SET payment_id=? WHERE id=?', pay, id); }
    if (remaining !== 0) ctx.run(`INSERT INTO commission_ledger(org_id,branch_id,employee_id,source_type,source_id,type,earned_delta,payable_delta,note,created_at,business_date) VALUES(?,?,?,'carry',?,'carry',0,?,?,?,?)`, ctx.org_id, br.id, u.id, id, remaining, 'Carried from ' + id, nowIso(), ctx.today(br));
    ctx.audit('payout.create', 'payout', id, null, { employee_id: u.id, payable, deductions, paid: paidReq, remaining }, br.id);
    return { id, payable, net_due: netDue, amount_paid: paidReq, remaining };
  });
}
registerApproval('payout', { limitKey: 'payout_max', valueOf: (p) => Number(p.amount_paid || 0), perm: 'payouts.approve' }, (rctx, p, o) => createPayout(rctx, p, o));

export function listPayouts(ctx, { employee_id, branch_id } = {}) {
  ctx.need('commissions.view'); const b = ctx.inBranches('p.branch_id'); const w = ['p.org_id=?', b.sql]; const a = [ctx.org_id];
  if (!ctx.can('commissions.viewall')) { w.push('p.employee_id=?'); a.push(ctx.user.id); } else if (employee_id) { w.push('p.employee_id=?'); a.push(Number(employee_id)); }
  if (branch_id) { ctx.branch(branch_id); w.push('p.branch_id=?'); a.push(Number(branch_id)); }
  return { rows: ctx.all(`SELECT p.*, e.name employee_name, pr.name processed_name, ap.name approved_name FROM commission_payouts p JOIN users e ON e.id=p.employee_id LEFT JOIN users pr ON pr.id=p.processed_by LEFT JOIN users ap ON ap.id=p.approved_by WHERE ${w.join(' AND ')} ORDER BY p.id DESC LIMIT 200`, ...a) };
}
export function payoutDetail(ctx, id) {
  ctx.need('commissions.view'); const p = ctx.get('SELECT * FROM commission_payouts WHERE id=? AND org_id=?', id, ctx.org_id);
  if (!p || !ctx.branchIds().includes(p.branch_id) || (!ctx.can('commissions.viewall') && p.employee_id !== ctx.user.id)) throw notFound('payout');
  return { ...p, entries: ctx.all('SELECT * FROM commission_ledger WHERE settled_payout_id=? ORDER BY id', id) };
}
export function ledger(ctx, { employee_id, branch_id, unsettled, page = 1 } = {}) {
  ctx.need('commissions.view'); const b = ctx.inBranches('l.branch_id'); const w = ['l.org_id=?', b.sql]; const a = [ctx.org_id];
  if (!ctx.can('commissions.viewall')) { w.push('l.employee_id=?'); a.push(ctx.user.id); } else if (employee_id) { w.push('l.employee_id=?'); a.push(Number(employee_id)); }
  if (branch_id) { ctx.branch(branch_id); w.push('l.branch_id=?'); a.push(Number(branch_id)); } if (unsettled) w.push('l.settled_payout_id IS NULL AND l.payable_delta<>0');
  return { rows: ctx.all(`SELECT l.*, s.ref sale_ref, e.name employee_name FROM commission_ledger l LEFT JOIN sales s ON s.id=l.sale_id JOIN users e ON e.id=l.employee_id WHERE ${w.join(' AND ')} ORDER BY l.id DESC LIMIT 100 OFFSET ${(Math.max(Number(page) || 1, 1) - 1) * 100}`, ...a) };
}
// Per-barber (and technician) report. Revenue/refunds by transaction date; commission by ledger date.
export function barberReport(ctx, { branch_id, business_id, employee_id, from = '0000-01-01', to = '9999-12-31' } = {}) {
  ctx.need('commissions.view'); const b = ctx.inBranches('s.branch_id'); const own = !ctx.can('commissions.viewall');
  const w = ['s.org_id=?', b.sql, "s.status='completed'", 's.business_date BETWEEN ? AND ?', 'l.barber_id IS NOT NULL']; const a = [ctx.org_id, from, to];
  if (branch_id) { ctx.branch(branch_id); w.push('s.branch_id=?'); a.push(Number(branch_id)); } if (business_id) { w.push('s.business_id=?'); a.push(Number(business_id)); }
  const emp = own ? ctx.user.id : employee_id ? Number(employee_id) : null; if (emp) { w.push('l.barber_id=?'); a.push(emp); }
  const base = ctx.all(`SELECT l.barber_id, u.name, COUNT(DISTINCT s.id) visits, COALESCE(SUM(l.qty),0) services, COALESCE(SUM(l.net),0) revenue,
      COALESCE(SUM(l.discount),0) discounts, COALESCE(SUM(l.cost_total),0) direct_cost, GROUP_CONCAT(DISTINCT l.commission_bp) rates, s.currency
    FROM sale_lines l JOIN sales s ON s.id=l.sale_id JOIN users u ON u.id=l.barber_id WHERE ${w.join(' AND ')} GROUP BY l.barber_id, s.currency ORDER BY revenue DESC`, ...a);
  const lw = (bid) => (branch_id ? `AND ${bid}=${Number(branch_id)}` : `AND ${ctx.inBranches(bid).sql}`);
  const ledgerNums = (empId) => {
    const led = ctx.get(`SELECT COALESCE(SUM(earned_delta),0) earned, COALESCE(SUM(CASE WHEN type NOT IN ('advance','deduction') THEN payable_delta ELSE 0 END),0) payable, COALESCE(SUM(CASE WHEN type='advance' THEN -payable_delta ELSE 0 END),0) advances, COALESCE(SUM(CASE WHEN type='deduction' THEN -payable_delta ELSE 0 END),0) ded FROM commission_ledger WHERE org_id=? AND employee_id=? AND business_date BETWEEN ? AND ? ${lw('branch_id')}`, ctx.org_id, empId, from, to);
    const paid = ctx.get(`SELECT COALESCE(SUM(amount_paid),0) p, COALESCE(SUM(deductions),0) d FROM commission_payouts WHERE org_id=? AND employee_id=? AND business_date BETWEEN ? AND ? ${lw('branch_id')}`, ctx.org_id, empId, from, to);
    const outstanding = ctx.get(`SELECT COALESCE(SUM(payable_delta),0) o FROM commission_ledger WHERE org_id=? AND employee_id=? AND settled_payout_id IS NULL ${lw('branch_id')}`, ctx.org_id, empId).o;
    return { led, paid, outstanding };
  };
  // tips are recorded separately (never commission base); a visit's tip is split equally between its barbers when tips belong to the employee
  const tipsFor = (empId) => {
    let sum = 0;
    for (const s of ctx.all(`SELECT s.id, s.tip FROM sales s WHERE s.org_id=? AND ${b.sql} AND s.kind='service' AND s.status='completed' AND s.tip>0 AND s.tip_to='employee' AND s.business_date BETWEEN ? AND ? ${branch_id ? 'AND s.branch_id=' + Number(branch_id) : ''} AND EXISTS(SELECT 1 FROM sale_lines x WHERE x.sale_id=s.id AND x.barber_id=?)`, ctx.org_id, from, to, empId)) {
      const bs = ctx.all('SELECT DISTINCT barber_id FROM sale_lines WHERE sale_id=? AND barber_id IS NOT NULL ORDER BY barber_id', s.id).map((x) => x.barber_id); const parts = allocate(s.tip, bs.map(() => 1)); sum += parts[bs.indexOf(empId)];
    }
    return sum;
  };
  const rows = base.map((r) => {
    const refunds = ctx.get(`SELECT COALESCE(SUM(rl.net),0) n FROM return_lines rl JOIN returns r ON r.id=rl.return_id JOIN sale_lines l ON l.id=rl.sale_line_id JOIN sales s ON s.id=l.sale_id WHERE l.barber_id=? AND ${b.sql} AND r.business_date BETWEEN ? AND ? ${branch_id ? 'AND s.branch_id=' + Number(branch_id) : ''}`, r.barber_id, from, to).n;
    const { led, paid, outstanding } = ledgerNums(r.barber_id); const net = r.revenue - refunds;
    return { kind: 'barber', employee_id: r.barber_id, employee: r.name, currency: r.currency, visits: r.visits, services: r.services, revenue: r.revenue, discounts: r.discounts, refunds, net_revenue: net, rates_bp: r.rates.split(',').map(Number),
      commission_earned: led.earned, commission_payable: led.payable, advances: led.advances, deductions: paid.d + led.ded, paid: paid.p, outstanding, retained: net - led.earned, direct_cost: r.direct_cost, tips: tipsFor(r.barber_id) };
  });
  // technicians (repair labour commission) appear from the same ledger
  const tw = emp ? ` AND l.employee_id=${emp}` : '';
  for (const t of ctx.all(`SELECT l.employee_id id, u.name, br.currency, COUNT(DISTINCT l.source_id) jobs, GROUP_CONCAT(DISTINCT l.rate_bp) rates FROM commission_ledger l JOIN users u ON u.id=l.employee_id JOIN branches br ON br.id=l.branch_id WHERE l.org_id=? AND l.source_type='repair' AND l.business_date BETWEEN ? AND ? ${lw('l.branch_id')}${tw}${business_id ? ' AND br.business_id=' + Number(business_id) : ''} GROUP BY l.employee_id, br.currency`, ctx.org_id, from, to)) {
    const labor = ctx.get(`SELECT COALESCE(SUM(c.qty*c.unit_price),0) v FROM repair_charges c WHERE c.kind='labor' AND c.approved=1 AND c.voided=0 AND c.job_id IN (SELECT DISTINCT source_id FROM commission_ledger WHERE source_type='repair' AND employee_id=? AND business_date BETWEEN ? AND ?)`, t.id, from, to).v;
    const { led, paid, outstanding } = ledgerNums(t.id);
    rows.push({ kind: 'technician', employee_id: t.id, employee: t.name + ' (repairs)', currency: t.currency, visits: t.jobs, services: 0, revenue: labor, discounts: 0, refunds: 0, net_revenue: labor, rates_bp: t.rates.split(',').map(Number), commission_earned: led.earned, commission_payable: led.payable, advances: led.advances, deductions: paid.d + led.ded, paid: paid.p, outstanding, retained: labor - led.earned, direct_cost: 0, tips: 0 });
  }
  return rows;
}

// Daily work sheet per staff member: customers served, services, income, rate, commission, advances/deductions, take-home, retained.
export function barberDaily(ctx, { branch_id, business_id, employee_id, from = '0000-01-01', to = '9999-12-31' } = {}) {
  ctx.need('commissions.view'); const own = !ctx.can('commissions.viewall'); const b = ctx.inBranches('s.branch_id'); const emp = own ? ctx.user.id : employee_id ? Number(employee_id) : null;
  const bw = branch_id ? (ctx.branch(branch_id), ` AND s.branch_id=${Number(branch_id)}`) : ''; const bz = business_id ? ` AND s.business_id=${Number(business_id)}` : ''; const ew = emp ? ` AND l.barber_id=${emp}` : '';
  const map = new Map(); const row = (d, id, name, ccy) => { const k = d + '|' + id; if (!map.has(k)) map.set(k, { date: d, employee_id: id, employee: name, currency: ccy, visits: 0, services: 0, income: 0, refunds: 0, rates: new Set(), commission: 0, advances: 0, deductions: 0, tips: 0, discounts: 0 }); return map.get(k); };
  for (const r of ctx.all(`SELECT s.business_date d, l.barber_id id, u.name, s.currency c, COUNT(DISTINCT s.id) visits, SUM(l.qty) services, SUM(l.net) income, SUM(l.discount) disc, GROUP_CONCAT(DISTINCT l.commission_bp) rates FROM sale_lines l JOIN sales s ON s.id=l.sale_id JOIN users u ON u.id=l.barber_id WHERE s.org_id=? AND ${b.sql} AND s.status='completed' AND l.barber_id IS NOT NULL AND s.business_date BETWEEN ? AND ?${bw}${bz}${ew} GROUP BY 1,2,4`, ctx.org_id, from, to)) { const o = row(r.d, r.id, r.name, r.c); o.visits = r.visits; o.services = r.services; o.income = r.income; o.discounts = r.disc; r.rates.split(',').forEach((x) => o.rates.add(Number(x))); }
  for (const r of ctx.all(`SELECT rt.business_date d, l.barber_id id, u.name, s.currency c, SUM(rl.net) n FROM return_lines rl JOIN returns rt ON rt.id=rl.return_id JOIN sale_lines l ON l.id=rl.sale_line_id JOIN sales s ON s.id=l.sale_id JOIN users u ON u.id=l.barber_id WHERE s.org_id=? AND ${b.sql} AND l.barber_id IS NOT NULL AND rt.business_date BETWEEN ? AND ?${bw}${bz}${ew} GROUP BY 1,2,4`, ctx.org_id, from, to)) row(r.d, r.id, r.name, r.c).refunds = r.n;
  const lw = branch_id ? ` AND l.branch_id=${Number(branch_id)}` : ` AND ${ctx.inBranches('l.branch_id').sql}`; const lbz = business_id ? ` AND br.business_id=${Number(business_id)}` : '';
  for (const r of ctx.all(`SELECT l.business_date d, l.employee_id id, u.name, br.currency c, SUM(l.earned_delta) e, SUM(CASE WHEN l.type='advance' THEN -l.payable_delta ELSE 0 END) adv, SUM(CASE WHEN l.type='deduction' THEN -l.payable_delta ELSE 0 END) ded FROM commission_ledger l JOIN users u ON u.id=l.employee_id JOIN branches br ON br.id=l.branch_id WHERE l.org_id=? AND l.source_type IN ('sale_line','advance','deduction') AND l.business_date BETWEEN ? AND ?${lw}${lbz}${emp ? ' AND l.employee_id=' + emp : ''} GROUP BY 1,2,4`, ctx.org_id, from, to)) { const o = row(r.d, r.id, r.name, r.c); o.commission = r.e; o.advances = r.adv; o.deductions = r.ded; }
  for (const r of ctx.all(`SELECT s.business_date d, s.id sid, s.tip, s.currency c FROM sales s WHERE s.org_id=? AND ${b.sql} AND s.kind='service' AND s.status='completed' AND s.tip>0 AND s.tip_to='employee' AND s.business_date BETWEEN ? AND ?${bw}${bz}`, ctx.org_id, from, to)) {
    const bs = ctx.all('SELECT DISTINCT l.barber_id id, u.name FROM sale_lines l JOIN users u ON u.id=l.barber_id WHERE l.sale_id=? AND l.barber_id IS NOT NULL ORDER BY l.barber_id', r.sid); const parts = allocate(r.tip, bs.map(() => 1));
    bs.forEach((x, i) => { if (!emp || x.id === emp) row(r.d, x.id, x.name, r.c).tips += parts[i]; });
  }
  const rows = [...map.values()].map((o) => ({ ...o, rates_bp: [...o.rates], rates: undefined, net_income: o.income - o.refunds, take_home: o.commission - o.advances - o.deductions, retained: o.income - o.refunds - o.commission })).sort((a, b) => b.date.localeCompare(a.date) || a.employee.localeCompare(b.employee));
  const sumOf = (arr) => arr.reduce((t, r) => { for (const k of ['visits', 'services', 'income', 'refunds', 'net_income', 'commission', 'advances', 'deductions', 'take_home', 'retained', 'tips']) t[k] = (t[k] || 0) + r[k]; return t; }, {});
  const byDay = {}; for (const r of rows) (byDay[r.currency + '|' + r.date] ||= []).push(r);
  const days = Object.entries(byDay).map(([k, rs]) => ({ date: rs[0].date, currency: rs[0].currency, staff: rs.length, ...sumOf(rs) })).sort((a, b) => b.date.localeCompare(a.date));
  const byEmp = {}; for (const r of rows) (byEmp[r.employee_id + '|' + r.currency] ||= []).push(r);
  const staff = Object.values(byEmp).map((rs) => ({ employee_id: rs[0].employee_id, employee: rs[0].employee, currency: rs[0].currency, days: new Set(rs.map((x) => x.date)).size, rates_bp: [...new Set(rs.flatMap((x) => x.rates_bp))], ...sumOf(rs) })).sort((a, b) => b.net_income - a.net_income);
  return { rows, days, staff };
}
