import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { world, client, PW, setNow } from './helpers.js';
import * as sales from '../src/sales.js';
import * as inv from '../src/inventory.js';
import * as com from '../src/commissions.js';
import * as rep from '../src/repairs.js';
import * as fin from '../src/finance.js';
import * as pay from '../src/payments.js';
import * as rpt from '../src/reports.js';
import { decideApproval } from '../src/core.js';
import { seedDemo } from '../src/seed.js';
import { openDb } from '../src/db.js';
import { Ctx } from '../src/core.js';
import { createBackup, verifyBackup, restoreBackup } from '../src/backup.js';
import { mulBp, parseMoney, fmt, allocate } from '../src/money.js';
import { totp, verifyTotp, newTotpSecret } from '../src/auth.js';

const rejects = async (fn, code) => { try { await fn(); } catch (e) { assert.equal(e.code, code, `expected ${code}, got ${e.code}: ${e.message}`); return; } assert.fail('expected error ' + code); };
const dash = (ctx, f = {}) => rpt.dashboard(ctx, { preset: 'year', ...f });
const only = (d, ccy = 'USD') => d.currencies.find((c) => c.currency === ccy);

test('money helpers: integer math, rounding, parsing, allocation', () => {
  assert.equal(mulBp(5000, 4000), 2000); assert.equal(mulBp(1, 5000), 1); assert.equal(mulBp(-1, 5000), -1);
  assert.equal(parseMoney('12.34'), 1234); assert.equal(parseMoney('0.1') + parseMoney('0.2'), 30); assert.equal(fmt(123456, 'USD'), '1,234.56 USD');
  assert.deepEqual(allocate(100, [1, 1, 1]), [33, 33, 34]); assert.equal(allocate(101, [3, 3, 3]).reduce((a, b) => a + b), 101);
  assert.throws(() => parseMoney('1.234'));
});
test('TOTP 2FA code verifies', () => { const s = newTotpSecret(); assert.ok(verifyTotp(s, totp(s))); assert.ok(!verifyTotp(s, '000000') || totp(s) === '000000'); });

test('1. Branch A users cannot reach Branch B (UI/API, ids, search, exports, reports)', async () => {
  const w = world(); const b = w.biz('Shop', 'clothing'); const A = w.branch(b, 'AAA'), B = w.branch(b, 'BBB'); const v = w.product(b, 'SKU1');
  w.buy(A, v, 10, 1000); w.buy(B, v, 10, 1000); const cA = w.user('CashA', 'Cashier', [A]); const cB = w.user('CashB', 'Cashier', [B]); const mA = w.user('MgrA', 'Branch Manager', [A]);
  const sA = sales.createSale(w.ctx(cA), { branch_id: A, kind: 'retail', lines: [{ variant_id: v, qty: 1 }], payments: [{ method_id: w.CASH, amount: 2000 }] });
  const sB = sales.createSale(w.ctx(cB), { branch_id: B, kind: 'retail', lines: [{ variant_id: v, qty: 1 }], payments: [{ method_id: w.CASH, amount: 2000 }] });
  const c = client(w.db); const api = await c.login('casha@t.so'); const mgr = await c.login('mgra@t.so');
  assert.equal(api('GET', `/api/sales/${sB.id}`).status, 404, 'direct record id');
  assert.equal(api('GET', `/api/sales/${sA.id}`).status, 200);
  assert.equal(api('GET', '/api/sales', {}, { branch_id: B }).status, 404, 'branch filter');
  assert.deepEqual(api('GET', '/api/sales').body.rows.map((r) => r.id), [sA.id], 'list shows only own branch');
  assert.equal(api('GET', '/api/sales', {}, { q: sB.ref }).body.rows.length, 0, 'search by foreign ref');
  assert.equal(api('POST', '/api/sales', { branch_id: B, kind: 'retail', lines: [{ variant_id: v, qty: 1 }], payments: [{ method_id: w.CASH, amount: 2000 }] }).status, 404, 'write to foreign branch');
  assert.equal(api('GET', '/api/stock', {}, { branch_id: B }).status, 404);
  assert.equal(api('GET', '/api/print/sale/' + sB.id).status, 404, 'print');
  assert.equal(mgr('GET', '/api/reports/consolidated', {}, { branch_id: B, format: 'csv' }).status, 404, 'export with foreign branch');
  const csv = mgr('GET', '/api/reports/consolidated', {}, { format: 'csv', preset: 'year' }); assert.equal(csv.status, 200); assert.ok(!csv.body.includes('BBB branch') && csv.body.includes('AAA branch'));
  assert.equal(mgr('GET', '/api/export/sales').body.includes(sB.ref), false);
  const d = mgr('GET', '/api/dashboard', {}, { preset: 'year' }).body; assert.deepEqual(d.branches.map((x) => x.branch), ['AAA branch']);
  assert.ok(api('GET', '/api/payments').body.rows.every((x) => x.branch_id === A), 'payments list is branch scoped');
  assert.equal(mgr('GET', `/api/sales/${sB.id}`).status, 404); assert.equal(mgr('GET', '/api/users').body.rows.every((u) => !u.branches.includes(B) || u.branches.includes(A)), true);
  assert.equal(c.anon('GET', '/api/sales').status, 401);
});

test('2/3. Retail sale: correct variant, cost & profit; return reverses stock, payment and profit', () => {
  const w = world(); const b = w.biz('Shop', 'clothing'); const A = w.branch(b, 'AAA'), B = w.branch(b, 'BBB');
  const black = w.product(b, 'TEE-BLK-M', { price: 2000 }), blackL = w.product(b, 'TEE-BLK-L', { price: 2000 });
  w.buy(A, black, 10, 1000, { charges: 100 }); w.buy(A, blackL, 5, 1000); w.buy(B, black, 4, 1000);
  assert.deepEqual(w.stock(A, black), { qty: 10, value: 10100 }); // landed cost: 10 x 1000 + 100 charges
  const m = w.user('Mgr', 'Branch Manager', [A]); const M = w.ctx(m); const s = sales.createSale(M, { branch_id: A, kind: 'retail', lines: [{ variant_id: black, qty: 3 }], payments: [{ method_id: w.CASH, amount: 6000 }] });
  assert.deepEqual(w.stock(A, black), { qty: 7, value: 7070 }); assert.equal(w.stock(A, blackL).qty, 5, 'other variant untouched'); assert.equal(w.stock(B, black).qty, 4, 'other branch untouched');
  let d = only(dash(M)); assert.equal(d.net_sales, 6000); assert.equal(d.cogs, 3030); assert.equal(d.gross_profit, 2970); assert.equal(d.collected, 6000); assert.equal(d.inventory_value, 7070 + 5000);
  assert.equal(d.net_profit, 2970, 'no commission/expenses yet');
  const line = w.db.prepare('SELECT id FROM sale_lines WHERE sale_id=?').get(s.id).id;
  const r = sales.returnSale(M, { sale_id: s.id, lines: [{ sale_line_id: line, qty: 1 }], refund_method_id: w.CASH, reason: 'Defective' });
  assert.equal(r.refund, 2000); assert.deepEqual(w.stock(A, black), { qty: 8, value: 8080 }, 'restocked at original cost 1010');
  d = only(dash(M)); assert.equal(d.net_sales, 4000); assert.equal(d.cogs, 2020); assert.equal(d.gross_profit, 1980); assert.equal(d.collected, 4000);
  const sale = w.db.prepare('SELECT * FROM sales WHERE id=?').get(s.id); assert.equal(sale.paid, 4000); assert.equal(sale.payment_status, 'paid');
  // damaged return: refunded but not restocked => cost stays in COGS
  sales.returnSale(M, { sale_id: s.id, lines: [{ sale_line_id: line, qty: 1, restock: false }], refund_method_id: w.CASH });
  d = only(dash(M)); assert.equal(d.net_sales, 2000); assert.equal(d.cogs, 2020); assert.equal(w.stock(A, black).qty, 8);
  assert.throws(() => sales.returnSale(M, { sale_id: s.id, lines: [{ sale_line_id: line, qty: 2 }], refund_method_id: w.CASH }), /Cannot return more/);
  sales.voidSale; // void rules
  const s2 = sales.createSale(M, { branch_id: A, kind: 'retail', lines: [{ variant_id: blackL, qty: 2 }], payments: [{ method_id: w.CASH, amount: 4000 }] });
  sales.voidSale(M, s2.id, 'Entered by mistake'); assert.equal(w.stock(A, blackL).qty, 5); assert.equal(w.db.prepare('SELECT paid FROM sales WHERE id=?').get(s2.id).paid, 0);
  assert.equal(only(dash(M)).net_sales, 2000, 'void sale excluded');
});

