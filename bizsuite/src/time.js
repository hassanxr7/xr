// Branch-local business dates (default Africa/Mogadishu, UTC+3, no DST).
let fixed = null; // test/seed clock override only
export const setNow = (iso) => { fixed = iso; };
export const nowIso = () => fixed || new Date().toISOString();
export function localDate(iso, tz = 'Africa/Mogadishu') {
  const d = new Date(iso);
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}
export const addDays = (ymd, n) => { const d = new Date(ymd + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export function range(preset, from, to, today) {
  const t = today; const dow = (new Date(t + 'T00:00:00Z').getUTCDay() + 6) % 7; // Monday=0
  switch (preset) {
    case 'today': return [t, t];
    case 'yesterday': return [addDays(t, -1), addDays(t, -1)];
    case 'week': return [addDays(t, -dow), t];
    case 'month': return [t.slice(0, 8) + '01', t];
    case 'year': return [t.slice(0, 5) + '01-01', t];
    default: return [from || '0000-01-01', to || '9999-12-31'];
  }
}
