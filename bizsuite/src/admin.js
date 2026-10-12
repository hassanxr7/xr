import { AppError, bad, notFound, forbidden } from './errors.js';
import { nowIso } from './time.js';
import { hashPassword, checkPasswordStrength } from './auth.js';
import { BUSINESS_TYPES, ALL_PERMS, DEFAULT_ROLES } from './perm.js';
import { int } from './money.js';

const str = (v, f, { req = true, max = 200 } = {}) => {
  if (v == null || v === '') { if (req) throw bad('required', `${f} is required`, { field: f }); return null; }
  if (typeof v !== 'string' || v.length > max) throw bad('invalid_text', `${f} is invalid`, { field: f }); return v.trim();
};
export { str };
const color = (v) => { if (v == null || v === '') return null; if (!/^#[0-9a-fA-F]{6}$/.test(v)) throw bad('invalid_color', 'Colour must look like #1a2b3c'); return v.toLowerCase(); };

export function seedOrgDefaults(db, orgId) {
  for (const [name, r] of Object.entries(DEFAULT_ROLES))
    db.prepare('INSERT INTO roles(org_id,name,scope,perms,limits,is_system) VALUES(?,?,?,?,?,?)').run(orgId, name, r.scope, JSON.stringify(r.perms), JSON.stringify(r.limits), r.is_system || 0);
  for (const [n, k] of [['Cash', 'cash'], ['Mobile Money (manual)', 'mobile'], ['Bank Transfer', 'bank'], ['Card (manual)', 'card'], ['Exchange credit', 'credit']])
    db.prepare('INSERT INTO payment_methods(org_id,name,kind) VALUES(?,?,?)').run(orgId, n, k);
  for (const c of ['Rent', 'Electricity', 'Salaries', 'Supplies', 'Transport', 'Marketing', 'Maintenance', 'Other'])
    db.prepare('INSERT INTO expense_categories(org_id,name) VALUES(?,?)').run(orgId, c);
}

export function createBusiness(ctx, b) {
  ctx.need('branches.create');
  const type = b.type; if (!BUSINESS_TYPES.includes(type)) throw bad('invalid_type', 'Invalid business type');
  return ctx.tx(() => {
    const id = ctx.run('INSERT INTO businesses(org_id,name,type,created_at) VALUES(?,?,?,?)', ctx.org_id, str(b.name, 'name'), type, nowIso()).lastInsertRowid;
    ctx.audit('business.create', 'business', id, null, b);
    return { id };
  });
}
export function listBusinesses(ctx) {
  const ids = ctx.branchIds();
  return ctx.all(`SELECT * FROM businesses WHERE org_id=? ${ctx.all_branches ? '' : `AND id IN (SELECT business_id FROM branches WHERE id IN (${ids.join(',') || 0}))`} ORDER BY name`, ctx.org_id);
}
export function createBranch(ctx, b) {
  ctx.need('branches.create');
  return ctx.tx(() => {
    const org = ctx.get('SELECT * FROM orgs WHERE id=?', ctx.org_id);
    if (org.max_branches != null && ctx.get('SELECT COUNT(*) c FROM branches WHERE org_id=?', ctx.org_id).c >= org.max_branches)
      throw new AppError(402, 'plan_limit_branches', 'Branch limit of the subscription reached');
    const bu = ctx.get('SELECT * FROM businesses WHERE id=? AND org_id=?', b.business_id, ctx.org_id); if (!bu) throw notFound('business');
    const code = str(b.code, 'code', { max: 8 }).toUpperCase();
    if (!/^[A-Z0-9]{2,8}$/.test(code)) throw bad('invalid_code', 'Branch code must be 2-8 letters/digits');
    if (ctx.get('SELECT 1 x FROM branches WHERE org_id=? AND code=?', ctx.org_id, code)) throw new AppError(409, 'duplicate_code', 'Branch code already used');
    const id = ctx.run(`INSERT INTO branches(org_id,business_id,code,name,address,phone,email,currency,timezone,tax_bp,tip_to,require_register,allow_credit,receipt_header,receipt_footer,invoice_terms,color,created_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, ctx.org_id, bu.id, code, str(b.name, 'name'), b.address || null, b.phone || null, b.email || null, b.currency || 'USD', b.timezone || 'Africa/Mogadishu',
      int(b.tax_bp ?? 0, 'tax_bp', { min: 0, max: 10000 }), b.tip_to === 'business' ? 'business' : 'employee', b.require_register ? 1 : 0, b.allow_credit === false ? 0 : 1,
      b.receipt_header || null, b.receipt_footer || null, b.invoice_terms || null, color(b.color), nowIso()).lastInsertRowid;
    if (!ctx.all_branches) ctx.run('INSERT INTO user_branches VALUES(?,?)', ctx.user.id, id);
    ctx._bids = null;
    ctx.audit('branch.create', 'branch', id, null, b, id);
    return { id };
  });
}
export function updateBranch(ctx, id, b) {
  ctx.need('branches.edit'); const br = ctx.branch(id);
  const sets = [], vals = []; const f = ['name', 'address', 'phone', 'email', 'receipt_header', 'receipt_footer', 'invoice_terms', 'tip_to', 'manager_id', 'logo_file_id'];
  if ('color' in b) { sets.push('color=?'); vals.push(color(b.color)); }
  for (const k of f) if (k in b) { sets.push(`${k}=?`); vals.push(b[k]); }
  for (const k of ['tax_bp', 'require_register', 'allow_credit', 'active']) if (k in b) { sets.push(`${k}=?`); vals.push(int(Number(b[k]), k, { min: 0, max: 10000 })); }
  if (!sets.length) return { id };
  if (b.manager_id && !ctx.get('SELECT 1 x FROM users WHERE id=? AND org_id=?', b.manager_id, ctx.org_id)) throw notFound('user');
  ctx.tx(() => { ctx.run(`UPDATE branches SET ${sets.join(',')} WHERE id=? AND org_id=?`, ...vals, id, ctx.org_id); ctx.audit('branch.update', 'branch', id, br, b, id); });
  return { id };
}
export function listBranches(ctx) {
  const b = ctx.inBranches('b.id');
  return ctx.all(`SELECT b.*, bu.name business_name, bu.type business_type FROM branches b JOIN businesses bu ON bu.id=b.business_id WHERE b.org_id=? AND ${b.sql} ORDER BY bu.name,b.name`, ctx.org_id);
}
export function addDepartment(ctx, branchId, d) {
  ctx.need('branches.edit'); const br = ctx.branch(branchId);
  if (!BUSINESS_TYPES.includes(d.kind)) throw bad('invalid_type', 'Invalid department kind');
  const id = ctx.run('INSERT INTO departments(org_id,branch_id,name,kind) VALUES(?,?,?,?)', ctx.org_id, br.id, str(d.name, 'name'), d.kind).lastInsertRowid;
  ctx.audit('department.create', 'department', id, null, d, br.id); return { id };
}

// --- Roles ---
export function listRoles(ctx) { ctx.need('roles.view'); return ctx.all('SELECT * FROM roles WHERE org_id=? ORDER BY id', ctx.org_id).map((r) => ({ ...r, perms: JSON.parse(r.perms), limits: JSON.parse(r.limits) })); }
export function saveRole(ctx, id, r) {
  ctx.need('roles.edit');
  const perms = [...new Set(r.perms || [])]; if (perms.some((p) => !ALL_PERMS.includes(p))) throw bad('invalid_permission', 'Unknown permission');
  if (r.scope && !['org', 'assigned'].includes(r.scope)) throw bad('invalid_scope');
  const limits = {}; for (const k of ['discount_bp', 'refund_max', 'expense_max', 'adjust_qty', 'payout_max']) if (r.limits && r.limits[k] != null && r.limits[k] !== '') limits[k] = int(r.limits[k], k, { min: 0 });
  // privilege escalation guard: you cannot grant permissions you do not hold
  for (const p of perms) if (!ctx.can(p)) throw forbidden(`Cannot grant ${p} (you do not hold it)`, 'escalation');
  return ctx.tx(() => {
    if (id) {
      const old = ctx.get('SELECT * FROM roles WHERE id=? AND org_id=?', id, ctx.org_id); if (!old) throw notFound('role');
      if (old.name === 'Owner') throw forbidden('The Owner role is fixed', 'system_role');
      ctx.run('UPDATE roles SET name=?, scope=?, perms=?, limits=? WHERE id=?', str(r.name, 'name'), r.scope || old.scope, JSON.stringify(perms), JSON.stringify(limits), id);
      ctx.audit('role.update', 'role', id, { perms: JSON.parse(old.perms), limits: JSON.parse(old.limits) }, { perms, limits }); return { id };
    }
    const nid = ctx.run('INSERT INTO roles(org_id,name,scope,perms,limits) VALUES(?,?,?,?,?)', ctx.org_id, str(r.name, 'name'), r.scope || 'assigned', JSON.stringify(perms), JSON.stringify(limits)).lastInsertRowid;
    ctx.audit('role.create', 'role', nid, null, { perms, limits }); return { id: nid };
  });
}

// --- Users ---
export function listUsers(ctx) {
  ctx.need('staff.view');
  const rows = ctx.all(`SELECT u.id,u.name,u.email,u.phone,u.role_id,r.name role,u.active,u.lang,u.commission_bp,u.commission_fixed,u.totp_enabled FROM users u LEFT JOIN roles r ON r.id=u.role_id WHERE u.org_id=? ORDER BY u.name`, ctx.org_id);
  const vis = new Set(ctx.branchIds());
  const out = [];
  for (const u of rows) {
    const bs = ctx.all('SELECT branch_id FROM user_branches WHERE user_id=?', u.id).map((x) => x.branch_id);
    const role = ctx.get('SELECT scope FROM roles WHERE id=?', u.role_id);
    if (!ctx.all_branches && !(bs.some((b) => vis.has(b)) || u.id === ctx.user.id)) continue; // managers see only their branch staff
    if (!ctx.can('commissions.viewall')) { delete u.commission_bp; delete u.commission_fixed; }
    out.push({ ...u, branches: bs, scope: role?.scope });
  }
  return out;
}
export function createUser(ctx, u) {
  ctx.need('staff.create');
  return ctx.tx(() => {
    const org = ctx.get('SELECT * FROM orgs WHERE id=?', ctx.org_id);
    if (org.max_users != null && ctx.get('SELECT COUNT(*) c FROM users WHERE org_id=? AND active=1', ctx.org_id).c >= org.max_users) throw new AppError(402, 'plan_limit_users', 'User limit of the subscription reached');
    if (!checkPasswordStrength(u.password)) throw bad('weak_password', 'Password needs 8+ characters with letters and digits');
    const email = str(u.email, 'email').toLowerCase(); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw bad('invalid_email', 'Invalid email');
    if (ctx.get('SELECT 1 x FROM users WHERE email=?', email)) throw new AppError(409, 'duplicate_email', 'Email already registered');
    const role = ctx.get('SELECT * FROM roles WHERE id=? AND org_id=?', u.role_id, ctx.org_id); if (!role) throw notFound('role');
    for (const p of JSON.parse(role.perms)) if (!ctx.can(p)) throw forbidden('Cannot assign a role with permissions you do not hold', 'escalation');
    if (role.scope === 'org' && !ctx.all_branches) throw forbidden('Cannot assign an organisation-wide role', 'escalation');
    const bp = int(u.commission_bp ?? 0, 'commission_bp', { min: 0, max: 10000 });
    const fixed = int(u.commission_fixed ?? 0, 'commission_fixed', { min: 0 });
    if ((bp || fixed) && !ctx.can('staff.settings')) throw forbidden('Setting commission rates needs staff.settings', 'missing_permission');
    const id = ctx.run('INSERT INTO users(org_id,name,email,phone,pass_hash,role_id,lang,commission_bp,commission_fixed,must_change_password,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
      ctx.org_id, str(u.name, 'name'), email, u.phone || null, hashPassword(u.password), role.id, u.lang === 'so' ? 'so' : 'en', bp, fixed, u.must_change_password ? 1 : 0, nowIso()).lastInsertRowid;
    ctx.run('INSERT INTO commission_rate_history(org_id,user_id,rate_bp,fixed_amount,changed_by,changed_at) VALUES(?,?,?,?,?,?)', ctx.org_id, id, bp, fixed, ctx.user.id, nowIso());
    for (const b of u.branch_ids || []) { ctx.branch(b); ctx.run('INSERT OR IGNORE INTO user_branches VALUES(?,?)', id, b); }
    ctx.audit('user.create', 'user', id, null, { email, role: role.name, branches: u.branch_ids, commission_bp: bp, commission_fixed: fixed });
    return { id };
  });
}
export function updateUser(ctx, id, u) {
  ctx.need('staff.edit');
  return ctx.tx(() => {
    const old = ctx.get('SELECT * FROM users WHERE id=? AND org_id=?', id, ctx.org_id); if (!old) throw notFound('user');
    if (!ctx.all_branches) { const mine = new Set(ctx.branchIds()); const theirs = ctx.all('SELECT branch_id FROM user_branches WHERE user_id=?', id); if (!theirs.some((b) => mine.has(b.branch_id))) throw notFound('user'); }
    if (id === ctx.user.id && ('commission_bp' in u || 'commission_fixed' in u || 'role_id' in u || 'branch_ids' in u)) throw forbidden('You cannot change your own role, branches or commission rate', 'self_edit');
    const after = {};
    const bpChanged = 'commission_bp' in u && Number(u.commission_bp) !== old.commission_bp, fxChanged = 'commission_fixed' in u && Number(u.commission_fixed) !== old.commission_fixed;
    if (bpChanged || fxChanged) { // historical ledger rows keep the rate stored on each sale line
      ctx.need('staff.settings'); const bp = bpChanged ? int(u.commission_bp, 'commission_bp', { min: 0, max: 10000 }) : old.commission_bp; const fixed = fxChanged ? int(u.commission_fixed, 'commission_fixed', { min: 0 }) : old.commission_fixed;
      ctx.run('UPDATE users SET commission_bp=?, commission_fixed=? WHERE id=?', bp, fixed, id);
      ctx.run('INSERT INTO commission_rate_history(org_id,user_id,rate_bp,fixed_amount,changed_by,changed_at) VALUES(?,?,?,?,?,?)', ctx.org_id, id, bp, fixed, ctx.user.id, nowIso()); after.commission_bp = bp; after.commission_fixed = fixed;
    }
    if ('role_id' in u && u.role_id !== old.role_id) {
      const role = ctx.get('SELECT * FROM roles WHERE id=? AND org_id=?', u.role_id, ctx.org_id); if (!role) throw notFound('role');
      for (const p of JSON.parse(role.perms)) if (!ctx.can(p)) throw forbidden('Cannot assign a role with permissions you do not hold', 'escalation');
      if (role.scope === 'org' && !ctx.all_branches) throw forbidden('Cannot assign an organisation-wide role', 'escalation');
      ctx.run('UPDATE users SET role_id=? WHERE id=?', role.id, id); after.role = role.name;
    }
    for (const k of ['name', 'phone', 'lang']) if (k in u) { ctx.run(`UPDATE users SET ${k}=? WHERE id=?`, u[k], id); after[k] = u[k]; }
    if ('active' in u) { ctx.run('UPDATE users SET active=? WHERE id=?', u.active ? 1 : 0, id); after.active = !!u.active; if (!u.active) ctx.run('DELETE FROM sessions WHERE user_id=?', id); }
    if (u.password) { if (!checkPasswordStrength(u.password)) throw bad('weak_password', 'Weak password'); ctx.run('UPDATE users SET pass_hash=?, must_change_password=1 WHERE id=?', hashPassword(u.password), id); ctx.run('DELETE FROM sessions WHERE user_id=?', id); after.password = 'changed'; }
    if (u.branch_ids) { for (const b of u.branch_ids) ctx.branch(b); ctx.run('DELETE FROM user_branches WHERE user_id=?', id); for (const b of u.branch_ids) ctx.run('INSERT OR IGNORE INTO user_branches VALUES(?,?)', id, b); after.branches = u.branch_ids; }
    ctx.audit('user.update', 'user', id, { role_id: old.role_id, commission_bp: old.commission_bp, commission_fixed: old.commission_fixed, active: old.active }, after);
    return { id };
  });
}
