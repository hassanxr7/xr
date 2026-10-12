import { S, h, $, clear, t, tx, get, post, toast, errText, setTheme, setLang, can, modal, busy, loading, dt, route, brandLogo, loadBrand, langSwitch, langChosen, icon, money, hashQ } from './core.js';
import { views } from './views.js';

setTheme(S.theme); setLang(S.lang, false);
const app = $('#app');

let installEvt = null; // set by beforeinstallprompt (see the end of this file)
async function boot() {
  await loadBrand(); if (!langChosen()) setLang(S.brand.default_lang || 'en', false);
  if (!S.token) return loginView();
  try { S.user = await get('/auth/me'); } catch { sessionStorage.removeItem('tok'); S.token = null; return loginView(); }
  if (S.user.platform) { location.hash = '#/platform'; }
  // each person's saved language wins on shared shop devices; a choice made on the sign-in page is saved to the account
  const pick = sessionStorage.getItem('lang_pick'); sessionStorage.removeItem('lang_pick');
  if (pick && !S.user.platform && pick !== S.user.lang) { S.user.lang = pick; post('/auth/lang', { lang: pick }).catch(() => {}); }
  if (!S.user.platform) setLang(S.user.lang || S.brand.default_lang || 'en', false); else if (!langChosen()) setLang(S.brand.default_lang || 'en', false);
  if (!S.user.platform && (!location.hash || location.hash === '#/' || location.hash === '#/login')) location.hash = '#' + home();
  shell(); render();
  if (S.user.must_change_password) forcePasswordChange();
}
function loginView(totp) {
  clear(app);
  const email = h('input', { type: 'email', autocomplete: 'username', required: true, 'aria-label': t('Email') }); const pw = h('input', { type: 'password', autocomplete: 'current-password', required: true, 'aria-label': t('Password') }); const code = h('input', { inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 6, placeholder: '123456' });
  const btn = h('button', { class: 'btn p', style: 'width:100%;justify-content:center;min-height:44px' }, t('Sign in')); const err = h('p', { class: 'muted', style: 'color:var(--bad);margin:0', role: 'alert' });
  const form = h('form', { class: 'stack', onsubmit: (e) => e.preventDefault() }, h('div', { class: 'row sb' }, h('h1', {}, t('Sign in')), langSel()), h('p', { class: 'muted', style: 'margin:4px 0 6px' }, t('Welcome back. Use the account your manager gave you.')),
    h('label', { class: 'f' }, t('Email'), email), h('label', { class: 'f' }, t('Password'), pw), totp ? h('label', { class: 'f' }, t('Authentication code'), code) : null, err, btn);
  btn.onclick = async () => { err.textContent = ''; btn.disabled = true; try { const r = await post('/auth/login', { email: email.value, password: pw.value, totp: code.value || undefined }); S.token = r.token; sessionStorage.setItem('tok', r.token); boot(); } catch (e) { if (e.code === 'totp_required') { loginView(true); return; } err.textContent = errText(e); } finally { btn.disabled = false; } };
  const shops = (S.brand.tagline || '').split(/·|\|/).map((x) => x.trim()).filter(Boolean);
  const hero = h('div', { class: 'hero' }, h('div', {}, h('span', { class: 'logoswap' }, h('img', { class: 'brandlogo', src: '/api/branding/logo?v=' + (S.brand.v || 0), alt: S.brand.name })), h('h2', {}, t('Every shop, every sale, every barber - in one place.')), h('p', {}, t('Sales, stock with shop barcodes, barber work and commissions, expenses and profit for each branch, live for the owner.')), shops.length ? h('div', { class: 'shops' }, shops.map((x) => h('span', {}, x))) : null), h('small', {}, S.brand.name));
  app.append(h('div', { class: 'login' }, S.brand.has_logo ? hero : h('div', { class: 'hero' }, h('h2', {}, S.brand.name)), h('div', { class: 'pane' }, h('div', { class: 'card' }, h('div', { class: 'mobilelogo' }, brandLogo()), form)))); email.focus();
}
const langSel = () => langSwitch((v) => { setLang(v); if (!S.token) sessionStorage.setItem('lang_pick', v); if (S.token && S.user && !S.user.platform) { S.user.lang = v; post('/auth/lang', { lang: v }).catch(() => {}); } S.token && S.user ? (shell(), render()) : loginView(); });

