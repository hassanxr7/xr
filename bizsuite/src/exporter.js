import { fmt, exp } from './money.js';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export { esc };
const cell = (c, row, plain) => {
  const v = row[c.key]; if (v == null) return '';
  if (c.type === 'money') { const ccy = row.currency || 'USD'; return plain ? (v / 10 ** exp(ccy)).toFixed(exp(ccy)) : fmt(v, ccy); }
  return String(v);
};
export function reportCsv(rep) {
  const q = (s) => { s = String(s ?? ''); return /[",\n\r]/.test(s) || /^[=+\-@]/.test(s) ? `"${(/^[=+\-@]/.test(s) ? "'" : '') + s.replace(/"/g, '""')}"` : s; }; // neutralise spreadsheet formulas
  const m = rep.meta; const out = [[m.title], ['Period', `${m.from} to ${m.to}`], ['Branches', m.filters.branch_ids.join('; ')], ['Generated', `${m.generated_at} by ${m.generated_by}`], ['Note', m.reporting], []];
  out.push(rep.columns.map((c) => c.label));
  for (const r of rep.rows) out.push(rep.columns.map((c) => cell(c, r, true)));
  if (rep.totals) for (const [ccy, t] of Object.entries(rep.totals)) out.push(rep.columns.map((c, i) => (i === 0 ? `TOTAL ${ccy}` : c.type === 'money' && t[c.key] != null ? (t[c.key] / 10 ** exp(ccy || 'USD')).toFixed(exp(ccy || 'USD')) : '')));
  return '﻿' + out.map((r) => r.map(q).join(',')).join('\r\n');
}
export function reportHtml(rep, { title } = {}) {
  const m = rep.meta; const head = rep.columns.map((c) => `<th class="${c.type === 'money' ? 'r' : ''}">${esc(c.label)}</th>`).join('');
  const body = rep.rows.map((r) => `<tr>${rep.columns.map((c) => `<td class="${c.type === 'money' ? 'r' : ''}">${esc(cell(c, r))}</td>`).join('')}</tr>`).join('');
  const tot = rep.totals ? Object.entries(rep.totals).map(([ccy, t]) => `<tr class="tot">${rep.columns.map((c, i) => `<td class="${c.type === 'money' ? 'r' : ''}">${i === 0 ? 'TOTAL ' + esc(ccy) : c.type === 'money' && t[c.key] != null ? esc(fmt(t[c.key], ccy || 'USD')) : ''}</td>`).join('')}</tr>`).join('') : '';
  return page(esc(title || m.title), `<h2>${esc(m.title)}</h2><p class="meta">Period: ${m.from} – ${m.to} · Branches: ${esc(m.filters.branch_ids.join(', '))}<br>Generated ${esc(m.generated_at)} by ${esc(m.generated_by)} · ${esc(m.reporting)}</p><table><thead><tr>${head}</tr></thead><tbody>${body}${tot}</tbody></table>`, 'a4');
}
const CSS = `body{font:12px/1.4 system-ui,Arial,sans-serif;color:#111;margin:16px}h2{margin:0 0 4px}table{border-collapse:collapse;width:100%}th,td{border-bottom:1px solid #ccc;padding:4px 6px;text-align:left}th{background:#f2f2f2}.r{text-align:right}.tot td{font-weight:700;border-top:2px solid #000}.meta{color:#555}
.th{width:76mm;font-size:11px;margin:0 auto}.th table td,.th table th{padding:2px 0;border:0;background:none}.c{text-align:center}.hr{border-top:1px dashed #000;margin:4px 0}@media print{.noprint{display:none}body{margin:0}}`;
function page(title, body, mode) { return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title><style>${CSS}${mode === 'thermal' ? '@page{size:80mm auto;margin:2mm}' : '@page{size:A4;margin:12mm}'}</style></head><body>${body}</body></html>`; }
export function saleDoc(s, mode = 'thermal') {
  const f = (n) => esc(fmt(n, s.currency)); const lines = s.lines.map((l) => `<tr><td>${esc(l.description)}${l.serial ? '<br><small>S/N ' + esc(l.serial) + '</small>' : ''}${l.barber_name ? '<br><small>' + esc(l.barber_name) + '</small>' : ''}</td><td class="r">${l.qty}</td><td class="r">${f(l.unit_price)}</td><td class="r">${f(l.net)}</td></tr>`).join('');
  const pays = s.payments.filter((p) => p.status === 'confirmed').map((p) => `<tr><td colspan="3">${esc(p.method_name)}${p.direction === 'out' ? ' (refund)' : ''}</td><td class="r">${f(p.amount)}</td></tr>`).join('');
  const head = `<div class="c">${s.logo ? `<img src="${esc(s.logo)}" alt="" style="max-height:48px"><br>` : ''}<b>${esc(s.branch_name)}</b><br>${esc(s.address || '')} ${esc(s.phone || '')}<br>${esc(s.receipt_header || '')}</div><div class="hr"></div>${s.kind === 'service' ? 'Visit' : 'Invoice'}: <b>${esc(s.ref)}</b><br>Date: ${esc(s.created_at.slice(0, 16).replace('T', ' '))} UTC · Business date ${esc(s.business_date)}<br>Customer: ${esc(s.customer_name || 'Walk-in')}<br>Cashier: ${esc(s.user_name)}${s.status === 'void' ? '<br><b>*** VOID ***</b>' : ''}`;
  const tbl = `<table><thead><tr><th>Item</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Total</th></tr></thead><tbody>${lines}</tbody><tfoot><tr><td colspan="3">Subtotal</td><td class="r">${f(s.subtotal)}</td></tr>${s.discount ? `<tr><td colspan="3">Discount</td><td class="r">-${f(s.discount)}</td></tr>` : ''}${s.tax ? `<tr><td colspan="3">Tax</td><td class="r">${f(s.tax)}</td></tr>` : ''}<tr><td colspan="3"><b>Total</b></td><td class="r"><b>${f(s.total)}</b></td></tr>${s.returned_total ? `<tr><td colspan="3">Returned</td><td class="r">-${f(s.returned_total)}</td></tr>` : ''}${pays}<tr><td colspan="3"><b>Balance due</b></td><td class="r"><b>${f(Math.max(0, s.total - s.returned_total - s.paid))}</b></td></tr></tfoot></table>`;
  const foot = `<div class="hr"></div><div class="c">${esc(s.receipt_footer || 'Thank you')}</div>${mode === 'a4' && s.invoice_terms ? `<p>${esc(s.invoice_terms)}</p>` : ''}${s.lines.some((l) => l.warranty_end) ? `<p>Warranty until: ${esc(s.lines.filter((l) => l.warranty_end).map((l) => l.description + ' ' + l.warranty_end).join('; '))}</p>` : ''}`;
  return page(esc(s.ref), `<div class="${mode === 'thermal' ? 'th' : ''}">${head}${tbl}${foot}</div>`, mode);
}
export function repairDoc(j, mode = 'thermal') {
  const f = (n) => esc(fmt(n, j.currency));
  const body = `<div class="${mode === 'thermal' ? 'th' : ''}"><div class="c"><b>${esc(j.branch.name)}</b><br>${esc(j.branch.address || '')} ${esc(j.branch.phone || '')}</div><div class="hr"></div><b>REPAIR INTAKE ${esc(j.ref)}</b><br>Date: ${esc(j.created_at.slice(0, 16).replace('T', ' '))} UTC<br>Customer: ${esc(j.customer_name)} ${esc(j.customer_phone || '')}<br>Device: ${esc([j.brand, j.model].filter(Boolean).join(' '))} ${j.serial ? 'S/N ' + esc(j.serial) : ''}<br>Fault: ${esc(j.fault)}<br>Condition: ${esc(j.condition_notes || '-')}<br>Accessories: ${esc(j.accessories || '-')}<br>Est. price: ${f(j.est_price)} · Est. ready: ${esc(j.est_completion || '-')}<br>Paid so far: ${f(j.totals.collected)} · Balance on charges: ${f(j.totals.balance)}<div class="hr"></div><small>Additional charges require your approval. Please keep this slip to collect your device.</small></div>`;
  return page(esc(j.ref), body, mode);
}
// ---- minimal PDF writer (Helvetica, tables). Enough for reports; text is WinAnsi/ASCII-safe. ----
const pdfStr = (s) => String(s ?? '').normalize('NFKD').replace(/[^\x20-\x7e]/g, '').replace(/[\\()]/g, '\\$&');
export function reportPdf(rep) {
  const W = 842, H = 595, mx = 30, lh = 12; const cols = rep.columns; const rows = rep.rows.map((r) => cols.map((c) => cell(c, r)));
  if (rep.totals) for (const [ccy, t] of Object.entries(rep.totals)) rows.push(cols.map((c, i) => (i === 0 ? 'TOTAL ' + ccy : c.type === 'money' && t[c.key] != null ? fmt(t[c.key], ccy || 'USD') : '')));
  const w = (W - 2 * mx) / cols.length; const pages = []; let cur = null; let y = 0;
  const newPage = () => { cur = []; pages.push(cur); y = H - 40; const m = rep.meta; cur.push(`BT /F2 13 Tf ${mx} ${y} Td (${pdfStr(m.title)}) Tj ET`); y -= 14; cur.push(`BT /F1 8 Tf ${mx} ${y} Td (${pdfStr(`Period ${m.from} to ${m.to} | Branches: ${m.filters.branch_ids.join(', ')} | Generated ${m.generated_at} by ${m.generated_by}`).slice(0, 190)}) Tj ET`); y -= 14; cur.push(`BT /F2 8 Tf ${cols.map((c, i) => `1 0 0 1 ${mx + i * w} ${y} Tm (${pdfStr(c.label).slice(0, Math.floor(w / 4.2))}) Tj`).join(' ')} ET`); y -= lh; };
  newPage();
  for (const r of rows) { if (y < 40) newPage(); cur.push(`BT /F1 8 Tf ${cols.map((c, i) => `1 0 0 1 ${mx + i * w} ${y} Tm (${pdfStr(r[i]).slice(0, Math.floor(w / 4))}) Tj`).join(' ')} ET`); y -= lh; }
  pages.forEach((p, i) => p.push(`BT /F1 7 Tf ${W - 80} 18 Td (Page ${i + 1} of ${pages.length}) Tj ET`));
  const objs = []; const add = (s) => { objs.push(s); return objs.length; };
  add('<< /Type /Catalog /Pages 2 0 R >>'); add(''); add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'); add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const kids = pages.map((p) => { const content = p.join('\n'); const cid = add(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`); return add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${cid} 0 R >>`); });
  objs[1] = `<< /Type /Pages /Kids [${kids.map((k) => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`;
  let out = '%PDF-1.4\n'; const off = []; objs.forEach((o, i) => { off.push(Buffer.byteLength(out)); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
  const xref = Buffer.byteLength(out); out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${off.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, 'latin1');
}

export function quoteDoc(q, mode = 'a4') {
  const f = (n) => esc(fmt(n, q.currency)); const lines = q.lines.map((l) => `<tr><td>${esc(l.description)}</td><td class="r">${l.qty}</td><td class="r">${f(l.unit_price)}</td><td class="r">${f(l.qty * l.unit_price - l.discount)}</td></tr>`).join('');
  const body = `<div class="${mode === 'thermal' ? 'th' : ''}"><div class="c"><b>${esc(q.branch.name)}</b><br>${esc(q.branch.address || '')} ${esc(q.branch.phone || '')}</div><div class="hr"></div><h2>QUOTATION ${esc(q.ref)}</h2>Date: ${esc(q.business_date)} · Valid until: <b>${esc(q.valid_until)}</b><br>Customer: ${esc(q.customer_name || '-')}<table><thead><tr><th>Item</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Total</th></tr></thead><tbody>${lines}</tbody><tfoot><tr><td colspan="3">Subtotal</td><td class="r">${f(q.subtotal)}</td></tr>${q.discount ? `<tr><td colspan="3">Discount</td><td class="r">-${f(q.discount)}</td></tr>` : ''}${q.tax ? `<tr><td colspan="3">Tax</td><td class="r">${f(q.tax)}</td></tr>` : ''}<tr><td colspan="3"><b>Total</b></td><td class="r"><b>${f(q.total)}</b></td></tr></tfoot></table><div class="hr"></div><small>This quotation is not an invoice. Prices and availability are confirmed at sale. ${esc(q.branch.invoice_terms || '')}</small></div>`;
  return page(esc(q.ref), body, mode);
}
