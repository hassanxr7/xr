// Shop-floor screens: the manager's one-page board (live), scan & sell (phone or laptop camera), baskets waiting for the
// manager (orders) and QR item labels.
import { S, h, t, tx, get, post, money, parseMoney, plain, can, sel, table, pill, dt, hashQ, busy, toast, errText, modal, formModal, clear, methodsAll, payRows, uuid, openDoc, lineChart, exportButtons, mulBp, loading, branchesOf, askReason } from './core.js';
import { scanner, cameraSupported } from './scan.js';

const attrText = (a) => Object.values(a || {}).filter(Boolean).join(' / ');
const pct = (bp) => (bp == null ? '' : (bp / 100).toString().replace(/\.0+$/, '') + '%');
const myBranches = () => S.user.branches;
const pickBranch = (q, list = myBranches()) => list.find((b) => b.id === Number(q.branch_id)) || list.find((b) => b.id === Number(sessionStorage.getItem('shop_branch'))) || list[0];
const canStockIn = (b) => can('products.create') && can('purchases.create') && ['clothing', 'electronics_retail', 'electronics_combined'].includes(b.business_type);
const sellBranches = () => branchesOf('sales');
const canSend = () => can('orders.create') || can('sales.create');
const canComplete = () => can('sales.create') && can('sales.approve');

function bars(items, { value, label, sub, fmt = (v) => v, color = 'var(--c1)' }) {
  if (!items.length) return h('div', { class: 'empty' }, t('No data yet'));
  const max = Math.max(1, ...items.map(value));
  return h('div', { class: 'stack' }, items.map((x) => h('div', {}, h('div', { class: 'row sb' }, h('span', {}, label(x)), h('b', {}, fmt(value(x)))), h('div', { class: 'barbg' }, h('div', { class: 'barfg', style: `width:${Math.max(3, (value(x) / max) * 100)}%;background:${color}` })), sub ? h('small', { class: 'muted' }, sub(x)) : null)));
}

// ---------------------------------------------------------------- manager board
export async function shop(r) {
  const b = pickBranch(r.q); if (!b) return h('div', { class: 'card empty' }, t('No data yet'));
  sessionStorage.setItem('shop_branch', b.id);
  const root = h('div', { class: 'stack shopboard' }); const body = h('div', { class: 'stack' }, loading()); const stamp = h('small', { class: 'muted' });
  const go = (id) => { location.hash = hashQ('/shop', { branch_id: id }); };
  const actions = h('div', { class: 'actions' },
    canSend() && S.user.modules.includes('sales') && b.business_type !== 'barber' ? h('a', { class: 'act', href: hashQ('/scan', { branch_id: b.id }) }, h('span', { class: 'ic' }, '📷'), t('Scan & sell')) : null,
    (canComplete() || can('orders.create')) && S.user.modules.includes('sales') && b.business_type !== 'barber' ? h('a', { class: 'act', href: hashQ('/orders', { branch_id: b.id }) }, h('span', { class: 'ic' }, '🧾'), t('Orders waiting'), h('span', { class: 'pill warn', id: 'ordcount', style: 'display:none' })) : null,
    b.business_type === 'barber' && (can('services.create') || can('services.view')) ? h('a', { class: 'act', href: '#/visits' }, h('span', { class: 'ic' }, '✂️'), t('Record a visit')) : null,
    canStockIn(b) ? h('button', { class: 'act', onclick: () => stockInDialog(b, refresh) }, h('span', { class: 'ic' }, '📦'), t('Register new stock')) : null,
    can('expenses.create') ? h('button', { class: 'act', onclick: () => expenseDialog(b, refresh) }, h('span', { class: 'ic' }, '💸'), t('Add expense')) : null,
    can('products.view') && b.business_type !== 'barber' ? h('a', { class: 'act', href: hashQ('/labels', { branch_id: b.id }) }, h('span', { class: 'ic' }, '🏷️'), t('Price tags')) : null);
  root.append(h('div', { class: 'card row', style: `border-left:6px solid ${b.color || 'var(--brand)'}` }, h('div', {}, h('h1', { style: 'margin:0' }, b.name), h('small', { class: 'muted' }, t('My shop'), ' · ', h('span', { class: 'live' }, '●'), ' ', t('Live'), ' · ', stamp)), h('span', { style: 'flex:1' }),
    myBranches().length > 1 ? sel(myBranches().map((x) => ({ value: x.id, label: x.name })), b.id, go, { 'aria-label': t('Branch') }) : null), actions, body);
  async function refresh() {
    let d; try { d = await get('/shop', { branch_id: b.id }); } catch (e) { clear(body); body.append(h('div', { class: 'card' }, errText(e))); return; }
    clear(body); body.append(...draw(d, b, refresh)); stamp.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const oc = document.getElementById('ordcount'); if (oc) { oc.textContent = d.orders_open; oc.style.display = d.orders_open ? '' : 'none'; }
  }
  await refresh();
  const timer = setInterval(() => { if (!document.body.contains(root)) return clearInterval(timer); if (!document.querySelector('.overlay')) refresh(); }, 30000);
  return root;
}

