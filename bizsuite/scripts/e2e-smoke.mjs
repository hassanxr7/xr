// Browser smoke test: logs in as each demo role, opens every page the role can see, and exercises key workflows.
// usage: PW_MODULE=/path/to/playwright BASE=http://localhost:3111 node scripts/e2e-smoke.mjs
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)(process.env.PW_MODULE || 'playwright');
const BASE = process.env.BASE || 'http://localhost:3000'; const PW = 'Demo@1234'; const SHOTS = process.env.SHOTS || '';
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined, args: ['--no-sandbox'] });
const problems = []; let checks = 0;
const ok = (c, msg) => { checks++; if (!c) { problems.push(msg); console.log('  ✗', msg); } else console.log('  ✓', msg); };
async function session(email, fn, viewport = { width: 1360, height: 900 }) {
  const ctx = await browser.newContext({ viewport }); const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', (e) => errs.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/favicon|401|403|404|409|402|422|429/.test(m.text())) errs.push('console: ' + m.text()); });
  page.on('dialog', (d) => d.accept('50,30,20'));
  await page.goto(BASE); await page.fill('input[type=email]', email); await page.fill('input[type=password]', PW); await page.click('button.btn.p'); await page.waitForSelector('.shell, .main', { timeout: 8000 });
  console.log('\n== ' + email); await fn(page); ok(errs.length === 0, `${email}: no JS errors${errs.length ? ' -> ' + errs.slice(0, 3).join(' | ') : ''}`); await ctx.close();
}
const visit = async (page, hash, expectSel = '.card') => { await page.goto(BASE + '#' + hash); await page.waitForTimeout(500); await page.waitForSelector(expectSel, { timeout: 8000 }); const err = await page.$('.card p[style*="bad"]'); ok(!err, `page ${hash} renders`); };
const modalClose = async (page) => { const c = await page.$('.overlay [aria-label="Close"]'); if (c) await c.click(); };

