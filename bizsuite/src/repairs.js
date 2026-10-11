import { AppError, bad, notFound, forbidden } from './errors.js';
import { int } from './money.js';
import { nowIso, addDays } from './time.js';
import { stockOut, stockIn, variantInOrg } from './inventory.js';
import { applyPayment, refreshParty, netPaid, repairTotals } from './payments.js';
import { syncRepairCommission } from './commissions.js';
import { ApprovalNeeded, registerApproval } from './core.js';
import { str } from './admin.js';

export const STATUSES = ['received', 'diagnosing', 'awaiting_approval', 'awaiting_parts', 'in_progress', 'completed', 'delivered', 'cancelled', 'unrepairable'];
const NEXT = {
  received: ['diagnosing', 'awaiting_approval', 'in_progress', 'cancelled', 'unrepairable'],
  diagnosing: ['awaiting_approval', 'awaiting_parts', 'in_progress', 'cancelled', 'unrepairable'],
  awaiting_approval: ['diagnosing', 'awaiting_parts', 'in_progress', 'cancelled', 'unrepairable'],
  awaiting_parts: ['in_progress', 'diagnosing', 'cancelled', 'unrepairable'],
  in_progress: ['awaiting_parts', 'awaiting_approval', 'completed', 'unrepairable', 'cancelled'],
  completed: ['in_progress', 'delivered'], delivered: [], cancelled: [], unrepairable: ['delivered'],
};
const TECH_ALLOWED = ['diagnosing', 'awaiting_approval', 'awaiting_parts', 'in_progress', 'completed', 'unrepairable'];

function job(ctx, id, forWrite = false) {
  const j = ctx.get('SELECT * FROM repair_jobs WHERE id=? AND org_id=?', id, ctx.org_id);
  if (!j || !ctx.branchIds().includes(j.branch_id)) throw notFound('repair job');
  if (!ctx.can('repairs.viewall') && j.technician_id !== ctx.user.id && !(forWrite && ctx.can('repairs.create'))) { if (!ctx.can('repairs.create')) throw notFound('repair job'); }
  return j;
}
const hist = (ctx, id, status, note) => ctx.run('INSERT INTO repair_status_history(job_id,status,note,user_id,created_at) VALUES(?,?,?,?,?)', id, status, note || null, ctx.user.id, nowIso());
function tech(ctx, br, id) {
  if (!id) return null;
  const u = ctx.get('SELECT u.* FROM users u WHERE u.id=? AND u.org_id=? AND u.active=1 AND (EXISTS(SELECT 1 FROM user_branches ub WHERE ub.user_id=u.id AND ub.branch_id=?) OR EXISTS(SELECT 1 FROM roles r WHERE r.id=u.role_id AND r.scope=\'org\'))', id, ctx.org_id, br.id);
  if (!u) throw bad('invalid_technician', 'Technician is not assigned to this branch'); return u;
}

