import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { AppError, bad, notFound, forbidden } from './errors.js';
import { Ctx, ApprovalNeeded, createApproval, decideApproval, listApprovals } from './core.js';
import { tx } from './db.js';
import { nowIso } from './time.js';
import { verifyPassword, hashPassword, newToken, hashToken, verifyTotp, newTotpSecret, checkPasswordStrength } from './auth.js';
import { TYPE_MODULES, MODULES, ACTIONS, SPECIAL } from './perm.js';
import * as admin from './admin.js';
import * as inv from './inventory.js';
import * as sales from './sales.js';
import * as pay from './payments.js';
import * as com from './commissions.js';
import * as rep from './repairs.js';
import * as fin from './finance.js';
import * as rpt from './reports.js';
import * as plat from './platform.js';
import * as ex from './exporter.js';
import { listNotifications, markRead, scanAlerts } from './notify.js';
import { createBackup, listBackups } from './backup.js';
import * as quo from './quotes.js';
import * as ord from './orders.js';
import * as shop from './shop.js';
import { qrSvg } from './qr.js';
import { fileURLToPath } from 'node:url';
import { prepareImage } from './image.js';
import { translateReport, translateNotification } from './lang.js';
import { sheetXlsx } from './xlsx.js';

const MAGIC = { 'image/png': [0x89, 0x50, 0x4e, 0x47], 'image/jpeg': [0xff, 0xd8, 0xff], 'image/webp': [0x52, 0x49, 0x46, 0x46] };

const commissionsDaily = (c, r, f) => com.barberDaily(c, { branch_id: r.query.branch_id, business_id: r.query.business_id, employee_id: r.query.employee_id, from: f.from, to: f.to });
const BRAND_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'brand');
const BRAND_MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

