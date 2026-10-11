import { AppError, bad, notFound, forbidden } from './errors.js';
import { ApprovalNeeded, registerApproval } from './core.js';
import { int, allocate } from './money.js';
import { nowIso } from './time.js';
import { applyPayment, method } from './payments.js';
import { customerBalance } from './sales.js';
import { str } from './admin.js';

// ---------- Customers & suppliers ----------
export function saveCustomer(ctx, id, c) {
  ctx.need(id ? 'customers.edit' : 'customers.create');
  return ctx.tx(() => {
    if (id) {
      const o = ctx.get('SELECT * FROM customers WHERE id=? AND org_id=?', id, ctx.org_id); if (!o) throw notFound('customer');
      for (const k of ['name', 'phone', 'email', 'address', 'notes']) if (k in c) ctx.run(`UPDATE customers SET ${k}=? WHERE id=?`, c[k], id);
      if ('credit_limit' in c) { ctx.need('customers.settings'); ctx.run('UPDATE customers SET credit_limit=? WHERE id=?', int(c.credit_limit, 'credit_limit', { min: 0 }), id); }
      if ('active' in c) ctx.run('UPDATE customers SET active=? WHERE id=?', c.active ? 1 : 0, id);
      ctx.audit('customer.update', 'customer', id, o, c); return { id };
    }
    const nid = ctx.run('INSERT INTO customers(org_id,name,phone,email,address,notes,created_at) VALUES(?,?,?,?,?,?,?)', ctx.org_id, str(c.name, 'name'), c.phone || null, c.email || null, c.address || null, c.notes || null, nowIso()).lastInsertRowid;
    ctx.audit('customer.create', 'customer', nid, null, c); return { id: nid };
  });
}
export function listCustomers(ctx, { q, page = 1, limit = 50, with_balance } = {}) {
  ctx.need('customers.view'); const w = ['org_id=?', 'active=1']; const a = [ctx.org_id];
  if (q) { w.push('(name LIKE ? OR phone LIKE ?)'); a.push(`%${q}%`, `%${q}%`); }
  limit = Math.min(Number(limit) || 50, 200);
  const rows = ctx.all(`SELECT id,name,phone,email,address,credit_limit FROM customers WHERE ${w.join(' AND ')} ORDER BY name LIMIT ${limit} OFFSET ${(Math.max(Number(page) || 1, 1) - 1) * limit}`, ...a).map((c) => ({ ...c, balance: customerBalance(ctx, c.id).balance }));
  return { rows: with_balance ? rows.filter((r) => r.balance > 0) : rows };
}
export function customerStatement(ctx, id, { from = '0000-01-01', to = '9999-12-31' } = {}) {
  ctx.need('customers.view'); const c = ctx.get('SELECT * FROM customers WHERE id=? AND org_id=?', id, ctx.org_id); if (!c) throw notFound('customer');
  const ids = ctx.branchIds().join(',') || '0'; const ev = [];
  for (const s of ctx.all(`SELECT id,ref,business_date d,total,returned_total,currency FROM sales WHERE org_id=? AND customer_id=? AND status='completed' AND branch_id IN (${ids})`, ctx.org_id, id)) {
    ev.push({ date: s.d, ref: s.ref, type: 'invoice', debit: s.total, credit: 0, currency: s.currency });
    if (s.returned_total) for (const r of ctx.all('SELECT ref,business_date d,net+tax amt FROM returns WHERE sale_id=?', s.id)) ev.push({ date: r.d, ref: r.ref, type: 'return', debit: 0, credit: r.amt, currency: s.currency });
  }
  for (const j of ctx.all(`SELECT id,ref,revenue_date d,currency FROM repair_jobs WHERE org_id=? AND customer_id=? AND revenue_date IS NOT NULL AND branch_id IN (${ids})`, ctx.org_id, id))
    ev.push({ date: j.d, ref: j.ref, type: 'repair', debit: ctx.get('SELECT COALESCE(SUM(qty*unit_price),0) t FROM repair_charges WHERE job_id=? AND approved=1 AND voided=0', j.id).t, credit: 0, currency: j.currency });
  for (const p of ctx.all(`SELECT ref,business_date d,direction,amount,currency FROM payments WHERE org_id=? AND customer_id=? AND status='confirmed' AND party_type IN ('sale','repair') AND branch_id IN (${ids})`, ctx.org_id, id))
    ev.push({ date: p.d, ref: p.ref, type: p.direction === 'in' ? 'payment' : 'refund', debit: p.direction === 'out' ? p.amount : 0, credit: p.direction === 'in' ? p.amount : 0, currency: p.currency });
  ev.sort((x, y) => x.date.localeCompare(y.date) || x.ref.localeCompare(y.ref));
  const byCcy = {}; const rows = [];
  for (const e of ev) { byCcy[e.currency] = (byCcy[e.currency] || 0) + e.debit - e.credit; if (e.date >= from && e.date <= to) rows.push({ ...e, balance: byCcy[e.currency] }); }
  // customer "paid in advance" on repair deposits shows as negative until completion; balance() covers completed jobs only
  return { customer: { id: c.id, name: c.name, phone: c.phone }, from, to, rows, closing: byCcy };
}
export function saveSupplier(ctx, id, s) {
  ctx.need(id ? 'suppliers.edit' : 'suppliers.create');
  return ctx.tx(() => {
    if (id) { const o = ctx.get('SELECT * FROM suppliers WHERE id=? AND org_id=?', id, ctx.org_id); if (!o) throw notFound('supplier'); for (const k of ['name', 'phone', 'email', 'address', 'notes']) if (k in s) ctx.run(`UPDATE suppliers SET ${k}=? WHERE id=?`, s[k], id); if ('active' in s) ctx.run('UPDATE suppliers SET active=? WHERE id=?', s.active ? 1 : 0, id); ctx.audit('supplier.update', 'supplier', id, o, s); return { id }; }
    const nid = ctx.run('INSERT INTO suppliers(org_id,name,phone,email,address,notes,created_at) VALUES(?,?,?,?,?,?,?)', ctx.org_id, str(s.name, 'name'), s.phone || null, s.email || null, s.address || null, s.notes || null, nowIso()).lastInsertRowid;
    ctx.audit('supplier.create', 'supplier', nid, null, s); return { id: nid };
  });
}
export function listSuppliers(ctx, { q } = {}) {
  ctx.need('suppliers.view'); const ids = ctx.branchIds().join(',') || '0';
  return { rows: ctx.all(`SELECT s.id,s.name,s.phone,s.email,s.address, COALESCE((SELECT SUM(billed-paid) FROM purchases p WHERE p.supplier_id=s.id AND p.branch_id IN (${ids}) AND p.status<>'cancelled'),0) balance FROM suppliers s WHERE s.org_id=? AND s.active=1 ${q ? 'AND s.name LIKE ?' : ''} ORDER BY s.name`, ...(q ? [ctx.org_id, `%${q}%`] : [ctx.org_id])) };
}
export function supplierStatement(ctx, id, { from = '0000-01-01', to = '9999-12-31' } = {}) {
  ctx.need('suppliers.view'); const s = ctx.get('SELECT * FROM suppliers WHERE id=? AND org_id=?', id, ctx.org_id); if (!s) throw notFound('supplier');
  const ids = ctx.branchIds().join(',') || '0'; const ev = [];
  for (const p of ctx.all(`SELECT id,ref,business_date d,billed,currency FROM purchases WHERE org_id=? AND supplier_id=? AND branch_id IN (${ids}) AND status<>'cancelled'`, ctx.org_id, id)) ev.push({ date: p.d, ref: p.ref, type: 'bill', debit: 0, credit: p.billed, currency: p.currency });
  for (const p of ctx.all(`SELECT ref,business_date d,direction,amount,currency FROM payments WHERE org_id=? AND supplier_id=? AND party_type='purchase' AND status='confirmed' AND branch_id IN (${ids})`, ctx.org_id, id)) ev.push({ date: p.d, ref: p.ref, type: p.direction === 'out' ? 'payment' : 'refund', debit: p.direction === 'out' ? p.amount : 0, credit: p.direction === 'in' ? p.amount : 0, currency: p.currency });
  ev.sort((x, y) => x.date.localeCompare(y.date) || x.ref.localeCompare(y.ref)); const bal = {}; const rows = [];
  for (const e of ev) { bal[e.currency] = (bal[e.currency] || 0) + e.credit - e.debit; if (e.date >= from && e.date <= to) rows.push({ ...e, balance: bal[e.currency] }); }
  return { supplier: { id: s.id, name: s.name }, from, to, rows, closing: bal };
}

