import { openDb } from '../src/db.js';
import { Ctx } from '../src/core.js';
import { createTenant } from '../src/platform.js';
import { createApi } from '../src/api.js';
import * as admin from '../src/admin.js';
import * as inv from '../src/inventory.js';
import * as fin from '../src/finance.js';
import { setNow } from '../src/time.js';
export const PW = 'Test@12345';
export function world() {
  const db = openDb(':memory:');
  const t = createTenant(db, { name: 'T', owner_name: 'Owner', owner_email: 'o@t.so', owner_password: PW });
  const O = Ctx.forUserId(db, t.owner_id); const org = t.org_id;
  const role = (n) => db.prepare('SELECT id FROM roles WHERE org_id=? AND name=?').get(org, n).id;
  const method = (n) => db.prepare('SELECT id FROM payment_methods WHERE org_id=? AND name LIKE ?').get(org, n + '%').id;
  const w = {
    db, O, org, role, CASH: method('Cash'), MOBILE: method('Mobile'), BANK: method('Bank'), CREDIT: method('Exchange'),
    biz: (name, type) => admin.createBusiness(O, { name, type }).id,
    branch: (business_id, code, extra = {}) => admin.createBranch(O, { business_id, code, name: code + ' branch', ...extra }).id,
    user: (name, r, branches, bp = 0) => admin.createUser(O, { name, email: name.toLowerCase().replace(/\W/g, '') + '@t.so', password: PW, role_id: role(r), branch_ids: branches, commission_bp: bp }).id,
    ctx: (id) => Ctx.forUserId(db, id),
    product: (business_id, sku, o = {}) => { const p = inv.createProduct(O, { business_id, name: o.name || sku, kind: o.kind || 'standard', is_part: o.is_part, warranty_months: o.warranty_months, variants: [{ sku, barcode: o.barcode, cost: o.cost ?? 1000, price: o.price ?? 2000, min_stock: o.min_stock ?? 0 }] }); return db.prepare('SELECT id FROM variants WHERE product_id=?').get(p.id).id; },
    supplier: () => fin.saveSupplier(O, null, { name: 'Sup' }).id,
    customer: (n = 'Cust') => fin.saveCustomer(O, null, { name: n }).id,
    buy: (branch, variant, qty, cost, o = {}) => inv.createPurchase(O, { branch_id: branch, supplier_id: o.supplier ?? w._sup ?? (w._sup = w.supplier()), lines: [{ variant_id: variant, qty, unit_cost: cost }], charges: o.charges || 0, receive_now: true, receive_serials: o.serials ? [o.serials] : undefined }),
    stock: (branch, variant) => ({ ...(db.prepare('SELECT qty,value FROM stock WHERE branch_id=? AND variant_id=?').get(branch, variant) || { qty: 0, value: 0 }) }),
  };
  return w;
}
export function client(db) {
  const api = createApi(db, { dataDir: './data-test' }); let n = 0;
  return {
    api,
    async login(email, password = PW) { const r = api.handle({ method: 'POST', path: '/api/auth/login', body: { email, password }, ip: '10.0.0.' + (++n) }); if (r.status !== 200) throw new Error('login failed ' + JSON.stringify(r.body)); const token = r.body.token; return (method, path, body = {}, query = {}, headers = {}) => api.handle({ method, path, body, query, headers: { authorization: 'Bearer ' + token, ...headers }, ip: '10.0.1.1' }); },
    anon: (method, path, body = {}, ip = '1.1.1.1') => api.handle({ method, path, body, ip, headers: {} }),
  };
}
export { setNow };