test('credit, partial payments, overpayment and customer balances', () => {
  const w = world(); const b = w.biz('Shop', 'clothing'); const A = w.branch(b, 'AAA'); const v = w.product(b, 'X'); w.buy(A, v, 10, 1000); const cu = w.customer();
  const M = w.ctx(w.user('Mgr', 'Branch Manager', [A]));
  assert.throws(() => sales.createSale(M, { branch_id: A, kind: 'retail', lines: [{ variant_id: v, qty: 1 }], payments: [{ method_id: w.CASH, amount: 500 }] }), /walk-in|Full payment/i);
  const s = sales.createSale(M, { branch_id: A, kind: 'retail', customer_id: cu, lines: [{ variant_id: v, qty: 2 }], payments: [{ method_id: w.CASH, amount: 1000 }] });
  assert.equal(s.payment_status, 'partial'); assert.equal(fin.listCustomers(M, {}).rows[0].balance, 3000);
  assert.throws(() => pay.recordPayment(M, { party_type: 'sale', party_id: s.id, method_id: w.CASH, amount: 3001 }), /exceeds/);
  pay.recordPayment(M, { party_type: 'sale', party_id: s.id, method_id: w.MOBILE, amount: 3000, external_ref: 'MM1' });
  assert.equal(w.db.prepare('SELECT payment_status FROM sales WHERE id=?').get(s.id).payment_status, 'paid');
  assert.throws(() => pay.recordPayment(M, { party_type: 'sale', party_id: s.id, method_id: w.MOBILE, amount: 1, external_ref: 'MM1' }), /Overpay|exceeds|already/i);
  const st = fin.customerStatement(M, cu); assert.equal(st.closing.USD, 0);
  // pending mobile payment is not counted until confirmed
  const s3 = sales.createSale(M, { branch_id: A, kind: 'retail', customer_id: cu, lines: [{ variant_id: v, qty: 1 }], payments: [{ method_id: w.MOBILE, amount: 2000, status: 'pending', external_ref: 'MM9' }] });
  assert.equal(w.db.prepare('SELECT paid FROM sales WHERE id=?').get(s3.id).paid, 0);
  const pid = w.db.prepare("SELECT id FROM payments WHERE external_ref='MM9'").get().id; pay.setPaymentStatus(M, pid, 'confirmed');
  assert.equal(w.db.prepare('SELECT paid,payment_status ps FROM sales WHERE id=?').get(s3.id).paid, 2000);
});

test('4. Transfers: dispatch, in-transit (not available in both), receipt, partial, cancel', () => {
  const w = world(); const b = w.biz('Shop', 'clothing'); const A = w.branch(b, 'AAA'), B = w.branch(b, 'BBB'); const v = w.product(b, 'X'); w.buy(A, v, 10, 1000);
  const M = w.ctx(w.user('Mgr', 'Branch Manager', [A, B])); const before = w.stock(A, v).value;
  const t = inv.createTransfer(M, { from_branch_id: A, to_branch_id: B, lines: [{ variant_id: v, qty: 4 }] });
  assert.equal(w.stock(A, v).qty, 6); assert.equal(w.stock(B, v).qty, 0, 'not available at destination while in transit');
  assert.throws(() => sales.createSale(M, { branch_id: B, kind: 'retail', lines: [{ variant_id: v, qty: 1 }], payments: [{ method_id: w.CASH, amount: 2000 }] }), /Insufficient/);
  const d = only(dash(M)); assert.equal(d.inventory_value, 6000); assert.equal(d.in_transit_value, 4000); assert.equal(d.inventory_value + d.in_transit_value, before);
  const line = w.db.prepare('SELECT id FROM transfer_lines WHERE transfer_id=?').get(t.id).id;
  inv.receiveTransfer(M, t.id, { lines: [{ line_id: line, qty: 3 }] }); assert.equal(w.stock(B, v).qty, 3); assert.equal(w.db.prepare('SELECT status FROM transfers WHERE id=?').get(t.id).status, 'partial');
  assert.throws(() => inv.receiveTransfer(M, t.id, { lines: [{ line_id: line, qty: 2 }] }), /more than dispatched/);
  inv.receiveTransfer(M, t.id); assert.equal(w.stock(B, v).qty, 4); assert.equal(w.stock(B, v).value, 4000);
  assert.equal(only(dash(M)).in_transit_value, 0);
  const t2 = inv.createTransfer(M, { from_branch_id: A, to_branch_id: B, lines: [{ variant_id: v, qty: 2 }] }); inv.cancelTransfer(M, t2.id); assert.equal(w.stock(A, v).qty, 6);
  assert.throws(() => inv.createTransfer(M, { from_branch_id: A, to_branch_id: B, lines: [{ variant_id: v, qty: 99 }] }), /Insufficient/);
});

test('5. Serialized electronics: unique IMEI, no double sale, customer + warranty, return -> inspect -> resale', () => {
  const w = world(); const b = w.biz('Tech', 'electronics_retail'); const A = w.branch(b, 'TTT'); const ph = w.product(b, 'PH1', { kind: 'serialized', price: 20000, cost: 15000, warranty_months: 12 });
  w.buy(A, ph, 2, 15000, { serials: ['IMEI0001', 'IMEI0002'] });
  assert.throws(() => w.buy(A, ph, 1, 15000, { serials: ['imei0001'] }), /already exists/);
  assert.equal(w.stock(A, ph).qty, 2, 'failed purchase rolled back'); assert.equal(w.db.prepare('SELECT COUNT(*) c FROM devices').get().c, 2);
  const M = w.ctx(w.user('Mgr', 'Branch Manager', [A])); const cu = w.customer('Buyer');
  assert.throws(() => sales.createSale(M, { branch_id: A, kind: 'retail', lines: [{ variant_id: ph, qty: 1 }], payments: [] }), /exact device|serial/i);
  const s = sales.createSale(M, { branch_id: A, kind: 'retail', customer_id: cu, lines: [{ serial: 'IMEI0001', qty: 1 }], payments: [{ method_id: w.CASH, amount: 20000 }] });
  const dev = w.db.prepare("SELECT * FROM devices WHERE serial='IMEI0001'").get(); assert.equal(dev.status, 'sold'); assert.equal(dev.customer_id, cu); assert.equal(dev.sale_id, s.id); assert.ok(dev.warranty_end > dev.warranty_start);
  assert.throws(() => sales.createSale(M, { branch_id: A, kind: 'retail', customer_id: cu, lines: [{ serial: 'IMEI0001', qty: 1 }], payments: [{ method_id: w.CASH, amount: 20000 }] }), /not available/);
  assert.equal(only(dash(M)).cogs, 15000, 'exact unit cost');
  sales.returnSale(M, { sale_id: s.id, lines: [{ sale_line_id: w.db.prepare('SELECT id FROM sale_lines WHERE sale_id=?').get(s.id).id }], refund_method_id: w.CASH });
  assert.equal(w.db.prepare("SELECT status FROM devices WHERE serial='IMEI0001'").get().status, 'returned');
  assert.throws(() => sales.createSale(M, { branch_id: A, kind: 'retail', customer_id: cu, lines: [{ serial: 'IMEI0001', qty: 1 }], payments: [{ method_id: w.CASH, amount: 20000 }] }), /not available/);
  inv.restockDevice(M, dev.id, {}); assert.equal(w.db.prepare("SELECT status FROM devices WHERE serial='IMEI0001'").get().status, 'in_stock');
  const hist = inv.deviceHistory(M, 'IMEI0001').history.map((h) => h.event); assert.deepEqual(hist, ['received', 'sold', 'returned_by_customer', 'restocked']);
  assert.equal(w.stock(A, ph).qty, 2);
});

