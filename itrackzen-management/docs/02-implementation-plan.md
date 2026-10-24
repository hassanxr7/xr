# 02. Implementation plan

## 1. Approach in one page

* **Foundation: Odoo 18.0 Community** (open source, large community, easy to hire for). Version 18.0 was chosen because it was the
  version the add-ons could be built and tested against in full here, with a pinned, reproducible source (exact commit recorded in
  the install script). Odoo S.A. supports only its latest versions, so **check odoo.com/page/download for 18.0's support window** and plan the
  upgrade (the add-ons are isolated, so moving to a newer version is a contained project; see section 9).
* **Customisation as separate add-ons** (`itz_*`), never by editing Odoo's own code, so Odoo can be updated without losing work.
* **One workspace**: staff open `itrackzen.net/admin/`, sign in once (single sign-on with the management system), and see the
  navigation and figures that fit their role. Clicking a tile or menu entry opens the page in the management system, already signed in.
* **Tracking platform stays untouched.** A dedicated, optional integration layer links customers, vehicles and devices by ID.
  It ships switched off and is tested in a simulator first.

```
 Browser (staff)
    |
    |  https://itrackzen.net/admin/        https://manage.itrackzen.net
    v                                       ^
 Website admin area (PHP, Hostinger) -------+   Odoo 18 Community + itz_* add-ons (VPS)  --- PostgreSQL, nightly backups
    |  signed token (sign-in)                   |  signed API / webhooks (optional, off by default)
    |  signed events (enquiries, deletions)     v
    +-------------------------------------> Tracking platform integration layer  -->  itrackzen.com (unchanged)
```

## 2. Modules delivered

| Add-on | What it does | Depends on |
|---|---|---|
| `itz_base` | The 8 roles and 4 privileges, activity log (append-only), approval and reminder settings, the "Management" menu, owner account, no public sign-up | Odoo base, hr, mail, 2-step sign-in |
| `itz_branding` | ITrackZen logo, colours, login page, browser tab name, branded PDF layout | web |
| `itz_inventory` | Trackers, dashcams, fuel sensors, relays, RFID, SIMs, cables, accessories; IMEI/serial per unit with duplicate protection; SIM details (number, ICCID, carrier, APN); device status (available, reserved, issued, installed, returned, damaged, warranty claim); technician stock locations; issue/return wizard; low-stock alerts; stock adjustments for managers only; purchases and receipts | stock, purchase |
| `itz_fleet` | Customer profile (contacts, vehicles, service history), vehicles, installation jobs (technician, location, photos, customer confirmation/signature, warranty), device history (installed, removed, replaced, moved), search by customer, plate, phone, IMEI, serial | itz_inventory, contacts |
| `itz_finance` | Branded invoices and payment receipts, partial payments, payment status (paid, partial, unpaid, overdue), overdue list, **customer statements with ageing** (PDF, email), reset/cancel only by approvers, payment log | account |
| `itz_sales` | Quotations with hardware, installation, tracking plans, discounts, taxes; **approval** (threshold and discount limit, four-eyes); quotation -> order -> installation jobs -> invoice with no re-typing; website enquiries -> customer and quotation | sale, itz_fleet, itz_finance |
| `itz_subscription` | Per-vehicle subscriptions, billing cycles, activation on installation, renewal invoices, reminders, grace period, expiry, payment status, due/expired lists | itz_sales |
| `itz_tasks` | Employee profiles (department, job, responsibilities), tasks (installation, maintenance, support, sales follow-up, payment collection) linked to customer, vehicle, installation, invoice | itz_subscription, hr |
| `itz_integration` | Tracking-platform connection: modes (disabled, dry run, simulator, live), sync queue with retry and idempotency, platform IDs, deep links in both directions, signed webhook | itz_tasks |
| `itz_dashboard` | Home dashboard per role, one search box, **12 reports** with date filters, PDF and Excel | itz_integration |
| `itz_website_bridge` | Single sign-on with the website admin area, role-based menu, KPI feed, enquiries and deletion requests from the website | itz_dashboard |
| `itz_demo` | Sample data for the staging demo. **Never install in production** | itz_website_bridge |

The website itself (`itrackzen-website/`) gained: single sign-on, a role-aware workspace home, a delivery queue for events and a cron tool.

## 3. The workflow, end to end

| Step | Who | What happens in the system |
|---|---|---|
| 1. Receive tracker into stock | Storekeeper | Receipt from a supplier; each unit gets its IMEI (checked for duplicates), SIMs get ICCID and phone number; status *Available*; low-stock rule checked |
| 2. Create quotation | Sales Officer | Customer, vehicles, hardware, installation, plan, discount, taxes; PDF in ITrackZen design |
| 3. Approve the sale | Operations Manager / Owner | Needed above the amount threshold or above the discount limit; the requester cannot approve their own; logged |
| 4. Confirm | Sales Officer | Order confirmed; an **installation job** is created per vehicle; a **subscription** is prepared per vehicle plan |
| 5. Assign technician | Operations Manager | Technician and date chosen; the technician gets a task |
| 6. Issue equipment | Storekeeper | Chosen IMEIs and SIMs move to the technician's own stock location; status *Issued to technician* |
| 7. Install on the vehicle | Technician | Starts the job, records the work, photos, customer confirmation; completes it |
| 8. Stock updates | Automatic | Equipment leaves the technician's stock to the customer; device is linked to the vehicle with warranty dates; history written; subscription activated |
| 9. Invoice | Accountant / Cashier | One click from the order; one-time items and the first plan period on one branded invoice |
| 10. Record payment | Accountant / Cashier | Full or partial; method, reference, date, who recorded it; branded receipt; customer statement on demand |
| 11. Renew subscription | Automatic + Sales/Support | Renewal invoice created before the date, reminder emailed, grace period, then *Expired*; payment re-activates it; collection task for unpaid invoices |

