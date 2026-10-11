// SaaS-ready tenancy. Single-owner mode is simply one org with saas_enabled=0.
// Platform administrators have no org; they can manage tenant status/limits and, only through an owner-granted,
// time-boxed, read-only support session, view a tenant. Every support request is written to that tenant's audit log.
import { AppError, bad, notFound, forbidden } from './errors.js';
import { nowIso } from './time.js';
import { hashPassword, checkPasswordStrength, newToken, hashToken } from './auth.js';
import { seedOrgDefaults } from './admin.js';
import { tx } from './db.js';

export function createTenant(db, t) {
  return tx(db, () => {
    if (!checkPasswordStrength(t.owner_password)) throw bad('weak_password', 'Weak password');
    if (db.prepare('SELECT 1 x FROM users WHERE email=?').get(String(t.owner_email).toLowerCase())) throw new AppError(409, 'duplicate_email', 'Email already registered');
    const orgId = db.prepare('INSERT INTO orgs(name,saas_enabled,plan,max_branches,max_users,max_storage_mb,modules,reporting_currency,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(t.name, t.saas ? 1 : 0, t.plan || (t.saas ? 'starter' : 'internal'), t.max_branches ?? null, t.max_users ?? null, t.max_storage_mb ?? null, t.modules ? JSON.stringify(t.modules) : null, t.reporting_currency || 'USD', nowIso()).lastInsertRowid;
    seedOrgDefaults(db, orgId);
    const role = db.prepare("SELECT id FROM roles WHERE org_id=? AND name='Owner'").get(orgId);
    const uid = db.prepare('INSERT INTO users(org_id,name,email,pass_hash,role_id,must_change_password,created_at) VALUES(?,?,?,?,?,?,?)').run(orgId, t.owner_name, String(t.owner_email).toLowerCase(), hashPassword(t.owner_password), role.id, t.must_change_password ? 1 : 0, nowIso()).lastInsertRowid;
    db.prepare('INSERT INTO commission_rate_history(org_id,user_id,rate_bp,changed_at) VALUES(?,?,0,?)').run(orgId, uid, nowIso());
    return { org_id: orgId, owner_id: uid };
  });
}
const needPlatform = (user) => { if (!user.is_platform) throw forbidden('Platform administrators only', 'platform_only'); };
export function listTenants(db, user) {
  needPlatform(user);
  return db.prepare(`SELECT o.*, (SELECT COUNT(*) FROM branches WHERE org_id=o.id) branches, (SELECT COUNT(*) FROM users WHERE org_id=o.id AND active=1) users,
    (SELECT COALESCE(SUM(size),0) FROM files WHERE org_id=o.id) storage_bytes FROM orgs o ORDER BY o.id`).all();
}
export function updateTenant(db, user, id, u) {
  needPlatform(user);
  return tx(db, () => {
    const o = db.prepare('SELECT * FROM orgs WHERE id=?').get(id); if (!o) throw notFound('tenant');
    if (u.status && !['active', 'suspended'].includes(u.status)) throw bad('invalid_status');
    for (const k of ['status', 'plan', 'max_branches', 'max_users', 'max_storage_mb', 'saas_enabled']) if (k in u) db.prepare(`UPDATE orgs SET ${k}=? WHERE id=?`).run(u[k], id);
    if ('modules' in u) db.prepare('UPDATE orgs SET modules=? WHERE id=?').run(u.modules ? JSON.stringify(u.modules) : null, id);
    if (u.status === 'suspended') db.prepare('DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE org_id=?)').run(id);
    db.prepare('INSERT INTO audit_log(org_id,user_id,action,entity,entity_id,before,after,created_at) VALUES(?,?,?,?,?,?,?,?)').run(id, user.id, 'platform.tenant_update', 'org', id, JSON.stringify({ status: o.status, plan: o.plan }), JSON.stringify(u), nowIso());
    return { id };
  });
}
export function grantSupport(ctx, { hours = 4, reason }) {
  ctx.need('settings.settings'); if (!reason) throw bad('reason_required', 'Reason is required'); hours = Math.min(Math.max(Number(hours) || 1, 1), 72);
  const id = ctx.run('INSERT INTO support_access(org_id,reason,granted_by,expires_at,created_at) VALUES(?,?,?,?,?)', ctx.org_id, reason, ctx.user.id, Date.now() + hours * 3600e3, nowIso()).lastInsertRowid;
  ctx.audit('support.grant', 'support_access', id, null, { hours, reason }); return { id };
}
export function revokeSupport(ctx, id) { ctx.need('settings.settings'); ctx.run('UPDATE support_access SET revoked_at=? WHERE id=? AND org_id=?', nowIso(), id, ctx.org_id); ctx.audit('support.revoke', 'support_access', id, null, null); return { ok: true }; }
export function listSupport(ctx) { ctx.need('settings.settings'); return { rows: ctx.all('SELECT * FROM support_access WHERE org_id=? ORDER BY id DESC LIMIT 50', ctx.org_id) }; }
export function startSupportSession(db, user, orgId) {
  needPlatform(user);
  const g = db.prepare('SELECT * FROM support_access WHERE org_id=? AND revoked_at IS NULL AND expires_at>? ORDER BY expires_at DESC LIMIT 1').get(orgId, Date.now());
  if (!g) throw forbidden('The tenant owner has not granted support access', 'no_support_grant');
  const token = newToken(); db.prepare('INSERT INTO sessions(token_hash,user_id,support_org_id,expires_at,created_at) VALUES(?,?,?,?,?)').run(hashToken(token), user.id, orgId, Math.min(g.expires_at, Date.now() + 2 * 3600e3), nowIso());
  db.prepare('INSERT INTO audit_log(org_id,user_id,action,entity,entity_id,after,created_at) VALUES(?,?,?,?,?,?,?)').run(orgId, user.id, 'support.session_start', 'support_access', g.id, JSON.stringify({ admin: user.email }), nowIso());
  return { token, read_only: true, expires_at: Math.min(g.expires_at, Date.now() + 2 * 3600e3) };
}
