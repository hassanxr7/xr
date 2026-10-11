import { forbidden, notFound, AppError } from './errors.js';
import { nowIso, localDate } from './time.js';
import { tx } from './db.js';
import { TYPE_MODULES } from './perm.js';

export class ApprovalNeeded extends Error {
  constructor(type, branch_id, amount, summary, payload) { super('approval_required'); Object.assign(this, { type, branch_id, amount, summary, payload }); }
}

export class Ctx {
  constructor(db, user, extra = {}) {
    this.db = db; this.user = user; this.ip = extra.ip || null; this.readOnly = !!extra.readOnly;
    this.org_id = extra.org_id ?? user.org_id;
    const role = user.role_id ? db.prepare('SELECT * FROM roles WHERE id=?').get(user.role_id) : null;
    this.role = role; this.perms = new Set(role ? JSON.parse(role.perms) : []); this.limits = role ? JSON.parse(role.limits) : {};
    this.all_branches = !!role && role.scope === 'org';
    if (extra.readOnly) this.perms = new Set([...this.perms].filter((p) => p.endsWith('.view')));
    this._bids = null;
  }
  static forUserId(db, id) { const u = db.prepare('SELECT * FROM users WHERE id=? AND active=1').get(id); if (!u) throw notFound('user'); return new Ctx(db, u); }
  get = (sql, ...p) => this.db.prepare(sql).get(...p);
  all = (sql, ...p) => this.db.prepare(sql).all(...p);
  run = (sql, ...p) => this.db.prepare(sql).run(...p);
  tx = (fn) => tx(this.db, fn);
  can(perm) { return this.perms.has(perm); }
  need(perm) { if (!this.can(perm)) throw forbidden(`Missing permission ${perm}`, 'missing_permission'); }
  // Branch visibility: org-scope roles see every branch of their org; others only assigned branches.
  branchIds() {
    if (!this._bids) {
      this._bids = this.all_branches
        ? this.all('SELECT id FROM branches WHERE org_id=?', this.org_id).map((r) => r.id)
        : this.all('SELECT ub.branch_id id FROM user_branches ub JOIN branches b ON b.id=ub.branch_id WHERE ub.user_id=? AND b.org_id=?', this.user.id, this.org_id).map((r) => r.id);
    }
    return this._bids;
  }
  // Resolve a branch the caller may access. Unknown OR forbidden both yield 404 (no existence leak).
  branch(id) {
    id = Number(id);
    if (!this.branchIds().includes(id)) throw notFound('branch');
    return this.get('SELECT b.*, bu.type AS btype, bu.name AS business_name FROM branches b JOIN businesses bu ON bu.id=b.business_id WHERE b.id=? AND b.org_id=?', id, this.org_id);
  }
  // Same, with a permission requirement (the combination used by nearly every write).
  at(perm, branchId) { this.need(perm); return this.branch(branchId); }
  inBranches(col = 'branch_id') { const ids = this.branchIds(); return { sql: ids.length ? `${col} IN (${ids.join(',')})` : '0', ids }; }
  requireModule(branch, mod) {
    const types = [branch.btype, ...this.all('SELECT kind FROM departments WHERE branch_id=? AND active=1', branch.id).map((d) => d.kind)];
    if (!types.some((t) => TYPE_MODULES[t].includes(mod))) throw new AppError(409, 'module_not_available', `Module ${mod} is not enabled for this branch type`, { mod });
    const org = this.get('SELECT modules FROM orgs WHERE id=?', this.org_id);
    if (org.modules && !JSON.parse(org.modules).includes(mod)) throw new AppError(402, 'module_not_in_plan', `Module ${mod} is not in the subscription plan`, { mod });
  }
  limitOk(key, value) { const l = this.limits[key]; return l === undefined || value <= l; }
  today(branch) { return localDate(nowIso(), branch.timezone); }
  audit(action, entity, entity_id, before, after, branch_id = null) {
    this.run('INSERT INTO audit_log(org_id,user_id,action,entity,entity_id,branch_id,before,after,ip,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
      this.org_id, this.user.id, action, entity, entity_id ?? null, branch_id, before == null ? null : JSON.stringify(before), after == null ? null : JSON.stringify(after), this.ip, nowIso());
  }
  notify(type, message, { branch_id = null, user_id = null, params = null, link = null, dedupe = null } = {}) {
    this.run('INSERT OR IGNORE INTO notifications(org_id,branch_id,user_id,type,message,params,link,dedupe_key,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
      this.org_id, branch_id, user_id, type, message, params ? JSON.stringify(params) : null, link, dedupe, nowIso());
  }
  ref(prefix, branch) {
    const scope = `${prefix}:${branch.id}`;
    this.run('INSERT INTO counters(org_id,scope,next) VALUES(?,?,1) ON CONFLICT(org_id,scope) DO UPDATE SET next=next+1', this.org_id, scope);
    const n = this.get('SELECT next FROM counters WHERE org_id=? AND scope=?', this.org_id, scope).next;
    return `${prefix}-${branch.code}-${String(n).padStart(6, '0')}`;
  }
  guardDay(branch, date = this.today(branch)) {
    const c = this.get('SELECT 1 x FROM day_closings WHERE org_id=? AND branch_id=? AND business_date=? AND reopened_at IS NULL', this.org_id, branch.id, date);
    if (c) throw new AppError(409, 'day_closed', `Business day ${date} is closed for this branch`, { date });
  }
  openSession(branch, userId = this.user.id) {
    return this.get("SELECT * FROM register_sessions WHERE org_id=? AND branch_id=? AND opened_by=? AND status='open'", this.org_id, branch.id, userId);
  }
  setting(key, def = null) { const r = this.get('SELECT value FROM settings WHERE org_id=? AND key=?', this.org_id, key); return r ? r.value : def; }
}