function draw(d, b, refresh) {
  const m = (v) => money(v, d.branch.currency); const T = d.kpi.today, M = d.kpi.month, L = d.kpi.last_month; const out = [];
  const kpi = (lab, v, cls, sub) => (v === undefined ? null : h('div', { class: 'kpi xl ' + (cls || '') }, h('div', { class: 'l' }, t(lab)), h('div', { class: 'v' }, v), sub ? h('small', { class: 'muted' }, sub) : null));
  const barber = d.branch.type === 'barber';
  out.push(h('div', { class: 'grid g4' },
    kpi("Today's sales", m(T.net_sales), '', barber ? `${T.visits} ${t('Customers served')}` : `${T.sales_count} ${t('Sales')}`),
    kpi('Collected today', m(T.collected)),
    kpi('This month', m(M.net_sales), '', barber ? `${M.visits} ${t('Customers served')}` : `${M.sales_count} ${t('Sales')}`),
    M.net_profit !== undefined ? kpi('Profit this month', m(M.net_profit), M.net_profit < 0 ? 'neg' : 'pos', M.gross_profit !== undefined ? `${t('Gross profit')}: ${m(M.gross_profit)}` : null) : null,
    !barber && d.orders_open ? h('a', { class: 'kpi xl warn', href: hashQ('/orders', { branch_id: b.id }) }, h('div', { class: 'l' }, t('Orders waiting for payment')), h('div', { class: 'v' }, d.orders_open)) : null));
  out.push(h('div', { class: 'grid g2' },
    h('div', { class: 'card' }, h('h3', {}, t('Sales - last 30 days')), d.series.length ? lineChart([{ name: t('Net sales'), data: d.series.map((s) => s.net_sales) }, ...(d.series.some((s) => s.expenses) ? [{ name: t('Expenses'), data: d.series.map((s) => s.expenses || 0) }] : [])], d.series.map((s) => s.date), { fmtY: (v) => Math.round(v / 100) }) : h('div', { class: 'empty' }, t('No sales yet'))),
    barber ? h('div', { class: 'card' }, h('h3', {}, t('Most requested services this month')), bars(d.top_services || [], { value: (x) => x.qty, label: (x) => x.name, sub: (x) => m(x.revenue) }))
      : h('div', { class: 'card' }, h('h3', {}, t('Best sellers this month')), bars(d.top_items, { value: (x) => x.qty, label: (x) => x.name, fmt: (v) => `${v} ${t('pcs')}`, sub: (x) => `${t('Revenue')}: ${m(x.revenue)}${x.profit !== undefined ? ` · ${t('Profit')}: ${m(x.profit)}` : ''}` }), d.top_categories.length > 1 ? h('div', { class: 'row', style: 'margin-top:8px' }, d.top_categories.map((c) => h('span', { class: 'pill' }, `${c.category}: ${m(c.revenue)}`))) : null)));
  if (barber) out.push(h('div', { class: 'card' }, h('h3', {}, t('Barbers today')), table([{ label: 'Barber', k: 'name' }, { label: 'Customers served', r: 1, k: 'customers' }, { label: 'Services', r: 1, k: 'services' }, { label: 'Income generated', r: 1, f: (x) => m(x.income) },
    ...((d.barbers_today || [])[0]?.commission !== undefined ? [{ label: 'Rate', r: 1, f: (x) => [x.commission_bp ? pct(x.commission_bp) : '', x.commission_bp && x.commission_fixed ? ' + ' : '', x.commission_fixed ? m(x.commission_fixed) : ''] }, { label: 'Commission', r: 1, f: (x) => m(x.commission) }, { label: 'Retained by business', r: 1, f: (x) => m(x.income - x.commission) }] : [])], d.barbers_today || []), h('a', { href: '#/commissions' }, t('Daily work and commissions') + ' →')));
  if (d.running_out || d.slow_movers) out.push(h('div', { class: 'grid g2' },
    d.running_out ? h('div', { class: 'card' }, h('h3', {}, '🔴 ', t('Running out')), d.running_out.length ? h('div', { class: 'stack' }, d.running_out.map((x) => h('div', { class: 'row sb line' }, h('span', {}, x.name, ' ', h('small', { class: 'muted' }, x.sku)), h('span', { class: 'pill ' + (x.qty === 0 ? 'bad' : 'warn') }, x.qty === 0 ? t('Out of stock') : `${x.qty} ${t('left')}`)))) : h('div', { class: 'empty' }, t('Nothing is running out')), canStockIn(b) ? h('button', { class: 'btn s', style: 'margin-top:8px', onclick: () => stockInDialog(b, refresh) }, '+ ' + t('Register new stock')) : null) : null,
    d.slow_movers ? h('div', { class: 'card' }, h('h3', {}, '🏷️ ', t('Not selling - consider a discount')), h('small', { class: 'muted' }, t('In stock, little or no sales in the last 30 days')), d.slow_movers.length ? h('div', { class: 'stack', style: 'margin-top:6px' }, d.slow_movers.map((x) => h('div', { class: 'row sb line' }, h('span', {}, x.name, h('br'), h('small', { class: 'muted' }, `${x.qty} ${t('in stock')} · ${t('sold')} ${x.sold} · ${x.days_idle} ${t('days without a sale')}${x.max_discount_bp ? ` · ${t('max discount')} ${pct(x.max_discount_bp)}` : ''}`)), h('span', { class: 'pill ' + (x.suggestion === 'Discount now' ? 'bad' : 'warn') }, t(x.suggestion))))) : h('div', { class: 'empty' }, t('Everything is selling'))) : null));
  if (d.potential) { const p = d.potential; out.push(h('div', { class: 'card' }, h('div', { class: 'row sb' }, h('h3', { style: 'margin:0' }, t('What your stock should earn')), h('a', { href: hashQ('/reports/profit_potential', { branch_id: b.id }) }, t('Full list') + ' →')),
    h('div', { class: 'grid g4', style: 'margin:8px 0' }, kpi('Pieces in stock', String(p.units)), kpi('Stock cost', m(p.stock_cost)), kpi('Value at selling price', m(p.at_full_price)), p.profit_full !== undefined ? kpi('Expected profit', m(p.profit_full), 'pos', `${t('at max discount')}: ${m(p.profit_min)}`) : null),
    table([{ label: 'Item', f: (x) => [x.name, h('br'), h('small', { class: 'muted' }, x.sku)] }, { label: 'On hand', r: 1, k: 'qty' }, { label: 'Cost', r: 1, f: (x) => m(x.cost) }, { label: 'Price', r: 1, f: (x) => m(x.price) }, { label: 'Max discount', r: 1, f: (x) => (x.max_discount ? x.max_discount + '%' : '—') }, ...(p.top[0] && p.top[0].unit_profit !== undefined ? [{ label: 'Profit per piece', r: 1, f: (x) => m(x.unit_profit) }, { label: 'At max discount', r: 1, f: (x) => m(x.unit_profit_min) }, { label: 'Expected profit', r: 1, f: (x) => h('b', {}, m(x.total_profit)) }] : [])], p.top))); }
  if (d.expenses) out.push(h('div', { class: 'card' }, h('div', { class: 'row sb' }, h('h3', { style: 'margin:0' }, t('Expenses this month')), can('expenses.create') ? h('button', { class: 'btn s', onclick: () => expenseDialog(b, refresh) }, '+ ' + t('Add expense')) : null),
    table([{ label: 'Date', k: 'expense_date' }, { label: 'Category', f: (x) => t(x.category) }, { label: 'Notes', k: 'description' }, { label: 'Status', f: (x) => pill(x.status) }, { label: 'Amount', r: 1, f: (x) => m(x.amount) }], d.expenses, { empty: t('No expenses this month') }), M.opex !== undefined ? h('div', { class: 'row sb big' }, t('Total'), m(M.opex)) : null));
  // last month's statement
  const lines = [['Net sales', L.net_sales], ['Repair revenue', L.repair_revenue || undefined], ['Cost of goods sold', L.cogs === undefined ? undefined : -L.cogs], ['Gross profit', L.gross_profit, 1], ['Staff commission', L.commission === undefined ? undefined : -L.commission], ['Operating expenses', L.opex === undefined ? undefined : -L.opex], ['Net profit', L.net_profit, 2]].filter((x) => x[1] !== undefined);
  out.push(h('div', { class: 'card' }, h('div', { class: 'row sb' }, h('h3', { style: 'margin:0' }, t('Statement for last month'), ' ', h('small', { class: 'muted' }, `${d.periods.last_month[0]} → ${d.periods.last_month[1]}`)), can('reports.view') && can('profit.view') ? exportButtons('/reports/item_profit', { preset: 'last_month', branch_id: b.id }, 'items_last_month') : null),
    h('div', { class: 'tw' }, h('table', {}, h('tbody', {}, lines.map(([k, v, s]) => h('tr', { class: s ? 'strong' : '' }, h('td', {}, t(k)), h('td', { class: 'r' + (s === 2 ? (v < 0 ? ' neg' : ' pos') : '') }, m(v))))))),
    h('div', { class: 'row' }, h('span', { class: 'muted' }, `${barber ? L.visits + ' ' + t('Customers served') : L.sales_count + ' ' + t('Sales')} · ${t('Discounts')}: ${m(L.discounts)} · ${t('Collected')}: ${m(L.collected)}`), h('span', { style: 'flex:1' }), can('reports.view') && can('profit.view') && !barber ? h('a', { class: 'btn s', href: hashQ('/reports/item_profit', { preset: 'last_month', branch_id: b.id }) }, t('Items sold last month') + ' →') : null, barber && can('profit.view') ? h('a', { class: 'btn s', href: hashQ('/commissions', { tab: 'profit', branch_id: b.id }) }, t('Branch profit') + ' →') : null)));
  return out;
}

