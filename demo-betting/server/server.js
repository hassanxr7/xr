/* Demo Betting server: serves the site, runs SovaMoney sandbox deposits and the owner admin page.
 *
 *   node server/server.js        then open /admin to enter the merchant keys
 *
 * Keys come from the admin page (stored server-side) or environment variables, and never
 * reach the browser. Only SovaMoney's sandbox is wired up: live charging is not enabled in
 * this build (player wallets and bets still live in the browser).
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sova = require('./sovamoney');
const { DepositStore } = require('./store');
const { Admin, hashPassword, safeEqual } = require('./admin');

const SITE_ROOT = path.join(__dirname, '..');
const STATIC_DIRS = ['css', 'js', 'img'];
const ROOT_FILES = ['index.html', 'admin.html'];
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};
const SANDBOX_TEST_ACCOUNT = { email: 'test_mode@mail.com', code: '222666' };
const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'self'";

/* ================= configuration ================= */
function loadConfig(env) {
  const mode = String(env.SOVAMONEY_MODE || 'sandbox').toLowerCase();
  if (mode !== 'sandbox') throw new Error('SOVAMONEY_MODE=' + mode + ' is not supported: only sandbox deposits are enabled in this build.');
  const dataDir = env.DATA_DIR || path.join(__dirname, 'data');
  return {
    port: Number(env.PORT) || 8080,
    trustProxy: env.TRUST_PROXY === '1',
    dataFile: env.DATA_FILE || path.join(dataDir, 'deposits.json'),
    settingsFile: env.SETTINGS_FILE || path.join(dataDir, 'settings.json'),
    // fallbacks when the admin page has not set a value
    defaults: {
      publicKey: env.SOVAMONEY_PUBLIC_KEY || '',
      secretKey: env.SOVAMONEY_SECRET_KEY || '',
      mode,
      publicUrl: String(env.PUBLIC_URL || '').replace(/\/+$/, ''),
      currency: String(env.SOVAMONEY_CURRENCY || 'USD').toUpperCase(),
    },
    provider: {
      endpoint: sova.SANDBOX_URL,
      encoding: ['json', 'form'].includes(env.SOVAMONEY_ENCODING) ? env.SOVAMONEY_ENCODING : 'multipart',
      siteLogo: env.SOVAMONEY_SITE_LOGO || '',
      checkoutTheme: env.SOVAMONEY_CHECKOUT_THEME === 'light' ? 'light' : 'dark',
      checkoutHosts: sova.CHECKOUT_HOSTS,
      allowHttp: false,
      minCents: 100,
      maxCents: 100000,
      timeoutMs: 15000,
    },
  };
}

/* ================= helpers ================= */
const sha256 = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const sameHash = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
const newId = () => {
  // 20 characters: "DB" + 18 base-36 characters
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const bytes = crypto.randomBytes(18);
  let s = 'DB';
  for (const b of bytes) s += chars[b % 36];
  return s;
};

function setCommonHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
}
function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function redirect(res, location) {
  res.writeHead(303, { Location: location, 'Cache-Control': 'no-store' });
  res.end();
}

// a[b][c]=v style field names -> nested object (enough for IPN "data[amount]")
function nest(entries) {
  const out = {};
  for (const [key, value] of entries) {
    if (typeof value !== 'string') continue; // ignore uploaded files
    const parts = key.replace(/\]/g, '').split('[');
    if (parts.some((p) => p === '__proto__' || p === 'constructor' || p === 'prototype')) continue;
    let o = out;
    parts.forEach((p, i) => {
      if (i === parts.length - 1) o[p] = value;
      else o = o[p] = o[p] && typeof o[p] === 'object' ? o[p] : {};
    });
  }
  return out;
}
const parseForm = (text) => nest(new URLSearchParams(text));

