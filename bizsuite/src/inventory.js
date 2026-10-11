// Inventory: weighted-average costing. stock(qty,value): avg cost = value/qty. Every change writes a stock_movement.
import { AppError, bad, notFound } from './errors.js';
import { ApprovalNeeded, registerApproval } from './core.js';
import { int, divRound, allocate } from './money.js';
import { nowIso } from './time.js';
import { str } from './admin.js';

export function stockIn(ctx, branchId, variantId, qty, value, type, refType, refId, note) {
  if (qty <= 0) throw bad('invalid_qty', 'Quantity must be positive');
  ctx.run('INSERT INTO stock(branch_id,variant_id,qty,value) VALUES(?,?,?,?) ON CONFLICT(branch_id,variant_id) DO UPDATE SET qty=qty+excluded.qty, value=value+excluded.value', branchId, variantId, qty, value);
  ctx.run('INSERT INTO stock_movements(org_id,branch_id,variant_id,type,qty,value,ref_type,ref_id,note,user_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
    ctx.org_id, branchId, variantId, type, qty, value, refType, refId, note || null, ctx.user.id, nowIso());
}
// Removes qty at weighted-average cost (or exactCost for serialized units). Returns the cost removed.
export function stockOut(ctx, branchId, variantId, qty, type, refType, refId, { exactCost, note } = {}) {
  if (qty <= 0) throw bad('invalid_qty', 'Quantity must be positive');
  const s = ctx.get('SELECT qty,value FROM stock WHERE branch_id=? AND variant_id=?', branchId, variantId);
  if (!s || s.qty < qty) throw new AppError(409, 'insufficient_stock', 'Insufficient stock', { variant_id: variantId, available: s ? s.qty : 0, requested: qty });
  const cost = exactCost ?? (qty === s.qty ? s.value : divRound(s.value * qty, s.qty));
  ctx.run('UPDATE stock SET qty=qty-?, value=value-? WHERE branch_id=? AND variant_id=?', qty, cost, branchId, variantId);
  ctx.run('INSERT INTO stock_movements(org_id,branch_id,variant_id,type,qty,value,ref_type,ref_id,note,user_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
    ctx.org_id, branchId, variantId, type, -qty, -cost, refType, refId, note || null, ctx.user.id, nowIso());
  return cost;
}
export function variantInOrg(ctx, id) {
  const v = ctx.get('SELECT v.*, p.kind, p.name pname, p.business_id, p.warranty_months, p.is_part FROM variants v JOIN products p ON p.id=v.product_id WHERE v.id=? AND v.org_id=?', id, ctx.org_id);
  if (!v) throw notFound('variant'); return v;
}
const hideCost = (ctx, row) => { if (!ctx.can('cost.view')) { delete row.cost; delete row.value; delete row.avg_cost; } return row; };

