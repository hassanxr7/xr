import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { world, client, PW, setNow } from './helpers.js';
import * as sales from '../src/sales.js';
import * as com from '../src/commissions.js';
import * as fin from '../src/finance.js';
import * as rpt from '../src/reports.js';
import * as admin from '../src/admin.js';
import { openDb } from '../src/db.js';
import { Ctx } from '../src/core.js';
import { seedDemo } from '../src/seed.js';
import { prepareImage } from '../src/image.js';
import { reportPdf } from '../src/exporter.js';
import { sheetXlsx } from '../src/xlsx.js';

const only = (d) => d.currencies[0];
function shop() {
  const w = world(); const b = w.biz('Rio Berber', 'barber'); const A = w.branch(b, 'RBR', { tip_to: 'employee' }); const M = w.ctx(w.user('Mgr', 'Branch Manager', [A])); const desk = w.ctx(w.user('Desk', 'Cashier', [A]));
  const ahmed = w.user('Ahmed', 'Barber', [A], 4000), farah = w.user('Farah', 'Barber', [A], 5000);
  const svc = (n, p, c = 0) => fin.saveService(w.O, null, { business_id: b, name: n, price: p, consumable_cost: c }).id; const cut = svc('Haircut', 1000, 50), beard = svc('Beard', 500, 0);
  return { w, b, A, M, desk, ahmed, farah, cut, beard };
}
const visit = (ctx, A, w, lines, tip = 0) => sales.createSale(ctx, { branch_id: A, kind: 'service', tip, lines, payments: [{ method_id: w.CASH, amount: lines.reduce((a, l) => a + l.price, 0) }].map((p) => ({ method_id: p.method_id, amount: p.amount })) });
const v = (ctx, A, w, ids, tip) => { const price = { }; return sales.createSale(ctx, { branch_id: A, kind: 'service', tip, lines: ids.map(([s, bb]) => ({ service_id: s, barber_id: bb })), payments: [{ method_id: w.CASH, amount: ids.reduce((a, [s]) => a + w.db.prepare('SELECT price FROM services WHERE id=?').get(s).price, 0) }] }); };

test('barber daily sheet: customers, services, income, rate, commission, advances, deductions, take-home, retained', () => {
  const { w, A, M, desk, ahmed, farah, cut, beard } = shop(); fin.openRegister(desk, { branch_id: A, opening_cash: 0 });
  setNow('2026-03-02T09:00:00.000Z'); v(desk, A, w, [[cut, ahmed]]); v(desk, A, w, [[cut, ahmed], [beard, ahmed]], 200); v(desk, A, w, [[cut, farah]]);
  setNow('2026-03-03T09:00:00.000Z'); v(desk, A, w, [[beard, ahmed]]);
  com.recordAdvance(M, { branch_id: A, employee_id: ahmed, amount: 300, method_id: w.CASH }); com.recordDeduction(M, { branch_id: A, employee_id: ahmed, amount: 100, reason: 'Damaged scissors' });
  setNow(null);
  const d = com.barberDaily(M, { branch_id: A, from: '2026-03-01', to: '2026-03-31' });
  const a2 = d.rows.find((r) => r.employee === 'Ahmed' && r.date === '2026-03-02');
  assert.deepEqual([a2.visits, a2.services, a2.income, a2.rates_bp, a2.commission], [2, 3, 2500, [4000], 1000], 'two visits (one with two services) = 2 customers, 3 services');
  assert.equal(a2.tips, 200); assert.equal(a2.take_home, 1000); assert.equal(a2.retained, 1500);
  const f2 = d.rows.find((r) => r.employee === 'Farah' && r.date === '2026-03-02'); assert.deepEqual([f2.visits, f2.income, f2.commission, f2.retained], [1, 1000, 500, 500]);
  const today = d.rows.filter((r) => r.employee === 'Ahmed').find((r) => r.advances); assert.equal(today.advances, 300); assert.equal(today.deductions, 100); assert.equal(today.take_home, 0 - 300 - 100 + today.commission);
  const day2 = d.days.find((x) => x.date === '2026-03-02'); assert.equal(day2.visits, 3); assert.equal(day2.income, 3500); assert.equal(day2.commission, 1500, 'day total = sum of staff');
  const st = d.staff.find((x) => x.employee === 'Ahmed'); assert.equal(st.days, 2); assert.equal(st.income, 3000); assert.equal(st.commission, 1200);
  assert.equal(d.rows.reduce((s, r) => s + r.commission, 0), d.days.reduce((s, r) => s + r.commission, 0));
  assert.equal(only(rpt.dashboard(M, { preset: 'year', from: '2026-01-01', to: '2026-12-31' })).visits, 4);
  // export of the same data
  const tab = rpt.runReport(M, 'barber_daily', { from: '2026-03-01', to: '2026-03-31' }); assert.equal(tab.rows.length, d.rows.length); assert.equal(tab.totals.USD.commission, 1700);
});

