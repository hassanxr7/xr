import { so } from './i18n.js';
// Element.append ignores null/false and flattens arrays, so conditional children never render as the text "null".
const _append = Element.prototype.append; Element.prototype.append = function (...a) { return _append.apply(this, a.flat(Infinity).filter((x) => x != null && x !== false)); };
export const S = { brand: { name: 'Hubdex Store LTD', has_logo: false }, user: null, token: sessionStorage.getItem('tok'), lang: localStorage.getItem('lang') || 'en', theme: localStorage.getItem('theme') || 'auto', methods: [] };
const store = { set(k, v) { try { localStorage.setItem(k, v); } catch { /* storage may be unavailable */ } } };
export const t = (k, p) => { let s = (S.lang === 'so' && so[k]) || k; if (p) for (const [a, b] of Object.entries(p)) s = s.replace(`{${a}}`, b); return s; };
export function h(tag, props, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (k === 'value') e.value = v; else if (k === 'checked' || k === 'disabled' || k === 'selected' || k === 'required') e[k] = !!v; else e.setAttribute(k, v === true ? '' : v);
  }
  const spread = /(^|\s)sb(\s|$)/.test((props && props.class) || ''); // space-between rows: wrap bare text so label/value stay separate flex items
  const add = (c) => { if (c == null || c === false) return; if (Array.isArray(c)) c.forEach(add); else if (spread && !c.nodeType) e.append(h('span', {}, String(c))); else e.append(c.nodeType ? c : document.createTextNode(String(c))); };
  kids.forEach(add); return e;
}
export const $ = (s, r = document) => r.querySelector(s);
export const clear = (el) => { while (el.firstChild) el.removeChild(el.firstChild); return el; };

// ---- money (integers in minor units; string parsing only) ----
const EXP = { USD: 2, EUR: 2, GBP: 2, KES: 2, ETB: 2, AED: 2, SOS: 0, SLSH: 0, DJF: 0 }; export const exp = (c) => (c in EXP ? EXP[c] : 2);
export function money(n, ccy = 'USD') { if (n == null) return '–'; const e = exp(ccy), neg = n < 0, s = String(Math.abs(n)).padStart(e + 1, '0'); const w = s.slice(0, s.length - e).replace(/\B(?=(\d{3})+(?!\d))/g, ','); return `${neg ? '-' : ''}${w}${e ? '.' + s.slice(-e) : ''} ${ccy}`; }
export function parseMoney(str, ccy = 'USD') { const e = exp(ccy); const m = /^(-?)(\d*)(?:\.(\d*))?$/.exec(String(str).trim().replace(/,/g, '')); if (!m || (!m[2] && !m[3])) throw new Error(t('err.invalid_amount')); const f = (m[3] || '').padEnd(e, '0'); if (f.length > e) throw new Error(t('err.invalid_amount')); return (m[1] ? -1 : 1) * Number((m[2] || '0') + f); }
export const plain = (n, ccy = 'USD') => { const e = exp(ccy); return e ? (n / 10 ** e).toFixed(e) : String(n); };

