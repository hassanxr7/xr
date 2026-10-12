# Outstanding limitations and known gaps

This file is deliberately blunt. Nothing below is presented as finished anywhere else in the documentation.

## Delivery items NOT done in this repository
| Item | Status |
|---|---|
| **Deployed, publicly reachable system** | **Not done.** I have no server, domain or credentials of yours. Everything needed is provided and verified locally: Dockerfile, docker-compose, Caddyfile, `.env.example`, `npm run bootstrap` (first owner, forced password change), `npm run preflight` (go-live checker), backup/restore CLI (tested), health endpoint. The **container image was built and tested** here (official `node:22-slim` via Google's Docker Hub mirror): empty production start with no demo data, non-root user, HSTS, health check, `bootstrap` → forced password change → `preflight` READY → `backup` → stop → `restore` → start → sign-in. Only the Caddy/HTTPS part needs your real domain. |
| **Demonstration video** | **Not produced** (no screen-recording tool available to me). `DEMO_SCRIPT.md` is a shot-by-shot script covering every workflow and the dashboard. |
| **Production credential hand-over** | Not applicable until a host exists. Procedure is in `DEPLOYMENT.md` (generate on the server, deliver via a password manager share or a one-time secret link; never e-mail). |
| **Independent security review / penetration test** | Not done. Self-review only (see `ARCHITECTURE.md` → Security). |
| **Load / performance test** | Not done. SQLite single-writer design is sized for tens of branches and tens of concurrent users. |

## Features not implemented
- **Email, SMS and WhatsApp notifications** – not connected. In-app notifications work. `channel_deliveries` is the place where a provider adapter would store delivery status and cost. Costs: `COSTS.md`.
- **Payment-provider integration** (mobile-money APIs, card gateways). All payment methods are **manual entries**. The code path that would require provider confirmation exists (`provider ≠ manual` can only become *confirmed* when the provider confirms) but no provider adapter exists.
- **SaaS subscription billing.** Implemented: tenant isolation, plan limits (branches / users / storage / modules), tenant suspension, platform-admin console, owner-granted read-only support access with logging. **Not implemented:** checkout, invoices, tax, dunning, usage metering, tenant self-sign-up, per-tenant backup/restore, PostgreSQL row-level security. Scope and price: `COSTS.md`.
- **Exports:** every report exports to **CSV, Excel (.xlsx) and PDF** (company logo and name in the header; Somali on request). PDFs are plain tabular documents. Receipts/invoices/quotations/repair slips are printable HTML (thermal 80 mm and A4) – use the browser's *Save as PDF*. Logo embedding in PDFs supports PNG (8-bit, non-interlaced) and JPEG; other logo files fall back to the company name text.
- **Appointment booking** (optional in the brief) – not built; walk-in flow only.
- **Warehouses / separate inventory locations** – stock is held per branch. A warehouse can be modelled as a branch that does not sell.
- **Reserving spare parts** separately from consuming them – parts are consumed when the customer approves the estimate / work is in progress.
- **Departments** – can be created per branch and enable extra modules (e.g. a repair desk inside a retail branch). Per-sale department selection and department-level reports are not built in the UI (the API stores `department_id`).
- **Retail salesperson commission** – commission is implemented for barbers (per service line) and technicians (repair labour) only.
- **Native app-store apps** – there is no Play Store / App Store package. The phone app is the same system installed as a web app (PWA: home-screen icon, full screen, shortcuts). It needs a connection to sell; offline it only shows the cached screens.
- **QR code per physical piece** – labels are per item *type* (SKU = product + size + colour), printed once per piece. Two identical shirts carry the same code. Phones/laptops keep their own serial/IMEI.
- **Open orders do not reserve stock** – a basket sent to the manager takes stock only when it is completed; if the last piece is sold meanwhile, completing it reports *insufficient stock*. An order whose discount is above the completing manager's limit must be completed by the owner (it is refused, not sent for approval).
- **Camera scanning** needs https and a browser with camera access (Chrome/Edge/Safari on phones and laptops). It uses the browser's BarcodeDetector where present (reads QR + common barcodes) and the bundled jsQR decoder elsewhere (QR only).
- **Password reset by e-mail** – an administrator resets passwords. TOTP two-factor works; recovery codes are not implemented.
- **Bank-statement import** – dashboard cash / mobile / bank balances are derived from recorded payments + opening balances; reconciliation is a manual tick-against-statement-total workflow.
- **Tips** are recorded per visit, split between the visit's barbers when tips belong to the employee, and reported – but *paying* tips out is not modelled (they are not commission and not revenue).
- **Quotations** for serialized devices (IMEI items) are not offered in the UI (the API accepts a serial per line).

## Design decisions you should know about
- **Customers are organisation-wide records** (a customer can buy at any branch). Branch staff can search customer *names/phones*; **balances, statements and receivables are computed only over the branches the user can access**.
- **Void** is allowed only for same-day sales with no returns. Anything later is a return (so history is never rewritten).
- **Closing a day blocks every new transaction dated that day** at that branch (sales, payments, expenses, purchases…). Reopening needs `registers.settings` and is audited.
- **Net profit follows the brief's formula**: gross profit − commission − operating expenses. Inventory write-offs (damage/loss/scrap) appear in stock movements and the stock-movement report; they are **not** deducted from net profit.
- **Shared expenses across branches with different currencies are refused** (book one expense per currency).
- **Somali:** 100 % of screen text, error messages, receipts, reports and notification patterns are translated (checked automatically), **but the wording was written by the developer and has not been reviewed by a native speaker.** Use `docs/somali-review.csv` and `docs/SOMALI_REVIEW.md` for the review. Free text you type (names, notes) is never translated.
- **Transfers need two branches of the same business.** The demo has three different businesses with one branch each (as requested), so the transfer workflow is covered by automated tests but not shown in the demo data. If you open a second Rio Store (or Reyxaan) branch it works immediately.
- **Salaries:** fixed monthly salaries are booked as *Expenses → Salaries* (they reduce the branch profit); only commission, advances, deductions and payouts live in the commission ledger.
- `node:sqlite` is flagged *experimental* by Node 22 (the warning is suppressed in `npm start`). It is stable in practice for this workload but pin the Node version in production.
- Automated browser checks: `npm run e2e` (key workflows) and `npm run e2e:sweep` (clicks every button on every page for all ten demo roles in English and Somali, submits every dialog form empty, checks phone-width overflow). Real-device checks (thermal printer, barcode scanner, phones) and the content checks in `TESTING.md` still need a human.

## Logo
The Hubdex Store LTD logo was sent as an image in the chat; `public/brand/logo.png` is a re-creation of it with a **transparent background** in two colourings: white lettering (`logo.png`, dark theme) and navy lettering (`logo-light.png`, light theme, receipts, PDFs and labels); the app shows the one that matches the theme. App icons (`icon-192/512.png`) use the cube on the navy background. Uploading a logo in *Settings → Branding* replaces all of them (use a transparent PNG).

## Defects found by testing and fixed (so you know what the tests caught)
1. Supplier payments were stored as *out* payments but summed as customer receipts → supplier balances wrong. Fixed (`netPaid` sign per party type) and covered by a test.
2. A quotation found to be expired was marked inside the conversion transaction that then rolled back, so it stayed "draft". Fixed.
3. Register "cash sales vs debt collections" was inferred from timestamps and misclassified a credit-sale collection made during the same session. Replaced by an explicit `is_collection` flag.
4. The default *Barber* role could record services, contrary to "only if the owner grants permission". Removed.
5. Exchanges for walk-in customers failed the credit check. Fixed.
6. UI: a CSS class collision (`.pos`) broke the Net-profit tile; `append(null)` rendered the text "null"; flex rows merged label and value. Fixed.
