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
import * as fin from './finance.js';
import { addDays } from './time.js';

export const DEMO_PASSWORD = 'Demo@1234';
export function seedIfEmpty(db) { if (!db.prepare('SELECT COUNT(*) c FROM orgs').get().c) return seedDemo(db); }

export function seedDemo(db, { days = 14 } = {}) {
  let rnd = 12345; const rand = (n) => { rnd = (rnd * 1103515245 + 12345) & 0x7fffffff; return rnd % n; }; const pick = (a) => a[rand(a.length)];
  db.prepare("INSERT INTO users(org_id,name,email,pass_hash,is_platform,created_at) VALUES(NULL,'Platform Admin','platform@bizsuite.local',?,1,?)").run(hashPassword(DEMO_PASSWORD), new Date().toISOString());
  const { org_id: ORG, owner_id } = createTenant(db, { name: 'Hodan Group', owner_name: 'Hodan Owner', owner_email: 'owner@demo.so', owner_password: DEMO_PASSWORD, saas: false });
  const O = Ctx.forUserId(db, owner_id); const today = new Date().toISOString().slice(0, 10);
  const role = (n) => db.prepare('SELECT id FROM roles WHERE org_id=? AND name=?').get(ORG, n).id;
  const M = (n) => db.prepare('SELECT id FROM payment_methods WHERE org_id=? AND name LIKE ?').get(ORG, n + '%').id; const CASH = M('Cash'), MOBILE = M('Mobile'), BANK = M('Bank');

  // --- structure ---
  const biz = (name, type) => admin.createBusiness(O, { name, type }).id;
  const UW = biz('Urban Wear', 'clothing'), TH = biz('TechHub', 'electronics_combined'), FX = biz('FixIt Pro', 'electronics_repair'), EC = biz('Elite Cuts', 'barber'), ECK = biz('Elite Cuts Kenya', 'barber');
  const br = (business_id, code, name, extra = {}) => admin.createBranch(O, { business_id, code, name, address: name + ' Road', phone: '+252 61 000' + rand(9000), receipt_footer: 'Thank you / Mahadsanid', ...extra }).id;
  const UWM = br(UW, 'UWM', 'Urban Wear Mogadishu'), UWH = br(UW, 'UWH', 'Urban Wear Hargeisa', { timezone: 'Africa/Mogadishu' });
  const THM = br(TH, 'THM', 'TechHub Mogadishu', { require_register: 1 }), THB = br(TH, 'THB', 'TechHub Baidoa');
  const FXM = br(FX, 'FXM', 'FixIt Pro Mogadishu'), ECM = br(EC, 'ECM', 'Elite Cuts Mogadishu', { tip_to: 'employee' });
  const ECN = br(ECK, 'ECN', 'Elite Cuts Nairobi', { currency: 'KES', timezone: 'Africa/Nairobi', tax_bp: 1600 });
  admin.addDepartment(O, THM, { name: 'Repair Desk', kind: 'electronics_repair' });
  fin.setExchangeRate(O, { from_ccy: 'KES', to_ccy: 'USD', rate_ppm: 7700, effective_date: addDays(today, -30) });
  for (const [b] of [[UWM], [UWH], [THM], [THB], [FXM], [ECM]]) fin.setBranchAccount(O, b, M('Mobile'), 50000), fin.setBranchAccount(O, b, M('Bank'), 200000);

  const user = (name, email, r, branches, bp = 0) => admin.createUser(O, { name, email, password: DEMO_PASSWORD, role_id: role(r), branch_ids: branches, commission_bp: bp, lang: 'en' }).id;
  const U = {
    acct: user('Amina Accountant', 'accountant@demo.so', 'Accountant', []),
    mUW: user('Mohamed Manager (Urban Wear MOG)', 'manager.uw@demo.so', 'Branch Manager', [UWM]), mUWH: user('Hawa Manager (Urban Wear HGA)', 'manager.hga@demo.so', 'Branch Manager', [UWH]),
    mTH: user('Liban Manager (TechHub MOG)', 'manager.th@demo.so', 'Branch Manager', [THM]), mEC: user('Yusuf Manager (Elite Cuts)', 'manager.ec@demo.so', 'Branch Manager', [ECM]),
    cUW: user('Sahra Cashier (Urban Wear MOG)', 'cashier.uw@demo.so', 'Cashier', [UWM]), cUWH: user('Idil Cashier (Urban Wear HGA)', 'cashier.hga@demo.so', 'Cashier', [UWH]),
    cTH: user('Abdi Cashier (TechHub MOG)', 'cashier.th@demo.so', 'Cashier', [THM]), mFX: user('Farhan Manager (FixIt Pro)', 'manager.fx@demo.so', 'Branch Manager', [FXM]),
    tTH: user('Bashir Technician (TechHub)', 'tech.th@demo.so', 'Technician', [THM], 1500), tFX: user('Guled Technician (FixIt)', 'tech.fx@demo.so', 'Technician', [FXM], 2000),
    ahmed: user('Ahmed (Barber)', 'ahmed@demo.so', 'Barber', [ECM], 4000), farah: user('Farah (Barber)', 'farah@demo.so', 'Barber', [ECM], 4500), omar: user('Omar (Barber)', 'omar@demo.so', 'Barber', [ECM], 5000),
    kamau: user('Kamau (Barber)', 'kamau@demo.so', 'Barber', [ECN], 4000), mECN: user('Njeri Manager (Elite Cuts Nairobi)', 'manager.ecn@demo.so', 'Branch Manager', [ECN]),
  };
  const ctxOf = (id) => Ctx.forUserId(db, id);
  const sup = (name) => fin.saveSupplier(O, null, { name, phone: '+252 61 555' + rand(900) }).id; const S1 = sup('Dubai Textiles FZE'), S2 = sup('Gulf Mobile Distribution'), S3 = sup('Nairobi Grooming Supplies');
  const cust = ['Abdirahman Ali', 'Fadumo Hassan', 'Mustafe Warsame', 'Khadra Omar', 'Jamal Noor', 'Sagal Ibrahim', 'Hussein Abdi', 'Ladan Yusuf'].map((n, i) => fin.saveCustomer(O, null, { name: n, phone: '+252 61 77' + (1000 + i) }).id);

  // --- catalogue ---
  const prod = (business_id, name, category, brand, kind, variants, extra = {}) => inv.createProduct(O, { business_id, name, category, brand, kind, variants, ...extra }).id;
  const sizes = ['M', 'L', 'XL'], colors = ['Black', 'White'];
  prod(UW, 'Classic Polo Shirt', 'Shirts', 'Hodan', 'standard', sizes.flatMap((s) => colors.map((c) => ({ sku: `POLO-${c[0]}-${s}`, barcode: `600100${s.length}${c[0] === 'B' ? 1 : 2}${s[0].charCodeAt(0)}`, attrs: { size: s, color: c }, cost: 800, price: 1800, min_stock: 5 }))));
  prod(UW, 'Runner Sneakers', 'Footwear', 'Stride', 'standard', [41, 42, 43, 44].map((s) => ({ sku: `SNK-${s}`, barcode: `60020${s}`, attrs: { size: s, color: 'Grey' }, cost: 2200, price: 4500, min_stock: 3 })));
  prod(UW, 'Slim Denim Jeans', 'Trousers', 'Hodan', 'standard', ['30', '32', '34'].map((s) => ({ sku: `JEAN-${s}`, barcode: `60030${s}`, attrs: { size: s, color: 'Blue' }, cost: 1500, price: 3200, min_stock: 4 })));
  prod(TH, 'Galaxy A15 128GB', 'Phones', 'Samsung', 'serialized', [{ sku: 'SGA15-128', barcode: '880000015', attrs: { storage: '128GB' }, cost: 11000, price: 15500 }], { warranty_months: 12 });
  prod(TH, 'iPhone 13 128GB', 'Phones', 'Apple', 'serialized', [{ sku: 'IP13-128', barcode: '194000013', attrs: { storage: '128GB' }, cost: 48000, price: 59900 }], { warranty_months: 12 });
  prod(TH, 'USB-C Cable 1m', 'Accessories', 'Anker', 'standard', [{ sku: 'CBL-C1', barcode: '700100001', attrs: {}, cost: 200, price: 600, min_stock: 10 }]);
  prod(TH, 'Phone Case Universal', 'Accessories', 'Generic', 'standard', [{ sku: 'CASE-U', barcode: '700100002', attrs: {}, cost: 150, price: 500, min_stock: 10 }]);
  prod(TH, 'Galaxy A15 Screen', 'Spare parts', 'Samsung', 'standard', [{ sku: 'PART-A15-SCR', barcode: '700200001', attrs: {}, cost: 2800, price: 4500, min_stock: 2 }], { is_part: 1 });
  prod(TH, 'iPhone Battery', 'Spare parts', 'Apple', 'standard', [{ sku: 'PART-IP-BAT', barcode: '700200002', attrs: {}, cost: 1800, price: 3500, min_stock: 2 }], { is_part: 1 });
  prod(FX, 'Universal Screen Protector', 'Spare parts', 'Generic', 'standard', [{ sku: 'FX-PROT', barcode: '700300001', attrs: {}, cost: 100, price: 400, min_stock: 5 }], { is_part: 1 });
  prod(FX, 'Charging Port Module', 'Spare parts', 'Generic', 'standard', [{ sku: 'FX-PORT', barcode: '700300002', attrs: {}, cost: 600, price: 1500, min_stock: 3 }], { is_part: 1 });
  const vid = (sku) => db.prepare('SELECT id FROM variants WHERE org_id=? AND sku=?').get(ORG, sku).id;
  const svc = (business_id, name, price, d, cost) => fin.saveService(O, null, { business_id, name, price, duration_min: d, consumable_cost: cost }).id;
  const SV = { cut: svc(EC, 'Haircut', 500, 30, 30), beard: svc(EC, 'Beard trimming', 300, 15, 15), pkg: svc(EC, 'Haircut + beard package', 700, 40, 40), kid: svc(EC, 'Kids haircut', 300, 20, 20) };
  const SVK = { cut: svc(ECK, 'Haircut', 30000, 30, 2000), beard: svc(ECK, 'Beard trimming', 20000, 15, 1000) };
  for (const e of [['Rent', 30000, UWM], ['Rent', 22000, UWH], ['Rent', 40000, THM], ['Rent', 25000, FXM], ['Rent', 20000, ECM]]) { /* monthly rents booked below */ void e; }
  const cat = (n) => fin.listCategories(O).rows.find((c) => c.name === n).id;

  // --- stocking (13 days ago) ---
  setNow(`${addDays(today, -days)}T07:00:00.000Z`);
  const buy = (ctx, branch, supplier, lines, serials, pays = 0) => { const id = inv.createPurchase(ctx, { branch_id: branch, supplier_id: supplier, lines, receive_now: true, receive_serials: serials, charges: lines.length * 50 }).id; const po = db.prepare('SELECT billed FROM purchases WHERE id=?').get(id); if (pays) pay.recordPayment(ctx, { party_type: 'purchase', party_id: id, method_id: BANK, amount: Math.min(po.billed, pays), external_ref: 'BNK-' + id }); return id; };
  buy(O, UWM, S1, db.prepare("SELECT v.id variant_id FROM variants v JOIN products p ON p.id=v.product_id WHERE p.business_id=? ORDER BY v.id").all(UW).map((v) => ({ variant_id: v.variant_id, qty: 12, unit_cost: db.prepare('SELECT cost FROM variants WHERE id=?').get(v.variant_id).cost })), null, 100000);
  buy(O, UWH, S1, db.prepare("SELECT v.id variant_id,v.cost unit_cost FROM variants v JOIN products p ON p.id=v.product_id WHERE p.business_id=? ORDER BY v.id").all(UW).map((v) => ({ ...v, qty: 6 })));
  const imeis = (p, n) => Array.from({ length: n }, (_, i) => `${p}${String(100000 + i)}`);
  buy(O, THM, S2, [{ variant_id: vid('SGA15-128'), qty: 6, unit_cost: 11000 }, { variant_id: vid('IP13-128'), qty: 3, unit_cost: 48000 }, { variant_id: vid('CBL-C1'), qty: 40, unit_cost: 200 }, { variant_id: vid('CASE-U'), qty: 40, unit_cost: 150 }, { variant_id: vid('PART-A15-SCR'), qty: 6, unit_cost: 2800 }, { variant_id: vid('PART-IP-BAT'), qty: 5, unit_cost: 1800 }], [imeis('35600', 6), imeis('35700', 3)], 200000);
  buy(O, THB, S2, [{ variant_id: vid('SGA15-128'), qty: 3, unit_cost: 11000 }, { variant_id: vid('CBL-C1'), qty: 20, unit_cost: 200 }], [imeis('35800', 3)]);
  buy(O, FXM, S2, [{ variant_id: vid('FX-PROT'), qty: 30, unit_cost: 100 }, { variant_id: vid('FX-PORT'), qty: 8, unit_cost: 600 }].map((l) => l));
  // transfers: one received, one left IN TRANSIT
  const trf = (from, to, lines) => inv.createTransfer(O, { from_branch_id: from, to_branch_id: to, lines }).id;
  const t1 = trf(UWM, UWH, [{ variant_id: vid('SNK-42'), qty: 3 }, { variant_id: vid('JEAN-32'), qty: 2 }]); inv.receiveTransfer(O, t1);

  // --- daily trading ---
  const mgr = { UWM: ctxOf(U.mUW), UWH: ctxOf(U.mUWH), THM: ctxOf(U.mTH), ECM: ctxOf(U.mEC), ECN: ctxOf(U.mECN), FXM: ctxOf(U.mFX) };
  const cash = { UWM: ctxOf(U.cUW), UWH: ctxOf(U.cUWH), THM: ctxOf(U.cTH) }; const barbers = [U.ahmed, U.farah, U.omar];
  const polo = db.prepare("SELECT id FROM variants WHERE sku LIKE 'POLO-%'").all().map((r) => r.id); const snk = [41, 42, 43, 44].map((s) => vid('SNK-' + s)); const jeans = ['30', '32', '34'].map((s) => vid('JEAN-' + s));
  const imeiSold = { 35600: 0, 35700: 0 }; let anySaleId = null; let creditSale = null;
  for (let d = days; d >= 0; d--) {
    const date = addDays(today, -d);
    setNow(`${date}T05:30:00.000Z`);
    const reg = {}; for (const k of Object.keys(cash)) reg[k] = fin.openRegister(cash[k], { branch_id: { UWM, UWH, THM }[k], opening_cash: 10000 }).id;
    const mgrECreg = fin.openRegister(mgr.ECM, { branch_id: ECM, opening_cash: 5000 }).id; const nbReg = fin.openRegister(mgr.ECN, { branch_id: ECN, opening_cash: 500000 }).id;
    setNow(`${date}T08:00:00.000Z`);
    // clothing
    for (const [k, b, vs] of [['UWM', UWM, [...polo, ...snk, ...jeans]], ['UWH', UWH, [...snk, ...jeans, ...polo]]]) {
      for (let i = 0; i < 3 + rand(3); i++) {
        const lines = [{ variant_id: pick(vs), qty: 1 + rand(2) }]; if (rand(3) === 0) lines.push({ variant_id: pick(vs), qty: 1 });
        try {
          const probe = lines.map((l) => db.prepare('SELECT price FROM variants WHERE id=?').get(l.variant_id).price * l.qty).reduce((a, b2) => a + b2, 0);
          const r = sales.createSale(cash[k], { branch_id: b, kind: 'retail', lines, discount: rand(5) === 0 ? 100 : 0, payments: [{ method_id: rand(3) === 0 ? MOBILE : CASH, amount: probe - (lines.length ? 0 : 0) }] .map((p) => p) }); anySaleId ||= r.id;
        } catch (e) { if (!['insufficient_stock', 'overpayment', 'approval_required'].includes(e.code) && e.message !== 'approval_required') { if (e.code !== 'insufficient_stock') throw e; } }
      }
    }
    // electronics
    for (const l of [[vid('CBL-C1'), 2], [vid('CASE-U'), 1]]) { const p = db.prepare('SELECT price FROM variants WHERE id=?').get(l[0]).price * l[1]; try { sales.createSale(cash.THM, { branch_id: THM, kind: 'retail', lines: [{ variant_id: l[0], qty: l[1] }], payments: [{ method_id: CASH, amount: p }] }); } catch (e) { if (e.code !== 'insufficient_stock') throw e; } }
    if (d % 3 === 0) { const pref = d % 6 === 0 ? 35600 : 35700; const sku = pref === 35600 ? 'SGA15-128' : 'IP13-128'; const n = imeiSold[pref]++; const dev = db.prepare('SELECT id,serial FROM devices WHERE serial=?').get(`${pref}${100000 + n}`); if (dev) { const price = db.prepare('SELECT price FROM variants WHERE sku=?').get(sku).price; try { const s = sales.createSale(cash.THM, { branch_id: THM, kind: 'retail', customer_id: pick(cust), lines: [{ serial: dev.serial, qty: 1 }], payments: [{ method_id: CASH, amount: Math.floor(price * 0.6) }, { method_id: MOBILE, amount: price - Math.floor(price * 0.6), external_ref: `MM${d}${pref}` }] }); creditSale ||= s.id; } catch (e) { if (!['insufficient_stock', 'device_unavailable'].includes(e.code)) throw e; } } }
    // barber visits (Mogadishu USD, Nairobi KES)
    for (let i = 0; i < 5 + rand(4); i++) {
      const b1 = pick(barbers); const lines = [{ service_id: pick([SV.cut, SV.beard, SV.pkg, SV.kid]), barber_id: b1 }]; if (rand(4) === 0) lines.push({ service_id: SV.beard, barber_id: pick(barbers) });
      const total = lines.reduce((a, l) => a + db.prepare('SELECT price FROM services WHERE id=?').get(l.service_id).price, 0);
      sales.createSale(mgr.ECM, { branch_id: ECM, kind: 'service', customer_name: rand(2) ? 'Walk-in' : undefined, lines, tip: rand(5) === 0 ? 100 : 0, payments: [{ method_id: rand(2) ? CASH : MOBILE, amount: total }] });
    }
    for (let i = 0; i < 3; i++) { const l = [{ service_id: pick([SVK.cut, SVK.beard]), barber_id: U.kamau }]; const p = db.prepare('SELECT price FROM services WHERE id=?').get(l[0].service_id).price; const t = p + Math.round(p * 0.16); sales.createSale(mgr.ECN, { branch_id: ECN, kind: 'service', lines: l, payments: [{ method_id: CASH, amount: t }] }); }
    // close registers (one cashier is 5.00 short on day -3)
    setNow(`${date}T15:00:00.000Z`);
    for (const k of Object.keys(cash)) { const s = db.prepare('SELECT * FROM register_sessions WHERE id=?').get(reg[k]); const exp = fin.sessionTotals(cash[k], s).expected; const short = d === 3 && k === 'UWM' ? 500 : 0; const c = fin.closeRegister(cash[k], reg[k], { counted: exp - short, explanation: short ? 'Cash short - change error' : undefined }); void c; if (!short) fin.approveRegister(mgr[k], reg[k]); }
    for (const [ctx, id] of [[mgr.ECM, mgrECreg], [mgr.ECN, nbReg]]) { const s = db.prepare('SELECT * FROM register_sessions WHERE id=?').get(id); fin.closeRegister(ctx, id, { counted: fin.sessionTotals(ctx, s).expected }); }
  }
  // --- repairs (today and recent) ---
  setNow(`${addDays(today, -5)}T09:00:00.000Z`);
  const tTH = ctxOf(U.tTH); const tFX = ctxOf(U.tFX);
  fin.openRegister(cash.THM, { branch_id: THM, opening_cash: 20000 }); // stays open: used by the repair desk for the rest of the demo
  const mkRepair = (ctx, branch, tech, o) => rep.createRepair(ctx, { branch_id: branch, technician_id: tech, ...o }).id;
  const R1 = mkRepair(cash.THM, THM, U.tTH, { customer_id: cust[0], customer_name: 'Abdirahman Ali', customer_phone: '+252 61 771000', device_category: 'Phone', brand: 'Samsung', model: 'A15', serial: 'REP-IMEI-1', fault: 'Cracked screen', condition_notes: 'Scratches on back', accessories: 'Charger', est_price: 6500, payments: [{ method_id: CASH, amount: 2000 }] });
  rep.addCharge(tTH, R1, { kind: 'part', variant_id: vid('PART-A15-SCR'), qty: 1 }); rep.addCharge(tTH, R1, { kind: 'labor', description: 'Screen replacement labour', unit_price: 2000 });
  rep.recordApproval(cash.THM, R1, { decision: 'approved', by_name: 'Abdirahman Ali', note: 'Phone call 10:05' });
  setNow(`${addDays(today, -4)}T11:00:00.000Z`); rep.updateRepair(tTH, R1, { diagnosis: 'Display digitizer broken', qc_done: true }); rep.setStatus(tTH, R1, 'completed', 'Tested OK');
  setNow(`${addDays(today, -3)}T10:00:00.000Z`); const r1d = pay.recordPayment(cash.THM, { party_type: 'repair', party_id: R1, method_id: MOBILE, amount: 4500, external_ref: 'MM-REP1' }); void r1d; rep.setStatus(cash.THM, R1, 'delivered', 'Collected by customer');
  const R2 = mkRepair(cash.THM, THM, U.tTH, { customer_name: 'Walk-in Caller', customer_phone: '+252 61 800200', device_category: 'Phone', brand: 'Apple', model: 'iPhone 11', fault: 'Battery drains fast', est_price: 5000, est_completion: addDays(today, -1) }); rep.setStatus(tTH, R2, 'diagnosing');
  const R3 = mkRepair(mgr.FXM, FXM, U.tFX, { customer_name: 'Mukhtar Dahir', customer_phone: '+252 61 900300', device_category: 'Phone', brand: 'Tecno', model: 'Spark 10', fault: 'Not charging', est_price: 2500, payments: [{ method_id: CASH, amount: 500 }] });
  rep.addCharge(tFX, R3, { kind: 'part', variant_id: vid('FX-PORT'), qty: 1 }); rep.addCharge(tFX, R3, { kind: 'labor', description: 'Port replacement', unit_price: 1000 }); rep.setStatus(tFX, R3, 'awaiting_approval');
  setNow(`${addDays(today, -1)}T10:00:00.000Z`); rep.recordApproval(mgr.FXM, R3, { decision: 'approved', by_name: 'Mukhtar Dahir' }); rep.addCharge(tFX, R3, { kind: 'labor', description: 'Extra board cleaning', unit_price: 500 }); // needs revision approval
  mkRepair(cash.THM, THM, U.tTH, { customer_name: 'Hodan Farah', customer_phone: '+252 61 700111', device_category: 'Tablet', brand: 'Lenovo', model: 'Tab M10', fault: 'Won\'t boot', est_price: 4000 });

  // --- barber commission advance + payout (Ahmed up to 5 days ago), a refund and an in-transit transfer ---
  setNow(`${today}T09:00:00.000Z`);
  com.recordAdvance(mgr.ECM, { branch_id: ECM, employee_id: U.ahmed, amount: 500, method_id: CASH, note: 'Advance' });
  com.createPayout(mgr.ECM, { branch_id: ECM, employee_id: U.ahmed, period_to: addDays(today, -5), amount_paid: 1000, method_id: CASH, deductions: 0, note: 'Settlement to ' + addDays(today, -5) });
  if (anySaleId) { try { sales.returnSale(mgr.UWM, { sale_id: anySaleId, lines: [{ sale_line_id: db.prepare('SELECT id FROM sale_lines WHERE sale_id=?').get(anySaleId).id, qty: 1 }], refund_method_id: CASH, reason: 'Wrong size' }); } catch { /* sale may belong to HGA */ } }
  inv.createTransfer(O, { from_branch_id: THM, to_branch_id: THB, lines: [{ variant_id: vid('CBL-C1'), qty: 10 }], note: 'Restock Baidoa (in transit)' });
  // --- expenses ---
  setNow(`${addDays(today, -7)}T09:30:00.000Z`);
  for (const [b, a] of [[UWM, 30000], [UWH, 22000], [THM, 40000], [FXM, 25000], [ECM, 20000]]) fin.createExpense(O, { scope: 'branch', branch_id: b, category_id: cat('Rent'), amount: a, method_id: BANK, description: 'Monthly rent' });
  fin.createExpense(O, { scope: 'business', business_id: UW, category_id: cat('Marketing'), amount: 15000, method_id: BANK, alloc_rule: 'revenue', description: 'Social media campaign' });
  fin.createExpense(O, { scope: 'branch', branch_id: ECM, category_id: cat('Supplies'), amount: 4000, method_id: MOBILE, description: 'Clippers and capes' });
  fin.createExpense(O, { scope: 'branch', branch_id: ECN, category_id: cat('Rent'), amount: 6000000, method_id: BANK, description: 'Monthly rent (KES)' });
  setNow(null);
  return { org_id: ORG, owner_id, ids: { UWM, UWH, THM, THB, FXM, ECM, ECN, UW, TH, FX, EC, ECK }, users: U, methods: { CASH, MOBILE, BANK }, repairs: { R1, R2, R3 }, creditSale };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const db = openDb(process.env.DB_FILE || './data/bizsuite.sqlite');
  if (db.prepare('SELECT COUNT(*) c FROM orgs').get().c) { console.error('Database already has data. Remove it first to re-seed.'); process.exit(1); }
  const r = seedDemo(db); console.log('Demo data created.', JSON.stringify(r.ids));
}