// ---------- Expenses ----------
export function createExpense(ctx, e, opts = {}) {
  if (!opts.approvedBy) ctx.need('expenses.create');
  const scope = e.scope || 'branch'; if (!['branch', 'business', 'org'].includes(scope)) throw bad('invalid_scope');
  const amount = int(e.amount, 'amount', { min: 1 });
  let br = null; if (scope === 'branch') br = ctx.branch(e.branch_id);
  else if (!ctx.all_branches) throw forbidden('Only organisation-wide roles can book shared expenses', 'scope_forbidden');
  const cat = ctx.get('SELECT * FROM expense_categories WHERE id=? AND org_id=?', e.category_id, ctx.org_id); if (!cat) throw notFound('category');
  if (!opts.approvedBy && !ctx.limitOk('expense_max', amount)) throw new ApprovalNeeded('expense', br?.id || null, amount, `Expense ${amount} (${cat.name}) ${e.description || ''}`.trim(), e);
  return ctx.tx(() => {
    let targets; let business = null;
    if (scope === 'branch') targets = [br]; else if (scope === 'business') { business = ctx.get('SELECT * FROM businesses WHERE id=? AND org_id=?', e.business_id, ctx.org_id); if (!business) throw notFound('business'); targets = ctx.all('SELECT * FROM branches WHERE business_id=? AND org_id=? AND active=1', business.id, ctx.org_id); }
    else targets = ctx.all('SELECT * FROM branches WHERE org_id=? AND active=1', ctx.org_id);
    if (!targets.length) throw bad('no_branches', 'Nothing to allocate to');
    const ccy = targets[0].currency; if (targets.some((t) => t.currency !== ccy)) throw bad('mixed_currency', 'Shared expenses can only be allocated across branches that use the same currency; book one expense per currency');
    const date = e.expense_date || ctx.today(targets[0]); for (const t of targets) ctx.guardDay(t, date);
    let m = null, session = null; if (e.method_id) { m = method(ctx, e.method_id); if (m.kind === 'cash' && br) { session = ctx.openSession(br, ctx.user.id); if (!session && br.require_register) throw new AppError(409, 'register_required', 'Open a cash register session first'); } }
    const rule = scope === 'branch' ? null : (e.alloc_rule || 'equal'); let parts;
    if (scope === 'branch') parts = [amount];
    else if (rule === 'equal') parts = allocate(amount, targets.map(() => 1));
    else if (rule === 'revenue') parts = allocate(amount, targets.map((t) => Math.max(0, ctx.get("SELECT COALESCE(SUM(l.net),0) n FROM sale_lines l JOIN sales s ON s.id=l.sale_id WHERE s.branch_id=? AND s.status='completed' AND s.business_date>=date(?, '-30 day')", t.id, date).n)));
    else if (rule === 'percent') { const bps = targets.map((t) => int(e.percents?.[t.id] ?? 0, 'percent', { min: 0 })); if (bps.reduce((a, b) => a + b, 0) !== 10000) throw bad('percent_sum', 'Percentages must add up to 100%'); parts = allocate(amount, bps); }
    else throw bad('invalid_rule');
    const id = ctx.run(`INSERT INTO expenses(org_id,ref,scope,business_id,branch_id,category_id,description,amount,currency,alloc_rule,status,method_id,method_kind,session_id,expense_date,created_by,approved_by,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,'approved',?,?,?,?,?,?,?)`, ctx.org_id, ctx.ref('EXP', br || targets[0]), scope, business?.id || null, br?.id || null, cat.id, e.description || null, amount, ccy, rule, m?.id || null, m?.kind || null, session?.id || null, date, ctx.user.id, opts.approvedBy || ctx.user.id, nowIso()).lastInsertRowid;
    targets.forEach((t, i) => { if (parts[i] > 0) ctx.run('INSERT INTO expense_allocations(expense_id,branch_id,amount) VALUES(?,?,?)', id, t.id, parts[i]); });
    ctx.audit('expense.create', 'expense', id, null, { scope, amount, rule, approved_by: opts.approvedBy }, br?.id);
    return { id, allocations: parts };
  });
}
registerApproval('expense', { limitKey: 'expense_max', valueOf: (_p, a) => a.amount, perm: 'expenses.approve' }, (rctx, p, o) => createExpense(rctx, p, o));
export function voidExpense(ctx, id, reason) {
  ctx.need('expenses.void'); if (!reason) throw bad('reason_required', 'A reason is required');
  return ctx.tx(() => {
    const e = ctx.get('SELECT * FROM expenses WHERE id=? AND org_id=?', id, ctx.org_id); if (!e) throw notFound('expense');
    const al = ctx.all('SELECT branch_id FROM expense_allocations WHERE expense_id=?', id); if (al.some((a) => !ctx.branchIds().includes(a.branch_id))) throw notFound('expense');
    if (e.status === 'void') throw new AppError(409, 'already_void', 'Already void');
    if (e.session_id && ctx.get("SELECT status FROM register_sessions WHERE id=?", e.session_id).status !== 'open') throw new AppError(409, 'session_closed', 'The register session is closed; record a correcting entry instead');
    ctx.run("UPDATE expenses SET status='void' WHERE id=?", id); ctx.audit('expense.void', 'expense', id, { status: e.status }, { status: 'void', reason }, e.branch_id); return { id };
  });
}
export function listExpenses(ctx, f = {}) {
  ctx.need('expenses.view'); const b = ctx.inBranches('a.branch_id'); const w = ['e.org_id=?', `EXISTS(SELECT 1 FROM expense_allocations a WHERE a.expense_id=e.id AND ${b.sql})`]; const a = [ctx.org_id];
  if (f.branch_id) { ctx.branch(f.branch_id); w.push('EXISTS(SELECT 1 FROM expense_allocations a2 WHERE a2.expense_id=e.id AND a2.branch_id=?)'); a.push(Number(f.branch_id)); }
  if (f.category_id) { w.push('e.category_id=?'); a.push(Number(f.category_id)); } if (f.from) { w.push('e.expense_date>=?'); a.push(f.from); } if (f.to) { w.push('e.expense_date<=?'); a.push(f.to); } if (f.status) { w.push('e.status=?'); a.push(f.status); }
  const limit = Math.min(Number(f.limit) || 50, 200);
  const rows = ctx.all(`SELECT e.*, c.name category, u.name user_name FROM expenses e JOIN expense_categories c ON c.id=e.category_id LEFT JOIN users u ON u.id=e.created_by WHERE ${w.join(' AND ')} ORDER BY e.id DESC LIMIT ${limit} OFFSET ${(Math.max(Number(f.page) || 1, 1) - 1) * limit}`, ...a);
  return { rows: rows.map((e) => ({ ...e, allocations: ctx.all(`SELECT a.branch_id, a.amount, br.name branch_name FROM expense_allocations a JOIN branches br ON br.id=a.branch_id WHERE a.expense_id=? AND ${b.sql}`, e.id) })) };
}

