# Hubdex Store LTD – business management platform (BizSuite)

Three branches, one owner dashboard, separate access per branch – enforced on the server:

| Branch | Type | What it runs |
|---|---|---|
| **Rio Berber** | Barber / salon | services, customer visits per barber, daily staff sheet, commission %, advances, deductions, branch profit |
| **Rio Store** | Clothing, shoes & fashion | products with size/colour variants, POS, purchases, returns/exchanges, stock |
| **Reyxaan Store** | Electronics | phones/accessories (IMEI tracking, warranty), repairs with job sheets, spare parts |

Each branch has its own identity (name, colour, optional logo), staff, stock/services, sales, expenses, reports and profit figures; the owner sees everything (or filters to one branch) on the main dashboard.

**Read `docs/LIMITATIONS.md` first** – it lists everything that is *not* done.

**Logo:** the Hubdex Store LTD logo is applied on the sign-in page, menu, receipts, invoices, quotations, repair slips and report print-outs/PDFs. The copy shipped in `public/brand/` is a *vector re-creation* made from the image supplied in the chat (the original file could not be copied). To use the original artwork: sign in as owner → **Settings → Branding → Upload logo** (PNG/JPEG/WebP). It takes priority immediately and is also embedded in PDFs.

## Quick start (local demo, 1 minute)
Requires **Node.js ≥ 22.13** – no `npm install` needed (zero dependencies). Names, passwords and accounts above are **demo only**: edit them in Staff / Organisation, or start production empty (`docs/DEPLOYMENT.md`).
```bash
cd bizsuite
npm start                  # creates ./data and loads demo data on first run → http://localhost:3000
npm test                   # automated tests (unit + integration)
```
Demo accounts – password **`Demo@1234`** (demo only; production starts empty):
| Role | Account | Branch |
|---|---|---|
| Owner | `owner@demo.so` | all three |
| Accountant | `accountant@demo.so` | all (financial modules) |
| Manager | `manager.berber@demo.so` · `manager.store@demo.so` · `manager.reyxaan@demo.so` | Rio Berber · Rio Store · Reyxaan Store |
| Sales assistant (scan & send to manager) | `assistant.store@demo.so` | Rio Store |
| Cashier / front desk | `cashier.berber@demo.so` · `cashier.store@demo.so` · `cashier.reyxaan@demo.so` | one each |
| Technician | `tech.reyxaan@demo.so` (15 %) | Reyxaan Store |
| Barbers | `ahmed@demo.so` (40 %) · `farah@demo.so` (45 % + 0.50 per service) · `omar@demo.so` (50 %) | Rio Berber |
| Platform admin | `platform@bizsuite.local` | tenants only (no business data) |

Demo data: Hubdex Store LTD with 3 branches (USD), ~14 days of sales, barber visits (≈ 8 customers a day split between three barbers), purchases, IMEI phones, 4 repair jobs in different states (delivered, overdue diagnosis, one awaiting a revision approval, a fresh intake), an advance, a payout and an authorised deduction for the barbers, expenses incl. a company-wide marketing expense shared by revenue, register sessions (one with a 5.00 shortage). Approvals appear when you trigger one (e.g. a 30 % discount as a cashier).

## Production
See `docs/DEPLOYMENT.md` (Docker + Caddy HTTPS, or systemd), `docs/BACKUP_RESTORE.md`. First owner: `npm run bootstrap`.

## Documentation
| | |
|---|---|
| `docs/PROPOSAL.md` | requirements understanding, architecture choice, diagrams, DB plan, wireframes, milestones, timeline, price, support terms |
| `docs/ARCHITECTURE.md` | stack, tenancy/SaaS design, authorisation, integrity, security |
| `docs/FINANCIAL_RULES.md` | every formula (revenue ≠ cash ≠ profit, costing, commission) |
| `docs/ADMIN_GUIDE.md`, `docs/USER_GUIDE.md` | owner/manager/accountant and employee guides |
| `docs/DEPLOYMENT.md`, `docs/BACKUP_RESTORE.md` | operations |
| `docs/API.md` | generated route table (`npm run docs:api`) |
| `docs/THIRD_PARTY.md`, `docs/COSTS.md` | licences, integration & recurring costs, SaaS activation scope |
| `docs/TESTING.md`, `docs/TEST_RESULTS.txt` | results, acceptance matrix, manual checklist |
| `docs/SOMALI_REVIEW.md`, `docs/somali-review.csv` | Somali status, glossary, review sheet |
| `docs/DEMO_SCRIPT.md`, `docs/LIMITATIONS.md` | video script, honest gap list |

## Layout
`src/` services + API · `public/` web app (no build) · `migrations/` SQL · `test/` · `scripts/` (backup, restore, bootstrap, e2e, API-doc generator).