## 4. How staff reach it (website admin as the main dashboard)

1. Staff open `itrackzen.net/admin/` and press **Sign in with ITrackZen Management**.
2. They sign in with **their own account** (and 2-step verification if enabled) on the management system.
3. They return to the website admin home with a **role-specific home page**: greeting, figures (money figures only for roles allowed to see money), **Operations** menu (only entries their role allows) and **Website** menu (enquiries, deletion requests, content, media, brand: only the parts their role allows).
4. Every tile and menu entry opens the matching page in the management system; they are already signed in. The management system has a **Website Admin** entry to go back.
5. Permissions are enforced on the **server of each system**, not just by hiding buttons: the management system by access rights and record rules, the website by a role check on every page (403 otherwise).

## 5. Integration approach with the tracking platform

* **Principle:** the management system owns *business* data; the tracking platform owns *tracking* data. The platform is never written to directly.
* **Link keys:** `customer`, `vehicle`, `device` each carry the platform's own ID in the management system. IMEI is the natural key for a device, plate for a vehicle.
* **Outgoing:** changes queue up (customer, vehicle, device, service status) and are sent by a background job with retries, signatures and idempotency keys. Order is enforced (customer before vehicle before device).
* **Incoming:** a signed webhook lets the platform report IDs. It only *links* existing records; it never creates customers, vehicles or devices, so duplicates cannot appear. Unknown objects are listed for review.
* **Staff navigation:** "Open in tracking platform" and "Live map" buttons on customers, vehicles and devices; links from the platform back into the management system by plate, IMEI or customer ID.
* **Safe rollout:** Disabled -> **Dry run** (see exactly what would be sent) -> **Staging simulator** -> **Live**. No change to live tracking until the integration has been tested against a staging copy.
* Field ownership: see [integration-contract](integration-contract.md).

## 6. Security and handover items

HTTPS only (nginx + Let's Encrypt), personal logins, optional 2-step verification, role permissions enforced server-side including record-level
rules, append-only activity log (stock moves, payments, approvals, permission changes, sign-ins), nightly encrypted backups with a tested restore,
no public sign-up, database manager hidden. See [SECURITY](SECURITY.md).
Handover contents: all source code, install instructions, backup and restore scripts, admin access (generated at install), user guide, test report.

## 7. Timeline

What is **already done** is the build and the automated and browser tests. What remains depends on your inputs. Estimates are working days of effort and assume the open items in [01](01-review-of-existing-setup.md) arrive on time.

| Phase | Work | Effort | Needs from you |
|---|---|---|---|
| A. Build and test | All modules, website bridge, backup/restore, documentation | **Done** | n/a |
| B. Staging review | Walk through the demo with your team, collect changes | 2 to 3 days (calendar: 1 week) | Team time |
| C. Server and go-live setup | VPS, install script, HTTPS, mail, backups, website connection, owner and staff accounts | 1 to 2 days | VPS, DNS, mailbox |
| D. Configuration and data | Company data, taxes, chart of accounts, products and prices, plans, opening stock with IMEI/SIM, customers and vehicles | 3 to 5 days | Price list, stock list, customer list |
| E. Platform integration | Build or adapt the platform-side endpoint, dry run, simulator, staging, live | 3 to 8 days (depends on the platform's API) | API documentation, test account |
| F. Training and acceptance | Role-by-role sessions, acceptance test with real jobs | 2 to 3 days | Staff time |
| G. Go-live support | Daily check for two weeks | 2 weeks part-time | n/a |

Typical calendar time from approval of staging to go-live: **3 to 5 weeks**, mostly waiting for data and the platform API.

## 8. Cost

**Software licences: none.** Odoo Community, PostgreSQL, nginx, Let's Encrypt, wkhtmltopdf and every library used are free and open source. See [04](04-paid-dependencies.md).

**Running costs (indicative, check current prices):**

| Item | Typical | Notes |
|---|---|---|
| VPS for the management system | roughly US$ 10 to 25 per month | 2 vCPU, 4 to 8 GB RAM, 80 GB disk, Ubuntu 24.04. Hostinger VPS is a fit |
| Off-site backup space | US$ 0 to 5 per month | A second small server or object storage; encrypted copies are small (the demo is 5 MB) |
| Domain / DNS | already owned | Add `manage.itrackzen.net` |
| Email sending | already owned | Use the existing business mailbox or provider |
| Website hosting | unchanged | Stays on the current Hostinger plan |

**One-off effort** (use your agreed day rate): phases B to G above add up to roughly **13 to 21 working days**, plus 2 weeks of part-time go-live support.
Phase A is complete. This plan does not set a fee; multiply the days by the rate you agree.

**Not included, price separately if wanted:** automatic mobile-money or card collection, SMS reminders, a customer self-service portal, native mobile app for technicians (the technician screens already work on a phone browser), full financial statements (profit and loss, balance sheet; the free edition has limited reporting, see 04).

## 9. Risks and how they are handled

| Risk | Handling |
|---|---|
| Platform API unknown or limited | Integration is optional and off; links and ID mapping work without an API; fallback is a nightly CSV exchange |
| Staff type IMEIs wrongly | Duplicate and format checks, checksum warning, scan-friendly search |
| Data loss | Nightly encrypted backup, monthly automated restore check (tested; see BACKUP-AND-RESTORE) |
| Odoo upgrade (18 -> 19) | Add-ons are isolated and tested; upgrade is a planned project, not required soon |
| One person holds all access | Owner role can be given to two people; emergency owner sign-in on the website is separate and logged |
