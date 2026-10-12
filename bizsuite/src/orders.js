// Scan-and-send baskets: a seller (or the mobile scanner) scans items and sends the basket to the branch;
// the manager on duty receives the money and presses Complete, which creates the real sale (stock, payments, commission).
// Nothing is taken from stock or recorded as revenue while an order is open.
import { AppError, bad, notFound, forbidden } from './errors.js';
import { int, mulBp } from './money.js';
import { nowIso } from './time.js';
import { variantInOrg } from './inventory.js';
import { createSale } from './sales.js';
import { ApprovalNeeded } from './core.js';

const canSend = (ctx) => ctx.can('orders.create') || ctx.can('sales.create');
const canComplete = (ctx) => ctx.can('sales.create') && ctx.can('sales.approve');

function priced(ctx, br, o) {
  if (!(o.lines || []).length) throw bad('lines_required', 'Add at least one item');
  if (o.lines.length > 200) throw bad('too_many_lines', 'Too many items in one order');
  const lines = []; let total = 0;
  for (const l of o.lines) {
    const v = variantInOrg(ctx, l.variant_id);
    if (v.business_id !== br.business_id) throw bad('wrong_business', 'Item belongs to another business');
    if (!v.active) throw bad('inactive_item', 'Item is inactive');
    const qty = int(l.qty ?? 1, 'qty', { min: 1, max: 100000 }); const discount = int(l.discount ?? 0, 'discount', { min: 0 });
    if (v.kind === 'serialized' && (!l.serial || qty !== 1)) throw bad('serial_required', 'Select the exact device (serial/IMEI)', { variant_id: v.id });
    const gross = qty * v.price; if (discount > gross) throw bad('discount_too_large', 'Discount exceeds line amount');
    const desc = `${v.pname} ${Object.values(JSON.parse(v.attrs)).join(' ')}`.trim();
    if (v.max_discount_bp != null && discount > mulBp(gross, v.max_discount_bp) && !ctx.can('sales.approve'))
      throw bad('discount_above_item_max', `Maximum discount on ${desc} is ${(v.max_discount_bp / 100).toFixed(2)}%`, { variant_id: v.id, max_discount_bp: v.max_discount_bp, max_amount: mulBp(gross, v.max_discount_bp) });
    const stock = ctx.get('SELECT qty FROM stock WHERE branch_id=? AND variant_id=?', br.id, v.id)?.qty || 0;
    if (stock < qty) throw new AppError(409, 'insufficient_stock', `Not enough stock for ${desc} (${stock} left)`, { variant_id: v.id, available: stock });
    lines.push({ variant_id: v.id, serial: l.serial ? String(l.serial).toUpperCase() : undefined, qty, discount, description: desc, unit_price: v.price, sku: v.sku });
    total += gross - discount;
  }
  const discount = int(o.discount ?? 0, 'discount', { min: 0 }); if (discount > total) throw bad('discount_too_large', 'Discount exceeds total');
  total -= discount; total += mulBp(total, br.tax_bp);
  return { lines, discount, total };
}

export function createOrder(ctx, o) {
  if (!canSend(ctx)) throw forbidden('You cannot send orders', 'missing_permission');
  const br = ctx.branch(o.branch_id); ctx.requireModule(br, 'sales');
  const p = priced(ctx, br, o);
  let customerName = o.customer_name ? String(o.customer_name).slice(0, 120) : null;
  if (o.customer_id) { const c = ctx.get('SELECT name FROM customers WHERE id=? AND org_id=? AND active=1', o.customer_id, ctx.org_id); if (!c) throw notFound('customer'); customerName = c.name; }
  return ctx.tx(() => {
    const ref = ctx.ref('ORD', br);
    const id = ctx.run('INSERT INTO orders(org_id,branch_id,ref,customer_id,customer_name,discount,lines,total,currency,note,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
      ctx.org_id, br.id, ref, o.customer_id || null, customerName, p.discount, JSON.stringify(p.lines), p.total, br.currency, o.note ? String(o.note).slice(0, 300) : null, ctx.user.id, nowIso()).lastInsertRowid;
    ctx.audit('order.create', 'order', id, null, { ref, total: p.total, items: p.lines.length }, br.id);
    ctx.notify('order_waiting', `Order ${ref} from ${ctx.user.name} is waiting for payment at ${br.name}`, { branch_id: br.id, link: '#/orders' });
    return { id, ref, total: p.total, currency: br.currency };
  });
}

