import test from 'node:test';
import assert from 'node:assert/strict';
import { world, client, PW } from './helpers.js';
import * as sales from '../src/sales.js';
import * as inv from '../src/inventory.js';
import * as com from '../src/commissions.js';
import * as rep from '../src/repairs.js';
import * as fin from '../src/finance.js';
import * as pay from '../src/payments.js';
import * as rpt from '../src/reports.js';
import * as quo from '../src/quotes.js';
import { decideApproval } from '../src/core.js';

const only = (d, ccy = 'USD') => d.currencies.find((c) => c.currency === ccy);

test('weighted-average costing across purchases, sales, returns and transfers', () => {
  const w = world(); const b = w.biz('Shop', 'clothing'); const A = w.branch(b, 'AAA'), B = w.branch(b, 'BBB'); const v = w.product(b, 'X', { price: 3000 });
  w.buy(A, v, 10, 1000); w.buy(A, v, 10, 2000); assert.deepEqual(w.stock(A, v), { qty: 20, value: 30000 }); // avg 1500
  const s = sales.createSale(w.O, { branch_id: A, kind: 'retail', lines: [{ variant_id: v, qty: 5 }], payments: [{ method_id: w.CASH, amount: 15000 }] });
  assert.equal(w.db.prepare('SELECT cost_total FROM sale_lines').get().cost_total, 7500, 'cost stored on the sale line at the moment of sale'); assert.deepEqual(w.stock(A, v), { qty: 15, value: 22500 });
  w.buy(A, v, 5, 3000); // avg now (22500+15000)/20 = 1875: earlier sale cost must not change
  assert.equal(w.db.prepare('SELECT cost_total FROM sale_lines').get().cost_total, 7500);
  const t = inv.createTransfer(w.O, { from_branch_id: A, to_branch_id: B, lines: [{ variant_id: v, qty: 4 }] }); inv.receiveTransfer(w.O, t.id);
  assert.deepEqual(w.stock(B, v), { qty: 4, value: 7500 }, 'transfer carries source average cost (4 x 1875)'); assert.deepEqual(w.stock(A, v), { qty: 16, value: 30000 });
  sales.returnSale(w.O, { sale_id: s.id, lines: [{ sale_line_id: w.db.prepare('SELECT id FROM sale_lines').get().id, qty: 2 }], refund_method_id: w.CASH });
  assert.deepEqual(w.stock(A, v), { qty: 18, value: 33000 }, 'return restocks at the ORIGINAL sale cost (2 x 1500)');
  assert.equal(w.db.prepare('SELECT SUM(value) v FROM stock').get().v, 33000 + 7500); assert.equal(only(rpt.dashboard(w.O, { preset: 'year' })).cogs, 4500);
});

test('quotations: price lock, no stock effect until conversion, expiry, one-time conversion', () => {
  const w = world(); const b = w.biz('Shop', 'clothing'); const A = w.branch(b, 'AAA'); const v = w.product(b, 'X'); w.buy(A, v, 5, 1000); const cu = w.customer(); const M = w.ctx(w.user('Mgr', 'Branch Manager', [A]));
  const q = quo.createQuote(M, { branch_id: A, customer_id: cu, lines: [{ variant_id: v, qty: 2 }] }); assert.equal(q.total, 4000); assert.equal(w.stock(A, v).qty, 5, 'no stock reserved');
  w.db.prepare('UPDATE variants SET price=2500 WHERE id=?').run(v);
  const sale = quo.convertQuote(M, q.id, { payments: [{ method_id: w.CASH, amount: 4000 }] }); assert.equal(sale.total, 4000, 'quoted price honoured'); assert.equal(w.stock(A, v).qty, 3);
  assert.throws(() => quo.convertQuote(M, q.id, {}), /Already converted/);
  const q2 = quo.createQuote(M, { branch_id: A, lines: [{ variant_id: v, qty: 1 }], valid_until: '2000-01-01' }); assert.throws(() => quo.convertQuote(M, q2.id, {}), /expired/); assert.equal(w.db.prepare('SELECT status FROM quotes WHERE id=?').get(q2.id).status, 'expired');
  const C = w.ctx(w.user('Cash', 'Cashier', [A])); assert.throws(() => quo.createQuote(C, { branch_id: A, lines: [{ variant_id: v, qty: 1, unit_price: 1 }] }), /Price override/);
  assert.throws(() => quo.getQuote(w.ctx(w.user('Other', 'Cashier', [w.branch(b, 'BBB')])), q.id), /not found/);
});

