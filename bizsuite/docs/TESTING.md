# Test results and acceptance checklist

## How to run
```bash
npm test                 # 48 unit/integration tests (node:test) – ~8 s, in-memory databases
npm run i18n             # Somali coverage audit (must report missing: 0)
npm run e2e              # fresh demo DB + server + headless Chromium: 128 workflow checks (incl. scan & sell, orders, QR labels, shop board, barber rates)
npm run e2e:sweep        # exhaustive sweep: every page, button and dialog form for 11 roles (incl. the sales assistant), English + Somali, phone width
npm run preflight        # production go-live checker (run on the server)
```

## Results (last full run)
* **Unit / integration: 48 tests, 48 passed, 0 failed** (`test/acceptance.test.js`, `test/extras.test.js`, `test/barber_brand.test.js`, `test/i18n.test.js`; raw output in `TEST_RESULTS.txt`).
* **Browser workflows: 102 checks, 102 passed** (`E2E_RESULTS.txt`) – logs in as owner, Rio Store cashier (tablet width), barber (phone width), Reyxaan technician, the three branch managers, accountant and platform admin; checks the Hubdex logo and title, the three-branch dashboard, the barber daily sheet and branch profit statement; opens every page the role can see with zero JavaScript errors; performs a POS sale, a barber visit, a repair intake, a quotation → sale conversion, product / branch creation, drill-down from a dashboard tile, receipt preview, CSV and PDF download, Somali switch, dark mode, permission-matrix editor, direct-URL and direct-API attempts across branches.
* Demo data is created through the real service layer (14 days of trading across 7 branches / 2 currencies); `13/14` verifies on it that consolidated = Σ branches and recomputes every dashboard total straight from the transaction tables.

* **Exhaustive UI sweep** (`SWEEP_RESULTS.txt`): see the figures at the top of that file – every navigation page of all ten demo roles, every button clicked, every dialog opened, every dialog form submitted empty (validation must answer, nothing may crash), in English and in Somali, and phone-width (390 px) overflow checks. Fails on any JavaScript error, any HTTP 5xx, or any English UI text visible in Somali mode.
* **Production container** (Docker, built from the repository `Dockerfile`): empty production start, no demo accounts, non-root, HSTS, health check, `bootstrap` → forced password change → `preflight` READY → `backup` → `restore` → sign-in verified.
* **Barber accounting** (`barber_brand.test.js`): daily sheet per barber (customers served, services, income, rate, commission, advances, deductions, take-home, retained, tips), day totals = sum of staff, branch profit statement = dashboard net profit, deductions settled once in payouts, barbers cannot create deductions or see colleagues.

