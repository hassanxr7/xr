// Sales (retail) and customer visits (barber). One sale row == one customer visit / invoice.
import { AppError, bad, notFound, forbidden } from './errors.js';
import { ApprovalNeeded, registerApproval } from './core.js';
import { int, mulBp, divRound, allocate } from './money.js';
import { nowIso } from './time.js';
import { stockOut, stockIn, variantInOrg, deviceEvent } from './inventory.js';
import { applyPayment, refreshParty } from './payments.js';
import { syncSaleCommission } from './commissions.js';

const addMonths = (ymd, n) => { const d = new Date(ymd + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };

export function createSale(ctx, s, opts = {}) {
  const kind = s.kind === 'service' ? 'service' : 'retail';
  const mod = kind === 'service' ? 'services' : 'sales';
  const br = ctx.branch(s.branch_id); if (!opts.approvedBy) ctx.need(`${mod}.create`);
  ctx.requireModule(br, mod);
  if (!(s.lines || []).length) throw bad('lines_required', 'Add at least one item');
  // --- price/discount preparation (outside the write tx so approval requests do not roll back) ---
  const prepared = [];
  for (const l of s.lines) {
    const qty = int(l.qty ?? 1, 'qty', { min: 1, max: 100000 });
    if (kind === 'service') {
      const sv = ctx.get('SELECT * FROM services WHERE id=? AND org_id=? AND business_id=? AND active=1', l.service_id, ctx.org_id, br.business_id); if (!sv) throw notFound('service');
      const barberId = l.barber_id ?? (ctx.can('services.record_any') ? null : ctx.user.id); if (!barberId) throw bad('barber_required', 'Select the barber for each service');
      if (barberId !== ctx.user.id && !ctx.can('services.record_any') && !opts.approvedBy) throw forbidden('You can only record your own services', 'own_only');
      const b = ctx.get('SELECT u.* FROM users u WHERE u.id=? AND u.org_id=? AND u.active=1 AND (EXISTS(SELECT 1 FROM user_branches ub WHERE ub.user_id=u.id AND ub.branch_id=?) OR EXISTS(SELECT 1 FROM roles r WHERE r.id=u.role_id AND r.scope=\'org\'))', barberId, ctx.org_id, br.id);
      if (!b) throw bad('invalid_barber', 'Barber is not assigned to this branch');
      const price = l.unit_price != null ? int(l.unit_price, 'unit_price', { min: 0 }) : sv.price;
      if (price !== sv.price && !ctx.can('sales.approve') && !ctx.can('services.approve') && !opts.approvedBy) throw forbidden('Price override needs approval rights', 'price_override');
      prepared.push({ service: sv, barber: b, qty, price, desc: sv.name, cost: sv.consumable_cost * qty, discount: int(l.discount ?? 0, 'discount', { min: 0 }) });
    } else {
      let v, device = null;
      if (l.serial || l.device_id) {
        device = l.device_id ? ctx.get('SELECT * FROM devices WHERE id=? AND org_id=?', l.device_id, ctx.org_id) : ctx.get('SELECT * FROM devices WHERE serial=? AND org_id=?', String(l.serial).toUpperCase(), ctx.org_id);
        if (!device) throw notFound('device'); v = variantInOrg(ctx, device.variant_id);
      } else v = variantInOrg(ctx, l.variant_id);
      if (v.business_id !== br.business_id) throw bad('wrong_business', 'Item belongs to another business');
      if (!v.active) throw bad('inactive_item', 'Item is inactive');
      if (v.kind === 'serialized') { if (!device) throw bad('serial_required', 'Select the exact device (serial/IMEI)', { variant_id: v.id }); if (qty !== 1) throw bad('serial_qty', 'Serialized items are sold one unit at a time'); if (!s.customer_id) throw bad('customer_required', 'A customer record is required for serialized devices'); }
      else if (device) throw bad('not_serialized');
      const price = l.unit_price != null ? int(l.unit_price, 'unit_price', { min: 0 }) : v.price;
      if (price !== v.price && !ctx.can('sales.approve') && !opts.approvedBy) throw forbidden('Price override needs approval rights', 'price_override');
      prepared.push({ variant: v, device, qty, price, desc: `${v.pname} ${Object.values(JSON.parse(v.attrs)).join(' ')}`.trim(), discount: int(l.discount ?? 0, 'discount', { min: 0 }) });
    }
  }
  const gross = prepared.map((p) => p.qty * p.price);
  prepared.forEach((p, i) => { if (p.discount > gross[i]) throw bad('discount_too_large', 'Discount exceeds line amount'); });
  const orderDisc = int(s.discount ?? 0, 'discount', { min: 0 });
  const afterLine = prepared.map((p, i) => gross[i] - p.discount); if (orderDisc > afterLine.reduce((a, b) => a + b, 0)) throw bad('discount_too_large', 'Discount exceeds total');
  const share = allocate(orderDisc, afterLine); prepared.forEach((p, i) => { p.discountTotal = p.discount + share[i]; p.net = gross[i] - p.discountTotal; });
  const totalDisc = prepared.reduce((a, p) => a + p.discountTotal, 0); const totalGross = gross.reduce((a, b) => a + b, 0);
  const discBp = totalGross ? divRound(totalDisc * 10000, totalGross) : 0;
  if (!opts.approvedBy && totalDisc > 0 && !ctx.limitOk('discount_bp', discBp))
    throw new ApprovalNeeded('sale_discount', br.id, discBp, `Discount ${(discBp / 100).toFixed(2)}% on a ${kind} at ${br.name}`, s);
  const payments = s.payments || [];

  return ctx.tx(() => {
    ctx.guardDay(br); const date = ctx.today(br);
    let customerName = s.customer_name || null;
    if (s.customer_id) { const c = ctx.get('SELECT * FROM customers WHERE id=? AND org_id=? AND active=1', s.customer_id, ctx.org_id); if (!c) throw notFound('customer'); customerName = c.name; }
    if (s.department_id && !ctx.get('SELECT 1 x FROM departments WHERE id=? AND branch_id=?', s.department_id, br.id)) throw notFound('department');
    for (const p of prepared) p.tax = mulBp(p.net, br.tax_bp);
    const tax = prepared.reduce((a, p) => a + p.tax, 0); const subtotal = prepared.reduce((a, p) => a + p.net, 0) + totalDisc; const total = subtotal - totalDisc + tax;
    const tip = int(s.tip ?? 0, 'tip', { min: 0 });
    const sid = ctx.run(`INSERT INTO sales(org_id,business_id,branch_id,department_id,ref,kind,customer_id,customer_name,currency,subtotal,discount,tax,total,tip,tip_to,user_id,approved_by,note,created_at,business_date)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, ctx.org_id, br.business_id, br.id, s.department_id || null, ctx.ref(kind === 'service' ? 'VIS' : 'INV', br), kind, s.customer_id || null, customerName || (kind === 'service' ? 'Walk-in' : null),
    br.currency, subtotal, totalDisc, tax, total, tip, tip ? br.tip_to : null, ctx.user.id, opts.approvedBy || null, s.note || null, nowIso(), date).lastInsertRowid;
    for (const p of prepared) {
      let cost = 0, warrantyEnd = null;
      if (p.service) cost = p.cost;
      else if (p.device) {
        const d = ctx.get('SELECT * FROM devices WHERE id=?', p.device.id);
        if (d.status !== 'in_stock' || d.branch_id !== br.id) throw new AppError(409, 'device_unavailable', `Device ${d.serial} is not available in this branch (status: ${d.status})`, { serial: d.serial });
        cost = stockOut(ctx, br.id, p.variant.id, 1, 'sale', 'sale', sid, { exactCost: d.cost });
        warrantyEnd = p.variant.warranty_months ? addMonths(date, p.variant.warranty_months) : null;
      } else cost = stockOut(ctx, br.id, p.variant.id, p.qty, 'sale', 'sale', sid);
      const lid = ctx.run(`INSERT INTO sale_lines(sale_id,variant_id,device_id,service_id,barber_id,description,qty,unit_price,discount,net,tax,cost_total,commission_bp,warranty_end) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        sid, p.variant?.id || null, p.device?.id || null, p.service?.id || null, p.barber?.id || null, p.desc, p.qty, p.price, p.discountTotal, p.net, p.tax, cost, p.barber ? p.barber.commission_bp : 0, warrantyEnd).lastInsertRowid;
      if (p.device) {
        ctx.run("UPDATE devices SET status='sold', sale_id=?, sale_line_id=?, customer_id=?, sold_at=?, warranty_start=?, warranty_end=? WHERE id=?", sid, lid, s.customer_id, nowIso(), warrantyEnd ? date : null, warrantyEnd, p.device.id);
        deviceEvent(ctx, p.device.id, 'sold', ['sale', sid], customerName);
      }
      if (p.variant) { const st = ctx.get('SELECT qty FROM stock WHERE branch_id=? AND variant_id=?', br.id, p.variant.id); if (st.qty <= p.variant.min_stock) ctx.notify(st.qty === 0 ? 'out_of_stock' : 'low_stock', `${p.desc} is ${st.qty === 0 ? 'out of stock' : 'low on stock'} (${st.qty}) at ${br.name}`, { branch_id: br.id, dedupe: `low:${br.id}:${p.variant.id}:${date}`, link: '#/inventory' }); }
    }
    // payments
    let paidNow = 0;
    for (const pay of payments) {
      const amount = int(pay.amount, 'amount', { min: 1 }); if (paidNow + amount > total) throw new AppError(409, 'overpayment', 'Payments exceed the total', { total });
      applyPayment(ctx, br, { ...pay, party_type: 'sale', party_id: sid, customer_id: s.customer_id }); if ((pay.status || 'confirmed') === 'confirmed') paidNow += amount;
    }
    const pendingAny = payments.some((p) => p.status === 'pending');
    if (paidNow < total && !pendingAny && !opts.deferPayment) {
      if (!s.customer_id) throw bad('customer_required_for_credit', 'Full payment is required for walk-in customers; select a customer to sell on credit');
      if (!br.allow_credit) throw bad('credit_disabled', 'Credit sales are disabled for this branch');
      const c = ctx.get('SELECT credit_limit FROM customers WHERE id=?', s.customer_id);
      if (c.credit_limit > 0 && customerBalance(ctx, s.customer_id, [br.id]).balance + (total - paidNow) > c.credit_limit) throw new AppError(409, 'credit_limit', 'Customer credit limit exceeded', { limit: c.credit_limit });
    }
    refreshParty(ctx, 'sale', sid); syncSaleCommission(ctx, sid, 'accrual');
    ctx.audit(kind === 'service' ? 'visit.create' : 'sale.create', 'sale', sid, null, { total, discount: totalDisc, approved_by: opts.approvedBy }, br.id);
    const row = ctx.get('SELECT id,ref,total,paid,payment_status FROM sales WHERE id=?', sid);
    return row;
  });
}
registerApproval('sale_discount', { limitKey: 'discount_bp', valueOf: (_p, a) => a.amount, perm: 'sales.approve' }, (rctx, p, o) => createSale(rctx, p, o));

