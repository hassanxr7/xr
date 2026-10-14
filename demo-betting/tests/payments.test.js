/* SovaMoney deposit flow checks. Run with: node demo-betting/tests/payments.test.js
 * A local stand-in plays the provider's sandbox endpoint so the server can be exercised
 * end to end; it exists only in this test and is not used by the running site.
 * Covers the guide's acceptance checks: single credit, duplicate notifications, altered
 * signatures and values, success page never credits, cancellation, provider failure.
 */
'use strict';
const assert = require('assert');
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { createApp, loadConfig } = require('../server/server');
const { DepositStore } = require('../server/store');
const sova = require('../server/sovamoney');

const SECRET = 'test-secret-key';
const TOKEN = 'a'.repeat(64);
const OTHER = 'b'.repeat(64);
let passed = 0;
const ok = (name) => {
  passed++;
  console.log('  ✓ ' + name);
};

function listen(server) {
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r(server.address().port)));
}

(async () => {
  // ---------- provider stand-in ----------
  let mode = 'ok';
  let lastFields = null;
  let lastType = '';
  const provider = http.createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    lastType = String(req.headers['content-type'] || '');
    const fd = await new Response(Buffer.concat(chunks), { headers: { 'content-type': lastType } }).formData();
    lastFields = Object.fromEntries(fd.entries());
    res.setHeader('Content-Type', 'application/json');
    if (mode === 'error') return res.end(JSON.stringify({ error: 'true', message: 'Invalid api key' }));
    if (mode === 'badhost') return res.end(JSON.stringify({ success: 'ok', message: 'ok', url: 'https://evil.example/pay' }));
    if (mode === 'html') return res.end('<html>oops</html>');
    res.end(JSON.stringify({ success: 'ok', message: 'Payment initiated', url: 'http://127.0.0.1:' + providerPort + '/checkout/' + lastFields.identifier }));
  });
  const providerPort = await listen(provider);

  // ---------- app under test ----------
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dbet-'));
  const dataFile = path.join(dataDir, 'deposits.json');
  const config = loadConfig({ SOVAMONEY_PUBLIC_KEY: 'pk_test_123', SOVAMONEY_SECRET_KEY: SECRET, PUBLIC_URL: 'https://demo.example', DATA_DIR: dataDir });
  Object.assign(config.provider, {
    endpoint: 'http://127.0.0.1:' + providerPort + '/sandbox/payment/initiate',
    checkoutHosts: ['127.0.0.1:' + providerPort],
    allowHttp: true,
  });
  const logs = [];
  config.log = (m) => logs.push(m);
  const app = createApp(config);
  const port = await listen(app.server);
  const base = 'http://127.0.0.1:' + port;

  const call = async (method, p, { token, body, type, raw } = {}) => {
    const headers = {};
    if (token) headers['X-Wallet-Token'] = token;
    let payload;
    if (raw !== undefined) {
      payload = raw;
      if (type) headers['Content-Type'] = type;
    } else if (body !== undefined) {
      payload = JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
    }
    const res = await fetch(base + p, { method, headers, body: payload, redirect: 'manual' });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch (e) {
      /* not JSON */
    }
    return { status: res.status, json, text, headers: res.headers };
  };
  const newDeposit = async (amount, token) => call('POST', '/api/deposits', { token: token || TOKEN, body: { amount, name: 'Demo Customer', email: 'test_mode@mail.com' } });
  const ipnForm = (fields) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    return fd;
  };
  const sendIpn = (id, amount, { signature, status = 'success', currency = 'USD', encoding = 'multipart' } = {}) => {
    const fields = {
      status,
      identifier: id,
      signature: signature || sova.signature(amount, id, SECRET),
      'data[amount]': amount,
      'data[currency][code]': currency,
      'data[payment_trx]': 'TRX123',
    };
    if (encoding === 'form') return call('POST', '/payments/sovamoney/ipn', { raw: new URLSearchParams(fields).toString(), type: 'application/x-www-form-urlencoded' });
    if (encoding === 'json') {
      return call('POST', '/payments/sovamoney/ipn', { body: { status, identifier: id, signature: fields.signature, data: { amount, currency: { code: currency } } } });
    }
    return call('POST', '/payments/sovamoney/ipn', { raw: ipnForm(fields) });
  };

  try {
    // configuration
    assert.throws(() => loadConfig({ SOVAMONEY_MODE: 'live' }), /not supported/);
    const bare = createApp(Object.assign(loadConfig({ DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'dbet-')) }), { log: () => {} }));
    assert.strictEqual(bare.sovaCfg().enabled, false);
    const cfg = await call('GET', '/api/config');
    assert.strictEqual(cfg.json.sovamoney.enabled, true);
    assert.strictEqual(cfg.json.sovamoney.mode, 'sandbox');
    assert(!cfg.text.includes(SECRET) && !cfg.text.includes('pk_test_123'), 'keys must not reach the browser');
    ok('live mode refused, sandbox config exposes no keys');
    assert(logs.some((l) => /setup code [A-F0-9]{5}-[A-F0-9]{5}/.test(l)), 'first run prints a setup code');
    assert(!logs.join('\n').includes(SECRET), 'secret never logged');

    // input validation
    assert.strictEqual((await call('POST', '/api/deposits', { body: { amount: '10' } })).status, 401);
    assert.strictEqual((await newDeposit('0.5')).status, 400);
    assert.strictEqual((await newDeposit('10.123')).status, 400);
    assert.strictEqual((await newDeposit('5000')).status, 400);
    assert.strictEqual((await call('POST', '/api/deposits', { token: TOKEN, body: { amount: '10', name: 'x', email: 'not-an-email' } })).status, 400);
    assert.strictEqual((await call('POST', '/api/deposits', { token: TOKEN, body: { amount: '10', name: 'x', email: 'a'.repeat(25) + '@b.com' } })).status, 400);
    ok('rejects missing token, bad amounts and invalid customer fields');

    // initiation
    const d1 = await newDeposit('10');
    assert.strictEqual(d1.status, 201, d1.text);
    const id = d1.json.deposit.id;
    assert.match(id, /^[A-Z0-9]{20}$/);
    assert(lastType.startsWith('multipart/form-data'), 'initiate is sent as multipart like the PHP example');
    assert.deepStrictEqual(
      Object.keys(lastFields).sort(),
      ['amount', 'cancel_url', 'checkout_theme', 'currency', 'customer_email', 'customer_name', 'details', 'identifier', 'ipn_url', 'public_key', 'site_logo', 'success_url'].sort()
    );
    assert.strictEqual(lastFields.amount, '10.00');
    assert.strictEqual(lastFields.currency, 'USD');
    assert.strictEqual(lastFields.identifier, id);
    assert.strictEqual(lastFields.ipn_url, 'https://demo.example/payments/sovamoney/ipn');
    assert.strictEqual(lastFields.success_url, 'https://demo.example/payments/success?d=' + id);
    assert.strictEqual(d1.json.checkoutUrl, 'http://127.0.0.1:' + providerPort + '/checkout/' + id);
    assert.strictEqual(d1.json.deposit.status, 'pending');
    ok('starts checkout with all 12 documented fields and returns the checkout URL');

    // ownership
    assert.strictEqual((await call('GET', '/api/deposits/' + id, { token: TOKEN })).status, 200);
    assert.strictEqual((await call('GET', '/api/deposits/' + id, { token: OTHER })).status, 404);
    assert.strictEqual((await call('POST', '/api/deposits/' + id + '/collect', { token: OTHER })).status, 404);
    ok('deposit status is visible only to its owner');

    // browser return is not proof of payment
    const ret = await call('GET', '/payments/success?d=' + id);
    assert.strictEqual(ret.status, 303);
    assert.strictEqual(ret.headers.get('location'), '/#deposit.' + id);
    assert.strictEqual((await call('GET', '/api/deposits/' + id, { token: TOKEN })).json.deposit.status, 'pending');
    assert.strictEqual((await call('POST', '/api/deposits/' + id + '/collect', { token: TOKEN })).json.delivered, false);
    ok('opening the success page does not credit anything');

    // altered notifications
    assert.strictEqual((await sendIpn('DBUNKNOWNREF00000000', '10.00')).status, 400);
    assert.strictEqual((await sendIpn(id, '10.00', { signature: 'F'.repeat(64) })).status, 400);
    assert.strictEqual((await sendIpn(id, '10.00', { signature: sova.signature('10.00', id, 'wrong-secret') })).status, 400);
    assert.strictEqual((await sendIpn(id, '11.00')).status, 400, 'validly signed but wrong amount');
    assert.strictEqual((await sendIpn(id, '10.00', { currency: 'EUR' })).status, 400);
    assert.strictEqual((await call('POST', '/payments/sovamoney/ipn', { raw: 'garbage', type: 'text/plain' })).status, 415);
    assert.strictEqual(app.store.ledger.length, 0);
    assert.strictEqual(app.store.get(id).status, 'pending');
    ok('rejects unknown references, bad signatures, amount and currency mismatches');

    // valid notification credits once
    const good = await sendIpn(id, '10.00000000');
    assert.strictEqual(good.status, 200, good.text);
    assert.strictEqual(app.store.get(id).status, 'confirmed');
    assert.strictEqual(app.store.ledger.length, 1);
    for (const enc of ['multipart', 'form', 'json']) assert.strictEqual((await sendIpn(id, '10.00', { encoding: enc })).status, 200);
    assert.strictEqual(app.store.ledger.length, 1, 'duplicates must not add ledger entries');
    ok('a valid notification confirms once; duplicates (multipart, form, JSON) do not double-credit');

    // delivery to the wallet happens once
    const c1 = await call('POST', '/api/deposits/' + id + '/collect', { token: TOKEN });
    assert.deepStrictEqual([c1.json.delivered, c1.json.deposit.amount], [true, '10.00']);
    const c2 = await call('POST', '/api/deposits/' + id + '/collect', { token: TOKEN });
    assert.strictEqual(c2.json.delivered, false);
    ok('confirmed deposit is handed to the wallet exactly once');

    // cancellation never overrides a confirmed payment
    await call('GET', '/payments/cancel?d=' + id);
    assert.strictEqual(app.store.get(id).status, 'confirmed');
    const d2 = await newDeposit('25.50');
    const id2 = d2.json.deposit.id;
    await call('GET', '/payments/cancel?d=' + id2);
    assert.strictEqual(app.store.get(id2).status, 'cancelled');
    assert.strictEqual((await sendIpn(id2, '25.50')).status, 200);
    assert.strictEqual(app.store.get(id2).status, 'confirmed', 'a real payment after a cancel click still counts');
    ok('cancel marks open deposits only; a later verified payment still confirms');

    // provider failures
    mode = 'error';
    const e1 = await newDeposit('5');
    assert.strictEqual(e1.status, 502);
    assert.strictEqual(e1.json.error, 'Invalid api key');
    assert.strictEqual(app.store.get(e1.json.deposit.id).status, 'failed');
    mode = 'badhost';
    assert.match((await newDeposit('5')).json.error, /unexpected host/);
    mode = 'html';
    assert.match((await newDeposit('5')).json.error, /Unexpected response/);
    mode = 'ok';
    ok('provider errors, foreign checkout hosts and malformed replies fail cleanly');
    assert.strictEqual(new Set(Object.values(app.store.deposits).map((d) => d.id)).size, Object.keys(app.store.deposits).length);

    // persistence
    const reloaded = new DepositStore(dataFile);
    assert.strictEqual(reloaded.get(id).status, 'confirmed');
    assert.strictEqual(reloaded.ledger.length, 2);
    ok('deposits and ledger survive a restart');

    // static files
    const idx = await call('GET', '/');
    assert.strictEqual(idx.status, 200);
    assert(idx.headers.get('content-security-policy').includes("script-src 'self'"));
    assert.strictEqual((await call('GET', '/js/app.js')).status, 200);
    assert.strictEqual((await call('GET', '/img/logo.png')).status, 200);
    for (const p of ['/server/server.js', '/server/data/deposits.json', '/package.json', '/js/../server/store.js', '/%2e%2e/README.md', '/tests/payments.test.js']) {
      assert.strictEqual((await call('GET', p)).status, 404, p);
    }
    ok('serves the site but never server code, data or tests');

    // owner admin page
    let cookie = '';
    const adm = async (method, p2, body, { raw, type } = {}) => {
      const headers = {};
      if (cookie) headers.Cookie = cookie;
      let payload;
      if (raw !== undefined) {
        payload = raw;
        headers['Content-Type'] = type;
      } else if (body !== undefined) {
        payload = JSON.stringify(body);
        headers['Content-Type'] = 'application/json';
      }
      const res = await fetch(base + p2, { method, headers, body: payload });
      const set = res.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0];
      const text = await res.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch (e) {
        /* not JSON */
      }
      return { status: res.status, json, text, set };
    };
    const setupCode = /setup code ([A-F0-9]{5}-[A-F0-9]{5})/.exec(logs.join('\n'))[1];
    assert.deepStrictEqual((await adm('GET', '/api/admin/state')).json, { setupNeeded: true, loggedIn: false });
    assert.strictEqual((await adm('GET', '/api/admin/settings')).status, 401);
    assert.strictEqual((await adm('POST', '/api/admin/setup', undefined, { raw: 'code=' + setupCode + '&password=xxxxxxxxxxxx', type: 'application/x-www-form-urlencoded' })).status, 415, 'form posts (CSRF) refused');
    assert.strictEqual((await adm('POST', '/api/admin/setup', { code: 'AAAAA-00000', password: 'long-enough-pass' })).status, 403);
    assert.strictEqual((await adm('POST', '/api/admin/setup', { code: setupCode, password: 'short' })).status, 400);
    const su = await adm('POST', '/api/admin/setup', { code: setupCode.toLowerCase(), password: 'owner-password-1' });
    assert.strictEqual(su.status, 200);
    assert(/HttpOnly/.test(su.set) && /SameSite=Strict/.test(su.set) && /Secure/.test(su.set), 'session cookie is HttpOnly, SameSite=Strict, Secure on https');
    assert.strictEqual((await adm('POST', '/api/admin/setup', { code: setupCode, password: 'another-password' })).status, 409, 'setup code is single use');
    ok('first-run setup needs the logged code, a 10+ character password and JSON; it works once');

    const st1 = await adm('GET', '/api/admin/settings');
    assert.strictEqual(st1.json.sova.publicKey.from, 'environment');
    assert.strictEqual(st1.json.sova.secretKey.hint, '••••' + SECRET.slice(-4));
    assert(!st1.text.includes(SECRET) && !st1.text.includes('pk_test_123'), 'settings page never receives full keys');
    assert.strictEqual((await adm('POST', '/api/admin/settings', { mode: 'live' })).status, 400, 'live mode cannot be switched on');
    assert.strictEqual((await adm('POST', '/api/admin/settings', { publicUrl: 'http://demo.example' })).status, 400, 'public URL must be https');
    const NEW_PK = 'NewPublicKey123';
    const NEW_SK = 'NewSecretKey456789';
    const st2 = await adm('POST', '/api/admin/settings', { publicKey: NEW_PK, secretKey: NEW_SK, publicUrl: 'https://new.example/', currency: 'usd' });
    assert.strictEqual(st2.status, 200, st2.text);
    assert(!st2.text.includes(NEW_SK) && !st2.text.includes(NEW_PK));
    assert.deepStrictEqual([st2.json.sova.publicKey.from, st2.json.sova.secretKey.hint, st2.json.sova.publicUrl, st2.json.sova.ipnUrl], ['admin', '••••6789', 'https://new.example', 'https://new.example/payments/sovamoney/ipn']);
    const saved = path.join(dataDir, 'settings.json');
    assert.strictEqual(fs.statSync(saved).mode & 0o777, 0o600, 'settings file is owner-only');
    assert(!logs.join('\n').includes(NEW_SK), 'new secret never logged');
    ok('owner can save keys; they are masked, stored owner-only and override the environment');

    const d3 = await newDeposit('7', 'd'.repeat(64));
    assert.strictEqual(d3.status, 201, d3.text);
    assert.deepStrictEqual([lastFields.public_key, lastFields.ipn_url], [NEW_PK, 'https://new.example/payments/sovamoney/ipn']);
    const id3 = d3.json.deposit.id;
    assert.strictEqual((await sendIpn(id3, '7.00')).status, 400, 'old secret no longer verifies');
    assert.strictEqual((await sendIpn(id3, '7.00', { signature: sova.signature('7.00', id3, NEW_SK) })).status, 200);
    assert.strictEqual(app.store.get(id3).status, 'confirmed');
    ok('deposits and IPN checks use the keys saved on the admin page');

    const dl = await adm('GET', '/api/admin/deposits');
    assert(dl.json.deposits.some((d) => d.id === id3 && d.customer.email === 'test_mode@mail.com'));
    await adm('POST', '/api/admin/logout', {});
    assert.strictEqual((await adm('GET', '/api/admin/settings')).status, 401, 'logout ends the session');
    // 8 failures per IP in 15 minutes, counting the wrong setup code above
    const codes = [];
    for (let i = 0; i < 9; i++) codes.push((await adm('POST', '/api/admin/login', { password: 'wrong-' + i })).status);
    assert.deepStrictEqual(codes, [403, 403, 403, 403, 403, 403, 403, 429, 429], 'login attempts are rate limited');
    assert.strictEqual((await call('GET', '/admin')).status, 200);
    assert.strictEqual((await call('GET', '/server/data/settings.json')).status, 404);
    ok('deposit list, logout, login throttling; settings file is never served');

    // rate limit
    let n = 0;
    while (n < 12 && (await newDeposit('5', OTHER)).status !== 429) n++;
    assert.strictEqual(n, 10, 'an account may start 10 deposits per window');
    assert.strictEqual((await newDeposit('5', 'c'.repeat(64))).status, 201, 'another account on the same IP is not blocked');
    ok('deposit creation is rate limited per account, not per shared IP');

    // amount helpers
    assert.deepStrictEqual(['10', '10.5', '10.00000000', '0.01', '10.001', '1e3', '-5', ''].map(sova.toCents), [1000, 1050, 1000, 1, null, null, null, null]);
    ok('decimal amounts parsed without floating point');
  } finally {
    app.server.close();
    provider.close();
  }
  console.log('\n' + passed + ' checks passed');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