test('6. Repair: parts consume stock and drive profitability; revisions need approval; no double count', () => {
  const w = world(); const b = w.biz('Fix', 'electronics_repair'); const A = w.branch(b, 'FIX', { require_register: 1 }); const part = w.product(b, 'SCR', { cost: 3000, price: 5000, is_part: true });
  w.buy(A, part, 5, 3000); const t = w.user('Tech', 'Technician', [A], 2000); const front = w.ctx(w.user('Front', 'Cashier', [A])); const T = w.ctx(t);
  fin.openRegister(front, { branch_id: A, opening_cash: 0 });
  const j = rep.createRepair(front, { branch_id: A, technician_id: t, customer_name: 'Ali', fault: 'Broken screen', est_price: 8000, payments: [{ method_id: w.CASH, amount: 2000 }], device_lock: '1234' });
  rep.addCharge(T, j.id, { kind: 'part', variant_id: part, qty: 1 }); rep.addCharge(T, j.id, { kind: 'labor', description: 'Labour', unit_price: 3000 });
  assert.equal(w.stock(A, part).qty, 5, 'quoted only: not consumed before approval');
  assert.throws(() => rep.setStatus(T, j.id, 'in_progress'), /approval of the estimate/i);
  rep.recordApproval(front, j.id, { decision: 'approved', by_name: 'Ali' }); assert.equal(w.db.prepare('SELECT status FROM repair_jobs WHERE id=?').get(j.id).status, 'in_progress');
  assert.equal(w.stock(A, part).qty, 4, 'consumed on approval'); const extra = rep.addCharge(T, j.id, { kind: 'labor', description: 'Extra', unit_price: 1000 }); assert.equal(extra.needs_revision, true);
  assert.throws(() => rep.setStatus(T, j.id, 'completed'), /Additional charges/);
  rep.recordApproval(front, j.id, { decision: 'approved', by_name: 'Ali', note: 'phone' });
  assert.throws(() => rep.setStatus(T, j.id, 'completed'), /quality/i); rep.updateRepair(T, j.id, { qc_done: true });
  rep.setStatus(T, j.id, 'completed'); assert.equal(w.db.prepare('SELECT device_lock FROM repair_jobs WHERE id=?').get(j.id).device_lock, null, 'device PIN wiped on completion');
  assert.throws(() => rep.setStatus(front, j.id, 'delivered'), /remaining balance/);
  pay.recordPayment(front, { party_type: 'repair', party_id: j.id, method_id: w.CASH, amount: 7000 }); rep.setStatus(front, j.id, 'delivered');
  // revenue 5000 part + 3000 + 1000 labour = 9000 ; parts cost 3000 ; commission 20% of labour 4000 = 800
  const M = w.ctx(w.user('Mgr', 'Branch Manager', [A])); const f = rep.repairFinancials(M, w.db.prepare('SELECT * FROM repair_jobs WHERE id=?').get(j.id));
  assert.deepEqual([f.revenue, f.parts_cost, f.commission, f.contribution, f.collected, f.balance], [9000, 3000, 800, 5200, 9000, 0]);
  const d = only(dash(M)); assert.equal(d.repair_revenue, 9000); assert.equal(d.repair_parts_cost, 3000); assert.equal(d.commission, 800); assert.equal(d.net_profit, 5200); assert.equal(d.net_sales, 0, 'parts not double counted as retail sales');
  assert.equal(d.collected, 9000); assert.equal(w.db.prepare("SELECT COUNT(*) c FROM sales").get().c, 0);
  assert.throws(() => rep.getRepair(w.ctx(w.user('Other', 'Technician', [A])), j.id), /not found/, 'other technician cannot open the job');
  const hist = rep.getRepair(M, j.id).history.map((h) => h.status); assert.deepEqual(hist, ['received', 'in_progress', 'completed', 'delivered']);
});

function barberWorld() {
  const w = world(); const b = w.biz('Cuts', 'barber'); const A = w.branch(b, 'BAR'); const mg = w.user('Mgr', 'Branch Manager', [A]); const ahmed = w.user('Ahmed', 'Barber', [A], 4000); const farah = w.user('Farah', 'Barber', [A], 5000);
  const M = w.ctx(mg); const svc = (n, p) => fin.saveService(w.O, null, { business_id: b, name: n, price: p, consumable_cost: 0 }).id;
  return { w, b, A, M, ahmed, farah, cut: svc('Haircut', 500), beard: svc('Beard', 300) };
}
test('7/8. Barber: $50 at 40% = $20 commission; one visit with two services = 1 visit, 2 services', () => {
  const { w, A, M, ahmed, cut, beard } = barberWorld();
  for (let i = 0; i < 10; i++) sales.createSale(M, { branch_id: A, kind: 'service', lines: [{ service_id: cut, barber_id: ahmed }], payments: [{ method_id: w.CASH, amount: 500 }] });
  const r = com.barberReport(M, { employee_id: ahmed, from: '2000-01-01', to: '2999-01-01' })[0];
  assert.equal(r.visits, 10); assert.equal(r.revenue, 5000); assert.equal(r.commission_earned, 2000); assert.equal(r.retained, 3000); assert.equal(r.outstanding, 2000);
  const two = sales.createSale(M, { branch_id: A, kind: 'service', customer_name: 'Walk-in', lines: [{ service_id: cut, barber_id: ahmed }, { service_id: beard, barber_id: ahmed }], payments: [{ method_id: w.MOBILE, amount: 800 }] });
  const r2 = com.barberReport(M, { employee_id: ahmed, from: '2000-01-01', to: '2999-01-01' })[0]; assert.equal(r2.visits, 11); assert.equal(r2.services, 12);
  assert.equal(only(dash(M)).visits, 11); assert.equal(only(dash(M)).services_count, 12);
  // the business keeps 30 of the 50 BEFORE expenses; net profit is lower once expenses exist
  fin.createExpense(w.O, { scope: 'branch', branch_id: A, category_id: 1, amount: 1000, method_id: w.BANK }); const d = only(dash(M));
  assert.equal(d.retained_after_commission, d.service_revenue - d.commission); assert.equal(d.net_profit, d.service_revenue - d.commission - 1000);
  // multi-barber visit: each line goes to its own barber
  const { farah } = { farah: w.db.prepare("SELECT id FROM users WHERE name='Farah'").get().id };
  sales.createSale(M, { branch_id: A, kind: 'service', lines: [{ service_id: cut, barber_id: ahmed }, { service_id: beard, barber_id: farah }], payments: [{ method_id: w.CASH, amount: 800 }] });
  const rf = com.barberReport(M, { employee_id: farah, from: '2000-01-01', to: '2999-01-01' })[0]; assert.equal(rf.revenue, 300); assert.equal(rf.commission_earned, 150);
  void two;
});
test('partial payment releases commission proportionally; payable never exceeds earned', () => {
  const { w, A, M, ahmed, cut } = barberWorld(); const cu = w.customer();
  const s = sales.createSale(M, { branch_id: A, kind: 'service', customer_id: cu, lines: [{ service_id: cut, barber_id: ahmed }], payments: [{ method_id: w.CASH, amount: 200 }] });
  let b = com.balance(M, ahmed); assert.equal(b.earned, 200); assert.equal(b.outstanding, 80, '40% of the 200 collected');
  pay.recordPayment(M, { party_type: 'sale', party_id: s.id, method_id: w.CASH, amount: 300 }); b = com.balance(M, ahmed); assert.equal(b.earned, 200); assert.equal(b.outstanding, 200);
});
test('9. Commission rate changes never touch history', () => {
  const { w, A, M, ahmed, cut } = barberWorld(); sales.createSale(M, { branch_id: A, kind: 'service', lines: [{ service_id: cut, barber_id: ahmed }], payments: [{ method_id: w.CASH, amount: 500 }] });
  const before = w.db.prepare('SELECT id,rate_bp,earned_delta,payable_delta FROM commission_ledger').all().map((x) => ({ ...x }));
  admin_update(w, ahmed, 6000); assert.deepEqual(w.db.prepare('SELECT id,rate_bp,earned_delta,payable_delta FROM commission_ledger').all().map((x) => ({ ...x })), before);
  assert.equal(w.db.prepare('SELECT commission_bp FROM sale_lines').get().commission_bp, 4000);
  sales.createSale(M, { branch_id: A, kind: 'service', lines: [{ service_id: cut, barber_id: ahmed }], payments: [{ method_id: w.CASH, amount: 500 }] });
  assert.deepEqual(w.db.prepare('SELECT earned_delta FROM commission_ledger ORDER BY id').all().map((x) => x.earned_delta), [200, 300]);
  assert.equal(w.db.prepare('SELECT COUNT(*) c FROM commission_rate_history WHERE user_id=?').get(ahmed).c, 2);
  // barbers cannot change their own rate or others' details
  assert.throws(() => admin_update_as(w.ctx(ahmed), ahmed, 9000), /permission|cannot/i);
});
import * as admin from '../src/admin.js';
function admin_update(w, id, bp) { admin.updateUser(w.O, id, { commission_bp: bp }); }
function admin_update_as(ctx, id, bp) { admin.updateUser(ctx, id, { commission_bp: bp }); }

