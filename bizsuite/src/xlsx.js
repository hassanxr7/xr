// Minimal .xlsx writer (single sheet, stored ZIP, inline strings). Money cells are written from integer minor units
// as exact decimal text, so no floating-point rounding is introduced by the export.
import zlib from 'node:zlib';
import { exp } from './money.js';
const x = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
const col = (i) => { let s = ''; for (i++; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s; return s; };
function zip(files) {
  const parts = [], central = []; let off = 0;
  for (const [name, data] of files) {
    const nb = Buffer.from(name), crc = zlib.crc32(data); const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt16LE(0x0800, 6); h.writeUInt32LE(crc, 14); h.writeUInt32LE(data.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(nb.length, 26);
    parts.push(h, nb, data); const c = Buffer.alloc(46); c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(0x0800, 8); c.writeUInt32LE(crc, 16); c.writeUInt32LE(data.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(nb.length, 28); c.writeUInt32LE(off, 42); central.push(c, nb);
    off += 30 + nb.length + data.length;
  }
  const cd = Buffer.concat(central); const e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(files.length, 8); e.writeUInt16LE(files.length, 10); e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, e]);
}
export function sheetXlsx(rep) {
  const m = rep.meta; const rows = []; const T = (v) => ({ t: 's', v }); 
  rows.push([T(m.title)], [T('Period'), T(`${m.from} to ${m.to}`)], [T('Branches'), T((m.filters.branch_ids || []).join('; '))], [T('Generated'), T(`${m.generated_at} by ${m.generated_by}`)], [T(m.reporting)], []);
  rows.push(rep.columns.map((c) => ({ t: 's', v: c.label, s: 1 })));
  const money = (v, ccy) => { const e = exp(ccy || 'USD'); const neg = v < 0; const s = String(Math.abs(v)).padStart(e + 1, '0'); return (neg ? '-' : '') + (e ? `${s.slice(0, -e)}.${s.slice(-e)}` : s); };
  for (const r of rep.rows) rows.push(rep.columns.map((c) => { const v = r[c.key]; if (v == null || v === '') return null; if (c.type === 'money') return { t: 'n', v: money(v, r.currency), s: 2 }; return typeof v === 'number' ? { t: 'n', v: String(v) } : { t: 's', v }; }));
  if (rep.totals) for (const [ccy, t] of Object.entries(rep.totals)) rows.push(rep.columns.map((c, i) => (i === 0 ? { t: 's', v: `TOTAL ${ccy}`, s: 1 } : c.type === 'money' && t[c.key] != null ? { t: 'n', v: money(t[c.key], ccy), s: 2 } : null)));
  const sd = rows.map((r, ri) => `<row r="${ri + 1}">${r.map((c, ci) => (c == null ? '' : c.t === 'n' ? `<c r="${col(ci)}${ri + 1}"${c.s ? ` s="${c.s}"` : ''}><v>${c.v}</v></c>` : `<c r="${col(ci)}${ri + 1}" t="inlineStr"${c.s ? ` s="${c.s}"` : ''}><is><t xml:space="preserve">${x(c.v)}</t></is></c>`)).join('')}</row>`).join('');
  const files = [
    ['[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
    ['_rels/.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
    ['xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Report" sheetId="1" r:id="rId1"/></sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
    ['xl/styles.xml', '<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs></styleSheet>'],
    ['xl/worksheets/sheet1.xml', `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sd}</sheetData></worksheet>`],
  ].map(([n, d]) => [n, Buffer.from(d)]);
  return zip(files);
}
