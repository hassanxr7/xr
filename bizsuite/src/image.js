// Minimal image preparation for PDF embedding (no dependencies): JPEG passthrough, PNG decoded to raw samples.
import zlib from 'node:zlib';
export function prepareImage(buf, mime) {
  try { return mime === 'image/jpeg' ? jpeg(buf) : mime === 'image/png' ? png(buf) : null; } catch { return null; }
}
function jpeg(b) {
  let i = 2; while (i < b.length) { if (b[i] !== 0xff) { i++; continue; } const m = b[i + 1]; if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) { const h = b.readUInt16BE(i + 5), w = b.readUInt16BE(i + 7), n = b[i + 9]; if (n === 4) return null; return { w, h, cs: n === 1 ? 'DeviceGray' : 'DeviceRGB', bpc: 8, filter: 'DCTDecode', data: b }; } i += 2 + b.readUInt16BE(i + 2); }
  return null;
}
function png(b) {
  if (b.readUInt32BE(0) !== 0x89504e47) return null; let o = 8, w = 0, h = 0, depth = 0, ct = 0, il = 0; const idat = []; let plte = null, trns = null;
  while (o < b.length) { const len = b.readUInt32BE(o), type = b.toString('ascii', o + 4, o + 8), d = b.subarray(o + 8, o + 8 + len); if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); depth = d[8]; ct = d[9]; il = d[12]; } else if (type === 'IDAT') idat.push(d); else if (type === 'PLTE') plte = d; else if (type === 'tRNS') trns = d; else if (type === 'IEND') break; o += 12 + len; }
  if (il || depth !== 8 || ![0, 2, 3, 4, 6].includes(ct) || w * h > 4e6) return null;
  const ch = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ct]; const raw = zlib.inflateSync(Buffer.concat(idat)); const stride = w * ch; const px = Buffer.alloc(h * stride);
  for (let y = 0; y < h; y++) { const f = raw[y * (stride + 1)]; const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)); for (let x = 0; x < stride; x++) { const a = x >= ch ? px[y * stride + x - ch] : 0, up = y ? px[(y - 1) * stride + x] : 0, c = x >= ch && y ? px[(y - 1) * stride + x - ch] : 0; let v = src[x]; if (f === 1) v += a; else if (f === 2) v += up; else if (f === 3) v += (a + up) >> 1; else if (f === 4) { const p = a + up - c, pa = Math.abs(p - a), pb = Math.abs(p - up), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c; } px[y * stride + x] = v & 255; } }
  const n = w * h; let rgb, alpha = null, cs = 'DeviceRGB';
  if (ct === 2) rgb = px; else if (ct === 0) { rgb = px; cs = 'DeviceGray'; }
  else if (ct === 6) { rgb = Buffer.alloc(n * 3); alpha = Buffer.alloc(n); for (let i = 0; i < n; i++) { rgb[i * 3] = px[i * 4]; rgb[i * 3 + 1] = px[i * 4 + 1]; rgb[i * 3 + 2] = px[i * 4 + 2]; alpha[i] = px[i * 4 + 3]; } }
  else if (ct === 4) { rgb = Buffer.alloc(n); alpha = Buffer.alloc(n); cs = 'DeviceGray'; for (let i = 0; i < n; i++) { rgb[i] = px[i * 2]; alpha[i] = px[i * 2 + 1]; } }
  else { if (!plte) return null; rgb = Buffer.alloc(n * 3); if (trns) alpha = Buffer.alloc(n, 255); for (let i = 0; i < n; i++) { const k = px[i]; rgb[i * 3] = plte[k * 3]; rgb[i * 3 + 1] = plte[k * 3 + 1]; rgb[i * 3 + 2] = plte[k * 3 + 2]; if (trns && k < trns.length) alpha[i] = trns[k]; } }
  return { w, h, cs, bpc: 8, filter: 'FlateDecode', data: zlib.deflateSync(rgb), smask: alpha ? { w, h, cs: 'DeviceGray', bpc: 8, filter: 'FlateDecode', data: zlib.deflateSync(alpha) } : null };
}
