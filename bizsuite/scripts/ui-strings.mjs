import fs from 'node:fs'; import path from 'node:path';
const dir = new URL('../public/', import.meta.url).pathname; const set = new Set();
for (const f of fs.readdirSync(dir).filter((f) => f.startsWith('v_') || ['app.js', 'core.js', 'scan.js'].includes(f))) { const src = fs.readFileSync(dir + f, 'utf8'); for (const m of src.matchAll(/\bt\('((?:[^'\\]|\\.)*)'\)/g)) set.add(m[1].replace(/\\'/g, "'")); for (const m of src.matchAll(/\blabel: '((?:[^'\\]|\\.)*)'/g)) set.add(m[1].replace(/\\'/g, "'")); }
fs.writeFileSync(process.argv[2] || '/tmp/ui-strings.json', JSON.stringify([...set]));
