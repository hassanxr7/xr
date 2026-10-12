// Barber waiting queue: a walk-in gets a ticket number, waits, a barber starts the service, and "Finish" records the
// visit (sale, commission, payment) exactly as Barber visits does. Tickets restart at 1 every business day per branch.
import { AppError, bad, notFound, forbidden } from './errors.js';
import { int } from './money.js';
import { nowIso } from './time.js';
import { createSale } from './sales.js';

const canDesk = (ctx) => ctx.can('services.create');
const canSee = (ctx) => ctx.can('services.view') || canDesk(ctx);
const ticketOf = (ctx, id) => { const q = ctx.get('SELECT * FROM barber_queue WHERE id=? AND org_id=?', id, ctx.org_id); if (!q) throw notFound('ticket'); ctx.branch(q.branch_id); return q; };
const mine = (ctx, q) => q.barber_id === ctx.user.id;

export function listQueue(ctx, { branch_id } = {}) {
  if (!canSee(ctx)) throw forbidden('Not permitted', 'missing_permission');
  const br = ctx.branch(branch_id || ctx.branchIds()[0]); ctx.requireModule(br, 'services'); const date = ctx.today(br);
  const rows = ctx.all(`SELECT q.*, s.name service_name, s.price, s.duration_min, u.name barber_name, sa.ref sale_ref FROM barber_queue q LEFT JOIN services s ON s.id=q.service_id LEFT JOIN users u ON u.id=q.barber_id LEFT JOIN sales sa ON sa.id=q.sale_id
    WHERE q.org_id=? AND q.branch_id=? AND (q.business_date=? OR q.status IN ('waiting','serving')) ORDER BY q.business_date, q.ticket`, ctx.org_id, br.id, date); // open tickets from an earlier day stay visible until closed
  // average service time today (fallback: the service's own duration, then 25 minutes) to estimate each waiting customer's wait
  const done = rows.filter((r) => r.status === 'done' && r.started_at && r.finished_at); const avg = done.length ? done.reduce((a, r) => a + (Date.parse(r.finished_at) - Date.parse(r.started_at)), 0) / done.length / 60000 : 25;
  const chairs = Math.max(1, ctx.get("SELECT COUNT(DISTINCT u.id) n FROM users u JOIN roles r ON r.id=u.role_id JOIN user_branches ub ON ub.user_id=u.id WHERE u.org_id=? AND ub.branch_id=? AND u.active=1 AND r.name='Barber'", ctx.org_id, br.id).n);
  let ahead = rows.filter((r) => r.status === 'serving').length; const now = Date.now();
  const out = rows.map((r) => { const o = { ...r, waited_min: Math.max(0, Math.round(((r.started_at ? Date.parse(r.started_at) : now) - Date.parse(r.created_at)) / 60000)) }; if (r.status === 'waiting') { o.est_wait_min = Math.round((ahead / chairs) * (r.duration_min || avg)); ahead++; } if (r.status === 'serving') o.serving_min = Math.round((now - Date.parse(r.started_at)) / 60000); return o; });
  return { branch_id: br.id, date, avg_service_min: Math.round(avg), chairs, waiting: out.filter((r) => r.status === 'waiting').length, serving: out.filter((r) => r.status === 'serving').length, done: out.filter((r) => r.status === 'done').length, rows: out, can_manage: canDesk(ctx) };
}

