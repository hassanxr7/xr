# Financial rules (as implemented)

All money is an **integer number of minor units** (cents; SOS/DJF use 0 decimals). Rates are **basis points** (40 % = 4000). No floating-point arithmetic is used for money. **Rounding:** half away from zero, applied once per computed amount (`mulBp`, `divRound` in `src/money.js`). Splits use `allocate()`: the remainder goes to the last non-zero weight so parts always sum to the total. Business dates are **branch-local** (default `Africa/Mogadishu`).

## Metrics (single definition in `src/reports.js → branchMetrics`)
Revenue, cash collected and profit are different numbers and are never mixed.

| Metric | Definition |
|---|---|
| Net sales | Σ sale-line net (after discounts, **excl. tax**) of completed sales dated in the period − Σ return net dated in the period. Retail and barber services; voided sales excluded. |
| Repair revenue | Σ approved, non-voided repair charges of jobs *completed/delivered* with `revenue_date` in the period. |
| Collected | Σ confirmed payments **in** − confirmed payments **out** (refunds) against sales and repairs. Pending/failed/cancelled never count. |
| COGS | Σ line `cost_total` (stored at sale time) − cost reversed on **restocked** returns. Includes service consumables. |
| Repair direct cost | Spare-part cost consumed + other direct repair cost. |
| Gross profit | Net sales + repair revenue − COGS − repair direct cost. |
| Staff commission (expense) | Σ `earned_delta` in the commission ledger (accrual). **Payouts are not expenses.** |
| Operating expenses | Σ **allocations** of approved expenses dated in the period (a shared expense is counted once, split across branches). |
| Net profit | Gross profit − staff commission − operating expenses. |
| Retained after commission (barber) | Service revenue − barber commission. *Not* net profit: rent, power, supplies are still to be deducted. |

Retail: Net Sales = Sales − Discounts − Returns; Gross Profit = Net Sales − COGS; Net Profit = Gross Profit − Commissions − OpEx.
Repair: Contribution = Net Repair Revenue − Parts − Direct labour/commission − Other direct costs; Branch Net Profit = Σ contributions − OpEx.
Barber: Retained = Net service revenue − Commission; Net Profit = Retained − Consumables − OpEx. A service's `consumable_cost` is stored on the line (counted once, in COGS); supplies bought through *Expenses* are separate operating costs – book either, not both, for the same item.

## Inventory costing – weighted average
`stock(qty, value)`; average = value / qty.
* **Purchase receipt:** value += qty × unit cost + allocated landed charges (freight/duty allocated by value share; partial deliveries bill proportionally).
* **Sale / repair consumption:** removes qty at the current average; the cost is **stored on the transaction** (later purchases never change it).
* **Return (restocked):** re-enters at the **original sale cost**. Not restocked (damaged): cost stays in COGS.
* **Transfer:** leaves at source average, sits **in transit** (counted in neither branch's stock, shown separately as *in-transit value*), enters destination at that cost on receipt.
* **Adjustment / count:** gains at current average; losses at average.
* **Serialized devices:** specific identification (each unit keeps its own cost).
* Purchased-but-unsold goods stay in inventory value, not in COGS.

## Commission
* Rate is **copied onto each sale line** when the service is recorded; changing a barber's rate affects only future work (`commission_rate_history` keeps the audit trail).
* Base = line net after discounts and returns, **excluding tax and tips**.
* **Earned** is recognised when the service is recorded (technician: when the job is completed). **Payable** is released **proportionally to money collected**: `payable = earned × paid_net / total_net` (all of it once fully paid). One function (`syncSaleCommission`) recomputes both targets after every payment, refund or void and writes only the *difference* as an append-only ledger row.
* **Refund** posts negative earned/payable rows. If the commission was already paid out, the negative row stays *unsettled* and shows as a negative balance against the employee, netted in the next payout.
* **Payout** settles every eligible unsettled payable row (`settled_payout_id`, one-time, concurrency-safe), records advances, authorised deductions, amount paid, remaining (carried forward as a ledger row), method, processor and approver. A row can never be settled twice.
* Example: 10 visits generating $50.00 at 40 % → commission $20.00, retained $30.00.

### Fixed fee per service (barbers)
A barber can earn a percentage, a fixed amount per service, or both: `earned = min(net amount of the line, net × rate% + fixed fee × (qty − returned qty))`, rounded half away from zero. Both values are frozen on the sale line when the visit is recorded (`sale_lines.commission_bp`, `sale_lines.commission_fixed`), so later rate changes never alter history. Refunds and voids reverse the fee through the same append-only ledger; it becomes payable in proportion to the money collected, like the percentage.

## Discounts and the per-item maximum
* Each item (variant) can carry a **maximum discount** (`variants.max_discount_bp`). The line discount **plus the line's share of any whole-sale discount** may not exceed `price × qty × maximum`. Sellers without approval rights are refused (`discount_above_item_max`); a manager with `sales.approve` may go further, still within the role's own discount limit (above it the sale goes for approval as before).
* The lowest price shown on labels and the scanner = price − price × maximum.
* *Expected profit* of stock on hand = `qty × price − stock value` (weighted-average cost); *at maximum discount* = `qty × (price − price × maximum) − stock value`. These are projections, never posted.

## Mark-downs
Lowering a price with *Mark down* stores the price before the first reduction in `variants.was_price`; tags print it struck through. Raising the price back to (or above) that value ends the mark-down. Sales always use the current price; past sales keep the price they were sold at.

## Reorder suggestion
`per day = units sold (net of returns) in the last 30 days ÷ 30`; `days of stock left = on hand ÷ per day`; `suggested order = ceil(per day × 30 + minimum stock − on hand)`. Listed when at/below the minimum or fewer than 14 days are left. Estimated cost uses the weighted-average cost of the stock on hand (or the item cost when none is left).

## Orders (scan & send to the manager)
An order is a basket, not a sale: no revenue, no stock movement, no commission and no payment until the manager completes it. Completing re-reads the current prices and runs the normal sale (stock out at weighted-average cost, payments, receipt); the sale is attributed to the seller who scanned it (`sales.user_id`) and its note carries the order reference. Completion is idempotent (Idempotency-Key) and an order can be completed only once.

## Shared expenses
Scope = branch, business or organisation. Business/org expenses are allocated at creation by *equal*, *fixed percentages* (must total 100 %) or *revenue share (trailing 30 days)*. Only allocation rows feed reports, so nothing is double counted. Paid cash expenses reduce the cashier's expected cash.

## Cash register
`expected = opening + cash received (sales + repairs + debt collections) − cash refunds − cash expenses − cash payouts/advances − cash supplier payments ± cash added/removed`. Closing records counted cash, difference and explanation (mandatory if ≠ 0); a different user approves sessions with a difference. Closed sessions are immutable.