// ---------- Products ----------
function validVariant(ctx, v) {
  return { sku: str(v.sku, 'sku', { max: 60 }), barcode: v.barcode || null, attrs: JSON.stringify(v.attrs || {}), cost: int(v.cost ?? 0, 'cost', { min: 0 }), price: int(v.price ?? 0, 'price', { min: 0 }), min_stock: int(v.min_stock ?? 0, 'min_stock', { min: 0 }) };
}
export function createProduct(ctx, p) {
  ctx.need('products.create');
  return ctx.tx(() => {
    const bu = ctx.get('SELECT * FROM businesses WHERE id=? AND org_id=?', p.business_id, ctx.org_id); if (!bu) throw notFound('business');
    if (!ctx.all_branches && !ctx.branchIds().some((b) => ctx.get('SELECT 1 x FROM branches WHERE id=? AND business_id=?', b, bu.id))) throw notFound('business');
    if (!['standard', 'serialized'].includes(p.kind || 'standard')) throw bad('invalid_kind');
    if (!(p.variants || []).length) throw bad('variants_required', 'At least one variant (size/colour/SKU) is required');
    const id = ctx.run('INSERT INTO products(org_id,business_id,name,category,brand,model,kind,is_part,warranty_months,image_file_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
      ctx.org_id, bu.id, str(p.name, 'name'), p.category || null, p.brand || null, p.model || null, p.kind || 'standard', p.is_part ? 1 : 0, int(p.warranty_months ?? 0, 'warranty_months', { min: 0, max: 120 }), p.image_file_id || null, nowIso()).lastInsertRowid;
    for (const v of p.variants) addVariantRow(ctx, id, v);
    ctx.audit('product.create', 'product', id, null, p); return { id };
  });
}
function addVariantRow(ctx, productId, v) {
  const x = validVariant(ctx, v);
  try { return ctx.run('INSERT INTO variants(org_id,product_id,sku,barcode,attrs,cost,price,min_stock) VALUES(?,?,?,?,?,?,?,?)', ctx.org_id, productId, x.sku, x.barcode, x.attrs, x.cost, x.price, x.min_stock).lastInsertRowid; }
  catch (e) { if (/UNIQUE/.test(e.message)) throw new AppError(409, 'duplicate_sku_or_barcode', 'SKU or barcode already exists', { sku: x.sku }); throw e; }
}
export function addVariant(ctx, productId, v) {
  ctx.need('products.create');
  const p = ctx.get('SELECT * FROM products WHERE id=? AND org_id=?', productId, ctx.org_id); if (!p) throw notFound('product');
  return ctx.tx(() => { const id = addVariantRow(ctx, p.id, v); ctx.audit('variant.create', 'variant', id, null, v); return { id }; });
}
export function updateVariant(ctx, id, v) {
  ctx.need('products.edit'); const old = variantInOrg(ctx, id);
  const sets = [], vals = [];
  for (const k of ['barcode']) if (k in v) { sets.push(`${k}=?`); vals.push(v[k] || null); }
  for (const k of ['price', 'cost', 'min_stock']) if (k in v) { sets.push(`${k}=?`); vals.push(int(v[k], k, { min: 0 })); }
  if ('active' in v) { sets.push('active=?'); vals.push(v.active ? 1 : 0); }
  if ('attrs' in v) { sets.push('attrs=?'); vals.push(JSON.stringify(v.attrs)); }
  if (!sets.length) return { id };
  try { ctx.tx(() => { ctx.run(`UPDATE variants SET ${sets.join(',')} WHERE id=? AND org_id=?`, ...vals, id, ctx.org_id); ctx.audit('variant.update', 'variant', id, { price: old.price, cost: old.cost, barcode: old.barcode }, v); }); }
  catch (e) { if (/UNIQUE/.test(e.message)) throw new AppError(409, 'duplicate_sku_or_barcode', 'Barcode already exists'); throw e; }
  return { id };
}
export function updateProduct(ctx, id, p) {
  ctx.need('products.edit'); const old = ctx.get('SELECT * FROM products WHERE id=? AND org_id=?', id, ctx.org_id); if (!old) throw notFound('product');
  ctx.tx(() => {
    for (const k of ['name', 'category', 'brand', 'model', 'image_file_id']) if (k in p) ctx.run(`UPDATE products SET ${k}=? WHERE id=?`, p[k], id);
    if ('active' in p) ctx.run('UPDATE products SET active=? WHERE id=?', p.active ? 1 : 0, id);
    ctx.audit('product.update', 'product', id, old, p);
  }); return { id };
}
// Search / barcode lookup. Branch-scoped stock; products limited to businesses the user can reach.
export function listVariants(ctx, { q, branch_id, business_id, barcode, low, page = 1, limit = 25, active } = {}) {
  ctx.need('products.view');
  const br = branch_id ? ctx.branch(branch_id) : null;
  const bids = br ? [br.id] : ctx.branchIds();
  const stockSql = `(SELECT COALESCE(SUM(qty),0) FROM stock s WHERE s.variant_id=v.id AND s.branch_id IN (${bids.join(',') || 0}))`;
  const valSql = `(SELECT COALESCE(SUM(value),0) FROM stock s WHERE s.variant_id=v.id AND s.branch_id IN (${bids.join(',') || 0}))`;
  const where = ['v.org_id=?', `p.business_id IN (SELECT business_id FROM branches WHERE id IN (${ctx.branchIds().join(',') || 0}))`]; const args = [ctx.org_id];
  if (br) { where.push('p.business_id=?'); args.push(br.business_id); }
  if (business_id) { where.push('p.business_id=?'); args.push(Number(business_id)); }
  if (barcode) { where.push('(v.barcode=? OR v.sku=?)'); args.push(barcode, barcode); }
  if (q) { where.push('(p.name LIKE ? OR v.sku LIKE ? OR v.barcode LIKE ? OR p.brand LIKE ? OR p.model LIKE ?)'); const l = `%${q.replace(/[%_]/g, '')}%`; args.push(l, l, l, l, l); }
  if (active !== undefined && active !== '') { where.push('v.active=?'); args.push(active ? 1 : 0); }
  const having = low ? `WHERE qty <= min_stock` : '';
  const base = `SELECT v.id,v.sku,v.barcode,v.attrs,v.cost,v.price,v.min_stock,v.active,p.id product_id,p.image_file_id,p.name,p.category,p.brand,p.model,p.kind,p.is_part,p.business_id,p.warranty_months,${stockSql} qty,${valSql} value,
    CASE WHEN ${stockSql}>0 THEN ${valSql}/${stockSql} ELSE v.cost END avg_cost FROM variants v JOIN products p ON p.id=v.product_id WHERE ${where.join(' AND ')}`;
  limit = Math.min(Number(limit) || 25, 200); const off = (Math.max(Number(page) || 1, 1) - 1) * limit;
  const total = ctx.get(`SELECT COUNT(*) c FROM (${base}) ${having}`, ...args).c;
  const rows = ctx.all(`SELECT * FROM (${base}) ${having} ORDER BY name,sku LIMIT ${limit} OFFSET ${off}`, ...args).map((r) => hideCost(ctx, { ...r, attrs: JSON.parse(r.attrs) }));
  return { total, page: Number(page) || 1, limit, rows };
}