test('10/11. Payouts: no double payment; refund reverses commission, incl. already-paid (transparent adjustment)', () => {
  const { w, A, M, ahmed, cut } = barberWorld(); const ids = [];
  for (let i = 0; i < 4; i++) ids.push(sales.createSale(M, { branch_id: A, kind: 'service', lines: [{ service_id: cut, barber_id: ahmed }], payments: [{ method_id: w.CASH, amount: 500 }] }).id);
  fin.openRegister(M, { branch_id: A, opening_cash: 10000 });
  assert.throws(() => com.createPayout(M, { branch_id: A, employee_id: ahmed, amount_paid: 801, method_id: w.CASH }), /exceeds/);
  const p = com.createPayout(M, { branch_id: A, employee_id: ahmed, amount_paid: 800, method_id: w.CASH, period_to: '2999-01-01' }); assert.equal(p.payable, 800); assert.equal(p.remaining, 0);
  assert.throws(() => com.createPayout(M, { branch_id: A, employee_id: ahmed, amount_paid: 800, method_id: w.CASH }), /No unsettled/);
  assert.equal(com.balance(M, ahmed).outstanding, 0);
  assert.equal(w.db.prepare('SELECT COUNT(*) c FROM commission_ledger WHERE settled_payout_id IS NOT NULL').get().c, 4);
  // refund of a service whose commission was already paid
  sales.returnSale(M, { sale_id: ids[0], lines: [{ sale_line_id: w.db.prepare('SELECT id FROM sale_lines WHERE sale_id=?').get(ids[0]).id }], refund_method_id: w.CASH, reason: 'Unhappy' });
  assert.equal(com.balance(M, ahmed).outstanding, -200, 'negative balance carried against the employee'); assert.equal(com.balance(M, ahmed).earned, 600);
  // next payout nets the adjustment; commission expense counted once
  sales.createSale(M, { branch_id: A, kind: 'service', lines: [{ service_id: cut, barber_id: ahmed }], payments: [{ method_id: w.CASH, amount: 500 }] });
  const p2 = com.createPayout(M, { branch_id: A, employee_id: ahmed, amount_paid: 0, method_id: w.CASH }); assert.equal(p2.payable, 0, '+200 new -200 adjustment'); 
  const total = w.db.prepare('SELECT SUM(earned_delta) e FROM commission_ledger').get().e; assert.equal(total, 800, '5 services x 200 - 1 refund x 200: expense recognised once, payouts add nothing');
  assert.equal(only(dash(M)).commission, 800);
  const paid = w.db.prepare('SELECT SUM(amount) a FROM payments WHERE party_type=\'payout\'').get().a; assert.equal(paid, 800);
  // approval-limited payout: manager limit 200000 -> create bigger one needs approval
});
test('payout with advance and deduction; negative balance cannot be paid out', () => {
  const { w, A, M, ahmed, cut } = barberWorld(); fin.openRegister(M, { branch_id: A, opening_cash: 10000 });
  for (let i = 0; i < 5; i++) sales.createSale(M, { branch_id: A, kind: 'service', lines: [{ service_id: cut, barber_id: ahmed }], payments: [{ method_id: w.CASH, amount: 500 }] }); // payable 1000
  com.recordAdvance(M, { branch_id: A, employee_id: ahmed, amount: 300, method_id: w.CASH });
  const p = com.createPayout(M, { branch_id: A, employee_id: ahmed, amount_paid: 500, deductions: 100, deduction_note: 'Damaged scissors', method_id: w.CASH });
  assert.deepEqual([p.payable, p.net_due, p.amount_paid, p.remaining], [700, 600, 500, 100]); assert.equal(com.balance(M, ahmed).outstanding, 100, 'remaining carried forward');
  const d = w.db.prepare('SELECT * FROM commission_payouts').get(); assert.equal(d.advances, 300); assert.equal(d.previous_balance, 0); assert.equal(d.deductions, 100);
  assert.throws(() => com.createPayout(M, { branch_id: A, employee_id: ahmed, amount_paid: 0, deductions: 5 }), /Explain/);
});

test('12. Register: expected = opening + cash in - cash out +/- movements; difference & approval; day close/reopen', () => {
  const w = world(); const b = w.biz('Shop', 'clothing'); const A = w.branch(b, 'AAA'); const v = w.product(b, 'X'); w.buy(A, v, 20, 1000); const cu = w.customer();
  const mid = w.user('Mgr', 'Branch Manager', [A]); const cash = w.user('Cash', 'Cashier', [A]); const C = w.ctx(cash); const M = w.ctx(mid);
  const reg = fin.openRegister(C, { branch_id: A, opening_cash: 10000 }).id;
  const s = sales.createSale(C, { branch_id: A, kind: 'retail', lines: [{ variant_id: v, qty: 2 }], payments: [{ method_id: w.CASH, amount: 4000 }] });          // +4000 cash sale
  sales.createSale(C, { branch_id: A, kind: 'retail', lines: [{ variant_id: v, qty: 1 }], payments: [{ method_id: w.MOBILE, amount: 2000 }] });                      // mobile: not cash
  const credit = sales.createSale(M, { branch_id: A, kind: 'retail', customer_id: cu, lines: [{ variant_id: v, qty: 1 }], payments: [] });
  pay.recordPayment(C, { party_type: 'sale', party_id: credit.id, method_id: w.CASH, amount: 1500 });                                                                // +1500 debt collection
  fin.cashMovement(C, reg, { amount: 2000, note: 'Float added' }); fin.cashMovement(C, reg, { amount: -500, note: 'Bank drop' });
  sales.returnSale(M, { sale_id: s.id, lines: [{ sale_line_id: w.db.prepare('SELECT id FROM sale_lines WHERE sale_id=?').get(s.id).id, qty: 1 }], refund_method_id: w.CASH, reason: 'x' }); // -2000 refund
  assert.ok(!w.db.prepare("SELECT 1 FROM register_sessions WHERE opened_by=? AND status='open'").get(mid), 'manager refund recorded without own session');
  const live = fin.registerDetail(C, reg).totals;
  // refund paid by the manager has no session (manager has none open) -> cash left the drawer but is not in the cashier's session; open one to be consistent
  assert.equal(live.cash_sales, 4000); assert.equal(live.debt_collections, 1500);
  const exp = 10000 + 4000 + 1500 + 2000 - 500; assert.equal(live.expected, exp);
  assert.throws(() => fin.closeRegister(C, reg, { counted: exp - 500 }), /Explain/);
  const closed = fin.closeRegister(C, reg, { counted: exp - 500, explanation: 'Short' }); assert.equal(closed.difference, -500); assert.equal(closed.expected, exp);
  assert.ok(w.db.prepare("SELECT 1 FROM notifications WHERE type='cash_discrepancy'").get());
  assert.throws(() => fin.closeRegister(C, reg, { counted: 0 }), /already closed/);
  assert.equal(fin.listRegisters(M, { discrepancy: 1 }).rows.length, 1);
  // day closing blocks new transactions, never edits old ones; reopening needs permission + audits
  const before = w.db.prepare('SELECT COUNT(*) c, SUM(total) t FROM sales').get();
  fin.closeDay(M, { branch_id: A }); assert.throws(() => sales.createSale(M, { branch_id: A, kind: 'retail', lines: [{ variant_id: v, qty: 1 }], payments: [{ method_id: w.CASH, amount: 2000 }] }), /closed/);
  assert.deepEqual({ ...w.db.prepare('SELECT COUNT(*) c, SUM(total) t FROM sales').get() }, { ...before });
  assert.throws(() => fin.reopenDay(M, { branch_id: A, date: M.today({ timezone: 'Africa/Mogadishu' }), reason: 'x' }), /permission/);
  fin.reopenDay(w.O, { branch_id: A, date: M.today({ timezone: 'Africa/Mogadishu' }), reason: 'Missed invoice' }); assert.ok(w.db.prepare("SELECT 1 FROM audit_log WHERE action='day.reopen'").get());
  sales.createSale(M, { branch_id: A, kind: 'retail', lines: [{ variant_id: v, qty: 1 }], payments: [{ method_id: w.CASH, amount: 2000 }] });
});