export function customerBalance(ctx, customerId, branchIds) {
  const ids = (branchIds || ctx.branchIds()).join(',') || '0';
  const s = ctx.get(`SELECT COALESCE(SUM(total-returned_total-paid),0) b FROM sales WHERE org_id=? AND customer_id=? AND status='completed' AND branch_id IN (${ids})`, ctx.org_id, customerId).b;
  const r = ctx.all(`SELECT id FROM repair_jobs WHERE org_id=? AND customer_id=? AND status IN ('completed','delivered') AND branch_id IN (${ids})`, ctx.org_id, customerId);
  let rb = 0; for (const j of r) { const t = ctx.get(`SELECT COALESCE(SUM(qty*unit_price),0) t FROM repair_charges WHERE job_id=? AND approved=1 AND voided=0`, j.id).t; rb += t - ctx.get(`SELECT COALESCE(SUM(CASE direction WHEN 'in' THEN amount ELSE -amount END),0) n FROM payments WHERE party_type='repair' AND party_id=? AND status='confirmed'`, j.id).n; }
  return { balance: s + rb, sales: s, repairs: rb };
}

// ---------- Returns & voids ----------
export function returnSale(ctx, r, opts = {}) {
  const sale0 = ctx.get('SELECT * FROM sales WHERE id=? AND org_id=?', r.sale_id, ctx.org_id); if (!sale0 || !ctx.branchIds().includes(sale0.branch_id)) throw notFound('sale');
  const mod = sale0.kind === 'service' ? 'services' : 'sales'; const br = ctx.branch(sale0.branch_id);
  if (sale0.status !== 'completed') throw new AppError(409, 'sale_void', 'Sale is void');
  // compute refund preview to evaluate limits
  const calc = (lines) => lines.map((w) => {
    const l = ctx.get('SELECT * FROM sale_lines WHERE id=? AND sale_id=?', w.sale_line_id, sale0.id); if (!l) throw notFound('sale line');
    const qty = int(w.qty ?? l.qty - l.returned_qty, 'qty', { min: 1 }); if (qty > l.qty - l.returned_qty) throw bad('over_return', 'Cannot return more than sold', { line: l.id });
    const last = qty === l.qty - l.returned_qty;
    const net = last ? l.net - l.returned_net : divRound(l.net * qty, l.qty); const tax = last ? l.tax - l.returned_tax : divRound(l.tax * qty, l.qty);
    return { l, qty, net, tax, restock: l.device_id ? true : w.restock !== false };
  });
  const prev = calc(r.lines || []); if (!prev.length) throw bad('lines_required', 'Select items to return');
  const refundTotal = prev.reduce((a, x) => a + x.net + x.tax, 0);
  if (!opts.approvedBy && !ctx.can(`${mod}.refund`)) throw new ApprovalNeeded('sale_refund', br.id, refundTotal, `Refund of ${refundTotal} on ${sale0.ref} requested at ${br.name}`, r);
  if (!opts.approvedBy && !ctx.limitOk('refund_max', refundTotal)) throw new ApprovalNeeded('sale_refund', br.id, refundTotal, `Refund of ${refundTotal} on ${sale0.ref} exceeds limit at ${br.name}`, r);
  return ctx.tx(() => {
    ctx.guardDay(br); const date = ctx.today(br); const sale = ctx.get('SELECT * FROM sales WHERE id=?', sale0.id);
    const lines = calc(r.lines); let net = 0, tax = 0, costRev = 0;
    const rid = ctx.run('INSERT INTO returns(org_id,branch_id,sale_id,ref,net,tax,refund,cost_reversed,reason,user_id,approved_by,created_at,business_date) VALUES(?,?,?,?,0,0,0,0,?,?,?,?,?)', ctx.org_id, br.id, sale.id, ctx.ref('RET', br), r.reason || null, ctx.user.id, opts.approvedBy || null, nowIso(), date).lastInsertRowid;
    for (const x of lines) {
      let cr = 0;
      if (x.restock && x.l.variant_id) {
        const remainingCost = x.l.cost_total - x.l.cost_reversed; const last = x.qty === x.l.qty - x.l.returned_qty;
        cr = last ? remainingCost : Math.min(remainingCost, divRound(x.l.cost_total * x.qty, x.l.qty));
        if (x.l.device_id) { ctx.run("UPDATE devices SET status='returned' WHERE id=?", x.l.device_id); deviceEvent(ctx, x.l.device_id, 'returned_by_customer', ['sale', sale.id], r.reason); }
        stockIn(ctx, br.id, x.l.variant_id, x.qty, cr, 'sale_return', 'return', rid, r.reason);
      } else if (x.l.device_id) { ctx.run("UPDATE devices SET status='returned' WHERE id=?", x.l.device_id); deviceEvent(ctx, x.l.device_id, 'returned_not_restocked', ['sale', sale.id], r.reason); }
      ctx.run('UPDATE sale_lines SET returned_qty=returned_qty+?, returned_net=returned_net+?, returned_tax=returned_tax+?, cost_reversed=cost_reversed+? WHERE id=?', x.qty, x.net, x.tax, cr, x.l.id);
      ctx.run('INSERT INTO return_lines(return_id,sale_line_id,qty,net,tax,restock,cost_reversed) VALUES(?,?,?,?,?,?,?)', rid, x.l.id, x.qty, x.net, x.tax, x.restock ? 1 : 0, cr);
      net += x.net; tax += x.tax; costRev += cr;
    }
    const newReturned = sale.returned_total + net + tax; ctx.run('UPDATE sales SET returned_total=? WHERE id=?', newReturned, sale.id);
    // cash refund = whatever the customer has paid beyond what they still owe
    const excess = sale.paid - (sale.total - newReturned); let refund = 0;
    if (excess > 0) {
      if (!r.refund_method_id) throw bad('refund_method_required', 'Select how the refund is paid');
      refund = excess; applyPayment(ctx, br, { direction: 'out', party_type: 'sale', party_id: sale.id, customer_id: sale.customer_id, method_id: r.refund_method_id, amount: refund, note: 'Refund ' + sale.ref });
    }
    ctx.run('UPDATE returns SET net=?, tax=?, refund=?, cost_reversed=? WHERE id=?', net, tax, refund, costRev, rid);
    refreshParty(ctx, 'sale', sale.id); syncSaleCommission(ctx, sale.id, 'refund_reversal');
    ctx.audit('sale.return', 'return', rid, null, { sale: sale.ref, net, tax, refund, approved_by: opts.approvedBy }, br.id);
    return { id: rid, net, tax, refund };
  });
}
registerApproval('sale_refund', { limitKey: 'refund_max', valueOf: (_p, a) => a.amount, perm: 'sales.refund' }, (rctx, p, o) => returnSale(rctx, p, o));