// ---------- Stock ops ----------
export function stockLevels(ctx, { branch_id, low, page, limit, q } = {}) {
  ctx.need('inventory.view'); if (!branch_id) throw bad('branch_required', 'Select a branch'); ctx.branch(branch_id);
  const r = listVariants(ctx, { branch_id, low, page, limit, q });
  return r;
}
export function movements(ctx, { branch_id, variant_id, type, page = 1, limit = 50 } = {}) {
  ctx.need('inventory.view'); const b = ctx.inBranches('m.branch_id'); const w = [`m.org_id=?`, b.sql]; const a = [ctx.org_id];
  if (branch_id) { ctx.branch(branch_id); w.push('m.branch_id=?'); a.push(Number(branch_id)); }
  if (variant_id) { w.push('m.variant_id=?'); a.push(Number(variant_id)); }
  if (type) { w.push('m.type=?'); a.push(type); }
  limit = Math.min(Number(limit) || 50, 200);
  const rows = ctx.all(`SELECT m.*, v.sku, p.name, br.name branch_name, u.name user_name FROM stock_movements m JOIN variants v ON v.id=m.variant_id JOIN products p ON p.id=v.product_id JOIN branches br ON br.id=m.branch_id LEFT JOIN users u ON u.id=m.user_id WHERE ${w.join(' AND ')} ORDER BY m.id DESC LIMIT ${limit} OFFSET ${(Math.max(Number(page) || 1, 1) - 1) * limit}`, ...a);
  return { rows: rows.map((r) => hideCost(ctx, r)) };
}
export const ADJ_REASONS = ['damage', 'loss', 'found', 'correction', 'count'];
export function adjustStock(ctx, a, opts = {}) {
  ctx.need('inventory.edit'); const br = ctx.branch(a.branch_id);
  const delta = int(a.delta, 'delta'); if (delta === 0) throw bad('zero_delta', 'Adjustment cannot be zero');
  if (!ADJ_REASONS.includes(a.reason)) throw bad('invalid_reason', 'Reason must be one of ' + ADJ_REASONS.join(', '));
  const v = variantInOrg(ctx, a.variant_id); if (v.kind === 'serialized') throw bad('serialized_adjust', 'Serialized items are adjusted via the device register');
  if (!opts.approvedBy && !ctx.limitOk('adjust_qty', Math.abs(delta)))
    throw new ApprovalNeeded('stock_adjust', br.id, Math.abs(delta), `Stock adjustment ${delta} × ${v.sku} (${a.reason}) at ${br.name}`, { ...a, delta });
  return ctx.tx(() => {
    const s = ctx.get('SELECT qty,value FROM stock WHERE branch_id=? AND variant_id=?', br.id, v.id) || { qty: 0, value: 0 };
    if (delta > 0) stockIn(ctx, br.id, v.id, delta, s.qty ? divRound(s.value * delta, s.qty) : v.cost * delta, 'adjust_' + a.reason, 'adjust', null, a.note);
    else stockOut(ctx, br.id, v.id, -delta, 'adjust_' + a.reason, 'adjust', null, { note: a.note });
    ctx.audit('stock.adjust', 'variant', v.id, { qty: s.qty }, { delta, reason: a.reason, approved_by: opts.approvedBy }, br.id);
    return { ok: true };
  });
}
registerApproval('stock_adjust', { limitKey: 'adjust_qty', valueOf: (p) => Math.abs(p.delta), perm: 'inventory.approve' }, (rctx, p, o) => adjustStock(rctx, p, o));