// ---------- Cash registers & day closing ----------
export function openRegister(ctx, r) {
  ctx.need('registers.create'); const br = ctx.branch(r.branch_id);
  return ctx.tx(() => {
    ctx.guardDay(br); if (ctx.openSession(br)) throw new AppError(409, 'session_open', 'You already have an open register session at this branch');
    const id = ctx.run('INSERT INTO register_sessions(org_id,branch_id,name,opened_by,opened_at,opening_cash,business_date) VALUES(?,?,?,?,?,?,?)', ctx.org_id, br.id, r.name || 'Main', ctx.user.id, nowIso(), int(r.opening_cash ?? 0, 'opening_cash', { min: 0 }), ctx.today(br)).lastInsertRowid;
    ctx.audit('register.open', 'register', id, null, r, br.id); return { id };
  });
}
function sessionRow(ctx, id) {
  const s = ctx.get('SELECT * FROM register_sessions WHERE id=? AND org_id=?', id, ctx.org_id); if (!s || !ctx.branchIds().includes(s.branch_id)) throw notFound('register session');
  if (s.opened_by !== ctx.user.id && !ctx.can('registers.edit') && !ctx.can('registers.approve') && !ctx.can('reports.view')) throw notFound('register session'); return s;
}
export function sessionTotals(ctx, s) {
  const cash = (cond) => ctx.get(`SELECT COALESCE(SUM(p.amount),0) a FROM payments p WHERE p.session_id=? AND p.method_kind='cash' AND p.status='confirmed' AND ${cond}`, s.id).a;
  const salesIn = cash("p.direction='in' AND p.party_type IN ('sale','repair') AND p.is_collection=0");
  const allIn = cash("p.direction='in'"); const collections = allIn - salesIn;
  const refunds = cash("p.direction='out' AND p.party_type IN ('sale','repair')"); const payouts = cash("p.direction='out' AND p.party_type='payout'"); const supplierPay = cash("p.direction='out' AND p.party_type='purchase'");
  const expenses = ctx.get("SELECT COALESCE(SUM(amount),0) a FROM expenses WHERE session_id=? AND method_kind='cash' AND status='approved'", s.id).a;
  const mv = ctx.get('SELECT COALESCE(SUM(amount),0) a FROM cash_movements WHERE session_id=?', s.id).a;
  const expected = s.opening_cash + allIn - refunds - payouts - supplierPay - expenses + mv;
  return { opening: s.opening_cash, cash_sales: salesIn, debt_collections: collections, cash_refunds: refunds, cash_expenses: expenses, employee_payouts: payouts, supplier_payments: supplierPay, cash_added_removed: mv, expected };
}
export function cashMovement(ctx, id, m) {
  ctx.need('registers.create'); const s = sessionRow(ctx, id); if (s.status !== 'open') throw new AppError(409, 'session_closed', 'Session is closed');
  const amount = int(m.amount, 'amount'); if (!amount) throw bad('zero_amount'); if (!m.note) throw bad('note_required', 'Explain the cash movement');
  return ctx.tx(() => { const mid = ctx.run('INSERT INTO cash_movements(org_id,session_id,amount,note,user_id,created_at) VALUES(?,?,?,?,?,?)', ctx.org_id, id, amount, m.note, ctx.user.id, nowIso()).lastInsertRowid; ctx.audit('register.movement', 'register', id, null, m, s.branch_id); return { id: mid }; });
}
export function closeRegister(ctx, id, c) {
  ctx.need('registers.create');
  return ctx.tx(() => {
    const s = sessionRow(ctx, id); if (s.status !== 'open') throw new AppError(409, 'session_closed', 'Session already closed');
    if (s.opened_by !== ctx.user.id && !ctx.can('registers.edit')) throw forbidden('Only the cashier or a manager can close this register', 'not_owner');
    const counted = int(c.counted, 'counted', { min: 0 }); const t = sessionTotals(ctx, s); const diff = counted - t.expected;
    if (diff !== 0 && !c.explanation) throw bad('explanation_required', 'Explain the cash difference');
    const br = ctx.branch(s.branch_id);
    ctx.run("UPDATE register_sessions SET status='closed', closed_at=?, expected=?, counted=?, difference=?, explanation=?, closed_by=? WHERE id=?", nowIso(), t.expected, counted, diff, c.explanation || null, ctx.user.id, id);
    if (diff !== 0) ctx.notify('cash_discrepancy', `Cash difference ${diff} at ${br.name} (session ${id})`, { branch_id: br.id, link: '#/registers', params: { session_id: id, difference: diff } });
    ctx.audit('register.close', 'register', id, { status: 'open' }, { expected: t.expected, counted, difference: diff }, br.id);
    return { id, ...t, counted, difference: diff };
  });
}
export function approveRegister(ctx, id) {
  ctx.need('registers.approve');
  return ctx.tx(() => {
    const s = sessionRow(ctx, id); if (s.status !== 'closed') throw new AppError(409, 'not_closed', 'Close the session first'); if (s.approved_by) throw new AppError(409, 'already_approved', 'Already approved');
    if (s.closed_by === ctx.user.id && s.difference !== 0 && !ctx.can('registers.settings')) throw forbidden('A different user must approve a session with a difference', 'self_approval');
    ctx.run('UPDATE register_sessions SET approved_by=?, approved_at=? WHERE id=?', ctx.user.id, nowIso(), id); ctx.audit('register.approve', 'register', id, null, { by: ctx.user.id }, s.branch_id); return { id };
  });
}
export function listRegisters(ctx, f = {}) {
  ctx.need('registers.view'); const b = ctx.inBranches('r.branch_id'); const w = ['r.org_id=?', b.sql]; const a = [ctx.org_id];
  if (!ctx.can('registers.edit') && !ctx.can('registers.approve') && !ctx.can('reports.view')) { w.push('r.opened_by=?'); a.push(ctx.user.id); }
  if (f.branch_id) { ctx.branch(f.branch_id); w.push('r.branch_id=?'); a.push(Number(f.branch_id)); } if (f.status) { w.push('r.status=?'); a.push(f.status); } if (f.discrepancy) w.push('r.difference<>0');
  if (f.from) { w.push('r.business_date>=?'); a.push(f.from); } if (f.to) { w.push('r.business_date<=?'); a.push(f.to); }
  const rows = ctx.all(`SELECT r.*, u.name opened_name, c.name closed_name, ap.name approved_name, br.name branch_name FROM register_sessions r JOIN users u ON u.id=r.opened_by JOIN branches br ON br.id=r.branch_id LEFT JOIN users c ON c.id=r.closed_by LEFT JOIN users ap ON ap.id=r.approved_by WHERE ${w.join(' AND ')} ORDER BY r.id DESC LIMIT 100`, ...a);
  return { rows: rows.map((r) => ({ ...r, live: r.status === 'open' ? sessionTotals(ctx, r) : undefined })) };
}
export function registerDetail(ctx, id) { const s = sessionRow(ctx, id); ctx.need('registers.view'); return { ...s, totals: sessionTotals(ctx, s), movements: ctx.all('SELECT * FROM cash_movements WHERE session_id=?', id) }; }

