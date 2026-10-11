// Reporting. ONE definition of every metric (branchMetrics); dashboard, branch comparison, consolidated and
// exports all derive from it, so totals always agree. Revenue, cash collected and profit are distinct metrics.
//   net_sales        = line net (excl. tax, after discounts) - returns net            [retail + services]
//   repair_revenue   = approved repair charges on jobs completed in the period
//   cogs             = cost of items sold (+ service consumables) - cost reversed on restocked returns
//   repair_direct    = spare-part cost consumed + other direct repair cost
//   gross_profit     = net_sales + repair_revenue - cogs - repair_direct
//   commission       = SUM(earned_delta) of the commission ledger (accrual; payouts are NOT expenses)
//   opex             = approved expense allocations
//   net_profit       = gross_profit - commission - opex
import { AppError, bad } from './errors.js';
import { nowIso, localDate, range, addDays } from './time.js';
import { barberReport, barberDaily } from './commissions.js';
import { inTransitValue } from './inventory.js';
import { customerBalance } from './sales.js';

export function resolveFilters(ctx, f = {}) {
  const ids = ctx.branchIds(); let branches = ids;
  if (f.branch_ids) branches = String(f.branch_ids).split(',').map(Number).filter((x) => ids.includes(x));
  if (f.branch_id) { ctx.branch(f.branch_id); branches = [Number(f.branch_id)]; }
  const rows = ctx.all(`SELECT b.id,b.name,b.currency,b.business_id,b.timezone,bu.name business_name,bu.type btype FROM branches b JOIN businesses bu ON bu.id=b.business_id WHERE b.org_id=? AND b.id IN (${branches.join(',') || 0})`, ctx.org_id)
    .filter((b) => (!f.business_id || b.business_id === Number(f.business_id)) && (!f.business_type || b.btype === f.business_type));
  const today = rows.length ? localDate(nowIso(), rows[0].timezone) : localDate(nowIso());
  const [from, to] = range(f.preset, f.from, f.to, today);
  let employee = f.employee_id ? Number(f.employee_id) : null;
  const restricted = !ctx.can('sales.viewall') && !ctx.can('services.viewall') && !ctx.can('repairs.viewall');
  if (restricted) employee = ctx.user.id; // barbers / technicians only ever see their own numbers
  return { branches: rows, from, to, employee, restricted, today };
}

export function branchMetrics(ctx, b, { from, to, employee }) {
  const m = { branch_id: b.id, branch: b.name, business: b.business_name, business_id: b.business_id, currency: b.currency };
  const empSale = employee ? ` AND ((s.kind='retail' AND s.user_id=${employee}) OR l.barber_id=${employee})` : '';
  const lines = ctx.all(`SELECT s.kind, COALESCE(SUM(l.net),0) net, COALESCE(SUM(l.cost_total),0) cost, COALESCE(SUM(l.discount),0) disc, COALESCE(SUM(l.qty),0) qty FROM sales s JOIN sale_lines l ON l.sale_id=s.id
    WHERE s.branch_id=? AND s.status='completed' AND s.business_date BETWEEN ? AND ?${empSale} GROUP BY s.kind`, b.id, from, to);
  const L = (k) => lines.find((x) => x.kind === k) || { net: 0, cost: 0, disc: 0, qty: 0 };
  const counts = ctx.all(`SELECT s.kind, COUNT(DISTINCT s.id) n FROM sales s JOIN sale_lines l ON l.sale_id=s.id WHERE s.branch_id=? AND s.status='completed' AND s.business_date BETWEEN ? AND ?${empSale} GROUP BY s.kind`, b.id, from, to);
  const C = (k) => (counts.find((x) => x.kind === k) || { n: 0 }).n;
  const empRet = employee ? ` AND ((s.kind='retail' AND s.user_id=${employee}) OR l.barber_id=${employee})` : '';
  const rets = ctx.get(`SELECT COALESCE(SUM(rl.net),0) net, COALESCE(SUM(rl.cost_reversed),0) cost FROM return_lines rl JOIN returns r ON r.id=rl.return_id JOIN sale_lines l ON l.id=rl.sale_line_id JOIN sales s ON s.id=l.sale_id WHERE r.branch_id=? AND r.business_date BETWEEN ? AND ?${empRet}`, b.id, from, to);
  const empRep = employee ? ` AND j.technician_id=${employee}` : '';
  const rep = ctx.get(`SELECT COALESCE(SUM(c.qty*c.unit_price),0) rev, COALESCE(SUM(c.cost_total),0) parts FROM repair_jobs j JOIN repair_charges c ON c.job_id=j.id AND c.approved=1 AND c.voided=0 WHERE j.branch_id=? AND j.status IN ('completed','delivered') AND j.revenue_date BETWEEN ? AND ?${empRep}`, b.id, from, to);
  const repOther = ctx.get(`SELECT COALESCE(SUM(j.other_direct_cost),0) o, COUNT(*) n FROM repair_jobs j WHERE j.branch_id=? AND j.status IN ('completed','delivered') AND j.revenue_date BETWEEN ? AND ?${empRep}`, b.id, from, to);
  const com = ctx.get(`SELECT COALESCE(SUM(earned_delta),0) e FROM commission_ledger WHERE branch_id=? AND business_date BETWEEN ? AND ?${employee ? ' AND employee_id=' + employee : ''}`, b.id, from, to).e;
  const opex = employee ? 0 : ctx.get("SELECT COALESCE(SUM(a.amount),0) o FROM expense_allocations a JOIN expenses e ON e.id=a.expense_id WHERE a.branch_id=? AND e.status='approved' AND e.expense_date BETWEEN ? AND ?", b.id, from, to).o;
  const pay = ctx.get(`SELECT COALESCE(SUM(CASE WHEN direction='in' THEN amount ELSE 0 END),0) cin, COALESCE(SUM(CASE WHEN direction='out' THEN amount ELSE 0 END),0) cout FROM payments WHERE branch_id=? AND status='confirmed' AND party_type IN ('sale','repair') AND business_date BETWEEN ? AND ?${employee ? ' AND user_id=' + employee : ''}`, b.id, from, to);
  Object.assign(m, {
    retail_sales: L('retail').net, service_revenue: L('service').net, returns: rets.net, discounts: L('retail').disc + L('service').disc,
    net_sales: L('retail').net + L('service').net - rets.net, repair_revenue: rep.rev, total_revenue: L('retail').net + L('service').net - rets.net + rep.rev,
    cogs: L('retail').cost + L('service').cost - rets.cost, repair_parts_cost: rep.parts, repair_other_cost: repOther.o,
    sales_count: C('retail'), visits: C('service'), services_count: L('service').qty, repairs_completed: repOther.n,
    collected_in: pay.cin, refunds_paid: pay.cout, collected: pay.cin - pay.cout, commission: com, opex,
  });
  m.gross_profit = m.total_revenue - m.cogs - m.repair_parts_cost - m.repair_other_cost;
  m.net_profit = m.gross_profit - m.commission - m.opex;
  m.retained_after_commission = m.service_revenue - ctx.get(`SELECT COALESCE(SUM(c.earned_delta),0) e FROM commission_ledger c WHERE c.branch_id=? AND c.source_type='sale_line' AND c.business_date BETWEEN ? AND ?${employee ? ' AND c.employee_id=' + employee : ''}`, b.id, from, to).e;
  return m;
}
const SUM_KEYS = ['retail_sales', 'service_revenue', 'returns', 'discounts', 'net_sales', 'repair_revenue', 'total_revenue', 'cogs', 'repair_parts_cost', 'repair_other_cost', 'sales_count', 'visits', 'services_count', 'repairs_completed', 'collected_in', 'refunds_paid', 'collected', 'commission', 'opex', 'gross_profit', 'net_profit', 'retained_after_commission'];

