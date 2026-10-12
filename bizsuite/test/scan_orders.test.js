import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { world, client, PW } from './helpers.js';
import * as sales from '../src/sales.js';
import * as fin from '../src/finance.js';
import * as com from '../src/commissions.js';
import * as admin from '../src/admin.js';
import * as ord from '../src/orders.js';
import * as rpt from '../src/reports.js';
import { qrMatrix } from '../src/qr.js';
import { openDb } from '../src/db.js';

const box = { self: {} }; vm.runInNewContext(fs.readFileSync(new URL('../public/vendor/jsQR.js', import.meta.url), 'utf8'), box); const jsQR = box.self.jsQR;
function decode(text) {
  const m = qrMatrix(text); const sc = 3, q = 4, n = (m.length + 2 * q) * sc; const d = new Uint8ClampedArray(n * n * 4).fill(255);
  for (let y = 0; y < m.length; y++) for (let x = 0; x < m.length; x++) if (m[y][x]) for (let a = 0; a < sc; a++) for (let b = 0; b < sc; b++) { const i = (((y + q) * sc + a) * n + (x + q) * sc + b) * 4; d[i] = d[i + 1] = d[i + 2] = 0; }
  return jsQR(d, n, n)?.data;
}

test('QR labels encode the SKU and decode back with a standard reader (all sizes)', () => {
  for (const s of ['RST-TSH-M', 'RST-JEANS-32-BLUE', 'Item 123 · Rio Store', 'X'.repeat(80), 'Y'.repeat(400), 'Z'.repeat(1500)]) assert.equal(decode(s), s);
});

function store() {
  const w = world(); const b = w.biz('Rio Store', 'clothing'); const A = w.branch(b, 'RST');
  const shirt = w.product(b, 'RST-SHIRT-M', { cost: 800, price: 2000 }); w.buy(A, shirt, 10, 800);
  w.db.prepare('UPDATE variants SET max_discount_bp=1000 WHERE id=?').run(shirt); // 10% ceiling
  const seller = w.ctx(w.user('Sara', 'Sales Assistant', [A])); const mgr = w.ctx(w.user('Manager', 'Branch Manager', [A])); const cashier = w.ctx(w.user('Cash', 'Cashier', [A]));
  return { w, b, A, shirt, seller, mgr, cashier };
}

test('per-item maximum discount: sellers are held to it, managers may override', () => {
  const { w, A, shirt, cashier, mgr } = store();
  assert.throws(() => sales.createSale(cashier, { branch_id: A, kind: 'retail', lines: [{ variant_id: shirt, qty: 1, discount: 300 }], payments: [{ method_id: w.CASH, amount: 1700 }] }), /Maximum discount/);
  assert.throws(() => sales.createSale(cashier, { branch_id: A, kind: 'retail', discount: 300, lines: [{ variant_id: shirt, qty: 1 }], payments: [{ method_id: w.CASH, amount: 1700 }] }), (e) => e.code === 'discount_above_item_max', 'an order-level discount counts against the item ceiling too');
  const ok = sales.createSale(cashier, { branch_id: A, kind: 'retail', lines: [{ variant_id: shirt, qty: 2, discount: 200 }], payments: [{ method_id: w.CASH, amount: 3800 }] }); assert.equal(ok.total, 3800, 'within both the item ceiling and the cashier limit (5%)');
  const over = sales.createSale(mgr, { branch_id: A, kind: 'retail', lines: [{ variant_id: shirt, qty: 1, discount: 300 }], payments: [{ method_id: w.CASH, amount: 1700 }] }); assert.equal(over.total, 1700, 'manager (sales.approve) may go past the item ceiling within the role limit');
});