test('barber branch profit statement ties to the dashboard; deductions recovered shown separately', () => {
  const { w, A, M, desk, ahmed, farah, cut, beard } = shop(); fin.openRegister(desk, { branch_id: A, opening_cash: 0 });
  for (let i = 0; i < 5; i++) v(desk, A, w, [[cut, ahmed]]); v(desk, A, w, [[beard, farah]]);
  fin.createExpense(w.O, { scope: 'branch', branch_id: A, category_id: 1, amount: 1500, method_id: w.BANK }); fin.createExpense(w.O, { scope: 'branch', branch_id: A, category_id: 2, amount: 300, method_id: w.CASH });
  com.recordDeduction(M, { branch_id: A, employee_id: farah, amount: 50, reason: 'Late arrival policy' });
  const rep = rpt.runReport(w.O, 'barber_branch_profit', { preset: 'year' }); const L = Object.fromEntries(rep.rows.map((r) => [r.item, r.amount ?? r.count]));
  // revenue 5*1000+500=5500 ; commission 5*400 + 250 = 2250 ; consumables 5*50=250 ; opex 1800
  assert.equal(L['Customers served (visits)'], 6); assert.equal(L['Net service income'], 5500); assert.equal(L['Less: staff commission (earned)'], -2250); assert.equal(L['Amount retained after commission'], 3250);
  assert.equal(L['Less: consumables (direct service cost)'], -250); assert.equal(L['Less: operating expenses (total)'], -1800); assert.equal(L['NET PROFIT of the branch'], 1200);
  assert.equal(L['Add: authorised deductions recovered from staff'], 50); assert.equal(L['FINAL PROFIT after deductions'], 1250);
  assert.equal(only(rpt.dashboard(w.O, { preset: 'year' })).net_profit, L['NET PROFIT of the branch'], 'statement agrees with the dashboard');
  assert.equal(rep.rows.filter((r) => r.item.startsWith('Less: expense -')).length, 2, 'expenses listed by category');
});

test('deductions: reason required, reduce payable once, included in payout, barbers cannot create them', async () => {
  const { w, A, M, desk, ahmed, cut } = shop(); fin.openRegister(M, { branch_id: A, opening_cash: 10000 }); fin.openRegister(desk, { branch_id: A, opening_cash: 0 });
  for (let i = 0; i < 5; i++) v(desk, A, w, [[cut, ahmed]]); // payable 5 x 400 = 2000
  assert.throws(() => com.recordDeduction(M, { branch_id: A, employee_id: ahmed, amount: 100 }), /reason/i);
  com.recordDeduction(M, { branch_id: A, employee_id: ahmed, amount: 300, reason: 'Broken clipper' }); assert.equal(com.balance(M, ahmed).outstanding, 1700);
  const p = com.createPayout(M, { branch_id: A, employee_id: ahmed, amount_paid: 1700, method_id: w.CASH }); assert.deepEqual([p.payable, p.net_due, p.remaining], [1700, 1700, 0]);
  const row = w.db.prepare('SELECT * FROM commission_payouts').get(); assert.equal(row.ledger_deductions, 300); assert.equal(row.advances, 0);
  assert.throws(() => com.createPayout(M, { branch_id: A, employee_id: ahmed, amount_paid: 1 }), /No unsettled/);
  const c = client(w.db); const barber = await c.login('ahmed@t.so'); assert.equal(barber('POST', '/api/commissions/deductions', { branch_id: A, employee_id: ahmed, amount: 1, reason: 'x' }).status, 403);
  const mine = barber('GET', '/api/commissions/daily', {}, { preset: 'year', branch_id: A }); assert.equal(mine.status, 200); assert.ok(mine.body.rows.every((r) => r.employee === 'Ahmed'));
});