test('tips are recorded separately from revenue and commission; technician commission appears in the report', () => {
  const w = world(); const b = w.biz('Cuts', 'barber'); const A = w.branch(b, 'BAR', { tip_to: 'employee' }); const M = w.ctx(w.user('Mgr', 'Branch Manager', [A])); const a = w.user('Ahmed', 'Barber', [A], 4000), f = w.user('Farah', 'Barber', [A], 4000);
  const svc = fin.saveService(w.O, null, { business_id: b, name: 'Cut', price: 1000 }).id;
  sales.createSale(M, { branch_id: A, kind: 'service', tip: 301, lines: [{ service_id: svc, barber_id: a }, { service_id: svc, barber_id: f }], payments: [{ method_id: w.CASH, amount: 2000 }] });
  const rows = com.barberReport(M, { from: '2000-01-01', to: '2999-01-01' }); const ra = rows.find((r) => r.employee === 'Ahmed'), rf = rows.find((r) => r.employee === 'Farah');
  assert.equal(ra.tips + rf.tips, 301, 'tip fully distributed'); assert.ok(Math.abs(ra.tips - rf.tips) <= 1); assert.equal(ra.revenue, 1000, 'tip is not revenue'); assert.equal(ra.commission_earned, 400, 'tip is not commission base');
  assert.equal(only(rpt.dashboard(M, { preset: 'year' })).net_sales, 2000);
  // technician row
  const b2 = w.biz('Fix', 'electronics_repair'); const R = w.branch(b2, 'FIX'); const tech = w.user('Tech', 'Technician', [R], 1000); const front = w.ctx(w.user('Front', 'Cashier', [R])); const T = w.ctx(tech);
  const j = rep.createRepair(front, { branch_id: R, technician_id: tech, customer_name: 'X', fault: 'f' }); rep.addCharge(T, j.id, { kind: 'labor', description: 'work', unit_price: 5000 }); rep.recordApproval(front, j.id, { decision: 'approved' }); rep.updateRepair(T, j.id, { qc_done: true }); rep.setStatus(T, j.id, 'completed');
  pay.recordPayment(front, { party_type: 'repair', party_id: j.id, method_id: w.CASH, amount: 5000 });
  const TR = com.barberReport(w.ctx(tech), { from: '2000-01-01', to: '2999-01-01' }); assert.equal(TR.length, 1); assert.equal(TR[0].kind, 'technician'); assert.equal(TR[0].commission_earned, 500); assert.equal(TR[0].outstanding, 500);
});

test('repair refunds: capped at amount paid, need approval for technicians/limits, reverse commission', async () => {
  const w = world(); const b = w.biz('Fix', 'electronics_repair'); const A = w.branch(b, 'FIX'); const tech = w.user('Tech', 'Technician', [A], 2000); const front = w.ctx(w.user('Front', 'Cashier', [A])); const M = w.ctx(w.user('Mgr', 'Branch Manager', [A])); const T = w.ctx(tech);
  const j = rep.createRepair(front, { branch_id: A, technician_id: tech, customer_name: 'X', fault: 'f', payments: [{ method_id: w.CASH, amount: 3000 }] }); rep.addCharge(T, j.id, { kind: 'labor', description: 'work', unit_price: 3000 }); rep.recordApproval(front, j.id, { decision: 'approved' });
  rep.updateRepair(T, j.id, { qc_done: true }); rep.setStatus(T, j.id, 'completed'); assert.equal(com.balance(M, tech).outstanding, 600);
  const c = client(w.db); const cashier = await c.login('front@t.so'); const mgr = await c.login('mgr@t.so');
  assert.equal(cashier('POST', `/api/repairs/${j.id}/refund`, { method_id: w.CASH, amount: 1000 }).status, 202, 'cashier cannot refund directly');
  assert.equal(mgr('POST', `/api/repairs/${j.id}/refund`, { method_id: w.CASH, amount: 3001 }).status, 400);
  assert.equal(mgr('POST', `/api/repairs/${j.id}/refund`, { method_id: w.CASH, amount: 1000 }).status, 200);
  assert.equal(com.balance(M, tech).outstanding, 400, 'commission payable shrinks proportionally to what the customer still has paid');
});

test('uploads: type, magic bytes, size, tenant and branch scoping', async () => {
  const w = world(); const b = w.biz('Shop', 'clothing'); const A = w.branch(b, 'AAA'); const B = w.branch(b, 'BBB'); w.user('Mgr', 'Branch Manager', [A]); const c = client(w.db); const mgr = await c.login('mgr@t.so'); const own = await c.login('o@t.so');
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]).toString('base64');
  assert.equal(mgr('POST', '/api/files', { mime: 'image/png', data: png }).status, 200);
  assert.equal(mgr('POST', '/api/files', { mime: 'text/html', data: Buffer.from('<script>').toString('base64') }).status, 400);
  assert.equal(mgr('POST', '/api/files', { mime: 'image/png', data: Buffer.from('not a png at all').toString('base64') }).status, 400, 'content must match declared type');
  assert.equal(mgr('POST', '/api/files', { mime: 'image/png', data: Buffer.alloc(3 * 1024 * 1024, 1).toString('base64') }).status, 400);
  const fb = own('POST', '/api/files', { mime: 'image/png', data: png, branch_id: B }); assert.equal(fb.status, 200); assert.equal(mgr('GET', '/api/files/' + fb.body.id).status, 404, 'file of another branch is not readable');
  const ok = mgr('GET', '/api/files/1'); assert.equal(ok.status, 200); assert.equal(ok.type, 'image/png');
});