export function listOrders(ctx, f = {}) {
  if (!canSend(ctx) && !canComplete(ctx)) throw forbidden('Not permitted', 'missing_permission');
  const b = ctx.inBranches('o.branch_id'); const w = ['o.org_id=?', b.sql]; const a = [ctx.org_id];
  if (f.branch_id) { ctx.branch(f.branch_id); w.push('o.branch_id=?'); a.push(Number(f.branch_id)); }
  if (f.status) { w.push('o.status=?'); a.push(String(f.status)); }
  if (!canComplete(ctx)) { w.push('o.created_by=?'); a.push(ctx.user.id); } // sellers see their own baskets
  const rows = ctx.all(`SELECT o.*, br.name branch_name, u.name created_by_name, cu.name completed_by_name, s.ref sale_ref FROM orders o JOIN branches br ON br.id=o.branch_id JOIN users u ON u.id=o.created_by LEFT JOIN users cu ON cu.id=o.completed_by LEFT JOIN sales s ON s.id=o.sale_id WHERE ${w.join(' AND ')} ORDER BY o.status='open' DESC, o.id DESC LIMIT 100`, ...a);
  return { rows: rows.map((r) => ({ ...r, lines: JSON.parse(r.lines) })), open: rows.filter((r) => r.status === 'open').length, can_complete: canComplete(ctx) };
}

function getOrder(ctx, id) {
  const o = ctx.get('SELECT * FROM orders WHERE id=? AND org_id=?', id, ctx.org_id); if (!o) throw notFound('order');
  ctx.branch(o.branch_id); return { ...o, lines: JSON.parse(o.lines) };
}

// Manager received the money: create the sale exactly as the POS would, attributed to the seller who scanned it.
export function completeOrder(ctx, id, body = {}) {
  if (!canComplete(ctx)) throw forbidden('Only a manager can complete an order', 'missing_permission');
  const o = getOrder(ctx, id); if (o.status !== 'open') throw new AppError(409, 'order_closed', 'This order is already completed or cancelled');
  return ctx.tx(() => {
    let sale; try { sale = createSale(ctx, {
      branch_id: o.branch_id, kind: 'retail', customer_id: body.customer_id || o.customer_id || undefined, customer_name: o.customer_name || undefined, discount: o.discount || undefined,
      lines: o.lines.map((l) => ({ variant_id: l.variant_id, serial: l.serial, qty: l.qty, discount: l.discount || undefined })), payments: body.payments || [], note: `${o.ref}${o.note ? ' · ' + o.note : ''}`,
    }, { sellerId: o.created_by }); } catch (e) { // an approval request would complete the sale later and leave the basket open: ask a higher authority instead
      if (e instanceof ApprovalNeeded) throw new AppError(409, 'order_discount_limit', 'The discount on this order is above your limit; ask the owner to complete it or reduce the discount'); throw e; }
    const ok = ctx.run("UPDATE orders SET status='completed', completed_by=?, completed_at=?, sale_id=? WHERE id=? AND status='open'", ctx.user.id, nowIso(), sale.id, o.id).changes;
    if (!ok) throw new AppError(409, 'order_closed', 'This order is already completed or cancelled');
    ctx.audit('order.complete', 'order', o.id, null, { sale_id: sale.id, ref: sale.ref }, o.branch_id);
    return { ...sale, order_ref: o.ref };
  });
}

export function cancelOrder(ctx, id, { reason } = {}) {
  const o = getOrder(ctx, id); if (o.status !== 'open') throw new AppError(409, 'order_closed', 'This order is already completed or cancelled');
  if (o.created_by !== ctx.user.id && !canComplete(ctx)) throw forbidden('Not permitted', 'missing_permission');
  ctx.tx(() => { ctx.run("UPDATE orders SET status='cancelled', completed_by=?, completed_at=?, cancel_reason=? WHERE id=?", ctx.user.id, nowIso(), reason ? String(reason).slice(0, 300) : null, o.id); ctx.audit('order.cancel', 'order', o.id, null, { reason }, o.branch_id); });
  return { ok: true };
}
