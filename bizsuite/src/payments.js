import { AppError, bad, notFound } from './errors.js';
import { int } from './money.js';
import { nowIso } from './time.js';
import { payStatus } from './inventory.js';
import { syncSaleCommission, syncRepairCommission } from './commissions.js';

export function method(ctx, id) {
  const m = ctx.get('SELECT * FROM payment_methods WHERE id=? AND org_id=? AND active=1', id, ctx.org_id); if (!m) throw notFound('payment method'); return m;
}
// Core money-in/out primitive. Caller has already verified permission + branch access.
// Only 'confirmed' payments count towards balances; pending/failed/cancelled are retained for the record.
export function applyPayment(ctx, br, p) {
  const m = method(ctx, p.method_id); const amount = int(p.amount, 'amount', { min: 1 });
  const status = p.status || 'confirmed';
  if (!['pending', 'confirmed'].includes(status)) throw bad('invalid_status');
  if (m.provider !== 'manual' && status === 'confirmed' && !p.provider_confirmed) throw bad('provider_confirmation_required', 'Integrated payments are confirmed by the provider only');
  let sessionId = null;
  if (m.kind === 'cash') {
    const s = ctx.openSession(br);
    if (!s && br.require_register) throw new AppError(409, 'register_required', 'Open a cash register session first');
    sessionId = s ? s.id : null;
  }
  const date = ctx.today(br);
  if (p.external_ref && ctx.get('SELECT 1 x FROM payments WHERE org_id=? AND method_id=? AND external_ref=? AND status IN (\'confirmed\',\'pending\') AND direction=\'in\'', ctx.org_id, m.id, p.external_ref))
    throw new AppError(409, 'duplicate_external_ref', 'This transaction reference was already recorded', { external_ref: p.external_ref });
  const id = ctx.run(`INSERT INTO payments(org_id,branch_id,ref,direction,party_type,party_id,customer_id,supplier_id,method_id,method_kind,amount,currency,status,provider,external_ref,session_id,reverses_id,is_collection,note,user_id,created_at,business_date)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, ctx.org_id, br.id, ctx.ref('PAY', br), p.direction || 'in', p.party_type, p.party_id ?? null, p.customer_id ?? null, p.supplier_id ?? null, m.id, m.kind, amount, br.currency,
  status, m.provider, p.external_ref || null, sessionId, p.reverses_id ?? null, p.is_collection ? 1 : 0, p.note || null, ctx.user.id, nowIso(), date).lastInsertRowid;
  return id;
}
function partyRow(ctx, type, id) {
  const t = { sale: 'sales', repair: 'repair_jobs', purchase: 'purchases' }[type]; if (!t) throw bad('invalid_party');
  const r = ctx.get(`SELECT * FROM ${t} WHERE id=? AND org_id=?`, id, ctx.org_id); if (!r || !ctx.branchIds().includes(r.branch_id)) throw notFound(type); return r;
}
export function netPaid(ctx, type, id) { // customer documents: in - out; supplier bills: out - in
  const sign = type === 'purchase' ? "CASE direction WHEN 'out' THEN amount ELSE -amount END" : "CASE direction WHEN 'in' THEN amount ELSE -amount END";
  return ctx.get(`SELECT COALESCE(SUM(${sign}),0) n FROM payments WHERE org_id=? AND party_type=? AND party_id=? AND status='confirmed'`, ctx.org_id, type, id).n;
}
export function repairTotals(ctx, jobId) {
  const r = ctx.get(`SELECT COALESCE(SUM(qty*unit_price),0) total, COALESCE(SUM(CASE WHEN kind='labor' THEN qty*unit_price ELSE 0 END),0) labor, COALESCE(SUM(cost_total),0) parts_cost,
    COALESCE(SUM(CASE WHEN kind='part' THEN qty*unit_price ELSE 0 END),0) parts_rev FROM repair_charges WHERE job_id=? AND approved=1 AND voided=0`, jobId);
  return r;
}
// Re-derive cached balances for a party after any payment status change; then re-sync commissions.
export function refreshParty(ctx, type, id) {
  const paid = netPaid(ctx, type, id);
  if (type === 'sale') {
    const s = ctx.get('SELECT * FROM sales WHERE id=?', id); const due = s.status === 'void' ? 0 : s.total - s.returned_total;
    ctx.run('UPDATE sales SET paid=?, payment_status=? WHERE id=?', paid, s.status === 'void' ? 'void' : payStatus(due, paid), id);
    syncSaleCommission(ctx, id, 'payment');
  } else if (type === 'purchase') {
    const p = ctx.get('SELECT * FROM purchases WHERE id=?', id); ctx.run('UPDATE purchases SET paid=?, payment_status=? WHERE id=?', paid, payStatus(p.billed, paid), id);
  } else if (type === 'repair') syncRepairCommission(ctx, id, 'payment');
  return paid;
}
export function amountDue(ctx, type, row) {
  if (type === 'sale') return row.total - row.returned_total - row.paid;
  if (type === 'purchase') return row.billed - row.paid;
  const t = repairTotals(ctx, row.id); return t.total - netPaid(ctx, 'repair', row.id);
}
// Public: collect a payment against an invoice / repair / supplier bill.
export function recordPayment(ctx, p) {
  const perm = p.party_type === 'purchase' ? 'purchases.edit' : p.party_type === 'repair' ? 'repairs.create' : 'payments.create';
  if (!(ctx.can(perm) || ctx.can('payments.create'))) ctx.need(perm);
  return ctx.tx(() => {
    const row = partyRow(ctx, p.party_type, Number(p.party_id)); const br = ctx.branch(row.branch_id); ctx.guardDay(br);
    if (p.party_type === 'sale' && row.status === 'void') throw new AppError(409, 'sale_void', 'Sale is void');
    const dir = p.party_type === 'purchase' ? 'out' : 'in';
    const due = amountDue(ctx, p.party_type, row); const amount = int(p.amount, 'amount', { min: 1 });
    const lenient = p.party_type === 'repair' && !['completed', 'delivered'].includes(row.status); // deposits may precede charges
    if (amount > due && !lenient) throw new AppError(409, 'overpayment', 'Payment exceeds the amount due', { due });
    const id = applyPayment(ctx, br, { ...p, direction: dir, is_collection: true, customer_id: row.customer_id, supplier_id: row.supplier_id });
    if ((p.status || 'confirmed') === 'confirmed') refreshParty(ctx, p.party_type, row.id);
    ctx.audit('payment.record', 'payment', id, null, { ...p, amount }, br.id);
    return { id, paid: netPaid(ctx, p.party_type, row.id) };
  });
}
// pending -> confirmed | failed | cancelled (provider/manual confirmation)
export function setPaymentStatus(ctx, id, status, { provider_confirmed } = {}) {
  ctx.need('payments.create');
  return ctx.tx(() => {
    const p = ctx.get('SELECT * FROM payments WHERE id=? AND org_id=?', id, ctx.org_id); if (!p || !ctx.branchIds().includes(p.branch_id)) throw notFound('payment');
    if (p.status !== 'pending') throw new AppError(409, 'invalid_state', 'Only pending payments can change status');
    if (!['confirmed', 'failed', 'cancelled'].includes(status)) throw bad('invalid_status');
    if (status === 'confirmed' && p.provider !== 'manual' && !provider_confirmed) throw bad('provider_confirmation_required', 'Integrated payments are confirmed by the provider only');
    if (status === 'confirmed') { ctx.guardDay(ctx.branch(p.branch_id)); const row = partyRow(ctx, p.party_type, p.party_id); if (p.direction === 'in' && p.amount > amountDue(ctx, p.party_type, row)) throw new AppError(409, 'overpayment', 'Payment exceeds the amount due'); }
    ctx.run('UPDATE payments SET status=? WHERE id=?', status, id);
    if (status === 'confirmed' && p.party_type !== 'payout' && p.party_type !== 'refund') refreshParty(ctx, p.party_type, p.party_id);
    ctx.audit('payment.status', 'payment', id, { status: 'pending' }, { status }, p.branch_id); return { id, status };
  });
}
// Reversal creates an offsetting payment; the original row is preserved (and linked) for audit.
export function reversePayment(ctx, id, reason) {
  ctx.need('sales.void');
  return ctx.tx(() => {
    const p = ctx.get('SELECT * FROM payments WHERE id=? AND org_id=?', id, ctx.org_id); if (!p || !ctx.branchIds().includes(p.branch_id)) throw notFound('payment');
    if (p.status !== 'confirmed' || p.reversed_by || p.reverses_id) throw new AppError(409, 'not_reversible', 'Payment cannot be reversed');
    if (!reason) throw bad('reason_required', 'A reason is required');
    const br = ctx.branch(p.branch_id); ctx.guardDay(br);
    const rid = applyPayment(ctx, br, { direction: p.direction === 'in' ? 'out' : 'in', party_type: p.party_type, party_id: p.party_id, customer_id: p.customer_id, supplier_id: p.supplier_id, method_id: p.method_id, amount: p.amount, reverses_id: p.id, note: `Reversal: ${reason}` });
    ctx.run('UPDATE payments SET reversed_by=? WHERE id=?', rid, p.id);
    if (['sale', 'repair', 'purchase'].includes(p.party_type)) refreshParty(ctx, p.party_type, p.party_id);
    ctx.audit('payment.reverse', 'payment', id, { status: 'confirmed' }, { reversed_by: rid, reason }, p.branch_id); return { id: rid };
  });
}
export function listPayments(ctx, { branch_id, method_kind, status, from, to, page = 1, limit = 50, unreconciled } = {}) {
  ctx.need('payments.view'); const b = ctx.inBranches('p.branch_id'); const w = ['p.org_id=?', b.sql]; const a = [ctx.org_id];
  if (branch_id) { ctx.branch(branch_id); w.push('p.branch_id=?'); a.push(Number(branch_id)); }
  if (method_kind) { w.push('p.method_kind=?'); a.push(method_kind); } if (status) { w.push('p.status=?'); a.push(status); }
  if (from) { w.push('p.business_date>=?'); a.push(from); } if (to) { w.push('p.business_date<=?'); a.push(to); }
  if (unreconciled) w.push('p.reconciled_at IS NULL AND p.status=\'confirmed\'');
  limit = Math.min(Number(limit) || 50, 200);
  return { rows: ctx.all(`SELECT p.*, m.name method_name, u.name user_name FROM payments p JOIN payment_methods m ON m.id=p.method_id LEFT JOIN users u ON u.id=p.user_id WHERE ${w.join(' AND ')} ORDER BY p.id DESC LIMIT ${limit} OFFSET ${(Math.max(Number(page) || 1, 1) - 1) * limit}`, ...a) };
}
// Mobile-money / bank reconciliation: tick payments against a statement total; difference is recorded.
export function reconcile(ctx, r) {
  ctx.need('payments.approve'); const br = ctx.branch(r.branch_id);
  return ctx.tx(() => {
    const ids = (r.payment_ids || []).map(Number); if (!ids.length) throw bad('payments_required', 'Select payments to reconcile');
    let book = 0; const m = method(ctx, r.method_id);
    if (m.kind === 'cash') throw bad('use_register', 'Cash is reconciled through register sessions');
    for (const id of ids) {
      const p = ctx.get('SELECT * FROM payments WHERE id=? AND org_id=? AND branch_id=? AND method_id=? AND status=\'confirmed\' AND reconciled_at IS NULL', id, ctx.org_id, br.id, m.id);
      if (!p) throw new AppError(409, 'not_reconcilable', 'Payment not found or already reconciled', { id }); book += p.direction === 'in' ? p.amount : -p.amount;
    }
    const stmt = int(r.statement_total, 'statement_total'); const diff = stmt - book;
    const rid = ctx.run('INSERT INTO reconciliations(org_id,branch_id,method_id,book_total,statement_total,difference,payment_ids,note,user_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)', ctx.org_id, br.id, m.id, book, stmt, diff, JSON.stringify(ids), r.note || null, ctx.user.id, nowIso()).lastInsertRowid;
    for (const id of ids) ctx.run('UPDATE payments SET reconciled_at=? WHERE id=?', nowIso(), id);
    if (diff !== 0) ctx.notify('reconciliation_difference', `Reconciliation difference ${diff} on ${m.name} at ${br.name}`, { branch_id: br.id, link: '#/payments' });
    ctx.audit('payment.reconcile', 'reconciliation', rid, null, { book, stmt, diff }, br.id); return { id: rid, book, statement: stmt, difference: diff };
  });
}