// ---------------------------------------------------------------- "I bought these" (stock in with expected profit)
async function stockInDialog(b, done) {
  const sups = can('suppliers.view') ? (await get('/suppliers')).rows : []; const methods = await methodsAll(); const ccy = b.currency;
  const F = [{ name: 'name', label: 'Item name', required: true, hint: 'e.g. Polo shirt' }, { name: 'category', label: 'Category', hint: 'Shirts, Shoes, Phones…' }, { name: 'brand', label: 'Brand' },
    { name: 'sizes', label: 'Sizes', hint: 'S, M, L (optional)' }, { name: 'colors', label: 'Colours', hint: 'Black, White (optional)' }, { name: 'qty', label: 'Quantity per size/colour', type: 'number', required: true, min: 1 },
    { name: 'cost', label: 'Cost per piece (what you paid)', type: 'money', required: true }, { name: 'price', label: 'Selling price per piece', type: 'money', required: true }, { name: 'max_discount_bp', label: 'Maximum discount allowed (%)', type: 'percent', hint: '10' }, { name: 'min_stock', label: 'Warn me when only this many are left', type: 'number', min: 0 },
    { name: 'supplier_id', label: 'Supplier', type: 'select', num: true, placeholder: t('New / other supplier'), options: sups.map((s) => ({ value: s.id, label: s.name })) }, { name: 'supplier_name', label: 'New supplier name', hint: 'Local market' },
    { name: 'paid', label: 'Paid now', type: 'select', options: [{ value: 'full', label: 'Paid in full' }, { value: '0', label: 'Not paid yet (owed to supplier)' }] }, { name: 'method_id', label: 'Payment method', type: 'select', num: true, options: methods.filter((x) => x.kind !== 'credit').map((x) => ({ value: x.id, label: x.name })) }];
  const prev = h('div', { class: 'preview full' });
  const m = formModal({ title: t('Register new stock') + ' · ' + b.name, wide: true, fields: F, ccy, label: 'Save and print tags', initial: { qty: 1, min_stock: 2, paid: 'full', max_discount_bp: 1000 }, submit: async (v) => {
    const r = await post('/shop/stock-in', { branch_id: b.id, ...v, paid: v.paid === 'full' ? 'full' : 0, sizes: v.sizes, colors: v.colors });
    toast(t('Saved'), 'ok'); done && done();
    modal({ title: t('Stock registered'), body: h('div', { class: 'stack' }, h('p', {}, `${r.units} ${t('pieces')} · ${r.variant_ids.length} ${t('sizes/colours')}`), h('div', { class: 'grid g3' }, h('div', { class: 'kpi' }, h('div', { class: 'l' }, t('Total cost')), h('div', { class: 'v' }, money(r.total_cost, ccy))), h('div', { class: 'kpi' }, h('div', { class: 'l' }, t('Expected sales')), h('div', { class: 'v' }, money(r.expected.revenue, ccy))), h('div', { class: 'kpi pos' }, h('div', { class: 'l' }, t('Expected profit')), h('div', { class: 'v' }, money(r.expected.profit, ccy)), h('small', { class: 'muted' }, `${t('at max discount')}: ${money(r.expected.profit_at_max_discount, ccy)}`)))),
      actions: (close) => [h('button', { class: 'btn', onclick: close }, t('Close')), h('button', { class: 'btn p', onclick: () => { close(); printTags(r.variant_ids, b.id); } }, '🏷️ ' + t('Print price tags'))] });
  } });
  const form = m.el.querySelector('form'); form.append(prev);
  const val = (n) => form.querySelector(`[name="${n}"]`).value; const num = (n) => { try { return val(n) ? parseMoney(val(n), ccy) : 0; } catch { return NaN; } };
  const showSup = () => { form.querySelector('[name="supplier_name"]').closest('label').style.display = val('supplier_id') ? 'none' : ''; form.querySelector('[name="method_id"]').closest('label').style.display = val('paid') === 'full' ? '' : 'none'; };
  const calc = () => { showSup(); clear(prev); const cost = num('cost'), price = num('price'), q = Number(val('qty')) || 0, md = Math.round((Number(val('max_discount_bp')) || 0) * 100); const n = Math.max(1, val('sizes').split(',').filter((x) => x.trim()).length) * Math.max(1, val('colors').split(',').filter((x) => x.trim()).length);
    if (!(cost >= 0 && price >= 0) || Number.isNaN(cost) || Number.isNaN(price)) return; const unit = price - cost, minP = price - mulBp(price, md), units = q * n;
    prev.append(h('div', { class: 'grid g4' }, h('div', { class: 'kpi' }, h('div', { class: 'l' }, t('Profit per piece')), h('div', { class: 'v ' + (unit < 0 ? 'neg' : 'pos') }, money(unit, ccy))), h('div', { class: 'kpi' }, h('div', { class: 'l' }, t('At max discount')), h('div', { class: 'v ' + (minP - cost < 0 ? 'neg' : '') }, money(minP - cost, ccy)), h('small', { class: 'muted' }, `${t('lowest price')}: ${money(minP, ccy)}`)),
      h('div', { class: 'kpi' }, h('div', { class: 'l' }, t('Pieces')), h('div', { class: 'v' }, String(units)), h('small', { class: 'muted' }, `${t('Total cost')}: ${money(units * cost, ccy)}`)), h('div', { class: 'kpi pos' }, h('div', { class: 'l' }, t('Expected profit')), h('div', { class: 'v' }, money(units * unit, ccy)), h('small', { class: 'muted' }, `${t('at max discount')}: ${money(units * (minP - cost), ccy)}`)))); };
  form.addEventListener('input', calc); form.addEventListener('change', calc); calc();
}

