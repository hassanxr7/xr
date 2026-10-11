// Exports every Somali string (UI, errors, documents) to docs/somali-review.csv for a native-speaker review: Key, English, Somali, Status.
import fs from 'node:fs';
import { so } from '../public/i18n.js';
import { errSo } from '../public/i18n_err.js';
const english = JSON.parse(fs.readFileSync(process.env.UI_STRINGS || '/tmp/ui-strings.json', 'utf8'));
const q = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`; const rows = [['Type', 'English / code', 'Somali (current)', 'Reviewer correction', 'Approved? (Y/N)']];
for (const k of Object.keys(so).filter((k) => !k.startsWith('err.')).sort((a, b) => a.localeCompare(b))) rows.push(['UI', k, so[k], '', '']);
for (const k of Object.keys(errSo).sort()) rows.push(['Error', k.replace('err.', ''), errSo[k], '', '']);
fs.writeFileSync(new URL('../docs/somali-review.csv', import.meta.url), '﻿' + rows.map((r) => r.map(q).join(',')).join('\r\n')); console.log(rows.length - 1 + ' strings exported'); void english;