// --- Approvals: restricted actions become deferred requests, executed on approval ---
export const approvalHandlers = {};
export function registerApproval(type, { limitKey, valueOf, perm }, run) { approvalHandlers[type] = { limitKey, valueOf, perm, run }; }

export function createApproval(ctx, n) {
  const id = ctx.run('INSERT INTO approvals(org_id,branch_id,type,amount,summary,payload,requested_by,created_at) VALUES(?,?,?,?,?,?,?,?)',
    ctx.org_id, n.branch_id, n.type, n.amount || 0, n.summary, JSON.stringify(n.payload), ctx.user.id, nowIso()).lastInsertRowid;
  ctx.notify('approval_request', `Approval needed: ${n.summary}`, { branch_id: n.branch_id, params: { approval_id: id }, link: '#/approvals' });
  ctx.audit('approval.request', 'approval', id, null, { type: n.type, summary: n.summary }, n.branch_id);
  return id;
}
export function decideApproval(ctx, id, approve, note) {
  ctx.need('approvals.approve');
  return ctx.tx(() => {
    const a = ctx.get('SELECT * FROM approvals WHERE id=? AND org_id=?', id, ctx.org_id);
    if (!a || (a.branch_id && !ctx.branchIds().includes(a.branch_id))) throw notFound('approval');
    if (a.status !== 'pending') throw new AppError(409, 'already_decided', 'Approval already decided');
    if (a.requested_by === ctx.user.id && !ctx.can('approvals.settings')) throw forbidden('You cannot approve your own request', 'self_approval');
    const h = approvalHandlers[a.type];
    if (!h) throw new AppError(500, 'unknown_approval_type');
    if (approve) {
      if (h.perm) ctx.need(h.perm);
      if (h.limitKey && !ctx.limitOk(h.limitKey, h.valueOf(JSON.parse(a.payload), a)))
        throw forbidden('Amount exceeds your approval limit', 'approval_limit');
    }
    let result = null;
    if (approve) {
      const reqCtx = Ctx.forUserId(ctx.db, a.requested_by); reqCtx.ip = ctx.ip;
      result = h.run(reqCtx, JSON.parse(a.payload), { approvedBy: ctx.user.id });
    }
    ctx.run('UPDATE approvals SET status=?, decided_by=?, decision_note=?, decided_at=?, result=? WHERE id=?', approve ? 'approved' : 'rejected', ctx.user.id, note || null, nowIso(), result ? JSON.stringify(result) : null, id);
    ctx.audit(approve ? 'approval.approve' : 'approval.reject', 'approval', id, { status: 'pending' }, { status: approve ? 'approved' : 'rejected', note }, a.branch_id);
    ctx.notify('approval_decided', `Request ${approve ? 'approved' : 'rejected'}: ${a.summary}`, { user_id: a.requested_by, branch_id: a.branch_id });
    return { id, status: approve ? 'approved' : 'rejected', result };
  });
}
export function listApprovals(ctx, { status } = {}) {
  ctx.need('approvals.view');
  const b = ctx.inBranches('a.branch_id');
  return ctx.all(`SELECT a.*, u.name requester FROM approvals a JOIN users u ON u.id=a.requested_by WHERE a.org_id=? AND (a.branch_id IS NULL OR ${b.sql}) ${status ? 'AND a.status=?' : ''} ORDER BY a.id DESC LIMIT 200`, ...(status ? [ctx.org_id, status] : [ctx.org_id]));
}