// A closed day blocks new transactions dated that day; nothing is deleted or altered.
export function closeDay(ctx, { branch_id, date }) {
  ctx.need('registers.approve'); const br = ctx.branch(branch_id); const d = date || ctx.today(br);
  return ctx.tx(() => {
    if (ctx.get("SELECT 1 x FROM register_sessions WHERE branch_id=? AND status='open'", br.id)) throw new AppError(409, 'registers_open', 'Close all register sessions before closing the day');
    const ex = ctx.get('SELECT * FROM day_closings WHERE org_id=? AND branch_id=? AND business_date=?', ctx.org_id, br.id, d);
    if (ex && !ex.reopened_at) throw new AppError(409, 'already_closed', 'Day already closed');
    if (ex) ctx.run('UPDATE day_closings SET closed_by=?, closed_at=?, reopened_by=NULL, reopened_at=NULL, reopen_reason=NULL WHERE id=?', ctx.user.id, nowIso(), ex.id);
    else ctx.run('INSERT INTO day_closings(org_id,branch_id,business_date,closed_by,closed_at) VALUES(?,?,?,?,?)', ctx.org_id, br.id, d, ctx.user.id, nowIso());
    ctx.audit('day.close', 'branch', br.id, null, { date: d }, br.id); return { branch_id: br.id, date: d };
  });
}
export function reopenDay(ctx, { branch_id, date, reason }) {
  ctx.need('registers.settings'); const br = ctx.branch(branch_id); if (!reason) throw bad('reason_required', 'A reason is required');
  return ctx.tx(() => {
    const ex = ctx.get('SELECT * FROM day_closings WHERE org_id=? AND branch_id=? AND business_date=? AND reopened_at IS NULL', ctx.org_id, br.id, date); if (!ex) throw notFound('closed day');
    ctx.run('UPDATE day_closings SET reopened_by=?, reopened_at=?, reopen_reason=? WHERE id=?', ctx.user.id, nowIso(), reason, ex.id);
    ctx.audit('day.reopen', 'branch', br.id, { date, closed_by: ex.closed_by }, { reason }, br.id); ctx.notify('day_reopened', `Business day ${date} reopened at ${br.name}: ${reason}`, { branch_id: br.id }); return { ok: true };
  });
}
export function listDayClosings(ctx, { branch_id } = {}) { ctx.need('registers.view'); const b = ctx.inBranches('branch_id'); return { rows: ctx.all(`SELECT * FROM day_closings WHERE org_id=? AND ${b.sql} ${branch_id ? 'AND branch_id=' + Number(branch_id) : ''} ORDER BY business_date DESC LIMIT 60`, ctx.org_id) }; }

