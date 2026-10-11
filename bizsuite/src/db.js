import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const here = path.dirname(fileURLToPath(import.meta.url));

export function openDb(file = ':memory:') {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA synchronous=NORMAL;');
  migrate(db);
  return db;
}
export function migrate(db) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations(name TEXT PRIMARY KEY, applied_at TEXT)');
  const dir = path.join(here, '..', 'migrations');
  const done = new Set(db.prepare('SELECT name FROM schema_migrations').all().map((r) => r.name));
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    if (done.has(f)) continue;
    db.exec('BEGIN');
    try { db.exec(fs.readFileSync(path.join(dir, f), 'utf8')); db.prepare('INSERT INTO schema_migrations VALUES(?,?)').run(f, new Date().toISOString()); db.exec('COMMIT'); }
    catch (e) { db.exec('ROLLBACK'); throw e; }
  }
}
// Atomic unit of work with nesting via savepoints. Everything financial runs inside tx().
let depth = 0;
export function tx(db, fn) {
  const sp = `sp${depth}`;
  db.exec(depth === 0 ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${sp}`); depth++;
  try { const r = fn(); depth--; db.exec(depth === 0 ? 'COMMIT' : `RELEASE ${sp}`); return r; }
  catch (e) { depth--; db.exec(depth === 0 ? 'ROLLBACK' : `ROLLBACK TO ${sp}; RELEASE ${sp}`); throw e; }
}
export const q = (db) => ({
  get: (s, ...p) => db.prepare(s).get(...p),
  all: (s, ...p) => db.prepare(s).all(...p),
  run: (s, ...p) => db.prepare(s).run(...p),
});