// where each person lands: owners/accountants on the group dashboard, branch managers on their shop board,
// sales assistants on the scanner, barbers on their own day
function home() {
  const u = S.user; const has = (p) => NAV().some((i) => i.path === p);
  const order = u.scope === 'org' ? ['/dashboard', '/shop'] : can('sales.approve') || can('services.approve') ? ['/shop', '/dashboard']
    : can('orders.create') && !can('sales.create') ? ['/scan', '/shop'] : can('sales.create') ? ['/pos', '/scan', '/visits', '/shop'] : can('services.create') ? ['/visits', '/shop'] : ['/shop', '/repairs', '/commissions', '/dashboard'];
  return order.find(has) || NAV()[0]?.path || '/dashboard';
}
const NAV_ICONS = { '/dashboard': 'grid', '/shop': 'home', '/scan': 'maximize', '/orders': 'inbox', '/pos': 'shopping-cart', '/visits': 'scissors', '/queue': 'clock', '/quotes': 'file-text', '/sales': 'list', '/repairs': 'tool', '/inventory': 'package', '/transfers': 'repeat', '/purchases': 'truck', '/devices': 'smartphone', '/labels': 'tag', '/reorder': 'refresh-cw', '/customers': 'users', '/suppliers': 'briefcase', '/expenses': 'trending-down', '/registers': 'archive', '/payments': 'credit-card', '/commissions': 'percent', '/reports': 'bar-chart-2', '/approvals': 'check-circle', '/staff': 'user-check', '/roles': 'shield', '/organisation': 'layers', '/settings': 'settings', '/audit': 'activity', '/platform': 'layers' };
const NAV = () => {
  const u = S.user; const m = (x) => u.modules.includes(x); const items = [];
  const add = (grp, path, label, ok) => { if (ok) items.push({ grp, path, label, icon: NAV_ICONS[path] }); };
  add('', '/dashboard', 'Dashboard', can('dashboard.view') && (u.scope === 'org' || !can('sales.approve')));
  add('', '/shop', 'My shop', can('dashboard.view'));
  add('Sell', '/scan', 'Scan & sell', (can('orders.create') || can('sales.create')) && m('sales'));
  add('Sell', '/orders', 'Orders', (can('orders.create') || can('sales.approve')) && m('sales'));
  add('Sell', '/pos', 'Point of sale', can('sales.create') && m('sales')); add('Sell', '/visits', 'Barber visits', (can('services.create') || can('services.view')) && m('services')); add('Sell', '/queue', 'Waiting queue', (can('services.create') || can('services.view')) && m('services'));
  add('Sell', '/quotes', 'Quotations', can('sales.view') && m('sales')); add('Sell', '/sales', 'Sales', can('sales.view') && m('sales') || can('services.view') && m('services')); add('Sell', '/repairs', 'Repairs', can('repairs.view') && m('repairs'));
  add('Stock', '/inventory', 'Inventory', can('products.view') && (m('inventory') || m('products'))); add('Stock', '/transfers', 'Transfers', can('inventory.view') && m('inventory')); add('Stock', '/purchases', 'Purchases', can('purchases.view') && m('purchases')); add('Stock', '/devices', 'Devices', can('devices.view') && m('devices')); add('Stock', '/labels', 'Price tags', can('products.view') && m('products'));
  add('People', '/customers', 'Customers', can('customers.view')); add('People', '/suppliers', 'Suppliers', can('suppliers.view'));
  add('Money', '/expenses', 'Expenses', can('expenses.view')); add('Money', '/registers', 'Cash registers', can('registers.view')); add('Money', '/payments', 'Payments', can('payments.view'));
  add('Money', '/commissions', 'Commissions', can('commissions.view') && (m('commissions') || m('repairs'))); add('Money', '/reports', 'Reports', can('reports.view') || can('expenses.view') || can('inventory.view'));
  add('Admin', '/approvals', 'Approvals', can('approvals.view')); add('Admin', '/staff', 'Staff', can('staff.view')); add('Admin', '/roles', 'Roles', can('roles.view')); add('Admin', '/organisation', 'Organisation', can('branches.view') || can('branches.create') || u.scope === 'org');
  add('Admin', '/settings', 'Settings', can('settings.view') || can('settings.settings') || can('services.settings')); add('Admin', '/audit', 'Audit log', can('audit.view'));
  return items;
};
let bell;
function shell() {
  clear(app); if (S.user.platform) { return app.append(h('div', { class: 'main' }, topbar(), h('div', { class: 'content', id: 'view' }))); }
  const items = NAV(); let last = null;
  const nav = h('nav', { class: 'nav', 'aria-label': t('Menu') }, items.map((i) => { const a = [i.grp !== last ? h('div', { class: 'grp' }, i.grp ? t(i.grp) : null) : null, h('a', { href: '#' + i.path, 'data-path': i.path }, icon(i.icon || 'chevron-right'), h('span', {}, t(i.label)))]; last = i.grp; return a; }));
  const side = h('aside', { class: 'side', id: 'side' }, h('a', { class: 'brand', href: '#' + home(), 'aria-label': S.brand.name }, brandLogo()), nav);
  // phones: the four most used screens of this role at the bottom, everything else in the menu
  const pick = [home(), ...['/scan', '/queue', '/visits', '/orders', '/pos', '/sales', '/inventory', '/reports'].filter((p) => p !== home())].filter((p, k, arr) => arr.indexOf(p) === k && items.some((i) => i.path === p)).slice(0, 4);
  const bottom = h('nav', { class: 'bottomnav', 'aria-label': t('Quick menu') }, pick.map((p) => { const i = items.find((x) => x.path === p); return h('a', { href: '#' + p, 'data-path': p }, icon(i.icon), h('span', {}, t(i.label))); }), h('button', { type: 'button', onclick: () => side.classList.toggle('open') }, icon('menu'), h('span', {}, t('Menu'))));
  app.append(h('div', { class: 'shell' }, side, h('div', { class: 'main' }, topbar(side), h('div', { class: 'content', id: 'view', tabindex: '-1' }))), bottom);
  side.addEventListener('click', (e) => { if (e.target.closest('a')) side.classList.remove('open'); });
}
function topbar(side) {
  bell = h('button', { class: 'btn iconbtn', title: t('Notifications'), 'aria-label': t('Notifications'), onclick: showNotifs }, icon('bell'), h('span', { id: 'nbadge', class: 'pill bad', style: 'display:none' }));
  const isDark = () => document.documentElement.getAttribute('data-theme') === 'dark' || (S.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  const theme = h('button', { class: 'btn iconbtn', title: t('Dark mode'), 'aria-label': t('Dark mode'), onclick: () => { setTheme(isDark() ? 'light' : 'dark'); theme.replaceChildren(icon(isDark() ? 'sun' : 'moon')); } }, icon(isDark() ? 'sun' : 'moon'));
  const ro = S.user.read_only ? h('span', { class: 'pill warn' }, t('Read-only support session')) : null;
  const initials = (S.user.name || '?').split(/\s+/).filter((x) => /^[A-Za-z]/.test(x)).slice(0, 2).map((x) => x[0].toUpperCase()).join('') || '?';
  setTimeout(pollNotifs, 300);
  return h('div', { class: 'top' }, side ? h('button', { class: 'btn iconbtn burger', 'aria-label': t('Menu'), onclick: () => side.classList.toggle('open') }, icon('menu')) : null,
    h('span', { class: 'org' }, S.user.org?.name || S.brand.name), S.user.branches && S.user.branches.length <= 4 ? S.user.branches.map((b) => h('span', { class: 'chip', title: b.name }, h('i', { style: `background:${b.color || 'var(--brand)'}` }), b.name)) : null, ro, h('span', { class: 'sp' }),
    S.user.platform ? null : searchBox(), installButton(), S.user.platform ? null : bell, langSel(), theme,
    h('button', { class: 'btn userbtn', onclick: userMenu, 'aria-label': S.user.name }, h('span', { class: 'avatar' }, initials), h('span', { class: 'nm' }, S.user.name.replace(/\s*\(.*\)$/, '')), h('small', {}, tx(S.user.role) || (S.user.platform ? 'Platform' : ''))));
}
// Global search (Ctrl+K or /): items by name, SKU or barcode, customers, sales and visits, repairs, orders
function searchBox() {
  const input = h('input', { type: 'search', placeholder: t('Search items, barcodes, customers, sales…'), 'aria-label': t('Search'), autocomplete: 'off' }); const box = h('div', { class: 'gresults', style: 'display:none', role: 'listbox' });
  const wrap = h('div', { class: 'gsearch' }, icon('search'), input, h('kbd', {}, 'Ctrl K'), box); let timer = null, seq = 0;
  const close = () => { box.style.display = 'none'; };
  const go = (href) => { close(); input.value = ''; location.hash = href; };
  async function run() {
    const q = input.value.trim(); if (q.length < 2) return close(); const my = ++seq; let r; try { r = await get('/search', { q }); } catch { return; } if (my !== seq) return;
    const grp = (label, rows, f) => (rows.length ? [h('div', { class: 'grp' }, t(label)), ...rows.map(f)] : []);
    const att = (a) => { try { return Object.values(typeof a === 'string' ? JSON.parse(a) : a || {}).join(' / '); } catch { return ''; } };
    const el = [
      ...grp('Items', r.items, (x) => h('a', { href: '#', onclick: (e) => { e.preventDefault(); go(hashQ('/inventory', { q: x.sku })); } }, h('span', {}, h('b', {}, x.name), ' ', h('small', { class: 'muted' }, [att(x.attrs), x.sku].filter(Boolean).join(' · '))), h('small', {}, `${x.qty} · ${money(x.price, S.user.branches.find((b) => b.business_id === x.business_id)?.currency || 'USD')}`))),
      ...grp('Customers', r.customers, (x) => h('a', { href: '#', onclick: (e) => { e.preventDefault(); go(hashQ('/customers', { q: x.name })); } }, h('span', {}, x.name), h('small', {}, x.phone || ''))),
      ...grp('Sales', r.sales, (x) => h('a', { href: '#', onclick: (e) => { e.preventDefault(); go(hashQ('/sales', { q: x.ref, preset: 'custom', open: x.id })); } }, h('span', {}, h('b', {}, x.ref), ' ', h('small', { class: 'muted' }, tx(x.customer_name) || '')), h('small', {}, money(x.total, x.currency)))),
      ...grp('Repairs', r.repairs, (x) => h('a', { href: '#', onclick: (e) => { e.preventDefault(); go(hashQ('/repairs', { q: x.ref })); } }, h('span', {}, h('b', {}, x.ref), ' ', h('small', { class: 'muted' }, x.customer_name || '')), h('small', {}, t(x.status)))),
      ...grp('Orders', r.orders, (x) => h('a', { href: '#', onclick: (e) => { e.preventDefault(); go(hashQ('/orders', { status: '' })); } }, h('span', {}, h('b', {}, x.ref)), h('small', {}, money(x.total, x.currency)))),
    ];
    clear(box); box.append(...(el.length ? el : [h('div', { class: 'empty', style: 'border:0' }, t('Nothing found'))])); box.style.display = '';
  }
  input.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(run, 220); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape') { close(); input.blur(); } if (e.key === 'Enter') { const a = box.querySelector('a'); if (a) a.click(); } });
  input.addEventListener('focus', () => { if (input.value.trim().length >= 2) run(); });
  document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) close(); });
  return wrap;
}
addEventListener('keydown', (e) => { if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || ''))) { const i = document.querySelector('.gsearch input'); if (i) { e.preventDefault(); i.focus(); i.select(); } } });
async function pollNotifs() { if (S.user.platform) return; try { const r = await get('/notifications', { unread: 1 }); const b = $('#nbadge'); if (b) { b.textContent = r.unread; b.style.display = r.unread ? '' : 'none'; } } catch { /* ignore */ } }
async function showNotifs() {
  const body = h('div', {}, loading()); const m = modal({ title: t('Notifications'), wide: true, body, actions: (close) => [h('button', { class: 'btn', onclick: close }, t('Close'))] });
  try {
    const r = await get('/notifications', { limit: 60 }); clear(body);
    body.append(r.rows.length ? h('div', { class: 'stack' }, r.rows.map((n) => h('div', { class: 'row sb', style: 'border-bottom:1px solid var(--line);padding-bottom:6px' }, h('div', {}, h('div', { style: n.read_at ? 'color:var(--muted)' : 'font-weight:600' }, n.message), h('small', {}, dt(n.created_at))), n.link ? h('a', { href: n.link, onclick: () => m.close() }, '→') : null))) : h('div', { class: 'empty' }, t('No data yet')));
    await post('/notifications/read', { ids: r.rows.filter((n) => !n.read_at).map((n) => n.id) }); pollNotifs();
  } catch (e) { clear(body); body.append(errText(e)); }
}
function userMenu() {
  const cur = h('input', { type: 'password', autocomplete: 'current-password', placeholder: t('Current password') }); const np = h('input', { type: 'password', autocomplete: 'new-password', placeholder: t('New password') });
  const chg = h('button', { class: 'btn' }, t('Change password')); chg.onclick = busy(chg, async () => { await post('/auth/password', { current: cur.value, password: np.value }); toast(t('Saved'), 'ok'); cur.value = np.value = ''; });
  const out = h('button', { class: 'btn d' }, t('Sign out')); out.onclick = async () => { try { await post('/auth/logout'); } catch { /* ignore */ } sessionStorage.removeItem('tok'); location.hash = ''; location.reload(); };
  const tf = h('div', {}); const setup = h('button', { class: 'btn' }, S.user.totp_enabled ? t('2FA is enabled') : t('Enable two-factor authentication')); setup.disabled = S.user.totp_enabled;
  setup.onclick = busy(setup, async () => { const r = await post('/auth/2fa/setup'); const code = h('input', { inputmode: 'numeric', maxlength: 6, placeholder: '123456' }); clear(tf); tf.append(h('p', {}, t('Add this key to your authenticator app:'), ' ', h('code', {}, r.secret)), code, h('button', { class: 'btn p', onclick: async () => { try { await post('/auth/2fa/enable', { code: code.value }); toast(t('Saved'), 'ok'); S.user.totp_enabled = true; } catch (e) { toast(errText(e), 'bad'); } } }, t('Confirm'))); });
  modal({ title: S.user.name, body: h('div', { class: 'stack' }, h('div', {}, S.user.email, ' · ', tx(S.user.role)), cur, np, chg, h('div', { class: 'sep' }), setup, tf), actions: (close) => [out, h('button', { class: 'btn', onclick: close }, t('Close'))] });
}
let renderSeq = 0;
async function render() {
  const r = route(); const view = $('#view'); if (!view) return; document.querySelectorAll('.nav a, .bottomnav a').forEach((a) => a.classList.toggle('on', r.path.startsWith(a.dataset.path)));
  if ((!r.parts[0] || r.parts[0] === 'dashboard') && !can('dashboard.view') && !S.user.platform && home() !== '/dashboard') { location.hash = '#' + home(); return; } // nobody lands on a page they cannot open
  const v = views[r.parts[0] || 'dashboard'] || views.notfound; clear(view); view.append(loading()); const seq = ++renderSeq;
  // a slower, older page must never replace the page the user has moved on to
  try { const el = await v(r); if (seq !== renderSeq) return; clear(view); if (el) view.append(el); } catch (e) { if (seq !== renderSeq) return; clear(view); view.append(h('div', { class: 'card' }, h('p', { style: 'color:var(--bad)' }, errText(e)))); }
  view.focus?.({ preventScroll: true });
}
addEventListener('hashchange', () => { if (S.token && S.user) render(); });
boot();

