/* Owner admin: first-run setup, password login, and the settings page's API
 * (SovaMoney keys and public URL, deposit list).
 *
 * Settings live in server/data/settings.json (git-ignored, mode 0600). Secret values are
 * never sent back to the browser or written to logs; the page only sees "set" plus the
 * last four characters.
 *
 * First run: the server prints a one-time setup code to its log. Open /admin, enter the
 * code and choose a password.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SESSION_MS = 8 * 3600e3;
const COOKIE = 'db_admin';

const hashPassword = (password, salt) => crypto.scryptSync(String(password), salt, 32).toString('hex');
const safeEqual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
const hint = (v) => (v ? '••••' + String(v).slice(-4) : '');

class Admin {
  constructor(file, log) {
    this.file = file;
    this.log = log;
    this.sessions = new Map(); // token -> expiry
    this.failures = new Map(); // ip -> failed login timestamps
    this.data = {};
    if (file && fs.existsSync(file)) this.data = JSON.parse(fs.readFileSync(file, 'utf8')) || {};
    this.setupCode = null;
    if (!this.data.admin) {
      const raw = crypto.randomBytes(5).toString('hex').toUpperCase();
      this.setupCode = raw.slice(0, 5) + '-' + raw.slice(5);
      this.log('[admin] First-time setup: open /admin and enter setup code ' + this.setupCode);
    }
  }

  get sova() {
    return this.data.sova || {};
  }

  save() {
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }

  token(req) {
    const m = new RegExp('(?:^|;\\s*)' + COOKIE + '=([a-f0-9]{64})').exec(String(req.headers.cookie || ''));
    return m ? m[1] : null;
  }

  isAdmin(req) {
    const t = this.token(req);
    if (!t) return false;
    const exp = this.sessions.get(t);
    if (!exp || exp < Date.now()) {
      this.sessions.delete(t);
      return false;
    }
    return true;
  }

  startSession(res, secure) {
    const t = crypto.randomBytes(32).toString('hex');
    this.sessions.set(t, Date.now() + SESSION_MS);
    res.setHeader('Set-Cookie', COOKIE + '=' + t + '; Path=/; HttpOnly; SameSite=Strict; Max-Age=' + SESSION_MS / 1000 + (secure ? '; Secure' : ''));
  }

  tooManyFailures(ip) {
    const now = Date.now();
    const recent = (this.failures.get(ip) || []).filter((x) => now - x < 15 * 60e3);
    this.failures.set(ip, recent);
    return recent.length >= 8;
  }

  fail(ip) {
    (this.failures.get(ip) || this.failures.set(ip, []).get(ip)).push(Date.now());
  }

  // settings view for the page: never the secret values themselves
  view(effective) {
    const s = this.sova;
    return {
      publicKey: { set: !!effective.publicKey, hint: hint(effective.publicKey), from: s.publicKey ? 'admin' : effective.publicKey ? 'environment' : '' },
      secretKey: { set: !!effective.secretKey, hint: hint(effective.secretKey), from: s.secretKey ? 'admin' : effective.secretKey ? 'environment' : '' },
      mode: effective.mode,
      publicUrl: effective.publicUrl,
      currency: effective.currency,
      enabled: effective.enabled,
      ipnUrl: effective.publicUrl ? effective.publicUrl + '/payments/sovamoney/ipn' : '',
      updatedAt: this.data.updatedAt || null,
    };
  }

  // returns an error message or null
  update(body) {
    const next = Object.assign({}, this.sova);
    const pk = String(body.publicKey || '').trim();
    const sk = String(body.secretKey || '').trim();
    if (pk) {
      if (!/^[A-Za-z0-9]{8,50}$/.test(pk)) return 'Public key should be 8–50 letters and digits.';
      next.publicKey = pk;
    }
    if (sk) {
      if (!/^[A-Za-z0-9]{8,100}$/.test(sk)) return 'Secret key should be 8–100 letters and digits.';
      next.secretKey = sk;
    }
    if (body.mode != null && body.mode !== 'sandbox') return 'Only sandbox mode is enabled in this build.';
    if (body.publicUrl != null && String(body.publicUrl).trim()) {
      let u;
      try {
        u = new URL(String(body.publicUrl).trim());
      } catch (e) {
        return 'Public URL is not a valid address.';
      }
      const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
      if (u.protocol !== 'https:' && !(local && u.protocol === 'http:')) return 'Public URL must start with https:// so SovaMoney can reach it.';
      next.publicUrl = u.origin;
    }
    if (body.currency != null && String(body.currency).trim()) {
      const c = String(body.currency).trim().toUpperCase();
      if (!/^[A-Z]{3,4}$/.test(c)) return 'Currency must be a 3–4 letter code such as USD.';
      next.currency = c;
    }
    if (body.clearKeys === true) {
      delete next.publicKey;
      delete next.secretKey;
    }
    this.data.sova = next;
    this.data.updatedAt = Date.now();
    this.save();
    return null;
  }
}

module.exports = { Admin, hashPassword, safeEqual };
