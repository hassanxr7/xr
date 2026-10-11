import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { so } from '../public/i18n.js';
import { makeT, translateReport, translateNotification } from '../src/lang.js';

test('every UI string and every server error code has a Somali translation', () => {
  const out = execFileSync('node', ['scripts/i18n-audit.mjs', '--strict'], { cwd: new URL('..', import.meta.url).pathname }).toString();
  assert.match(out, /missing: 0\nServer error codes: \d+; translated: \d+; missing: 0/);
});
test('Somali dictionary has no empty values and keeps placeholders intact', () => {
  for (const [k, v] of Object.entries(so)) { assert.ok(typeof v === 'string' && v.trim().length > 0, `empty translation for "${k}"`); for (const p of k.match(/\{\w+\}/g) || []) assert.ok(v.includes(p), `placeholder ${p} lost in "${k}"`); }
});
test('printed documents, reports and notifications follow the language', () => {
  const T = makeT('so'); assert.equal(T('Balance due'), 'Haraaga la bixinayo'); assert.equal(makeT('en')('Balance due'), 'Balance due'); assert.equal(T('Not in dictionary'), 'Not in dictionary');
  const rep = translateReport({ columns: [{ key: 'a', label: 'Net profit' }], rows: [{ item: 'FINAL PROFIT after deductions' }], meta: { title: 'Audit activity', reporting: 'x' } }, 'so'); assert.equal(rep.columns[0].label, "Faa'iidada saafiga ah"); assert.equal(rep.meta.title, 'Hawlaha hubinta'); assert.match(rep.rows[0].item, /FAA'IIDADA UGU DAMBAYSA/);
  assert.match(translateNotification('Cash difference -500 at Rio Store (session 4)', 'so'), /Farqi lacag ah -500 Rio Store/); assert.equal(translateNotification('Cash difference -500 at X (session 4)', 'en'), 'Cash difference -500 at X (session 4)');
});

import { world, client } from './helpers.js';
import * as sales from '../src/sales.js';
test('receipt, report and notification endpoints honour ?lang=so', async () => {
  const w = world(); const b = w.biz('Shop', 'clothing'); const A = w.branch(b, 'AAA'); const v = w.product(b, 'X', { min_stock: 5 }); w.buy(A, v, 3, 1000);
  const s = sales.createSale(w.O, { branch_id: A, kind: 'retail', lines: [{ variant_id: v, qty: 1 }], payments: [{ method_id: w.CASH, amount: 2000 }] });
  const api = await client(w.db).login('o@t.so');
  const so = api('GET', '/api/print/sale/' + s.id, {}, { mode: 'a4', lang: 'so' }).body; assert.ok(so.includes('Faktuur') && so.includes('Haraaga la bixinayo') && !so.includes('Balance due'));
  const en = api('GET', '/api/print/sale/' + s.id, {}, { mode: 'a4' }).body; assert.ok(en.includes('Balance due') && en.includes('Invoice'));
  const rp = api('GET', '/api/reports/profit', {}, { preset: 'year', lang: 'so' }).body; assert.equal(rp.meta.title, "Faa'iidada guud iyo saafiga ah"); assert.ok(rp.columns.some((c) => c.label === "Faa'iidada saafiga ah"));
  assert.ok(api('GET', '/api/reports/profit', {}, { preset: 'year', lang: 'so', format: 'csv' }).body.includes("Faa'iidada saafiga ah")); assert.ok(api('GET', '/api/reports/profit', {}, { preset: 'year', format: 'xlsx' }).body.subarray(0, 2).toString() === 'PK');
  const n = api('GET', '/api/notifications', {}, { lang: 'so' }).body; assert.ok(n.rows.some((x) => /kayd yar|dhammaatay/.test(x.message)), 'low-stock notification in Somali');
});
