import test from 'node:test';
import assert from 'node:assert/strict';
import { world, client } from './helpers.js';
import { ean13Check, isEan13, isUpcA, internalEan, ean13Bits, code128Bits, code128Values, barcodeSvg, symbologyOf, assignMissingBarcodes } from '../src/barcode.js';
import { decodeImage } from '../public/bardecode.js';
import * as inv from '../src/inventory.js';
import * as sales from '../src/sales.js';

// draw a barcode the way a phone camera sees it: scaled, blurred, noisy, sometimes upside down
let seed = 3; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x80000000; };
function photo(bits, scale, { blur = 1, noise = 8, flip = false } = {}) {
  const W = 640, H = 360, g = new Float32Array(W * H).fill(235); const bw = bits.length * scale, x0 = Math.round((W - bw) / 2);
  for (let y = 80; y < 280; y++) for (let x = 0; x < bw; x++) { const m = Math.floor(x / scale); if ((flip ? bits[bits.length - 1 - m] : bits[m]) === '1') g[y * W + x0 + x] = 30; }
  const out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { let s = 0, n = 0; for (let k = -blur; k <= blur; k++) if (x + k >= 0 && x + k < W) { s += g[y * W + x + k]; n++; } out[y * W + x] = Math.max(0, Math.min(255, s / n + (rnd() - 0.5) * 2 * noise)); }
  return out;
}

test('EAN-13 check digits, in-store numbers (prefix 20) and UPC-A', () => {
  assert.equal(ean13Check('590123412345'), '7'); assert.ok(isEan13('5901234123457')); assert.ok(!isEan13('5901234123458'));
  assert.equal(internalEan(15), '2000000000152'); assert.ok(isEan13(internalEan(987654321))); assert.ok(isUpcA('036000291452'));
  assert.equal(symbologyOf('2000000000152'), 'EAN-13'); assert.equal(symbologyOf('RST-POLO-M'), 'Code 128'); assert.equal(ean13Bits('2000000000152').length, 95);
  assert.deepEqual(code128Values('123456').slice(0, 4), [105, 12, 34, 56], 'all-digit codes use the compact set C');
  assert.match(barcodeSvg('2000000000152'), /aria-label="EAN-13 2000000000152"/); assert.match(barcodeSvg('POLO-B-M'), /aria-label="Code 128 POLO-B-M"/);
  assert.throws(() => code128Bits('é'), /printable ASCII/);
});

test('camera reader decodes shop barcodes (EAN-13 and Code 128), also blurred and upside down, and never invents a code', () => {
  const cases = [internalEan(42), '5901234123457', internalEan(123456789), 'RST-POLOSHIR-M-BLA', 'SNK-41', '600100121'];
  let ok = 0, n = 0;
  for (const c of cases) for (const [scale, opt] of [[3, {}], [4, { blur: 2, noise: 12 }], [3, { flip: true }], [2.5, { noise: 14 }]]) {
    const bits = isEan13(c) ? ean13Bits(c) : code128Bits(c); if (bits.length * scale > 600) continue; n++;
    const r = decodeImage(photo(bits, scale, opt), 640, 360); if (r) assert.equal(r.text, c, 'a wrong read is never acceptable'); if (r?.text === c) ok++;
  }
  assert.ok(ok >= n - 1, `decoded ${ok}/${n}`);
  for (let i = 0; i < 20; i++) { const g = new Uint8Array(640 * 360); for (let k = 0; k < g.length; k++) g[k] = rnd() < 0.5 ? 30 : 220; assert.equal(decodeImage(g, 640, 360), null); }
});