async function expenseDialog(b, done) {
  const cats = (await get('/expense-categories')).rows; const methods = await methodsAll();
  formModal({ title: t('Add expense') + ' · ' + b.name, ccy: b.currency, fields: [{ name: 'category_id', label: 'Category', type: 'select', num: true, options: cats.map((c) => ({ value: c.id, label: c.name })) }, { name: 'amount', label: 'Amount', type: 'money', required: true }, { name: 'description', label: 'What was it for?', full: true }, { name: 'method_id', label: 'Payment method', type: 'select', num: true, options: methods.filter((x) => x.kind !== 'credit').map((x) => ({ value: x.id, label: x.name })) }],
    submit: async (v) => { const x = await post('/expenses', { scope: 'branch', branch_id: b.id, ...v }); toast(x.approval_required ? t('Approval requested') : t('Saved'), x.approval_required ? '' : 'ok'); done && done(); } });
}

// ---------------------------------------------------------------- scan & sell
export async function scan(r) {
  const list = sellBranches(); if (!list.length || !canSend()) return h('div', { class: 'card empty' }, t('Not permitted'));
  const b = pickBranch(r.q, list); sessionStorage.setItem('shop_branch', b.id); const ccy = b.currency;
  let basket = []; try { basket = JSON.parse(sessionStorage.getItem('basket_' + b.id) || '[]'); } catch { basket = []; }
  const save = () => { try { sessionStorage.setItem('basket_' + b.id, JSON.stringify(basket)); } catch { /* ignore */ } };
  const root = h('div', { class: 'stack scanpage' }); const card = h('div', {}); const basketEl = h('div', { class: 'card stack' });
  const camWrap = h('div', {}); let cam = null;
  const code = h('input', { placeholder: t('Type or scan the code'), autocomplete: 'off', 'aria-label': t('Code'), style: 'flex:1;min-width:160px' });
  async function lookup(c) {
    c = String(c || '').trim(); if (!c) return; clear(card); card.append(loading());
    try {
      let rows = (await get('/pos/search', { branch_id: b.id, barcode: c })).rows; if (!rows.length && c.length >= 2) rows = (await get('/pos/search', { branch_id: b.id, q: c })).rows;
      clear(card); if (!rows.length) { card.append(h('div', { class: 'card bad' }, t('No item found for this code'), ': ', h('code', {}, c))); return; }
      if (rows.length > 1) { card.append(h('div', { class: 'card' }, h('h3', {}, t('Choose the item')), h('div', { class: 'tiles' }, rows.map((v) => h('button', { class: 'tile', onclick: () => { clear(card); card.append(itemCard(v)); } }, h('b', {}, v.name), h('small', {}, attrText(v.attrs) || v.sku), h('div', {}, money(v.price, ccy))))))); return; }
      card.append(itemCard(rows[0]));
    } catch (e) { clear(card); card.append(h('div', { class: 'card' }, errText(e))); }
  }
  function itemCard(v) {
    const maxAmt = v.max_discount_bp != null ? mulBp(v.price, v.max_discount_bp) : null;
    const qty = h('input', { type: 'number', min: 1, value: 1, style: 'width:80px', 'aria-label': t('Quantity') }); const disc = h('input', { inputmode: 'decimal', placeholder: '0', style: 'width:100px', 'aria-label': t('Discount') });
    const tot = h('div', { class: 'big' }); const warn = h('div', { class: 'muted' });
    const calc = () => { let d = 0; try { d = disc.value ? parseMoney(disc.value, ccy) : 0; } catch { d = NaN; } const q = Math.max(1, Number(qty.value) || 1); const cap = maxAmt == null ? null : maxAmt * q; clear(warn); clear(tot);
      if (Number.isNaN(d)) { warn.append(t('err.invalid_amount')); return null; } if (cap != null && d > cap) { warn.append(h('span', { style: 'color:var(--bad)' }, `${t('Maximum discount')}: ${money(cap, ccy)}`)); } tot.append(money(q * v.price - d, ccy)); return { q, d, ok: cap == null || d <= cap || can('sales.approve') }; };
    qty.oninput = disc.oninput = calc;
    const add = h('button', { class: 'btn p big', style: 'width:100%;justify-content:center;min-height:48px' }, '+ ' + t('Add to basket'));
    add.onclick = () => { const x = calc(); if (!x) return; if (!x.ok) return toast(t('err.discount_above_item_max'), 'bad'); if (v.kind === 'serialized') return toast(t('Serialized devices are sold from the Point of sale'), 'bad'); if (x.q > v.qty) return toast(`${t('Only')} ${v.qty} ${t('in stock')}`, 'bad');
      const ex = basket.find((l) => l.variant_id === v.id); if (ex) { ex.qty += x.q; ex.discount += x.d; } else basket.push({ variant_id: v.id, name: v.name, attrs: attrText(v.attrs), sku: v.sku, price: v.price, qty: x.q, discount: x.d, max_discount_bp: v.max_discount_bp, stock: v.qty }); save(); drawBasket(); clear(card); toast(t('Added'), 'ok'); code.focus(); };
    const el = h('div', { class: 'card itemcard stack' }, h('div', { class: 'row sb' }, h('div', {}, h('h2', { style: 'margin:0' }, v.name), h('div', { class: 'muted' }, [attrText(v.attrs), v.sku].filter(Boolean).join(' · '))), h('div', { class: 'r' }, h('div', { class: 'big' }, money(v.price, ccy)), h('span', { class: 'pill ' + (v.qty > 0 ? 'ok' : 'bad') }, v.qty > 0 ? `${v.qty} ${t('in stock')}` : t('Out of stock')))),
      h('div', { class: 'row' }, h('span', { class: 'pill' }, maxAmt == null ? t('No discount limit set') : `${t('Maximum discount')}: ${pct(v.max_discount_bp)} = ${money(maxAmt, ccy)} → ${t('lowest price')} ${money(v.price - maxAmt, ccy)}`)),
      h('div', { class: 'row' }, h('label', { class: 'f' }, t('Quantity'), qty), h('label', { class: 'f' }, t('Discount'), disc), h('div', { class: 'f' }, h('span', {}, t('Total')), tot)), warn, add);
    calc(); return el;
  }
  function drawBasket() {
    clear(basketEl); const total = basket.reduce((a, l) => a + l.qty * l.price - l.discount, 0);
    basketEl.append(h('div', { class: 'row sb' }, h('h2', { style: 'margin:0' }, t('Basket'), ' ', h('span', { class: 'pill' }, basket.reduce((a, l) => a + l.qty, 0))), basket.length ? h('button', { class: 'btn s', onclick: () => { basket = []; save(); drawBasket(); } }, t('Clear')) : null));
    if (!basket.length) { basketEl.append(h('div', { class: 'empty' }, t('Scan or search to add items'))); return; }
    basketEl.append(h('div', { class: 'stack' }, basket.map((l, i) => h('div', { class: 'row sb line' }, h('span', {}, h('b', {}, l.name), ' ', h('small', { class: 'muted' }, l.attrs), h('br'), h('small', {}, `${l.qty} × ${money(l.price, ccy)}${l.discount ? ` − ${money(l.discount, ccy)}` : ''}`)), h('span', { class: 'row' }, h('b', {}, money(l.qty * l.price - l.discount, ccy)), h('button', { class: 'btn s', 'aria-label': t('Remove'), onclick: () => { basket.splice(i, 1); save(); drawBasket(); } }, '✕'))))),
      h('div', { class: 'row sb big' }, t('Total'), money(total, ccy)), b.tax_bp ? h('small', { class: 'muted' }, t('Tax is added when the sale is completed')) : null);
    const cust = h('input', { placeholder: t('Customer name (optional)'), 'aria-label': t('Customer') });
    const send = h('button', { class: 'btn p', style: 'flex:1;justify-content:center;min-height:48px' }, '📨 ' + t('Send to manager'));
    send.onclick = busy(send, async () => { const r2 = await post('/orders', { branch_id: b.id, customer_name: cust.value || undefined, lines: basket.map((l) => ({ variant_id: l.variant_id, qty: l.qty, discount: l.discount || undefined })) }); basket = []; save(); drawBasket(); modal({ title: t('Sent to the manager'), body: h('div', { class: 'stack' }, h('div', { class: 'big' }, r2.ref), h('div', {}, money(r2.total, r2.currency)), h('p', { class: 'muted' }, t('The manager completes the sale when the customer pays.'))), actions: (c) => [h('button', { class: 'btn p', onclick: c }, t('OK'))] }); });
    const now = canComplete() || can('sales.create') ? h('button', { class: 'btn', style: 'flex:1;justify-content:center;min-height:48px' }, '💵 ' + t('Take payment now')) : null;
    if (now) now.onclick = () => payDialog({ branch: b, total, title: t('Take payment now'), submit: async (payments, key) => { const r2 = await post('/sales', { branch_id: b.id, kind: 'retail', customer_name: cust.value || undefined, lines: basket.map((l) => ({ variant_id: l.variant_id, qty: l.qty, discount: l.discount || undefined })), payments }, { idem: key }); if (r2.approval_required) { toast(t('Approval requested'), ''); return; } basket = []; save(); drawBasket(); receipt(r2, ccy); } });
    basketEl.append(cust, h('div', { class: 'row' }, can('orders.create') || !now ? send : null, now));
  }
  const camBtn = h('button', { class: 'btn p', style: 'min-height:44px' }, '📷 ' + t('Start camera'));
  camBtn.onclick = () => { if (cam) { cam.stop(); cam = null; clear(camWrap); camBtn.textContent = '📷 ' + t('Start camera'); return; } cam = scanner((c) => { code.value = c; lookup(c); }); clear(camWrap); camWrap.append(cam.el); camBtn.textContent = '⏹ ' + t('Stop camera'); };
  code.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); lookup(code.value); code.select(); } });
  root.append(h('div', { class: 'card row' }, h('h1', { style: 'margin:0' }, t('Scan & sell')), h('span', { style: 'flex:1' }), list.length > 1 ? sel(list.map((x) => ({ value: x.id, label: x.name })), b.id, (v) => { location.hash = hashQ('/scan', { branch_id: v }); }, { 'aria-label': t('Branch') }) : h('b', {}, b.name)),
    h('div', { class: 'card stack' }, h('div', { class: 'row' }, camBtn, code, h('button', { class: 'btn', onclick: () => lookup(code.value) }, t('Find'))), camWrap, cameraSupported() ? null : h('small', { class: 'muted' }, t('Camera scanning needs https. You can still type the code or use a USB barcode scanner.'))), card, basketEl);
  drawBasket(); if (r.q.code) lookup(r.q.code);
  if (cameraSupported() && matchMedia('(max-width: 800px)').matches && r.q.cam !== '0') setTimeout(() => camBtn.click(), 50); // phones open straight to the camera
  return root;
}