test('scan-and-send: assistant sends a basket, nothing moves until the manager completes it with the money', () => {
  const { w, A, shirt, seller, mgr } = store();
  assert.throws(() => sales.createSale(seller, { branch_id: A, kind: 'retail', lines: [{ variant_id: shirt, qty: 1 }], payments: [{ method_id: w.CASH, amount: 2000 }] }), (e) => e.status === 403, 'a sales assistant cannot take money');
  assert.throws(() => ord.createOrder(seller, { branch_id: A, lines: [{ variant_id: shirt, qty: 1, discount: 500 }] }), (e) => e.code === 'discount_above_item_max');
  assert.throws(() => ord.createOrder(seller, { branch_id: A, lines: [{ variant_id: shirt, qty: 11 }] }), (e) => e.code === 'insufficient_stock');
  const o = ord.createOrder(seller, { branch_id: A, customer_name: 'Hodan', lines: [{ variant_id: shirt, qty: 2, discount: 200 }] });
  assert.equal(o.total, 3800); assert.equal(w.stock(A, shirt).qty, 10, 'an open order does not take stock');
  assert.ok(w.db.prepare("SELECT 1 FROM notifications WHERE type='order_waiting'").get(), 'the branch is notified');
  assert.equal(ord.listOrders(seller, {}).rows.length, 1); assert.equal(ord.listOrders(mgr, { status: 'open' }).open, 1);
  assert.throws(() => ord.completeOrder(seller, o.id, { payments: [{ method_id: w.CASH, amount: 3800 }] }), (e) => e.status === 403, 'only the manager completes');
  const s = ord.completeOrder(mgr, o.id, { payments: [{ method_id: w.CASH, amount: 3800 }] });
  assert.equal(s.total, 3800); assert.equal(s.payment_status, 'paid'); assert.equal(w.stock(A, shirt).qty, 8);
  const sale = w.db.prepare('SELECT * FROM sales WHERE id=?').get(s.id); assert.equal(sale.user_id, seller.user.id, 'the sale is credited to the seller who scanned it'); assert.equal(sale.customer_name, 'Hodan'); assert.match(sale.note, /^ORD-RST-/);
  assert.equal(w.db.prepare('SELECT status FROM orders WHERE id=?').get(o.id).status, 'completed');
  assert.throws(() => ord.completeOrder(mgr, o.id, { payments: [{ method_id: w.CASH, amount: 3800 }] }), (e) => e.code === 'order_closed', 'no double completion');
  const o2 = ord.createOrder(seller, { branch_id: A, lines: [{ variant_id: shirt, qty: 1 }] }); ord.cancelOrder(seller, o2.id, { reason: 'Customer left' });
  assert.throws(() => ord.completeOrder(mgr, o2.id, {}), (e) => e.code === 'order_closed');
});

test('order endpoints over HTTP: idempotent completion and seller visibility', async () => {
  const { w, A, shirt } = store(); const c = client(w.db);
  const sara = await c.login('sara@t.so'); const boss = await c.login('manager@t.so');
  const o = sara('POST', '/api/orders', { branch_id: A, lines: [{ variant_id: shirt, qty: 1 }] }); assert.equal(o.status, 200, JSON.stringify(o.body));
  assert.equal(sara('POST', '/api/sales', { branch_id: A, kind: 'retail', lines: [{ variant_id: shirt, qty: 1 }] }).status, 403);
  const k = { 'idempotency-key': 'ord-1' }; const pay = { payments: [{ method_id: w.CASH, amount: 2000 }] };
  const r1 = boss('POST', `/api/orders/${o.body.id}/complete`, pay, {}, k); const r2 = boss('POST', `/api/orders/${o.body.id}/complete`, pay, {}, k);
  assert.equal(r1.status, 200); assert.equal(r2.body.id, r1.body.id); assert.equal(w.stock(A, shirt).qty, 9, 'replay did not sell twice');
  const lab = boss('GET', '/api/print/labels', {}, { ids: String(shirt), copies: 'stock', branch_id: A }); assert.equal(lab.status, 200); assert.equal((lab.body.match(/class="lb"/g) || []).length, 9, 'one label per piece in stock');
  assert.ok(lab.body.includes('RST-SHIRT-M') && lab.body.includes('<svg'));
  const so = boss('GET', '/api/print/labels', {}, { ids: String(shirt), copies: '2', lang: 'so' }); assert.ok(so.body.includes('Qiimo dhimista ugu badan'), 'labels follow the language');
  assert.equal(boss('GET', '/api/qr', {}, { text: 'RST-SHIRT-M' }).status, 200);
  const look = sara('GET', '/api/pos/search', {}, { branch_id: A, barcode: 'RST-SHIRT-M' }).body.rows[0]; assert.equal(look.max_discount_bp, 1000); assert.equal(look.price, 2000);
});

