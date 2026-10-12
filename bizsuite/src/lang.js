// Server-side translation for printed documents and exports (language chosen by the user: ?lang=so). English is the source text.
import { so } from '../public/i18n.js';
export const makeT = (lang) => (s) => {
  if (lang !== 'so' || s == null) return s; s = String(s); if (so[s]) return so[s];
  const p = 'Less: expense - '; if (s.startsWith(p)) return (so[p] || p) + s.slice(p.length); return s;
};
export function translateReport(rep, lang) {
  if (lang !== 'so') return rep; const T = makeT(lang); const m = rep.meta;
  return { ...rep, columns: rep.columns.map((c) => ({ ...c, label: T(c.label) })), rows: rep.rows.map((r) => (r.item != null ? { ...r, item: T(r.item) } : r)), meta: { ...m, title: T(m.title), reporting: T(m.reporting), _lang: lang } };
}

// Notification texts are generated in English and stored; render Somali by pattern when the user asks for it.
const NP = [
  [/^(.*) is out of stock \((\d+)\) at (.*)$/, (m) => `${m[1]} way dhammaatay (${m[2]}) ${m[3]}`], [/^(.*) is low on stock \((\d+)\) at (.*)$/, (m) => `${m[1]} kayd yar ayuu leeyahay (${m[2]}) ${m[3]}`],
  [/^Cash difference (-?\d+) at (.*) \(session (\d+)\)$/, (m) => `Farqi lacag ah ${m[1]} ${m[2]} (fadhi ${m[3]})`], [/^Reconciliation difference (-?\d+) on (.*) at (.*)$/, (m) => `Farqi isu dheelli tir ${m[1]} ${m[2]} ${m[3]}`],
  [/^Approval needed: (.*)$/, (m) => `Ogolaansho ayaa loo baahan yahay: ${m[1]}`], [/^Request approved: (.*)$/, (m) => `Codsiga waa la ogolaaday: ${m[1]}`], [/^Request rejected: (.*)$/, (m) => `Codsiga waa la diiday: ${m[1]}`],
  [/^Repair assigned to you$/, () => 'Hagaajin ayaa lagu siiyey'], [/^Repair (\S+) needs customer approval for additional charges$/, (m) => `Hagaajinta ${m[1]} waxay u baahan tahay ogolaanshaha macmiilka ee kharashyo dheeraad ah`], [/^Repair (\S+) is completed$/, (m) => `Hagaajinta ${m[1]} waa dhammaatay`], [/^Repair (\S+) is overdue$/, (m) => `Hagaajinta ${m[1]} waa dib u dhacday`],
  [/^Order (\S+) from (.*) is waiting for payment at (.*)$/, (m) => `Dalabka ${m[1]} ee ${m[2]} wuxuu sugayaa lacag bixin ${m[3]}`],
  [/^Invoice (\S+) has an outstanding balance older than 7 days$/, (m) => `Faktuurka ${m[1]} wuxuu leeyahay hadhaag ka weyn 7 maalmood`], [/^Business day (\S+) reopened at (.*): (.*)$/, (m) => `Maalinta ${m[1]} dib ayaa loo furay ${m[2]}: ${m[3]}`],
];
export function translateNotification(msg, lang) { if (lang !== 'so') return msg; for (const [re, f] of NP) { const m = re.exec(msg); if (m) return f(m); } return msg; }
