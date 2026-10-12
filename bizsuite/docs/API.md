# API reference (generated)

Base URL: `/api`. JSON in/out. Authenticate with `Authorization: Bearer <token>` from `POST /api/auth/login`.
Mutating requests accept an `Idempotency-Key` header: a repeated key replays the first response and never repeats the effect.

**Money** is always an integer in minor units (cents). **Rates** are basis points (4000 = 40%). **Dates** are branch-local `YYYY-MM-DD`; timestamps are UTC ISO-8601.

**Errors:** `{ "error": { "code", "message", "params" } }` with 400 validation, 401 unauthenticated, 402 plan limit, 403 permission, 404 not found *or not in your branches*, 409 conflict/state, 429 rate limit. `202 { approval_required: true, approval_id }` means the action exceeded the caller's limit and was queued for approval.

Every request is checked server-side for (1) tenant, (2) permission `module.action` and (3) branch access. Unknown and forbidden records both return 404.

## auth

| Method | Path | Handler |
|---|---|---|
| POST | `/api/auth/login` | `inline (api.js)` |
| POST | `/api/auth/logout` | `inline (api.js)` |
| POST | `/api/auth/password` | `inline (api.js)` |
| POST | `/api/auth/2fa/setup` | `inline (api.js)` |
| POST | `/api/auth/2fa/enable` | `inline (api.js)` |

## branches

| Method | Path | Handler |
|---|---|---|
| GET | `/api/branches` | `admin.js → listBranches` |
| POST | `/api/branches` | `admin.js → createBranch` |
| PATCH | `/api/branches/:id` | `admin.js → updateBranch` |
| POST | `/api/branches/:id/departments` | `admin.js → addDepartment` |
| GET | `/api/branches/:id/team` | `inline (api.js)` |

## businesses

| Method | Path | Handler |
|---|---|---|
| POST | `/api/businesses` | `admin.js → createBusiness` |

## transfer-destinations

| Method | Path | Handler |
|---|---|---|
| GET | `/api/transfer-destinations` | `inline (api.js)` |

## roles

| Method | Path | Handler |
|---|---|---|
| GET | `/api/roles` | `admin.js → listRoles` |
| POST | `/api/roles` | `admin.js → saveRole` |
| PUT | `/api/roles/:id` | `admin.js → saveRole` |

## users

| Method | Path | Handler |
|---|---|---|
| GET | `/api/users` | `admin.js → listUsers` |
| POST | `/api/users` | `admin.js → createUser` |
| PATCH | `/api/users/:id` | `admin.js → updateUser` |
| GET | `/api/users/:id/rate-history` | `inline (api.js)` |

## variants

| Method | Path | Handler |
|---|---|---|
| GET | `/api/variants` | `inventory.js → listVariants` |
| PATCH | `/api/variants/:id` | `inventory.js → updateVariant` |

## qr

| Method | Path | Handler |
|---|---|---|
| GET | `/api/qr` | `inline (api.js)` |

## print

| Method | Path | Handler |
|---|---|---|
| GET | `/api/print/labels` | `inline (api.js)` |
| GET | `/api/print/quote/:id` | `inline (api.js)` |
| GET | `/api/print/sale/:id` | `sales.js → getSale` |
| GET | `/api/print/repair/:id` | `inline (api.js)` |

## orders

| Method | Path | Handler |
|---|---|---|
| GET | `/api/orders` | `inline (api.js)` |
| POST | `/api/orders` | `inline (api.js)` |
| POST | `/api/orders/:id/complete` | `inline (api.js)` |
| POST | `/api/orders/:id/cancel` | `inline (api.js)` |

## shop

| Method | Path | Handler |
|---|---|---|
| GET | `/api/shop` | `reports.js → shopBoard` |
| POST | `/api/shop/stock-in` | `inline (api.js)` |

## products

| Method | Path | Handler |
|---|---|---|
| POST | `/api/products` | `inventory.js → createProduct` |
| PATCH | `/api/products/:id` | `inventory.js → updateProduct` |
| POST | `/api/products/:id/variants` | `inventory.js → addVariant` |

## stock

| Method | Path | Handler |
|---|---|---|
| GET | `/api/stock` | `inventory.js → stockLevels` |
| GET | `/api/stock/movements` | `inventory.js → movements` |
| POST | `/api/stock/adjust` | `inventory.js → adjustStock` |
| POST | `/api/stock/count` | `inventory.js → countStock` |

## devices

| Method | Path | Handler |
|---|---|---|
| GET | `/api/devices` | `inventory.js → listDevices` |
| GET | `/api/devices/serial/:serial` | `inventory.js → deviceHistory` |
| POST | `/api/devices/:id/inspect` | `inventory.js → restockDevice` |

