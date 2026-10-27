# Installation and go-live

Two places are involved:

* **The management system** (Odoo) on a small server (VPS) at `https://manage.itrackzen.net`.
* **The website** (already on Hostinger) at `https://itrackzen.net`, updated with the new admin area files.

Allow half a day for the server and one to two days for configuration and data. Do everything first on a **staging** copy (section 8).

## 1. What you need

| Item | Detail |
|---|---|
| Server | Ubuntu **24.04**, 2 vCPU, **4 GB RAM or more**, 40 GB+ disk, root access |
| DNS | An `A` record `manage.itrackzen.net` pointing to the server |
| Email | A mailbox for sending (invoices, reminders), for example `no-reply@itrackzen.net` |
| An email address for HTTPS certificate notices | Any monitored address |

## 2. Install the management system (about 20 minutes)

Copy the `itrackzen-management` folder to the server, then as root:

```bash
cd itrackzen-management/deploy
sudo ./install-ubuntu.sh manage.itrackzen.net you@itrackzen.net https://itrackzen.net
```

The script installs PostgreSQL, Odoo 18.0 at the exact tested commit, the PDF engine, the ITrackZen add-ons, nginx with HTTPS, the firewall and the
nightly backup. It creates the database `itrackzen` **without demo data** and a random first administrator password,
saved in `/etc/itrackzen/first-admin-password.txt` (readable by root only). Re-running the script is safe: it keeps your data and secrets.

## 3. First sign-in and owner accounts

1. Open `https://manage.itrackzen.net`, sign in as `admin` with the generated password.
2. **Settings > Users**: create the real people (section 6). Give the owner(s) the role **Owner / Super Admin**.
3. For each person, **Preferences > Account security > Enable two-factor authentication** (strongly recommended for Owner, Operations Manager, Accountant).
4. Create your own owner account, then **archive the shared `admin` user** (or at least change its password and delete the first-password file).

## 4. Company set-up (once, as Owner)

| Where | What |
|---|---|
| Settings > Companies | Name, address, phone, email, website. The ITrackZen logo and colours are already set |
| Management > Configuration > (company) tab **ITrackZen Management** | Approval required (on by default), approval threshold, maximum discount without approval, renewal reminder days, grace days, renewal invoice lead days, low-stock alert email, **payment instructions** and document terms printed on documents |
| Accounting | Settings > Accounting: pick your **country's chart of accounts** (Kenya, Uganda, Ethiopia... or the generic one) and set taxes. Do this **before** the first invoice |
| Settings > Technical > Outgoing Mail Servers | Your mailbox (SMTP). Send the test message |
| Inventory | One warehouse is created. Add more locations if needed. Technician stock locations are created automatically when you tick **Installation technician** on an employee |
| Products | Management > Inventory > Products and Stock: choose the **ITrackZen category** (GPS Tracker, Dashcam, Fuel Sensor, Relay, RFID, SIM Card, Cable, Accessory, Installation/Service, Tracking Plan). The category sets tracking and stock behaviour. Enter **your approved prices**; plans need a billing cycle |

## 5. Connect the website

The website keeps working on its own until these steps are done.

1. In the management system: **Management > Configuration > Website > Connection and Sign-in**.
   Check the two addresses (website, admin), tick **Single sign-on enabled**, choose who receives new enquiries and deletion requests, save.
   Copy the **Shared secret** (shown to the owner only).
2. On the website host, copy the updated `itrackzen-website/public_html` over the old one (keep `data/` and `includes/config.local.php`).
3. Edit `public_html/includes/config.local.php` on the website host and add:
   ```php
   define('ODOO_URL', 'https://manage.itrackzen.net');
   define('ODOO_SSO_SECRET', 'paste the shared secret here');
   // define('ADMIN_LOCAL_LOGIN', 'owner');   // 'owner' (default) | 'off' | 'all'
   ```
4. Open `https://itrackzen.net/admin/`: the page now shows **Sign in with ITrackZen Management**.
5. **Cron (retries):** in Hostinger hPanel > Advanced > Cron Jobs, add every 5 minutes:
   `php /home/USER/domains/itrackzen.net/public_html/../tools/flush-outbox.php` (adjust the path to where the `tools` folder sits).
   It re-sends enquiries or deletion requests that arrived while the management system was unreachable.