export function countStock(ctx, c, opts = {}) {
  ctx.need('inventory.edit'); const br = ctx.branch(c.branch_id);
  const diffs = [];
  for (const l of c.lines || []) {
    const v = variantInOrg(ctx, l.variant_id); if (v.kind === 'serialized') continue;
    const s = ctx.get('SELECT qty FROM stock WHERE branch_id=? AND variant_id=?', br.id, v.id) || { qty: 0 };
    const counted = int(l.counted, 'counted', { min: 0 }); if (counted !== s.qty) diffs.push({ variant_id: v.id, system: s.qty, counted, delta: counted - s.qty });
  }
  const worst = Math.max(0, ...diffs.map((d) => Math.abs(d.delta)));
  if (!opts.approvedBy && !ctx.limitOk('adjust_qty', worst)) throw new ApprovalNeeded('stock_count', br.id, worst, `Stock count at ${br.name} with ${diffs.length} differences`, c);
  return ctx.tx(() => {
    for (const d of diffs) adjustStock(ctx, { branch_id: br.id, variant_id: d.variant_id, delta: d.delta, reason: 'count', note: 'Stock count' }, { approvedBy: opts.approvedBy || ctx.user.id });
    const id = ctx.run('INSERT INTO stock_counts(org_id,branch_id,ref,lines,user_id,created_at) VALUES(?,?,?,?,?,?)', ctx.org_id, br.id, ctx.ref('CNT', br), JSON.stringify(diffs), ctx.user.id, nowIso()).lastInsertRowid;
    ctx.audit('stock.count', 'stock_count', id, null, { differences: diffs.length }, br.id); return { id, differences: diffs };
  });
}
registerApproval('stock_count', { limitKey: 'adjust_qty', valueOf: (_p, a) => a.amount, perm: 'inventory.approve' }, (rctx, p, o) => countStock(rctx, p, o));

// ---------- Serialized devices ----------
export function registerDevice(ctx, br, variant, serial, cost, ref) {
  serial = String(serial || '').trim().toUpperCase(); if (!/^[A-Z0-9\-]{4,40}$/.test(serial)) throw bad('invalid_serial', 'Invalid serial/IMEI', { serial });
  try {
    const id = ctx.run('INSERT INTO devices(org_id,variant_id,serial,branch_id,status,cost,created_at) VALUES(?,?,?,?,?,?,?)', ctx.org_id, variant.id, serial, br.id, 'in_stock', cost, nowIso()).lastInsertRowid;
    ctx.run('INSERT INTO device_history(org_id,device_id,event,ref_type,ref_id,user_id,created_at) VALUES(?,?,?,?,?,?,?)', ctx.org_id, id, 'received', ref?.[0], ref?.[1], ctx.user.id, nowIso()); return id;
  } catch (e) { if (/UNIQUE/.test(e.message)) throw new AppError(409, 'duplicate_serial', `Serial/IMEI ${serial} already exists`, { serial }); throw e; }
}
export function deviceEvent(ctx, id, event, ref, note) { ctx.run('INSERT INTO device_history(org_id,device_id,event,ref_type,ref_id,user_id,note,created_at) VALUES(?,?,?,?,?,?,?,?)', ctx.org_id, id, event, ref?.[0] || null, ref?.[1] || null, ctx.user.id, note || null, nowIso()); }
export function listDevices(ctx, { q, status, branch_id, page = 1, limit = 50 } = {}) {
  ctx.need('devices.view'); const b = ctx.inBranches('d.branch_id'); const w = ['d.org_id=?', b.sql]; const a = [ctx.org_id];
  if (branch_id) { ctx.branch(branch_id); w.push('d.branch_id=?'); a.push(Number(branch_id)); }
  if (status) { w.push('d.status=?'); a.push(status); }
  if (q) { w.push('(d.serial LIKE ? OR p.name LIKE ?)'); a.push(`%${q}%`, `%${q}%`); }
  limit = Math.min(Number(limit) || 50, 200);
  return { rows: ctx.all(`SELECT d.id,d.serial,d.status,d.branch_id,d.cost,d.sold_at,d.warranty_start,d.warranty_end,d.sale_id,c.name customer_name,v.sku,p.name FROM devices d JOIN variants v ON v.id=d.variant_id JOIN products p ON p.id=v.product_id LEFT JOIN customers c ON c.id=d.customer_id WHERE ${w.join(' AND ')} ORDER BY d.id DESC LIMIT ${limit} OFFSET ${(Math.max(Number(page) || 1, 1) - 1) * limit}`, ...a).map((r) => hideCost(ctx, r)) };
}
export function deviceHistory(ctx, serial) {
  ctx.need('devices.view'); const d = ctx.get('SELECT * FROM devices WHERE org_id=? AND serial=?', ctx.org_id, String(serial).toUpperCase());
  if (!d || !ctx.branchIds().includes(d.branch_id)) throw notFound('device');
  return { device: hideCost(ctx, d), history: ctx.all('SELECT h.*,u.name user_name FROM device_history h LEFT JOIN users u ON u.id=h.user_id WHERE h.device_id=? ORDER BY h.id', d.id) };
}
// Returned device must be explicitly refurbished/re-inspected before it can be sold again.
export function restockDevice(ctx, id, { scrap, note } = {}) {
  ctx.need('devices.edit');
  return ctx.tx(() => {
    const d = ctx.get('SELECT * FROM devices WHERE id=? AND org_id=?', id, ctx.org_id); if (!d || !ctx.branchIds().includes(d.branch_id)) throw notFound('device');
    if (d.status !== 'returned') throw new AppError(409, 'invalid_device_state', 'Only returned devices can be re-inspected');
    if (scrap) { stockOut(ctx, d.branch_id, d.variant_id, 1, 'scrap', 'device', id, { exactCost: d.cost, note }); ctx.run("UPDATE devices SET status='scrapped' WHERE id=?", id); deviceEvent(ctx, id, 'scrapped', null, note); ctx.audit('device.scrap', 'device', id, { status: 'returned' }, { status: 'scrapped' }, d.branch_id); return { status: 'scrapped' }; }
    // stock quantity/value was restored when the return was processed; inspection only makes the unit saleable again
    ctx.run("UPDATE devices SET status='in_stock', sale_id=NULL, sale_line_id=NULL, customer_id=NULL, sold_at=NULL, warranty_start=NULL, warranty_end=NULL WHERE id=?", id);
    deviceEvent(ctx, id, 'restocked', null, note);
    ctx.audit('device.restock', 'device', id, { status: 'returned' }, { status: 'in_stock' }, d.branch_id); return { status: 'in_stock' };
  });
}