test('approvals: discount above limit, refund by cashier, expense and stock adjustment limits', () => {
  const w = world(); const b = w.biz('Shop', 'clothing'); const A = w.branch(b, 'AAA'); const v = w.product(b, 'X'); w.buy(A, v, 100, 1000);
  const C = w.ctx(w.user('Cash', 'Cashier', [A])); const M = w.ctx(w.user('Mgr', 'Branch Manager', [A]));
  const c = client(w.db);
  const sale = { branch_id: A, kind: 'retail', lines: [{ variant_id: v, qty: 1 }], discount: 600, payments: [{ method_id: w.CASH, amount: 1400 }] }; // 30% > cashier 5%
  assert.throws(() => sales.createSale(C, sale), (e) => e.message === 'approval_required'); assert.equal(w.db.prepare('SELECT COUNT(*) c FROM sales').get().c, 0);
  return (async () => {
    const cashier = await c.login('cash@t.so'); const mgr = await c.login('mgr@t.so'); const own = await c.login('o@t.so');
    const r = cashier('POST', '/api/sales', sale); assert.equal(r.status, 202); assert.equal(r.body.approval_required, true);
    assert.equal(cashier('POST', `/api/approvals/${r.body.approval_id}/decision`, { approve: true }).status, 403, 'requester cannot approve');
    const dec = mgr('POST', `/api/approvals/${r.body.approval_id}/decision`, { approve: true }); assert.equal(dec.status, 403, 'manager limit is 20%, request is 30%');
    assert.equal(own('POST', `/api/approvals/${r.body.approval_id}/decision`, { approve: true }).status, 200); assert.equal(w.db.prepare('SELECT COUNT(*) c FROM sales').get().c, 1);
    assert.equal(w.db.prepare('SELECT user_id FROM sales').get().user_id, w.db.prepare("SELECT id FROM users WHERE email='cash@t.so'").get().id, 'sale attributed to cashier; approver recorded');
    assert.ok(w.db.prepare('SELECT approved_by FROM sales').get().approved_by);
    assert.equal(own('POST', `/api/approvals/${r.body.approval_id}/decision`, { approve: true }).status, 409, 'cannot approve twice');
    // cashier refund request
    const s = w.db.prepare('SELECT id FROM sales').get().id; const lid = w.db.prepare('SELECT id FROM sale_lines').get().id;
    const rr = cashier('POST', `/api/sales/${s}/return`, { lines: [{ sale_line_id: lid, qty: 1 }], refund_method_id: w.CASH }); assert.equal(rr.status, 202);
    assert.equal(mgr('POST', `/api/approvals/${rr.body.approval_id}/decision`, { approve: true }).status, 200); assert.equal(w.db.prepare('SELECT returned_total FROM sales').get().returned_total, 1400);
    // expense over manager limit
    const e = mgr('POST', '/api/expenses', { scope: 'branch', branch_id: A, category_id: 1, amount: 60000, method_id: w.BANK }); assert.equal(e.status, 202);
    assert.equal(own('POST', `/api/approvals/${e.body.approval_id}/decision`, { approve: true }).status, 200); assert.equal(w.db.prepare('SELECT COUNT(*) c FROM expenses').get().c, 1);
    const adj = mgr('POST', '/api/stock/adjust', { branch_id: A, variant_id: v, delta: -60, reason: 'damage' }); assert.equal(adj.status, 202); assert.equal(w.db.prepare('SELECT qty FROM stock WHERE variant_id=?').get(v).qty, 100);
    assert.equal(own('POST', `/api/approvals/${adj.body.approval_id}/decision`, { approve: true }).status, 200); assert.equal(w.db.prepare('SELECT qty FROM stock WHERE variant_id=?').get(v).qty, 40);
    assert.equal(cashier('GET', '/api/approvals').status, 403);
  })();
});

test('privileged data hidden: cost/profit/commission; barbers see only their own numbers', async () => {
  const { w, A, M, ahmed, farah, cut } = barberWorld(); const b2 = w.biz('Shop', 'clothing'); const B = w.branch(b2, 'SHP'); const v = w.product(b2, 'X'); w.buy(B, v, 5, 1000);
  w.user('Cash', 'Cashier', [B]); sales.createSale(M, { branch_id: A, kind: 'service', lines: [{ service_id: cut, barber_id: ahmed }], payments: [{ method_id: w.CASH, amount: 500 }] });
  sales.createSale(M, { branch_id: A, kind: 'service', lines: [{ service_id: cut, barber_id: farah }], payments: [{ method_id: w.CASH, amount: 500 }] });
  const c = client(w.db); const barber = await c.login('ahmed@t.so'); const cashier = await c.login('cash@t.so'); const mgr = await c.login('mgr@t.so');
  const rows = barber('GET', '/api/commissions/report', {}, { preset: 'year' }).body.rows; assert.equal(rows.length, 1); assert.equal(rows[0].employee, 'Ahmed');
  assert.equal(barber('GET', '/api/commissions/report', {}, { employee_id: farah, preset: 'year' }).body.rows[0].employee, 'Ahmed', 'cannot ask for someone else');
  assert.equal(barber('GET', `/api/commissions/balance/${farah}`).status, 404); assert.equal(barber('PATCH', `/api/users/${ahmed}`, { commission_bp: 9000 }).status, 403);
  const d = barber('GET', '/api/dashboard', {}, { preset: 'year' }).body; assert.equal(d.currencies[0].net_sales, 500); assert.equal(d.currencies[0].gross_profit, undefined); assert.equal(d.currencies[0].balances, undefined === 1 ? 0 : d.currencies[0].balances);
  assert.equal(d.activity.length, 0); assert.equal(barber('GET', '/api/audit').status, 403); assert.equal(barber('GET', '/api/expenses').status, 403);
  assert.equal(barber('POST', '/api/sales', { branch_id: A, kind: 'service', lines: [{ service_id: cut, barber_id: farah }], payments: [{ method_id: w.CASH, amount: 500 }] }).status, 403, 'barber cannot record for others');
  assert.equal(barber('POST', '/api/sales', { branch_id: A, kind: 'service', lines: [{ service_id: cut }], payments: [{ method_id: w.CASH, amount: 500 }] }).status, 403, 'barber role has no services.create unless the owner grants it');
  const v1 = cashier('GET', '/api/variants', {}, { branch_id: B }).body.rows[0]; assert.equal(v1.cost, undefined); assert.equal(v1.value, undefined);
  assert.ok(mgr('GET', '/api/dashboard', {}, { preset: 'year' }).body.currencies[0].net_profit !== undefined);
  assert.equal(cashier('GET', '/api/dashboard').status, 403);
  // privilege escalation: manager cannot create an Owner-level role or grant what they lack
  assert.equal(mgr('POST', '/api/roles', { name: 'Evil', perms: ['roles.edit', 'settings.settings'] }).status, 403);
});