function positions(ctx, b) { // point-in-time balances (not date-ranged)
  const ar = ctx.get("SELECT COALESCE(SUM(total-returned_total-paid),0) a FROM sales WHERE branch_id=? AND status='completed'", b.id).a;
  let rep = 0; for (const j of ctx.all("SELECT id FROM repair_jobs WHERE branch_id=? AND status IN ('completed','delivered')", b.id)) rep += ctx.get('SELECT COALESCE(SUM(qty*unit_price),0) t FROM repair_charges WHERE job_id=? AND approved=1 AND voided=0', j.id).t - ctx.get("SELECT COALESCE(SUM(CASE direction WHEN 'in' THEN amount ELSE -amount END),0) n FROM payments WHERE party_type='repair' AND party_id=? AND status='confirmed'", j.id).n;
  const ap = ctx.get("SELECT COALESCE(SUM(billed-paid),0) a FROM purchases WHERE branch_id=? AND status<>'cancelled'", b.id).a;
  const inv = ctx.get('SELECT COALESCE(SUM(value),0) v, COALESCE(SUM(qty),0) q FROM stock WHERE branch_id=?', b.id);
  const low = ctx.get('SELECT COUNT(*) c FROM stock s JOIN variants v ON v.id=s.variant_id WHERE s.branch_id=? AND v.active=1 AND v.min_stock>0 AND s.qty<=v.min_stock AND s.qty>0', b.id).c;
  const out = ctx.get('SELECT COUNT(*) c FROM stock s JOIN variants v ON v.id=s.variant_id WHERE s.branch_id=? AND v.active=1 AND s.qty=0', b.id).c;
  const bal = {};
  for (const k of ['cash', 'mobile', 'bank', 'card']) {
    const opening = ctx.get('SELECT COALESCE(SUM(a.opening_balance),0) o FROM branch_accounts a JOIN payment_methods m ON m.id=a.method_id WHERE a.branch_id=? AND m.kind=?', b.id, k).o;
    const flow = ctx.get("SELECT COALESCE(SUM(CASE direction WHEN 'in' THEN amount ELSE -amount END),0) f FROM payments WHERE branch_id=? AND method_kind=? AND status='confirmed'", b.id, k).f;
    const exp = ctx.get("SELECT COALESCE(SUM(a.amount),0) e FROM expenses e JOIN expense_allocations a ON a.expense_id=e.id WHERE e.scope='branch' AND a.branch_id=? AND e.method_kind=? AND e.status='approved'", b.id, k).e;
    const mv = k === 'cash' ? ctx.get('SELECT COALESCE(SUM(c.amount),0) m FROM cash_movements c JOIN register_sessions s ON s.id=c.session_id WHERE s.branch_id=?', b.id).m : 0;
    bal[k] = opening + flow - exp + mv;
  }
  const rj = ctx.all("SELECT status, COUNT(*) n FROM repair_jobs WHERE branch_id=? GROUP BY status", b.id);
  return { receivables: ar + rep, payables: ap, inventory_value: inv.v, inventory_qty: inv.q, low_stock: low, out_of_stock: out, balances: bal, repairs_by_status: Object.fromEntries(rj.map((r) => [r.status, r.n])) };
}