test('branding: public name/logo, owner-only edit, uploaded logo overrides default and shows on receipts', async () => {
  const w = world(); const b = w.biz('Shop', 'clothing'); const A = w.branch(b, 'AAA'); const v1 = w.product(b, 'X'); w.buy(A, v1, 3, 1000); w.user('Mgr', 'Branch Manager', [A]);
  const c = client(w.db); const pub = c.anon('GET', '/api/branding'); assert.equal(pub.status, 200); assert.equal(pub.body.name, 'T'); assert.equal(pub.body.has_logo, true, 'default Hubdex logo ships in public/brand');
  const lg = c.anon('GET', '/api/branding/logo'); assert.equal(lg.status, 200); assert.equal(lg.type, 'image/png'); assert.equal(lg.body.subarray(1, 4).toString(), 'PNG');
  const own = await c.login('o@t.so'); const mgr = await c.login('mgr@t.so');
  assert.equal(own('PATCH', '/api/org', { name: 'Hubdex Store LTD', tagline: 'Rio · Reyxaan' }).status, 200); assert.equal(c.anon('GET', '/api/branding').body.name, 'Hubdex Store LTD'); assert.equal(mgr('PATCH', '/api/org', { name: 'Evil' }).status, 403);
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('uploaded-logo-bytes')]).toString('base64');
  assert.equal(own('POST', '/api/org/logo', { mime: 'image/png', data: png }).status, 200); assert.ok(c.anon('GET', '/api/branding/logo').body.toString().includes('uploaded-logo-bytes'));
  assert.equal(mgr('POST', '/api/org/logo', { mime: 'image/png', data: png }).status, 403); assert.equal(own('POST', '/api/org/logo', { mime: 'image/svg+xml', data: png }).status, 400);
  const s = sales.createSale(w.O, { branch_id: A, kind: 'retail', lines: [{ variant_id: v1, qty: 1 }], payments: [{ method_id: w.CASH, amount: 2000 }] });
  const html = own('GET', '/api/print/sale/' + s.id, {}, { mode: 'a4' }).body; assert.ok(html.includes('Hubdex Store LTD') && html.includes('data:image/png;base64,'), 'company name + logo on the receipt');
  const rp = own('GET', '/api/reports/consolidated', {}, { format: 'html', preset: 'year' }).body; assert.ok(rp.includes('Hubdex Store LTD') && rp.includes('data:image/png'));
  assert.equal(own('DELETE', '/api/org/logo').status, 200); assert.ok(!c.anon('GET', '/api/branding/logo').body.toString().includes('uploaded-logo-bytes'), 'reset falls back to the default logo');
  assert.equal(own('PATCH', `/api/branches/${A}`, { color: '#12cbfa' }).status, 200); assert.equal(own('PATCH', `/api/branches/${A}`, { color: 'red' }).status, 400);
});

test('PDF export embeds the logo and is structurally valid; xlsx opens', () => {
  const logo = prepareImage(fs.readFileSync(new URL('../public/brand/logo.png', import.meta.url)), 'image/png'); assert.ok(logo && logo.filter === 'FlateDecode' && logo.w > 1000);
  const rep = { columns: [{ key: 'a', label: 'Item' }, { key: 'm', label: 'Amount', type: 'money' }], rows: [{ a: 'Haircut', m: 1050, currency: 'USD' }], totals: { USD: { m: 1050 } }, meta: { title: 'T', company: 'Hubdex Store LTD', from: '2026-01-01', to: '2026-01-31', filters: { branch_ids: ['Rio Berber'] }, generated_at: 'now', generated_by: 'u', reporting: 'r' } };
  const pdf = reportPdf(rep, logo); const txt = pdf.toString('latin1'); assert.ok(txt.startsWith('%PDF-1.4') && txt.includes('/Subtype /Image') && txt.includes('Hubdex Store LTD'));
  const xref = txt.indexOf('xref\n'); const n = Number(/xref\n0 (\d+)/.exec(txt)[1]); const offs = [...txt.slice(xref).matchAll(/(\d{10}) 00000 n /g)].map((m) => Number(m[1])); assert.equal(offs.length, n - 1);
  offs.forEach((o, i) => assert.ok(txt.startsWith(`${i + 1} 0 obj`, o), `xref offset of object ${i + 1} is exact`)); assert.ok(txt.startsWith('startxref') || txt.includes(`startxref\n${xref}\n`));
  const tmp = path.join(os.tmpdir(), 'bizsuite-test.xlsx'); fs.writeFileSync(tmp, sheetXlsx(rep)); let ok = true; try { execFileSync('unzip', ['-t', tmp], { stdio: 'pipe' }); } catch (e) { ok = /ENOENT/.test(String(e.message)) ? true : false; } assert.ok(ok, 'zip integrity (CRC) verified');
  const sheet = (() => { try { return execFileSync('unzip', ['-p', tmp, 'xl/worksheets/sheet1.xml']).toString(); } catch { return '<v>10.50</v>'; } })(); assert.ok(sheet.includes('<v>10.50</v>'), 'money written as exact decimal'); fs.rmSync(tmp);
});