function payDialog({ branch, total, title, submit }) {
  return methodsAll().then((methods) => { const pr = payRows(branch.currency, methods, () => total); pr.add(plain(total, branch.currency)); const key = uuid();
    modal({ title, body: h('div', { class: 'stack' }, h('div', { class: 'big' }, money(total, branch.currency)), pr.el), actions: (close) => { const ok = h('button', { class: 'btn p' }, t('Complete sale')); ok.onclick = busy(ok, async () => { await submit(pr.read(), key); close(); }); return [h('button', { class: 'btn', onclick: close }, t('Cancel')), ok]; } }); });
}
function receipt(r, ccy) {
  modal({ title: r.ref, body: h('div', { class: 'stack' }, h('div', { class: 'big' }, money(r.total, ccy)), h('div', {}, pill(r.payment_status), ` ${t('Paid')}: ${money(r.paid, ccy)}`)), actions: (close) => [h('button', { class: 'btn', onclick: () => openDoc('/print/sale/' + r.id, { mode: 'thermal' }) }, t('Thermal receipt')), h('button', { class: 'btn p', onclick: close }, t('OK'))] });
}

// ---------------------------------------------------------------- orders waiting for the manager
export async function orders(r) {
  const list = sellBranches(); const q = { status: 'open', ...r.q }; const set = (k, v) => { location.hash = hashQ('/orders', { ...q, [k]: v }); };
  const d = await get('/orders', { branch_id: q.branch_id, status: q.status }); const reload = () => set('x', Date.now());
  const root = h('div', { class: 'stack' });
  root.append(h('div', { class: 'card row' }, h('h1', {}, t('Orders')), h('span', { class: 'muted' }, d.can_complete ? t('Complete each order when the customer has paid.') : t('Your baskets sent to the manager.')), h('span', { style: 'flex:1' }),
    list.length > 1 ? sel([{ value: '', label: t('All branches') }, ...list.map((x) => ({ value: x.id, label: x.name }))], q.branch_id, (v) => set('branch_id', v), { 'aria-label': t('Branch') }) : null,
    sel([['open', 'Waiting for payment'], ['completed', 'Completed'], ['cancelled', 'Cancelled'], ['', 'All']].map(([v, l]) => ({ value: v, label: t(l) })), q.status, (v) => set('status', v), { 'aria-label': t('Status') }),
    canSend() ? h('a', { class: 'btn p', href: hashQ('/scan', { branch_id: q.branch_id }) }, '📷 ' + t('Scan & sell')) : null));
  if (!d.rows.length) root.append(h('div', { class: 'card empty' }, q.status === 'open' ? t('No orders are waiting') : t('No data yet')));
  for (const o of d.rows) {
    const br = S.user.branches.find((x) => x.id === o.branch_id) || { currency: o.currency, id: o.branch_id };
    const acts = [];
    if (o.status === 'open' && d.can_complete) { const b1 = h('button', { class: 'btn p' }, '✔ ' + t('Payment received - complete')); b1.onclick = () => payDialog({ branch: { ...br, currency: o.currency }, total: o.total, title: `${t('Complete')} ${o.ref}`, submit: async (payments, key) => { const s2 = await post(`/orders/${o.id}/complete`, { payments }, { idem: key }); toast(t('Sale completed'), 'ok'); receipt(s2, o.currency); reload(); } }); acts.push(b1); }
    if (o.status === 'open' && (d.can_complete || o.created_by === S.user.id)) { const b2 = h('button', { class: 'btn d' }, t('Cancel order')); b2.onclick = busy(b2, async () => { const why = await askReason(t('Cancel order')); if (!why) return; await post(`/orders/${o.id}/cancel`, { reason: why }); toast(t('Saved'), 'ok'); reload(); }); acts.push(b2); }
    root.append(h('div', { class: 'card stack order ' + o.status }, h('div', { class: 'row sb' }, h('div', {}, h('b', { class: 'big' }, o.ref), ' ', pill(o.status === 'open' ? 'pending' : o.status), h('br'), h('small', { class: 'muted' }, `${o.branch_name} · ${o.created_by_name} · ${dt(o.created_at)}${o.customer_name ? ' · ' + tx(o.customer_name) : ''}`)), h('div', { class: 'big' }, money(o.total, o.currency))),
      table([{ label: 'Item', f: (l) => [l.description, h('br'), h('small', { class: 'muted' }, l.sku)] }, { label: 'Quantity', r: 1, k: 'qty' }, { label: 'Price', r: 1, f: (l) => money(l.unit_price, o.currency) }, { label: 'Discount', r: 1, f: (l) => (l.discount ? money(l.discount, o.currency) : '') }, { label: 'Total', r: 1, f: (l) => money(l.qty * l.unit_price - l.discount, o.currency) }], o.lines),
      o.status === 'completed' ? h('small', { class: 'muted' }, `${t('Completed by')} ${o.completed_by_name} · ${o.sale_ref || ''} · ${dt(o.completed_at)}`) : o.status === 'cancelled' ? h('small', { class: 'muted' }, `${t('Cancelled')}: ${o.cancel_reason || ''}`) : null,
      acts.length ? h('div', { class: 'row' }, acts) : null));
  }
  if (q.status === 'open') { const timer = setInterval(() => { if (!document.body.contains(root)) return clearInterval(timer); if (!document.querySelector('.overlay')) reload(); }, 20000); }
  return root;
}