// ---- API ----
export class ApiError extends Error { constructor(status, e) { super(e.message || 'Error'); this.status = status; this.code = e.code; this.params = e.params; } }
export function errText(e) { if (e instanceof ApiError) { const k = 'err.' + e.code; const tr = t(k); return tr !== k ? tr : e.message; } return e.message || t('Something went wrong'); }
const qs = (q) => { const p = new URLSearchParams(); for (const [k, v] of Object.entries(q || {})) if (v !== '' && v != null) p.set(k, v); const s = p.toString(); return s ? '?' + s : ''; };
export async function api(method, path, body, query, opts = {}) {
  if (S.lang === 'so' && /^\/(reports|print|notifications)/.test(path)) query = { ...(query || {}), lang: 'so' };
  const headers = { 'Content-Type': 'application/json' }; if (S.token) headers.Authorization = 'Bearer ' + S.token; if (opts.idem) headers['Idempotency-Key'] = opts.idem;
  const r = await fetch('/api' + path + qs(query), { method, headers, body: method === 'GET' ? undefined : JSON.stringify(body || {}) });
  if (opts.raw) { if (!r.ok) throw new ApiError(r.status, (await r.json().catch(() => ({}))).error || {}); return r; }
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && S.token && path !== '/auth/login') { sessionStorage.removeItem('tok'); S.token = null; location.hash = '#/login'; location.reload(); }
  if (!r.ok) throw new ApiError(r.status, j.error || {});
  return j;
}
export const get = (p, q) => api('GET', p, null, q); export const post = (p, b, o) => api('POST', p, b, null, o); export const patch = (p, b) => api('PATCH', p, b);
export const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now());
export async function download(path, query, filename) { const r = await api('GET', path, null, query, { raw: true }); const b = await r.blob(); const a = h('a', { href: URL.createObjectURL(b), download: filename }); document.body.append(a); a.click(); a.remove(); }
export async function printDoc(path, query) { const r = await api('GET', path, null, query, { raw: true }); const html = await r.text(); const f = h('iframe', { style: 'position:fixed;right:0;bottom:0;width:0;height:0;border:0', srcdoc: html }); f.onload = () => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 60000); }; document.body.append(f); }
export async function openDoc(path, query) { const r = await api('GET', path, null, query, { raw: true }); const html = await r.text(); modal({ title: t('Print'), wide: true, body: h('iframe', { srcdoc: html, style: 'width:100%;height:60vh;border:1px solid var(--line);border-radius:8px;background:#fff' }), actions: (close) => [h('button', { class: 'btn p', onclick: () => { printDoc(path, query); } }, t('Print')), h('button', { class: 'btn', onclick: close }, t('Close'))] }); }

