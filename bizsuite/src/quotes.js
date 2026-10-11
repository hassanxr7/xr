import { AppError, bad, notFound } from './errors.js';
import { int, mulBp, allocate } from './money.js';
import { nowIso, addDays } from './time.js';
import { variantInOrg } from './inventory.js';
import { createSale } from './sales.js';

export function createQuote(ctx, q) {
  ctx.need('sales.create'); const br = ctx.branch(q.branch_id); ctx.requireModule(br, 'sales');
  if (!(q.lines || []).length) throw bad('lines_required', 'Add at least one item');
  return ctx.tx(() => {
    const lines = q.lines.map((l) => { const v = variantInOrg(ctx, l.variant_id); if (v.business_id !== br.business_id) throw bad('wrong_business', 'Item belongs to another business'); const qty = int(l.qty ?? 1, 'qty', { min: 1 }); const price = int(l.unit_price ?? v.price, 'unit_price', { min: 0 });
      if (price !== v.price && !ctx.can('sales.approve')) throw bad('price_override', 'Price override needs approval rights'); return { variant_id: v.id, serial: l.serial, description: `${v.pname} ${Object.values(JSON.parse(v.attrs)).join(' ')}`.trim(), qty, unit_price: price, discount: int(l.discount ?? 0, 'discount', { min: 0 }) }; });
    const gross = lines.map((l) => l.qty * l.unit_price); lines.forEach((l, i) => { if (l.discount > gross[i]) throw bad('discount_too_large', 'Discount exceeds line amount'); });
    const after = gross.map((g, i) => g - lines[i].discount); const od = int(q.discount ?? 0, 'discount', { min: 0 }); if (od > after.reduce((a, b) => a + b, 0)) throw bad('discount_too_large', 'Discount exceeds total');
    const sh = allocate(od, after); const net = after.map((a, i) => a - sh[i]); const tax = net.reduce((a, n) => a + mulBp(n, br.tax_bp), 0); const total = net.reduce((a, b) => a + b, 0) + tax;
    let name = q.customer_name || null; if (q.customer_id) { const c = ctx.get('SELECT name FROM customers WHERE id=? AND org_id=?', q.customer_id, ctx.org_id); if (!c) throw notFound('customer'); name = c.name; }
    const id = ctx.run(`INSERT INTO quotes(org_id,business_id,branch_id,ref,customer_id,customer_name,valid_until,currency,subtotal,discount,tax,total,lines,note,user_id,created_at,business_date) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      ctx.org_id, br.business_id, br.id, ctx.ref('QUO', br), q.customer_id || null, name, q.valid_until || addDays(ctx.today(br), 14), br.currency, gross.reduce((a, b) => a + b, 0), lines.reduce((a, l) => a + l.discount, 0) + od, tax, total, JSON.stringify({ lines, order_discount: od }), q.note || null, ctx.user.id, nowIso(), ctx.today(br)).lastInsertRowid;
    ctx.audit('quote.create', 'quote', id, null, { total }, br.id); return { id, ref: ctx.get('SELECT ref FROM quotes WHERE id=?', id).ref, total };
  });
}
function row(ctx, id) { const q = ctx.get('SELECT * FROM quotes WHERE id=? AND org_id=?', id, ctx.org_id); if (!q || !ctx.branchIds().includes(q.branch_id)) throw notFound('quotation'); return q; }
export function setQuoteStatus(ctx, id, status) {
  ctx.need('sales.create'); const q = row(ctx, id); if (!['sent', 'accepted', 'rejected'].includes(status)) throw bad('invalid_status');
  if (['converted', 'rejected'].includes(q.status)) throw new AppError(409, 'invalid_state', 'Quotation is closed'); ctx.run('UPDATE quotes SET status=? WHERE id=?', status, id); ctx.audit('quote.status', 'quote', id, { status: q.status }, { status }, q.branch_id); return { id, status };
}
export function convertQuote(ctx, id, { payments = [] } = {}) {
  ctx.need('sales.create');
  const q0 = row(ctx, id); if (q0.status === 'converted') throw new AppError(409, 'already_converted', 'Already converted'); if (q0.status === 'rejected') throw new AppError(409, 'invalid_state', 'Quotation was rejected');
  if (q0.valid_until < ctx.today(ctx.branch(q0.branch_id))) { ctx.run("UPDATE quotes SET status='expired' WHERE id=?", id); throw new AppError(409, 'quote_expired', 'Quotation has expired', { valid_until: q0.valid_until }); } // persisted outside the conversion transaction
  return ctx.tx(() => {
    const q = row(ctx, id);
    const data = JSON.parse(q.lines);
    const sale = createSale(ctx, { branch_id: q.branch_id, kind: 'retail', customer_id: q.customer_id || undefined, customer_name: q.customer_name || undefined, discount: data.order_discount || undefined, lines: data.lines.map(({ variant_id, serial, qty, unit_price, discount }) => ({ variant_id, serial, qty, unit_price, discount })), payments, note: 'From ' + q.ref }, { approvedBy: ctx.can('sales.approve') ? ctx.user.id : undefined });
    ctx.run("UPDATE quotes SET status='converted', converted_sale_id=? WHERE id=?", sale.id, id); ctx.audit('quote.convert', 'quote', id, null, { sale: sale.ref }, q.branch_id); return sale;
  });
}
export function listQuotes(ctx, { status, branch_id, page = 1 } = {}) {
  ctx.need('sales.view'); const b = ctx.inBranches('q.branch_id'); const w = ['q.org_id=?', b.sql]; const a = [ctx.org_id];
  ctx.run(`UPDATE quotes SET status='expired' WHERE org_id=? AND status IN ('draft','sent','accepted') AND valid_until < ? AND ${ctx.inBranches('branch_id').sql}`, ctx.org_id, new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10)); if (status) { w.push('q.status=?'); a.push(status); } if (branch_id) { ctx.branch(branch_id); w.push('q.branch_id=?'); a.push(Number(branch_id)); }
  return { rows: ctx.all(`SELECT q.id,q.ref,q.status,q.customer_name,q.valid_until,q.currency,q.total,q.business_date,q.converted_sale_id,br.name branch_name,u.name user_name FROM quotes q JOIN branches br ON br.id=q.branch_id JOIN users u ON u.id=q.user_id WHERE ${w.join(' AND ')} ORDER BY q.id DESC LIMIT 50 OFFSET ${(Math.max(Number(page) || 1, 1) - 1) * 50}`, ...a) };
}
export function getQuote(ctx, id) { ctx.need('sales.view'); const q = row(ctx, id); const br = ctx.get('SELECT name,code,address,phone,receipt_header,receipt_footer,invoice_terms FROM branches WHERE id=?', q.branch_id); return { ...q, ...JSON.parse(q.lines), branch: br }; }