export function createRepair(ctx, j) {
  ctx.need('repairs.create'); const br = ctx.branch(j.branch_id); ctx.requireModule(br, 'repairs');
  return ctx.tx(() => {
    ctx.guardDay(br); const t = tech(ctx, br, j.technician_id);
    let cust = null; if (j.customer_id) { cust = ctx.get('SELECT * FROM customers WHERE id=? AND org_id=?', j.customer_id, ctx.org_id); if (!cust) throw notFound('customer'); }
    const id = ctx.run(`INSERT INTO repair_jobs(org_id,business_id,branch_id,ref,customer_id,customer_name,customer_phone,device_category,brand,model,serial,fault,condition_notes,accessories,device_lock,technician_id,est_completion,est_price,tech_commission_bp,currency,user_id,created_at,business_date)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, ctx.org_id, br.business_id, br.id, ctx.ref('REP', br), cust?.id || null, str(j.customer_name || cust?.name, 'customer_name'), j.customer_phone || cust?.phone || null, j.device_category || null, j.brand || null, j.model || null,
    j.serial ? String(j.serial).toUpperCase() : null, str(j.fault, 'fault', { max: 1000 }), j.condition_notes || null, j.accessories || null, j.device_lock || null, t?.id || null, j.est_completion || addDays(ctx.today(br), 3), int(j.est_price ?? 0, 'est_price', { min: 0 }),
    t ? t.commission_bp : 0, br.currency, ctx.user.id, nowIso(), ctx.today(br)).lastInsertRowid;
    hist(ctx, id, 'received', 'Device received');
    for (const p of j.payments || []) applyPayment(ctx, br, { ...p, party_type: 'repair', party_id: id, customer_id: cust?.id });
    refreshParty(ctx, 'repair', id);
    if (t) ctx.notify('repair_assigned', `Repair assigned to you`, { branch_id: br.id, user_id: t.id, link: '#/repairs' });
    ctx.audit('repair.create', 'repair', id, null, { ...j, device_lock: j.device_lock ? '[protected]' : undefined }, br.id);
    return { id, ref: ctx.get('SELECT ref FROM repair_jobs WHERE id=?', id).ref };
  });
}
export function updateRepair(ctx, id, u) {
  ctx.need('repairs.edit');
  return ctx.tx(() => {
    const j = job(ctx, id); const br = ctx.branch(j.branch_id); const sets = []; const vals = [];
    if (['delivered', 'cancelled'].includes(j.status)) throw new AppError(409, 'job_closed', 'Job is closed');
    for (const k of ['diagnosis', 'notes', 'condition_notes', 'accessories']) if (k in u) { sets.push(`${k}=?`); vals.push(u[k]); }
    if ('qc_done' in u) { sets.push('qc_done=?'); vals.push(u.qc_done ? 1 : 0); }
    if ('est_price' in u) { sets.push('est_price=?'); vals.push(int(u.est_price, 'est_price', { min: 0 })); }
    if ('est_completion' in u) { sets.push('est_completion=?'); vals.push(u.est_completion); }
    if ('other_direct_cost' in u) { ctx.need('repairs.approve'); sets.push('other_direct_cost=?'); vals.push(int(u.other_direct_cost, 'other_direct_cost', { min: 0 })); }
    if ('technician_id' in u && u.technician_id !== j.technician_id) {
      ctx.need('repairs.approve'); const t = tech(ctx, br, u.technician_id);
      if (['completed'].includes(j.status)) throw new AppError(409, 'job_completed', 'Cannot reassign a completed job');
      sets.push('technician_id=?', 'tech_commission_bp=?'); vals.push(t?.id || null, t ? t.commission_bp : 0);
      if (j.technician_id) { /* nothing was earned yet: commission only accrues on completion */ }
    }
    if (sets.length) ctx.run(`UPDATE repair_jobs SET ${sets.join(',')} WHERE id=?`, ...vals, id);
    ctx.audit('repair.update', 'repair', id, { technician_id: j.technician_id, diagnosis: j.diagnosis }, u, br.id);
    return { id };
  });
}
function consumePending(ctx, j, br) {
  for (const c of ctx.all("SELECT * FROM repair_charges WHERE job_id=? AND kind='part' AND approved=1 AND voided=0 AND consumed=0", j.id)) {
    const cost = stockOut(ctx, br.id, c.variant_id, c.qty, 'repair_consume', 'repair', j.id, { note: j.ref });
    ctx.run('UPDATE repair_charges SET consumed=1, cost_total=? WHERE id=?', cost, c.id);
  }
}
export function addCharge(ctx, id, c) {
  ctx.need('repairs.edit');
  return ctx.tx(() => {
    const j = job(ctx, id); const br = ctx.branch(j.branch_id); ctx.guardDay(br);
    if (['completed', 'delivered', 'cancelled', 'unrepairable'].includes(j.status)) throw new AppError(409, 'job_closed', 'Charges cannot be added at this stage');
    if (!['labor', 'part', 'other'].includes(c.kind)) throw bad('invalid_kind');
    const qty = int(c.qty ?? 1, 'qty', { min: 1 }); let price = int(c.unit_price ?? 0, 'unit_price', { min: 0 }); let desc = c.description; let variantId = null;
    if (c.kind === 'part') {
      const v = variantInOrg(ctx, c.variant_id); if (v.business_id !== br.business_id) throw bad('wrong_business'); if (v.kind === 'serialized') throw bad('serialized_part', 'Serialized devices cannot be used as spare parts');
      variantId = v.id; if (c.unit_price == null) price = v.price; desc = desc || v.pname;
    }
    desc = str(desc, 'description');
    const cur = repairTotals(ctx, id).total; const needsRevision = j.approved_total != null && cur + qty * price > j.approved_total;
    const cid = ctx.run('INSERT INTO repair_charges(job_id,kind,description,variant_id,qty,unit_price,approved,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)', id, c.kind, desc, variantId, qty, price, needsRevision ? 0 : 1, ctx.user.id, nowIso()).lastInsertRowid;
    if (!needsRevision && j.status === 'in_progress') consumePending(ctx, j, br);
    if (needsRevision) ctx.notify('repair_revision', `Repair ${j.ref} needs customer approval for additional charges`, { branch_id: br.id, link: '#/repairs' });
    ctx.audit('repair.charge', 'repair', id, null, { ...c, needs_revision: needsRevision }, br.id);
    return { id: cid, needs_revision: needsRevision };
  });
}
export function voidCharge(ctx, id, chargeId, reason) {
  ctx.need('repairs.edit');
  return ctx.tx(() => {
    const j = job(ctx, id); const br = ctx.branch(j.branch_id); const c = ctx.get('SELECT * FROM repair_charges WHERE id=? AND job_id=?', chargeId, id); if (!c || c.voided) throw notFound('charge');
    if (['delivered', 'cancelled'].includes(j.status)) throw new AppError(409, 'job_closed', 'Job is closed');
    if (c.consumed) stockIn(ctx, br.id, c.variant_id, c.qty, c.cost_total, 'repair_return', 'repair', id, reason);
    ctx.run('UPDATE repair_charges SET voided=1 WHERE id=?', chargeId); syncRepairCommission(ctx, id, 'adjustment');
    ctx.audit('repair.charge_void', 'repair', id, c, { reason }, br.id); return { ok: true };
  });
}
// Records the customer's decision on the estimate or on a revision (additional charges). Required for any amount beyond the approved total.
export function recordApproval(ctx, id, a) {
  if (!ctx.can('repairs.create') && !ctx.can('repairs.approve')) ctx.need('repairs.create');
  if (!['approved', 'rejected'].includes(a.decision)) throw bad('invalid_decision');
  return ctx.tx(() => {
    const j = job(ctx, id, true); const br = ctx.branch(j.branch_id);
    if (['completed', 'delivered', 'cancelled'].includes(j.status)) throw new AppError(409, 'job_closed', 'Job is closed');
    const kind = j.approved_total == null ? 'estimate' : 'revision';
    const pending = kind === 'estimate' ? repairTotals(ctx, id).total : ctx.get('SELECT COALESCE(SUM(qty*unit_price),0) t FROM repair_charges WHERE job_id=? AND approved=0 AND voided=0', id).t;
    if (kind === 'revision' && pending === 0) throw new AppError(409, 'nothing_pending', 'No additional charges awaiting approval');
    ctx.run('INSERT INTO repair_approvals(job_id,kind,amount,decision,by_name,note,recorded_by,created_at) VALUES(?,?,?,?,?,?,?,?)', id, kind, pending, a.decision, a.by_name || j.customer_name, a.note || null, ctx.user.id, nowIso());
    if (a.decision === 'approved') {
      ctx.run('UPDATE repair_charges SET approved=1 WHERE job_id=? AND voided=0', id);
      const total = repairTotals(ctx, id).total; ctx.run('UPDATE repair_jobs SET approved_total=? WHERE id=?', total, id);
      if (kind === 'estimate' && ['received', 'diagnosing', 'awaiting_approval'].includes(j.status)) { ctx.run("UPDATE repair_jobs SET status='in_progress' WHERE id=?", id); hist(ctx, id, 'in_progress', 'Customer approved estimate'); j.status = 'in_progress'; }
      if (j.status === 'in_progress') consumePending(ctx, j, br);
    } else if (kind === 'revision') ctx.run('UPDATE repair_charges SET voided=1 WHERE job_id=? AND approved=0 AND voided=0', id);
    else { ctx.run("UPDATE repair_jobs SET status='cancelled', device_lock=NULL WHERE id=?", id); hist(ctx, id, 'cancelled', 'Customer rejected estimate'); }
    ctx.audit('repair.approval', 'repair', id, null, { kind, decision: a.decision, amount: pending }, br.id); return { kind, amount: pending, decision: a.decision };
  });
}
export function setStatus(ctx, id, status, note) {
  ctx.need('repairs.edit');
  return ctx.tx(() => {
    const j = job(ctx, id); const br = ctx.branch(j.branch_id); ctx.guardDay(br);
    if (!STATUSES.includes(status)) throw bad('invalid_status');
    if (!NEXT[j.status].includes(status)) throw new AppError(409, 'invalid_transition', `Cannot move from ${j.status} to ${status}`, { from: j.status, to: status });
    if (!TECH_ALLOWED.includes(status) && !ctx.can('repairs.create') && !ctx.can('repairs.approve')) throw forbidden('Your role cannot set this status', 'status_not_permitted');
    if (j.technician_id !== ctx.user.id && !ctx.can('repairs.viewall') && !ctx.can('repairs.create')) throw notFound('repair job');
    const t = repairTotals(ctx, id); const paid = netPaid(ctx, 'repair', id);
    if (status === 'in_progress') {
      if (ctx.get('SELECT 1 x FROM repair_charges WHERE job_id=? AND approved=0 AND voided=0', id) ) throw new AppError(409, 'approval_pending', 'Additional charges await customer approval');
      if (j.approved_total == null) throw new AppError(409, 'estimate_not_approved', 'Record the customer approval of the estimate before starting work');
      consumePending(ctx, j, br);
    }
    if (status === 'completed') {
      if (j.approved_total == null) throw new AppError(409, 'estimate_not_approved', 'Record customer approval before completing');
      if (ctx.get('SELECT 1 x FROM repair_charges WHERE job_id=? AND approved=0 AND voided=0', id)) throw new AppError(409, 'approval_pending', 'Additional charges await customer approval');
      if (!j.qc_done) throw new AppError(409, 'qc_required', 'Complete the quality check first');
      if (paid > t.total) throw new AppError(409, 'overpaid', 'Customer has paid more than the charges; refund the difference first', { paid, total: t.total });
      ctx.run('UPDATE repair_jobs SET completed_at=?, revenue_date=?, device_lock=NULL WHERE id=?', nowIso(), ctx.today(br), id);
      ctx.notify('repair_completed', `Repair ${j.ref} is completed`, { branch_id: br.id, link: '#/repairs' });
    }
    if (status === 'delivered') {
      if (j.status === 'completed' && paid < t.total) throw new AppError(409, 'balance_due', 'Collect the remaining balance before delivery', { due: t.total - paid });
      ctx.run('UPDATE repair_jobs SET delivered_at=?, device_lock=NULL WHERE id=?', nowIso(), id);
    }
    if (['cancelled', 'unrepairable'].includes(status)) {
      if (ctx.get("SELECT 1 x FROM repair_charges WHERE job_id=? AND kind='part' AND consumed=1 AND voided=0", id)) throw new AppError(409, 'parts_consumed', 'Return consumed parts to stock (void the part charges) before closing the job');
      ctx.run('UPDATE repair_jobs SET device_lock=NULL WHERE id=?', id);
    }
    ctx.run('UPDATE repair_jobs SET status=? WHERE id=?', status, id); hist(ctx, id, status, note);
    syncRepairCommission(ctx, id, 'status');
    ctx.audit('repair.status', 'repair', id, { status: j.status }, { status, note }, br.id); return { id, status };
  });
}
export function refundRepair(ctx, id, r, opts = {}) {
  const j0 = job(ctx, id); const br = ctx.branch(j0.branch_id); const amount = int(r.amount, 'amount', { min: 1 });
  if (!opts.approvedBy) { if (!ctx.can('repairs.approve')) throw new ApprovalNeeded('repair_refund', br.id, amount, `Repair refund ${amount} on ${j0.ref}`, { ...r, id }); if (!ctx.limitOk('refund_max', amount)) throw new ApprovalNeeded('repair_refund', br.id, amount, `Repair refund ${amount} on ${j0.ref} exceeds limit`, { ...r, id }); }
  return ctx.tx(() => {
    ctx.guardDay(br); const paid = netPaid(ctx, 'repair', id); if (amount > paid) throw bad('refund_exceeds_paid', 'Refund exceeds amount paid');
    applyPayment(ctx, br, { direction: 'out', party_type: 'repair', party_id: id, customer_id: j0.customer_id, method_id: r.method_id, amount, note: 'Refund ' + j0.ref + (r.reason ? ': ' + r.reason : '') });
    refreshParty(ctx, 'repair', id); ctx.audit('repair.refund', 'repair', id, null, { amount }, br.id); return { ok: true };
  });
}
registerApproval('repair_refund', { limitKey: 'refund_max', valueOf: (_p, a) => a.amount, perm: 'repairs.approve' }, (rctx, p, o) => refundRepair(rctx, p.id, p, o));

export function repairFinancials(ctx, j) {
  const t = repairTotals(ctx, j.id); const earned = ctx.get("SELECT COALESCE(SUM(earned_delta),0) e FROM commission_ledger WHERE source_type='repair' AND source_id=?", j.id).e;
  const paid = netPaid(ctx, 'repair', j.id); const revenue = t.total;
  return { revenue, labor: t.labor, parts_revenue: t.parts_rev, parts_cost: t.parts_cost, commission: earned, other_direct_cost: j.other_direct_cost, contribution: revenue - t.parts_cost - earned - j.other_direct_cost, collected: paid, balance: revenue - paid };
}
export function getRepair(ctx, id) {
  ctx.need('repairs.view'); const j = job(ctx, id); const br = ctx.branch(j.branch_id);
  const canLock = j.technician_id === ctx.user.id || ctx.can('repairs.approve'); const out = { ...j, device_lock: canLock ? j.device_lock : j.device_lock ? '[restricted]' : null };
  out.history = ctx.all('SELECT h.*,u.name user_name FROM repair_status_history h LEFT JOIN users u ON u.id=h.user_id WHERE job_id=? ORDER BY h.id', id);
  out.charges = ctx.all('SELECT * FROM repair_charges WHERE job_id=? ORDER BY id', id).map((c) => (ctx.can('cost.view') ? c : { ...c, cost_total: undefined }));
  out.approvals = ctx.all('SELECT * FROM repair_approvals WHERE job_id=? ORDER BY id', id);
  out.payments = ctx.all('SELECT p.id,p.ref,p.direction,p.amount,p.status,p.created_at,m.name method_name FROM payments p JOIN payment_methods m ON m.id=p.method_id WHERE party_type=\'repair\' AND party_id=? ORDER BY p.id', id);
  const f = repairFinancials(ctx, j); out.totals = { total: f.revenue, collected: f.collected, balance: f.balance };
  if (ctx.can('profit.view')) out.financials = f; else if (ctx.can('cost.view')) out.financials = { parts_cost: f.parts_cost };
  if (j.technician_id) out.technician_name = ctx.get('SELECT name FROM users WHERE id=?', j.technician_id)?.name;
  out.branch = { name: br.name, code: br.code, address: br.address, phone: br.phone, currency: br.currency }; return out;
}
export function listRepairs(ctx, f = {}) {
  ctx.need('repairs.view'); const b = ctx.inBranches('j.branch_id'); const w = ['j.org_id=?', b.sql]; const a = [ctx.org_id];
  if (!ctx.can('repairs.viewall') && !ctx.can('repairs.create')) { w.push('j.technician_id=?'); a.push(ctx.user.id); }
  if (f.branch_id) { ctx.branch(f.branch_id); w.push('j.branch_id=?'); a.push(Number(f.branch_id)); }
  if (f.business_id) { w.push('j.business_id=?'); a.push(Number(f.business_id)); }
  if (f.status) { w.push('j.status=?'); a.push(f.status); } if (f.technician_id) { w.push('j.technician_id=?'); a.push(Number(f.technician_id)); }
  if (f.overdue) { w.push("j.status NOT IN ('completed','delivered','cancelled','unrepairable') AND j.est_completion < ?"); a.push(f.today || new Date().toISOString().slice(0, 10)); }
  if (f.q) { w.push('(j.ref LIKE ? OR j.customer_name LIKE ? OR j.serial LIKE ? OR j.customer_phone LIKE ?)'); a.push(...Array(4).fill(`%${f.q}%`)); }
  const limit = Math.min(Number(f.limit) || 50, 200);
  const total = ctx.get(`SELECT COUNT(*) c FROM repair_jobs j WHERE ${w.join(' AND ')}`, ...a).c;
  const rows = ctx.all(`SELECT j.id,j.ref,j.status,j.customer_name,j.customer_phone,j.brand,j.model,j.serial,j.fault,j.est_completion,j.est_price,j.business_date,j.branch_id,br.name branch_name,u.name technician_name FROM repair_jobs j JOIN branches br ON br.id=j.branch_id LEFT JOIN users u ON u.id=j.technician_id WHERE ${w.join(' AND ')} ORDER BY j.id DESC LIMIT ${limit} OFFSET ${(Math.max(Number(f.page) || 1, 1) - 1) * limit}`, ...a);
  return { total, rows };
}