// ---- UI kit ----
export function toast(msg, type = '') { let c = $('.toasts'); if (!c) { c = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' }); document.body.append(c); } const e = h('div', { class: 'toast ' + type }, msg); c.append(e); setTimeout(() => e.remove(), type === 'bad' ? 7000 : 3500); }
export function modal({ title, body, actions, wide }) {
  const close = () => ov.remove(); const ov = h('div', { class: 'overlay', onmousedown: (e) => { if (e.target === ov && !ov.dataset.sticky) close(); } },
    h('div', { class: 'modal' + (wide ? '' : ' sm'), role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, h('header', {}, h('h2', { style: 'margin:0' }, title), h('button', { class: 'btn s', onclick: close, 'aria-label': t('Close') }, '✕')), h('div', { class: 'body' }, body), actions ? h('footer', {}, actions(close)) : null));
  document.body.append(ov); const f = ov.querySelector('input,select,textarea'); if (f) f.focus(); return { close, el: ov };
}
export const confirmDlg = (msg, { danger, ok } = {}) => new Promise((res) => { let done = false; const m = modal({ title: t('Are you sure?'), body: h('p', {}, msg), actions: (close) => [h('button', { class: 'btn', onclick: () => { done = true; close(); res(false); } }, t('Cancel')), h('button', { class: 'btn ' + (danger ? 'd' : 'p'), onclick: () => { done = true; close(); res(true); } }, ok || t('Confirm'))] }); new MutationObserver(() => { if (!document.body.contains(m.el) && !done) res(false); }).observe(document.body, { childList: true }); });
export const askReason = (title) => new Promise((res) => { const i = h('input', { placeholder: t('Reason'), required: true }); modal({ title, body: i, actions: (close) => [h('button', { class: 'btn', onclick: () => { close(); res(null); } }, t('Cancel')), h('button', { class: 'btn p', onclick: () => { if (!i.value.trim()) return i.focus(); close(); res(i.value.trim()); } }, t('Confirm'))] }); });
// Run an async action with a busy state on the button; shows errors as toasts
export function busy(btn, fn) { return async (...a) => { if (btn.disabled) return; btn.disabled = true; const old = btn.textContent; btn.textContent = '…'; try { return await fn(...a); } catch (e) { toast(errText(e), 'bad'); } finally { btn.disabled = false; btn.textContent = old; } }; }
export function field(f, val) {
  const base = { name: f.name, required: f.required };
  let input;
  if (f.type === 'select') input = h('select', base, f.placeholder != null ? h('option', { value: '' }, f.placeholder) : null, (f.options || []).map((o) => h('option', { value: o.value, selected: String(o.value) === String(val ?? '') }, t(o.label))));
  else if (f.type === 'textarea') input = h('textarea', { ...base, rows: 3 }, val ?? '');
  else if (f.type === 'checkbox') return h('label', { class: 'f chk' }, h('input', { type: 'checkbox', name: f.name, checked: !!val }), t(f.label));
  else input = h('input', { ...base, type: f.type === 'money' || f.type === 'percent' ? 'text' : f.type || 'text', inputmode: f.type === 'money' || f.type === 'percent' || f.type === 'number' ? 'decimal' : null, value: val ?? '', placeholder: f.hint, min: f.min, step: f.step, autocomplete: f.type === 'password' ? 'new-password' : 'off', maxlength: f.max });
  return h('label', { class: 'f' + (f.full ? ' full' : '') }, t(f.label), input);
}
// Reads a form made of field()s into typed values. money => minor units, percent => basis points
export function readForm(root, fields, ccy) {
  const out = {};
  for (const f of fields) {
    const el = root.querySelector(`[name="${f.name}"]`); if (!el) continue; let v = f.type === 'checkbox' ? el.checked : el.value.trim();
    if (f.type !== 'checkbox' && v === '') { if (f.required) throw new Error(t('Required field') + ': ' + t(f.label)); continue; }
    if (f.type === 'money') v = parseMoney(v, f.ccy || ccy); else if (f.type === 'percent') { const n = Number(v); if (!(n >= 0 && n <= 100)) throw new Error(t('err.invalid_amount')); v = Math.round(n * 100); } else if (f.type === 'number' || f.type === 'select' && f.num) v = Number(v);
    out[f.name] = v;
  }
  return out;
}
export function formModal({ title, fields, initial = {}, ccy, submit, label = 'Save', wide }) {
  const form = h('form', { class: 'form', onsubmit: (e) => e.preventDefault() }, fields.map((f) => field(f, f.type === 'money' && initial[f.name] != null ? plain(initial[f.name], f.ccy || ccy) : f.type === 'percent' && initial[f.name] != null ? initial[f.name] / 100 : initial[f.name])));
  const m = modal({ title, wide, body: form, actions: (close) => { const ok = h('button', { class: 'btn p' }, t(label)); ok.onclick = busy(ok, async () => { let v; try { v = readForm(form, fields, ccy); } catch (e) { toast(e.message, 'bad'); return; } const r = await submit(v); if (r !== false) close(); }); return [h('button', { class: 'btn', onclick: close }, t('Cancel')), ok]; } });
  form.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); m.el.querySelector('footer .p').click(); } });
  return m;
}
export const pill = (s, kind) => h('span', { class: 'pill ' + (kind || ({ paid: 'ok', completed: 'ok', delivered: 'ok', approved: 'ok', received: '', confirmed: 'ok', partial: 'warn', pending: 'warn', unpaid: 'bad', void: 'bad', cancelled: 'bad', failed: 'bad', rejected: 'bad', unrepairable: 'bad', awaiting_approval: 'warn', awaiting_parts: 'warn', in_progress: 'warn', open: 'warn', closed: '' }[s] || '')) }, t(label(s)));
export const label = (s) => ({ awaiting_approval: 'Awaiting approval', awaiting_parts: 'Awaiting parts', in_progress: 'In progress', unrepairable: 'Unrepairable' }[s] || (s ? s[0].toUpperCase() + s.slice(1).replace(/_/g, ' ') : ''));
export const tx = (v) => (DATA_TERMS.has(v) ? t(v) : v);
const DATA_TERMS = new Set(['Walk-in', 'Owner', 'Accountant', 'Branch Manager', 'Cashier', 'Technician', 'Barber', 'Sales Assistant']); // stored English system terms shown translated
export function table(cols, rows, { onRow, empty } = {}) {
  if (!rows.length) return h('div', { class: 'empty' }, empty || t('No data yet'));
  return h('div', { class: 'tw' }, h('table', {}, h('thead', {}, h('tr', {}, cols.map((c) => h('th', { class: c.r ? 'r' : '' }, typeof c.label === 'string' ? t(c.label) : c.label)))), h('tbody', {}, rows.map((r) => h('tr', { class: onRow ? 'click' : '', onclick: onRow ? () => onRow(r) : null }, cols.map((c) => h('td', { class: c.r ? 'r' : '' }, c.f ? c.f(r) : DATA_TERMS.has(r[c.k]) ? t(r[c.k]) : r[c.k] ?? '')))))));
}
export const pager = (page, hasMore, go) => h('div', { class: 'row', style: 'justify-content:center;margin-top:10px' }, h('button', { class: 'btn s', disabled: page <= 1, onclick: () => go(page - 1) }, t('Previous')), h('span', { class: 'muted' }, `${t('Page')} ${page}`), h('button', { class: 'btn s', disabled: !hasMore, onclick: () => go(page + 1) }, t('Next')));
export const loading = () => h('div', { class: 'empty' }, h('span', { class: 'spin' }), ' ', t('Loading…'));
export const can = (p) => S.user && S.user.perms.includes(p);
export const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Mogadishu' });
export const dt = (iso) => (iso ? new Date(iso).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '');
export function setTheme(v) { S.theme = v; store.set('theme', v); if (v === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', v); }
export function setLang(v) { S.lang = v; store.set('lang', v); document.documentElement.lang = v; }
export const branchesOf = (mod) => S.user.branches.filter((b) => !mod || S.user.modules.includes(mod) && moduleOnBranch(b, mod));
const TM = { clothing: ['sales', 'purchases', 'inventory', 'products'], electronics_retail: ['sales', 'purchases', 'inventory', 'products', 'devices'], electronics_repair: ['repairs', 'purchases', 'inventory', 'products'], barber: ['services', 'commissions', 'payouts'], electronics_combined: ['sales', 'purchases', 'inventory', 'products', 'devices', 'repairs'] };
export function moduleOnBranch(b, mod) { return (TM[b.business_type] || []).includes(mod) || (b.depts || []).some((k) => (TM[k] || []).includes(mod)) || ['customers', 'suppliers', 'expenses', 'registers', 'reports', 'payments'].includes(mod); }
export const methodsAll = async () => { if (!S.methods.length) S.methods = (await get('/methods')).rows.filter((m) => m.active); return S.methods; };
// ---- tiny SVG charts (no external libs) ----
const COL = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)'];
export function lineChart(series, labels, { height = 190, fmtY = (v) => v } = {}) {
  const W = 640, H = height, p = { l: 44, r: 10, t: 10, b: 22 }; const max = Math.max(1, ...series.flatMap((s) => s.data)); const min = Math.min(0, ...series.flatMap((s) => s.data)); const n = Math.max(1, labels.length - 1);
  const x = (i) => p.l + (i * (W - p.l - p.r)) / n; const y = (v) => p.t + (H - p.t - p.b) * (1 - (v - min) / (max - min || 1));
  const ns = 'http://www.w3.org/2000/svg'; const el = (tag, a, ...k) => { const e = document.createElementNS(ns, tag); for (const [k2, v] of Object.entries(a || {})) e.setAttribute(k2, v); k.forEach((c) => e.append(c)); return e; };
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart', width: '100%', role: 'img', 'aria-label': 'Trend chart' });
  for (let i = 0; i <= 4; i++) { const v = min + ((max - min) * i) / 4; svg.append(el('line', { x1: p.l, x2: W - p.r, y1: y(v), y2: y(v), class: 'gl' })); svg.append(el('text', { x: p.l - 4, y: y(v) + 3, 'text-anchor': 'end' }, document.createTextNode(fmtY(Math.round(v))))); }
  labels.forEach((l, i) => { if (labels.length <= 8 || i % Math.ceil(labels.length / 8) === 0) svg.append(el('text', { x: x(i), y: H - 6, 'text-anchor': 'middle' }, document.createTextNode(l.slice(5)))); });
  series.forEach((s, k) => { svg.append(el('polyline', { points: s.data.map((v, i) => `${x(i)},${y(v)}`).join(' '), fill: 'none', stroke: COL[k], 'stroke-width': 2.2, 'stroke-linejoin': 'round' })); s.data.forEach((v, i) => { const c = el('circle', { cx: x(i), cy: y(v), r: 3, fill: COL[k] }); c.append(el('title', {}, document.createTextNode(`${s.name} ${labels[i]}: ${fmtY(v)}`))); svg.append(c); }); });
  return h('div', {}, svg, h('div', { class: 'legend' }, series.map((s, k) => h('span', {}, h('i', { style: `background:${COL[k]}` }), s.name))));
}
export function barChart(items, { fmtV = (v) => v } = {}) { const max = Math.max(1, ...items.map((i) => Math.abs(i.value))); return h('div', { class: 'stack' }, items.map((i, k) => h('div', {}, h('div', { class: 'row sb' }, h('span', {}, i.label), h('b', {}, fmtV(i.value))), h('div', { style: 'background:var(--panel2);border-radius:4px;overflow:hidden' }, h('div', { class: 'bar', style: `width:${Math.max(2, (Math.abs(i.value) / max) * 100)}%;background:${i.value < 0 ? 'var(--bad)' : COL[k % 5]}` }))))); }

export const route = () => { const raw = location.hash.slice(1) || '/dashboard'; const [p, q] = raw.split('?'); return { path: p, q: Object.fromEntries(new URLSearchParams(q || '')), parts: p.split('/').filter(Boolean) }; };
export const go = (p) => { location.hash = '#' + p; };
export const hashQ = (path, q) => '#' + path + (Object.keys(q || {}).length ? '?' + new URLSearchParams(Object.fromEntries(Object.entries(q).filter(([, v]) => v !== '' && v != null))).toString() : '');
export const sel = (options, value, onchange, attrs = {}) => h('select', { ...attrs, onchange: onchange && ((e) => onchange(e.target.value)) }, options.map((o) => h('option', { value: o.value, selected: String(o.value) === String(value ?? '') }, t(o.label))));
export const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
export const tabs = (items, cur, on) => h('div', { class: 'tabs', role: 'tablist' }, items.map(([k, l]) => h('button', { role: 'tab', class: k === cur ? 'on' : '', 'aria-selected': k === cur, onclick: () => on(k) }, t(l))));
export const hundredth = (bp) => (bp / 100).toString().replace(/\.0+$/, '') + '%';
export const OCCY = () => S.user?.org?.reporting_currency || S.user?.branches?.[0]?.currency || 'USD';
export const ccyOf = (branchId) => (S.user.branches.find((b) => b.id === Number(branchId)) || {}).currency || 'USD';

export const divRound = (n, d) => { const sg = (n < 0) !== (d < 0) ? -1 : 1; return sg * Math.floor((2 * Math.abs(n) + Math.abs(d)) / (2 * Math.abs(d))); };
export const mulBp = (a, bp) => divRound(a * bp, 10000);
export function allocate(total, weights) { const sum_ = weights.reduce((a, b) => a + b, 0); if (!sum_) { const o = weights.map(() => 0); if (o.length) o[o.length - 1] = total; return o; } let rem = total; const out = weights.map((w) => { const p = Math.floor((total * w) / sum_); rem -= p; return p; }); for (let i = out.length - 1; i >= 0 && rem > 0; i--) if (weights[i] > 0) { out[i] += rem; rem = 0; } return out; }
export function payRows(ccy, methods, getTotal) {
  const rows = h('div', { class: 'stack' }); const defMethod = (methods.find((m) => m.kind === 'cash') || methods[0]).id;
  const add = (amt) => { const row = h('div', { class: 'row' }, sel(methods.filter((m) => m.kind !== 'credit').map((m) => ({ value: m.id, label: m.name })), defMethod, null, { 'aria-label': t('Payment method') }), h('input', { class: 'amt', inputmode: 'decimal', placeholder: t('Amount'), value: amt ?? '', style: 'width:110px', 'aria-label': t('Amount') }), h('input', { class: 'ref', placeholder: t('Reference'), style: 'width:120px', 'aria-label': t('Reference') }), h('button', { class: 'btn s', type: 'button', onclick: () => row.remove(), 'aria-label': t('Remove') }, '✕')); rows.append(row); return row; };
  return { el: h('div', {}, rows, h('div', { class: 'row', style: 'margin-top:6px' }, h('button', { class: 'btn s', type: 'button', onclick: () => add('') }, '+ ' + t('Add payment')), h('button', { class: 'btn s', type: 'button', onclick: () => { rows.innerHTML = ''; add(plain(getTotal(), ccy)); } }, t('Pay full')))), add,
    read: () => [...rows.children].map((r) => ({ method_id: Number(r.querySelector('select').value), amountStr: r.querySelector('.amt').value, external_ref: r.querySelector('.ref').value.trim() || undefined })).filter((p) => p.amountStr.trim() !== '').map((p) => ({ method_id: p.method_id, amount: parseMoney(p.amountStr, ccy), external_ref: p.external_ref })), clear: () => { rows.innerHTML = ''; } };
}

// the shipped Hubdex artwork has a light-background variant; CSS shows the one matching the active theme
export const brandLogo = (cls = 'brandlogo') => {
  if (!S.brand.has_logo) return h('b', { class: 'brandtext' }, S.brand.name);
  const src = (v) => '/api/branding/logo?v=' + (S.brand.v || 0) + (v ? '&variant=' + v : '');
  if (!S.brand.themed_logo) return h('img', { class: cls, src: src(), alt: S.brand.name });
  return h('span', { class: 'logoswap' }, h('img', { class: cls + ' logo-d', src: src(), alt: S.brand.name }), h('img', { class: cls + ' logo-l', src: src('light'), alt: S.brand.name }));
};
export async function loadBrand() { try { const r = await fetch('/api/branding'); if (r.ok) { S.brand = { ...(await r.json()), v: Date.now() }; document.title = S.brand.name; } } catch { /* keep defaults */ } }
// CSV / Excel / PDF / Print buttons for a server report (permission + branch scope are enforced by the server)
export function exportButtons(path, params, base) {
  const ok = can('reports.export') || can('commissions.export') || can('expenses.export') || can('inventory.export') || can('sales.export');
  const b = (fmt, ext, text) => h('button', { class: 'btn', onclick: () => download(path, { ...params, format: fmt }, `${base}.${ext}`).catch((e) => toast(errText(e), 'bad')) }, text);
  return h('div', { class: 'row' }, ok ? [b('csv', 'csv', t('Export CSV')), b('xlsx', 'xlsx', t('Export Excel')), b('pdf', 'pdf', t('Export PDF'))] : null, ok || can('reports.print') ? h('button', { class: 'btn', onclick: () => openDoc(path, { ...params, format: 'html' }) }, t('Print')) : null);
}