export function dashboard(ctx, f = {}) {
  ctx.need('dashboard.view'); const r = resolveFilters(ctx, f);
  const perBranch = r.branches.map((b) => ({ ...branchMetrics(ctx, b, r), ...(r.restricted ? {} : positions(ctx, b)) }));
  const byCcy = {};
  for (const m of perBranch) {
    const t = (byCcy[m.currency] ||= { currency: m.currency, balances: { cash: 0, mobile: 0, bank: 0, card: 0 }, repairs_by_status: {}, ...Object.fromEntries(SUM_KEYS.map((k) => [k, 0])), receivables: 0, payables: 0, inventory_value: 0, low_stock: 0, out_of_stock: 0 });
    for (const k of SUM_KEYS) t[k] += m[k];
    if (!r.restricted) { for (const k of ['receivables', 'payables', 'inventory_value', 'low_stock', 'out_of_stock']) t[k] += m[k]; for (const k of Object.keys(t.balances)) t.balances[k] += m.balances[k]; for (const [s, n] of Object.entries(m.repairs_by_status)) t.repairs_by_status[s] = (t.repairs_by_status[s] || 0) + n; }
  }
  if (!r.restricted) for (const c of Object.values(byCcy)) c.in_transit_value = inTransitValue(ctx, r.branches.filter((b) => b.currency === c.currency).map((b) => b.id));
  // optional conversion to the reporting currency using stored rates
  const org = ctx.get('SELECT reporting_currency FROM orgs WHERE id=?', ctx.org_id); let converted = null;
  if (Object.keys(byCcy).length > 1) {
    converted = { currency: org.reporting_currency, missing: [], totals: Object.fromEntries(['net_sales', 'repair_revenue', 'gross_profit', 'commission', 'opex', 'net_profit', 'collected'].map((k) => [k, 0])) };
    for (const c of Object.values(byCcy)) {
      if (c.currency === org.reporting_currency) { for (const k of Object.keys(converted.totals)) converted.totals[k] += c[k]; continue; }
      const fx = ctx.get('SELECT rate_ppm FROM exchange_rates WHERE org_id=? AND from_ccy=? AND to_ccy=? AND effective_date<=? ORDER BY effective_date DESC LIMIT 1', ctx.org_id, c.currency, org.reporting_currency, r.to);
      if (!fx) { converted.missing.push(c.currency); continue; }
      for (const k of Object.keys(converted.totals)) converted.totals[k] += Math.round((c[k] * fx.rate_ppm) / 1e6);
    }
  }
  // employee performance + approvals + activity
  const emp = employeePerformance(ctx, r);
  const bsql = ctx.inBranches('branch_id');
  const pending = ctx.get(`SELECT COUNT(*) c FROM approvals WHERE org_id=? AND status='pending' AND (branch_id IS NULL OR ${bsql.sql})`, ctx.org_id).c;
  const activity = r.restricted ? [] : ctx.all(`SELECT a.id,a.action,a.entity,a.entity_id,a.created_at,u.name user_name,a.branch_id FROM audit_log a LEFT JOIN users u ON u.id=a.user_id WHERE a.org_id=? AND (a.branch_id IS NULL OR a.branch_id IN (${r.branches.map((b) => b.id).join(',') || 0})) ORDER BY a.id DESC LIMIT 12`, ctx.org_id);
  const out = { filters: { from: r.from, to: r.to, employee: r.employee, branches: r.branches.map((b) => b.id) }, currencies: Object.values(byCcy), converted, branches: perBranch, employees: emp, pending_approvals: pending, activity, series: dailySeries(ctx, r) };
  return sanitize(ctx, out);
}
function sanitize(ctx, out) {
  const hide = (obj, keys) => keys.forEach((k) => delete obj[k]);
  const noProfit = !ctx.can('profit.view'), noCost = !ctx.can('cost.view'), noCom = !ctx.can('commissions.viewall');
  const fix = (m) => {
    if (noProfit) hide(m, ['gross_profit', 'net_profit', 'opex', 'repair_other_cost', 'retained_after_commission']);
    if (noCost) hide(m, ['cogs', 'repair_parts_cost', 'inventory_value', 'in_transit_value']);
    if (noCom && !out.filters.employee) hide(m, ['commission']);
  };
  out.currencies.forEach(fix); out.branches.forEach(fix); if (out.converted) { if (noProfit) hide(out.converted.totals, ['gross_profit', 'net_profit', 'opex']); if (noCom) hide(out.converted.totals, ['commission']); }
  if (noCom) out.employees.forEach((e) => hide(e, ['commission']));
  if (noProfit) out.series.forEach((s) => hide(s, ['expenses']));
  return out;
}
export function dailySeries(ctx, r) {
  const ids = r.branches.map((b) => b.id).join(',') || '0'; const days = {};
  const add = (d, ccy, k, v) => { const key = d + '|' + ccy; (days[key] ||= { date: d, currency: ccy, net_sales: 0, collected: 0, expenses: 0 })[k] += v; };
  const emp = r.employee;
  for (const x of ctx.all(`SELECT s.business_date d, s.currency c, SUM(l.net) v FROM sales s JOIN sale_lines l ON l.sale_id=s.id WHERE s.branch_id IN (${ids}) AND s.status='completed' AND s.business_date BETWEEN ? AND ?${emp ? ` AND ((s.kind='retail' AND s.user_id=${emp}) OR l.barber_id=${emp})` : ''} GROUP BY 1,2`, r.from, r.to)) add(x.d, x.c, 'net_sales', x.v);
  for (const x of ctx.all(`SELECT r.business_date d, b.currency c, SUM(rl.net) v FROM return_lines rl JOIN returns r ON r.id=rl.return_id JOIN branches b ON b.id=r.branch_id JOIN sale_lines l ON l.id=rl.sale_line_id JOIN sales s ON s.id=l.sale_id WHERE r.branch_id IN (${ids}) AND r.business_date BETWEEN ? AND ?${emp ? ` AND ((s.kind='retail' AND s.user_id=${emp}) OR l.barber_id=${emp})` : ''} GROUP BY 1,2`, r.from, r.to)) add(x.d, x.c, 'net_sales', -x.v);
  for (const x of ctx.all(`SELECT j.revenue_date d, j.currency c, SUM(ch.qty*ch.unit_price) v FROM repair_jobs j JOIN repair_charges ch ON ch.job_id=j.id AND ch.approved=1 AND ch.voided=0 WHERE j.branch_id IN (${ids}) AND j.status IN ('completed','delivered') AND j.revenue_date BETWEEN ? AND ?${emp ? ` AND j.technician_id=${emp}` : ''} GROUP BY 1,2`, r.from, r.to)) add(x.d, x.c, 'net_sales', x.v);
  for (const x of ctx.all(`SELECT business_date d, currency c, SUM(CASE direction WHEN 'in' THEN amount ELSE -amount END) v FROM payments WHERE branch_id IN (${ids}) AND status='confirmed' AND party_type IN ('sale','repair') AND business_date BETWEEN ? AND ?${emp ? ` AND user_id=${emp}` : ''} GROUP BY 1,2`, r.from, r.to)) add(x.d, x.c, 'collected', x.v);
  if (!emp) for (const x of ctx.all(`SELECT e.expense_date d, e.currency c, SUM(a.amount) v FROM expenses e JOIN expense_allocations a ON a.expense_id=e.id WHERE a.branch_id IN (${ids}) AND e.status='approved' AND e.expense_date BETWEEN ? AND ? GROUP BY 1,2`, r.from, r.to)) add(x.d, x.c, 'expenses', x.v);
  return Object.values(days).sort((a, b) => a.date.localeCompare(b.date));
}
export function employeePerformance(ctx, r) {
  const ids = r.branches.map((b) => b.id).join(',') || '0'; const rows = {};
  const row = (id, name, ccy) => (rows[id + ccy] ||= { employee_id: id, employee: name, currency: ccy, sales: 0, visits: 0, services: 0, revenue: 0, commission: 0, repairs: 0 });
  for (const x of ctx.all(`SELECT s.user_id id, u.name, s.currency c, COUNT(*) n, SUM(s.total-s.tax) rev FROM sales s JOIN users u ON u.id=s.user_id WHERE s.kind='retail' AND s.status='completed' AND s.branch_id IN (${ids}) AND s.business_date BETWEEN ? AND ?${r.employee ? ' AND s.user_id=' + r.employee : ''} GROUP BY 1,3`, r.from, r.to)) { const o = row(x.id, x.name, x.c); o.sales += x.n; o.revenue += x.rev; }
  for (const x of ctx.all(`SELECT l.barber_id id, u.name, s.currency c, COUNT(DISTINCT s.id) v, SUM(l.qty) q, SUM(l.net) rev FROM sale_lines l JOIN sales s ON s.id=l.sale_id JOIN users u ON u.id=l.barber_id WHERE s.status='completed' AND l.barber_id IS NOT NULL AND s.branch_id IN (${ids}) AND s.business_date BETWEEN ? AND ?${r.employee ? ' AND l.barber_id=' + r.employee : ''} GROUP BY 1,3`, r.from, r.to)) { const o = row(x.id, x.name, x.c); o.visits += x.v; o.services += x.q; o.revenue += x.rev; }
  for (const x of ctx.all(`SELECT j.technician_id id, u.name, j.currency c, COUNT(*) n, SUM((SELECT COALESCE(SUM(qty*unit_price),0) FROM repair_charges WHERE job_id=j.id AND approved=1 AND voided=0)) rev FROM repair_jobs j JOIN users u ON u.id=j.technician_id WHERE j.status IN ('completed','delivered') AND j.branch_id IN (${ids}) AND j.revenue_date BETWEEN ? AND ?${r.employee ? ' AND j.technician_id=' + r.employee : ''} GROUP BY 1,3`, r.from, r.to)) { const o = row(x.id, x.name, x.c); o.repairs += x.n; o.revenue += x.rev; }
  for (const o of Object.values(rows)) o.commission = ctx.get(`SELECT COALESCE(SUM(earned_delta),0) e FROM commission_ledger WHERE employee_id=? AND branch_id IN (${ids}) AND business_date BETWEEN ? AND ?`, o.employee_id, r.from, r.to).e;
  return Object.values(rows).sort((a, b) => b.revenue - a.revenue);
}