// Accounts created by an administrator (or the first owner) must replace the initial password before doing anything else (also enforced by the server).
function forcePasswordChange() {
  const cur = h('input', { type: 'password', autocomplete: 'current-password', placeholder: t('Current password') }); const np = h('input', { type: 'password', autocomplete: 'new-password', placeholder: t('New password') }); const np2 = h('input', { type: 'password', autocomplete: 'new-password', placeholder: t('Repeat new password') });
  const ok = h('button', { class: 'btn p' }, t('Change password')); const m = modal({ title: t('Choose a new password'), body: h('div', { class: 'stack' }, h('p', {}, t('For security you must replace the initial password before you continue.')), cur, np, np2), actions: () => [ok] }); m.el.dataset.sticky = '1'; m.el.querySelector('header button').remove();
  ok.onclick = busy(ok, async () => { if (np.value !== np2.value) throw new Error(t('Passwords do not match')); await post('/auth/password', { current: cur.value, password: np.value }); toast(t('Saved'), 'ok'); S.user.must_change_password = false; location.reload(); });
}

// Installable app: register the service worker and offer "Install app" where the browser supports it (Android/desktop Chrome, Edge).
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; document.querySelectorAll('.installbtn').forEach((b) => { b.style.display = ''; }); });
export function installButton() { const b = h('button', { class: 'btn installbtn', style: installEvt ? '' : 'display:none', onclick: async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice.catch(() => {}); installEvt = null; b.style.display = 'none'; } }, '📲 ', t('Install app')); return b; }