await session('owner@demo.so', async (page) => {
  for (const h of ['/dashboard', '/sales', '/repairs', '/inventory', '/transfers', '/purchases', '/devices', '/customers', '/suppliers', '/expenses', '/registers', '/payments', '/commissions', '/reports/consolidated', '/reports/profit', '/reports/barber_commissions', '/reports/inventory_valuation', '/approvals', '/staff', '/roles', '/organisation', '/settings', '/audit', '/visits', '/pos', '/quotes']) await visit(page, h);
  await visit(page, '/dashboard?preset=year');
  ok(await page.locator('.kpi').count() > 10, 'dashboard shows KPI tiles'); ok(await page.locator('svg.chart').count() > 0, 'dashboard has trend chart');
  ok((await page.locator('text=KES').count()) > 0 && (await page.locator('text=USD').count()) > 0, 'separate USD and KES totals shown');
  if (SHOTS) await page.screenshot({ path: SHOTS + '/dashboard.png', fullPage: true });
  await page.click('.kpi >> nth=0'); await page.waitForTimeout(600); ok(page.url().includes('/sales'), 'KPI drills down to the sales list'); ok(await page.locator('tbody tr').count() > 0, 'drill-down lists transactions');
  // open a sale detail + print preview
  await page.locator('tbody tr').first().click(); await page.waitForSelector('.modal'); ok(await page.locator('.modal table').count() > 0, 'sale detail opens'); await page.click('text=Thermal receipt'); await page.waitForSelector('iframe'); ok(true, 'thermal receipt preview opens'); await page.keyboard.press('Escape');
  await page.evaluate(() => document.querySelectorAll('.overlay').forEach((o) => o.remove()));
  // report export download
  await visit(page, '/reports/consolidated?preset=year'); const [dl] = await Promise.all([page.waitForEvent('download'), page.click('text=Export CSV')]); ok(dl.suggestedFilename().endsWith('.csv'), 'CSV export downloads');
  const [dl2] = await Promise.all([page.waitForEvent('download'), page.click('text=Export PDF')]); ok(dl2.suggestedFilename().endsWith('.pdf'), 'PDF export downloads');
  // language + theme
  await page.selectOption('.top select', 'so'); await page.waitForTimeout(300); ok(await page.locator('text=Dashboard-ka').count() > 0, 'Somali UI applies'); await page.selectOption('.top select', 'en');
  await page.click('button[aria-label="Dark mode"]'); ok(await page.evaluate(() => document.documentElement.getAttribute('data-theme')) !== null, 'theme toggles');
  // create a product with variants through the form
  await visit(page, '/inventory'); await page.click('text=+ Products'); await page.fill('[name=name]', 'E2E Hoodie'); await page.fill('[name=prefix]', 'E2EH'); await page.fill('[name=sizes]', 'M, L'); await page.fill('[name=colors]', 'Grey'); await page.fill('[name=cost]', '9.50'); await page.fill('[name=price]', '19.99'); await page.click('.modal footer .p'); await page.waitForTimeout(800);
  await visit(page, '/inventory?q=E2EH'); ok(await page.locator('text=E2EH-M-GRE').count() > 0 && await page.locator('text=E2EH-L-GRE').count() > 0, 'product form created separate size variants');
  // quotation through the UI
  await visit(page, '/quotes'); await page.click('text=+ Quotations'); await page.waitForSelector('.modal select'); await page.evaluate(() => { const s = document.querySelectorAll('.modal select')[1]; const o = [...s.options].find((x) => x.text.includes('USB-C')); s.value = o.value; }); await page.locator('.modal button', { hasText: 'Add' }).first().click(); await page.click('.modal footer .p'); await page.waitForTimeout(900); await visit(page, '/quotes'); ok(await page.locator('text=QUO-').count() > 0, 'quotation created from the form'); await page.locator('tbody tr', { hasText: 'QUO-' }).first().locator('text=Convert to sale').click(); await page.waitForSelector('.modal'); await page.click('.modal footer .p'); await page.waitForTimeout(900); ok(await page.locator('.modal').innerText().then((x) => /INV-/.test(x)), 'quotation converts to a sale'); await page.evaluate(() => document.querySelectorAll('.overlay').forEach((o) => o.remove()));
  // organisation: create a branch
  await visit(page, '/organisation'); await page.click('text=+ Branch'); await page.fill('[name=code]', 'E2E'); await page.fill('[name=name]', 'E2E Branch'); await page.click('.modal footer .p'); await page.waitForTimeout(800); await visit(page, '/organisation'); ok(await page.locator('text=E2E Branch').count() > 0, 'branch created from the form');
  // roles editor loads permission matrix
  await visit(page, '/roles'); await page.locator('tbody tr', { hasText: 'Cashier' }).locator('text=Edit').click(); await page.waitForSelector('.perm-grid'); ok(await page.locator('.perm-grid input[type=checkbox]').count() > 100, 'permission matrix shows module x action grid'); await modalClose(page);
});

await session('cashier.uw@demo.so', async (page) => {
  await visit(page, '/pos'); ok(await page.locator('.nav a', { hasText: 'Staff' }).count() === 0, 'cashier menu hides admin pages');
  const noReg = await page.locator('button:has-text("Open register")').count(); if (noReg) { await page.click('button:has-text("Open register")'); await page.fill('[name=opening_cash]', '20'); await page.click('.modal footer .p'); await page.waitForTimeout(700); }
  await page.fill('input[placeholder^="Scan"]', 'POLO'); await page.waitForTimeout(700); await page.locator('.tile').first().click(); ok(await page.locator('.pos-layout .card:nth-child(2) tbody tr').count() === 1, 'search tile adds item to cart');
  await page.click('text=Pay full'); await page.click('text=Complete sale'); await page.waitForSelector('.modal', { timeout: 8000 }); ok(await page.locator('.modal').innerText().then((s) => /INV-UWM-/.test(s)), 'sale completes and shows reference'); await page.click('text=Thermal receipt'); await page.waitForSelector('iframe'); await page.evaluate(() => document.querySelectorAll('.overlay').forEach((o) => o.remove()));
  // barcode scan path: exact barcode enter adds directly
  await page.fill('input[placeholder^="Scan"]', '6002042'); await page.keyboard.press('Enter'); await page.waitForTimeout(600);
  const r = await page.evaluate(async () => { const t = sessionStorage.getItem('tok'); const x = await fetch('/api/sales?branch_id=2', { headers: { Authorization: 'Bearer ' + t } }); return x.status; }); ok(r === 404, 'cashier of Branch A gets 404 for Branch B via direct API call');
  await page.goto(BASE + '#/staff'); await page.waitForTimeout(500); ok(await page.locator('text=Missing permission').count() > 0 || await page.locator('text=permission').count() > 0, 'direct URL to admin page is refused by the server');
}, { width: 820, height: 1000 });

