// Lists user-facing English strings (UI) and server error codes that have no Somali translation yet.
// usage: node scripts/i18n-audit.mjs [--list]
import fs from 'node:fs'; import path from 'node:path';
import { so } from '../public/i18n.js';
const dir = new URL('../public/', import.meta.url).pathname; const files = fs.readdirSync(dir).filter((f) => f.startsWith('v_') || f === 'app.js' || f === 'core.js');
const found = new Map();
const add = (s, f) => { s = s.trim(); if (!s || s.length < 2 || !/[A-Za-z]{2}/.test(s)) return; if (!found.has(s)) found.set(s, new Set()); found.get(s).add(f); };
for (const f of files) {
  const src = fs.readFileSync(path.join(dir, f), 'utf8');
  for (const m of src.matchAll(/\bt\('((?:[^'\\]|\\.)*)'\)/g)) add(m[1].replace(/\\'/g, "'"), f);
  for (const m of src.matchAll(/\blabel: '((?:[^'\\]|\\.)*)'/g)) add(m[1].replace(/\\'/g, "'"), f);
  for (const m of src.matchAll(/\[\s*'[a-z_]*',\s*'((?:[^'\\]|\\.)*)'\s*\]/g)) add(m[1], f); // option pairs ['value','Label']
  for (const m of src.matchAll(/h\('(?:button|h1|h2|h3|th|label|option|span|p|b|small)', (?:\{[^}]*\}|null), '((?:[^'\\]|\\.)*)'/g)) add(m[1].replace(/\\'/g, "'"), f);
  for (const m of src.matchAll(/toast\('((?:[^'\\]|\\.)*)'/g)) add(m[1].replace(/\\'/g, "'"), f);
}
const missing = [...found.keys()].filter((k) => !so[k] && !/^(err\.|[A-Z]{2,4}$)/.test(k) && !/^[\w./#:-]+$/.test(k) || (/ /.test(k) && !so[k])).filter((k) => !so[k]);
const codes = new Set(); for (const f of fs.readdirSync(new URL('../src/', import.meta.url).pathname)) { const src = fs.readFileSync(new URL('../src/' + f, import.meta.url), 'utf8'); for (const m of src.matchAll(/\bbad\('([a-z_]+)'/g)) codes.add(m[1]); for (const m of src.matchAll(/AppError\(\d+, '([a-z_]+)'/g)) codes.add(m[1]); for (const m of src.matchAll(/forbidden\([^)]*?'([a-z_]+)'\)/g)) codes.add(m[1]); }
const missingCodes = [...codes].filter((c) => !so['err.' + c]);
console.log(`UI strings found: ${found.size}; translated: ${found.size - missing.length}; missing: ${missing.length}`);
console.log(`Server error codes: ${codes.size}; translated: ${codes.size - missingCodes.length}; missing: ${missingCodes.length}`);
if (process.argv.includes('--list')) { console.log('\nMISSING UI:\n' + missing.sort().join('\n')); console.log('\nMISSING CODES:\n' + missingCodes.sort().join('\n')); }
process.exit(process.argv.includes('--strict') && (missing.length || missingCodes.length) ? 1 : 0);