// ---------- Tabular reports (shared by screen, CSV, PDF, print) ----------
const M = 'money'; const col = (key, label, type) => ({ key, label, type });
export const REPORTS = {
  consolidated: { perm: 'reports.view', title: 'Consolidated owner report' },
  branch_performance: { perm: 'reports.view', title: 'Business and branch performance' },
  sales_revenue: { perm: 'reports.view', title: 'Sales and service revenue (daily)' },
  profit: { perm: 'reports.view', title: 'Gross and net profit', needs: 'profit.view' },
  expenses_by_category: { perm: 'expenses.view', title: 'Expenses by category' },
  receivables: { perm: 'customers.view', title: 'Customer receivables' },
  payables: { perm: 'suppliers.view', title: 'Supplier payables' },
  inventory_valuation: { perm: 'inventory.view', title: 'Inventory valuation', needs: 'cost.view' },
  low_stock: { perm: 'inventory.view', title: 'Low-stock report' },
  stock_movement: { perm: 'inventory.view', title: 'Stock movement' },
  transfers: { perm: 'inventory.view', title: 'Stock transfers' },
  repairs: { perm: 'repairs.view', title: 'Repair status and profitability' },
  employee_performance: { perm: 'reports.view', title: 'Employee performance' },
  barber_commissions: { perm: 'commissions.view', title: 'Barber commissions and payouts' },
  barber_daily: { perm: 'commissions.view', title: 'Barber daily work sheet' },
  barber_branch_profit: { perm: 'reports.view', title: 'Barber branch profit statement', needs: 'profit.view' },
  cash_discrepancies: { perm: 'registers.view', title: 'Cash register discrepancies' },
  payment_reconciliation: { perm: 'payments.view', title: 'Payment reconciliation' },
  audit: { perm: 'audit.view', title: 'Audit activity' },
};
export function runReport(ctx, name, f = {}) {
  const def = REPORTS[name]; if (!def) throw bad('unknown_report', 'Unknown report'); ctx.need(def.perm); if (def.needs) ctx.need(def.needs);
  const r = resolveFilters(ctx, f); const ids = r.branches.map((b) => b.id).join(',') || '0'; let columns, rows, totals = null, note = null;
  const meta = () => ({ title: def.title, from: r.from, to: r.to, company: ctx.get('SELECT name FROM orgs WHERE id=?', ctx.org_id).name, generated_at: nowIso(), generated_by: ctx.user.name, filters: { branch_ids: r.branches.map((b) => b.name), employee: r.employee }, reporting: 'Amounts in each branch currency; totals are never mixed across currencies' });
  const money = (keys) => keys.map(([k, l]) => col(k, l, M));
  switch (name) {
    case 'consolidated': case 'branch_performance': {
      const per = r.branches.map((b) => branchMetrics(ctx, b, r)); const canP = ctx.can('profit.view'), canC = ctx.can('cost.view');
      columns = [col('business', 'Business'), col('branch', 'Branch'), col('currency', 'Currency'), ...money([['net_sales', 'Net sales'], ['repair_revenue', 'Repair revenue'], ['collected', 'Collected']]), ...(canC ? money([['cogs', 'COGS']]) : []), ...(canP ? money([['gross_profit', 'Gross profit'], ['commission', 'Commission'], ['opex', 'Operating expenses'], ['net_profit', 'Net profit']]) : [])];
      rows = per; totals = totalsBy(per, columns); break;
    }
    case 'sales_revenue': { columns = [col('date', 'Date'), col('currency', 'Currency'), ...money([['net_sales', 'Net revenue'], ['collected', 'Collected']])]; rows = dailySeries(ctx, r); break; }
    case 'profit': { const per = r.branches.map((b) => branchMetrics(ctx, b, r)); columns = [col('branch', 'Branch'), col('currency', 'Currency'), ...money([['net_sales', 'Net sales'], ['repair_revenue', 'Repair revenue'], ['cogs', 'COGS'], ['repair_parts_cost', 'Repair parts'], ['repair_other_cost', 'Other direct'], ['gross_profit', 'Gross profit'], ['commission', 'Commission'], ['opex', 'Operating exp.'], ['net_profit', 'Net profit']])]; rows = per; totals = totalsBy(per, columns); break; }
    case 'expenses_by_category': { columns = [col('category', 'Category'), col('currency', 'Currency'), col('count', 'Count'), col('amount', 'Amount', M)]; rows = ctx.all(`SELECT c.name category, e.currency, COUNT(DISTINCT e.id) count, SUM(a.amount) amount FROM expenses e JOIN expense_categories c ON c.id=e.category_id JOIN expense_allocations a ON a.expense_id=e.id WHERE a.branch_id IN (${ids}) AND e.status='approved' AND e.expense_date BETWEEN ? AND ? GROUP BY c.name, e.currency ORDER BY amount DESC`, r.from, r.to); break; }
    case 'receivables': { columns = [col('customer', 'Customer'), col('phone', 'Phone'), col('currency', 'Currency'), col('balance', 'Outstanding', M)]; rows = ctx.all(`SELECT c.name customer, c.phone, s.currency, SUM(s.total-s.returned_total-s.paid) balance FROM sales s JOIN customers c ON c.id=s.customer_id WHERE s.branch_id IN (${ids}) AND s.status='completed' GROUP BY c.id, s.currency HAVING balance<>0 ORDER BY balance DESC`); break; }
    case 'payables': { columns = [col('supplier', 'Supplier'), col('currency', 'Currency'), col('billed', 'Billed', M), col('paid', 'Paid', M), col('balance', 'Outstanding', M)]; rows = ctx.all(`SELECT s.name supplier, p.currency, SUM(p.billed) billed, SUM(p.paid) paid, SUM(p.billed-p.paid) balance FROM purchases p JOIN suppliers s ON s.id=p.supplier_id WHERE p.branch_id IN (${ids}) AND p.status<>'cancelled' GROUP BY s.id, p.currency HAVING balance<>0 ORDER BY balance DESC`); break; }
    case 'inventory_valuation': { columns = [col('branch', 'Branch'), col('sku', 'SKU'), col('name', 'Product'), col('qty', 'Qty'), col('avg_cost', 'Avg cost', M), col('value', 'Value', M), col('currency', 'Currency')]; rows = ctx.all(`SELECT b.name branch, v.sku, p.name, s.qty, CASE WHEN s.qty>0 THEN s.value/s.qty ELSE 0 END avg_cost, s.value, b.currency FROM stock s JOIN variants v ON v.id=s.variant_id JOIN products p ON p.id=v.product_id JOIN branches b ON b.id=s.branch_id WHERE s.branch_id IN (${ids}) AND s.qty>0 ORDER BY b.name,p.name`); totals = totalsBy(rows, columns, ['value']); break; }
    case 'low_stock': { columns = [col('branch', 'Branch'), col('sku', 'SKU'), col('name', 'Product'), col('qty', 'On hand'), col('min_stock', 'Minimum')]; rows = ctx.all(`SELECT b.name branch, v.sku, p.name || ' ' || v.attrs name, COALESCE(s.qty,0) qty, v.min_stock FROM branches b JOIN variants v ON v.org_id=b.org_id JOIN products p ON p.id=v.product_id AND p.business_id=b.business_id LEFT JOIN stock s ON s.branch_id=b.id AND s.variant_id=v.id WHERE b.id IN (${ids}) AND v.active=1 AND p.active=1 AND p.kind='standard' AND COALESCE(s.qty,0)<=v.min_stock ORDER BY qty,b.name`); break; }
    case 'stock_movement': { columns = [col('created_at', 'Date'), col('branch', 'Branch'), col('sku', 'SKU'), col('type', 'Type'), col('qty', 'Qty'), ...(ctx.can('cost.view') ? [col('value', 'Value', M)] : []), col('user', 'User')]; rows = ctx.all(`SELECT m.created_at, b.name branch, v.sku, m.type, m.qty, m.value, u.name user FROM stock_movements m JOIN branches b ON b.id=m.branch_id JOIN variants v ON v.id=m.variant_id LEFT JOIN users u ON u.id=m.user_id WHERE m.branch_id IN (${ids}) AND substr(m.created_at,1,10) BETWEEN ? AND ? ORDER BY m.id DESC LIMIT 5000`, addDays(r.from, -1), addDays(r.to, 1)); break; }
    case 'transfers': { columns = [col('ref', 'Ref'), col('created_at', 'Date'), col('from_name', 'From'), col('to_name', 'To'), col('status', 'Status'), col('items', 'Units'), col('in_transit', 'In transit')]; rows = ctx.all(`SELECT t.ref, t.created_at, f.name from_name, b.name to_name, t.status, (SELECT SUM(qty) FROM transfer_lines WHERE transfer_id=t.id) items, (SELECT SUM(qty-qty_received) FROM transfer_lines WHERE transfer_id=t.id) in_transit FROM transfers t JOIN branches f ON f.id=t.from_branch_id JOIN branches b ON b.id=t.to_branch_id WHERE (t.from_branch_id IN (${ids}) OR t.to_branch_id IN (${ids})) AND substr(t.created_at,1,10) BETWEEN ? AND ? ORDER BY t.id DESC`, r.from, r.to); break; }
    case 'repairs': {
      const canP = ctx.can('profit.view'); columns = [col('ref', 'Job'), col('status', 'Status'), col('customer_name', 'Customer'), col('technician', 'Technician'), col('currency', 'Currency'), col('revenue', 'Revenue', M), ...(canP ? [col('parts_cost', 'Parts cost', M), col('commission', 'Commission', M), col('other', 'Other direct', M), col('contribution', 'Contribution', M)] : []), col('collected', 'Collected', M), col('balance', 'Balance', M)];
      const js = ctx.all(`SELECT j.*, u.name technician FROM repair_jobs j LEFT JOIN users u ON u.id=j.technician_id WHERE j.branch_id IN (${ids}) AND j.business_date BETWEEN ? AND ?${r.employee ? ' AND j.technician_id=' + r.employee : ''} ORDER BY j.id DESC LIMIT 2000`, r.from, r.to);
      rows = js.map((j) => { const t = ctx.get('SELECT COALESCE(SUM(qty*unit_price),0) rev, COALESCE(SUM(cost_total),0) parts FROM repair_charges WHERE job_id=? AND approved=1 AND voided=0', j.id); const com = ctx.get("SELECT COALESCE(SUM(earned_delta),0) e FROM commission_ledger WHERE source_type='repair' AND source_id=?", j.id).e; const col_ = ctx.get("SELECT COALESCE(SUM(CASE direction WHEN 'in' THEN amount ELSE -amount END),0) n FROM payments WHERE party_type='repair' AND party_id=? AND status='confirmed'", j.id).n; return { ref: j.ref, status: j.status, customer_name: j.customer_name, technician: j.technician, currency: j.currency, revenue: t.rev, parts_cost: t.parts, commission: com, other: j.other_direct_cost, contribution: t.rev - t.parts - com - j.other_direct_cost, collected: col_, balance: t.rev - col_ }; });
      totals = totalsBy(rows, columns, ['revenue', 'parts_cost', 'commission', 'other', 'contribution', 'collected', 'balance']); break;
    }
    case 'employee_performance': { columns = [col('employee', 'Employee'), col('currency', 'Currency'), col('sales', 'Sales'), col('visits', 'Visits'), col('services', 'Services'), col('repairs', 'Repairs'), col('revenue', 'Revenue', M), ...(ctx.can('commissions.viewall') ? [col('commission', 'Commission', M)] : [])]; rows = employeePerformance(ctx, r); break; }
    case 'barber_commissions': {
      columns = [col('employee', 'Barber'), col('currency', 'Currency'), col('visits', 'Visits'), col('services', 'Services'), col('revenue', 'Revenue', M), col('discounts', 'Discounts', M), col('refunds', 'Refunds', M), col('net_revenue', 'Net revenue', M), col('rates', 'Rate %'), col('tips', 'Tips', M), col('commission_earned', 'Commission', M), col('commission_payable', 'Payable', M), col('advances', 'Advances', M), col('deductions', 'Deductions', M), col('paid', 'Paid', M), col('outstanding', 'Outstanding', M), col('retained', 'Retained by business', M)];
      rows = barberReport(ctx, { branch_id: f.branch_id, business_id: f.business_id, employee_id: f.employee_id, from: r.from, to: r.to }).map((x) => ({ ...x, rates: x.rates_bp.map((b) => b / 100).join('/') })); totals = totalsBy(rows, columns); break;
    }
    case 'barber_daily': {
      columns = [col('date', 'Date'), col('employee', 'Barber'), col('currency', 'Currency'), col('visits', 'Customers served'), col('services', 'Services'), col('income', 'Income generated', M), col('refunds', 'Refunds', M), col('net_income', 'Net income', M), col('rates', 'Rate %'), col('commission', 'Commission', M), col('advances', 'Advances', M), col('deductions', 'Deductions', M), col('take_home', 'Take-home', M), col('retained', 'Retained by business', M), col('tips', 'Tips', M)];
      const d = barberDaily(ctx, { branch_id: f.branch_id, business_id: f.business_id, employee_id: f.employee_id, from: r.from, to: r.to }); rows = d.rows.map((x) => ({ ...x, rates: x.rates_bp.map((b) => b / 100).join('/') })); totals = totalsBy(rows, columns); break;
    }
    case 'barber_branch_profit': {
      columns = [col('branch', 'Branch'), col('item', 'Item'), col('currency', 'Currency'), col('count', 'Count'), col('amount', 'Amount', M)]; rows = [];
      for (const b of r.branches.filter((x) => x.btype === 'barber' || ctx.get("SELECT 1 x FROM departments WHERE branch_id=? AND kind='barber'", x.id))) rows.push(...barberProfitLines(ctx, b, r));
      break;
    }
    case 'cash_discrepancies': { columns = [col('business_date', 'Date'), col('branch', 'Branch'), col('cashier', 'Cashier'), col('expected', 'Expected', M), col('counted', 'Counted', M), col('difference', 'Difference', M), col('explanation', 'Explanation'), col('approved', 'Approved by')]; rows = ctx.all(`SELECT r.business_date, b.name branch, u.name cashier, r.expected, r.counted, r.difference, r.explanation, a.name approved FROM register_sessions r JOIN branches b ON b.id=r.branch_id JOIN users u ON u.id=r.opened_by LEFT JOIN users a ON a.id=r.approved_by WHERE r.branch_id IN (${ids}) AND r.status='closed' AND r.difference<>0 AND r.business_date BETWEEN ? AND ? ORDER BY r.id DESC`, r.from, r.to).map((x) => ({ ...x, currency: '' })); break; }
    case 'payment_reconciliation': { columns = [col('method_kind', 'Method'), col('status', 'Status'), col('currency', 'Currency'), col('n', 'Count'), col('received', 'Received', M), col('paid_out', 'Paid out', M), col('unreconciled', 'Unreconciled', M)]; rows = ctx.all(`SELECT method_kind, status, currency, COUNT(*) n, SUM(CASE WHEN direction='in' THEN amount ELSE 0 END) received, SUM(CASE WHEN direction='out' THEN amount ELSE 0 END) paid_out, SUM(CASE WHEN reconciled_at IS NULL AND status='confirmed' THEN CASE direction WHEN 'in' THEN amount ELSE -amount END ELSE 0 END) unreconciled FROM payments WHERE branch_id IN (${ids}) AND business_date BETWEEN ? AND ? GROUP BY 1,2,3 ORDER BY 1,2`, r.from, r.to); break; }
    case 'audit': { columns = [col('created_at', 'Time'), col('user_name', 'User'), col('action', 'Action'), col('entity', 'Record'), col('entity_id', 'ID'), col('before', 'Before'), col('after', 'After')]; rows = ctx.all(`SELECT a.created_at, u.name user_name, a.action, a.entity, a.entity_id, a.before, a.after FROM audit_log a LEFT JOIN users u ON u.id=a.user_id WHERE a.org_id=? AND (a.branch_id IS NULL OR a.branch_id IN (${ids})) AND substr(a.created_at,1,10) BETWEEN ? AND ? ORDER BY a.id DESC LIMIT 2000`, ctx.org_id, r.from, r.to); break; }
  }
  return { name, columns, rows, totals, meta: meta(), note };
}
function totalsBy(rows, columns, only) { // totals per currency, never mixed
  const keys = columns.filter((c) => c.type === M && (!only || only.includes(c.key))).map((c) => c.key); const out = {};
  for (const x of rows) { const c = x.currency || ''; const t = (out[c] ||= Object.fromEntries(keys.map((k) => [k, 0]))); for (const k of keys) t[k] += Number(x[k] || 0); }
  return out;
}
export function customerPositions(ctx, id) { return customerBalance(ctx, id); }