## transfers

| Method | Path | Handler |
|---|---|---|
| GET | `/api/transfers` | `inventory.js → listTransfers` |
| POST | `/api/transfers` | `inventory.js → createTransfer` |
| POST | `/api/transfers/:id/receive` | `inventory.js → receiveTransfer` |
| POST | `/api/transfers/:id/cancel` | `inventory.js → cancelTransfer` |

## purchases

| Method | Path | Handler |
|---|---|---|
| GET | `/api/purchases` | `inventory.js → listPurchases` |
| POST | `/api/purchases` | `inventory.js → createPurchase` |
| POST | `/api/purchases/:id/receive` | `inventory.js → receivePurchase` |
| POST | `/api/purchases/:id/return` | `inventory.js → purchaseReturn` |

## pos

| Method | Path | Handler |
|---|---|---|
| GET | `/api/pos/search` | `sales.js → posSearch` |

## sales

| Method | Path | Handler |
|---|---|---|
| GET | `/api/sales` | `sales.js → listSales` |
| POST | `/api/sales` | `sales.js → createSale` |
| GET | `/api/sales/:id` | `sales.js → getSale` |
| POST | `/api/sales/:id/return` | `sales.js → returnSale` |
| POST | `/api/sales/:id/void` | `sales.js → voidSale` |

## exchanges

| Method | Path | Handler |
|---|---|---|
| POST | `/api/exchanges` | `sales.js → exchange` |

## quotes

| Method | Path | Handler |
|---|---|---|
| GET | `/api/quotes` | `quotes.js → listQuotes` |
| POST | `/api/quotes` | `quotes.js → createQuote` |
| GET | `/api/quotes/:id` | `quotes.js → getQuote` |
| POST | `/api/quotes/:id/status` | `quotes.js → setQuoteStatus` |
| POST | `/api/quotes/:id/convert` | `quotes.js → convertQuote` |

## payments

| Method | Path | Handler |
|---|---|---|
| GET | `/api/payments` | `payments.js → listPayments` |
| POST | `/api/payments` | `payments.js → recordPayment` |
| POST | `/api/payments/:id/status` | `payments.js → setPaymentStatus` |
| POST | `/api/payments/:id/reverse` | `payments.js → reversePayment` |
| POST | `/api/payments/reconcile` | `payments.js → reconcile` |

## methods

| Method | Path | Handler |
|---|---|---|
| GET | `/api/methods` | `finance.js → listMethods` |
| POST | `/api/methods` | `finance.js → saveMethod` |
| PATCH | `/api/methods/:id` | `finance.js → saveMethod` |

## customers

| Method | Path | Handler |
|---|---|---|
| GET | `/api/customers` | `finance.js → listCustomers` |
| POST | `/api/customers` | `finance.js → saveCustomer` |
| PATCH | `/api/customers/:id` | `finance.js → saveCustomer` |
| GET | `/api/customers/:id/statement` | `finance.js → customerStatement` |

## suppliers

| Method | Path | Handler |
|---|---|---|
| GET | `/api/suppliers` | `finance.js → listSuppliers` |
| POST | `/api/suppliers` | `finance.js → saveSupplier` |
| PATCH | `/api/suppliers/:id` | `finance.js → saveSupplier` |
| GET | `/api/suppliers/:id/statement` | `finance.js → supplierStatement` |

## expenses

| Method | Path | Handler |
|---|---|---|
| GET | `/api/expenses` | `finance.js → listExpenses` |
| POST | `/api/expenses` | `finance.js → createExpense` |
| POST | `/api/expenses/:id/void` | `finance.js → voidExpense` |

## expense-categories

| Method | Path | Handler |
|---|---|---|
| GET | `/api/expense-categories` | `finance.js → listCategories` |
| POST | `/api/expense-categories` | `finance.js → saveCategory` |

## repairs

| Method | Path | Handler |
|---|---|---|
| GET | `/api/repairs` | `repairs.js → listRepairs` |
| POST | `/api/repairs` | `repairs.js → createRepair` |
| GET | `/api/repairs/:id` | `repairs.js → getRepair` |
| PATCH | `/api/repairs/:id` | `repairs.js → updateRepair` |
| POST | `/api/repairs/:id/status` | `repairs.js → setStatus` |
| POST | `/api/repairs/:id/charges` | `repairs.js → addCharge` |
| POST | `/api/repairs/:id/charges/:cid/void` | `repairs.js → voidCharge` |
| POST | `/api/repairs/:id/approval` | `repairs.js → recordApproval` |
| POST | `/api/repairs/:id/refund` | `repairs.js → refundRepair` |