export function voidSale(ctx, id, reason) {
  const sale0 = ctx.get('SELECT * FROM sales WHERE id=? AND org_id=?', id, ctx.org_id); if (!sale0 || !ctx.branchIds().includes(sale0.branch_id)) throw notFound('sale');
  ctx.need(`${sale0.kind === 'service' ? 'services' : 'sales'}.void`); if (!reason) throw bad('reason_required', 'A reason is required');
  return ctx.tx(() => {
    const br = ctx.branch(sale0.branch_id); ctx.guardDay(br, sale0.business_date);
    const s = ctx.get('SELECT * FROM sales WHERE id=?', id);
    if (s.status === 'void') throw new AppError(409, 'sale_void', 'Already void'); if (s.returned_total > 0) throw new AppError(409, 'has_returns', 'A sale with returns cannot be voided');
    if (s.business_date !== ctx.today(br)) throw new AppError(409, 'void_too_late', 'Only same-day sales can be voided; use a return instead');
    for (const l of ctx.all('SELECT * FROM sale_lines WHERE sale_id=?', id)) {
      if (l.variant_id) stockIn(ctx, br.id, l.variant_id, l.qty, l.cost_total, 'void_restock', 'sale', id, reason);
      if (l.device_id) { ctx.run("UPDATE devices SET status='in_stock', sale_id=NULL, sale_line_id=NULL, customer_id=NULL, sold_at=NULL, warranty_start=NULL, warranty_end=NULL WHERE id=?", l.device_id); deviceEvent(ctx, l.device_id, 'sale_voided', ['sale', id], reason); }
    }
    ctx.run("UPDATE sales SET status='void', void_reason=? WHERE id=?", reason, id);
    for (const p of ctx.all("SELECT * FROM payments WHERE party_type='sale' AND party_id=? AND status='confirmed' AND direction='in' AND reversed_by IS NULL", id)) {
      const rid = applyPayment(ctx, br, { direction: 'out', party_type: 'sale', party_id: id, customer_id: s.customer_id, method_id: p.method_id, amount: p.amount, reverses_id: p.id, note: 'Void ' + s.ref }); ctx.run('UPDATE payments SET reversed_by=? WHERE id=?', rid, p.id);
    }
    refreshParty(ctx, 'sale', id); syncSaleCommission(ctx, id, 'void');
    ctx.audit('sale.void', 'sale', id, { status: 'completed', total: s.total }, { status: 'void', reason }, br.id); return { id, status: 'void' };
  });
}

