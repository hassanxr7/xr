import { fmt, exp } from './money.js';
import { makeT } from './lang.js';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export { esc };
const cell = (c, row, plain) => {
  const v = row[c.key]; if (v == null) return '';
  if (c.type === 'money') { const ccy = row.currency || 'USD'; return plain ? (v / 10 ** exp(ccy)).toFixed(exp(ccy)) : fmt(v, ccy); }
  return String(v);
};
export function reportCsv(rep) {
  const q = (s) => { s = String(s ?? ''); return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? "'" : '') + s.replace(/"/g, '""')}"` : s; }; // neutralise spreadsheet formulas
  const m = rep.meta; const T = makeT(m._lang); const out = [[m.company || ''], [m.title], [T('Period'), `${m.from} to ${m.to}`], [T('Branches'), m.filters.branch_ids.join('; ')], [T('Generated'), `${m.generated_at} ${T('by')} ${m.generated_by}`], [m.reporting], []];
  out.push(rep.columns.map((c) => c.label));
  for (const r of rep.rows) out.push(rep.columns.map((c) => cell(c, r, true)));
  if (rep.totals) for (const [ccy, t] of Object.entries(rep.totals)) out.push(rep.columns.map((c, i) => (i === 0 ? `${T('TOTAL')} ${ccy}` : c.type === 'money' && t[c.key] != null ? (t[c.key] / 10 ** exp(ccy || 'USD')).toFixed(exp(ccy || 'USD')) : '')));
  return '﻿' + out.map((r) => r.map(q).join(',')).join('\r\n');
}
export function reportHtml(rep, { title, logo } = {}) {
  const m = rep.meta; const T = makeT(m._lang); const head = rep.columns.map((c) => `<th class="${c.type === 'money' ? 'r' : ''}">${esc(c.label)}</th>`).join('');
  const body = rep.rows.map((r) => `<tr>${rep.columns.map((c) => `<td class="${c.type === 'money' ? 'r' : ''}">${esc(cell(c, r))}</td>`).join('')}</tr>`).join('');
  const tot = rep.totals ? Object.entries(rep.totals).map(([ccy, t]) => `<tr class="tot">${rep.columns.map((c, i) => `<td class="${c.type === 'money' ? 'r' : ''}">${i === 0 ? T('TOTAL') + ' ' + esc(ccy) : c.type === 'money' && t[c.key] != null ? esc(fmt(t[c.key], ccy || 'USD')) : ''}</td>`).join('')}</tr>`).join('') : '';
  return page(esc(title || m.title), `<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">${logo ? `<img src="${esc(logo)}" alt="" style="max-height:48px">` : ''}<b style="font-size:16px">${esc(m.company || '')}</b></div><h2>${esc(m.title)}</h2><p class="meta">${T('Period')}: ${m.from} – ${m.to} · ${T('Branches')}: ${esc(m.filters.branch_ids.join(', '))}<br>${T('Generated')} ${esc(m.generated_at)} ${T('by')} ${esc(m.generated_by)} · ${esc(m.reporting)}</p><table><thead><tr>${head}</tr></thead><tbody>${body}${tot}</tbody></table>`, 'a4');
}
const CSS = `body{font:12px/1.4 system-ui,Arial,sans-serif;color:#111;margin:16px}h2{margin:0 0 4px}table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #ccc;padding:4px 6px;text-align:left}th{background:#f2f2f2}.r{text-align:right}.tot td{font-weight:700;border-top:2px solid #000}.meta{color:#555}
.th{width:76mm;font-size:11px;margin:0 auto}.th table td,.th table th{padding:2px 0;border:0;background:none}.c{text-align:center}.hr{border-top:1px dashed #000;margin:4px 0}@media print{.noprint{display:none}body{margin:0}}`;
function page(title, body, mode) { return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>${CSS}${mode === 'thermal' ? '@page{size:80mm auto;margin:2mm}' : '@page{size:A4;margin:12mm}'}</style></head><body>${body}</body></html>`; }
export function saleDoc(s, mode = 'thermal', lang = 'en') {
  const T = makeT(lang);
  const f = (n) => esc(fmt(n, s.currency)); const lines = s.lines.map((l) => `<tr><td>${esc(l.description)}${l.serial ? '<br><small>S/N ' + esc(l.serial) + '</small>' : ''}${l.barber_name ? '<br><small>' + esc(l.barber_name) + '</small>' : ''}</td><td class="r">${l.qty}</td><td class="r">${f(l.unit_price)}</td><td class="r">${f(l.net)}</td></tr>`).join('');
  const pays = s.payments.filter((p) => p.status === 'confirmed').map((p) => `<tr><td colspan="3">${esc(p.method_name)}${p.direction === 'out' ? ' ' + T('(refund)') : ''}</td><td class="r">${f(p.amount)}</td></tr>`).join('');
  const head = `<div class="c">${s.logo ? `<img src="${esc(s.logo)}" alt="" style="max-height:48px"><br>` : ''}<b>${esc(s.branch_name)}</b><br>${s.company ? `<small>${esc(s.company)}</small><br>` : ''}${esc(s.address || '')} ${esc(s.phone || '')}<br>${esc(s.receipt_header || '')}</div><div class="hr"></div>${T(s.kind === 'service' ? 'Visit' : 'Invoice')}: <b>${esc(s.ref)}</b><br>${T('Date')}: ${esc(s.created_at.slice(0, 16).replace('T', ' '))} UTC · ${T('Business date')} ${esc(s.business_date)}<br>${T('Customer')}: ${esc(s.customer_name || T('Walk-in'))}<br>${T('Cashier')}: ${esc(s.user_name)}${s.status === 'void' ? `<br><b>${T('*** VOID ***')}</b>` : ''}`;
  const tbl = `<table><thead><tr><th>${T('Item')}</th><th class="r">${T('Qty')}</th><th class="r">${T('Price')}</th><th class="r">${T('Total')}</th></tr></thead><tbody>${lines}</tbody><tfoot><tr><td colspan="3">${T('Subtotal')}</td><td class="r">${f(s.subtotal)}</td></tr>${s.discount ? `<tr><td colspan="3">${T('Discount')}</td><td class="r">-${f(s.discount)}</td></tr>` : ''}${s.tax ? `<tr><td colspan="3">${T('Tax')}</td><td class="r">${f(s.tax)}</td></tr>` : ''}<tr><td colspan="3"><b>${T('Total')}</b></td><td class="r"><b>${f(s.total)}</b></td></tr>${s.returned_total ? `<tr><td colspan="3">${T('Returned')}</td><td class="r">-${f(s.returned_total)}</td></tr>` : ''}${pays}<tr><td colspan="3"><b>${T('Balance due')}</b></td><td class="r"><b>${f(Math.max(0, s.total - s.returned_total - s.paid))}</b></td></tr></tfoot></table>`;
  const foot = `<div class="hr"></div><div class="c">${esc(T(s.receipt_footer) || T('Thank you'))}</div>${mode === 'a4' && s.invoice_terms ? `<p>${esc(s.invoice_terms)}</p>` : ''}${s.lines.some((l) => l.warranty_end) ? `<p>${T('Warranty until')}: ${esc(s.lines.filter((l) => l.warranty_end).map((l) => l.description + ' ' + l.warranty_end).join('; '))}</p>` : ''}`;
  return page(esc(s.ref), `<div class="${mode === 'thermal' ? 'th' : ''}">${head}${tbl}${foot}</div>`, mode);
}
export function repairDoc(j, mode = 'thermal', lang = 'en') {
  const T = makeT(lang);
  const f = (n) => esc(fmt(n, j.currency));
  const body = `<div class="${mode === 'thermal' ? 'th' : ''}"><div class="c">${j.logo ? `<img src="${esc(j.logo)}" alt="" style="max-height:48px"><br>` : ''}<b>${esc(j.branch.name)}</b><br>${j.company ? `<small>${esc(j.company)}</small><br>` : ''}${esc(j.branch.address || '')} ${esc(j.branch.phone || '')}</div><div class="hr"></div><b>${T('REPAIR INTAKE')} ${esc(j.ref)}</b><br>${T('Date')}: ${esc(j.created_at.slice(0, 16).replace('T', ' '))} UTC<br>${T('Customer')}: ${esc(j.customer_name)} ${esc(j.customer_phone || '')}<br>${T('Device')}: ${esc([j.brand, j.model].filter(Boolean).join(' '))} ${j.serial ? 'S/N ' + esc(j.serial) : ''}<br>${T('Fault')}: ${esc(j.fault)}<br>${T('Condition')}: ${esc(j.condition_notes || '-')}<br>${T('Accessories')}: ${esc(j.accessories || '-')}<br>${T('Est. price')}: ${f(j.est_price)} · ${T('Est. ready')}: ${esc(j.est_completion || '-')}<br>${T('Paid so far')}: ${f(j.totals.collected)} · ${T('Balance on charges')}: ${f(j.totals.balance)}<div class="hr"></div><small>${T('Additional charges require your approval. Please keep this slip to collect your device.')}</small></div>`;
  return page(esc(j.ref), body, mode);
}
// ---- minimal PDF writer (Helvetica, tables, optional logo). Text is WinAnsi/ASCII-safe. All strings are latin1 so byte offsets = string length. ----
const pdfStr = (s) => String(s ?? '').normalize('NFKD').replace(/[^\x20-\x7e]/g, '').replace(/[\\()]/g, '\\$&');
export function reportPdf(rep, logo) {
  const T = makeT(rep.meta._lang); const W = 842, H = 595, mx = 30, lh = 12; const cols = rep.columns; const rows = rep.rows.map((r) => cols.map((c) => cell(c, r)));
  if (rep.totals) for (const [ccy, t] of Object.entries(rep.totals)) rows.push(cols.map((c, i) => (i === 0 ? T('TOTAL') + ' ' + ccy : c.type === 'money' && t[c.key] != null ? fmt(t[c.key], ccy || 'USD') : '')));
  const w = (W - 2 * mx) / cols.length; const pages = []; let cur = null; let y = 0; const m = rep.meta;
  const lh2 = 30, lw = logo ? Math.round((logo.w * lh2) / logo.h) : 0;
  const newPage = () => {
    cur = []; pages.push(cur); y = H - 36;
    if (logo) cur.push(`q ${lw} 0 0 ${lh2} ${mx} ${H - 36 - lh2 + 6} cm /Im1 Do Q`);
    cur.push(`BT /F2 12 Tf ${mx + (logo ? lw + 8 : 0)} ${y - 8} Td (${pdfStr(m.company || '')}) Tj ET`); y -= logo ? lh2 + 4 : 20;
    cur.push(`BT /F2 13 Tf ${mx} ${y} Td (${pdfStr(m.title)}) Tj ET`); y -= 14;
    cur.push(`BT /F1 8 Tf ${mx} ${y} Td (${pdfStr(`${T('Period')} ${m.from} - ${m.to} | ${T('Branches')}: ${m.filters.branch_ids.join(', ')} | ${T('Generated')} ${m.generated_at} ${T('by')} ${m.generated_by}`).slice(0, 190)}) Tj ET`); y -= 14;
    cur.push(`BT /F2 8 Tf ${cols.map((c, i) => `1 0 0 1 ${mx + i * w} ${y} Tm (${pdfStr(c.label).slice(0, Math.floor(w / 4.2))}) Tj`).join(' ')} ET`); y -= lh;
  };
  newPage();
  for (const r of rows) { if (y < 40) newPage(); cur.push(`BT /F1 8 Tf ${cols.map((c, i) => `1 0 0 1 ${mx + i * w} ${y} Tm (${pdfStr(r[i]).slice(0, Math.floor(w / 4))}) Tj`).join(' ')} ET`); y -= lh; }
  pages.forEach((p, i) => p.push(`BT /F1 7 Tf ${W - 80} 18 Td (Page ${i + 1} of ${pages.length}) Tj ET`));
  const objs = []; const add = (o) => { objs.push(o); return objs.length; };
  add('<< /Type /Catalog /Pages 2 0 R >>'); add(''); add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'); add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  let imRef = ''; const img = (im, extra = '') => add(`<< /Type /XObject /Subtype /Image /Width ${im.w} /Height ${im.h} /ColorSpace /${im.cs} /BitsPerComponent ${im.bpc} /Filter /${im.filter} /Length ${im.data.length}${extra} >>\nstream\n${im.data.toString('latin1')}\nendstream`);
  if (logo) { const smaskId = logo.smask ? img(logo.smask) : 0; const id = img(logo, smaskId ? ` /SMask ${smaskId} 0 R` : ''); imRef = ` /XObject << /Im1 ${id} 0 R >>`; }
  const kids = pages.map((p) => { const content = p.join('\n'); const cid = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`); return add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >>${imRef} >> /Contents ${cid} 0 R >>`); });
  objs[1] = `<< /Type /Pages /Kids [${kids.map((k) => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`;
  let out = '%PDF-1.4\n'; const off = []; objs.forEach((o, i) => { off.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = out.length; out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${off.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, 'latin1');
}
export function quoteDoc(q, mode = 'a4', lang = 'en') {
  const T = makeT(lang);
  const f = (n) => esc(fmt(n, q.currency)); const lines = q.lines.map((l) => `<tr><td>${esc(l.description)}</td><td class="r">${l.qty}</td><td class="r">${f(l.unit_price)}</td><td class="r">${f(l.qty * l.unit_price - l.discount)}</td></tr>`).join('');
  const body = `<div class="${mode === 'thermal' ? 'th' : ''}"><div class="c">${q.logo ? `<img src="${esc(q.logo)}" alt="" style="max-height:48px"><br>` : ''}<b>${esc(q.branch.name)}</b><br>${q.company ? `<small>${esc(q.company)}</small><br>` : ''}${esc(q.branch.address || '')} ${esc(q.branch.phone || '')}</div><div class="hr"></div><h2>${T('QUOTATION')} ${esc(q.ref)}</h2>${T('Date')}: ${esc(q.business_date)} · ${T('Valid until')}: <b>${esc(q.valid_until)}</b><br>${T('Customer')}: ${esc(q.customer_name || '-')}<table><thead><tr><th>${T('Item')}</th><th class="r">${T('Qty')}</th><th class="r">${T('Price')}</th><th class="r">${T('Total')}</th></tr></thead><tbody>${lines}</tbody><tfoot><tr><td colspan="3">${T('Subtotal')}</td><td class="r">${f(q.subtotal)}</td></tr>${q.discount ? `<tr><td colspan="3">${T('Discount')}</td><td class="r">-${f(q.discount)}</td></tr>` : ''}${q.tax ? `<tr><td colspan="3">${T('Tax')}</td><td class="r">${f(q.tax)}</td></tr>` : ''}<tr><td colspan="3"><b>${T('Total')}</b></td><td class="r"><b>${f(q.total)}</b></td></tr></tfoot></table><div class="hr"></div><small>${T('This quotation is not an invoice. Prices and availability are confirmed at sale.')} ${esc(q.branch.invoice_terms || '')}</small></div>`;
  return page(esc(q.ref), body, mode);
}

// Shop price tags, the way malls do it: barcode (EAN-13 in-store number, or Code 128) with the digits, product, size/colour,
// price (with the old price struck through after a mark-down), brand and branch. One tag per physical piece.
// layout: tag = hang tags on A4 card (4 x 3, cut and punch), tagroll = hang-tag printer 40 x 70 mm,
//         sheet = A4 sticker sheet 3 x 8 (70 x 37 mm), roll = sticker printer 50 x 30 mm
// code: barcode (default) | both (barcode + small QR for phone cameras) | qr
// The maximum discount is deliberately NOT printed: tags are customer-facing; staff see it when they scan.
export const LABEL_LAYOUTS = ['tag', 'tagroll', 'sheet', 'roll'];
// bar height (in modules) and printed width per layout: EAN-13 at ~85-100 % of its nominal 37 mm so every scanner reads it
const BAR_H = { tag: 42, tagroll: 38, sheet: 30, roll: 26 }; const BAR_W = { tag: '38mm', tagroll: '35mm', sheet: '38mm', roll: '33mm' };
export function labelsDoc(items, { layout = 'tag', code = 'barcode', lang = 'en', company = '', branch = '', logo = null, barcode, qr } = {}) {
  const T = makeT(lang); const cells = []; if (!LABEL_LAYOUTS.includes(layout)) layout = 'tag';
  const tag = layout === 'tag' || layout === 'tagroll';
  for (const it of items) {
    const price = esc(fmt(it.price, it.currency)); const was = it.was_price && it.was_price > it.price ? esc(fmt(it.was_price, it.currency)) : null;
    const bc = code === 'qr' ? '' : `<div class="bcw">${barcode(it.code, BAR_H[layout])}</div>`; const q = code === 'qr' || code === 'both' ? `<div class="qr">${qr(it.code)}</div>` : '';
    const head = tag ? `<div class="hole"></div><div class="brand">${logo ? '<i class="logo"></i>' : `<b>${esc(company)}</b>`}</div>${branch ? `<div class="br">${esc(branch)}</div>` : ''}<div class="rule"></div>` : '';
    const priceHtml = was ? `<div class="pr"><s>${was}</s><span class="now">${price}</span></div>` : `<div class="pr">${price}</div>`;
    const text = `<div class="nm">${esc(it.name)}</div>${it.attrs ? `<div class="at">${esc(it.attrs)}</div>` : ''}${priceHtml}`;
    const body = tag
      ? `${head}${text}${code === 'qr' ? `<div class="qrbig">${q}</div>` : bc}${code === 'both' ? `<div class="qrrow">${q}<span>${esc(T('Scan with the phone'))}</span></div>` : ''}<div class="sku">${esc(it.sku)}</div>`
      : `<div class="top"><div class="txt">${text}${company ? `<div class="co">${esc(company)}</div>` : ''}</div>${code !== 'barcode' ? `<div class="qrs">${q}</div>` : ''}</div>${code === 'qr' ? `<div class="sku">${esc(it.sku)}</div>` : bc}`;
    for (let i = 0; i < it.copies; i++) cells.push(`<div class="lb ${layout}">${body}</div>`);
  }
  const css = {
    tag: '@page{size:A4;margin:6mm}.labels{display:grid;grid-template-columns:repeat(4,47mm);grid-auto-rows:70mm;gap:1.5mm;justify-content:center}.lb{border:1px dashed #bbb}',
    tagroll: '@page{size:40mm 70mm;margin:0}.lb{width:40mm;height:70mm;page-break-after:always}.lb .nm{font-size:9.5px}.pr{font-size:15px}',
    sheet: '@page{size:A4;margin:8mm}.labels{display:grid;grid-template-columns:repeat(3,1fr);grid-auto-rows:36.5mm}.lb{border:1px dashed #ccc;padding:1.5mm 3mm}',
    roll: '@page{size:50mm 30mm;margin:0}.lb{width:50mm;height:30mm;page-break-after:always;padding:1mm 2mm}',
  }[layout];
  const sticker = !tag;
  const base = `body{margin:0;font:10px/1.2 "Helvetica Neue",Arial,sans-serif;color:#000;background:#fff}.lb{box-sizing:border-box;overflow:hidden;display:flex;flex-direction:column;align-items:center;text-align:center;padding:2.5mm 2.5mm 2mm;break-inside:avoid;position:relative;background:#fff}
.hole{width:4.5mm;height:4.5mm;border:1px solid #999;border-radius:50%;margin:0 auto 1.5mm}.brand .logo{display:block;width:30mm;height:9mm;background:center/contain no-repeat}.brand b{font-size:12px;letter-spacing:.06em;text-transform:uppercase}.br{font-size:8px;letter-spacing:.18em;text-transform:uppercase;color:#333;margin-top:.5mm}
.rule{width:70%;border-top:1px solid #000;margin:1.8mm 0}.nm{font-weight:700;font-size:${sticker ? '9.5px' : '11px'};max-height:2.5em;overflow:hidden;line-height:1.2}.at{font-size:${sticker ? '8.5px' : '10px'};margin-top:.6mm;letter-spacing:.03em}
.pr{font-weight:800;font-size:${sticker ? '13px' : '18px'};margin:${sticker ? '.6mm 0' : '2mm 0 1.5mm'};font-variant-numeric:tabular-nums}.pr s{display:block;font-size:.55em;font-weight:500;color:#555}.pr .now{color:#c00}
.bcw{width:100%;line-height:0}.lb.tag .bcw,.lb.tagroll .bcw,.lb.tag .qrbig,.lb.tagroll .qrbig{margin-top:auto}.bcw svg{width:100%;height:${sticker ? '11mm' : '16mm'}}.sku{font:7.5px Consolas,monospace;color:#333;margin-top:.6mm}.co{font-size:6.5px;color:#555;letter-spacing:.08em;text-transform:uppercase}
.top{display:flex;align-items:center;gap:2mm;width:100%;text-align:left;flex:1;min-height:0}.top .txt{flex:1;min-width:0}.qrs svg{width:${sticker ? (layout === 'roll' ? '13mm' : '15mm') : '0'};height:auto;display:block}
.qrrow{display:flex;align-items:center;gap:1.5mm;margin-top:1mm;font-size:6.5px;color:#444}.qrrow svg{width:11mm;height:11mm}.qrbig svg{width:${sticker ? '17mm' : '26mm'};height:${sticker ? '17mm' : '26mm'}}
@media screen{.lb.roll,.lb.tagroll{outline:1px dashed #bbb;margin:0 auto 3mm}}@media print{.noprint{display:none}.lb{border-color:transparent!important}}`;
  const bar = `<div class="noprint" style="padding:8px 10px;background:#eef3ff;margin-bottom:8px;font:13px system-ui">${cells.length} ${esc(T('labels'))}</div>`;
  const logoCss = logo ? `.brand .logo{background-image:url("${String(logo).replace(/"/g, '')}")}` : ''; // the logo is embedded once, not once per tag
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(T('Price tags'))}</title><style>${base}${css}${logoCss}</style></head><body>${bar}<div class="labels">${cells.join('') || `<p>${esc(T('No data yet'))}</p>`}</div></body></html>`;
}
