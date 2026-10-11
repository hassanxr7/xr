# BizSuite – multi-business, multi-branch management platform

Clothing & footwear · electronics & mobile retail · device repair · barber shops – one owner dashboard, per-branch access enforced on the server.

**Read `docs/LIMITATIONS.md` first** – it lists everything that is *not* done (no live deployment, no video, no e-mail/SMS/WhatsApp, no payment-provider or SaaS-billing integration, Somali text unreviewed, …).

## Quick start (local demo, 1 minute)
Requires **Node.js ≥ 22.13** – no `npm install` needed (zero dependencies).
```bash
cd bizsuite
npm start                  # creates ./data and loads demo data on first run → http://localhost:3000
npm test                   # 37 tests
```
Demo accounts – password **`Demo@1234`** (demo only; production starts empty):
| Role | Account | Branches |
|---|---|---|
| Owner | `owner@demo.so` | all |
| Accountant | `accountant@demo.so` | all (financial modules) |
| Manager | `manager.uw@demo.so` (Urban Wear Mogadishu) · `manager.hga@demo.so` (Urban Wear Hargeisa) · `manager.th@demo.so` (TechHub Mogadishu) · `manager.fx@demo.so` (FixIt Pro) · `manager.ec@demo.so` (Elite Cuts Mogadishu) · `manager.ecn@demo.so` (Elite Cuts Nairobi, KES) | one each |
| Cashier | `cashier.uw@demo.so` · `cashier.hga@demo.so` · `cashier.th@demo.so` | one each |
| Technician | `tech.th@demo.so` (15 %) · `tech.fx@demo.so` (20 %) | TechHub / FixIt |
| Barber | `ahmed@demo.so` (40 %) · `farah@demo.so` (45 %) · `omar@demo.so` (50 %) · `kamau@demo.so` (40 %, Nairobi) | Elite Cuts |
| Platform admin | `platform@bizsuite.local` | tenants only (no business data) |

Demo data: 5 businesses, 7 branches, USD + KES, ~14 days of sales/visits/purchases/transfers (one still **in transit**), IMEI phones, 4 repair jobs in different states (delivered, overdue diagnosis, one awaiting a revision approval, a fresh intake), commission advance + payout, expenses incl. a revenue-allocated shared one, register sessions (one with a 5.00 shortage). Approvals appear when you trigger one (e.g. a 30 % discount as a cashier).

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
| `docs/DEMO_SCRIPT.md`, `docs/LIMITATIONS.md` | video script, honest gap list |

## Layout
`src/` services + API · `public/` web app (no build) · `migrations/` SQL · `test/` · `scripts/` (backup, restore, bootstrap, e2e, API-doc generator).