// JSON, urlencoded or multipart (PHP-style senders, like the guide's IPN example, use the last two)
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(Object.assign(new Error('body too large'), { status: 413 }));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', async () => {
      const buf = Buffer.concat(chunks);
      const rawType = String(req.headers['content-type'] || '');
      const type = rawType.split(';')[0].trim().toLowerCase();
      try {
        if (!buf.length) resolve({});
        else if (type === 'application/json') resolve(JSON.parse(buf.toString('utf8')));
        else if (type === 'application/x-www-form-urlencoded') resolve(parseForm(buf.toString('utf8')));
        else if (type === 'multipart/form-data') resolve(nest(await new Response(buf, { headers: { 'content-type': rawType } }).formData()));
        else reject(Object.assign(new Error('unsupported content type ' + type), { status: 415 }));
      } catch (e) {
        reject(Object.assign(new Error('malformed body'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

// admin calls must be JSON: a cross-site form cannot send that without a CORS preflight
async function readJson(req) {
  if (!String(req.headers['content-type'] || '').toLowerCase().startsWith('application/json')) {
    throw Object.assign(new Error('JSON body required'), { status: 415 });
  }
  return readBody(req, 16 * 1024);
}

function clientIp(req, trustProxy) {
  if (trustProxy && req.headers['x-forwarded-for']) return String(req.headers['x-forwarded-for']).split(',')[0].trim();
  return req.socket.remoteAddress || '';
}

/* ================= app ================= */
function createApp(config) {
  const log = config.log || ((...a) => console.log(...a));
  const store = new DepositStore(config.dataFile);
  const admin = new Admin(config.settingsFile, log);
  const hits = new Map(); // key -> recent deposit-creation timestamps
  const limits = Object.assign({ perAccount: 10, perIp: 60, windowMs: 10 * 60e3 }, config.rateLimit);

  // effective SovaMoney settings: admin page first, then environment
  function sovaCfg() {
    const s = admin.sova;
    const d = config.defaults;
    const P = config.provider;
    const publicUrl = String(s.publicUrl || d.publicUrl || '').replace(/\/+$/, '');
    const cfg = Object.assign({}, P, {
      publicKey: s.publicKey || d.publicKey,
      secretKey: s.secretKey || d.secretKey,
      mode: 'sandbox',
      publicUrl,
      currency: s.currency || d.currency || 'USD',
      siteLogo: P.siteLogo || publicUrl + '/img/logo.png',
    });
    cfg.enabled = !!(cfg.publicKey && cfg.secretKey && cfg.publicUrl);
    return cfg;
  }
  const depositAccess = (req, S) => (S.enabled ? 'ok' : 'not_configured');

  function rateLimited(keys) {
    const now = Date.now();
    let over = false;
    for (const [key, max] of keys) {
      const recent = (hits.get(key) || []).filter((t) => now - t < limits.windowMs);
      recent.push(now);
      hits.set(key, recent);
      if (recent.length > max) over = true;
    }
    if (hits.size > 5000) for (const [k, v] of hits) if (now - v[v.length - 1] > limits.windowMs) hits.delete(k);
    return over;
  }

  function publicView(dep) {
    return {
      id: dep.id,
      amount: sova.centsToString(dep.cents),
      currency: dep.currency,
      mode: dep.mode || 'sandbox',
      status: dep.status,
      createdAt: dep.createdAt,
      confirmedAt: dep.confirmedAt || null,
      delivered: !!dep.deliveredAt,
      message: dep.message || '',
    };
  }
  function ownDeposit(req, id) {
    const dep = store.get(id);
    const token = String(req.headers['x-wallet-token'] || '');
    if (!dep || !/^[a-f0-9]{64}$/.test(token) || !sameHash(dep.ownerHash, sha256(token))) return null;
    return dep;
  }

  async function createDeposit(req, res) {
    const S = sovaCfg();
    const access = depositAccess(req, S);
    if (access !== 'ok') return sendJson(res, 503, { error: 'SovaMoney is not configured on this server.' });
    const token = String(req.headers['x-wallet-token'] || '');
    if (!/^[a-f0-9]{64}$/.test(token)) return sendJson(res, 401, { error: 'Log in again to make a deposit.' });
    if (rateLimited([['acct:' + sha256(token), limits.perAccount], ['ip:' + clientIp(req, config.trustProxy), limits.perIp]])) {
      return sendJson(res, 429, { error: 'Too many deposit attempts. Try again in a few minutes.' });
    }
    const body = await readBody(req, 16 * 1024);
    const cents = sova.toCents(body.amount);
    if (cents == null || cents < S.minCents || cents > S.maxCents) {
      return sendJson(res, 400, { error: 'Amount must be between ' + sova.centsToString(S.minCents) + ' and ' + sova.centsToString(S.maxCents) + ' ' + S.currency + '.' });
    }
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim();
    if (!name || name.length > 30) return sendJson(res, 400, { error: 'Name must be 1–30 characters.' });
    if (email.length > 30 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return sendJson(res, 400, { error: 'Enter a valid email of up to 30 characters.' });

    const id = newId();
    const dep = store.insert({
      id,
      cents,
      currency: S.currency,
      mode: S.mode,
      status: 'pending',
      createdAt: Date.now(),
      ownerHash: sha256(token),
      customer: { name, email },
    });
    const fields = {
      public_key: S.publicKey,
      identifier: id,
      currency: S.currency,
      amount: sova.centsToString(cents),
      details: 'Demo Betting sandbox deposit',
      ipn_url: S.publicUrl + '/payments/sovamoney/ipn',
      success_url: S.publicUrl + '/payments/success?d=' + id,
      cancel_url: S.publicUrl + '/payments/cancel?d=' + id,
      site_logo: S.siteLogo,
      checkout_theme: S.checkoutTheme,
      customer_name: name,
      customer_email: email,
    };
    try {
      const out = await sova.initiate(S, fields);
      dep.checkoutHost = new URL(out.url).host;
      store.save();
      log('[deposit] ' + id + ' started ' + fields.amount + ' ' + S.currency + ' (' + S.mode + ')');
      return sendJson(res, 201, { deposit: publicView(dep), checkoutUrl: out.url });
    } catch (e) {
      const msg = e instanceof sova.ProviderError ? e.message : 'Unexpected error';
      store.close(id, 'failed', msg);
      log('[deposit] ' + id + ' could not start: ' + msg);
      return sendJson(res, 502, { error: msg, deposit: publicView(dep) });
    }
  }

  async function handleIpn(req, res) {
    const S = sovaCfg();
    let body;
    try {
      body = await readBody(req, 64 * 1024);
    } catch (e) {
      log('[ipn] rejected: ' + e.message);
      return sendJson(res, e.status || 400, { error: e.message });
    }
    const identifier = typeof body.identifier === 'string' ? body.identifier : '';
    const data = body.data && typeof body.data === 'object' ? body.data : {};
    const amount = typeof data.amount === 'string' ? data.amount : typeof data.amount === 'number' ? String(data.amount) : '';
    const dep = store.get(identifier);
    if (!dep) {
      log('[ipn] rejected: unknown identifier');
      return sendJson(res, 400, { error: 'unknown identifier' });
    }
    if (!S.secretKey || !sova.verifySignature(amount, identifier, body.signature, S.secretKey)) {
      log('[ipn] ' + identifier + ' rejected: bad signature');
      return sendJson(res, 400, { error: 'bad signature' });
    }
    if (sova.toCents(amount) !== dep.cents) {
      log('[ipn] ' + identifier + ' rejected: amount ' + amount + ' does not match ' + sova.centsToString(dep.cents));
      return sendJson(res, 400, { error: 'amount mismatch' });
    }
    const cur = data.currency && typeof data.currency === 'object' ? data.currency.code : data.currency;
    if (cur != null && String(cur).toUpperCase() !== dep.currency) {
      log('[ipn] ' + identifier + ' rejected: currency ' + cur);
      return sendJson(res, 400, { error: 'currency mismatch' });
    }
    if (body.status === 'success') {
      const r = store.confirm(identifier, { trx: String(data.payment_trx || data.trx || ''), at: Date.now() });
      log('[ipn] ' + identifier + (r.duplicate ? ' already confirmed (duplicate notification)' : ' confirmed ' + amount + ' ' + dep.currency));
    } else {
      store.close(identifier, 'failed', 'SovaMoney reported status "' + String(body.status).slice(0, 40) + '"');
      log('[ipn] ' + identifier + ' status ' + String(body.status).slice(0, 40));
    }
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' });
    res.end('OK');
  }

  /* ---------- admin API ---------- */
  async function handleAdmin(req, res, p) {
    const ip = clientIp(req, config.trustProxy);
    const secure = sovaCfg().publicUrl.startsWith('https://') || req.headers['x-forwarded-proto'] === 'https';
    if (req.method === 'GET' && p === '/api/admin/state') {
      return sendJson(res, 200, { setupNeeded: !admin.data.admin, loggedIn: admin.isAdmin(req) });
    }
    if (req.method === 'POST' && p === '/api/admin/setup') {
      const body = await readJson(req);
      if (admin.data.admin) return sendJson(res, 409, { error: 'Setup is already done. Log in instead.' });
      if (admin.tooManyFailures(ip)) return sendJson(res, 429, { error: 'Too many attempts. Wait 15 minutes.' });
      if (!admin.setupCode || !safeEqual(String(body.code || '').trim().toUpperCase(), admin.setupCode)) {
        admin.fail(ip);
        return sendJson(res, 403, { error: 'Wrong setup code. It is printed in the server log.' });
      }
      if (String(body.password || '').length < 10) return sendJson(res, 400, { error: 'Choose a password of at least 10 characters.' });
      const salt = crypto.randomBytes(16).toString('hex');
      admin.data.admin = { salt, hash: hashPassword(body.password, salt), created: Date.now() };
      admin.setupCode = null;
      admin.save();
      admin.startSession(res, secure);
      log('[admin] owner password set');
      return sendJson(res, 200, { ok: true });
    }
    if (req.method === 'POST' && p === '/api/admin/login') {
      const body = await readJson(req);
      if (!admin.data.admin) return sendJson(res, 409, { error: 'Finish setup first.' });
      if (admin.tooManyFailures(ip)) return sendJson(res, 429, { error: 'Too many attempts. Wait 15 minutes.' });
      if (!safeEqual(hashPassword(body.password || '', admin.data.admin.salt), admin.data.admin.hash)) {
        admin.fail(ip);
        log('[admin] failed login from ' + ip);
        return sendJson(res, 403, { error: 'Wrong password.' });
      }
      admin.startSession(res, secure);
      return sendJson(res, 200, { ok: true });
    }
    if (req.method === 'POST' && p === '/api/admin/logout') {
      const t = admin.token(req);
      if (t) admin.sessions.delete(t);
      res.setHeader('Set-Cookie', 'db_admin=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0');
      return sendJson(res, 200, { ok: true });
    }
    if (!admin.isAdmin(req)) return sendJson(res, 401, { error: 'Log in to the admin page first.' });
    if (req.method === 'GET' && p === '/api/admin/settings') return sendJson(res, 200, { sova: admin.view(sovaCfg()) });
    if (req.method === 'POST' && p === '/api/admin/settings') {
      const err = admin.update(await readJson(req));
      if (err) return sendJson(res, 400, { error: err });
      const S = sovaCfg();
      log('[admin] SovaMoney settings saved (mode ' + S.mode + ', keys ' + (S.publicKey && S.secretKey ? 'set' : 'missing') + ')');
      return sendJson(res, 200, { sova: admin.view(S) });
    }
    if (req.method === 'GET' && p === '/api/admin/deposits') {
      const list = Object.values(store.deposits)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 100)
        .map((d) => Object.assign(publicView(d), { customer: d.customer || null, trx: (d.provider && d.provider.trx) || '' }));
      return sendJson(res, 200, { deposits: list });
    }
    return sendJson(res, 404, { error: 'not found' });
  }

  function serveStatic(req, res, pathname) {
    const rel = pathname === '/' ? 'index.html' : pathname === '/admin' ? 'admin.html' : decodeURIComponent(pathname.slice(1));
    const top = rel.split('/')[0];
    if (!ROOT_FILES.includes(rel) && !STATIC_DIRS.includes(top)) return notFound(res);
    const file = path.normalize(path.join(SITE_ROOT, rel));
    if (!file.startsWith(SITE_ROOT + path.sep)) return notFound(res);
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) return notFound(res);
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': ROOT_FILES.includes(rel) ? 'no-cache' : 'public, max-age=300',
        'Content-Security-Policy': CSP,
      });
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(file).pipe(res);
    });
  }
  function notFound(res) {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }

  const server = http.createServer(async (req, res) => {
    setCommonHeaders(res);
    let url;
    try {
      url = new URL(req.url, 'http://local');
    } catch (e) {
      return notFound(res);
    }
    const p = url.pathname;
    const m = /^\/api\/deposits\/([A-Z0-9]{20})(\/collect)?$/.exec(p);
    try {
      if (p.startsWith('/api/admin/')) return await handleAdmin(req, res, p);
      if (req.method === 'GET' && p === '/api/config') {
        const S = sovaCfg();
        const access = depositAccess(req, S);
        return sendJson(res, 200, {
          sovamoney:
            access === 'ok'
              ? { enabled: true, mode: S.mode, currency: S.currency, min: sova.centsToString(S.minCents), max: sova.centsToString(S.maxCents), testAccount: S.mode === 'sandbox' ? SANDBOX_TEST_ACCOUNT : null }
              : { enabled: false, reason: access },
        });
      }
      if (req.method === 'POST' && p === '/api/deposits') return await createDeposit(req, res);
      if (m && req.method === 'GET' && !m[2]) {
        const dep = ownDeposit(req, m[1]);
        return dep ? sendJson(res, 200, { deposit: publicView(dep) }) : sendJson(res, 404, { error: 'not found' });
      }
      if (m && req.method === 'POST' && m[2]) {
        const dep = ownDeposit(req, m[1]);
        if (!dep) return sendJson(res, 404, { error: 'not found' });
        const r = store.deliver(dep.id);
        if (r.delivered) log('[deposit] ' + dep.id + ' delivered to wallet');
        return sendJson(res, 200, { delivered: r.delivered, deposit: publicView(r.dep) });
      }
      if (req.method === 'POST' && p === '/payments/sovamoney/ipn') return await handleIpn(req, res);
      if (req.method === 'GET' && (p === '/payments/success' || p === '/payments/cancel')) {
        // a browser return is not proof of payment: success never credits, cancel never overrides a confirmation
        const id = String(url.searchParams.get('d') || '');
        if (!/^[A-Z0-9]{20}$/.test(id) || !store.get(id)) return redirect(res, '/');
        if (p === '/payments/cancel') store.close(id, 'cancelled');
        return redirect(res, '/#deposit.' + id);
      }
      if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res, p);
      res.writeHead(405, { 'Content-Type': 'text/plain' });
      return res.end('Method not allowed');
    } catch (e) {
      log('[error] ' + req.method + ' ' + p + ': ' + e.message);
      if (!res.headersSent) sendJson(res, e.status || 500, { error: e.status ? e.message : 'Server error' });
    }
  });

  return { server, store, admin, config, sovaCfg };
}

module.exports = { createApp, loadConfig, parseForm };

if (require.main === module) {
  const config = loadConfig(process.env);
  const app = createApp(config);
  app.server.listen(config.port, () => {
    const S = app.sovaCfg();
    console.log('Demo Betting on http://localhost:' + config.port + '   (admin: /admin)');
    if (S.enabled) console.log('SovaMoney deposits: on (sandbox), IPN ' + S.publicUrl + '/payments/sovamoney/ipn');
    else console.log('SovaMoney deposits: off — enter the keys and public URL on /admin');
  });
}
