// Retail barcodes as used on shop and mall price tags: EAN-13 (GS1; prefix 20-29 = in-store numbers) and Code 128 for
// alphanumeric codes. Pure functions, no dependencies. Verified against the independent zxing-cpp reader in tests.

// ---- EAN-13 ----
export const ean13Check = (d12) => { let s = 0; for (let i = 0; i < 12; i++) s += Number(d12[i]) * (i % 2 ? 3 : 1); return String((10 - (s % 10)) % 10); };
export const isEan13 = (c) => /^\d{13}$/.test(String(c || '')) && ean13Check(c) === String(c)[12];
export const isUpcA = (c) => /^\d{12}$/.test(String(c || '')) && ean13Check('0' + String(c).slice(0, 11)) === String(c)[11];
// In-store number: "2" + "0" + 10-digit sequence + check digit (GS1 restricted-circulation range, never clashes with manufacturers' codes)
export const internalEan = (seq) => { const d12 = '20' + String(seq).padStart(10, '0').slice(-10); return d12 + ean13Check(d12); };

const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const G = L.map((p) => [...p].map((b) => (b === '1' ? '0' : '1')).reverse().join(''));
const R = L.map((p) => [...p].map((b) => (b === '1' ? '0' : '1')).join(''));
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
export const EAN = { L, G, R, PARITY };
export function ean13Bits(code) {
  const d = String(code); if (!isEan13(d)) throw new Error('invalid EAN-13');
  let s = '101'; const par = PARITY[Number(d[0])];
  for (let i = 1; i <= 6; i++) s += (par[i - 1] === 'L' ? L : G)[Number(d[i])];
  s += '01010'; for (let i = 7; i <= 12; i++) s += R[Number(d[i])]; s += '101';
  return s; // 95 modules
}

// ---- Code 128 (sets B and C) ----
export const C128 = ['212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412', '211214', '211232', '2331112'];
export function code128Values(text) {
  const s = String(text); if (!s.length || [...s].some((ch) => ch.charCodeAt(0) < 32 || ch.charCodeAt(0) > 126)) throw new Error('Code 128: printable ASCII only');
  const vals = []; let set = null; let i = 0;
  const digitsAt = (k) => { let n = 0; while (k + n < s.length && /\d/.test(s[k + n])) n++; return n; };
  while (i < s.length) {
    const run = digitsAt(i);
    const useC = run >= 4 && (set === 'C' || i === 0 || run >= 6 || i + run === s.length);
    if (useC && run >= 2) {
      const even = run - (run % 2); if (set !== 'C') { vals.push(set ? 99 : 105); set = 'C'; }
      for (let k = 0; k < even; k += 2) vals.push(Number(s.substr(i + k, 2))); i += even; continue;
    }
    if (set !== 'B') { vals.push(set ? 100 : 104); set = 'B'; }
    vals.push(s.charCodeAt(i) - 32); i++;
  }
  let sum = vals[0]; for (let k = 1; k < vals.length; k++) sum += vals[k] * k; vals.push(sum % 103); vals.push(106);
  return vals;
}
export function code128Bits(text) { let out = ''; for (const v of code128Values(text)) [...C128[v]].forEach((w, k) => { out += (k % 2 ? '0' : '1').repeat(Number(w)); }); return out; }

// ---- rendering ----
export const symbologyOf = (code) => (isEan13(code) ? 'EAN-13' : isUpcA(code) ? 'UPC-A' : 'Code 128');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const bars = (bits, x0, y, h, guards, gh) => { let d = ''; for (let i = 0; i < bits.length;) { if (bits[i] !== '1') { i++; continue; } let j = i; while (bits[j] === '1') j++; const tall = guards && guards(i); d += `M${x0 + i} ${y}h${j - i}v${tall ? gh : h}h${-(j - i)}z`; i = j; } return d; };
// SVG barcode with human-readable text, quiet zones included. Width in modules (scaled by the viewer); `height` in modules.
export function barcodeSvg(code, { height = 60, text = true, cls = '' } = {}) {
  let c = String(code); if (isUpcA(c)) c = '0' + c;
  if (isEan13(c)) {
    const b = ean13Bits(c); const q = 11, W = 95 + q + 7, H = height + (text ? 12 : 4);
    const guard = (i) => i < 3 || (i >= 45 && i < 50) || i >= 92;
    const t = text ? `<g font-family="OCR-B,Consolas,'Courier New',monospace" font-size="10" text-anchor="middle" fill="#000"><text x="${q - 5}" y="${height + 10}">${c[0]}</text><text x="${q + 3 + 21}" y="${height + 10}" textLength="38" lengthAdjust="spacing">${c.slice(1, 7)}</text><text x="${q + 50 + 21}" y="${height + 10}" textLength="38" lengthAdjust="spacing">${c.slice(7)}</text></g>` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" class="bc ${cls}" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges" role="img" aria-label="EAN-13 ${c}"><rect width="${W}" height="${H}" fill="#fff"/><path d="${bars(b, q, 1, height - 2, text ? guard : null, height + 3)}" fill="#000"/>${t}</svg>`;
  }
  const b = code128Bits(c); const q = 10, W = b.length + 2 * q, H = height + (text ? 12 : 4);
  const t = text ? `<text x="${W / 2}" y="${height + 10}" font-family="Consolas,'Courier New',monospace" font-size="10" text-anchor="middle" fill="#000">${esc(c)}</text>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" class="bc ${cls}" viewBox="0 0 ${W} ${H}" shape-rendering="crispEdges" role="img" aria-label="Code 128 ${esc(c)}"><rect width="${W}" height="${H}" fill="#fff"/><path d="${bars(b, q, 1, height - 2)}" fill="#000"/>${t}</svg>`;
}

// Assign an in-store EAN-13 to every variant that has no barcode (new products and existing data after an upgrade).
export function assignBarcode(db, orgId, variantId) {
  for (let seq = variantId, n = 0; n < 1000; seq += 7919, n++) {
    const code = internalEan(seq);
    if (!db.prepare('SELECT 1 FROM variants WHERE org_id=? AND (barcode=? OR sku=?)').get(orgId, code, code)) { db.prepare('UPDATE variants SET barcode=? WHERE id=?').run(code, variantId); return code; }
  }
  throw new Error('could not allocate a barcode');
}
export function assignMissingBarcodes(db) {
  const rows = db.prepare("SELECT id, org_id FROM variants WHERE barcode IS NULL OR barcode=''").all();
  for (const r of rows) assignBarcode(db, r.org_id, r.id);
  return rows.length;
}
