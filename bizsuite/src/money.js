// Decimal-safe money: all amounts are integers in minor units; rates are basis points (1% = 100).
// Rounding rule: half away from zero, applied once per computed amount.
import { bad } from './errors.js';
export const EXP = { USD: 2, EUR: 2, GBP: 2, KES: 2, ETB: 2, AED: 2, SOS: 0, SLSH: 0, DJF: 0 };
export const exp = (c) => (c in EXP ? EXP[c] : 2);
export function int(v, field = 'amount', { min = -Infinity, max = Infinity } = {}) {
  if (typeof v === 'string' && /^-?\d+$/.test(v)) v = Number(v);
  if (!Number.isSafeInteger(v)) throw bad('invalid_integer', `${field} must be a whole number of minor units`, { field });
  if (v < min || v > max) throw bad('out_of_range', `${field} out of range`, { field });
  return v;
}
export function divRound(num, den) { // round half away from zero
  if (den === 0) throw bad('division_by_zero');
  const s = (num < 0) !== (den < 0) ? -1 : 1; const n = Math.abs(num), d = Math.abs(den);
  return s * Math.floor((2 * n + d) / (2 * d));
}
export const mulBp = (amount, bp) => divRound(amount * bp, 10000);
export const mulDiv = (a, b, c) => divRound(a * b, c);
// Split `total` across weights, remainder to the last non-zero weight; sum(parts) === total.
export function allocate(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum === 0) { const out = weights.map(() => 0); if (out.length) out[out.length - 1] = total; return out; }
  let rem = total; const out = weights.map((w) => { const p = Math.floor((total * w) / sum); rem -= p; return p; });
  for (let i = out.length - 1; i >= 0 && rem > 0; i--) if (weights[i] > 0) { out[i] += rem; rem = 0; }
  return out;
}
export function fmt(amount, ccy = 'USD') {
  const e = exp(ccy); const neg = amount < 0; const a = Math.abs(amount);
  const s = String(a).padStart(e + 1, '0'); const whole = s.slice(0, s.length - e).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${neg ? '-' : ''}${whole}${e ? '.' + s.slice(-e) : ''} ${ccy}`;
}
export function parseMoney(str, ccy = 'USD') {
  const e = exp(ccy); const m = /^(-?)(\d*)(?:\.(\d*))?$/.exec(String(str).trim());
  if (!m || (m[2] === '' && !m[3])) throw bad('invalid_amount', 'Invalid amount');
  const frac = (m[3] || '').padEnd(e, '0');
  if (frac.length > e) throw bad('too_many_decimals', 'Too many decimal places');
  return (m[1] ? -1 : 1) * Number((m[2] || '0') + frac);
}