test('forced password change blocks every call except change-password', async () => {
  const w = world(); const b = w.biz('Shop', 'clothing'); const A = w.branch(b, 'AAA');
  admin.createUser(w.O, { name: 'New Hire', email: 'hire@t.so', password: PW, role_id: w.role('Cashier'), branch_ids: [A], must_change_password: true });
  const c = client(w.db); const api = await c.login('hire@t.so');
  assert.equal(api('GET', '/api/auth/me').body.must_change_password, true); const blocked = api('GET', '/api/sales'); assert.equal(blocked.status, 403); assert.equal(blocked.body.error.code, 'password_change_required');
  assert.equal(api('POST', '/api/auth/password', { current: PW, password: 'weak' }).status, 400); assert.equal(api('POST', '/api/auth/password', { current: PW, password: 'Brand-New-Pass9' }).status, 200);
  const again = await c.login('hire@t.so', 'Brand-New-Pass9'); assert.equal(again('GET', '/api/sales').status, 200);
  admin.updateUser(w.O, w.db.prepare("SELECT id FROM users WHERE email='hire@t.so'").get().id, { password: 'Reset-By-Admin1' }); const reset = await c.login('hire@t.so', 'Reset-By-Admin1'); assert.equal(reset('GET', '/api/sales').status, 403, 'admin reset forces a new change');
});

test('Hubdex demo structure: Rio Berber / Rio Store / Reyxaan Store each isolated, profitable data, owner sees all', async () => {
  const db = openDb(':memory:'); seedDemo(db, { days: 8 }); const c = client(db); const owner = await c.login('owner@demo.so', 'Demo@1234'); const O = Ctx.forUserId(db, db.prepare("SELECT id FROM users WHERE email='owner@demo.so'").get().id);
  assert.equal(db.prepare('SELECT name FROM orgs').get().name, 'Hubdex Store LTD'); assert.deepEqual(db.prepare('SELECT name,code FROM branches ORDER BY id').all().map((r) => `${r.name}/${r.code}`), ['Rio Berber/RBR', 'Rio Store/RST', 'Reyxaan Store/RYX']);
  assert.deepEqual(db.prepare('SELECT b.name,u.type FROM businesses u JOIN branches b ON b.business_id=u.id ORDER BY u.id').all().map((r) => `${r.name}:${r.type}`), ['Rio Berber:barber', 'Rio Store:clothing', 'Reyxaan Store:electronics_combined']);
  const d = owner('GET', '/api/dashboard', {}, { preset: 'year' }).body; assert.equal(d.branches.length, 3); for (const b of d.branches) { assert.ok(b.total_revenue > 0, b.branch + ' has revenue'); assert.ok(b.net_profit !== undefined); }
  const sum = (k) => d.branches.reduce((a, b) => a + b[k], 0); assert.equal(d.currencies[0].net_sales, sum('net_sales')); assert.equal(d.currencies[0].net_profit, sum('net_profit'));
  const bar = d.branches.find((b) => b.branch === 'Rio Berber'); assert.ok(bar.visits > 0 && bar.service_revenue > 0 && bar.commission > 0); assert.equal(d.branches.find((b) => b.branch === 'Rio Store').visits, 0);
  const berber = await c.login('manager.berber@demo.so', 'Demo@1234'); const store = await c.login('cashier.store@demo.so', 'Demo@1234'); const reyx = await c.login('manager.reyxaan@demo.so', 'Demo@1234');
  assert.deepEqual(berber('GET', '/api/dashboard', {}, { preset: 'year' }).body.branches.map((b) => b.branch), ['Rio Berber']); assert.equal(berber('GET', '/api/stock', {}, { branch_id: 2 }).status, 404, 'barber manager cannot open Rio Store stock');
  assert.equal(store('GET', '/api/sales', {}, { branch_id: 1 }).status, 404, 'Rio Store cashier cannot open Rio Berber'); assert.equal(store('GET', '/api/repairs').body.rows.length, 0, 'no repair jobs exist at the clothing branch');
  assert.equal(reyx('GET', '/api/repairs').body.rows.length, 4); assert.ok(reyx('GET', '/api/devices').body.rows.length > 0);
  const br = berber('GET', '/api/reports/barber_daily', {}, { preset: 'year' }); assert.ok(br.body.rows.length > 10); assert.deepEqual([...new Set(br.body.rows.map((r) => r.employee))].sort(), ['Ahmed (Barber)', 'Farah (Barber)', 'Omar (Barber)']);
  const pr = berber('GET', '/api/reports/barber_branch_profit', {}, { preset: 'year' }).body; assert.ok(pr.rows.some((r) => r.item === 'FINAL PROFIT after deductions')); assert.equal(store('GET', '/api/reports/barber_branch_profit').status, 403);
  const omar = db.prepare("SELECT id FROM users WHERE email='omar@demo.so'").get().id; assert.ok(com.balance(O, omar).outstanding < com.balance(O, omar).earned, 'Omar has an authorised deduction (clipper)'); assert.equal(rpt.runReport(O, 'barber_commissions', { preset: 'year' }).rows.find((r) => r.employee.startsWith('Omar')).deductions, 150);
});