export function addToQueue(ctx, b) {
  if (!canDesk(ctx)) throw forbidden('Only the front desk can add customers to the queue', 'missing_permission');
  const br = ctx.branch(b.branch_id); ctx.requireModule(br, 'services'); const date = ctx.today(br);
  if (b.service_id && !ctx.get('SELECT 1 x FROM services WHERE id=? AND org_id=? AND business_id=? AND active=1', b.service_id, ctx.org_id, br.business_id)) throw notFound('service');
  if (b.barber_id && !ctx.get('SELECT 1 x FROM user_branches WHERE user_id=? AND branch_id=?', b.barber_id, br.id)) throw bad('invalid_barber', 'Barber is not assigned to this branch');
  return ctx.tx(() => {
    const ticket = ctx.get('SELECT COALESCE(MAX(ticket),0)+1 n FROM barber_queue WHERE org_id=? AND branch_id=? AND business_date=?', ctx.org_id, br.id, date).n;
    const id = ctx.run('INSERT INTO barber_queue(org_id,branch_id,ticket,customer_name,phone,service_id,barber_id,created_by,created_at,business_date) VALUES(?,?,?,?,?,?,?,?,?,?)',
      ctx.org_id, br.id, ticket, b.customer_name ? String(b.customer_name).slice(0, 80) : null, b.phone ? String(b.phone).slice(0, 30) : null, b.service_id || null, b.barber_id || null, ctx.user.id, nowIso(), date).lastInsertRowid;
    ctx.audit('queue.add', 'barber_queue', id, null, { ticket }, br.id); return { id, ticket };
  });
}

export function startTicket(ctx, id, { barber_id } = {}) {
  if (!canSee(ctx)) throw forbidden('Not permitted', 'missing_permission');
  const q = ticketOf(ctx, id); if (q.status !== 'waiting') throw new AppError(409, 'ticket_not_waiting', 'This customer is not waiting any more');
  const barber = canDesk(ctx) ? Number(barber_id || q.barber_id || ctx.user.id) : ctx.user.id;
  // a barber may take an unassigned customer or one who asked for them, never another barber's customer
  if (!canDesk(ctx) && q.barber_id && q.barber_id !== ctx.user.id) throw forbidden('This customer is waiting for another barber', 'own_only');
  if (!ctx.get('SELECT 1 x FROM user_branches WHERE user_id=? AND branch_id=?', barber, q.branch_id)) throw bad('invalid_barber', 'Barber is not assigned to this branch');
  ctx.tx(() => { ctx.run("UPDATE barber_queue SET status='serving', barber_id=?, started_at=? WHERE id=? AND status='waiting'", barber, nowIso(), q.id); ctx.audit('queue.start', 'barber_queue', q.id, null, { ticket: q.ticket, barber_id: barber }, q.branch_id); }); return { ok: true };
}

// Finish = record the visit with the payment, like Barber visits. The price can be confirmed or another service chosen.
export function finishTicket(ctx, id, b = {}) {
  if (!canDesk(ctx)) throw forbidden('Only the front desk records the visit and takes the payment', 'missing_permission');
  const q = ticketOf(ctx, id); if (q.status !== 'serving') throw new AppError(409, 'ticket_not_serving', 'Start the service first');
  const serviceId = Number(b.service_id || q.service_id); if (!serviceId) throw bad('service_required', 'Choose the service that was done');
  return ctx.tx(() => {
    // no discount here: a discount above the desk's limit would need approval and leave the ticket open (use Barber visits for that)
    const sale = createSale(ctx, { branch_id: q.branch_id, kind: 'service', customer_id: b.customer_id || undefined, customer_name: q.customer_name || undefined, tip: b.tip ? int(b.tip, 'tip', { min: 0 }) : undefined,
      lines: [{ service_id: serviceId, barber_id: q.barber_id, qty: 1 }, ...(b.extra_service_ids || []).map((s) => ({ service_id: Number(s), barber_id: q.barber_id }))], payments: b.payments || [] });
    ctx.run("UPDATE barber_queue SET status='done', finished_at=?, sale_id=?, service_id=? WHERE id=?", nowIso(), sale.id, serviceId, q.id);
    return sale;
  });
}
export function leaveQueue(ctx, id) {
  const q = ticketOf(ctx, id); if (!['waiting', 'serving'].includes(q.status)) throw new AppError(409, 'ticket_closed', 'This ticket is already closed');
  // only the desk closes a customer who is already in the chair (they may have been served and must pay)
  if (!canDesk(ctx) && !(mine(ctx, q) && q.status === 'waiting')) throw forbidden('Not permitted', 'missing_permission');
  ctx.tx(() => { ctx.run("UPDATE barber_queue SET status='left', finished_at=? WHERE id=?", nowIso(), q.id); ctx.audit('queue.left', 'barber_queue', q.id, { status: q.status }, { ticket: q.ticket }, q.branch_id); }); return { ok: true };
}
