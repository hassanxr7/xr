// Commission ledger. Append-only: every change is a delta row, so history is never rewritten.
//   earned_delta  -> accrual-basis commission EXPENSE (recognised once, when the service/repair is recognised)
//   payable_delta -> liability that has become payable as customer payments are collected (proportional release)
// A payout settles payable rows (settled_payout_id) and is NOT an expense. Refunds post negative deltas.
import { AppError, bad, notFound } from './errors.js';
import { ApprovalNeeded, registerApproval } from './core.js';
import { mulBp, int, divRound } from './money.js';
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
    const payable = sum(() => true); const previous = sum((r) => r.type === 'carry'); const advances = -sum((r) => r.type === 'advance');
    const earned = rows.filter((r) => !['carry', 'advance'].includes(r.type)).reduce((s, r) => s + r.earned_delta, 0);
    const netDue = payable - deductions;
    if (paidReq > Math.max(netDue, 0)) throw new AppError(409, 'overpayment', 'Amount paid exceeds the net commission due', { net_due: netDue });
    const remaining = netDue - paidReq;
    const id = ctx.run(`INSERT INTO commission_payouts(org_id,branch_id,employee_id,ref,period_from,period_to,earned,payable,advances,deductions,previous_balance,net_due,amount_paid,remaining,method_id,note,status,processed_by,approved_by,created_at,business_date)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, ctx.org_id, br.id, u.id, ctx.ref('CPO', br), p.period_from || null, p.period_to || null, earned, payable, advances, deductions, previous, netDue, paidReq, remaining,
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
  return base.map((r) => {
    const refunds = ctx.get(`SELECT COALESCE(SUM(rl.net),0) n FROM return_lines rl JOIN returns r ON r.id=rl.return_id JOIN sale_lines l ON l.id=rl.sale_line_id JOIN sales s ON s.id=l.sale_id WHERE l.barber_id=? AND ${b.sql} AND r.business_date BETWEEN ? AND ? ${branch_id ? 'AND s.branch_id=' + Number(branch_id) : ''}`, r.barber_id, from, to).n;
    const lw = branch_id ? `AND branch_id=${Number(branch_id)}` : `AND ${ctx.inBranches('branch_id').sql}`;
    const led = ctx.get(`SELECT COALESCE(SUM(earned_delta),0) earned, COALESCE(SUM(CASE WHEN type<>'advance' THEN payable_delta ELSE 0 END),0) payable, COALESCE(SUM(CASE WHEN type='advance' THEN -payable_delta ELSE 0 END),0) advances FROM commission_ledger WHERE org_id=? AND employee_id=? AND business_date BETWEEN ? AND ? ${lw}`, ctx.org_id, r.barber_id, from, to);
    const paid = ctx.get(`SELECT COALESCE(SUM(amount_paid),0) p, COALESCE(SUM(deductions),0) d FROM commission_payouts WHERE org_id=? AND employee_id=? AND business_date BETWEEN ? AND ? ${lw}`, ctx.org_id, r.barber_id, from, to);
    const outstanding = ctx.get(`SELECT COALESCE(SUM(payable_delta),0) o FROM commission_ledger WHERE org_id=? AND employee_id=? AND settled_payout_id IS NULL ${lw}`, ctx.org_id, r.barber_id).o;
    const net = r.revenue - refunds;
    return { employee_id: r.barber_id, employee: r.name, currency: r.currency, visits: r.visits, services: r.services, revenue: r.revenue, discounts: r.discounts, refunds, net_revenue: net, rates_bp: r.rates.split(',').map(Number),
      commission_earned: led.earned, commission_payable: led.payable, advances: led.advances, deductions: paid.d, paid: paid.p, outstanding, retained: net - led.earned, direct_cost: r.direct_cost };
  });
}
