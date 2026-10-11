# Architecture

## Stack (all maintained, zero runtime dependencies)
| Layer | Choice | Why |
|---|---|---|
| Runtime | **Node.js 22 LTS** (≥ 22.13) | Long-term-supported, built-in `node:sqlite`, `node:crypto`, `node:test`. |
| Database | **SQLite** (WAL mode, foreign keys ON) via `node:sqlite` | One file = trivial backup/restore; transactional; ample for tens of branches. Migration path to PostgreSQL is described below. |
| Backend | Plain `node:http` + a small router (`src/api.js`), synchronous service layer | Synchronous SQLite calls inside `BEGIN IMMEDIATE` give strict serialisation: no lost updates, no double-spend of stock. |
| Frontend | Vanilla ES modules, no build step (`public/`) | Nothing to compile, nothing to patch; DOM is built with a text-safe `h()` helper (no `innerHTML` on user data → no XSS by construction). Charts are inline SVG. |
| Auth | scrypt password hashes, random 256-bit bearer tokens (stored hashed, 12 h, revocable), optional TOTP 2FA | |
| Reverse proxy / TLS | Caddy (automatic Let's Encrypt) | |
| Tests | `node:test` (37 unit/integration) + Playwright browser smoke (92 checks) | |

No npm packages are installed at runtime, so there is no supply-chain surface to monitor beyond Node itself (see `THIRD_PARTY.md`).

## Code map
```
src/money.js      integer money, bp rates, rounding, allocate()
src/core.js       Ctx (tenant+user+perms+branch scope), audit, notifications, numbering, approvals framework
src/perm.js       permission catalogue + default role templates + business-type → module map
src/admin.js      businesses, branches, departments, roles, users (with escalation guards)
src/inventory.js  products/variants, weighted-average stock, adjustments, counts, devices, transfers, purchases
src/sales.js      retail sales + barber visits (one model), returns, void, exchange, POS search
src/payments.js   payment primitive, statuses, reversal, reconciliation
src/commissions.js append-only commission ledger, advances, payouts, barber/technician report
src/repairs.js    job sheet, status machine, charges/revisions/approvals, parts consumption, financials
src/finance.js    customers, suppliers, statements, expenses & allocations, registers, day close, services, methods
src/quotes.js     quotations
src/reports.js    ONE metric definition → dashboard, branch comparison, 17 tabular reports
src/exporter.js   CSV (formula-safe), PDF writer, receipts / invoices / quotation HTML
src/platform.js   tenants, plan limits, suspension, support access
src/api.js        routes, authentication, idempotency, error mapping
src/backup.js     VACUUM INTO backups, verification, restore
migrations/       SQL migrations (001 schema, 002 quotations), tracked in schema_migrations
```

## Multi-business structure and SaaS compatibility
`orgs → businesses (type) → branches (currency, timezone, tax, receipt settings) → users/transactions`.
* **Today (own businesses):** one org, `saas_enabled = 0`. The owner role has `scope = org` and sees every branch.
* **SaaS later:** each customer is another row in `orgs`; every tenant table carries `org_id` and **every query in the service layer is filtered by it through `Ctx`** (there is no path that takes an unscoped id from the request). A *branch of the same owner* and an *independent tenant* are different things: the former shares an `org_id`, the latter has its own.
* Limits per org: branches, users, storage MB, enabled modules (`402 plan_limit_*`).
* Platform administrators have `org_id NULL`, can list/suspend tenants and edit limits, and **cannot read tenant data** unless the tenant owner grants a time-boxed *support grant*; the session is **read-only**, expires, can be revoked instantly, and **every request is written to the tenant's audit log**.
* For a high-scale SaaS the recommended changes (priced in `COSTS.md`): PostgreSQL with row-level security, per-tenant backup/restore, a job queue and a billing integration.

## Authorisation (enforced on the server, three independent checks)
1. **Tenant** – `Ctx.org_id` comes from the session, never from the request.
2. **Permission** – roles are data: a set of `module.action` strings (`view, create, edit, approve, refund, void, export, print, settings` × 22 modules) plus sensitivity flags (`cost.view`, `profit.view`, `commissions.viewall`, `services.viewall`, `repairs.viewall`, `sales.viewall`, `services.record_any`) and approval limits (`discount_bp`, `refund_max`, `expense_max`, `adjust_qty`, `payout_max`).
3. **Branch** – `ctx.branch(id)` throws **404** (not 403, so existence is not leaked) unless the id is in the user's branch set. Lists inject `branch_id IN (…)`. Reports, exports, search, print, files, notifications and approvals use the same scope.

Further rules: you cannot grant permissions you do not hold; managers cannot assign organisation-wide roles; users cannot change their own role/branches/commission; the *Owner* role is immutable; self-approval is blocked; barbers/technicians are forced to their own rows; cost, profit and commission fields are **removed from responses** (not just hidden in the UI) without the matching flag.

## Atomicity and integrity
* Every financial operation runs in one `BEGIN IMMEDIATE … COMMIT` (nested via savepoints). A sale writes the sale, lines, stock movement(s), payment(s), commission ledger rows, notifications and audit rows together or not at all (tested: a failure on line 2 rolls back line 1).
* Confirmed documents are **never edited or deleted**: corrections are voids (same day), returns, payment reversals (an offsetting payment linked to the original) or ledger adjustments.
* Reference numbers (`INV-ECM-000123`) come from a per-branch counter updated in the same transaction and enforced by a `UNIQUE(org_id, ref)` index.
* **Duplicate submissions:** the API honours `Idempotency-Key` (response replayed, effect not repeated, stored in the same transaction). External payment references are unique per method. Buttons disable while a request is in flight.
* Cached balances (`sales.paid`, `purchases.paid`, `stock`) are verified against their ledgers in the test-suite (stock = Σ movements; paid = Σ payments).

## Approvals
Restricted actions (discount over limit, refund, expense, stock adjustment/count, commission payout, repair refund) are *deferred*: the API returns `202` and stores the full request. An approver whose own limit covers it approves → the action executes **as the requester** (so attribution is correct) with `approved_by` recorded. Requester ≠ approver.

## Background jobs
No queue is needed at this scale: an in-process scheduler (`src/server.js`) runs (a) the alert scan every 10 min (overdue repairs, overdue invoices, deduplicated per day), (b) a verified database backup every 24 h with retention, (c) expired-session cleanup. Low-stock and approval notifications are created inline when the event happens.

## Security summary
Passwords scrypt (N=16384) with per-user salt; 8+ chars with letters and digits; login limited to 10 attempts / 15 min per IP+email and 600 requests / min per IP; optional `REQUIRE_2FA=1` forces TOTP for roles that can edit roles; tokens in `sessionStorage` (no cookies → no CSRF) and stored hashed; strict CSP, `nosniff`, `X-Frame-Options: DENY`, HSTS behind TLS; uploads limited to PNG/JPEG/WebP ≤ 2 MB with magic-byte verification, random file names, tenant/branch-scoped download; all SQL parameterised (the few interpolated lists are integers taken from the database); CSV export neutralises formula injection; device PINs are visible only to the assigned technician/approvers and wiped on completion/cancellation; password hashes and secrets are never audited.

## Capacity and scaling
Single SQLite writer: comfortably hundreds of transactions per minute on a small VM. If the owner grows to hundreds of branches or becomes a multi-tenant SaaS, move to PostgreSQL (the schema is plain relational SQL; services are the only DB access; ~1–2 weeks work, see `COSTS.md`).