// Final profit statement of a barber branch. Net profit follows the brief (retained - consumables - operating expenses);
// advances are cash timing only (not an expense); deductions recovered reduce what the business pays out.
export function barberProfitLines(ctx, b, { from, to, employee }) {
  const L = []; const ccy = b.currency; const line = (item, amount, count) => L.push({ branch: b.name, item, currency: ccy, amount, count });
  const sv = ctx.get(`SELECT COALESCE(SUM(l.net),0) rev, COALESCE(SUM(l.discount),0) disc, COALESCE(SUM(l.cost_total),0) cost, COUNT(DISTINCT s.id) visits, COALESCE(SUM(l.qty),0) services FROM sale_lines l JOIN sales s ON s.id=l.sale_id WHERE s.branch_id=? AND s.kind='service' AND s.status='completed' AND s.business_date BETWEEN ? AND ?${employee ? ' AND l.barber_id=' + employee : ''}`, b.id, from, to);
  const ref = ctx.get(`SELECT COALESCE(SUM(rl.net),0) n FROM return_lines rl JOIN returns r ON r.id=rl.return_id JOIN sale_lines l ON l.id=rl.sale_line_id JOIN sales s ON s.id=l.sale_id WHERE r.branch_id=? AND s.kind='service' AND r.business_date BETWEEN ? AND ?${employee ? ' AND l.barber_id=' + employee : ''}`, b.id, from, to).n;
  const com = ctx.get(`SELECT COALESCE(SUM(earned_delta),0) e, COALESCE(SUM(CASE WHEN type='advance' THEN -payable_delta ELSE 0 END),0) adv, COALESCE(SUM(CASE WHEN type='deduction' THEN -payable_delta ELSE 0 END),0) ded FROM commission_ledger WHERE branch_id=? AND business_date BETWEEN ? AND ?${employee ? ' AND employee_id=' + employee : ''}`, b.id, from, to);
  const pd = ctx.get('SELECT COALESCE(SUM(deductions),0) d, COALESCE(SUM(amount_paid),0) paid FROM commission_payouts WHERE branch_id=? AND business_date BETWEEN ? AND ?', b.id, from, to);
  const tips = ctx.get("SELECT COALESCE(SUM(tip),0) t FROM sales WHERE branch_id=? AND kind='service' AND status='completed' AND business_date BETWEEN ? AND ?", b.id, from, to).t;
  const exp = employee ? [] : ctx.all("SELECT c.name cat, SUM(a.amount) amt FROM expense_allocations a JOIN expenses e ON e.id=a.expense_id JOIN expense_categories c ON c.id=e.category_id WHERE a.branch_id=? AND e.status='approved' AND e.expense_date BETWEEN ? AND ? GROUP BY c.name ORDER BY amt DESC", b.id, from, to);
  const opex = exp.reduce((a, x) => a + x.amt, 0); const net = sv.rev - ref; const retained = net - com.e; const profit = retained - sv.cost - opex; const ded = com.ded + (employee ? 0 : pd.d);
  line('Customers served (visits)', null, sv.visits); line('Services performed', null, sv.services);
  line('Service income (after discounts)', sv.rev); line('Less: refunds', -ref); line('Net service income', net);
  line('Less: staff commission (earned)', -com.e); line('Amount retained after commission', retained);
  line('Less: consumables (direct service cost)', -sv.cost); for (const x of exp) line('Less: expense - ' + x.cat, -x.amt); line('Less: operating expenses (total)', -opex);
  line('NET PROFIT of the branch', profit); line('Add: authorised deductions recovered from staff', ded); line('FINAL PROFIT after deductions', profit + ded);
  line('Memo: advances paid to staff (cash timing, not an expense)', com.adv); line('Memo: commission paid out in the period', pd.paid); line('Memo: tips (not income, not commission base)', tips);
  return L;
}
