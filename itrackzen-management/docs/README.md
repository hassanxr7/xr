# ITrackZen Management System

One workspace for the GPS hardware business: quotations, stock, customers, vehicles, installations, invoices and payments,
subscriptions, employees and tasks. Built on **Odoo 18.0 Community** (open source, LGPL-3) with ITrackZen add-ons, and opened
from the **website admin area** (`itrackzen.net/admin/`), so staff use one sign-in and one navigation.

| Read this | When |
|---|---|
| [01 Review of the existing setup](01-review-of-existing-setup.md) | What exists today, what was and was not verified, what is still needed from you |
| [02 Implementation plan](02-implementation-plan.md) | Modules, workflow, integration approach, timeline, cost |
| [03 Roles and permissions](03-roles-and-permissions.md) | Who can see and do what (generated from the real system) |
| [04 Paid dependencies](04-paid-dependencies.md) | What is free, what costs money, what was avoided |
| [INSTALL](INSTALL.md) | Putting it on a server, connecting the website, going live |
| [BACKUP-AND-RESTORE](BACKUP-AND-RESTORE.md) | Nightly backups and the tested restore |
| [USER-GUIDE](USER-GUIDE.md) | Short guide for each role, and the daily workflow |
| [integration-contract](integration-contract.md) | How the tracking platform connects (APIs, webhooks, links, field ownership) |
| [STAGING-DEMO](STAGING-DEMO.md) | The demo walk-through and sample logins |
| [SECURITY](SECURITY.md) | HTTPS, sign-in, logs, what is and is not protected |
| [TEST-REPORT](TEST-REPORT.md) | What was tested and the results |

## Folder map

```
itrackzen-management/
  addons/                 ITrackZen add-ons for Odoo (one folder per feature, all tested)
  deploy/                 install script, nginx, systemd, backup / restore scripts (+ untested Docker files)
  integration-layer/      mock tracking platform used to test the connection
  docs/                   this documentation, screenshots
itrackzen-website/        the website, now with single sign-on to the management system
```

## Status in one paragraph

All add-ons are built and pass their automated tests (see TEST-REPORT). The complete workflow from receiving a tracker into
stock to renewing a subscription runs on demo data, and the website admin area signs staff in through the management system and
shows each person only what their role allows. **Not done, because it needs things only you can provide:** connecting to the live
tracking platform (the platform's API details and a test account are needed; the connection is built, tested against a simulator
and switched off), installing on your real server, entering your real products and prices, and importing your existing customers.