// ---------- Transfers (dispatch -> in transit -> receipt) ----------
export function createTransfer(ctx, t) {
  ctx.need('inventory.create'); const from = ctx.branch(t.from_branch_id);
  const to = ctx.get('SELECT * FROM branches WHERE id=? AND org_id=?', t.to_branch_id, ctx.org_id); if (!to) throw notFound('branch');
  if (to.id === from.id) throw bad('same_branch', 'Source and destination must differ');
  if (to.currency !== from.currency) throw bad('currency_mismatch', 'Transfers between different currencies are not supported');
  if (to.business_id !== from.business_id) throw bad('business_mismatch', 'Transfers are between branches of the same business');
  if (!(t.lines || []).length) throw bad('lines_required', 'Add at least one line');
  return ctx.tx(() => {
    const id = ctx.run('INSERT INTO transfers(org_id,ref,from_branch_id,to_branch_id,note,created_by,created_at) VALUES(?,?,?,?,?,?,?)', ctx.org_id, ctx.ref('TRF', from), from.id, to.id, t.note || null, ctx.user.id, nowIso()).lastInsertRowid;
    for (const l of t.lines) {
      const v = variantInOrg(ctx, l.variant_id); let qty = int(l.qty, 'qty', { min: 1 }); let cost;
      if (v.kind === 'serialized') {
        const ids = l.device_ids || []; if (ids.length !== qty) throw bad('devices_required', 'Select the exact devices to transfer');
        cost = 0; const lid = ctx.run('INSERT INTO transfer_lines(transfer_id,variant_id,qty,cost_total) VALUES(?,?,?,0)', id, v.id, qty).lastInsertRowid;
        for (const did of ids) {
          const d = ctx.get('SELECT * FROM devices WHERE id=? AND org_id=? AND branch_id=? AND variant_id=?', did, ctx.org_id, from.id, v.id);
          if (!d || d.status !== 'in_stock') throw new AppError(409, 'device_unavailable', 'Device not available for transfer', { device_id: did });
          cost += stockOut(ctx, from.id, v.id, 1, 'transfer_out', 'transfer', id, { exactCost: d.cost });
          ctx.run("UPDATE devices SET status='transit' WHERE id=?", did); ctx.run('INSERT INTO transfer_devices(line_id,device_id) VALUES(?,?)', lid, did); deviceEvent(ctx, did, 'transfer_dispatched', ['transfer', id]);
        }
        ctx.run('UPDATE transfer_lines SET cost_total=? WHERE id=?', cost, lid);
      } else {
        cost = stockOut(ctx, from.id, v.id, qty, 'transfer_out', 'transfer', id);
        ctx.run('INSERT INTO transfer_lines(transfer_id,variant_id,qty,cost_total) VALUES(?,?,?,?)', id, v.id, qty, cost);
      }
    }
    ctx.audit('transfer.dispatch', 'transfer', id, null, t, from.id); return { id };
  });
}
export function receiveTransfer(ctx, id, r = {}) {
  ctx.need('inventory.edit');
  return ctx.tx(() => {
    const t = ctx.get('SELECT * FROM transfers WHERE id=? AND org_id=?', id, ctx.org_id); if (!t) throw notFound('transfer');
    const to = ctx.branch(t.to_branch_id);
    if (!['dispatched', 'partial'].includes(t.status)) throw new AppError(409, 'invalid_state', 'Transfer is not awaiting receipt');
    const lines = ctx.all('SELECT * FROM transfer_lines WHERE transfer_id=?', id);
    const want = r.lines || lines.map((l) => ({ line_id: l.id, qty: l.qty - l.qty_received }));
    for (const w of want) {
      const l = lines.find((x) => x.id === w.line_id); if (!l) throw notFound('transfer line');
      const v = variantInOrg(ctx, l.variant_id);
      let qty = int(w.qty, 'qty', { min: 0 }); if (!qty) continue; if (qty > l.qty - l.qty_received) throw bad('over_receipt', 'Cannot receive more than dispatched');
      if (v.kind === 'serialized') {
        const pend = ctx.all('SELECT device_id FROM transfer_devices WHERE line_id=? AND received=0', l.id).map((x) => x.device_id);
        const ids = w.device_ids || pend.slice(0, qty); if (ids.length !== qty || ids.some((d) => !pend.includes(d))) throw bad('devices_mismatch', 'Received devices must match dispatched devices');
        let val = 0; for (const did of ids) { const d = ctx.get('SELECT cost FROM devices WHERE id=?', did); val += d.cost; ctx.run("UPDATE devices SET status='in_stock', branch_id=? WHERE id=?", to.id, did); ctx.run('UPDATE transfer_devices SET received=1 WHERE line_id=? AND device_id=?', l.id, did); deviceEvent(ctx, did, 'transfer_received', ['transfer', id]); }
        stockIn(ctx, to.id, v.id, qty, val, 'transfer_in', 'transfer', id); ctx.run('UPDATE transfer_lines SET qty_received=qty_received+?, value_received=value_received+? WHERE id=?', qty, val, l.id);
      } else {
        const newQty = l.qty_received + qty; const targetVal = newQty === l.qty ? l.cost_total : divRound(l.cost_total * newQty, l.qty); const val = targetVal - l.value_received;
        stockIn(ctx, to.id, v.id, qty, val, 'transfer_in', 'transfer', id); ctx.run('UPDATE transfer_lines SET qty_received=?, value_received=? WHERE id=?', newQty, targetVal, l.id);
      }
    }
    const left = ctx.get('SELECT SUM(qty-qty_received) c FROM transfer_lines WHERE transfer_id=?', id).c;
    ctx.run('UPDATE transfers SET status=?, received_by=?, received_at=? WHERE id=?', left === 0 ? 'received' : 'partial', ctx.user.id, nowIso(), id);
    ctx.audit('transfer.receive', 'transfer', id, { status: t.status }, { status: left === 0 ? 'received' : 'partial' }, to.id); return { id, status: left === 0 ? 'received' : 'partial' };
  });
}
export function cancelTransfer(ctx, id) { // returns un-received stock to the source branch
  ctx.need('inventory.edit');
  return ctx.tx(() => {
    const t = ctx.get('SELECT * FROM transfers WHERE id=? AND org_id=?', id, ctx.org_id); if (!t) throw notFound('transfer');
    const from = ctx.branch(t.from_branch_id);
    if (!['dispatched', 'partial'].includes(t.status)) throw new AppError(409, 'invalid_state', 'Transfer cannot be cancelled');
    for (const l of ctx.all('SELECT * FROM transfer_lines WHERE transfer_id=?', id)) {
      const rem = l.qty - l.qty_received; if (!rem) continue; const v = variantInOrg(ctx, l.variant_id);
      if (v.kind === 'serialized') for (const x of ctx.all('SELECT device_id FROM transfer_devices WHERE line_id=? AND received=0', l.id)) { ctx.run("UPDATE devices SET status='in_stock' WHERE id=?", x.device_id); deviceEvent(ctx, x.device_id, 'transfer_cancelled', ['transfer', id]); }
      stockIn(ctx, from.id, v.id, rem, l.cost_total - l.value_received, 'transfer_cancel', 'transfer', id);
    }
    ctx.run("UPDATE transfers SET status='cancelled' WHERE id=?", id); ctx.audit('transfer.cancel', 'transfer', id, { status: t.status }, { status: 'cancelled' }, from.id); return { id };
  });
}
export function listTransfers(ctx, { status, page = 1 } = {}) {
  ctx.need('inventory.view'); const ids = ctx.branchIds().join(',') || '0';
  const rows = ctx.all(`SELECT t.*, f.name from_name, b.name to_name FROM transfers t JOIN branches f ON f.id=t.from_branch_id JOIN branches b ON b.id=t.to_branch_id WHERE t.org_id=? AND (t.from_branch_id IN (${ids}) OR t.to_branch_id IN (${ids})) ${status ? 'AND t.status=?' : ''} ORDER BY t.id DESC LIMIT 100`, ...(status ? [ctx.org_id, status] : [ctx.org_id]));
  return { rows: rows.map((t) => ({ ...t, lines: ctx.all('SELECT l.*, v.sku, p.name FROM transfer_lines l JOIN variants v ON v.id=l.variant_id JOIN products p ON p.id=v.product_id WHERE l.transfer_id=?', t.id).map((l) => hideCost(ctx, { ...l, cost: l.cost_total, in_transit: l.qty - l.qty_received })) })) };
}
export function inTransitValue(ctx, branchIds) { // stock dispatched but not yet received (not available at either branch)
  return ctx.get(`SELECT COALESCE(SUM(l.cost_total - l.value_received),0) v FROM transfer_lines l JOIN transfers t ON t.id=l.transfer_id WHERE t.org_id=? AND t.status IN ('dispatched','partial') AND t.to_branch_id IN (${branchIds.join(',') || 0})`, ctx.org_id).v;
}