## Acceptance criteria → evidence
| # | Criterion | Evidence (test) | Result |
|---|---|---|---|
| 1 | Branch A users cannot access Branch B via UI, API, search, exports | `1. Branch A users cannot reach Branch B…` (direct id, list, filter, search by foreign ref, write, stock, print, report export, CSV content, dashboard) + browser checks (cashier gets 404 for B) | ✔ |
| 2 | Retail sales reduce the correct variant; cost & profit correct | `2/3. Retail sale…` (variant M vs L, branch A vs B, landed cost, COGS 3,030, GP 2,970) and `weighted-average costing…` | ✔ |
| 3 | Returns reverse stock, payment and profit | `2/3…` (restock at original cost, refund 2,000, net sales/COGS/GP/collected all reverse; damaged return keeps cost) | ✔ |
| 4 | Transfers: dispatch, transit, receipt | `4. Transfers…` (not available at destination in transit, inventory + in-transit conserved, partial receipt, over-receipt blocked, cancel) | ✔ |
| 5 | Serialized electronics, no duplicate sales | `5. Serialized…`, `serial numbers…` (duplicate IMEI rolled back, sale records exact unit + customer + warranty, double sale blocked, return → inspect → resale, history) | ✔ |
| 6 | Repair parts reduce stock & affect profitability | `6. Repair…` (consumption on approval, revenue 9,000 − parts 3,000 − commission 800 = contribution 5,200, no retail double count, PIN wiped) | ✔ |
| 7 | $50 at 40 % → $20 commission | `7/8. Barber…` (10 visits × $5 → earned 2,000, retained 3,000, net profit lower after expenses) | ✔ |
| 8 | Visit with two services = 1 visit, 2 services | `7/8…` (visits 11, services 12; multi-barber visit splits per line) | ✔ |
| 9 | Rate changes don't alter history | `9. Commission rate changes…` (ledger rows and line rates unchanged; new work uses new rate; barber cannot edit own rate) | ✔ |
| 10 | Duplicate payouts prevented | `10/11…` (second payout "nothing to settle"; over-payment refused; rows settled once) | ✔ |
| 11 | Refunds reverse commission incl. already paid | `10/11…` (balance −200 after refund of a paid commission, netted next payout; expense recognised once = 800; payouts are not expenses) | ✔ |
| 12 | Cash closing expected / actual / difference | `12. Register…` (opening + cash sales + debt collection ± movements, difference −500, explanation required, notification, closed session immutable, day close/reopen audited) | ✔ |
| 13 | Consolidated agrees with branch reports | `13/14…` (every KPI = Σ branches per currency; report totals = dashboard) | ✔ |
| 14 | Dashboard totals match transactions | `13/14…` (independent SQL recomputation of net sales, COGS, repair, commission, opex, collected, inventory, receivables) | ✔ |
| 15 | Duplicate submissions don't duplicate | `15. Duplicate submissions…` (idempotency key replay; reused key on another endpoint rejected; external ref unique; failed multi-line sale rolls back) | ✔ |
| 16 | Backup restoration recovers consistent data | `16. Backup…` (dashboard byte-identical after destroy + restore; corrupt backup refused) + manual CLI run | ✔ |
| 17 | All forms, buttons, filters, printing, exports work | 92 browser checks + manual checklist below | **Partly automated – complete the manual list** |

Further tests: money rounding/allocation, TOTP, permissions matrix & escalation, SaaS isolation / limits / suspension / support access, credit & partial payments & pending/failed payments & provider-confirmation rule & reversal & reconciliation, purchases (partial receipt, landed cost, returns, supplier balance), expenses allocation, stock counts / adjustments / low-stock alerts, exchange, quotations, tips & technician commission, repair refunds, uploads, multi-currency, audit log, login rate limiting, export safety.

## Manual acceptance checklist (tick during UAT)
Use the demo accounts in `README.md` (or your own data). Record the result and date.
- [ ] Print QR labels on your sticker paper / label printer; scan them with a phone (installed app) and with the laptop camera; send a basket from the phone and complete it as the manager.
- [ ] POS: scan a real barcode with your scanner; split payment cash + mobile; print thermal receipt on the real printer (80 mm) and A4 invoice
- [ ] POS: discount above cashier limit → approval → manager approves → sale appears
- [ ] Credit sale to a customer; collect the balance in two instalments; statement shows both
- [ ] Return one item, exchange one item, void a same-day sale
- [ ] Purchase with partial delivery, then second delivery; pay supplier partly; supplier statement
- [ ] Transfer with partial receipt; confirm "In transit" on the dashboard
- [ ] Stock count with a difference; low-stock notification appears
- [ ] Sell a phone by IMEI; try to sell it again; return it; inspect; resell
- [ ] Repair end-to-end including a revision approval, photo upload, intake slip print, delivery blocked until paid
- [ ] Barber visits for three barbers; commission report matches a hand calculation; payout; refund after payout
- [ ] Register open/close with a deliberate difference; second user approves; close and reopen a day
- [ ] Mobile-money payment pending → confirm; reconcile against a statement
- [ ] Every report: on screen, CSV opens in your spreadsheet, PDF opens, print preview
- [ ] Somali language review of every screen you use
- [ ] Phone and tablet layouts for POS, barber visits and repairs
- [ ] Backup now, restore on a scratch machine, compare dashboard
- [ ] Log in as a Branch-B user and try to open a Branch-A record by URL/API (must fail)