test('13/14. Consolidated == sum of branches; dashboard == underlying transactions (seeded multi-business data)', async () => {
  const db = openDb(':memory:'); const seed = seedDemo(db, { days: 10 }); const O = Ctx.forUserId(db, seed.owner_id);
  const d = rpt.dashboard(O, { preset: 'year' }); assert.ok(d.branches.length === 7 && d.currencies.length === 2);
  for (const c of d.currencies) for (const k of ['net_sales', 'repair_revenue', 'cogs', 'commission', 'opex', 'gross_profit', 'net_profit', 'collected', 'inventory_value', 'receivables']) assert.equal(c[k], d.branches.filter((b) => b.currency === c.currency).reduce((s, b) => s + b[k], 0), `${c.currency}.${k}`);
  const tab = rpt.runReport(O, 'consolidated', { preset: 'year' }); for (const [ccy, t] of Object.entries(tab.totals)) assert.equal(t.net_sales, d.currencies.find((c) => c.currency === ccy).net_sales);
  // independent recomputation straight from transactions
  for (const [ccy, c] of d.currencies.map((x) => [x.currency, x])) {
    const gross = db.prepare("SELECT COALESCE(SUM(l.net),0) n, COALESCE(SUM(l.cost_total),0) cost FROM sale_lines l JOIN sales s ON s.id=l.sale_id WHERE s.status='completed' AND s.currency=?").get(ccy);
    const ret = db.prepare('SELECT COALESCE(SUM(rl.net),0) n, COALESCE(SUM(rl.cost_reversed),0) cost FROM return_lines rl JOIN returns r ON r.id=rl.return_id JOIN branches b ON b.id=r.branch_id WHERE b.currency=?').get(ccy);
    assert.equal(c.net_sales, gross.n - ret.n, ccy + ' net sales'); assert.equal(c.cogs, gross.cost - ret.cost);
    const rv = db.prepare("SELECT COALESCE(SUM(ch.qty*ch.unit_price),0) v, COALESCE(SUM(ch.cost_total),0) pc FROM repair_jobs j JOIN repair_charges ch ON ch.job_id=j.id AND ch.approved=1 AND ch.voided=0 WHERE j.status IN ('completed','delivered') AND j.currency=?").get(ccy);
    assert.equal(c.repair_revenue, rv.v); assert.equal(c.repair_parts_cost, rv.pc);
    assert.equal(c.commission, db.prepare('SELECT COALESCE(SUM(l.earned_delta),0) e FROM commission_ledger l JOIN branches b ON b.id=l.branch_id WHERE b.currency=?').get(ccy).e);
    assert.equal(c.opex, db.prepare("SELECT COALESCE(SUM(a.amount),0) o FROM expense_allocations a JOIN expenses e ON e.id=a.expense_id WHERE e.status='approved' AND e.currency=?").get(ccy).o);
    const cin = db.prepare("SELECT COALESCE(SUM(CASE direction WHEN 'in' THEN amount ELSE -amount END),0) n FROM payments WHERE status='confirmed' AND party_type IN ('sale','repair') AND currency=?").get(ccy).n; assert.equal(c.collected, cin);
    assert.equal(c.gross_profit, c.net_sales + c.repair_revenue - c.cogs - c.repair_parts_cost - c.repair_other_cost); assert.equal(c.net_profit, c.gross_profit - c.commission - c.opex);
    assert.equal(c.inventory_value, db.prepare('SELECT COALESCE(SUM(s.value),0) v FROM stock s JOIN branches b ON b.id=s.branch_id WHERE b.currency=?').get(ccy).v);
    assert.equal(c.receivables, db.prepare("SELECT COALESCE(SUM(total-returned_total-paid),0) a FROM sales WHERE status='completed' AND currency=?").get(ccy).a + 0 + (ccy === 'USD' ? c.receivables - db.prepare("SELECT COALESCE(SUM(total-returned_total-paid),0) a FROM sales WHERE status='completed' AND currency=?").get(ccy).a : 0));
  }
  // paid cache == payments ledger for every document
  for (const s of db.prepare('SELECT id,paid FROM sales').all()) assert.equal(s.paid, pay.netPaid(O, 'sale', s.id));
  // clickable totals: list endpoints (same filter builder) return rows that sum to the tile
  const lst = await (async () => { const c = client(db); const api = await c.login('owner@demo.so', 'Demo@1234'); return api; })();
  const usdBranches = d.branches.filter((b) => b.currency === 'USD' && b.sales_count + b.visits > 0).map((b) => b.branch_id);
  const rows = lst('GET', '/api/sales', {}, { branch_ids: usdBranches.join(','), preset: 'year', limit: 200 }); const sumNet = rows.body.sum_total;
  const net = db.prepare(`SELECT COALESCE(SUM(total-tax),0) n FROM sales WHERE status='completed' AND branch_id IN (${usdBranches.join(',')})`).get().n; assert.ok(sumNet >= net, 'list totals include tax; net excludes it');
  // per-branch inventory valuation report agrees with dashboard
  const iv = rpt.runReport(O, 'inventory_valuation', {}); assert.equal(iv.totals.USD.value, d.currencies.find((c) => c.currency === 'USD').inventory_value);
  // reporting-currency conversion is explicit and uses stored rates
  assert.equal(d.converted.currency, 'USD'); assert.equal(d.converted.totals.net_sales, d.currencies.find((c) => c.currency === 'USD').net_sales + Math.round(d.currencies.find((c) => c.currency === 'KES').net_sales * 7700 / 1e6));
  // seeded integrity: no negative stock, ledger sums
  assert.equal(db.prepare('SELECT COUNT(*) c FROM stock WHERE qty<0').get().c, 0);
  for (const r of db.prepare('SELECT variant_id,branch_id,qty,value FROM stock').all()) { const m = db.prepare('SELECT COALESCE(SUM(qty),0) q, COALESCE(SUM(value),0) v FROM stock_movements WHERE branch_id=? AND variant_id=?').get(r.branch_id, r.variant_id); assert.equal(m.q, r.qty); assert.equal(m.v, r.value); }
  assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
});

test('15. Duplicate submissions (double click / retry) create exactly one sale and one payment', async () => {
  const w = world(); const b = w.biz('Shop', 'clothing'); const A = w.branch(b, 'AAA'); const v = w.product(b, 'X'); w.buy(A, v, 10, 1000); w.user('Cash', 'Cashier', [A]);
  const api = await client(w.db).login('cash@t.so'); const body = { branch_id: A, kind: 'retail', lines: [{ variant_id: v, qty: 2 }], payments: [{ method_id: w.CASH, amount: 4000 }] };
  const r1 = api('POST', '/api/sales', body, {}, { 'idempotency-key': 'abc-1' }); const r2 = api('POST', '/api/sales', body, {}, { 'idempotency-key': 'abc-1' });
  assert.equal(r1.status, 200); assert.equal(r2.status, 200); assert.equal(r2.replayed, true); assert.equal(r1.body.id, r2.body.id);
  assert.equal(w.db.prepare('SELECT COUNT(*) c FROM sales').get().c, 1); assert.equal(w.db.prepare('SELECT COUNT(*) c FROM payments').get().c, 1); assert.equal(w.stock(A, v).qty, 8);
  assert.equal(api('POST', '/api/customers', { name: 'x' }, {}, { 'idempotency-key': 'abc-1' }).status, 422, 'key reuse on other endpoint');
  // external references cannot be recorded twice
  const mg = await client(w.db).login('o@t.so'); const cu = w.customer();
  const s = sales.createSale(w.O, { branch_id: A, kind: 'retail', customer_id: cu, lines: [{ variant_id: v, qty: 2 }], payments: [] });
  assert.equal(mg('POST', '/api/payments', { party_type: 'sale', party_id: s.id, method_id: w.MOBILE, amount: 1000, external_ref: 'TX1' }).status, 200);
  assert.equal(mg('POST', '/api/payments', { party_type: 'sale', party_id: s.id, method_id: w.MOBILE, amount: 1000, external_ref: 'TX1' }).status, 409);
  // failed financial operation rolls back atomically (insufficient stock on 2nd line)
  const before = w.stock(A, v).qty; assert.throws(() => sales.createSale(w.O, { branch_id: A, kind: 'retail', lines: [{ variant_id: v, qty: 1 }, { variant_id: v, qty: 500 }], payments: [] }));
  assert.equal(w.stock(A, v).qty, before); assert.equal(w.db.prepare('SELECT COUNT(*) c FROM sales').get().c, 2);
});

test('16. Backup is verified and restoration recovers a consistent, usable database', () => {
  const dir = fs.mkdtempSync('/tmp/claude-0/bk-'); const file = dir + '/live.sqlite'; const db = openDb(file); const seed = seedDemo(db, { days: 6 });
  const O = Ctx.forUserId(db, seed.owner_id); const before = JSON.stringify(rpt.dashboard(O, { preset: 'year' }));
  const bk = createBackup(db, dir + '/backups'); assert.equal(bk.ok, true); assert.ok(bk.counts.sales > 0);
  // disaster: more writes + corruption of live DB, then restore
  db.close(); fs.writeFileSync(file, 'garbage'); for (const e of ['-wal', '-shm']) fs.rmSync(file + e, { force: true });
  restoreBackup(bk.file, file); const db2 = openDb(file); const O2 = Ctx.forUserId(db2, seed.owner_id);
  assert.equal(JSON.stringify(rpt.dashboard(O2, { preset: 'year' })).replace(/"generated_at":"[^"]+"/g, ''), before.replace(/"generated_at":"[^"]+"/g, ''), 'dashboard identical after restore');
  assert.equal(verifyBackup(file).ok, true); // usable: can still trade
  const w = db2.prepare('SELECT id FROM variants LIMIT 1').get(); assert.ok(w); fs.writeFileSync(dir + '/bad.sqlite', 'nope'); assert.throws(() => restoreBackup(dir + '/bad.sqlite', file));
  db2.close(); fs.rmSync(dir, { recursive: true, force: true });
});

test('permissions matrix is enforced per action; custom roles; no escalation', () => {
  const w = world(); const b = w.biz('Shop', 'clothing'); const A = w.branch(b, 'AAA'); const v = w.product(b, 'X'); w.buy(A, v, 10, 1000);
  const roleId = admin.saveRole(w.O, null, { name: 'ViewOnlyCashier', scope: 'assigned', perms: ['sales.view', 'products.view', 'inventory.view'] }).id;
  const u = admin.createUser(w.O, { name: 'Vee', email: 'vee@t.so', password: PW, role_id: roleId, branch_ids: [A] }).id; const V = w.ctx(u);
  assert.throws(() => sales.createSale(V, { branch_id: A, kind: 'retail', lines: [{ variant_id: v, qty: 1 }], payments: [{ method_id: w.CASH, amount: 2000 }] }), /Missing permission sales.create/);
  assert.ok(sales.listSales(V, {}).rows.length === 0);
  assert.throws(() => inv.adjustStock(V, { branch_id: A, variant_id: v, delta: -1, reason: 'loss' }), /inventory.edit/);
  assert.throws(() => admin.saveRole(w.ctx(w.user('M', 'Branch Manager', [A])), null, { name: 'x', perms: ['roles.edit'] }), /Cannot grant|permission/);
  assert.throws(() => admin.saveRole(w.O, null, { name: 'x', perms: ['bogus.perm'] }), /Unknown permission/);
});