// Exchange = return + new sale in one atomic operation; refund value is carried by the 'Exchange credit' method (no cash moves).
export function exchange(ctx, x) {
  return ctx.tx(() => {
    const cm = ctx.get("SELECT id FROM payment_methods WHERE org_id=? AND kind='credit' AND active=1", ctx.org_id); if (!cm) throw bad('no_credit_method', 'Configure an Exchange credit payment method');
    const ret = returnSale(ctx, { ...x.return, refund_method_id: cm.id });
    const br = ctx.branch(ctx.get('SELECT branch_id FROM sales WHERE id=?', x.return.sale_id).branch_id);
    const payments = [...(x.sale.payments || [])];
    const custId = x.sale.customer_id ?? ctx.get('SELECT customer_id FROM sales WHERE id=?', x.return.sale_id).customer_id;
    const sale = createSale(ctx, { ...x.sale, branch_id: br.id, customer_id: custId, payments: [] }, { deferPayment: true });
    const credit = Math.min(ret.refund, sale.total);
    if (credit > 0) { applyPayment(ctx, br, { party_type: 'sale', party_id: sale.id, method_id: cm.id, amount: credit, note: 'Exchange credit' }); refreshParty(ctx, 'sale', sale.id); }
    for (const p of payments) { const due = ctx.get('SELECT total-returned_total-paid d FROM sales WHERE id=?', sale.id).d; if (due <= 0) break; applyPayment(ctx, br, { ...p, party_type: 'sale', party_id: sale.id, amount: Math.min(p.amount, due) }); refreshParty(ctx, 'sale', sale.id); }
    const left = ctx.get('SELECT total-returned_total-paid d FROM sales WHERE id=?', sale.id).d;
    if (left > 0 && !custId) throw bad('customer_required_for_credit', 'Full payment is required for walk-in customers');
    ctx.audit('sale.exchange', 'sale', sale.id, null, { returned_sale: x.return.sale_id, credit }, br.id);
    return { return: ret, sale: ctx.get('SELECT id,ref,total,paid,payment_status FROM sales WHERE id=?', sale.id) };
  });
}