// ---------- Purchases ----------
export const payStatus = (total, paid) => (paid >= total && total >= 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid');
export function createPurchase(ctx, p) {
  ctx.need('purchases.create'); const br = ctx.branch(p.branch_id); ctx.requireModule(br, 'purchases'); ctx.guardDay(br);
  const sup = ctx.get('SELECT * FROM suppliers WHERE id=? AND org_id=?', p.supplier_id, ctx.org_id); if (!sup) throw notFound('supplier');
  if (!(p.lines || []).length) throw bad('lines_required', 'Add at least one line');
  return ctx.tx(() => {
    const date = ctx.today(br);
    const id = ctx.run('INSERT INTO purchases(org_id,business_id,branch_id,supplier_id,ref,currency,charges,note,user_id,created_at,business_date) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
      ctx.org_id, br.business_id, br.id, sup.id, ctx.ref('PO', br), br.currency, int(p.charges ?? 0, 'charges', { min: 0 }), p.note || null, ctx.user.id, nowIso(), date).lastInsertRowid;
    for (const l of p.lines) {
      const v = variantInOrg(ctx, l.variant_id); if (v.business_id !== br.business_id) throw bad('wrong_business', 'Product belongs to another business');
      ctx.run('INSERT INTO purchase_lines(purchase_id,variant_id,qty,unit_cost) VALUES(?,?,?,?)', id, v.id, int(l.qty, 'qty', { min: 1 }), int(l.unit_cost, 'unit_cost', { min: 0 }));
    }
    ctx.audit('purchase.create', 'purchase', id, null, p, br.id);
    if (p.receive_now) receivePurchase(ctx, id, { lines: (p.receive_serials ? ctx.all('SELECT id,variant_id,qty FROM purchase_lines WHERE purchase_id=?', id).map((l, i) => ({ line_id: l.id, qty: l.qty, serials: p.receive_serials[i] })) : null) });
    return { id };
  });
}
export function receivePurchase(ctx, id, r = {}) {
  ctx.need('purchases.edit');
  return ctx.tx(() => {
    const po = ctx.get('SELECT * FROM purchases WHERE id=? AND org_id=?', id, ctx.org_id); if (!po) throw notFound('purchase');
    const br = ctx.branch(po.branch_id); ctx.guardDay(br);
    if (!['ordered', 'partial'].includes(po.status)) throw new AppError(409, 'invalid_state', 'Purchase is not awaiting goods');
    const lines = ctx.all('SELECT * FROM purchase_lines WHERE purchase_id=?', id);
    const want = (r.lines || lines.map((l) => ({ line_id: l.id, qty: l.qty - l.qty_received }))).filter((w) => w.qty > 0);
    if (!want.length) throw bad('nothing_to_receive', 'No quantities to receive');
    const goodsTotal = lines.reduce((s, l) => s + l.qty * l.unit_cost, 0);
    const recvBefore = lines.reduce((s, l) => s + l.qty_received * l.unit_cost, 0);
    const recvNow = want.reduce((s, w) => { const l = lines.find((x) => x.id === w.line_id); if (!l) throw notFound('purchase line'); const q = int(w.qty, 'qty', { min: 1 }); if (q > l.qty - l.qty_received) throw bad('over_receipt', 'Cannot receive more than ordered'); return s + q * l.unit_cost; }, 0);
    const chargesAfter = recvBefore + recvNow >= goodsTotal ? po.charges : divRound(po.charges * (recvBefore + recvNow), goodsTotal);
    const chargeDelta = chargesAfter - po.charges_billed;
    const shares = allocate(chargeDelta, want.map((w) => { const l = lines.find((x) => x.id === w.line_id); return w.qty * l.unit_cost; }));
    want.forEach((w, i) => {
      const l = lines.find((x) => x.id === w.line_id); const v = variantInOrg(ctx, l.variant_id); const share = shares[i];
      const val = w.qty * l.unit_cost + share;
      if (v.kind === 'serialized') {
        const serials = w.serials || []; if (serials.length !== w.qty) throw bad('serials_required', 'Provide one serial/IMEI per received unit', { variant_id: v.id });
        if (new Set(serials.map((s) => String(s).toUpperCase())).size !== serials.length) throw new AppError(409, 'duplicate_serial', 'Duplicate serial in the same receipt');
        const costs = allocate(val, serials.map(() => 1)); serials.forEach((s, k) => registerDevice(ctx, br, v, s, costs[k], ['purchase', id]));
      }
      stockIn(ctx, br.id, v.id, w.qty, val, 'purchase', 'purchase', id);
      ctx.run('UPDATE purchase_lines SET qty_received=qty_received+?, charge_allocated=charge_allocated+? WHERE id=?', w.qty, share, l.id);
    });
    const left = ctx.get('SELECT SUM(qty-qty_received) c FROM purchase_lines WHERE purchase_id=?', id).c;
    const billed = po.billed + recvNow + chargeDelta;
    ctx.run('UPDATE purchases SET billed=?, charges_billed=?, status=?, payment_status=? WHERE id=?', billed, chargesAfter, left === 0 ? 'received' : 'partial', payStatus(billed, po.paid), id);
    ctx.audit('purchase.receive', 'purchase', id, { status: po.status, billed: po.billed }, { billed, lines: want }, br.id);
    ctx.all('SELECT variant_id FROM purchase_lines WHERE purchase_id=?', id);
    return { id, status: left === 0 ? 'received' : 'partial', billed };
  });
}
export function purchaseReturn(ctx, id, r) {
  ctx.need('purchases.refund');
  return ctx.tx(() => {
    const po = ctx.get('SELECT * FROM purchases WHERE id=? AND org_id=?', id, ctx.org_id); if (!po) throw notFound('purchase'); const br = ctx.branch(po.branch_id); ctx.guardDay(br);
    let credit = 0;
    for (const w of r.lines || []) {
      const l = ctx.get('SELECT * FROM purchase_lines WHERE id=? AND purchase_id=?', w.line_id, id); if (!l) throw notFound('purchase line');
      const q = int(w.qty, 'qty', { min: 1 }); if (q > l.qty_received - l.qty_returned) throw bad('over_return', 'Cannot return more than received');
      const v = variantInOrg(ctx, l.variant_id);
      if (v.kind === 'serialized') {
        const ser = w.serials || []; if (ser.length !== q) throw bad('serials_required', 'Specify the serials being returned');
        for (const s of ser) { const d = ctx.get('SELECT * FROM devices WHERE org_id=? AND serial=? AND branch_id=?', ctx.org_id, String(s).toUpperCase(), br.id); if (!d || d.status !== 'in_stock') throw new AppError(409, 'device_unavailable', 'Device not in stock', { serial: s }); stockOut(ctx, br.id, v.id, 1, 'purchase_return', 'purchase', id, { exactCost: d.cost }); ctx.run("UPDATE devices SET status='scrapped' WHERE id=?", d.id); deviceEvent(ctx, d.id, 'returned_to_supplier', ['purchase', id]); }
      } else stockOut(ctx, br.id, v.id, q, 'purchase_return', 'purchase', id);
      ctx.run('UPDATE purchase_lines SET qty_returned=qty_returned+? WHERE id=?', q, l.id); credit += q * l.unit_cost;
    }
    if (r.credit != null) credit = int(r.credit, 'credit', { min: 0 });
    const billed = po.billed - credit; ctx.run('UPDATE purchases SET billed=?, payment_status=? WHERE id=?', billed, payStatus(billed, po.paid), id);
    ctx.audit('purchase.return', 'purchase', id, { billed: po.billed }, { billed, credit }, br.id); return { id, credit, billed };
  });
}
export function listPurchases(ctx, { status, supplier_id, branch_id, page = 1, limit = 50 } = {}) {
  ctx.need('purchases.view'); const b = ctx.inBranches('p.branch_id'); const w = ['p.org_id=?', b.sql]; const a = [ctx.org_id];
  if (status) { w.push('p.status=?'); a.push(status); } if (supplier_id) { w.push('p.supplier_id=?'); a.push(Number(supplier_id)); } if (branch_id) { ctx.branch(branch_id); w.push('p.branch_id=?'); a.push(Number(branch_id)); }
  limit = Math.min(Number(limit) || 50, 200);
  const rows = ctx.all(`SELECT p.*, s.name supplier_name, br.name branch_name FROM purchases p JOIN suppliers s ON s.id=p.supplier_id JOIN branches br ON br.id=p.branch_id WHERE ${w.join(' AND ')} ORDER BY p.id DESC LIMIT ${limit} OFFSET ${(Math.max(Number(page) || 1, 1) - 1) * limit}`, ...a);
  return { rows: rows.map((p) => ({ ...p, lines: ctx.all('SELECT l.*, v.sku, pr.name, pr.kind FROM purchase_lines l JOIN variants v ON v.id=l.variant_id JOIN products pr ON pr.id=v.product_id WHERE l.purchase_id=?', p.id).map((l) => hideCost(ctx, l)) })) };
}