// ---------- Settings: services, payment methods, categories ----------
export function saveService(ctx, id, s) {
  ctx.need('services.settings');
  return ctx.tx(() => {
    if (id) { const o = ctx.get('SELECT * FROM services WHERE id=? AND org_id=?', id, ctx.org_id); if (!o) throw notFound('service'); for (const k of ['name', 'duration_min']) if (k in s) ctx.run(`UPDATE services SET ${k}=? WHERE id=?`, s[k], id); for (const k of ['price', 'consumable_cost']) if (k in s) ctx.run(`UPDATE services SET ${k}=? WHERE id=?`, int(s[k], k, { min: 0 }), id); if ('active' in s) ctx.run('UPDATE services SET active=? WHERE id=?', s.active ? 1 : 0, id); ctx.audit('service.update', 'service', id, o, s); return { id }; }
    const b = ctx.get('SELECT * FROM businesses WHERE id=? AND org_id=?', s.business_id, ctx.org_id); if (!b) throw notFound('business');
    const nid = ctx.run('INSERT INTO services(org_id,business_id,name,price,duration_min,consumable_cost) VALUES(?,?,?,?,?,?)', ctx.org_id, b.id, str(s.name, 'name'), int(s.price, 'price', { min: 0 }), s.duration_min || null, int(s.consumable_cost ?? 0, 'consumable_cost', { min: 0 })).lastInsertRowid;
    ctx.audit('service.create', 'service', nid, null, s); return { id: nid };
  });
}
export function listServices(ctx, { business_id, branch_id } = {}) {
  if (!ctx.can('services.view') && !ctx.can('services.settings')) ctx.need('services.view');
  const bid = branch_id ? ctx.branch(branch_id).business_id : business_id; const ids = ctx.branchIds().join(',') || '0';
  return { rows: ctx.all(`SELECT * FROM services WHERE org_id=? AND business_id IN (SELECT business_id FROM branches WHERE id IN (${ids})) ${bid ? 'AND business_id=' + Number(bid) : ''} ORDER BY name`, ctx.org_id).map((s) => (ctx.can('cost.view') ? s : { ...s, consumable_cost: undefined })) };
}
export function listMethods(ctx) { return { rows: ctx.all('SELECT * FROM payment_methods WHERE org_id=? ORDER BY id', ctx.org_id) }; }
export function saveMethod(ctx, id, m) {
  ctx.need('settings.settings');
  return ctx.tx(() => {
    if (id) { const o = ctx.get('SELECT * FROM payment_methods WHERE id=? AND org_id=?', id, ctx.org_id); if (!o) throw notFound('method'); if ('active' in m) ctx.run('UPDATE payment_methods SET active=? WHERE id=?', m.active ? 1 : 0, id); if (m.name) ctx.run('UPDATE payment_methods SET name=? WHERE id=?', m.name, id); ctx.audit('method.update', 'method', id, o, m); return { id }; }
    if (!['cash', 'mobile', 'bank', 'card', 'credit', 'other'].includes(m.kind)) throw bad('invalid_kind');
    try { const nid = ctx.run('INSERT INTO payment_methods(org_id,name,kind) VALUES(?,?,?)', ctx.org_id, str(m.name, 'name'), m.kind).lastInsertRowid; ctx.audit('method.create', 'method', nid, null, m); return { id: nid }; }
    catch (e) { if (/UNIQUE/.test(e.message)) throw new AppError(409, 'duplicate_name', 'Name already used'); throw e; }
  });
}
export function saveCategory(ctx, name) { ctx.need('settings.settings'); try { return { id: ctx.run('INSERT INTO expense_categories(org_id,name) VALUES(?,?)', ctx.org_id, str(name, 'name')).lastInsertRowid }; } catch (e) { if (/UNIQUE/.test(e.message)) throw new AppError(409, 'duplicate_name', 'Name already used'); throw e; } }
export function listCategories(ctx) { return { rows: ctx.all('SELECT * FROM expense_categories WHERE org_id=? ORDER BY name', ctx.org_id) }; }
export function setExchangeRate(ctx, r) {
  ctx.need('settings.settings'); const ppm = int(r.rate_ppm, 'rate_ppm', { min: 1 });
  ctx.run('INSERT INTO exchange_rates(org_id,from_ccy,to_ccy,rate_ppm,effective_date) VALUES(?,?,?,?,?) ON CONFLICT(org_id,from_ccy,to_ccy,effective_date) DO UPDATE SET rate_ppm=excluded.rate_ppm', ctx.org_id, r.from_ccy, r.to_ccy, ppm, r.effective_date || nowIso().slice(0, 10)); ctx.audit('fx.set', 'fx', null, null, r); return { ok: true };
}
export function setBranchAccount(ctx, branchId, methodId, opening) { ctx.need('settings.settings'); const br = ctx.branch(branchId); method(ctx, methodId); ctx.run('INSERT INTO branch_accounts VALUES(?,?,?) ON CONFLICT(branch_id,method_id) DO UPDATE SET opening_balance=excluded.opening_balance', br.id, methodId, int(opening, 'opening_balance')); ctx.audit('account.opening', 'branch', br.id, null, { methodId, opening }, br.id); return { ok: true }; }