// ---------- Queries ----------
export function saleFilter(ctx, f, alias = 's') {
  const b = ctx.inBranches(`${alias}.branch_id`); const w = [`${alias}.org_id=?`, b.sql]; const a = [ctx.org_id];
  if (f.branch_id) { ctx.branch(f.branch_id); w.push(`${alias}.branch_id=?`); a.push(Number(f.branch_id)); }
  if (f.branch_ids) { const ids = String(f.branch_ids).split(',').map(Number).filter((x) => b.ids.includes(x)); w.push(`${alias}.branch_id IN (${ids.join(',') || 0})`); }
  if (f.business_id) { w.push(`${alias}.business_id=?`); a.push(Number(f.business_id)); }
  if (f.business_type) { w.push(`${alias}.business_id IN (SELECT id FROM businesses WHERE type=?)`); a.push(f.business_type); }
  if (f.from) { w.push(`${alias}.business_date>=?`); a.push(f.from); } if (f.to) { w.push(`${alias}.business_date<=?`); a.push(f.to); }
  if (f.kind) { w.push(`${alias}.kind=?`); a.push(f.kind); } if (f.status) { w.push(`${alias}.status=?`); a.push(f.status); } if (f.payment_status) { w.push(`${alias}.payment_status=?`); a.push(f.payment_status); }
  if (f.customer_id) { w.push(`${alias}.customer_id=?`); a.push(Number(f.customer_id)); } if (f.department_id) { w.push(`${alias}.department_id=?`); a.push(Number(f.department_id)); }
  if (f.q) { w.push(`(${alias}.ref LIKE ? OR ${alias}.customer_name LIKE ?)`); a.push(`%${f.q}%`, `%${f.q}%`); }
  if (f.employee_id) { w.push(`(${alias}.user_id=? OR EXISTS(SELECT 1 FROM sale_lines x WHERE x.sale_id=${alias}.id AND x.barber_id=?))`); a.push(Number(f.employee_id), Number(f.employee_id)); }
  return { w, a };
}
function ownScope(ctx, kind) { return kind === 'service' ? !ctx.can('services.viewall') : !ctx.can('sales.viewall') && false; }
export function listSales(ctx, f = {}) {
  const kind = f.kind === 'service' ? 'service' : f.kind === 'retail' ? 'retail' : null;
  if (kind === 'service') ctx.need('services.view'); else if (kind === 'retail') ctx.need('sales.view'); else if (!ctx.can('sales.view') && !ctx.can('services.view')) ctx.need('sales.view');
  const { w, a } = saleFilter(ctx, f);
  if (!kind) w.push(`(s.kind='retail' AND ${ctx.can('sales.view') ? '1' : '0'} OR s.kind='service' AND ${ctx.can('services.view') ? '1' : '0'})`);
  if (ownScope(ctx, 'service') && kind !== 'retail') { w.push(`(s.kind<>'service' OR s.user_id=? OR EXISTS(SELECT 1 FROM sale_lines x WHERE x.sale_id=s.id AND x.barber_id=?))`); a.push(ctx.user.id, ctx.user.id); }
  const limit = Math.min(Number(f.limit) || 50, 200); const off = (Math.max(Number(f.page) || 1, 1) - 1) * limit;
  const total = ctx.get(`SELECT COUNT(*) c, COALESCE(SUM(s.total),0) t FROM sales s WHERE ${w.join(' AND ')}`, ...a);
  const rows = ctx.all(`SELECT s.id,s.ref,s.kind,s.status,s.payment_status,s.currency,s.total,s.paid,s.returned_total,s.discount,s.business_date,s.created_at,s.customer_name,br.name branch_name,u.name user_name FROM sales s JOIN branches br ON br.id=s.branch_id JOIN users u ON u.id=s.user_id WHERE ${w.join(' AND ')} ORDER BY s.id DESC LIMIT ${limit} OFFSET ${off}`, ...a);
  return { total: total.c, sum_total: total.t, rows };
}
export function getSale(ctx, id) {
  const s = ctx.get('SELECT s.*, br.name branch_name, br.code branch_code, br.address, br.phone, br.receipt_header, br.receipt_footer, br.invoice_terms, u.name user_name FROM sales s JOIN branches br ON br.id=s.branch_id JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.org_id=?', id, ctx.org_id);
  if (!s || !ctx.branchIds().includes(s.branch_id)) throw notFound('sale');
  ctx.need(s.kind === 'service' ? 'services.view' : 'sales.view');
  let lines = ctx.all('SELECT l.*, u.name barber_name, d.serial FROM sale_lines l LEFT JOIN users u ON u.id=l.barber_id LEFT JOIN devices d ON d.id=l.device_id WHERE l.sale_id=? ORDER BY l.id', id);
  if (s.kind === 'service' && !ctx.can('services.viewall')) { lines = lines.filter((l) => l.barber_id === ctx.user.id); if (!lines.length && s.user_id !== ctx.user.id) throw notFound('sale'); }
  const showCost = ctx.can('cost.view'); const showCom = ctx.can('commissions.viewall');
  lines = lines.map((l) => { const o = { ...l }; if (!showCost) { delete o.cost_total; delete o.cost_reversed; } if (!showCom && l.barber_id !== ctx.user.id) delete o.commission_bp; return o; });
  const out = { ...s, lines, payments: ctx.can('payments.view') || s.user_id === ctx.user.id ? ctx.all('SELECT p.id,p.ref,p.direction,p.amount,p.status,p.method_kind,m.name method_name,p.external_ref,p.provider,p.created_at,p.reverses_id FROM payments p JOIN payment_methods m ON m.id=p.method_id WHERE p.party_type=\'sale\' AND p.party_id=? ORDER BY p.id', id) : [],
    returns: ctx.all('SELECT * FROM returns WHERE sale_id=? ORDER BY id', id) };
  if (!showCost) delete out.approved_by; return out;
}
export function posSearch(ctx, { branch_id, q, barcode }) { // fast POS lookup by barcode/SKU/name, with in-branch devices
  const br = ctx.branch(branch_id); ctx.need('sales.view');
  const rows = ctx.all(`SELECT v.id,v.sku,v.barcode,v.price,v.attrs,p.name,p.kind,p.warranty_months,COALESCE(s.qty,0) qty FROM variants v JOIN products p ON p.id=v.product_id LEFT JOIN stock s ON s.variant_id=v.id AND s.branch_id=? WHERE v.org_id=? AND p.business_id=? AND v.active=1 AND p.active=1 AND (${barcode ? 'v.barcode=? OR v.sku=?' : 'p.name LIKE ? OR v.sku LIKE ? OR v.barcode LIKE ?'}) ORDER BY p.name LIMIT 30`,
    br.id, ctx.org_id, br.business_id, ...(barcode ? [barcode, barcode] : [`%${q}%`, `%${q}%`, `%${q}%`]));
  return rows.map((r) => ({ ...r, attrs: JSON.parse(r.attrs), devices: r.kind === 'serialized' ? ctx.all("SELECT id,serial FROM devices WHERE variant_id=? AND branch_id=? AND status='in_stock' ORDER BY id LIMIT 50", r.id, br.id) : undefined }));
}