test('multi-currency: totals never mixed, conversion only with stored rate', () => {
  const w = world(); const b1 = w.biz('US', 'clothing'), b2 = w.biz('KE', 'clothing'); const A = w.branch(b1, 'USA'), K = w.branch(b2, 'KEN', { currency: 'KES' }); const v1 = w.product(b1, 'U'), v2 = w.product(b2, 'K', { price: 100000 }); w.buy(A, v1, 5, 1000); w.buy(K, v2, 5, 50000);
  sales.createSale(w.O, { branch_id: A, kind: 'retail', lines: [{ variant_id: v1, qty: 1 }], payments: [{ method_id: w.CASH, amount: 2000 }] }); sales.createSale(w.O, { branch_id: K, kind: 'retail', lines: [{ variant_id: v2, qty: 1 }], payments: [{ method_id: w.CASH, amount: 100000 }] });
  let d = rpt.dashboard(w.O, { preset: 'year' }); assert.deepEqual(d.currencies.map((c) => [c.currency, c.net_sales]).sort(), [['KES', 100000], ['USD', 2000]]); assert.deepEqual(d.converted.missing, ['KES']);
  fin.setExchangeRate(w.O, { from_ccy: 'KES', to_ccy: 'USD', rate_ppm: 7700, effective_date: '2000-01-01' }); d = rpt.dashboard(w.O, { preset: 'year' }); assert.deepEqual(d.converted.missing, []); assert.equal(d.converted.totals.net_sales, 2000 + 770);
  const tab = rpt.runReport(w.O, 'consolidated', { preset: 'year' }); assert.deepEqual(Object.keys(tab.totals).sort(), ['KES', 'USD']);
  assert.throws(() => inv.createTransfer(w.O, { from_branch_id: A, to_branch_id: K, lines: [{ variant_id: v1, qty: 1 }] }), /same business|currenc/i);
});

test('serial numbers: failed duplicate in same receipt; branch-scoped receipt; sold device cannot be transferred', () => {
  const w = world(); const b = w.biz('Tech', 'electronics_retail'); const A = w.branch(b, 'AAA'), B = w.branch(b, 'BBB'); const ph = w.product(b, 'PH', { kind: 'serialized', price: 9000, cost: 5000 });
  assert.throws(() => w.buy(A, ph, 2, 5000, { serials: ['SAME1234', 'same1234'] }), /Duplicate serial/); assert.throws(() => w.buy(A, ph, 1, 5000, { serials: ['ab'] }), /Invalid serial/);
  w.buy(A, ph, 2, 5000, { serials: ['SER00001', 'SER00002'] }); const cu = w.customer(); sales.createSale(w.O, { branch_id: A, kind: 'retail', customer_id: cu, lines: [{ serial: 'SER00001' }], payments: [{ method_id: w.CASH, amount: 9000 }] });
  const d1 = w.db.prepare("SELECT id FROM devices WHERE serial='SER00001'").get().id, d2 = w.db.prepare("SELECT id FROM devices WHERE serial='SER00002'").get().id;
  assert.throws(() => inv.createTransfer(w.O, { from_branch_id: A, to_branch_id: B, lines: [{ variant_id: ph, qty: 1, device_ids: [d1] }] }), /not available/);
  const t = inv.createTransfer(w.O, { from_branch_id: A, to_branch_id: B, lines: [{ variant_id: ph, qty: 1, device_ids: [d2] }] }); assert.equal(w.db.prepare('SELECT status FROM devices WHERE id=?').get(d2).status, 'transit');
  assert.throws(() => sales.createSale(w.O, { branch_id: A, kind: 'retail', customer_id: cu, lines: [{ serial: 'SER00002' }], payments: [] }), /not available/); inv.receiveTransfer(w.O, t.id); const dv = w.db.prepare('SELECT * FROM devices WHERE id=?').get(d2); assert.equal(dv.branch_id, B); assert.equal(dv.status, 'in_stock');
});

test('services pricing: consumable cost is a direct cost once; commission base excludes tax', () => {
  const w = world(); const b = w.biz('Cuts', 'barber'); const A = w.branch(b, 'BAR', { tax_bp: 1000 }); const M = w.ctx(w.user('Mgr', 'Branch Manager', [A])); const a = w.user('Ahmed', 'Barber', [A], 5000);
  const svc = fin.saveService(w.O, null, { business_id: b, name: 'Cut', price: 1000, consumable_cost: 100 }).id;
  const s = sales.createSale(M, { branch_id: A, kind: 'service', lines: [{ service_id: svc, barber_id: a }], payments: [{ method_id: w.CASH, amount: 1100 }] }); assert.equal(s.total, 1100);
  const d = only(rpt.dashboard(M, { preset: 'year' })); assert.equal(d.service_revenue, 1000, 'tax excluded'); assert.equal(d.cogs, 100); assert.equal(d.commission, 500, '50% of 1000, not of 1100');
  fin.createExpense(w.O, { scope: 'branch', branch_id: A, category_id: 4, amount: 100, method_id: w.CASH });
  const d2 = only(rpt.dashboard(M, { preset: 'year' })); assert.equal(d2.net_profit, 1000 - 100 - 500 - 100, 'consumables deducted once (service cost), supplies expense separate');
  assert.equal(d2.retained_after_commission, 500);
});
