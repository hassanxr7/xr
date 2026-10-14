/* SovaMoney hosted-checkout client: build the initiate request, check the checkout URL,
 * and verify IPN signatures.
 *
 * Reference: SovaMoney API Developer Guide (deposit integration, 14 Oct 2026)
 *   initiate   POST https://sovamoney.com/sandbox/payment/initiate
 *   response   { success: "ok", message, url }  or  { error: "true", message }
 *   IPN        POST ipn_url with status, identifier, signature, data
 *   signature  UPPERCASE(HMAC_SHA256(data.amount + identifier, merchant secret))
 */
'use strict';
const crypto = require('crypto');

const SANDBOX_URL = 'https://sovamoney.com/sandbox/payment/initiate';
const CHECKOUT_HOSTS = ['sovamoney.com', 'www.sovamoney.com'];

// maximum lengths from the guide's field table
const LIMITS = { public_key: 50, identifier: 20, currency: 4, details: 100, customer_name: 30, customer_email: 30 };
const REQUIRED = ['public_key', 'identifier', 'currency', 'amount', 'details', 'ipn_url', 'success_url', 'cancel_url', 'site_logo', 'customer_name', 'customer_email'];

class ProviderError extends Error {}

function checkFields(fields) {
  for (const k of REQUIRED) {
    if (fields[k] == null || String(fields[k]).trim() === '') throw new ProviderError('missing field ' + k);
  }
  for (const [k, max] of Object.entries(LIMITS)) {
    if (String(fields[k]).length > max) throw new ProviderError(k + ' is longer than ' + max + ' characters');
  }
  if (fields.checkout_theme != null && !['dark', 'light'].includes(fields.checkout_theme)) throw new ProviderError('checkout_theme must be dark or light');
}

// The guide's PHP example passes an array to CURLOPT_POSTFIELDS, which PHP sends as
// multipart/form-data, so that is the default. "form" and "json" are kept for when a sandbox
// capture shows SovaMoney expects something else.
function encode(fields, encoding) {
  if (encoding === 'json') return { body: JSON.stringify(fields), type: 'application/json' };
  if (encoding === 'form') return { body: new URLSearchParams(fields).toString(), type: 'application/x-www-form-urlencoded' };
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, String(v));
  return { body: fd, type: null }; // fetch sets the multipart boundary itself
}

function checkoutUrlAllowed(url, hosts, allowHttp) {
  let u;
  try {
    u = new URL(url);
  } catch (e) {
    return false;
  }
  if (u.protocol !== 'https:' && !(allowHttp && u.protocol === 'http:')) return false;
  if (u.username || u.password) return false;
  return hosts.includes(u.host.toLowerCase());
}

// Starts a hosted checkout. Returns { url, message } or throws ProviderError.
async function initiate(opts, fields) {
  checkFields(fields);
  const { body, type } = encode(fields, opts.encoding);
  let res;
  try {
    res = await fetch(opts.endpoint || SANDBOX_URL, {
      method: 'POST',
      headers: type ? { 'Content-Type': type, Accept: 'application/json' } : { Accept: 'application/json' },
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(opts.timeoutMs || 15000),
    });
  } catch (e) {
    throw new ProviderError(e.name === 'TimeoutError' ? 'SovaMoney did not answer in time' : 'Could not reach SovaMoney');
  }
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    throw new ProviderError('Unexpected response from SovaMoney (HTTP ' + res.status + ')');
  }
  if (json && json.success === 'ok' && typeof json.url === 'string') {
    if (!checkoutUrlAllowed(json.url, opts.checkoutHosts || CHECKOUT_HOSTS, opts.allowHttp)) {
      throw new ProviderError('SovaMoney returned a checkout address on an unexpected host');
    }
    return { url: json.url, message: String(json.message || '') };
  }
  throw new ProviderError(String((json && json.message) || 'SovaMoney could not start the payment'));
}

// The site's own public origin (where SovaMoney sends the IPN and returns customers).
// Adds https:// when missing; returns '' for anything unusable, including SovaMoney's own hosts.
function siteOrigin(raw) {
  let s = String(raw || '').trim();
  if (!s) return '';
  if (!/^[a-z]+:\/\//i.test(s)) s = 'https://' + s;
  let u;
  try {
    u = new URL(s);
  } catch (e) {
    return '';
  }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
  if (CHECKOUT_HOSTS.includes(u.host.toLowerCase()) || /(^|\.)sovamoney\.com$/i.test(u.hostname)) return '';
  return u.origin;
}

function signature(amount, identifier, secret) {
  return crypto.createHmac('sha256', secret).update(String(amount) + String(identifier)).digest('hex').toUpperCase();
}

// constant-time comparison; amount must be the exact string SovaMoney sent
function verifySignature(amount, identifier, received, secret) {
  if (typeof received !== 'string' || typeof amount !== 'string' || typeof identifier !== 'string') return false;
  const expected = Buffer.from(signature(amount, identifier, secret));
  const got = Buffer.from(received.trim().toUpperCase());
  return expected.length === got.length && crypto.timingSafeEqual(expected, got);
}

// "10", "10.5", "10.00000000" -> 1000 / 1050 / 1000 cents; null if not a plain decimal or
// if it has non-zero digits past the cents. No floating point involved.
function toCents(value) {
  const s = String(value == null ? '' : value).trim();
  const m = /^(\d{1,9})(?:\.(\d{1,8}))?$/.exec(s);
  if (!m) return null;
  const frac = (m[2] || '').padEnd(8, '0');
  if (/[1-9]/.test(frac.slice(2))) return null;
  return Number(m[1]) * 100 + Number(frac.slice(0, 2));
}
const centsToString = (c) => Math.floor(c / 100) + '.' + String(c % 100).padStart(2, '0');

module.exports = { SANDBOX_URL, CHECKOUT_HOSTS, siteOrigin, ProviderError, initiate, signature, verifySignature, checkoutUrlAllowed, toCents, centsToString };