test('barber fixed fee per haircut set by the owner, on top of or instead of a percentage', () => {
  const w = world(); const b = w.biz('Rio Berber', 'barber'); const A = w.branch(b, 'RBR'); const desk = w.ctx(w.user('Desk', 'Cashier', [A]));
  const ali = w.user('Ali', 'Barber', [A]); admin.updateUser(w.O, ali, { commission_fixed: 300 }); // 3.00 per haircut
  const omar = w.user('Omar', 'Barber', [A], 2000); admin.updateUser(w.O, omar, { commission_fixed: 100 }); // 20% + 1.00 per service
  const cut = fin.saveService(w.O, null, { business_id: b, name: 'Haircut', price: 1000 }).id;
  const s1 = sales.createSale(desk, { branch_id: A, kind: 'service', lines: [{ service_id: cut, barber_id: ali, qty: 2 }], payments: [{ method_id: w.CASH, amount: 2000 }] });
  sales.createSale(desk, { branch_id: A, kind: 'service', lines: [{ service_id: cut, barber_id: omar }], payments: [{ method_id: w.CASH, amount: 1000 }] });
  assert.equal(com.balance(w.O, ali).earned, 600); assert.equal(com.balance(w.O, omar).earned, 300);
  const hist = w.db.prepare('SELECT fixed_amount FROM commission_rate_history WHERE user_id=? ORDER BY id DESC').get(ali); assert.equal(hist.fixed_amount, 300, 'rate change is kept in history');
  const line = w.db.prepare('SELECT id FROM sale_lines WHERE sale_id=?').get(s1.id).id;
  sales.returnSale(w.O, { sale_id: s1.id, lines: [{ sale_line_id: line, qty: 1 }], refund_method_id: w.CASH, reason: 'Unhappy' });
  assert.equal(com.balance(w.O, ali).earned, 300, 'a refunded haircut reverses its fixed fee');
  admin.updateUser(w.O, ali, { commission_fixed: 500 }); assert.equal(w.db.prepare('SELECT commission_fixed FROM sale_lines WHERE sale_id=?').get(s1.id).commission_fixed, 300, 'old visits keep the old fee');
});

test('manager board: best sellers, running out, slow movers, expected profit, last month statement', () => {
  const { w, A, b, shirt, mgr, cashier, seller } = store();
  const jeans = w.product(b, 'RST-JEANS-32', { cost: 1500, price: 4000, min_stock: 3 }); w.buy(A, jeans, 4, 1500);
  const scarf = w.product(b, 'RST-SCARF', { cost: 300, price: 900 }); w.buy(A, scarf, 6, 300);
  for (let i = 0; i < 3; i++) sales.createSale(cashier, { branch_id: A, kind: 'retail', lines: [{ variant_id: shirt, qty: 1 }], payments: [{ method_id: w.CASH, amount: 2000 }] });
  sales.createSale(cashier, { branch_id: A, kind: 'retail', lines: [{ variant_id: jeans, qty: 1 }], payments: [{ method_id: w.CASH, amount: 4000 }] });
  const d = rpt.shopBoard(mgr, { branch_id: A });
  assert.equal(d.top_items[0].sku, 'RST-SHIRT-M'); assert.equal(d.top_items[0].qty, 3); assert.equal(d.top_items[0].profit, 3 * (2000 - 800));
  assert.equal(d.kpi.today.net_sales, 10000); assert.equal(d.kpi.today.sales_count, 4);
  assert.ok(d.running_out.some((x) => x.sku === 'RST-JEANS-32' && x.qty === 3), 'jeans reached the minimum');
  assert.ok(d.slow_movers.some((x) => x.sku === 'RST-SCARF' && x.sold === 0), 'scarf has not sold');
  assert.equal(d.potential.profit_full, 7 * 1200 + 3 * 2500 + 6 * 600); assert.equal(d.potential.profit_min, 7 * (1800 - 800) + 3 * 2500 + 6 * 600, 'shirt at its 10% ceiling');
  assert.ok('last_month' in d.kpi && d.periods.last_month[0].endsWith('-01'));
  const ip = rpt.runReport(mgr, 'item_profit', { preset: 'month' }); assert.equal(ip.totals.USD.profit, 3 * 1200 + 2500);
  assert.equal(rpt.runReport(mgr, 'profit_potential', {}).rows.length, 3); assert.ok(rpt.runReport(mgr, 'slow_movers', { preset: 'last_30' }).rows.length >= 1);
  const lim = rpt.shopBoard(seller, { branch_id: A }); assert.equal(lim.kpi.today.net_sales, 0, 'an assistant sees only their own sales'); assert.equal(lim.potential, undefined, 'no cost data without cost.view'); assert.equal(lim.top_items.length, 0);
});

