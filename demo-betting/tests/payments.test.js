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
  const dataFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dbet-')), 'deposits.json');
  const config = loadConfig({ SOVAMONEY_PUBLIC_KEY: 'pk_test_123', SOVAMONEY_SECRET_KEY: SECRET, PUBLIC_URL: 'https://demo.example', DATA_FILE: dataFile });
  Object.assign(config.sova, {
    endpoint: 'http://127.0.0.1:' + providerPort + '/sandbox/payment/initiate',
    checkoutHosts: ['127.0.0.1:' + providerPort],
    allowHttp: true,
  });
  config.log = () => {};
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
    assert.strictEqual(loadConfig({}).sova.enabled, false);
    const cfg = await call('GET', '/api/config');
    assert.strictEqual(cfg.json.sovamoney.enabled, true);
    assert.strictEqual(cfg.json.sovamoney.mode, 'sandbox');
    assert(!cfg.text.includes(SECRET) && !cfg.text.includes('pk_test_123'), 'keys must not reach the browser');
    ok('live mode refused, sandbox config exposes no keys');

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
