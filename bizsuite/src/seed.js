// Demo data: 4 businesses / 7 branches / 2 currencies, 14 days of history created THROUGH the service layer
// (so every rule - stock, costing, commission, registers - is exercised exactly as in production).
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { Ctx } from './core.js';
import { setNow } from './time.js';
import { hashPassword } from './auth.js';
import { createTenant } from './platform.js';
import * as admin from './admin.js';
import * as inv from './inventory.js';
import * as sales from './sales.js';
import * as pay from './payments.js';
import * as com from './commissions.js';
import * as rep from './repairs.js';
import * as orders from './orders.js';
import * as fin from './finance.js';
import { addDays } from './time.js';

export const DEMO_PASSWORD = 'Demo@1234';
export function seedIfEmpty(db) { if (!db.prepare('SELECT COUNT(*) c FROM orgs').get().c) return seedDemo(db); }

// Hubdex Store LTD: Rio Berber (barber / salon), Rio Store (clothing, shoes, fashion), Reyxaan Store (electronics + repair).
export function seedDemo(db, { days = 14 } = {}) {
  let rnd = 12345; const rand = (n) => { rnd = (rnd * 1103515245 + 12345) & 0x7fffffff; return Math.floor((rnd / 0x80000000) * n); /* high bits: the low bits of this LCG cycle quickly */ }; const pick = (a) => a[rand(a.length)];
  db.prepare("INSERT INTO users(org_id,name,email,pass_hash,is_platform,created_at) VALUES(NULL,'Platform Admin','platform@bizsuite.local',?,1,?)").run(hashPassword(DEMO_PASSWORD), new Date().toISOString());
  const { org_id: ORG, owner_id } = createTenant(db, { name: 'Hubdex Store LTD', owner_name: 'Hubdex Owner', owner_email: 'owner@demo.so', owner_password: DEMO_PASSWORD, saas: false });
  db.prepare('UPDATE orgs SET tagline=? WHERE id=?').run('Rio Berber · Rio Store · Reyxaan Store', ORG);
  const O = Ctx.forUserId(db, owner_id); const today = new Date().toISOString().slice(0, 10);
  const role = (n) => db.prepare('SELECT id FROM roles WHERE org_id=? AND name=?').get(ORG, n).id;
  const M = (n) => db.prepare('SELECT id FROM payment_methods WHERE org_id=? AND name LIKE ?').get(ORG, n + '%').id; const CASH = M('Cash'), MOBILE = M('Mobile'), BANK = M('Bank');

  // --- structure: one business + one branch per identity ---
  const RIOB = admin.createBusiness(O, { name: 'Rio Berber', type: 'barber' }).id, RIOS = admin.createBusiness(O, { name: 'Rio Store', type: 'clothing' }).id, REYX = admin.createBusiness(O, { name: 'Reyxaan Store', type: 'electronics_combined' }).id;
  const br = (business_id, code, name, color, extra = {}) => admin.createBranch(O, { business_id, code, name, color, address: 'Mogadishu, Somalia', phone: '+252 61 000' + (1000 + rand(9000)), receipt_header: 'Hubdex Store LTD', receipt_footer: 'Thank you / Mahadsanid', ...extra }).id;
  const RBR = br(RIOB, 'RBR', 'Rio Berber', '#c2410c', { tip_to: 'employee' }), RST = br(RIOS, 'RST', 'Rio Store', '#2563eb'), RYX = br(REYX, 'RYX', 'Reyxaan Store', '#059669', { require_register: 1 });
  for (const b of [RBR, RST, RYX]) { fin.setBranchAccount(O, b, M('Mobile'), 50000); fin.setBranchAccount(O, b, M('Bank'), 200000); }

  const user = (name, email, r, branches, bp = 0) => admin.createUser(O, { name, email, password: DEMO_PASSWORD, role_id: role(r), branch_ids: branches, commission_bp: bp, lang: 'en' }).id;
  const U = {
    acct: user('Amina Accountant', 'accountant@demo.so', 'Accountant', []),
    mB: user('Yusuf (Manager, Rio Berber)', 'manager.berber@demo.so', 'Branch Manager', [RBR]), mS: user('Mohamed (Manager, Rio Store)', 'manager.store@demo.so', 'Branch Manager', [RST]), mR: user('Liban (Manager, Reyxaan Store)', 'manager.reyxaan@demo.so', 'Branch Manager', [RYX]),
    cB: user('Hodan (Front desk, Rio Berber)', 'cashier.berber@demo.so', 'Cashier', [RBR]), cS: user('Sahra (Cashier, Rio Store)', 'cashier.store@demo.so', 'Cashier', [RST]), cR: user('Abdi (Cashier, Reyxaan Store)', 'cashier.reyxaan@demo.so', 'Cashier', [RYX]),
    tR: user('Bashir (Technician, Reyxaan Store)', 'tech.reyxaan@demo.so', 'Technician', [RYX], 1500),
    asst: user('Ayaan (Sales assistant, Rio Store)', 'assistant.store@demo.so', 'Sales Assistant', [RST]),
    ahmed: user('Ahmed (Barber)', 'ahmed@demo.so', 'Barber', [RBR], 4000), farah: user('Farah (Barber)', 'farah@demo.so', 'Barber', [RBR], 4500), omar: user('Omar (Barber)', 'omar@demo.so', 'Barber', [RBR], 5000),
  };
  const ctxOf = (id) => Ctx.forUserId(db, id);
  const sup = (name) => fin.saveSupplier(O, null, { name, phone: '+252 61 555' + rand(900) }).id; const S1 = sup('Dubai Textiles FZE'), S2 = sup('Gulf Mobile Distribution'), S3 = sup('Grooming Supplies Co');
  const cust = ['Abdirahman Ali', 'Fadumo Hassan', 'Mustafe Warsame', 'Khadra Omar', 'Jamal Noor', 'Sagal Ibrahim', 'Hussein Abdi', 'Ladan Yusuf'].map((n, i) => fin.saveCustomer(O, null, { name: n, phone: '+252 61 77' + (1000 + i) }).id);

  // --- catalogue ---
  const prod = (business_id, name, category, brand, kind, variants, extra = {}) => inv.createProduct(O, { business_id, name, category, brand, kind, variants, ...extra }).id;
  const sizes = ['M', 'L', 'XL'], colors = ['Black', 'White'];
  prod(RIOS, 'Classic Polo Shirt', 'Shirts', 'Rio', 'standard', sizes.flatMap((s) => colors.map((c) => ({ sku: `POLO-${c[0]}-${s}`, barcode: `600100${s.length}${c[0] === 'B' ? 1 : 2}${s[0].charCodeAt(0)}`, attrs: { size: s, color: c }, cost: 800, price: 1800, min_stock: 5 }))));
  prod(RIOS, 'Runner Sneakers', 'Footwear', 'Stride', 'standard', [41, 42, 43, 44].map((s) => ({ sku: `SNK-${s}`, barcode: `60020${s}`, attrs: { size: s, color: 'Grey' }, cost: 2200, price: 4500, min_stock: 3 })));
  prod(RIOS, 'Slim Denim Jeans', 'Trousers', 'Rio', 'standard', ['30', '32', '34'].map((s) => ({ sku: `JEAN-${s}`, barcode: `60030${s}`, attrs: { size: s, color: 'Blue' }, cost: 1500, price: 3200, min_stock: 4 })));
  prod(RIOS, 'Dress Abaya', 'Fashion', 'Rio', 'standard', ['52', '54', '56'].map((s) => ({ sku: `ABY-${s}`, barcode: `60040${s}`, attrs: { size: s, color: 'Black' }, cost: 2500, price: 5500, min_stock: 3 })));
  prod(REYX, 'Galaxy A15 128GB', 'Phones', 'Samsung', 'serialized', [{ sku: 'SGA15-128', barcode: '880000015', attrs: { storage: '128GB' }, cost: 11000, price: 15500 }], { warranty_months: 12 });
  prod(REYX, 'iPhone 13 128GB', 'Phones', 'Apple', 'serialized', [{ sku: 'IP13-128', barcode: '194000013', attrs: { storage: '128GB' }, cost: 48000, price: 59900 }], { warranty_months: 12 });
  prod(REYX, 'USB-C Cable 1m', 'Accessories', 'Anker', 'standard', [{ sku: 'CBL-C1', barcode: '700100001', attrs: {}, cost: 200, price: 600, min_stock: 10 }]);
  prod(REYX, 'Phone Case Universal', 'Accessories', 'Generic', 'standard', [{ sku: 'CASE-U', barcode: '700100002', attrs: {}, cost: 150, price: 500, min_stock: 10 }]);
  prod(REYX, 'Galaxy A15 Screen', 'Spare parts', 'Samsung', 'standard', [{ sku: 'PART-A15-SCR', barcode: '700200001', attrs: {}, cost: 2800, price: 4500, min_stock: 2 }], { is_part: 1 });
  prod(REYX, 'iPhone Battery', 'Spare parts', 'Apple', 'standard', [{ sku: 'PART-IP-BAT', barcode: '700200002', attrs: {}, cost: 1800, price: 3500, min_stock: 2 }], { is_part: 1 });
  prod(REYX, 'Charging Port Module', 'Spare parts', 'Generic', 'standard', [{ sku: 'FX-PORT', barcode: '700300002', attrs: {}, cost: 600, price: 1500, min_stock: 3 }], { is_part: 1 });
  prod(RIOS, 'Wool Winter Scarf', 'Accessories', 'Rio', 'standard', [{ sku: 'SCARF-W', barcode: '600500001', attrs: { color: 'Grey' }, cost: 400, price: 1200, min_stock: 2 }]); // bought, not selling: shows on the discount list
  // maximum discount each item may be sold at (sellers cannot go below it; the QR label and the scanner show it)
  for (const [like, bp] of [['POLO-%', 1000], ['SNK-%', 1000], ['JEAN-%', 1500], ['ABY-%', 1000], ['SCARF-%', 3000], ['CBL-%', 2000], ['CASE-%', 2000], ['SGA15-%', 500], ['IP13-%', 300]]) db.prepare('UPDATE variants SET max_discount_bp=? WHERE org_id=? AND sku LIKE ?').run(bp, ORG, like);
  admin.updateUser(O, U.farah, { commission_fixed: 50 }); // Farah: 45% plus 0.50 for every service (rates are set by the owner in Commissions > Rates per barber)
  const vid = (sku) => db.prepare('SELECT id FROM variants WHERE org_id=? AND sku=?').get(ORG, sku).id;
  const svc = (name, price, d, cost) => fin.saveService(O, null, { business_id: RIOB, name, price, duration_min: d, consumable_cost: cost }).id;
  const SV = { cut: svc('Haircut', 500, 30, 30), beard: svc('Beard trimming', 300, 15, 15), pkg: svc('Haircut + beard package', 700, 40, 40), kid: svc('Kids haircut', 300, 20, 20), wash: svc('Hair wash & style', 400, 25, 50) };
  const cat = (n) => fin.listCategories(O).rows.find((c) => c.name === n).id;

  // --- stocking (days ago) ---
  setNow(`${addDays(today, -days)}T07:00:00.000Z`);
  const buy = (ctx, branch, supplier, lines, serials, pays = 0) => { const id = inv.createPurchase(ctx, { branch_id: branch, supplier_id: supplier, lines, receive_now: true, receive_serials: serials, charges: lines.length * 50 }).id; const po = db.prepare('SELECT billed FROM purchases WHERE id=?').get(id); if (pays) pay.recordPayment(ctx, { party_type: 'purchase', party_id: id, method_id: BANK, amount: Math.min(po.billed, pays), external_ref: 'BNK-' + id }); return id; };
  buy(O, RST, S1, db.prepare("SELECT v.id variant_id, v.cost unit_cost FROM variants v JOIN products p ON p.id=v.product_id WHERE p.business_id=? ORDER BY v.id").all(RIOS).map((v) => ({ ...v, qty: 12 })), null, 150000);
  const imeis = (p, n) => Array.from({ length: n }, (_, i) => `${p}${String(100000 + i)}`);
  buy(O, RYX, S2, [{ variant_id: vid('SGA15-128'), qty: 6, unit_cost: 11000 }, { variant_id: vid('IP13-128'), qty: 3, unit_cost: 48000 }, { variant_id: vid('CBL-C1'), qty: 40, unit_cost: 200 }, { variant_id: vid('CASE-U'), qty: 40, unit_cost: 150 }, { variant_id: vid('PART-A15-SCR'), qty: 6, unit_cost: 2800 }, { variant_id: vid('PART-IP-BAT'), qty: 5, unit_cost: 1800 }, { variant_id: vid('FX-PORT'), qty: 8, unit_cost: 600 }], [imeis('35600', 6), imeis('35700', 3)], 200000);

  // --- daily trading ---
  const mgr = { RBR: ctxOf(U.mB), RST: ctxOf(U.mS), RYX: ctxOf(U.mR) }; const desk = { RBR: ctxOf(U.cB), RST: ctxOf(U.cS), RYX: ctxOf(U.cR) }; const barbers = [U.ahmed, U.farah, U.omar];
  const polo = db.prepare("SELECT id FROM variants WHERE sku LIKE 'POLO-%'").all().map((r) => r.id); const snk = [41, 42, 43, 44].map((s) => vid('SNK-' + s)); const jeans = ['30', '32', '34'].map((s) => vid('JEAN-' + s)); const aby = ['52', '54', '56'].map((s) => vid('ABY-' + s));
  const imeiSold = { 35600: 0, 35700: 0 }; let anySaleId = null; const branchIds = { RBR, RST, RYX };
  for (let d = days; d >= 0; d--) {
    const date = addDays(today, -d);
    setNow(`${date}T05:30:00.000Z`);
    const reg = {}; for (const k of Object.keys(desk)) reg[k] = fin.openRegister(desk[k], { branch_id: branchIds[k], opening_cash: 10000 }).id;
    setNow(`${date}T08:00:00.000Z`);
    for (let i = 0; i < 3 + rand(3); i++) {
      const lines = [{ variant_id: pick([...polo, ...snk, ...jeans, ...aby]), qty: 1 + rand(2) }]; if (rand(3) === 0) lines.push({ variant_id: pick([...polo, ...aby]), qty: 1 });
      try { const total = lines.reduce((a, l) => a + db.prepare('SELECT price FROM variants WHERE id=?').get(l.variant_id).price * l.qty, 0); const r = sales.createSale(desk.RST, { branch_id: RST, kind: 'retail', lines, discount: rand(5) === 0 ? 100 : 0, payments: [{ method_id: rand(3) === 0 ? MOBILE : CASH, amount: total - (lines.length ? 0 : 0) }] }); anySaleId ||= r.id; }
      catch (e) { if (!['insufficient_stock', 'overpayment'].includes(e.code) && e.message !== 'approval_required') throw e; }
    }
    for (const l of [[vid('CBL-C1'), 2], [vid('CASE-U'), 1]]) { const p = db.prepare('SELECT price FROM variants WHERE id=?').get(l[0]).price * l[1]; try { sales.createSale(desk.RYX, { branch_id: RYX, kind: 'retail', lines: [{ variant_id: l[0], qty: l[1] }], payments: [{ method_id: CASH, amount: p }] }); } catch (e) { if (e.code !== 'insufficient_stock') throw e; } }
    if (d % 3 === 0) { const pref = d % 6 === 0 ? 35600 : 35700; const sku = pref === 35600 ? 'SGA15-128' : 'IP13-128'; const n = imeiSold[pref]++; const dev = db.prepare('SELECT id,serial FROM devices WHERE serial=?').get(`${pref}${100000 + n}`); if (dev) { const price = db.prepare('SELECT price FROM variants WHERE sku=?').get(sku).price; try { sales.createSale(desk.RYX, { branch_id: RYX, kind: 'retail', customer_id: pick(cust), lines: [{ serial: dev.serial, qty: 1 }], payments: [{ method_id: CASH, amount: Math.floor(price * 0.6) }, { method_id: MOBILE, amount: price - Math.floor(price * 0.6), external_ref: `MM${d}${pref}` }] }); } catch (e) { if (!['insufficient_stock', 'device_unavailable'].includes(e.code)) throw e; } } }
    // barber shop: front desk records each customer visit and the barber who served them
    for (let i = 0; i < 6 + rand(5); i++) {
      const lines = [{ service_id: pick([SV.cut, SV.beard, SV.pkg, SV.kid, SV.wash]), barber_id: pick(barbers) }]; if (rand(4) === 0) lines.push({ service_id: SV.beard, barber_id: pick(barbers) });
      const total = lines.reduce((a, l) => a + db.prepare('SELECT price FROM services WHERE id=?').get(l.service_id).price, 0);
      sales.createSale(desk.RBR, { branch_id: RBR, kind: 'service', customer_name: rand(2) ? 'Walk-in' : undefined, lines, tip: rand(5) === 0 ? 100 : 0, payments: [{ method_id: rand(2) ? CASH : MOBILE, amount: total }] });
    }
    setNow(`${date}T15:00:00.000Z`);
    for (const k of Object.keys(desk)) { const s = db.prepare('SELECT * FROM register_sessions WHERE id=?').get(reg[k]); const exp = fin.sessionTotals(desk[k], s).expected; const short = d === 3 && k === 'RST' ? 500 : 0; fin.closeRegister(desk[k], reg[k], { counted: exp - short, explanation: short ? 'Cash short - change error' : undefined }); if (!short) fin.approveRegister(mgr[k], reg[k]); }
  }
  // --- repairs at Reyxaan Store ---
  setNow(`${addDays(today, -5)}T09:00:00.000Z`);
  const tR = ctxOf(U.tR); fin.openRegister(desk.RYX, { branch_id: RYX, opening_cash: 20000 }); // stays open for the repair desk
  const mkRepair = (ctx, o) => rep.createRepair(ctx, { branch_id: RYX, technician_id: U.tR, ...o }).id;
  const R1 = mkRepair(desk.RYX, { customer_id: cust[0], customer_name: 'Abdirahman Ali', customer_phone: '+252 61 771000', device_category: 'Phone', brand: 'Samsung', model: 'A15', serial: 'REP-IMEI-1', fault: 'Cracked screen', condition_notes: 'Scratches on back', accessories: 'Charger', est_price: 6500, payments: [{ method_id: CASH, amount: 2000 }] });
  rep.addCharge(tR, R1, { kind: 'part', variant_id: vid('PART-A15-SCR'), qty: 1 }); rep.addCharge(tR, R1, { kind: 'labor', description: 'Screen replacement labour', unit_price: 2000 });
  rep.recordApproval(desk.RYX, R1, { decision: 'approved', by_name: 'Abdirahman Ali', note: 'Phone call 10:05' });
  setNow(`${addDays(today, -4)}T11:00:00.000Z`); rep.updateRepair(tR, R1, { diagnosis: 'Display digitizer broken', qc_done: true }); rep.setStatus(tR, R1, 'completed', 'Tested OK');
  setNow(`${addDays(today, -3)}T10:00:00.000Z`); pay.recordPayment(desk.RYX, { party_type: 'repair', party_id: R1, method_id: MOBILE, amount: 4500, external_ref: 'MM-REP1' }); rep.setStatus(desk.RYX, R1, 'delivered', 'Collected by customer');
  const R2 = mkRepair(desk.RYX, { customer_name: 'Walk-in Caller', customer_phone: '+252 61 800200', device_category: 'Phone', brand: 'Apple', model: 'iPhone 11', fault: 'Battery drains fast', est_price: 5000, est_completion: addDays(today, -1) }); rep.setStatus(tR, R2, 'diagnosing');
  const R3 = mkRepair(desk.RYX, { customer_name: 'Mukhtar Dahir', customer_phone: '+252 61 900300', device_category: 'Phone', brand: 'Tecno', model: 'Spark 10', fault: 'Not charging', est_price: 2500, payments: [{ method_id: CASH, amount: 500 }] });
  rep.addCharge(tR, R3, { kind: 'part', variant_id: vid('FX-PORT'), qty: 1 }); rep.addCharge(tR, R3, { kind: 'labor', description: 'Port replacement', unit_price: 1000 }); rep.setStatus(tR, R3, 'awaiting_approval');
  setNow(`${addDays(today, -1)}T10:00:00.000Z`); rep.recordApproval(mgr.RYX, R3, { decision: 'approved', by_name: 'Mukhtar Dahir' }); rep.addCharge(tR, R3, { kind: 'labor', description: 'Extra board cleaning', unit_price: 500 });
  mkRepair(desk.RYX, { customer_name: 'Hodan Farah', customer_phone: '+252 61 700111', device_category: 'Tablet', brand: 'Lenovo', model: 'Tab M10', fault: "Won't boot", est_price: 4000 });

  // --- barber staff accounting: advance, authorised deduction, payout; a refund; expenses ---
  setNow(`${today}T09:00:00.000Z`);
  com.recordAdvance(mgr.RBR, { branch_id: RBR, employee_id: U.ahmed, amount: 500, method_id: CASH, note: 'Advance' });
  com.recordDeduction(mgr.RBR, { branch_id: RBR, employee_id: U.omar, amount: 150, reason: 'Damaged clipper' });
  com.createPayout(mgr.RBR, { branch_id: RBR, employee_id: U.ahmed, period_to: addDays(today, -Math.max(1, Math.min(5, days - 1))), amount_paid: 1000, method_id: CASH, deductions: 0, note: 'Settlement' });
  if (anySaleId) { try { sales.returnSale(mgr.RST, { sale_id: anySaleId, lines: [{ sale_line_id: db.prepare('SELECT id FROM sale_lines WHERE sale_id=?').get(anySaleId).id, qty: 1 }], refund_method_id: CASH, reason: 'Wrong size' }); } catch { /* ignore */ } }
  setNow(`${addDays(today, -7)}T09:30:00.000Z`);
  for (const [b, a] of [[RST, 9000], [RYX, 12000], [RBR, 6000]]) fin.createExpense(O, { scope: 'branch', branch_id: b, category_id: cat('Rent'), amount: a, method_id: BANK, description: 'Monthly rent' });
  fin.createExpense(O, { scope: 'branch', branch_id: RBR, category_id: cat('Supplies'), amount: 3000, method_id: MOBILE, description: 'Clippers, capes, shampoo' });
  fin.createExpense(O, { scope: 'branch', branch_id: RBR, category_id: cat('Electricity'), amount: 1800, method_id: MOBILE, description: 'Electricity' });
  fin.createExpense(O, { scope: 'org', category_id: cat('Marketing'), amount: 4500, method_id: BANK, alloc_rule: 'revenue', description: 'Hubdex social media campaign (shared across the three branches)' });
  // two baskets scanned by the sales assistant, waiting for the Rio Store manager to take the money and complete them
  setNow(`${today}T10:15:00.000Z`);
  const asst = ctxOf(U.asst);
  for (const lines of [[{ variant_id: vid('JEAN-32'), qty: 1 }, { variant_id: vid('POLO-B-L'), qty: 1, discount: 100 }], [{ variant_id: vid('ABY-54'), qty: 1 }]]) { try { orders.createOrder(asst, { branch_id: RST, customer_name: 'Walk-in', lines }); } catch (e) { if (e.code !== 'insufficient_stock') throw e; } }
  setNow(null);
  return { org_id: ORG, owner_id, ids: { RBR, RST, RYX, RIOB, RIOS, REYX }, users: U, methods: { CASH, MOBILE, BANK }, repairs: { R1, R2, R3 } };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const db = openDb(process.env.DB_FILE || (process.env.DATA_DIR || './data') + '/bizsuite.sqlite');
  if (db.prepare('SELECT COUNT(*) c FROM orgs').get().c) { console.error('Database already has data. Remove it first to re-seed.'); process.exit(1); }
  const r = seedDemo(db); console.log('Demo data created.', JSON.stringify(r.ids));
}