test('every new item gets its own shop barcode; older items are given one on upgrade; scanners may send UPC-A or EAN-13', () => {
  const w = world(); const b = w.biz('Rio Store', 'clothing'); const A = w.branch(b, 'RST');
  const p = inv.createProduct(w.O, { business_id: b, name: 'Polo', variants: [{ sku: 'P-M', attrs: { size: 'M' }, price: 1800 }, { sku: 'P-L', attrs: { size: 'L' }, price: 1800 }, { sku: 'P-X', barcode: '036000291452', price: 1800 }] });
  const rows = w.db.prepare('SELECT id, barcode FROM variants WHERE product_id=? ORDER BY id').all(p.id); assert.deepEqual(p.variant_ids, rows.map((r) => r.id));
  assert.ok(isEan13(rows[0].barcode) && rows[0].barcode.startsWith('20') && rows[0].barcode !== rows[1].barcode); assert.equal(rows[2].barcode, '036000291452', 'a manufacturer barcode is kept');
  w.db.prepare("UPDATE variants SET barcode=NULL WHERE id=?").run(rows[1].id); assert.equal(assignMissingBarcodes(w.db), 1); assert.ok(isEan13(w.db.prepare('SELECT barcode FROM variants WHERE id=?').get(rows[1].id).barcode));
  w.buy(A, rows[2].id, 2, 900);
  assert.equal(sales.posSearch(w.O, { branch_id: A, barcode: '0036000291452' })[0].id, rows[2].id, 'EAN-13 form of a UPC-A code'); assert.equal(sales.posSearch(w.O, { branch_id: A, barcode: rows[0].barcode })[0].id, rows[0].id);
});

test('price tags: mall layouts with barcode digits, struck-through price after a mark-down, no maximum discount', async () => {
  const w = world(); const b = w.biz('Rio Store', 'clothing'); const A = w.branch(b, 'RST'); w.user('Mgr', 'Branch Manager', [A]); const api = await client(w.db).login('mgr@t.so');
  const v = w.product(b, 'ABY-54', { name: 'Dress Abaya', price: 6900 }); w.db.prepare('UPDATE variants SET max_discount_bp=1000 WHERE id=?').run(v); w.buy(A, v, 3, 2500);
  assert.equal(api('PATCH', '/api/variants/' + v, { price: 5500, markdown: true }).status, 200); assert.equal(w.db.prepare('SELECT was_price FROM variants WHERE id=?').get(v).was_price, 6900);
  const code = w.db.prepare('SELECT barcode FROM variants WHERE id=?').get(v).barcode;
  for (const layout of ['tag', 'tagroll', 'sheet', 'roll']) {
    const r = api('GET', '/api/print/labels', {}, { ids: String(v), copies: 'stock', branch_id: A, layout }); assert.equal(r.status, 200);
    assert.equal((r.body.match(/class="lb /g) || []).length, 3, layout + ': one tag per piece'); assert.ok(r.body.includes(`aria-label="EAN-13 ${code}"`), layout + ': EAN-13 barcode');
    assert.ok(r.body.includes('<s>69.00 USD</s>') && r.body.includes('55.00 USD'), layout + ': old price struck through'); assert.ok(!/Max discount|10%/.test(r.body), layout + ': maximum discount is not printed for customers');
  }
  assert.equal((api('GET', '/api/print/labels', {}, { ids: String(v), copies: '1', layout: 'sheet', code: 'both' }).body.match(/<svg/g) || []).length, 2, 'barcode + QR'); assert.ok(api('GET', '/api/print/labels', {}, { ids: String(v), copies: '1', layout: 'tag', code: 'both' }).body.includes('Scan with the phone'));
  assert.equal(api('PATCH', '/api/variants/' + v, { price: 6900 }).status, 200); assert.equal(w.db.prepare('SELECT was_price FROM variants WHERE id=?').get(v).was_price, null, 'back to full price ends the mark-down');
  assert.equal(api('GET', '/api/barcode', {}, { code }).status, 200); assert.equal(api('GET', '/api/barcode', {}, { code: 'é' }).status, 400);
});

test('English is the default language; Somali is an option saved per user and as the organisation default', async () => {
  const w = world(); const c = client(w.db); const api = await c.login('o@t.so');
  assert.equal(c.anon('GET', '/api/branding').body.default_lang, 'en'); assert.equal(api('GET', '/api/auth/me').body.lang, 'en');
  assert.equal(api('POST', '/api/auth/lang', { lang: 'so' }).status, 200); assert.equal(api('GET', '/api/auth/me').body.lang, 'so'); assert.equal(api('POST', '/api/auth/lang', { lang: 'fr' }).status, 400);
  assert.equal(api('PATCH', '/api/org', { default_lang: 'so' }).status, 200); assert.equal(c.anon('GET', '/api/branding').body.default_lang, 'so');
  const b = w.biz('X', 'clothing'); const A = w.branch(b, 'XXX'); const id = w.user('New', 'Cashier', [A]); assert.equal(w.db.prepare('SELECT lang FROM users WHERE id=?').get(id).lang, 'so', 'new staff follow the organisation default');
  assert.equal(api('PATCH', '/api/org', { default_lang: 'de' }).status, 400);
});