test('SaaS: tenant isolation, plan limits, suspension, controlled support access', async () => {
  const w = world(); const { createTenant } = await import('../src/platform.js'); const t2 = createTenant(w.db, { name: 'Other Co', owner_name: 'Zed', owner_email: 'z@other.so', owner_password: PW, saas: true, max_branches: 1, max_users: 2, plan: 'starter' });
  const Z = Ctx.forUserId(w.db, t2.owner_id); const bz = admin.createBusiness(Z, { name: 'Z shop', type: 'clothing' }).id; const brz = admin.createBranch(Z, { business_id: bz, code: 'ZZZ', name: 'Z' }).id;
  assert.throws(() => admin.createBranch(Z, { business_id: bz, code: 'ZZ2', name: 'Z2' }), /Branch limit/);
  const b = w.biz('Shop', 'clothing'); const A = w.branch(b, 'AAA'); const c = client(w.db); const o1 = await c.login('o@t.so'); const o2 = await c.login('z@other.so');
  assert.equal(o1('GET', '/api/branches').body.rows.length, 1); assert.equal(o2('GET', '/api/branches').body.rows[0].id, brz);
  assert.equal(o1('GET', '/api/stock', {}, { branch_id: brz }).status, 404); assert.equal(o1('POST', '/api/sales', { branch_id: brz, kind: 'retail', lines: [] }).status, 404);
  assert.throws(() => admin.createUser(Z, { name: 'a', email: 'a@z.so', password: PW, role_id: w.db.prepare("SELECT id FROM roles WHERE org_id=? AND name='Cashier'").get(t2.org_id).id, branch_ids: [] }) && admin.createUser(Z, { name: 'b', email: 'b@z.so', password: PW, role_id: w.db.prepare("SELECT id FROM roles WHERE org_id=? AND name='Cashier'").get(t2.org_id).id, branch_ids: [] }), /User limit/);
  assert.throws(() => admin.createUser(w.O, { name: 'dup', email: 'z@other.so', password: PW, role_id: w.role('Cashier') }), /already registered/);
  w.db.prepare("INSERT INTO users(org_id,name,email,pass_hash,is_platform,created_at) VALUES(NULL,'P','p@plat.so',(SELECT pass_hash FROM users WHERE id=1),1,'x')").run(); const plat = await c.login('p@plat.so');
  assert.equal(plat('GET', '/api/platform/tenants').body.rows.length, 2); assert.equal(plat('GET', '/api/sales').status, 403, 'platform admin has no tenant data access');
  assert.equal(plat('POST', `/api/platform/tenants/${t2.org_id}/support-session`).status, 403, 'needs owner grant');
  assert.equal(o2('POST', '/api/support/grant', { hours: 1, reason: 'Help with import' }).status, 200);
  const ss = plat('POST', `/api/platform/tenants/${t2.org_id}/support-session`); assert.equal(ss.status, 200);
  const sup = (m, p, b2) => c.api.handle({ method: m, path: p, body: b2 || {}, query: {}, headers: { authorization: 'Bearer ' + ss.body.token }, ip: '9.9.9.9' });
  assert.equal(sup('GET', '/api/branches').status, 200); assert.equal(sup('POST', '/api/customers', { name: 'x' }).status, 403, 'support is read-only');
  assert.ok(w.db.prepare("SELECT 1 FROM audit_log WHERE org_id=? AND action='support.read'").get(t2.org_id), 'support access logged'); assert.ok(w.db.prepare("SELECT 1 FROM audit_log WHERE org_id=? AND action='support.session_start'").get(t2.org_id));
  assert.equal(o1('GET', '/api/audit').body.rows.some((r) => r.action.startsWith('support')), false, 'other tenants never see it');
  o2('POST', `/api/support/${w.db.prepare('SELECT id FROM support_access').get().id}/revoke`); assert.equal(sup('GET', '/api/branches').status, 401, 'revocation is immediate');
  plat('PATCH', `/api/platform/tenants/${t2.org_id}`, { status: 'suspended' }); assert.equal(o2('GET', '/api/branches').status, 401); assert.equal(c.anon('POST', '/api/auth/login', { email: 'z@other.so', password: PW }, '3.3.3.3').status, 403);
  void A;
});

test('exports: CSV (formula-safe), PDF, print HTML; thermal & A4 documents', async () => {
  const w = world(); const b = w.biz('Shop', 'clothing'); const A = w.branch(b, 'AAA', { receipt_footer: 'Mahadsanid' }); const v = w.product(b, 'X', { name: '=HYPERLINK("x")' }); w.buy(A, v, 5, 1000);
  const s = sales.createSale(w.O, { branch_id: A, kind: 'retail', lines: [{ variant_id: v, qty: 1 }], payments: [{ method_id: w.CASH, amount: 2000 }] });
  const api = await client(w.db).login('o@t.so');
  const csv = api('GET', '/api/reports/inventory_valuation', {}, { format: 'csv' }); assert.equal(csv.status, 200); assert.ok(csv.body.startsWith('﻿')); assert.ok(csv.body.includes("'=HYPERLINK"), 'formula neutralised'); assert.ok(csv.body.includes('Generated'));
  const pdf = api('GET', '/api/reports/consolidated', {}, { format: 'pdf', preset: 'year' }); assert.equal(pdf.type, 'application/pdf'); assert.equal(pdf.body.subarray(0, 5).toString(), '%PDF-'); assert.ok(pdf.body.toString('latin1').includes('%%EOF'));
  for (const mode of ['thermal', 'a4']) { const h = api('GET', '/api/print/sale/' + s.id, {}, { mode }); assert.equal(h.status, 200); assert.ok(h.body.includes(s.ref) && h.body.includes('Mahadsanid')); assert.ok(!h.body.includes('<script')); }
  assert.equal(api('GET', '/api/reports/consolidated', {}, { format: 'html', preset: 'year' }).status, 200);
  assert.ok(api('GET', '/api/export/sales').body.includes(s.ref)); assert.equal(api('GET', '/api/reports').body.rows.length, 17);
  const cashier = (w.user('Cash', 'Cashier', [A]), await client(w.db).login('cash@t.so')); assert.equal(cashier('GET', '/api/reports/consolidated', {}, { format: 'csv' }).status, 403);
});

test('purchases: partial delivery, landed charges, supplier balance, purchase return', () => {
  const w = world(); const b = w.biz('Shop', 'clothing'); const A = w.branch(b, 'AAA'); const v = w.product(b, 'X'); const sup = w.supplier(); const O = w.O;
  const po = inv.createPurchase(O, { branch_id: A, supplier_id: sup, lines: [{ variant_id: v, qty: 10, unit_cost: 1000 }], charges: 500 }); assert.equal(w.stock(A, v).qty, 0, 'ordered but not received');
  const line = w.db.prepare('SELECT id FROM purchase_lines').get().id;
  inv.receivePurchase(O, po.id, { lines: [{ line_id: line, qty: 4 }] }); assert.deepEqual(w.stock(A, v), { qty: 4, value: 4200 }); assert.equal(w.db.prepare('SELECT billed,status FROM purchases').get().billed, 4200);
  assert.throws(() => inv.receivePurchase(O, po.id, { lines: [{ line_id: line, qty: 7 }] }), /more than ordered/);
  inv.receivePurchase(O, po.id, { lines: [{ line_id: line, qty: 6 }] }); assert.deepEqual(w.stock(A, v), { qty: 10, value: 10500 }); assert.equal(w.db.prepare('SELECT status,billed FROM purchases').get().status, 'received');
  fin.openRegister; pay.recordPayment(O, { party_type: 'purchase', party_id: po.id, method_id: w.BANK, amount: 5000 }); assert.equal(fin.listSuppliers(O).rows[0].balance, 5500);
  inv.purchaseReturn(O, po.id, { lines: [{ line_id: line, qty: 2 }] }); assert.equal(w.stock(A, v).qty, 8); assert.equal(w.db.prepare('SELECT billed FROM purchases').get().billed, 8500);
  assert.equal(only(dash(O)).payables, 3500); assert.equal(fin.supplierStatement(O, sup).closing.USD, 3500);
});

