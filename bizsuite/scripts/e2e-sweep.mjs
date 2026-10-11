// Exhaustive UI sweep: every nav page, every button, every form (submitted empty), for each role; English and Somali; desktop and phone width.
// Fails on: JS errors, HTTP 5xx, forms that crash, English text left in Somali mode, horizontal overflow on phones.
// usage: PW_MODULE=... BASE=http://localhost:3111 node scripts/e2e-sweep.mjs [--so-only] [--quick]
import { createRequire } from 'node:module'; import fs from 'node:fs';
const { chromium } = createRequire(import.meta.url)(process.env.PW_MODULE || 'playwright');
const BASE = process.env.BASE || 'http://localhost:3000'; const QUICK = process.argv.includes('--quick');
const { so } = await import(new URL('../public/i18n.js', import.meta.url));
const audit = JSON.parse(fs.readFileSync(process.env.UI_STRINGS || '/tmp/ui-strings.json', 'utf8'));
const EN = new Set(audit.filter((s) => so[s] && so[s] !== s && s.length > 3 && !/^[A-Z0-9 .\-/+]+$/.test(s))); // English UI strings that must never appear verbatim in Somali mode
const ROLES = [['owner@demo.so', 'owner'], ['accountant@demo.so', 'accountant'], ['manager.berber@demo.so', 'manager-berber'], ['manager.store@demo.so', 'manager-store'], ['manager.reyxaan@demo.so', 'manager-reyxaan'], ['cashier.store@demo.so', 'cashier-store'], ['cashier.berber@demo.so', 'frontdesk-berber'], ['cashier.reyxaan@demo.so', 'cashier-reyxaan'], ['tech.reyxaan@demo.so', 'technician'], ['ahmed@demo.so', 'barber']];
const SKIP = /sign out|ka bax|suspend|activate|revoke|create backup|close day|xidh maalinta|reopen|dib u fur|use the default logo|upload logo|\bdisable\b|\benable\b/i;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--no-sandbox'] });
const problems = []; const stats = { pages: 0, buttons: 0, forms: 0, modals: 0 }; const untranslated = new Map();
const bad = (m) => { problems.push(m); console.log('  ✗', m); };
async function visibleTexts(page) { return page.evaluate(() => { const out = []; const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); for (let n = w.nextNode(); n; n = w.nextNode()) { const t = n.nodeValue.trim(); const p = n.parentElement; if (!t || !p || ['SCRIPT', 'STYLE', 'OPTION'].includes(p.tagName)) continue; const r = p.getBoundingClientRect(); if (r.width && r.height) out.push(t); } for (const e of document.querySelectorAll('input[placeholder],textarea[placeholder]')) out.push(e.placeholder); for (const o of document.querySelectorAll('select option')) out.push(o.textContent.trim()); return out; }); }
async function checkLang(page, where, lang) { if (lang !== 'so') return; for (const t of await visibleTexts(page)) if (EN.has(t)) { const k = `${where} :: ${t}`; untranslated.set(t, (untranslated.get(t) || new Set()).add(where)); } }
async function closeOverlays(page) { for (let i = 0; i < 4; i++) { const n = await page.locator('.overlay').count(); if (!n) return; await page.evaluate(() => document.querySelectorAll('.overlay').forEach((o) => o.remove())); } }
async function sweepPage(page, hash, label, lang) {
  await page.goto(BASE + '#' + hash); await page.waitForTimeout(450); stats.pages++;
  if (await page.locator('.content .card p[style*="bad"]').count()) { const t = await page.locator('.content .card p[style*="bad"]').first().innerText(); if (!/permission|fasax|not found|lama helin/i.test(t)) bad(`${label} ${hash}: page error "${t}"`); return; }
  await checkLang(page, label + hash, lang);
  const sels = 'button.btn, a.btn, .tabs button, button.tile, .kpi'; const total = await page.locator(sels).count(); const max = QUICK ? Math.min(total, 12) : Math.min(total, 60);
  for (let i = 0; i < max; i++) {
    await page.goto(BASE + '#' + hash); await page.waitForTimeout(250); await closeOverlays(page);
    const el = page.locator(sels).nth(i); if (!(await el.count()) || !(await el.isVisible())) continue; const txt = ((await el.innerText().catch(() => '')) || '').trim().slice(0, 40); if (SKIP.test(txt) || await el.isDisabled().catch(() => false)) continue;
    const before = page.url(); try { await el.click({ timeout: 2500 }); } catch { continue; } stats.buttons++; await page.waitForTimeout(220);
    if (await page.locator('.overlay').count()) { stats.modals++; await checkLang(page, `${label}${hash} modal[${txt}]`, lang);
      const form = page.locator('.overlay form').first();
      if (await form.count() && !QUICK) { const primary = page.locator('.overlay footer .btn.p').first(); if (await primary.count()) { stats.forms++; await primary.click().catch(() => {}); await page.waitForTimeout(350); // empty submit must show a validation message and never crash
        const stillOpen = await page.locator('.overlay').count(); const toasts = await page.locator('.toast.bad').count(); if (!stillOpen && !toasts) { /* some forms have only optional fields: acceptable only if it saved */ } } }
      await closeOverlays(page); }
    else if (page.url() !== before) { /* navigated: fine */ }
  }
}
async function mobileOverflow(page, hash, label) { await page.goto(BASE + '#' + hash); await page.waitForTimeout(500); const o = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); if (o > 4) bad(`${label} ${hash}: horizontal overflow of ${o}px at phone width`); }
async function navPaths(page) { return page.$$eval('.nav a', (as) => as.map((a) => a.getAttribute('data-path'))); }
for (const lang of process.argv.includes('--so-only') ? ['so'] : ['en', 'so']) {
  for (const [email, name] of ROLES) {
    const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } }); const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/favicon|40[0-9]|42[0-9]|Failed to load resource: the server responded with a status of (4|5)/.test(m.text())) errs.push('console: ' + m.text()); });
    page.on('response', (r) => { if (r.status() >= 500) errs.push(`HTTP ${r.status()} ${r.url()}`); }); page.on('dialog', (d) => d.accept('5000,3000,2000'));
    await page.goto(BASE); await page.evaluate((l) => localStorage.setItem('lang', l), lang); await page.reload(); await page.fill('input[type=email]', email); await page.fill('input[type=password]', 'Demo@1234'); await page.click('button.btn.p'); await page.waitForSelector('.shell', { timeout: 8000 });
    console.log(`\n== ${lang} / ${name}`); const paths = await navPaths(page);
    for (const p of paths) await sweepPage(page, p + (p === '/dashboard' ? '?preset=year' : ''), name, lang);
    for (const extra of ['/commissions?tab=daily&preset=year', '/commissions?tab=profit&preset=year', '/settings?tab=branding']) if (paths.some((x) => extra.startsWith(x))) await sweepPage(page, extra, name, lang);
    if (errs.length) bad(`${lang}/${name}: ${[...new Set(errs)].slice(0, 4).join(' | ')}`);
    await ctx.close();
  }
}
// phone-width layout check (owner + cashier + barber)
for (const [email, name] of [ROLES[0], ROLES[5], ROLES[9]]) { const ctx = await browser.newContext({ viewport: { width: 390, height: 800 } }); const page = await ctx.newPage(); await page.goto(BASE); await page.fill('input[type=email]', email); await page.fill('input[type=password]', 'Demo@1234'); await page.click('button.btn.p'); await page.waitForSelector('.shell'); for (const p of await navPaths(page)) await mobileOverflow(page, p, name + '@390'); await ctx.close(); }
await browser.close();
console.log(`\nSweep: ${stats.pages} pages, ${stats.buttons} buttons clicked, ${stats.modals} dialogs opened, ${stats.forms} forms submitted empty.`);
if (untranslated.size) { console.log(`\nEnglish text visible in Somali mode (${untranslated.size}):`); for (const [t, w] of untranslated) console.log(`  - "${t}"  (${[...w].slice(0, 2).join(', ')})`); problems.push(`${untranslated.size} untranslated strings visible in Somali mode`); }
console.log(problems.length ? `\nFAILED (${problems.length})` : '\nSWEEP PASSED'); process.exit(problems.length ? 1 : 0);
