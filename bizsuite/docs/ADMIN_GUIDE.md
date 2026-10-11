# Administrator guide (owner / accountant / branch manager)

## 1. First set-up (owner)
1. **Organisation → + Business**: choose the operating type – *Clothing and Footwear*, *Electronics and Mobile Retail*, *Electronics and Mobile Repair*, *Barber Shop*, or *Retail and Repair combined*. The menu each user sees is derived from the types of the branches they work in.
2. **+ Branch**: code (2–8 letters, used in every document number, e.g. `UWM` → `INV-UWM-000001`), name, address, phone, **currency**, **timezone** (default Africa/Mogadishu), **tax rate** (0 for none), who receives tips, whether an **open register is required for cash**, whether **credit sales** are allowed, receipt header/footer, invoice terms. *Edit* lets you pick the branch manager and upload a logo (shown on receipts). *+ Dept* adds a department (e.g. a Repair Desk inside a retail branch) that enables that department's modules.
3. **Settings → Payment methods**: Cash, Mobile Money, Bank, Card, *Exchange credit* are pre-created. Add your own (e.g. "EVC Plus", "Premier Bank"). **All of them are manual entry** – staff type what the customer paid; nothing is confirmed automatically.
4. **Settings → Opening balances**: set each branch's mobile-money/bank starting balance (dashboard balances = opening + confirmed payments − paid expenses).
5. **Settings → Services** (barber shops): name, price, optional duration, optional **consumable cost**, active flag.
6. **Settings → Expense categories** and **Exchange rates** (only needed if branches use different currencies and you want a converted view).
7. **Inventory → + Products**: name, category, brand, type (*quantity-tracked* or *serialized IMEI/serial*), warranty months, spare-part flag, image. Enter sizes (`S, M, L`) and colours (`Black, White`) to generate **one variant per combination**, each with its own SKU, barcode, cost, price, minimum stock and **own stock balance per branch**.
8. **Staff → + Staff**: name, e-mail, role, branches, **commission rate** (needs the *staff.settings* permission). Organisation-wide roles (Owner, Accountant) see every branch; others only the branches you tick.

## 2. Roles, permissions and limits
**Roles** shows the matrix *module × action* (view, create, edit, approve, refund, void, export, print, settings). Tick what the role may do; the checkboxes you do not hold yourself are disabled (you cannot grant what you lack).
Special flags: **cost.view** (cost prices), **profit.view**, **commissions.viewall** (otherwise people see only their own commission), **sales/services/repairs.viewall** (otherwise own work only), **services.record_any** (record services for other barbers). *A barber who may record their own services needs `services.create`; leave it off to make the barber read-only.*
**Approval limits** (blank = unlimited): max discount %, refund limit, expense limit, stock-adjustment quantity, payout limit. Anything above the user's limit becomes a request in **Approvals**; an approver whose limit covers it approves and the action runs. Defaults: Manager discount 20 %, refund 1,000.00, expense 500.00, adjustment 50 units, payout 2,000.00; Cashier discount 5 %.
Turn on **2FA** for yourself (top-right name → *Enable two-factor authentication*); set `REQUIRE_2FA=1` to make it mandatory for people who can edit roles.

## 3. Daily oversight (owner)
* **Dashboard**: filter by business, branch, business type, employee and period (today … custom). Tiles are clickable – they open the underlying transactions with the same filters. Currencies are never added together; a converted block appears only if you stored exchange rates.
* **Approvals** (badge on the dashboard and in the menu), **Notifications** (🔔): low stock, cash discrepancies, refund/discount/expense requests, overdue repairs, completed repairs, invoices unpaid > 7 days, payouts awaiting approval, reconciliation differences.
* **Cash registers**: sessions with expected/counted/difference; tick *Discrepancies only*; a closed session with a difference needs a **second person** to approve. **Close day** blocks new transactions for that branch-day; **Reopen day** (owner only) needs a reason and is audited.
* **Reports** (17): consolidated, branch performance, daily revenue, profit, expenses by category, receivables, payables, inventory valuation, low stock, stock movement, transfers, repair profitability, employee performance, barber commissions/payouts, cash discrepancies, payment reconciliation, audit. Export **CSV** or **PDF**, or **Print**. Each shows period, branches, currency and generation time. Exports obey your role and branch scope.
* **Audit log**: who did what, to which record, when, with before/after values.

## 4. Money workflows
* **Expenses**: scope *branch*, *business* or *whole organisation*; shared ones are allocated *equally*, by *fixed %* (must sum to 100 %) or by *30-day revenue share* and recorded once. Paying cash from a register reduces the expected cash. Voiding needs a reason.
* **Payments**: filter by method/status; *pending* mobile-money entries are confirmed or cancelled here; *Reverse* creates an offsetting payment (the original stays). **Reconcile**: tick mobile/bank payments, enter the statement total, the difference is recorded and flagged.
* **Suppliers / Purchases**: create a purchase (optionally *receive now*), receive partial deliveries, pay the supplier, return goods. Inventory increases only by what you actually receive; freight/duty is added to the cost.
* **Commissions → Pay out**: pick the employee, the date up to which to settle, optional *deductions* (reason required), amount paid. Everything payable up to that date is settled **once**; any remaining balance is carried forward. **Advance** records cash given before payday. A refund after a payout appears as a negative balance and is netted next time.

## 5. Branch managers
Same screens limited to your branches: approve requests within your limits, count and adjust stock, receive transfers, approve closed registers, close the day, process payouts within your limit, view branch performance.

## 6. Accountant
Expenses, payments & reconciliation, customer/supplier balances, commission settlements, financial reports (read-only for sales/purchases). No POS or repair access.

## 7. Housekeeping
* Disable a user instead of deleting (history is preserved; their sessions end immediately).
* Backups: Settings → Backups (see `BACKUP_RESTORE.md`).
* **Support access** (for a platform operator in SaaS mode): Settings → Support access → *Grant* (reason, hours). Revoke at any time; every request is logged.