await session('manager.ec@demo.so', async (page) => {
  await visit(page, '/visits'); await page.locator('.tile.svc').first().click(); await page.click('text=Pay full'); await page.click('text=Record visit'); await page.waitForSelector('.modal', { timeout: 8000 }); ok(await page.locator('.modal').innerText().then((s) => /VIS-ECM-/.test(s)), 'barber visit recorded');
  await page.evaluate(() => document.querySelectorAll('.overlay').forEach((o) => o.remove()));
  await visit(page, '/commissions?preset=year'); ok(await page.locator('text=Ahmed').count() > 0, 'commission report lists barbers'); await page.locator('tbody tr', { hasText: 'Ahmed' }).locator('text=Pay out').click(); await page.waitForSelector('.modal'); ok(true, 'payout form opens'); await modalClose(page);
  await visit(page, '/dashboard?preset=year'); ok(await page.locator('text=Net profit').count() > 0, 'manager sees profit for their branch');
});

await session('ahmed@demo.so', async (page) => {
  await visit(page, '/commissions?preset=year'); ok(await page.locator('tbody tr').count() === 1, 'barber sees only own commission row');
  ok(await page.locator('.nav a', { hasText: 'Expenses' }).count() === 0 && await page.locator('.nav a', { hasText: 'Staff' }).count() === 0, 'barber menu limited');
  await visit(page, '/dashboard?preset=year'); ok(await page.locator('text=Gross profit').count() === 0, 'barber dashboard hides profit');
}, { width: 390, height: 800 });

await session('tech.th@demo.so', async (page) => {
  await visit(page, '/repairs'); ok(await page.locator('tbody tr').count() > 0, 'technician sees assigned repair jobs'); await page.locator('tbody tr').first().click(); await page.waitForSelector('.modal'); ok(await page.locator('.modal').innerText().then((s) => s.includes('REP-THM-')), 'repair detail opens');
});
await session('manager.th@demo.so', async (page) => {
  await visit(page, '/repairs'); await page.click('text=+ New repair'); await page.fill('[name=customer_name]', 'E2E Customer'); await page.fill('[name=fault]', 'No power'); await page.fill('[name=est_price]', '30'); await page.click('.modal footer .p'); await page.waitForTimeout(1200);
  await page.evaluate(() => document.querySelectorAll('.overlay').forEach((o) => o.remove())); await visit(page, '/repairs?q=E2E'); ok(await page.locator('text=E2E Customer').count() > 0, 'intake form creates a repair job');
  await visit(page, '/registers'); ok(await page.locator('tbody tr').count() > 0, 'register sessions listed'); await visit(page, '/reports/cash_discrepancies?preset=year'); ok(await page.locator('tbody tr').count() >= 0, 'discrepancy report renders');
});
await session('accountant@demo.so', async (page) => { await visit(page, '/expenses'); await visit(page, '/reports/expenses_by_category?preset=year'); await visit(page, '/reports/receivables?preset=year'); ok(await page.locator('.nav a', { hasText: 'Point of sale' }).count() === 0, 'accountant has no POS'); });
await session('platform@bizsuite.local', async (page) => { await page.waitForSelector('text=Platform administration', { timeout: 6000 }); ok(true, 'platform admin console loads'); });
await browser.close();
console.log(`\n${checks - problems.length}/${checks} checks passed`); if (problems.length) { console.log('FAILED:\n' + problems.join('\n')); process.exit(1); }