test('migration 004 upgrades an existing installation: Sales Assistant role and orders.create for sellers', () => {
  const w = world(); const r = w.db.prepare("SELECT perms FROM roles WHERE org_id=? AND name='Sales Assistant'").get(w.org); assert.ok(r && JSON.parse(r.perms).includes('orders.create'));
  for (const n of ['Owner', 'Branch Manager', 'Cashier']) assert.ok(JSON.parse(w.db.prepare('SELECT perms FROM roles WHERE org_id=? AND name=?').get(w.org, n).perms).includes('orders.create'), n);
  const db = openDb(':memory:'); assert.ok(db.prepare("SELECT 1 FROM schema_migrations WHERE name='004_scan_orders.sql'").get()); void PW;
});

test('manager "I bought these": product, sizes, stock, supplier balance, payment and expected profit in one step', async () => {
  const w = world(); const b = w.biz('Rio Store', 'clothing'); const A = w.branch(b, 'RST'); w.user('Manager', 'Branch Manager', [A]);
  const api = await client(w.db).login('manager@t.so');
  const bad = api('POST', '/api/shop/stock-in', { branch_id: A, name: 'Polo', qty: 2, cost: 1000, price: 900 }); assert.equal(bad.body.error.code, 'price_below_cost');
  const r = api('POST', '/api/shop/stock-in', { branch_id: A, name: 'Polo shirt', category: 'Shirts', sizes: 'M, L', colors: 'Black', qty: 5, cost: 800, price: 2000, max_discount_bp: 1500, min_stock: 2, supplier_name: 'Bakaaro wholesale', method_id: w.BANK, paid: 'full' });
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body.variant_ids.length, 2); assert.equal(r.body.units, 10); assert.equal(r.body.total_cost, 8000);
  assert.deepEqual(r.body.expected, { revenue: 20000, profit: 12000, profit_at_max_discount: 10 * (1700 - 800) });
  for (const v of r.body.variant_ids) assert.deepEqual(w.stock(A, v), { qty: 5, value: 4000 });
  const skus = w.db.prepare('SELECT sku, max_discount_bp FROM variants WHERE product_id=? ORDER BY id').all(r.body.product_id); assert.deepEqual(skus.map((x) => x.sku), ['RST-POLOSHIR-M-BLA', 'RST-POLOSHIR-L-BLA']); assert.equal(skus[0].max_discount_bp, 1500);
  const po = w.db.prepare('SELECT billed, paid, payment_status FROM purchases WHERE id=?').get(r.body.purchase_id); assert.deepEqual([po.billed, po.paid], [8000, 8000]);
  const again = api('POST', '/api/shop/stock-in', { branch_id: A, name: 'Polo shirt', qty: 1, cost: 800, price: 2000 }); assert.equal(again.status, 200); assert.equal(w.db.prepare('SELECT sku FROM variants WHERE id=?').get(again.body.variant_ids[0]).sku, 'RST-POLOSHIR2', 'SKUs stay unique');
  const lab = api('GET', '/api/print/labels', {}, { ids: r.body.variant_ids.join(','), copies: 'stock', branch_id: A }); assert.equal((lab.body.match(/class="lb"/g) || []).length, 10);
});

test('labels and the board stay inside the user\'s branches and businesses', async () => {
  const w = world(); const b1 = w.biz('Rio Store', 'clothing'), b2 = w.biz('Reyxaan', 'electronics_retail'); const A = w.branch(b1, 'RST'), B = w.branch(b2, 'RYX');
  const shirt = w.product(b1, 'S1'), phone = w.product(b2, 'P1'); w.user('Mgr', 'Branch Manager', [A]); const api = await client(w.db).login('mgr@t.so');
  assert.equal(api('GET', '/api/print/labels', {}, { ids: String(phone), branch_id: A }).status, 404, 'item of another business');
  assert.equal(api('GET', '/api/print/labels', {}, { ids: String(phone) }).status, 404, 'no branch of that business');
  assert.equal(api('GET', '/api/print/labels', {}, { ids: String(shirt), branch_id: B }).status, 404, 'foreign branch');
  assert.equal(api('GET', '/api/shop', {}, { branch_id: B }).status, 404); assert.equal(api('GET', '/api/shop').body.branch.id, A);
  assert.equal(api('GET', '/api/orders', {}, { branch_id: B }).status, 404);
});