6. Test: submit the contact form on the website; within a minute the enquiry appears under **Sales > Website Enquiries**.

The website database upgrades itself on first visit (new tables for the delivery queue and staff accounts). Existing content, enquiries and deletion requests are kept.

## 6. Create staff and roles

Settings > Users > New. Pick **one role** (more only if the person really has two jobs):

| Role | For |
|---|---|
| Owner / Super Admin | Owners. Everything, including users, settings, activity log |
| Operations Manager | Approvals, scheduling, stock adjustments, team and reports |
| Sales Officer | Customers, vehicles, quotations (sees own quotations and own invoices) |
| Accountant / Cashier | Invoices, payments, statements, collections |
| Storekeeper | Receiving stock, devices, SIMs, issuing equipment to technicians |
| Installation Technician | Only own jobs, own tasks and equipment issued to them. No money, no other customers |
| Customer Support | Customers, vehicles, subscriptions, tasks |
| Read-only user | Can view, cannot change anything |

The roles are check boxes in the **ITrackZen access** block at the top of the user form. Leave the standard Odoo access rights (Sales, Inventory, Purchase, Employees, Administration) empty.

Then tick **Installation technician** on the employee record of every technician (Employees > ITrackZen tab) and link the employee to the user.
Optional extra privileges (Settings > Users > the person): *Financial information*, *Approve quotations and requests*, *Delete records*, *Export data*.

## 7. Connect the tracking platform (GPSWOX)

The platform is GPSWOX; follow [integration-gpswox](integration-gpswox.md) (service account, Dry run first). The generic steps below describe the same safe order.

**Management > Configuration > Tracking Platform > Connection.** Only the Owner can change the mode. Fill in the platform's web addresses for customer, vehicle and live-map pages, then:

1. Mode **Dry run**: work normally for a day; check **Sync Queue** to see exactly what would be sent.
2. Mode **Staging simulator**: platform IDs are simulated; check that the buttons and the IDs behave.
3. Point the API address at the **staging** platform, use **Test connection**, mode **Live**; check a few records both ways.
4. Only then repeat with the production platform. Details and the API contract are in [integration-contract](integration-contract.md).

## 8. Staging and demo data

To try everything with sample data first (never on the live database):

```bash
sudo -u itrackzen /opt/itrackzen/venv/bin/python /opt/itrackzen/odoo/odoo-bin -c /etc/itrackzen/odoo.conf \
     -d itrackzen_staging -i itz_demo --without-demo=all --stop-after-init
```
Sample logins are in [STAGING-DEMO](STAGING-DEMO.md). Use a separate domain such as `staging.itrackzen.net` or run it on a laptop.

## 8b. Prices and stock on the website

Finance sets the price and the store enters the units; the website follows by itself.

1. Management > Inventory > Products and Stock: open the product, set the **Sales Price**, tick **Show on the website** (Finance, Accountant, Operations and Owner can do this). Only products with a price above zero are shown.
2. For a **tracking plan** also choose the **Website plan card** (Starter, Business or Enterprise). Several billing cycles can share one card: the shortest is the main price and the others appear as "Also: ...". Only one published plan per card and cycle.
3. The store receives the units as usual (Receipts). The website shows **In stock** or **Out of stock, ask for lead time**; it never shows exact quantities, costs or margins.
4. The website asks the management system for the list every 5 minutes. If the management system is down, the last list (up to 7 days old) keeps showing. Un-tick **Show on the website** to remove a product.
5. Needs the website connection from section 5 (the same shared secret). Nothing else to set up.

## 9. Updating later

Unzip the new source on the server, then run `sudo ./deploy/update.sh <path to the unzipped addons folder>`. It takes a backup, copies the add-ons, updates every installed ITrackZen module and restarts the service.
Website files (`itrackzen-website/public_html`) are copied over the old ones on Hostinger, keeping `data/` and `includes/config.local.php`.

## 10. Docker alternative (not tested)

`deploy/docker/` contains a Dockerfile and a compose file. The build tools were not available while this was prepared, so **they are untested**; use the install script above unless you prefer containers and are ready to test them.
