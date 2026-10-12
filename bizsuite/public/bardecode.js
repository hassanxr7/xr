// 1D barcode reader for camera frames: EAN-13 / UPC-A and Code 128 (the barcodes on shop and mall price tags).
// Used when the browser has no built-in BarcodeDetector (e.g. Chrome on Windows). Pure functions; tested in node.

const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const runsOf = (bits) => { const out = []; let n = 1; for (let i = 1; i <= bits.length; i++) { if (bits[i] === bits[i - 1]) n++; else { out.push(n); n = 1; } } return out; };
const LR = L.map(runsOf); // left-hand odd parity, starts with a space: [s,b,s,b]
const GR = LR.map((r) => [...r].reverse()); // even parity
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
const C128 = ['212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132', '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331', '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214', '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141', '114131', '311141', '411131', '211412', '211214', '211232'].map((p) => [...p].map(Number));
const STOP = [2, 3, 3, 1, 1, 1, 2];

const sum = (a, i, n) => { let s = 0; for (let k = 0; k < n; k++) s += a[i + k]; return s; };
function match(runs, i, n, total, pats) { // best pattern for runs[i..i+n) normalised to `total` modules
  const t = sum(runs, i, n); let best = -1, err = Infinity;
  for (let p = 0; p < pats.length; p++) { let e = 0; for (let k = 0; k < n; k++) e += Math.abs((runs[i + k] * total) / t - pats[p][k]); if (e < err) { err = e; best = p; } }
  return { p: best, err };
}
const eanCheck = (s) => { let x = 0; for (let i = 0; i < 12; i++) x += Number(s[i]) * (i % 2 ? 3 : 1); return (10 - (x % 10)) % 10 === Number(s[12]); };

// runs: widths of alternating colours; dark[k] tells whether run k is a bar
function ean(runs, dark) {
  for (let i = 1; i + 59 <= runs.length; i++) {
    if (!dark[i]) continue; const m = sum(runs, i, 59) / 95; const ok = (w) => w > 0.45 * m && w < 1.8 * m;
    if (runs[i - 1] < 2.5 * m) continue; // quiet zone
    if (![0, 1, 2, 27, 28, 29, 30, 31, 56, 57, 58].every((k) => ok(runs[i + k]))) continue;
    let digits = '', par = '', bad = false;
    for (let d = 0; d < 6 && !bad; d++) { const a = match(runs, i + 3 + 4 * d, 4, 7, LR), b = match(runs, i + 3 + 4 * d, 4, 7, GR); const best = a.err <= b.err ? a : b; if (best.err > 1.6) bad = true; digits += best.p; par += a.err <= b.err ? 'L' : 'G'; }
    for (let d = 0; d < 6 && !bad; d++) { const r = match(runs, i + 32 + 4 * d, 4, 7, LR); if (r.err > 1.6) bad = true; digits += r.p; } // right half: same widths as L, starting with a bar
    if (bad) continue; const first = PARITY.indexOf(par); if (first < 0) continue;
    const code = first + digits; if (eanCheck(code)) return code;
  }
  return null;
}
function code128(runs, dark) {
  for (let i = 1; i + 6 * 3 + 7 <= runs.length; i++) {
    if (!dark[i]) continue; const st = match(runs, i, 6, 11, C128); if (st.p < 103 || st.err > 1.5) continue;
    const m = sum(runs, i, 6) / 11; if (runs[i - 1] < 4 * m) continue; // quiet zone
    const vals = [st.p]; let k = i + 6, done = false;
    while (k + 6 <= runs.length && vals.length < 80) {
      if (k + 7 <= runs.length) { const t = sum(runs, k, 7); let e = 0; for (let j = 0; j < 7; j++) e += Math.abs((runs[k + j] * 13) / t - STOP[j]); if (e < 1.6 && Math.abs(t / 13 - m) < 0.5 * m) { done = true; break; } }
      const s = match(runs, k, 6, 11, C128); if (s.err > 1.8) break; vals.push(s.p); k += 6;
    }
    if (!done || vals.length < 3) continue;
    const check = vals.pop(); let x = vals[0]; for (let j = 1; j < vals.length; j++) x += vals[j] * j; if (x % 103 !== check) continue;
    let set = vals[0] === 103 ? 'A' : vals[0] === 104 ? 'B' : 'C', out = '';
    for (const v of vals.slice(1)) {
      if (v === 99) set = 'C'; else if (v === 100) set = 'B'; else if (v === 101) set = 'A'; else if (v >= 96) continue;
      else if (set === 'C') out += String(v).padStart(2, '0'); else if (set === 'B') out += String.fromCharCode(v + 32); else out += String.fromCharCode(v < 64 ? v + 32 : v - 64);
    }
    if (out) return out;
  }
  return null;
}
// Binarise one row of luminance values with a local (min+max)/2 threshold; returns runs + colours.
export function rowRuns(lum, win = Math.max(12, Math.round(lum.length / 24))) {
  const n = lum.length; const bits = new Uint8Array(n);
  for (let x = 0; x < n; x++) {
    let lo = 255, hi = 0; const a = Math.max(0, x - win), b = Math.min(n - 1, x + win);
    for (let k = a; k <= b; k += 2) { const v = lum[k]; if (v < lo) lo = v; if (v > hi) hi = v; }
    bits[x] = hi - lo > 28 && lum[x] < (lo + hi) / 2 ? 1 : 0;
  }
  const runs = [], dark = []; let start = 0;
  for (let x = 1; x <= n; x++) if (x === n || bits[x] !== bits[start]) { runs.push(x - start); dark.push(bits[start] === 1); start = x; }
  return { runs, dark };
}
export function decodeRow(lum) {
  const { runs, dark } = rowRuns(lum);
  for (const [r, d] of [[runs, dark], [[...runs].reverse(), [...dark].reverse()]]) { // also upside down
    const e = ean(r, d); if (e) return { format: 'ean_13', text: e };
    const c = code128(r, d); if (c) return { format: 'code_128', text: c };
  }
  return null;
}
// gray: Uint8Array w*h. Reads several rows across the middle of the picture; a code must be read on two rows to count.
export function decodeImage(gray, w, h, rows = 17) {
  const seen = new Map(); const row = new Uint8Array(w); const acc = new Uint16Array(w);
  for (let k = 0; k < rows; k++) {
    const y = Math.round(h * (0.2 + (0.6 * k) / (rows - 1)));
    // average 5 neighbouring rows (camera noise)
    acc.fill(0); for (let dy = -2; dy <= 2; dy++) { const yy = Math.min(h - 1, Math.max(0, y + dy)) * w; for (let x = 0; x < w; x++) acc[x] += gray[yy + x]; }
    // sharpen (blurred narrow bars keep their contrast): v' = 2v - mean(v[x-2..x+2])
    for (let x = 0; x < w; x++) { let m = 0; for (let k = -2; k <= 2; k++) m += acc[Math.min(w - 1, Math.max(0, x + k))]; row[x] = Math.max(0, Math.min(255, (2 * acc[x] - m / 5) / 5)); }
    const r = decodeRow(row); if (!r) continue; const key = r.format + ':' + r.text; const n = (seen.get(key) || 0) + 1; seen.set(key, n); if (n >= 2) return r;
  }
  return null;
}
export const toGray = (rgba, w, h) => { const g = new Uint8Array(w * h); for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8; return g; };
