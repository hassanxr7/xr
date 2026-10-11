// Production readiness check. Run on the server before go-live and after every update:  npm run preflight
// Exit code 1 = at least one FAIL. WARN items should be reviewed.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDb } from '../src/db.js';
const dir = process.env.DATA_DIR || './data'; const file = process.env.DB_FILE || path.join(dir, 'bizsuite.sqlite'); const prod = process.env.NODE_ENV === 'production' || process.env.PREFLIGHT_PROD === '1';
const out = []; const add = (lvl, msg) => { out.push([lvl, msg]); console.log(`${lvl === 'OK' ? '  ✓' : lvl === 'WARN' ? '  !' : '  ✗'} ${lvl.padEnd(4)} ${msg}`); };
const [maj, min] = process.versions.node.split('.').map(Number); add(maj > 22 || (maj === 22 && min >= 13) ? 'OK' : 'FAIL', `Node.js ${process.versions.node} (need >= 22.13)`);
try { fs.mkdirSync(dir, { recursive: true }); const t = path.join(dir, '.w'); fs.writeFileSync(t, 'x'); fs.unlinkSync(t); add('OK', `data directory writable: ${dir}`); } catch (e) { add('FAIL', `data directory not writable: ${e.message}`); }
try { const st = fs.statfsSync(dir); const free = (st.bavail * st.bsize) / 1048576; add(free > 500 ? 'OK' : 'WARN', `free disk ${free.toFixed(0)} MB`); } catch { add('WARN', 'could not read free disk space'); }
if (!fs.existsSync(file)) add('WARN', `database ${file} does not exist yet (run: npm run bootstrap)`);
else {
  const ro = new DatabaseSync(file, { readOnly: true }); const g = (q) => ro.prepare(q).get(); const all = (q) => ro.prepare(q).all();
  add(g('PRAGMA integrity_check').integrity_check === 'ok' ? 'OK' : 'FAIL', 'database integrity_check'); add(all('PRAGMA foreign_key_check').length === 0 ? 'OK' : 'FAIL', 'foreign_key_check');
  ro.close(); const db = openDb(file); // applies pending migrations
  add('OK', `migrations applied: ${db.prepare('SELECT COUNT(*) c FROM schema_migrations').get().c}`);
  const demo = db.prepare("SELECT email FROM users WHERE email LIKE '%@demo.so' OR email='platform@bizsuite.local'").all();
  add(demo.length === 0 ? 'OK' : prod ? 'FAIL' : 'WARN', demo.length ? `demo accounts present (${demo.length}) - remove demo data before go-live` : 'no demo accounts');
  const owners = db.prepare("SELECT u.email,u.totp_enabled,u.must_change_password FROM users u JOIN roles r ON r.id=u.role_id WHERE r.name='Owner' AND u.active=1").all();
  add(owners.length ? 'OK' : 'FAIL', `active owner accounts: ${owners.length}`);
  for (const o of owners) { if (!o.totp_enabled) add('WARN', `owner ${o.email} has no two-factor authentication`); if (o.must_change_password) add('WARN', `owner ${o.email} has not yet changed the initial password`); }
  const bk = path.join(dir, 'backups'); const files = fs.existsSync(bk) ? fs.readdirSync(bk).filter((f) => f.endsWith('.sqlite')).sort() : [];
  if (!files.length) add('WARN', 'no backup exists yet (run: npm run backup)'); else { const age = (Date.now() - fs.statSync(path.join(bk, files.at(-1))).mtimeMs) / 3600e3; add(age < 36 ? 'OK' : 'WARN', `latest backup ${age.toFixed(1)} h old (${files.length} kept)`); }
  const br = db.prepare('SELECT COUNT(*) c FROM branches').get().c; add(br ? 'OK' : 'WARN', `branches configured: ${br}`);
  db.close();
}
if (prod) { add(process.env.HTTPS === '1' ? 'OK' : 'WARN', 'HTTPS=1 (HSTS) set'); add(process.env.TRUST_PROXY === '1' ? 'OK' : 'WARN', 'TRUST_PROXY=1 when behind a reverse proxy'); add(process.env.SEED_DEMO === '1' ? 'FAIL' : 'OK', 'SEED_DEMO is not 1'); add(process.env.REQUIRE_2FA === '1' ? 'OK' : 'WARN', 'REQUIRE_2FA=1 recommended'); }
const fails = out.filter((x) => x[0] === 'FAIL').length, warns = out.filter((x) => x[0] === 'WARN').length; console.log(`\n${fails ? 'NOT READY' : 'READY'}: ${fails} failure(s), ${warns} warning(s)`); process.exit(fails ? 1 : 0);
