import test from 'node:test';
import assert from 'node:assert/strict';
import { world, client, setNow } from './helpers.js';
import * as sales from '../src/sales.js';
import * as fin from '../src/finance.js';
import * as rpt from '../src/reports.js';
import * as bq from '../src/queue.js';
import * as com from '../src/commissions.js';

test('reorder list: sales speed, days of stock left and a suggested order covering 30 days', () => {
  const w = world(); const b = w.biz('Rio Store', 'clothing'); const A = w.branch(b, 'RST'); const M = w.ctx(w.user('Mgr', 'Branch Manager', [A]));
  const fast = w.product(b, 'FAST', { cost: 500, price: 1000, min_stock: 2 }); const slow = w.product(b, 'SLOW', { cost: 500, price: 1000 }); w.buy(A, fast, 12, 500); w.buy(A, slow, 10, 500);
  setNow('2026-03-01T09:00:00.000Z'); for (let i = 0; i < 9; i++) sales.createSale(w.O, { branch_id: A, kind: 'retail', lines: [{ variant_id: fast, qty: 1 }], payments: [{ method_id: w.CASH, amount: 1000 }] });
  setNow('2026-03-15T09:00:00.000Z');
  const rows = rpt.reorderList(M, String(A), { today: '2026-03-15' }); setNow(null);
  assert.equal(rows.length, 1, 'only the item that is running out'); const r = rows[0];
  assert.deepEqual([r.sku, r.qty, r.sold_30, r.per_day, r.days_left], ['FAST', 3, 9, 0.3, 10]); assert.equal(r.suggested, Math.ceil(0.3 * 30 + 2 - 3)); assert.equal(r.est_cost, r.suggested * 500); assert.equal(r.supplier, 'Sup');
  const rep = rpt.runReport(M, 'reorder', { branch_id: A }); assert.ok(rep.columns.some((c) => c.key === 'suggested'));
});

test('barber queue: ticket numbers per day, wait estimate, start, finish records the visit with commission, leave', async () => {
  const w = world(); const b = w.biz('Rio Berber', 'barber'); const A = w.branch(b, 'RBR'); const desk = w.ctx(w.user('Desk', 'Cashier', [A]));
  const ali = w.user('Ali', 'Barber', [A], 4000); const barberCtx = w.ctx(ali); const cut = fin.saveService(w.O, null, { business_id: b, name: 'Haircut', price: 500, duration_min: 20 }).id;
  const t1 = bq.addToQueue(desk, { branch_id: A, customer_name: 'Abdi', phone: '+252611234567', service_id: cut }); const t2 = bq.addToQueue(desk, { branch_id: A, customer_name: 'Omar' });
  assert.deepEqual([t1.ticket, t2.ticket], [1, 2]);
  assert.throws(() => bq.addToQueue(barberCtx, { branch_id: A }), (e) => e.status === 403, 'barbers do not add customers');
  let q = bq.listQueue(desk, { branch_id: A }); assert.equal(q.waiting, 2); assert.equal(q.rows[0].est_wait_min, 0); assert.equal(q.rows[1].est_wait_min, 25, 'second customer waits about one service');
  assert.throws(() => bq.finishTicket(desk, t1.id, {}), (e) => e.code === 'ticket_not_serving');
  bq.startTicket(barberCtx, t1.id, {}); q = bq.listQueue(desk, { branch_id: A }); assert.equal(q.serving, 1); assert.equal(q.rows[0].barber_name, 'Ali');
  const sale = bq.finishTicket(desk, t1.id, { payments: [{ method_id: w.CASH, amount: 500 }] }); assert.equal(sale.total, 500); assert.equal(sale.payment_status, 'paid');
  assert.equal(com.balance(w.O, ali).earned, 200, '40% of the haircut'); assert.equal(w.db.prepare('SELECT customer_name FROM sales WHERE id=?').get(sale.id).customer_name, 'Abdi');
  bq.startTicket(desk, t2.id, { barber_id: ali }); assert.throws(() => bq.finishTicket(desk, t2.id, {}), (e) => e.code === 'service_required'); bq.leaveQueue(desk, t2.id);
  q = bq.listQueue(desk, { branch_id: A }); assert.deepEqual([q.waiting, q.serving, q.done], [0, 0, 1]);
  const api = await client(w.db).login('desk@t.so'); const r = api('POST', '/api/queue', { branch_id: A, customer_name: 'Hodan' }); assert.equal(r.body.ticket, 3);
});

test('global search finds items by barcode, customers and sales, within the user\'s permissions', async () => {
  const w = world(); const b = w.biz('Rio Store', 'clothing'); const A = w.branch(b, 'RST'); const v = w.product(b, 'POLO-M', { name: 'Polo shirt' }); w.buy(A, v, 2, 500);
  const cust = fin.saveCustomer(w.O, null, { name: 'Fadumo Hassan', phone: '0615' }).id; const s = sales.createSale(w.O, { branch_id: A, kind: 'retail', customer_id: cust, lines: [{ variant_id: v, qty: 1 }], payments: [{ method_id: w.CASH, amount: 2000 }] });
  const api = await client(w.db).login('o@t.so'); const code = w.db.prepare('SELECT barcode FROM variants WHERE id=?').get(v).barcode;
  assert.equal(api('GET', '/api/search', {}, { q: code }).body.items[0].sku, 'POLO-M'); assert.equal(api('GET', '/api/search', {}, { q: 'fadumo' }).body.customers[0].name, 'Fadumo Hassan');
  assert.equal(api('GET', '/api/search', {}, { q: s.ref }).body.sales[0].id, s.id); assert.deepEqual(api('GET', '/api/search', {}, { q: 'x' }).body.items, []);
  w.user('Tech', 'Technician', [A]); const tech = await client(w.db).login('tech@t.so'); const tr = tech('GET', '/api/search', {}, { q: 'fadumo' }).body; assert.deepEqual([tr.customers.length, tr.sales.length], [0, 0], 'no customer or sales access');
  assert.equal(sales.getSale(w.O, s.id).customer_phone, '0615', 'receipts know the customer phone for WhatsApp');
});