## services

| Method | Path | Handler |
|---|---|---|
| GET | `/api/services` | `finance.js → listServices` |
| POST | `/api/services` | `finance.js → saveService` |
| PATCH | `/api/services/:id` | `finance.js → saveService` |

## commissions

| Method | Path | Handler |
|---|---|---|
| GET | `/api/commissions/report` | `reports.js → resolveFilters` |
| GET | `/api/commissions/daily` | `reports.js → resolveFilters` |
| POST | `/api/commissions/deductions` | `commissions.js → recordDeduction` |
| GET | `/api/commissions/ledger` | `commissions.js → ledger` |
| GET | `/api/commissions/payouts` | `commissions.js → listPayouts` |
| GET | `/api/commissions/payouts/:id` | `commissions.js → payoutDetail` |
| POST | `/api/commissions/payouts` | `commissions.js → createPayout` |
| POST | `/api/commissions/advances` | `commissions.js → recordAdvance` |
| GET | `/api/commissions/balance/:id` | `inline (api.js)` |

## registers

| Method | Path | Handler |
|---|---|---|
| GET | `/api/registers` | `finance.js → listRegisters` |
| GET | `/api/registers/mine` | `inline (api.js)` |
| POST | `/api/registers` | `finance.js → openRegister` |
| GET | `/api/registers/:id` | `finance.js → registerDetail` |
| POST | `/api/registers/:id/movement` | `finance.js → cashMovement` |
| POST | `/api/registers/:id/close` | `finance.js → closeRegister` |
| POST | `/api/registers/:id/approve` | `finance.js → approveRegister` |

## day-closings

| Method | Path | Handler |
|---|---|---|
| GET | `/api/day-closings` | `finance.js → listDayClosings` |
| POST | `/api/day-closings` | `finance.js → closeDay` |
| POST | `/api/day-closings/reopen` | `finance.js → reopenDay` |

## approvals

| Method | Path | Handler |
|---|---|---|
| GET | `/api/approvals` | `listApprovals` |
| POST | `/api/approvals/:id/decision` | `decideApproval` |

## notifications

| Method | Path | Handler |
|---|---|---|
| GET | `/api/notifications` | `inline (api.js)` |
| POST | `/api/notifications/read` | `markRead` |

## dashboard

| Method | Path | Handler |
|---|---|---|
| GET | `/api/dashboard` | `reports.js → dashboard` |

## reports

| Method | Path | Handler |
|---|---|---|
| GET | `/api/reports` | `inline (api.js)` |

## export

| Method | Path | Handler |
|---|---|---|
| GET | `/api/export/sales` | `inline (api.js)` |

## files

| Method | Path | Handler |
|---|---|---|
| GET | `/api/files` | `inline (api.js)` |
| GET | `/api/files/:id` | `inline (api.js)` |

## settings

| Method | Path | Handler |
|---|---|---|
| POST | `/api/settings/exchange-rates` | `finance.js → setExchangeRate` |
| GET | `/api/settings/exchange-rates` | `inline (api.js)` |
| POST | `/api/settings/opening-balance` | `finance.js → setBranchAccount` |

## channels

| Method | Path | Handler |
|---|---|---|
| GET | `/api/channels` | `inline (api.js)` |

## backups

| Method | Path | Handler |
|---|---|---|
| GET | `/api/backups` | `inline (api.js)` |
| POST | `/api/backups` | `inline (api.js)` |

## support

| Method | Path | Handler |
|---|---|---|
| GET | `/api/support` | `platform.js → listSupport` |
| POST | `/api/support/grant` | `platform.js → grantSupport` |
| POST | `/api/support/:id/revoke` | `platform.js → revokeSupport` |

## platform

| Method | Path | Handler |
|---|---|---|
| GET | `/api/platform/tenants` | `platform.js → listTenants` |
| POST | `/api/platform/tenants` | `inline (api.js)` |
| PATCH | `/api/platform/tenants/:id` | `platform.js → updateTenant` |
| POST | `/api/platform/tenants/:id/support-session` | `platform.js → startSupportSession` |

## audit

| Method | Path | Handler |
|---|---|---|
| GET | `/api/audit` | `inline (api.js)` |

## branding

| Method | Path | Handler |
|---|---|---|
| GET | `/api/branding` | `inline (api.js)` |
| GET | `/api/branding/logo` | `inline (api.js)` |

## org

| Method | Path | Handler |
|---|---|---|
| GET | `/api/org` | `inline (api.js)` |
| PATCH | `/api/org` | `inline (api.js)` |
| POST | `/api/org/logo` | `inline (api.js)` |
| DELETE | `/api/org/logo` | `inline (api.js)` |

