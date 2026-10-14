/* Demo Betting — owner admin page (/admin): setup, login, SovaMoney settings, deposits.
 * Talks to /api/admin/*; the session is an HttpOnly cookie. Secret values are never shown:
 * the server only reports whether a key is set and its last four characters.
 */
'use strict';
(function () {
  const $ = (s, r) => (r || document).querySelector(s);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const root = $('#admin');
  const pad = (n) => String(n).padStart(2, '0');
  const when = (ts) => {
    if (!ts) return '—';
    const d = new Date(ts);
    return pad(d.getDate()) + '.' + pad(d.getMonth() + 1) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  };

  function toast(msg, kind) {
    const el = document.createElement('div');
    el.className = 'toast ' + (kind || 'info');
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(() => el.remove(), 4000);
  }

  async function api(path, body) {
    const opts = { cache: 'no-store', credentials: 'same-origin' };
    if (body !== undefined) {
      opts.method = 'POST';
      opts.headers = { 'Content-Type': 'application/json' };
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(path, opts);
    let json = {};
    try {
      json = await res.json();
    } catch (e) {
      /* empty */
    }
    if (!res.ok) throw Object.assign(new Error(json.error || 'HTTP ' + res.status), { status: res.status });
    return json;
  }

  function card(title, body, cls) {
    return '<section class="panel admin-card ' + (cls || '') + '"><h2>' + esc(title) + '</h2>' + body + '</section>';
  }

  function setupView() {
    $('#admin-actions').innerHTML = '';
    root.innerHTML = card(
      'First-time setup',
      '<p class="muted">The server printed a one-time <b>setup code</b> in its log when it started (look for "[admin] First-time setup"). Enter it and choose the owner password.</p>' +
        '<form id="setup-form" class="form" novalidate>' +
        '<label for="setup-code">Setup code</label><input id="setup-code" name="code" class="inp" autocomplete="off" placeholder="ABCDE-12345" required>' +
        '<label for="setup-pass">New password (10+ characters)</label><input id="setup-pass" name="password" class="inp" type="password" autocomplete="new-password" minlength="10" required>' +
        '<p class="form-err" data-err role="alert"></p>' +
        '<button class="btn btn-go btn-block" type="submit">Create owner password</button></form>',
      'narrow'
    );
  }

  function loginView() {
    $('#admin-actions').innerHTML = '';
    root.innerHTML = card(
      'Owner login',
      '<form id="login-form" class="form" novalidate>' +
        '<label for="admin-pass">Password</label><input id="admin-pass" name="password" class="inp" type="password" autocomplete="current-password" required>' +
        '<p class="form-err" data-err role="alert"></p>' +
        '<button class="btn btn-go btn-block" type="submit">Log in</button></form>',
      'narrow'
    );
  }

  function keyField(id, label, info, type) {
    const status = info.set
      ? '<span class="key-state on">Saved ' + esc(info.hint) + (info.from === 'environment' ? ' · from environment' : '') + '</span>'
      : '<span class="key-state">Not set</span>';
    return (
      '<div class="key-row"><label for="' + id + '">' + esc(label) + '</label>' + status + '</div>' +
      '<input id="' + id + '" name="' + id + '" class="inp" type="' + type + '" autocomplete="' + (type === 'password' ? 'new-password' : 'off') + '" data-lpignore="true" data-1p-ignore spellcheck="false" placeholder="' + (info.set ? 'Leave empty to keep the saved key' : 'Paste the key from SovaMoney → API Key') + '">'
    );
  }

  async function dashboard() {
    $('#admin-actions').innerHTML =
      '<a class="btn btn-ghost" href="/">Open site</a><button type="button" class="btn btn-ghost" data-act="logout">Log out</button>';
    let s;
    let deps = [];
    try {
      s = (await api('/api/admin/settings')).sova;
      deps = (await api('/api/admin/deposits')).deposits;
    } catch (e) {
      if (e.status === 401) return start();
      root.innerHTML = '<p class="form-err">' + esc(e.message) + '</p>';
      return;
    }
    const status = s.enabled
      ? '<span class="badge ds-confirmed">Ready</span> SovaMoney deposits are on in <b>sandbox</b> mode.'
      : '<span class="badge ds-failed">Not ready</span> Enter both keys and the public address to turn SovaMoney deposits on.';
    const settings = card(
      'SovaMoney',
      '<p class="admin-status">' + status + '</p>' +
        '<form id="sova-settings" class="form" novalidate>' +
        keyField('publicKey', 'Public key', s.publicKey, 'text') +
        keyField('secretKey', 'Secret key', s.secretKey, 'password') +
        '<label for="publicUrl">Public site address (HTTPS) — this website, not SovaMoney</label>' +
        '<input id="publicUrl" name="publicUrl" class="inp" type="url" placeholder="' + esc(location.origin) + '" value="' + esc(s.publicUrl || location.origin) + '">' +
        (s.publicUrl && s.publicUrl !== location.origin
          ? '<p class="form-err">Saved address is ' + esc(s.publicUrl) + ' but this site is ' + esc(location.origin) + '. Payments will return to the saved address — change it and save.</p>'
          : '') +
        '<label for="currency">Currency</label><input id="currency" name="currency" class="inp" maxlength="4" value="' + esc(s.currency) + '">' +
        '<div class="key-row"><span class="muted">Mode</span><span class="pill">Sandbox</span></div>' +
        '<p class="form-err" data-err role="alert"></p>' +
        '<button class="btn btn-go btn-block" type="submit">Save settings</button>' +
        '</form>' +
        (s.ipnUrl ? '<p class="fine">IPN address SovaMoney will call: <code>' + esc(s.ipnUrl) + '</code></p>' : '') +
        '<p class="fine">Keys are stored on this server only (server/data/settings.json) and are never shown again in full. ' +
        'If a key was ever shared in a chat or message, generate a new one in SovaMoney first.</p>'
    );
    const rows = deps.length
      ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Created</th><th>Reference</th><th>Customer</th><th class="num">Amount</th><th>Status</th><th>Delivered</th></tr></thead><tbody>' +
        deps
          .map(
            (d) =>
              '<tr><td>' + when(d.createdAt) + '</td><td><code>' + esc(d.id) + '</code></td><td>' + esc(d.customer ? d.customer.email : '') + '</td>' +
              '<td class="num">' + esc(d.amount + ' ' + d.currency) + '</td><td><span class="badge ds-' + esc(d.status) + '">' + esc(d.status) + '</span></td>' +
              '<td>' + (d.delivered ? 'yes' : '—') + '</td></tr>'
          )
          .join('') +
        '</tbody></table></div>'
      : '<p class="muted">No deposits yet.</p>';
    root.innerHTML = '<h1 class="admin-h1">Admin</h1>' + settings + card('Deposits', rows);
  }

  async function start() {
    try {
      const st = await api('/api/admin/state');
      if (st.setupNeeded) return setupView();
      if (!st.loggedIn) return loginView();
      return dashboard();
    } catch (e) {
      root.innerHTML = card('Server not reachable', '<p class="muted">Open this page from the running Demo Betting server (npm start), not as a file.</p>', 'narrow');
    }
  }

  document.addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const data = Object.fromEntries(new FormData(f).entries());
    const err = f.querySelector('[data-err]');
    const btn = f.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      if (f.id === 'setup-form') await api('/api/admin/setup', data);
      else if (f.id === 'login-form') await api('/api/admin/login', data);
      else if (f.id === 'sova-settings') {
        await api('/api/admin/settings', data);
        toast('Settings saved', 'ok');
      }
      await start();
    } catch (ex) {
      if (err) err.textContent = ex.message;
      btn.disabled = false;
    }
  });
  document.addEventListener('click', async (e) => {
    const el = e.target.closest('[data-act="logout"]');
    if (!el) return;
    await api('/api/admin/logout', {}).catch(() => {});
    start();
  });

  start();
})();
