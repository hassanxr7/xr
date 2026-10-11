import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
// Consistent online backup via VACUUM INTO (single transaction snapshot), then verified by reopening.
export function createBackup(db, dir, keep = 14) {
  fs.mkdirSync(dir, { recursive: true });
  const name = `bizsuite-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`; const file = path.join(dir, name);
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  const v = verifyBackup(file); if (!v.ok) { fs.unlinkSync(file); throw new Error('Backup verification failed: ' + JSON.stringify(v)); }
  const all = fs.readdirSync(dir).filter((f) => f.startsWith('bizsuite-') && f.endsWith('.sqlite')).sort();
  for (const old of all.slice(0, Math.max(0, all.length - keep))) fs.unlinkSync(path.join(dir, old));
  return { file, name, bytes: fs.statSync(file).size, ...v };
}
export function verifyBackup(file) {
  const d = new DatabaseSync(file, { readOnly: true });
  try {
    const integrity = d.prepare('PRAGMA integrity_check').get().integrity_check; const fk = d.prepare('PRAGMA foreign_key_check').all().length;
    const tables = ['orgs', 'branches', 'users', 'sales', 'payments', 'stock_movements', 'commission_ledger']; const counts = Object.fromEntries(tables.map((t) => [t, d.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c]));
    return { ok: integrity === 'ok' && fk === 0, integrity, fk_violations: fk, counts };
  } finally { d.close(); }
}
export function restoreBackup(file, target) { // run with the server stopped
  const v = verifyBackup(file); if (!v.ok) throw new Error('Refusing to restore an unverified backup: ' + JSON.stringify(v));
  if (fs.existsSync(target)) fs.copyFileSync(target, target + '.before-restore-' + Date.now());
  for (const ext of ['-wal', '-shm']) if (fs.existsSync(target + ext)) fs.unlinkSync(target + ext);
  fs.copyFileSync(file, target); return v;
}
export function listBackups(dir) { return fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.sqlite')).sort().reverse().map((f) => ({ name: f, bytes: fs.statSync(path.join(dir, f)).size })) : []; }
