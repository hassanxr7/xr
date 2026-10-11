import { S, h, $, clear, t, get, post, toast, errText, setTheme, setLang, can, modal, busy, loading, dt, route } from './core.js';
import { views } from './views.js';

setTheme(S.theme); setLang(S.lang);
const app = $('#app');

async function boot() {
  if (!S.token) return loginView();
  try { S.user = await get('/auth/me'); } catch { sessionStorage.removeItem('tok'); S.token = null; return loginView(); }
  if (S.user.platform) { location.hash = '#/platform'; }
  if (S.user.lang && !localStorage.getItem('lang')) setLang(S.user.lang);
  shell(); render();
}
function loginView(totp) {
  clear(app);
  const email = h('input', { type: 'email', autocomplete: 'username', required: true, 'aria-label': t('Email') }); const pw = h('input', { type: 'password', autocomplete: 'current-password', required: true, 'aria-label': t('Password') }); const code = h('input', { inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 6, placeholder: '123456' });
  const btn = h('button', { class: 'btn p', style: 'width:100%;justify-content:center' }, t('Sign in')); const err = h('p', { class: 'muted', style: 'color:var(--bad)', role: 'alert' });
  const form = h('form', { class: 'stack', onsubmit: (e) => e.preventDefault() }, h('div', { class: 'row', style: 'gap:8px' }, h('div', { class: 'brand', style: 'padding:0' }, h('i'), 'BizSuite'), h('span', { class: 'sp', style: 'flex:1' }), langSel()), h('label', { class: 'f' }, t('Email'), email), h('label', { class: 'f' }, t('Password'), pw), totp ? h('label', { class: 'f' }, t('Authentication code'), code) : null, err, btn);
  btn.onclick = async () => { err.textContent = ''; btn.disabled = true; try { const r = await post('/auth/login', { email: email.value, password: pw.value, totp: code.value || undefined }); S.token = r.token; sessionStorage.setItem('tok', r.token); boot(); } catch (e) { if (e.code === 'totp_required') { loginView(true); return; } err.textContent = errText(e); } finally { btn.disabled = false; } };
  app.append(h('div', { class: 'login' }, h('div', { class: 'card' }, form))); email.focus();
}
const langSel = () => h('select', { 'aria-label': t('Language'), onchange: (e) => { setLang(e.target.value); S.token ? (shell(), render()) : loginView(); } }, h('option', { value: 'en', selected: S.lang === 'en' }, 'English'), h('option', { value: 'so', selected: S.lang === 'so' }, 'Soomaali'));

const NAV = () => {
  const u = S.user; const m = (x) => u.modules.includes(x); const items = [];
  const add = (grp, path, label, ok) => { if (ok) items.push({ grp, path, label }); };
  add('', '/dashboard', 'Dashboard', can('dashboard.view'));
  add('Sell', '/pos', 'Point of sale', can('sales.create') && m('sales')); add('Sell', '/visits', 'Barber visits', (can('services.create') || can('services.view')) && m('services'));
  add('Sell', '/quotes', 'Quotations', can('sales.view') && m('sales')); add('Sell', '/sales', 'Sales', can('sales.view') && m('sales') || can('services.view') && m('services')); add('Sell', '/repairs', 'Repairs', can('repairs.view') && m('repairs'));
  add('Stock', '/inventory', 'Inventory', can('products.view') && (m('inventory') || m('products'))); add('Stock', '/transfers', 'Transfers', can('inventory.view') && m('inventory')); add('Stock', '/purchases', 'Purchases', can('purchases.view') && m('purchases')); add('Stock', '/devices', 'Devices', can('devices.view') && m('devices'));
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
  let last = null; const nav = h('nav', { class: 'nav', 'aria-label': 'Main' }, NAV().map((i) => { const a = [i.grp !== last ? h('div', { class: 'grp' }, i.grp ? t(i.grp) : null) : null, h('a', { href: '#' + i.path, 'data-path': i.path }, t(i.label))]; last = i.grp; return a; }));
  const side = h('aside', { class: 'side', id: 'side' }, h('div', { class: 'brand' }, h('i'), 'BizSuite'), nav);
  app.append(h('div', { class: 'shell' }, side, h('div', { class: 'main' }, topbar(side), h('div', { class: 'content', id: 'view' }))));
  side.addEventListener('click', (e) => { if (e.target.closest('a')) side.classList.remove('open'); });
}
function topbar(side) {
  bell = h('button', { class: 'btn', 'aria-label': t('Notifications'), onclick: showNotifs }, '🔔', h('span', { id: 'nbadge', class: 'pill bad', style: 'display:none' }));
  const theme = h('button', { class: 'btn', title: t('Dark mode'), 'aria-label': t('Dark mode'), onclick: () => { const dark = document.documentElement.getAttribute('data-theme') === 'dark' || (S.theme === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches); setTheme(dark ? 'light' : 'dark'); } }, '◐');
  const ro = S.user.read_only ? h('span', { class: 'pill warn' }, 'Read-only support session') : null;
  setTimeout(pollNotifs, 300);
  return h('div', { class: 'top' }, side ? h('button', { class: 'btn burger', 'aria-label': 'Menu', onclick: () => side.classList.toggle('open') }, '☰') : null, h('b', {}, S.user.org?.name || 'BizSuite'), ro, h('span', { class: 'sp' }), S.user.platform ? null : bell, langSel(), theme,
    h('button', { class: 'btn', onclick: userMenu }, S.user.name, ' ', h('small', {}, S.user.role || (S.user.platform ? 'Platform' : ''))));
}
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
  modal({ title: S.user.name, body: h('div', { class: 'stack' }, h('div', {}, S.user.email, ' · ', S.user.role), cur, np, chg, h('div', { class: 'sep' }), setup, tf), actions: (close) => [out, h('button', { class: 'btn', onclick: close }, t('Close'))] });
}
async function render() {
  const r = route(); const view = $('#view'); if (!view) return; document.querySelectorAll('.nav a').forEach((a) => a.classList.toggle('on', r.path.startsWith(a.dataset.path)));
  const v = views[r.parts[0] || 'dashboard'] || views.notfound; clear(view); view.append(loading());
  try { const el = await v(r); clear(view); if (el) view.append(el); } catch (e) { clear(view); view.append(h('div', { class: 'card' }, h('p', { style: 'color:var(--bad)' }, errText(e)))); }
  view.focus?.();
}
addEventListener('hashchange', () => { if (S.token && S.user) render(); });
boot();