export function createApi(db, { dataDir = './data', loginLimit = 10 } = {}) {
  const routes = []; const attempts = new Map();
  const on = (method, pattern, handler, opts = {}) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), handler, ...opts });
  const num = (v) => Number(v);

  // ---------- auth ----------
  function authenticate(token, ip) {
    if (!token) throw new AppError(401, 'unauthenticated', 'Sign in required');
    const s = db.prepare('SELECT * FROM sessions WHERE token_hash=?').get(hashToken(token));
    if (!s || s.expires_at < Date.now()) throw new AppError(401, 'unauthenticated', 'Session expired');
    const u = db.prepare('SELECT * FROM users WHERE id=? AND active=1').get(s.user_id); if (!u) throw new AppError(401, 'unauthenticated', 'Account disabled');
    if (s.support_org_id) {
      const g = db.prepare('SELECT 1 x FROM support_access WHERE org_id=? AND revoked_at IS NULL AND expires_at>?').get(s.support_org_id, Date.now()); if (!g) throw new AppError(401, 'support_revoked', 'Support access ended');
      const ownerRole = db.prepare("SELECT id FROM roles WHERE org_id=? AND name='Owner'").get(s.support_org_id);
      return new Ctx(db, { ...u, org_id: s.support_org_id, role_id: ownerRole.id }, { ip, readOnly: true, org_id: s.support_org_id });
    }
    if (u.is_platform) { const c = new Ctx(db, { ...u, role_id: null }, { ip, org_id: null }); c.platform = true; return c; }
    const org = db.prepare('SELECT status FROM orgs WHERE id=?').get(u.org_id); if (org.status !== 'active') throw new AppError(403, 'tenant_suspended', 'This organisation is suspended');
    return new Ctx(db, u, { ip });
  }
  on('POST', '/api/auth/login', (_c, r) => {
    const email = String(r.body.email || '').toLowerCase(); const key = r.ip + '|' + email; const a = attempts.get(key) || { n: 0, t: Date.now() };
    if (Date.now() - a.t > 15 * 60e3) { a.n = 0; a.t = Date.now(); }
    if (a.n >= loginLimit) throw new AppError(429, 'too_many_attempts', 'Too many attempts. Try again in 15 minutes.');
    const u = db.prepare('SELECT * FROM users WHERE email=? AND active=1').get(email);
    const ok = u ? verifyPassword(String(r.body.password || ''), u.pass_hash) : (verifyPassword('x', hashPassword('y')), false);
    if (!ok) { a.n++; attempts.set(key, a); throw new AppError(401, 'invalid_credentials', 'Invalid email or password'); }
    if (u.org_id) { const org = db.prepare('SELECT status FROM orgs WHERE id=?').get(u.org_id); if (org.status !== 'active') throw new AppError(403, 'tenant_suspended', 'This organisation is suspended'); }
    if (u.totp_enabled) { if (!r.body.totp) throw new AppError(401, 'totp_required', 'Enter your authentication code'); if (!verifyTotp(u.totp_secret, r.body.totp)) { a.n++; attempts.set(key, a); throw new AppError(401, 'invalid_totp', 'Invalid authentication code'); } }
    attempts.delete(key);
    const priv = u.role_id && JSON.parse(db.prepare('SELECT perms FROM roles WHERE id=?').get(u.role_id).perms).includes('roles.edit');
    if (priv && !u.totp_enabled && process.env.REQUIRE_2FA === '1') throw new AppError(403, 'totp_setup_required', 'Two-factor authentication is mandatory for privileged users');
    const token = newToken(); db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES(?,?,?,?)').run(hashToken(token), u.id, Date.now() + 12 * 3600e3, nowIso());
    db.prepare('INSERT INTO audit_log(org_id,user_id,action,entity,entity_id,ip,created_at) VALUES(?,?,?,?,?,?,?)').run(u.org_id, u.id, 'auth.login', 'user', u.id, r.ip, nowIso());
    return { token, must_change_password: !!u.must_change_password };
  }, { public: true });
  on('POST', '/api/auth/logout', (c, r) => { db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hashToken(r.token)); return { ok: true }; });
  on('GET', '/api/auth/me', (c) => {
    const u = c.user; if (c.platform) return { id: u.id, name: u.name, email: u.email, platform: true };
    const branches = admin.listBranches(c).map((b) => ({ ...b, depts: c.all('SELECT kind FROM departments WHERE branch_id=? AND active=1', b.id).map((d) => d.kind) })); const mods = new Set();
    for (const b of branches) { const types = [b.business_type, ...c.all('SELECT kind FROM departments WHERE branch_id=? AND active=1', b.id).map((d) => d.kind)]; types.forEach((t) => TYPE_MODULES[t].forEach((m) => mods.add(m))); }
    const org = c.get('SELECT id,name,tagline,reporting_currency,saas_enabled,modules,logo_file_id FROM orgs WHERE id=?', c.org_id); org.has_logo = !!orgLogo(c.org_id);
    if (org.modules) { const allowed = JSON.parse(org.modules); for (const m of [...mods]) if (!allowed.includes(m)) mods.delete(m); }
    return { id: u.id, name: u.name, email: u.email, lang: u.lang, role: c.role?.name, scope: c.role?.scope, perms: [...c.perms], limits: c.limits, org, branches, modules: [...mods], businesses: admin.listBusinesses(c), read_only: c.readOnly, totp_enabled: !!u.totp_enabled, must_change_password: !!u.must_change_password };
  });
  on('POST', '/api/auth/password', (c, r) => {
    if (!verifyPassword(String(r.body.current || ''), c.user.pass_hash)) throw new AppError(403, 'invalid_credentials', 'Current password is wrong');
    if (!checkPasswordStrength(r.body.password)) throw bad('weak_password', 'Password needs 8+ characters with letters and digits');
    c.run('UPDATE users SET pass_hash=?, must_change_password=0 WHERE id=?', hashPassword(r.body.password), c.user.id); c.run('DELETE FROM sessions WHERE user_id=? AND token_hash<>?', c.user.id, hashToken(r.token)); c.audit('auth.password', 'user', c.user.id, null, null); return { ok: true };
  });
  on('POST', '/api/auth/2fa/setup', (c) => { const secret = newTotpSecret(); c.run('UPDATE users SET totp_secret=?, totp_enabled=0 WHERE id=?', secret, c.user.id); return { secret, otpauth: `otpauth://totp/BizSuite:${encodeURIComponent(c.user.email)}?secret=${secret}&issuer=BizSuite` }; });
  on('POST', '/api/auth/2fa/enable', (c, r) => { const u = c.get('SELECT * FROM users WHERE id=?', c.user.id); if (!u.totp_secret || !verifyTotp(u.totp_secret, r.body.code)) throw bad('invalid_totp', 'Invalid code'); c.run('UPDATE users SET totp_enabled=1 WHERE id=?', u.id); c.audit('auth.2fa_enable', 'user', u.id, null, null); return { ok: true }; });

  // ---------- org structure ----------
  on('GET', '/api/branches', (c) => ({ rows: admin.listBranches(c) }));
  on('POST', '/api/businesses', (c, r) => admin.createBusiness(c, r.body));
  on('POST', '/api/branches', (c, r) => admin.createBranch(c, r.body));
  on('PATCH', '/api/branches/:id', (c, r) => admin.updateBranch(c, num(r.params.id), r.body));
  on('POST', '/api/branches/:id/departments', (c, r) => admin.addDepartment(c, num(r.params.id), r.body));
  on('GET', '/api/branches/:id/team', (c, r) => { const br = c.branch(num(r.params.id)); return { rows: c.all("SELECT u.id,u.name,ro.name role,u.commission_bp,u.commission_fixed FROM users u JOIN roles ro ON ro.id=u.role_id WHERE u.org_id=? AND u.active=1 AND (EXISTS(SELECT 1 FROM user_branches ub WHERE ub.user_id=u.id AND ub.branch_id=?) OR ro.scope='org') ORDER BY u.name", c.org_id, br.id).map((u) => ({ id: u.id, name: u.name, role: u.role, ...(c.can('commissions.viewall') ? { commission_bp: u.commission_bp, commission_fixed: u.commission_fixed } : {}) })) }; });
  on('GET', '/api/transfer-destinations', (c, r) => { const f = c.branch(num(r.query.from_branch_id)); return { rows: c.all('SELECT id,name,code FROM branches WHERE org_id=? AND business_id=? AND id<>? AND active=1 AND currency=? ORDER BY name', c.org_id, f.business_id, f.id, f.currency) }; });
  on('GET', '/api/roles', (c) => ({ rows: admin.listRoles(c), actions: ACTIONS, modules: MODULES, special: SPECIAL }));
  on('POST', '/api/roles', (c, r) => admin.saveRole(c, null, r.body));
  on('PUT', '/api/roles/:id', (c, r) => admin.saveRole(c, num(r.params.id), r.body));
  on('GET', '/api/users', (c) => ({ rows: admin.listUsers(c) }));
  on('POST', '/api/users', (c, r) => admin.createUser(c, r.body));
  on('PATCH', '/api/users/:id', (c, r) => admin.updateUser(c, num(r.params.id), r.body));
  on('GET', '/api/users/:id/rate-history', (c, r) => { c.need('staff.settings'); return { rows: c.all('SELECT h.*, u.name changed_by_name FROM commission_rate_history h LEFT JOIN users u ON u.id=h.changed_by WHERE h.org_id=? AND h.user_id=? ORDER BY h.id DESC', c.org_id, num(r.params.id)) }; });

  // ---------- products / inventory ----------
  on('GET', '/api/variants', (c, r) => inv.listVariants(c, r.query));
  // QR item labels (the code is the SKU) and a single QR image for on-screen display
  on('GET', '/api/qr', (c, r) => { c.need('products.view'); const text = String(r.query.text || '').slice(0, 300); if (!text) throw bad('text_required', 'Nothing to encode'); return { raw: qrSvg(text, { size: Math.min(Number(r.query.size) || 160, 600) }), type: 'image/svg+xml', cache: 'private, max-age=3600' }; });
  on('GET', '/api/print/labels', (c, r) => {
    c.need('products.view'); const br = r.query.branch_id ? c.branch(num(r.query.branch_id)) : null;
    const ids = String(r.query.ids || '').split(',').map(Number).filter((x) => x > 0).slice(0, 500); if (!ids.length) throw bad('lines_required', 'Select at least one item');
    const per = r.query.copies === 'stock' ? 'stock' : Math.max(1, Math.min(Number(r.query.copies) || 1, 200)); let total = 0;
    const items = ids.map((id) => { const v = inv.variantInOrg(c, id); const b = br || c.get(`SELECT * FROM branches WHERE org_id=? AND business_id=? AND id IN (${c.branchIds().join(',') || 0}) ORDER BY id LIMIT 1`, c.org_id, v.business_id); if (!b) throw notFound('variant');
      const stock = c.get('SELECT qty FROM stock WHERE branch_id=? AND variant_id=?', b.id, v.id)?.qty || 0; const copies = Math.min(per === 'stock' ? Math.max(stock, 1) : per, 2000 - total); total += copies;
      return { sku: v.sku, name: v.pname, attrs: Object.values(JSON.parse(v.attrs)).join(' / '), price: v.price, max_discount_bp: v.max_discount_bp, currency: b.currency, copies }; });
    const company = c.get('SELECT name FROM orgs WHERE id=?', c.org_id).name;
    return { raw: ex.labelsDoc(items, { mode: r.query.mode === 'thermal' ? 'thermal' : 'a4', lang: r.query.lang, company, qr: (t) => qrSvg(t) }), type: 'text/html; charset=utf-8' };
  });
  // baskets scanned on the floor / phone, completed by the manager when the money is received
  on('GET', '/api/orders', (c, r) => ord.listOrders(c, r.query));
  on('POST', '/api/orders', (c, r) => ord.createOrder(c, r.body));
  on('POST', '/api/orders/:id/complete', (c, r) => ord.completeOrder(c, num(r.params.id), r.body));
  on('POST', '/api/orders/:id/cancel', (c, r) => ord.cancelOrder(c, num(r.params.id), r.body));
  on('GET', '/api/shop', (c, r) => rpt.shopBoard(c, r.query));
  on('POST', '/api/shop/stock-in', (c, r) => shop.stockIn(c, r.body));
  on('POST', '/api/products', (c, r) => inv.createProduct(c, r.body));
  on('PATCH', '/api/products/:id', (c, r) => inv.updateProduct(c, num(r.params.id), r.body));
  on('POST', '/api/products/:id/variants', (c, r) => inv.addVariant(c, num(r.params.id), r.body));
  on('PATCH', '/api/variants/:id', (c, r) => inv.updateVariant(c, num(r.params.id), r.body));
  on('GET', '/api/stock', (c, r) => inv.stockLevels(c, r.query));
  on('GET', '/api/stock/movements', (c, r) => inv.movements(c, r.query));
  on('POST', '/api/stock/adjust', (c, r) => inv.adjustStock(c, r.body));
  on('POST', '/api/stock/count', (c, r) => inv.countStock(c, r.body));
  on('GET', '/api/devices', (c, r) => inv.listDevices(c, r.query));
  on('GET', '/api/devices/serial/:serial', (c, r) => inv.deviceHistory(c, r.params.serial));
  on('POST', '/api/devices/:id/inspect', (c, r) => inv.restockDevice(c, num(r.params.id), r.body));
  on('GET', '/api/transfers', (c, r) => inv.listTransfers(c, r.query));
  on('POST', '/api/transfers', (c, r) => inv.createTransfer(c, r.body));
  on('POST', '/api/transfers/:id/receive', (c, r) => inv.receiveTransfer(c, num(r.params.id), r.body));
  on('POST', '/api/transfers/:id/cancel', (c, r) => inv.cancelTransfer(c, num(r.params.id)));
  on('GET', '/api/purchases', (c, r) => inv.listPurchases(c, r.query));
  on('POST', '/api/purchases', (c, r) => inv.createPurchase(c, r.body));
  on('POST', '/api/purchases/:id/receive', (c, r) => inv.receivePurchase(c, num(r.params.id), r.body));
  on('POST', '/api/purchases/:id/return', (c, r) => inv.purchaseReturn(c, num(r.params.id), r.body));

  // ---------- sales / visits ----------
  on('GET', '/api/pos/search', (c, r) => ({ rows: sales.posSearch(c, r.query) }));
  on('GET', '/api/sales', (c, r) => sales.listSales(c, r.query));
  on('POST', '/api/sales', (c, r) => sales.createSale(c, r.body));
  on('GET', '/api/sales/:id', (c, r) => sales.getSale(c, num(r.params.id)));
  on('POST', '/api/sales/:id/return', (c, r) => sales.returnSale(c, { ...r.body, sale_id: num(r.params.id) }));
  on('POST', '/api/sales/:id/void', (c, r) => sales.voidSale(c, num(r.params.id), r.body.reason));
  on('POST', '/api/exchanges', (c, r) => sales.exchange(c, r.body));

  on('GET', '/api/quotes', (c, r) => quo.listQuotes(c, r.query));
  on('POST', '/api/quotes', (c, r) => quo.createQuote(c, r.body));
  on('GET', '/api/quotes/:id', (c, r) => quo.getQuote(c, num(r.params.id)));
  on('POST', '/api/quotes/:id/status', (c, r) => quo.setQuoteStatus(c, num(r.params.id), r.body.status));
  on('POST', '/api/quotes/:id/convert', (c, r) => quo.convertQuote(c, num(r.params.id), r.body));
  on('GET', '/api/print/quote/:id', (c, r) => { c.need('sales.print'); const q = quo.getQuote(c, num(r.params.id)); q.company = c.get('SELECT name FROM orgs WHERE id=?', c.org_id).name; q.logo = logoUri(c, q.branch_id); return { raw: ex.quoteDoc(q, r.query.mode === 'thermal' ? 'thermal' : 'a4', r.query.lang), type: 'text/html; charset=utf-8' }; });

  // ---------- payments ----------
  on('GET', '/api/payments', (c, r) => pay.listPayments(c, r.query));
  on('POST', '/api/payments', (c, r) => pay.recordPayment(c, r.body));
  on('POST', '/api/payments/:id/status', (c, r) => pay.setPaymentStatus(c, num(r.params.id), r.body.status));
  on('POST', '/api/payments/:id/reverse', (c, r) => pay.reversePayment(c, num(r.params.id), r.body.reason));
  on('POST', '/api/payments/reconcile', (c, r) => pay.reconcile(c, r.body));
  on('GET', '/api/methods', (c) => fin.listMethods(c));
  on('POST', '/api/methods', (c, r) => fin.saveMethod(c, null, r.body));
  on('PATCH', '/api/methods/:id', (c, r) => fin.saveMethod(c, num(r.params.id), r.body));

  // ---------- parties ----------
  on('GET', '/api/customers', (c, r) => fin.listCustomers(c, r.query));
  on('POST', '/api/customers', (c, r) => fin.saveCustomer(c, null, r.body));
  on('PATCH', '/api/customers/:id', (c, r) => fin.saveCustomer(c, num(r.params.id), r.body));
  on('GET', '/api/customers/:id/statement', (c, r) => fin.customerStatement(c, num(r.params.id), r.query));
  on('GET', '/api/suppliers', (c, r) => fin.listSuppliers(c, r.query));
  on('POST', '/api/suppliers', (c, r) => fin.saveSupplier(c, null, r.body));
  on('PATCH', '/api/suppliers/:id', (c, r) => fin.saveSupplier(c, num(r.params.id), r.body));
  on('GET', '/api/suppliers/:id/statement', (c, r) => fin.supplierStatement(c, num(r.params.id), r.query));

  // ---------- expenses ----------
  on('GET', '/api/expenses', (c, r) => fin.listExpenses(c, r.query));
  on('POST', '/api/expenses', (c, r) => fin.createExpense(c, r.body));
  on('POST', '/api/expenses/:id/void', (c, r) => fin.voidExpense(c, num(r.params.id), r.body.reason));
  on('GET', '/api/expense-categories', (c) => fin.listCategories(c));
  on('POST', '/api/expense-categories', (c, r) => fin.saveCategory(c, r.body.name));

  // ---------- repairs ----------
  on('GET', '/api/repairs', (c, r) => rep.listRepairs(c, r.query));
  on('POST', '/api/repairs', (c, r) => rep.createRepair(c, r.body));
  on('GET', '/api/repairs/:id', (c, r) => rep.getRepair(c, num(r.params.id)));
  on('PATCH', '/api/repairs/:id', (c, r) => rep.updateRepair(c, num(r.params.id), r.body));
  on('POST', '/api/repairs/:id/status', (c, r) => rep.setStatus(c, num(r.params.id), r.body.status, r.body.note));
  on('POST', '/api/repairs/:id/charges', (c, r) => rep.addCharge(c, num(r.params.id), r.body));
  on('POST', '/api/repairs/:id/charges/:cid/void', (c, r) => rep.voidCharge(c, num(r.params.id), num(r.params.cid), r.body.reason));
  on('POST', '/api/repairs/:id/approval', (c, r) => rep.recordApproval(c, num(r.params.id), r.body));
  on('POST', '/api/repairs/:id/refund', (c, r) => rep.refundRepair(c, num(r.params.id), r.body));

  // ---------- barber services & commissions ----------
  on('GET', '/api/services', (c, r) => fin.listServices(c, r.query));
  on('POST', '/api/services', (c, r) => fin.saveService(c, null, r.body));
  on('PATCH', '/api/services/:id', (c, r) => fin.saveService(c, num(r.params.id), r.body));
  on('GET', '/api/commissions/report', (c, r) => { const f = rpt.resolveFilters(c, r.query); return { rows: com.barberReport(c, { ...r.query, from: f.from, to: f.to }) }; });
  on('GET', '/api/commissions/daily', (c, r) => { const f = rpt.resolveFilters(c, r.query); return commissionsDaily(c, r, f); });
  on('POST', '/api/commissions/deductions', (c, r) => com.recordDeduction(c, r.body));
  on('GET', '/api/commissions/ledger', (c, r) => com.ledger(c, r.query));
  on('GET', '/api/commissions/payouts', (c, r) => com.listPayouts(c, r.query));
  on('GET', '/api/commissions/payouts/:id', (c, r) => com.payoutDetail(c, num(r.params.id)));
  on('POST', '/api/commissions/payouts', (c, r) => com.createPayout(c, r.body));
  on('POST', '/api/commissions/advances', (c, r) => com.recordAdvance(c, r.body));
  on('GET', '/api/commissions/balance/:id', (c, r) => { c.need('commissions.view'); const e = num(r.params.id); if (!c.can('commissions.viewall') && e !== c.user.id) throw notFound('employee'); return com.balance(c, e, r.query.branch_id ? num(r.query.branch_id) : null); });

  // ---------- registers ----------
  on('GET', '/api/registers', (c, r) => fin.listRegisters(c, r.query));
  on('GET', '/api/registers/mine', (c, r) => ({ session: c.openSession(c.branch(r.query.branch_id)) || null }));
  on('POST', '/api/registers', (c, r) => fin.openRegister(c, r.body));
  on('GET', '/api/registers/:id', (c, r) => fin.registerDetail(c, num(r.params.id)));
  on('POST', '/api/registers/:id/movement', (c, r) => fin.cashMovement(c, num(r.params.id), r.body));
  on('POST', '/api/registers/:id/close', (c, r) => fin.closeRegister(c, num(r.params.id), r.body));
  on('POST', '/api/registers/:id/approve', (c, r) => fin.approveRegister(c, num(r.params.id)));
  on('GET', '/api/day-closings', (c, r) => fin.listDayClosings(c, r.query));
  on('POST', '/api/day-closings', (c, r) => fin.closeDay(c, r.body));
  on('POST', '/api/day-closings/reopen', (c, r) => fin.reopenDay(c, r.body));

  // ---------- approvals, notifications, audit ----------
  on('GET', '/api/approvals', (c, r) => ({ rows: listApprovals(c, r.query) }));
  on('POST', '/api/approvals/:id/decision', (c, r) => decideApproval(c, num(r.params.id), r.body.approve === true, r.body.note));
  on('GET', '/api/notifications', (c, r) => { try { scanAlerts(db); } catch { /* best effort */ } const out = listNotifications(c, r.query); if (r.query.lang === 'so') out.rows = out.rows.map((n) => ({ ...n, message: translateNotification(n.message, 'so') })); return out; });
  on('POST', '/api/notifications/read', (c, r) => markRead(c, r.body.ids));

  // ---------- dashboard & reports ----------
  on('GET', '/api/dashboard', (c, r) => rpt.dashboard(c, r.query));
  on('GET', '/api/reports', (c) => ({ rows: Object.entries(rpt.REPORTS).filter(([, d]) => c.can(d.perm) && (!d.needs || c.can(d.needs))).map(([k, d]) => ({ key: k, title: d.title })) }));
  on('GET', '/api/reports/:name', (c, r) => {
    const lang = r.query.lang === 'so' ? 'so' : 'en'; const rp = translateReport(rpt.runReport(c, r.params.name, r.query), lang); const fmtq = r.query.format || 'json'; const mod = rpt.REPORTS[r.params.name].perm.split('.')[0];
    if (fmtq === 'json') return rp;
    if (['csv', 'pdf', 'xlsx'].includes(fmtq)) { if (!c.can('reports.export') && !c.can(mod + '.export')) throw forbidden('Export not permitted', 'missing_permission'); c.audit('report.export', 'report', null, null, { name: r.params.name, format: fmtq, ...r.query }); }
    else if (!c.can('reports.print') && !c.can('reports.export') && !c.can(mod + '.print')) throw forbidden('Printing not permitted', 'missing_permission');
    const logo = orgLogo(c.org_id, 'light');
    if (fmtq === 'csv') return { raw: ex.reportCsv(rp), type: 'text/csv; charset=utf-8', filename: `${r.params.name}.csv` };
    if (fmtq === 'xlsx') return { raw: sheetXlsx(rp), type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', filename: `${r.params.name}.xlsx` };
    if (fmtq === 'pdf') return { raw: ex.reportPdf(rp, logo ? prepareImage(logo.buf, logo.mime) : null), type: 'application/pdf', filename: `${r.params.name}.pdf` };
    return { raw: ex.reportHtml(rp, { logo: logo ? dataUri(logo) : null }), type: 'text/html; charset=utf-8' };
  });
  on('GET', '/api/export/sales', (c, r) => {
    if (!c.can('sales.export') && !c.can('services.export')) throw forbidden('Export not permitted', 'missing_permission');
    const l = sales.listSales(c, { ...r.query, limit: 200, page: 1 }); const rows = l.rows.map((x) => ({ ...x }));
    const rp = { columns: [{ key: 'ref', label: 'Ref' }, { key: 'business_date', label: 'Date' }, { key: 'branch_name', label: 'Branch' }, { key: 'customer_name', label: 'Customer' }, { key: 'status', label: 'Status' }, { key: 'payment_status', label: 'Payment' }, { key: 'currency', label: 'Currency' }, { key: 'total', label: 'Total', type: 'money' }, { key: 'paid', label: 'Paid', type: 'money' }], rows, totals: null,
      meta: { title: 'Sales list', from: r.query.from || '', to: r.query.to || '', generated_at: nowIso(), generated_by: c.user.name, filters: { branch_ids: [...new Set(rows.map((x) => x.branch_name))] }, reporting: 'Amounts in branch currency' } };
    rp.meta.company = c.get('SELECT name FROM orgs WHERE id=?', c.org_id).name; c.audit('sales.export', 'sales', null, null, r.query); if (r.query.format === 'xlsx') return { raw: sheetXlsx(rp), type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', filename: 'sales.xlsx' }; return { raw: ex.reportCsv(rp), type: 'text/csv; charset=utf-8', filename: 'sales.csv' };
  });

  // ---------- printing ----------
  on('GET', '/api/print/sale/:id', (c, r) => { c.need(sales.getSale(c, num(r.params.id)).kind === 'service' ? 'services.print' : 'sales.print'); const sale = sales.getSale(c, num(r.params.id)); sale.logo = logoUri(c, sale.branch_id); sale.company = c.get('SELECT name FROM orgs WHERE id=?', c.org_id).name; return { raw: ex.saleDoc(sale, r.query.mode === 'a4' ? 'a4' : 'thermal', r.query.lang), type: 'text/html; charset=utf-8' }; });
  on('GET', '/api/print/repair/:id', (c, r) => { c.need('repairs.print'); const j = rep.getRepair(c, num(r.params.id)); j.company = c.get('SELECT name FROM orgs WHERE id=?', c.org_id).name; j.logo = logoUri(c, j.branch_id); return { raw: ex.repairDoc(j, r.query.mode === 'a4' ? 'a4' : 'thermal', r.query.lang), type: 'text/html; charset=utf-8' }; });

  // ---------- files ----------
  on('POST', '/api/files', (c, r) => {
    const { mime, data, branch_id, owner_type, owner_id } = r.body; if (!(c.can('products.edit') || (owner_type === 'repair' && (c.can('repairs.create') || c.can('repairs.edit'))))) c.need('products.edit');
    if (owner_type === 'repair') { const j = c.get('SELECT branch_id FROM repair_jobs WHERE id=? AND org_id=?', owner_id, c.org_id); if (!j || !c.branchIds().includes(j.branch_id)) throw notFound('repair job'); } if (!MAGIC[mime]) throw bad('invalid_file_type', 'Only PNG, JPEG or WebP images are allowed');
    const buf = Buffer.from(String(data || ''), 'base64'); if (!buf.length || buf.length > 2 * 1024 * 1024) throw bad('file_too_large', 'Images must be under 2 MB');
    if (!MAGIC[mime].every((b, i) => buf[i] === b)) throw bad('invalid_file_content', 'File content does not match its type');
    if (branch_id) c.branch(branch_id);
    const org = c.get('SELECT max_storage_mb FROM orgs WHERE id=?', c.org_id); const used = c.get('SELECT COALESCE(SUM(size),0) s FROM files WHERE org_id=?', c.org_id).s;
    if (org.max_storage_mb != null && used + buf.length > org.max_storage_mb * 1048576) throw new AppError(402, 'plan_limit_storage', 'Storage limit of the subscription reached');
    const dir = path.join(dataDir, 'uploads', String(c.org_id)); fs.mkdirSync(dir, { recursive: true }); const name = crypto.randomBytes(16).toString('hex'); fs.writeFileSync(path.join(dir, name), buf);
    const id = c.run('INSERT INTO files(org_id,branch_id,owner_type,owner_id,path,mime,size,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)', c.org_id, branch_id || null, owner_type || null, owner_id || null, name, mime, buf.length, c.user.id, nowIso()).lastInsertRowid;
    c.audit('file.upload', 'file', id, null, { mime, size: buf.length }); return { id };
  });
  on('GET', '/api/files', (c, r) => { const j = c.get('SELECT branch_id FROM repair_jobs WHERE id=? AND org_id=?', num(r.query.owner_id), c.org_id); if (r.query.owner_type !== 'repair' || !j || !c.branchIds().includes(j.branch_id)) throw notFound('record'); c.need('repairs.view'); return { rows: c.all('SELECT id,mime,size,created_at FROM files WHERE org_id=? AND owner_type=? AND owner_id=? ORDER BY id', c.org_id, 'repair', num(r.query.owner_id)) }; });
  on('GET', '/api/files/:id', (c, r) => {
    const f = c.get('SELECT * FROM files WHERE id=? AND org_id=?', num(r.params.id), c.org_id); if (!f || (f.branch_id && !c.branchIds().includes(f.branch_id))) throw notFound('file');
    return { raw: fs.readFileSync(path.join(dataDir, 'uploads', String(c.org_id), f.path)), type: f.mime, cache: 'private, max-age=3600' };
  });

  // ---------- settings, FX, accounts, backups, SaaS ----------
  on('POST', '/api/settings/exchange-rates', (c, r) => fin.setExchangeRate(c, r.body));
  on('GET', '/api/settings/exchange-rates', (c) => { c.need('settings.view'); return { rows: c.all('SELECT * FROM exchange_rates WHERE org_id=? ORDER BY effective_date DESC', c.org_id) }; });
  on('POST', '/api/settings/opening-balance', (c, r) => fin.setBranchAccount(c, r.body.branch_id, r.body.method_id, r.body.amount));
  on('GET', '/api/channels', (c) => { c.need('settings.settings'); return { rows: c.all('SELECT * FROM channel_deliveries WHERE org_id=? ORDER BY id DESC LIMIT 50', c.org_id), providers: [] }; });
  on('GET', '/api/backups', (c) => { c.need('settings.settings'); guardBackup(c); return { rows: listBackups(path.join(dataDir, 'backups')) }; });
  on('POST', '/api/backups', (c) => { c.need('settings.settings'); guardBackup(c); c.audit('backup.create', 'backup', null, null, null); return createBackup(db, path.join(dataDir, 'backups')); });
  const guardBackup = (c) => { if (c.get('SELECT saas_enabled FROM orgs WHERE id=?', c.org_id).saas_enabled) throw forbidden('Backups of a shared database are managed by the platform operator', 'platform_only'); };
  on('GET', '/api/support', (c) => plat.listSupport(c));
  on('POST', '/api/support/grant', (c, r) => plat.grantSupport(c, r.body));
  on('POST', '/api/support/:id/revoke', (c, r) => plat.revokeSupport(c, num(r.params.id)));
  on('GET', '/api/platform/tenants', (c) => ({ rows: plat.listTenants(db, c.user) }));
  on('POST', '/api/platform/tenants', (c, r) => { if (!c.user.is_platform) throw forbidden('Platform administrators only', 'platform_only'); return plat.createTenant(db, r.body); });
  on('PATCH', '/api/platform/tenants/:id', (c, r) => plat.updateTenant(db, c.user, num(r.params.id), r.body));
  on('POST', '/api/platform/tenants/:id/support-session', (c, r) => plat.startSupportSession(db, c.user, num(r.params.id)));
  on('GET', '/api/audit', (c, r) => { c.need('audit.view'); const b = c.inBranches('branch_id'); return { rows: c.all(`SELECT a.*, u.name user_name FROM audit_log a LEFT JOIN users u ON u.id=a.user_id WHERE a.org_id=? AND (a.branch_id IS NULL OR ${b.sql}) ${r.query.entity ? 'AND a.entity=?' : ''} ORDER BY a.id DESC LIMIT 200`, ...(r.query.entity ? [c.org_id, r.query.entity] : [c.org_id])) }; });

  function uploadedLogo(orgId, fileId) { try { if (!fileId) return null; const f = db.prepare('SELECT * FROM files WHERE id=? AND org_id=?').get(fileId, orgId); return f ? { mime: f.mime, buf: fs.readFileSync(path.join(dataDir, 'uploads', String(orgId), f.path)) } : null; } catch { return null; } }
  // company logo: uploaded in Settings -> Branding, else the default shipped in public/brand/logo.(png|jpg|webp|svg)
  // variant 'light' = artwork for light backgrounds (paper, light theme): public/brand/logo-light.* when shipped
  function orgLogo(orgId, variant) { const o = db.prepare('SELECT logo_file_id FROM orgs WHERE id=?').get(orgId); const up = o && uploadedLogo(orgId, o.logo_file_id); if (up) return up; for (const name of variant === 'light' ? ['logo-light', 'logo'] : ['logo']) for (const ext of ['.png', '.jpg', '.jpeg', '.webp', '.svg']) { const f = path.join(BRAND_DIR, name + ext); if (fs.existsSync(f)) return { mime: BRAND_MIME[ext], buf: fs.readFileSync(f), variant: name === 'logo-light' }; } return null; }
  const dataUri = (l) => `data:${l.mime};base64,${l.buf.toString('base64')}`;
  function logoUri(c, branchId) { const b = c.get('SELECT logo_file_id FROM branches WHERE id=?', branchId); const l = (b && uploadedLogo(c.org_id, b.logo_file_id)) || orgLogo(c.org_id, 'light'); return l ? dataUri(l) : null; }

  // ---------- branding ----------
  const brandOrg = () => db.prepare("SELECT id,name,tagline FROM orgs WHERE status='active' ORDER BY saas_enabled, id LIMIT 1").get();
  on('GET', '/api/branding', () => { const o = brandOrg(); return o ? { name: o.name, tagline: o.tagline, has_logo: !!orgLogo(o.id), themed_logo: !!orgLogo(o.id, 'light')?.variant } : { name: 'BizSuite', has_logo: false }; }, { public: true });
  on('GET', '/api/branding/logo', (c, r) => { const o = brandOrg(); const l = o && orgLogo(o.id, r.query.variant); if (!l) throw notFound('logo'); return { raw: l.buf, type: l.mime, cache: 'public, max-age=300' }; }, { public: true });
  on('GET', '/api/org', (c) => c.get('SELECT id,name,tagline,reporting_currency FROM orgs WHERE id=?', c.org_id));
  on('PATCH', '/api/org', (c, r) => { c.need('settings.settings'); const before = c.get('SELECT name,tagline FROM orgs WHERE id=?', c.org_id); const name = admin.str(r.body.name ?? before.name, 'name', { max: 100 }); c.run('UPDATE orgs SET name=?, tagline=? WHERE id=?', name, r.body.tagline ?? before.tagline, c.org_id); c.audit('org.update', 'org', c.org_id, before, { name, tagline: r.body.tagline }); return { ok: true }; });
  on('POST', '/api/org/logo', (c, r) => {
    c.need('settings.settings'); const { mime, data } = r.body; if (!MAGIC[mime]) throw bad('invalid_file_type', 'Only PNG, JPEG or WebP images are allowed'); const buf = Buffer.from(String(data || ''), 'base64');
    if (!buf.length || buf.length > 2 * 1024 * 1024) throw bad('file_too_large', 'Images must be under 2 MB'); if (!MAGIC[mime].every((b, i) => buf[i] === b)) throw bad('invalid_file_content', 'File content does not match its type');
    const dir = path.join(dataDir, 'uploads', String(c.org_id)); fs.mkdirSync(dir, { recursive: true }); const name = crypto.randomBytes(16).toString('hex'); fs.writeFileSync(path.join(dir, name), buf);
    const id = c.run('INSERT INTO files(org_id,owner_type,path,mime,size,created_by,created_at) VALUES(?,?,?,?,?,?,?)', c.org_id, 'org_logo', name, mime, buf.length, c.user.id, nowIso()).lastInsertRowid;
    c.run('UPDATE orgs SET logo_file_id=? WHERE id=?', id, c.org_id); c.audit('org.logo', 'org', c.org_id, null, { file: id }); return { id };
  });
  on('DELETE', '/api/org/logo', (c) => { c.need('settings.settings'); c.run('UPDATE orgs SET logo_file_id=NULL WHERE id=?', c.org_id); c.audit('org.logo_reset', 'org', c.org_id, null, null); return { ok: true }; });

  // ---------- dispatcher ----------
  function handle({ method, path: p, query = {}, body = {}, headers = {}, ip = '0.0.0.0' }) {
    const out = (status, payload, extra = {}) => ({ status, body: payload, ...extra });
    try {
      const route = routes.find((rt) => rt.method === method && rt.re.test(p)); if (!route) throw notFound('route');
      const params = route.re.exec(p).groups || {}; const token = (headers.authorization || '').replace(/^Bearer /i, '') || null;
      const req = { params, query, body, ip, token };
      const ctx = route.public ? null : authenticate(token, ip);
      if (ctx && !ctx.platform && !ctx.readOnly && ctx.user.must_change_password && !/^\/api\/auth\/(me|password|logout)$/.test(p)) throw new AppError(403, 'password_change_required', 'You must change your password before continuing');
      if (ctx && ctx.readOnly && method !== 'GET' && !p.endsWith('/auth/logout')) throw forbidden('Support sessions are read-only', 'read_only');
      if (ctx?.platform && !p.startsWith('/api/platform') && !p.startsWith('/api/auth')) throw forbidden('Platform administrators have no tenant access', 'platform_only');
      if (ctx?.readOnly) db.prepare('INSERT INTO audit_log(org_id,user_id,action,entity,after,ip,created_at) VALUES(?,?,?,?,?,?,?)').run(ctx.org_id, ctx.user.id, 'support.read', 'api', JSON.stringify({ p, query }), ip, nowIso());
      const idem = method === 'POST' && ctx && headers['idempotency-key'] ? String(headers['idempotency-key']).slice(0, 100) : null;
      if (idem) {
        const prev = db.prepare('SELECT * FROM idempotency WHERE org_id=? AND user_id=? AND key=?').get(ctx.org_id ?? 0, ctx.user.id, idem);
        if (prev) { if (prev.method_path !== method + p) throw new AppError(422, 'idempotency_key_reuse', 'Idempotency key already used for another request'); return out(prev.status, JSON.parse(prev.body), { replayed: true }); }
      }
      let result;
      try { result = idem ? tx(db, () => { const x = route.handler(ctx, req); store(ctx, idem, method + p, 200, x ?? { ok: true }); return x; }) : route.handler(ctx, req); }
      catch (e) {
        if (e instanceof ApprovalNeeded) {
          const aid = tx(db, () => createApproval(ctx, e));
          result = { approval_required: true, approval_id: aid, summary: e.summary }; if (idem) store(ctx, idem, method + p, 202, result); return out(202, result);
        }
        throw e;
      }
      if (result && result.raw !== undefined) return out(200, result.raw, { raw: true, type: result.type, filename: result.filename, cache: result.cache });
      return out(200, result ?? { ok: true });
    } catch (e) {
      if (e instanceof AppError) return out(e.status, { error: { code: e.code, message: e.message, params: e.params } });
      if (e && /UNIQUE constraint failed/.test(e.message)) return out(409, { error: { code: 'duplicate', message: 'Duplicate record' } });
      if (e && /CHECK constraint failed: qty|stock\.qty/.test(e.message)) return out(409, { error: { code: 'insufficient_stock', message: 'Insufficient stock' } });
      console.error('Unhandled error', e); return out(500, { error: { code: 'internal', message: 'Unexpected error' } });
    }
  }
  function store(ctx, key, mp, status, body) { db.prepare('INSERT OR IGNORE INTO idempotency(org_id,user_id,key,method_path,status,body,created_at) VALUES(?,?,?,?,?,?,?)').run(ctx.org_id ?? 0, ctx.user.id, key, mp, status, JSON.stringify(body), nowIso()); }
  return { handle, authenticate };
}