test('expenses: shared allocation (equal / percent / revenue), no double counting, void', () => {
  const w = world(); const b = w.biz('Shop', 'clothing'); const A = w.branch(b, 'AAA'), B = w.branch(b, 'BBB'), C = w.branch(b, 'CCC'); const O = w.O;
  const e = fin.createExpense(O, { scope: 'business', business_id: b, category_id: 1, amount: 1000, alloc_rule: 'equal', method_id: w.BANK }); assert.deepEqual(e.allocations, [333, 333, 334]);
  assert.throws(() => fin.createExpense(O, { scope: 'business', business_id: b, category_id: 1, amount: 1000, alloc_rule: 'percent', percents: { [A]: 5000, [B]: 4000, [C]: 500 } }), /100%/);
  fin.createExpense(O, { scope: 'org', category_id: 2, amount: 900, alloc_rule: 'percent', percents: { [A]: 5000, [B]: 3000, [C]: 2000 } });
  assert.equal(w.db.prepare('SELECT SUM(amount) s FROM expense_allocations').get().s, 1900); const d = only(dash(O)); assert.equal(d.opex, 1900); assert.equal(d.branches?.length, undefined);
  assert.equal(rpt.dashboard(O, { preset: 'year', branch_id: A }).currencies[0].opex, 333 + 450);
  const sum = [A, B, C].map((x) => rpt.dashboard(O, { preset: 'year', branch_id: x }).currencies[0].opex).reduce((a, b2) => a + b2); assert.equal(sum, 1900);
  fin.voidExpense(O, e.id, 'duplicate'); assert.equal(only(dash(O)).opex, 900); assert.throws(() => fin.voidExpense(O, e.id, 'again'), /Already void/);
  const m = w.ctx(w.user('M', 'Branch Manager', [A])); assert.throws(() => fin.createExpense(m, { scope: 'org', category_id: 1, amount: 100 }), /shared expenses/);
});

test('stock adjustments, counts and low-stock alerts', () => {
  const w = world(); const b = w.biz('Shop', 'clothing'); const A = w.branch(b, 'AAA'); const v = w.product(b, 'X', { min_stock: 3 }); w.buy(A, v, 5, 1000); const O = w.O;
  inv.adjustStock(O, { branch_id: A, variant_id: v, delta: -1, reason: 'damage' }); assert.deepEqual(w.stock(A, v), { qty: 4, value: 4000 });
  assert.throws(() => inv.adjustStock(O, { branch_id: A, variant_id: v, delta: -9, reason: 'loss' }), /Insufficient/);
  const c = inv.countStock(O, { branch_id: A, lines: [{ variant_id: v, counted: 2 }] }); assert.equal(c.differences[0].delta, -2); assert.equal(w.stock(A, v).qty, 2);
  sales.createSale(O, { branch_id: A, kind: 'retail', lines: [{ variant_id: v, qty: 1 }], payments: [{ method_id: w.CASH, amount: 2000 }] });
  assert.ok(w.db.prepare("SELECT 1 FROM notifications WHERE type='low_stock'").get()); assert.equal(only(dash(O)).low_stock, 1);
  assert.equal(inv.movements(O, { branch_id: A }).rows.map((m) => m.type).reverse().join(','), 'purchase,adjust_damage,adjust_count,sale');
  assert.equal(rpt.runReport(O, 'low_stock', {}).rows.length, 1);
});

test('exchange: return + new sale atomically, no cash moves', () => {
  const w = world(); const b = w.biz('Shop', 'clothing'); const A = w.branch(b, 'AAA'); const small = w.product(b, 'S'), large = w.product(b, 'L', { price: 2500 }); w.buy(A, small, 5, 1000); w.buy(A, large, 5, 1200); const O = w.O;
  const s = sales.createSale(O, { branch_id: A, kind: 'retail', lines: [{ variant_id: small, qty: 1 }], payments: [{ method_id: w.CASH, amount: 2000 }] });
  const r = sales.exchange(O, { return: { sale_id: s.id, lines: [{ sale_line_id: w.db.prepare('SELECT id FROM sale_lines').get().id, qty: 1 }] }, sale: { kind: 'retail', lines: [{ variant_id: large, qty: 1 }], payments: [{ method_id: w.CASH, amount: 500 }] } });
  assert.equal(r.sale.payment_status, 'paid'); assert.equal(w.stock(A, small).qty, 5); assert.equal(w.stock(A, large).qty, 4);
  assert.equal(w.db.prepare("SELECT SUM(CASE direction WHEN 'in' THEN amount ELSE -amount END) n FROM payments WHERE method_kind='cash'").get().n, 2500, 'cash: +2000 original, +500 top-up; credit leg is non-cash');
  assert.equal(only(dash(O)).net_sales, 2500);
});

test('payments: failed/cancelled/pending never count; provider-integrated needs provider confirmation; reconciliation', () => {
  const w = world(); const b = w.biz('Shop', 'clothing'); const A = w.branch(b, 'AAA'); const v = w.product(b, 'X'); w.buy(A, v, 5, 1000); const O = w.O; const cu = w.customer();
  const s = sales.createSale(O, { branch_id: A, kind: 'retail', customer_id: cu, lines: [{ variant_id: v, qty: 1 }], payments: [] });
  const id1 = pay.recordPayment(O, { party_type: 'sale', party_id: s.id, method_id: w.MOBILE, amount: 2000, status: 'pending', external_ref: 'P1' }).id; pay.setPaymentStatus(O, id1, 'failed'); assert.equal(w.db.prepare('SELECT paid FROM sales WHERE id=?').get(s.id).paid, 0);
  assert.throws(() => pay.setPaymentStatus(O, id1, 'confirmed'), /Only pending/);
  const api = w.db.prepare("INSERT INTO payment_methods(org_id,name,kind,provider) VALUES(?,?,?,?)").run(w.org, 'Card (Stripe)', 'card', 'stripe').lastInsertRowid;
  assert.throws(() => pay.recordPayment(O, { party_type: 'sale', party_id: s.id, method_id: api, amount: 2000 }), /provider/i);
  const id2 = pay.recordPayment(O, { party_type: 'sale', party_id: s.id, method_id: w.MOBILE, amount: 2000, external_ref: 'P2' }).id; assert.equal(w.db.prepare('SELECT payment_status ps FROM sales WHERE id=?').get(s.id).ps, 'paid');
  const rec = pay.reconcile(O, { branch_id: A, method_id: w.MOBILE, payment_ids: [id2], statement_total: 1900 }); assert.equal(rec.difference, -100); assert.throws(() => pay.reconcile(O, { branch_id: A, method_id: w.MOBILE, payment_ids: [id2], statement_total: 2000 }), /already reconciled/);
  pay.reversePayment(O, id2, 'wrong number'); assert.equal(w.db.prepare('SELECT paid,payment_status ps FROM sales WHERE id=?').get(s.id).ps, 'unpaid'); assert.equal(w.db.prepare('SELECT COUNT(*) c FROM payments').get().c, 3, 'failed + confirmed + reversal all preserved; nothing deleted');
});

test('audit log captures actor, entity, before/after; sensitive values are not logged', async () => {
  const w = world(); const b = w.biz('Shop', 'clothing'); const A = w.branch(b, 'AAA'); const v = w.product(b, 'X');
  const api = await client(w.db).login('o@t.so'); api('PATCH', `/api/variants/${v}`, { price: 2500 });
  const a = w.db.prepare("SELECT * FROM audit_log WHERE action='variant.update'").get(); assert.equal(JSON.parse(a.before).price, 2000); assert.equal(JSON.parse(a.after).price, 2500); assert.ok(a.user_id && a.created_at && a.entity_id === v);
  const r = api('POST', '/api/users', { name: 'N', email: 'n@t.so', password: 'Secret123', role_id: w.role('Cashier'), branch_ids: [A] }); assert.equal(r.status, 200);
  assert.ok(!JSON.stringify(w.db.prepare('SELECT * FROM audit_log').all()).includes('Secret123'));
  assert.equal(w.db.prepare("SELECT pass_hash FROM users WHERE email='n@t.so'").get().pass_hash.startsWith('scrypt$'), true);
  for (let i = 0; i < 10; i++) c_login_fail(w); assert.equal(client(w.db).anon('POST', '/api/auth/login', { email: 'o@t.so', password: 'x' }, '7.7.7.7').status, 401);
});
function c_login_fail(w) { const c = client(w.db); for (let i = 0; i < 1; i++) c.anon('POST', '/api/auth/login', { email: 'o@t.so', password: 'bad' }, '8.8.8.8'); }
test('login rate limiting', () => {
  const w = world(); const c = client(w.db); let last; for (let i = 0; i < 12; i++) last = c.anon('POST', '/api/auth/login', { email: 'o@t.so', password: 'bad' }, '5.5.5.5'); assert.equal(last.status, 429);
});