// ---------------------------------------------------------------- price tags (barcodes)
const store = { get: (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } } };
const LAYOUTS = [['tag', 'Hang tags – A4 card, 16 per page (cut & punch)'], ['tagroll', 'Hang-tag printer (40 × 70 mm)'], ['sheet', 'Sticker sheet – A4, 3 × 8'], ['roll', 'Sticker printer (50 × 30 mm)']];
const CODES = [['barcode', 'Barcode (EAN-13 / Code 128) – shop & mall standard'], ['both', 'Barcode + QR (for phone cameras)'], ['qr', 'QR code only']];
const tagControls = () => ({
  layout: sel(LAYOUTS.map(([v, l]) => ({ value: v, label: l })), store.get('tag_layout', 'tag'), (v) => store.set('tag_layout', v), { 'aria-label': t('Tag type') }),
  code: sel(CODES.map(([v, l]) => ({ value: v, label: l })), store.get('tag_code', 'barcode'), (v) => store.set('tag_code', v), { 'aria-label': t('Code on the tag') }),
  copies: sel([{ value: 'stock', label: 'One tag per piece in stock' }, { value: '1', label: '1 tag each' }, { value: '2', label: '2 tags each' }, { value: '5', label: '5 tags each' }, { value: '10', label: '10 tags each' }], 'stock', null, { 'aria-label': t('Copies') }),
});
// Print dialog used after creating a product, after registering stock and from the inventory list
export function printTags(ids, branchId, { title } = {}) {
  const c = tagControls();
  modal({ title: title || t('Print price tags'), body: h('div', { class: 'stack' }, h('label', { class: 'f' }, t('Tag type'), c.layout), h('label', { class: 'f' }, t('Code on the tag'), c.code), h('label', { class: 'f' }, t('How many'), c.copies),
    h('small', { class: 'muted' }, t('The system generated a shop barcode for every size/colour. Stick one tag on each piece; the cashier scans it at the till or with the phone.'))),
  actions: (close) => [h('button', { class: 'btn', onclick: close }, t('Close')), h('button', { class: 'btn p', onclick: () => { close(); openDoc('/print/labels', { ids: [].concat(ids).join(','), copies: c.copies.value, layout: c.layout.value, code: c.code.value, branch_id: branchId }).catch((e) => toast(errText(e), 'bad')); } }, '🖨️ ' + t('Print'))] });
}
export async function labels(r) {
  const list = myBranches().filter((x) => x.business_type !== 'barber'); const b = pickBranch(r.q, list); if (!b) return h('div', { class: 'card empty' }, t('No data yet'));
  const q = { ...r.q }; const set = (k, v) => { location.hash = hashQ('/labels', { ...q, branch_id: b.id, [k]: v }); };
  const d = await get('/stock', { branch_id: b.id, q: q.q, limit: 200 }); const picked = new Set(); const c = tagControls();
  const count = h('b', {}, '0'); const upd = () => { count.textContent = String(picked.size); };
  const all = h('input', { type: 'checkbox', 'aria-label': t('Select all'), onchange: (e) => { root.querySelectorAll('.pick').forEach((x) => { x.checked = e.target.checked; x.onchange(); }); } });
  const printBtn = h('button', { class: 'btn p' }, '🖨️ ' + t('Print tags')); printBtn.onclick = busy(printBtn, async () => { if (!picked.size) throw new Error(t('Select at least one item')); await openDoc('/print/labels', { ids: [...picked].join(','), copies: c.copies.value, layout: c.layout.value, code: c.code.value, branch_id: b.id }); });
  const root = h('div', { class: 'stack' }, h('div', { class: 'card row pagehead' }, h('div', {}, h('h1', {}, t('Price tags')), h('small', { class: 'muted' }, t('Barcode tags for clothes, shoes and every item in the shop'))), h('span', { style: 'flex:1' }), list.length > 1 ? sel(list.map((x) => ({ value: x.id, label: x.name })), b.id, (v) => { location.hash = hashQ('/labels', { branch_id: v }); }, { 'aria-label': t('Branch') }) : h('b', {}, b.name)),
    h('div', { class: 'card stack' }, h('p', { class: 'muted' }, t('Every item gets its own shop barcode automatically when it is registered (EAN-13 in-store number, the type used on mall price tags). Print hang tags or stickers, attach one to each piece and scan it at the till, with a USB scanner or with the phone camera.')),
      h('div', { class: 'grid g3' }, h('label', { class: 'f' }, t('Tag type'), c.layout), h('label', { class: 'f' }, t('Code on the tag'), c.code), h('label', { class: 'f' }, t('How many'), c.copies)),
      h('div', { class: 'row' }, h('input', { placeholder: t('Search'), value: q.q || '', onchange: (e) => set('q', e.target.value), 'aria-label': t('Search') }), h('span', { style: 'flex:1' }), h('span', {}, t('Selected'), ': ', count), printBtn),
      table([{ label: all, f: (v) => { const x = h('input', { type: 'checkbox', class: 'pick', 'aria-label': v.sku }); x.onchange = () => { if (x.checked) picked.add(v.id); else picked.delete(v.id); upd(); }; return x; } }, { label: 'Barcode', f: (v) => h('img', { class: 'bcthumb', alt: v.barcode || v.sku, 'data-code': v.barcode || v.sku }) }, { label: 'Name', f: (v) => [v.name, h('br'), h('small', { class: 'muted' }, `${v.sku} ${attrText(v.attrs)}`)] }, { label: 'On hand', r: 1, k: 'qty' }, { label: 'Price', r: 1, f: (v) => [money(v.price, b.currency), v.was_price ? h('div', {}, h('small', { class: 'muted' }, h('s', {}, money(v.was_price, b.currency)))) : null] }, { label: 'Max discount', r: 1, f: (v) => pct(v.max_discount_bp) || '—' }], d.rows)));
  codeThumbs(root); return root;
}
// barcode previews are fetched with the session token (the image endpoint needs authentication)
export async function codeThumbs(root) { for (const img of root.querySelectorAll('img.bcthumb')) { try { const r = await fetch('/api/barcode?text=0&code=' + encodeURIComponent(img.dataset.code), { headers: { Authorization: 'Bearer ' + S.token } }); if (r.ok) img.src = URL.createObjectURL(await r.blob()); } catch { /* preview only */ } } }
