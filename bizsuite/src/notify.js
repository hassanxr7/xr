import { nowIso, localDate, addDays } from './time.js';
import { Ctx } from './core.js';
// Background scan producing in-app notifications (deduplicated per day). Optional email/SMS/WhatsApp are documented
// but NOT connected: channel_deliveries is the hook where a provider adapter would record delivery status and cost.
export function scanAlerts(db) {
  for (const org of db.prepare("SELECT id FROM orgs WHERE status='active'").all()) {
    const run = (sql, ...a) => db.prepare(sql).run(...a);
    for (const b of db.prepare('SELECT * FROM branches WHERE org_id=? AND active=1').all(org.id)) {
      const today = localDate(nowIso(), b.timezone);
      for (const j of db.prepare("SELECT id,ref FROM repair_jobs WHERE branch_id=? AND status NOT IN ('completed','delivered','cancelled','unrepairable') AND est_completion<?").all(b.id, today))
        run('INSERT OR IGNORE INTO notifications(org_id,branch_id,type,message,link,dedupe_key,created_at) VALUES(?,?,?,?,?,?,?)', org.id, b.id, 'repair_overdue', `Repair ${j.ref} is overdue`, '#/repairs', `overdue:${j.id}:${today}`, nowIso());
      for (const s of db.prepare("SELECT id,ref,total-returned_total-paid due FROM sales WHERE branch_id=? AND status='completed' AND total-returned_total-paid>0 AND business_date<=?").all(b.id, addDays(today, -7)))
        run('INSERT OR IGNORE INTO notifications(org_id,branch_id,type,message,link,dedupe_key,created_at) VALUES(?,?,?,?,?,?,?)', org.id, b.id, 'payment_overdue', `Invoice ${s.ref} has an outstanding balance older than 7 days`, '#/sales', `due:${s.id}:${today}`, nowIso());
    }
  }
}
export function listNotifications(ctx, { unread, limit = 50 } = {}) {
  const b = ctx.inBranches('branch_id');
  const rows = ctx.all(`SELECT * FROM notifications WHERE org_id=? AND (user_id IS NULL OR user_id=?) AND (branch_id IS NULL OR ${b.sql}) ${unread ? 'AND read_at IS NULL' : ''} ORDER BY id DESC LIMIT ${Math.min(Number(limit) || 50, 200)}`, ctx.org_id, ctx.user.id);
  // sensitive categories only for roles that may act on them
  const allow = (n) => !['cash_discrepancy', 'approval_request', 'reconciliation_difference'].includes(n.type) || ctx.can('approvals.view') || ctx.can('registers.approve');
  const f = rows.filter(allow);
  return { rows: f, unread: f.filter((n) => !n.read_at).length };
}
export function markRead(ctx, ids) { for (const id of ids || []) ctx.run('UPDATE notifications SET read_at=? WHERE id=? AND org_id=? AND read_at IS NULL', nowIso(), id, ctx.org_id); return { ok: true }; }
