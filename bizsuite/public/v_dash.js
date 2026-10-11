import { S, h, t, get, money, can, sel, lineChart, barChart, table, pill, dt, hashQ, today, label, sum } from './core.js';

export async function dashboard(r) {
  const q = { preset: 'month', ...r.q }; const root = h('div', { class: 'stack' }); const cfg = S.user;
  let users = []; if (can('staff.view')) { try { users = (await get('/users')).rows; } catch { /* ignore */ } }
  const types = [['', 'All types'], ['clothing', 'Clothing & footwear'], ['electronics_retail', 'Electronics retail'], ['electronics_repair', 'Electronics repair'], ['barber', 'Barber shop'], ['electronics_combined', 'Retail + repair']];
  const set = (k, v) => { const n = { ...q, [k]: v }; if (k === 'business_id') delete n.branch_id; location.hash = hashQ('/dashboard', n); };
  const branchOpts = cfg.branches.filter((b) => !q.business_id || b.business_id === Number(q.business_id)).map((b) => ({ value: b.id, label: b.name }));
  const bar = h('div', { class: 'card row' },
    sel([{ value: '', label: t('All businesses') }, ...cfg.businesses.map((b) => ({ value: b.id, label: b.name }))], q.business_id, (v) => set('business_id', v), { 'aria-label': t('Business') }),
    sel([{ value: '', label: t('All branches') }, ...branchOpts], q.branch_id, (v) => set('branch_id', v), { 'aria-label': t('Branch') }),
    sel(types.map(([v, l]) => ({ value: v, label: t(l) })), q.business_type, (v) => set('business_type', v), { 'aria-label': t('Business') }),
    users.length ? sel([{ value: '', label: t('All employees') }, ...users.map((u) => ({ value: u.id, label: u.name }))], q.employee_id, (v) => set('employee_id', v), { 'aria-label': t('Employee') }) : null,
    sel([['today', 'Today'], ['yesterday', 'Yesterday'], ['week', 'This week'], ['month', 'This month'], ['year', 'This year'], ['custom', 'Custom']].map(([v, l]) => ({ value: v, label: t(l) })), q.preset, (v) => set('preset', v), { 'aria-label': 'Period' }),
    q.preset === 'custom' ? [h('input', { type: 'date', value: q.from || '', onchange: (e) => set('from', e.target.value), 'aria-label': t('From') }), h('input', { type: 'date', value: q.to || '', onchange: (e) => set('to', e.target.value), 'aria-label': t('To') })] : null);
  root.append(bar);
  const d = await get('/dashboard', q); const f = d.filters; const base = { from: f.from, to: f.to, branch_id: q.branch_id, business_id: q.business_id, business_type: q.business_type, employee_id: q.employee_id };
  root.append(h('div', { class: 'muted' }, `${f.from} → ${f.to}`, d.branches.length ? ` · ${d.branches.length} ${t('Branches')}` : ''));
  if (!d.currencies.length) root.append(h('div', { class: 'card empty' }, t('No data yet')));
  for (const c of d.currencies) {
    const m = (v) => money(v, c.currency); const lnk = (path, extra) => hashQ(path, { ...base, branch_ids: d.filters.branches.filter((id) => d.branches.find((b) => b.branch_id === id && b.currency === c.currency)).join(','), ...extra });
    const kpi = (lab, v, href, cls, num) => (v === undefined ? null : h('a', { class: 'kpi ' + (cls || ''), href }, h('div', { class: 'l' }, t(lab)), h('div', { class: 'v' }, typeof v === 'number' && !num ? m(v) : v)));
    const kp = [kpi('Net sales', c.net_sales, lnk('/sales', { status: 'completed' })), kpi('Repair revenue', c.repair_revenue, lnk('/repairs', { status: 'completed' })), kpi('Collected', c.collected, lnk('/payments', { status: 'confirmed' })),
      kpi('Cost of goods sold', c.cogs, lnk('/reports/stock_movement')), kpi('Gross profit', c.gross_profit, lnk('/reports/profit')), kpi('Staff commission', c.commission, lnk('/commissions')), kpi('Operating expenses', c.opex, lnk('/expenses')),
      kpi('Net profit', c.net_profit, lnk('/reports/profit'), c.net_profit < 0 ? 'neg' : 'pos'), c.balances ? kpi('Cash', c.balances.cash, lnk('/registers')) : null, c.balances ? kpi('Mobile money', c.balances.mobile, lnk('/payments', { method_kind: 'mobile' })) : null, c.balances ? kpi('Bank', c.balances.bank, lnk('/payments', { method_kind: 'bank' })) : null,
      kpi('Receivables', c.receivables, hashQ('/customers', { with_balance: 1 })), kpi('Payables', c.payables, '#/suppliers'), kpi('Inventory value', c.inventory_value, '#/inventory'), c.in_transit_value ? kpi('In transit', c.in_transit_value, '#/transfers') : null,
      c.low_stock !== undefined ? kpi(t('Low stock') + ' / ' + t('Out of stock'), `${c.low_stock} / ${c.out_of_stock}`, hashQ('/inventory', { low: 1 })) : null, kpi('Sales count', c.sales_count, lnk('/sales', { kind: 'retail' }), '', true), kpi(t('Visits') + ' / ' + t('Services'), `${c.visits} / ${c.services_count}`, lnk('/sales', { kind: 'service' }))];
    const series = d.series.filter((s) => s.currency === c.currency); const labels = series.map((s) => s.date);
    const rs = Object.entries(c.repairs_by_status || {});
    root.append(h('div', { class: 'card' }, h('div', { class: 'row sb' }, h('h2', {}, `${t('Dashboard')} · ${c.currency}`), c.retained_after_commission !== undefined ? h('small', {}, `${t('Retained')}: ${m(c.retained_after_commission)} (${t('Net profit')} ≠ ${t('Retained')})`) : null), h('div', { class: 'grid g4' }, kp)),
      h('div', { class: 'grid g2' }, h('div', { class: 'card' }, h('h3', {}, `${t('Trend')} (${c.currency})`), labels.length ? lineChart([{ name: t('Net sales'), data: series.map((s) => s.net_sales) }, { name: t('Collected'), data: series.map((s) => s.collected) }, ...(series.some((s) => s.expenses !== undefined) ? [{ name: t('Expenses'), data: series.map((s) => s.expenses || 0) }] : [])], labels, { fmtY: (v) => (Math.abs(v) >= 1e5 ? Math.round(v / 100 / 1000) + 'k' : Math.round(v / 100)) }) : h('div', { class: 'empty' }, t('No data yet'))),
        h('div', { class: 'card' }, h('h3', {}, t('Branch comparison')), barChart(d.branches.filter((b) => b.currency === c.currency).sort((a, b) => (b.net_profit ?? b.net_sales) - (a.net_profit ?? a.net_sales)).map((b) => ({ label: b.branch, value: b.net_profit ?? b.net_sales })), { fmtV: m }), h('small', { class: 'muted' }, c.net_profit !== undefined ? t('Net profit') : t('Net sales')))),
      rs.length ? h('div', { class: 'card' }, h('h3', {}, t('Repair jobs')), h('div', { class: 'row' }, rs.map(([s, n]) => h('a', { href: hashQ('/repairs', { status: s, branch_id: q.branch_id }) }, pill(s), ' ', h('b', {}, n))))) : null);
  }
  if (d.converted) root.append(h('div', { class: 'card' }, h('h3', {}, `${t('Converted to reporting currency')} (${d.converted.currency})`), h('small', { class: 'muted' }, t('Uses the latest stored exchange rate on or before the period end. Native-currency totals above remain authoritative.')), d.converted.missing.length ? h('p', { style: 'color:var(--warn)' }, 'Missing exchange rate: ' + d.converted.missing.join(', ')) : null,
    h('div', { class: 'grid g4' }, Object.entries(d.converted.totals).map(([k, v]) => h('div', { class: 'kpi' }, h('div', { class: 'l' }, label(k)), h('div', { class: 'v' }, money(v, d.converted.currency)))))));
  root.append(h('div', { class: 'grid g2' },
    h('div', { class: 'card' }, h('div', { class: 'row sb' }, h('h3', {}, t('Employee performance')), can('reports.view') ? h('a', { href: '#/reports/employee_performance' }, '→') : null), table([{ label: 'Employee', k: 'employee' }, { label: 'Sales', k: 'sales', r: 1 }, { label: 'Visits', k: 'visits', r: 1 }, { label: 'Repairs', k: 'repairs', r: 1 }, { label: 'Revenue', r: 1, f: (e) => money(e.revenue, e.currency) }], d.employees.slice(0, 10))),
    h('div', { class: 'card' }, h('div', { class: 'row sb' }, h('h3', {}, t('Pending approvals')), can('approvals.view') ? h('a', { class: 'pill ' + (d.pending_approvals ? 'warn' : ''), href: '#/approvals' }, d.pending_approvals) : null), d.activity.length ? h('div', { class: 'stack' }, h('h3', {}, t('Recent activity')), d.activity.map((a) => h('div', { class: 'row sb' }, h('span', {}, h('b', {}, a.user_name || '—'), ' ', a.action), h('small', {}, dt(a.created_at))))) : null)));
  void today; void sum; return root;
}
