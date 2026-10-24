# 03. Roles and permissions

Eight **roles** (one per job) and four **privileges** (extras that can be added to anyone). Users can hold more than one role.
Everything below is **enforced on the server** (Odoo access rights plus record rules). Hiding a button is never the only protection.

## Roles

| Role | Purpose |
|---|---|
| Owner / Super Admin | Everything, including users and roles, settings, activity log, website and platform connections |
| Operations Manager | Approvals, scheduling, stock adjustments, employees, all tasks and reports; sees financial information |
| Sales Officer | Customers, vehicles, quotations; sees **own** quotations and invoices of own orders only |
| Accountant / Cashier | Invoices, payments, receipts, statements, collections; sees all financial information |
| Storekeeper | Receives stock, manages devices, SIMs and products, issues and takes back equipment; **no** customer invoices or payments |
| Installation Technician | **Only** own installation jobs, own tasks and equipment issued to them; customers and vehicles of those jobs; no sales, no money |
| Customer Support | Customers, vehicles, subscriptions (suspend/resume), tasks, enquiries; no money |
| Read-only user | View everything a manager can view in the ITrackZen areas; change nothing |

## Privileges (add to any role: Settings > Users)

| Privilege | Effect |
|---|---|
| Financial information | See costs, invoices, payments, balances, statements and money figures. Included in Accountant and Operations Manager |
| Approve quotations and requests | Approve or reject; also reset/cancel posted invoices and payments. Included in Operations Manager |
| Delete records | Delete vehicles, installations, subscriptions, enquiries, tasks. Stock, invoices and the activity log can never be deleted from the screens |
| Export data | List export and Excel/PDF report export. Included in Accountant and Operations Manager |

## Access rights by role (read r, write w, create c, delete d)

Generated from the running system. `·` = not allowed. Rights are then **narrowed by record rules** (next section).

| Area | Owner | Ops Mgr | Sales | Accountant | Storekeeper | Technician | Support | Read-only |
|---|---|---|---|---|---|---|---|---|
| Customers and contacts | `rwcd` | `rwcd` | `rwcd` | `r···` | `r···` | `r···` | `rwcd` | `r···` |
| Vehicles | `rwcd` | `rwcd` | `rwc·` | `r···` | `r···` | `r···` | `rwc·` | `r···` |
| Installation jobs | `rwcd` | `rwcd` | `rwc·` | `r···` | `r···` | `rw··` | `rwc·` | `r···` |
| Subscriptions | `rwcd` | `rwcd` | `rwc·` | `rwc·` | `r···` | `····` | `rw··` | `r···` |
| Tasks | `rwcd` | `rwcd` | `rwc·` | `rwc·` | `rwc·` | `rwc·` | `rwc·` | `r···` |
| Website enquiries | `rwcd` | `rwcd` | `rwc·` | `····` | `····` | `····` | `rwc·` | `r···` |
| Quotations and orders | `rwcd` | `rwcd` | `rwc·` | `rw··` | `rw··` | `····` | `r···` | `r···` |
| Invoices | `rwcd` | `rwcd` | `r···` | `rwcd` | `rwcd` | `····` | `····` | `r···` |
| Payments | `rwcd` | `rwcd` | `····` | `rwcd` | `····` | `····` | `····` | `r···` |
| Devices, SIMs (IMEI / serial) | `rwcd` | `rwcd` | `r···` | `r···` | `rwcd` | `r···` | `r···` | `r···` |
| Stock quantities | `rwc·` | `rwc·` | `r···` | `r···` | `rwc·` | `r···` | `r···` | `r···` |
| Stock transfers | `rwcd` | `rwcd` | `rwc·` | `rwc·` | `rwcd` | `····` | `····` | `r···` |
| Products | `rwcd` | `rwcd` | `r···` | `r···` | `rwc·` | `r···` | `r···` | `r···` |
| Purchases | `rwcd` | `rwcd` | `····` | `rw··` | `rwcd` | `····` | `····` | `r···` |
| Employee records | `rwcd` | `rwcd` | `····` | `····` | `····` | `····` | `····` | `····` |
| Activity log | `r···` | `r···` | `····` | `····` | `····` | `····` | `····` | `····` |
| Tracking platform connection | `rwc·` | `r···` | `····` | `····` | `····` | `····` | `····` | `····` |
| Platform sync queue | `rw··` | `rw··` | `····` | `····` | `····` | `····` | `····` | `····` |
| Website connection | `rwc·` | `r···` | `····` | `····` | `····` | `····` | `····` | `····` |
| Reports screen | `rwcd` | `rwcd` | `rwcd` | `rwcd` | `rwcd` | `rwcd` | `rwcd` | `rwcd` |

Reading the table: a right in the table is the *most* a role can do; the rules below and the controls after them narrow it.
For example the Storekeeper has an invoice right in Odoo's standard setup for vendor bills, but a record rule hides **every** customer invoice from them
(tested), and Odoo's standard right to edit orders is removed by a rule. The Accountant may edit orders only because invoicing updates them.
The Reports screen opens for everyone, but each report checks the role (money reports need the Financial privilege; the employee report needs Operations Manager).

## Record-level rules (who sees which rows)

| Data | Technician | Sales Officer | Storekeeper | Others |
|---|---|---|---|---|
| Installation jobs | only where they are the technician | all (read), edit | read | all |
| Devices / SIMs (IMEI) | only equipment **issued to them**, and devices on vehicles of their jobs | all (read) | all | all |
| Stock quantities | only their own technician location | all (read) | all | all |
| Customers | only customers of their jobs or tasks (plus colleagues) | all | all (read) | all |
| Vehicles | only vehicles of their jobs or tasks | all | all (read) | all |
| Tasks | assigned to them or created by them | own, created or followed | own, created or followed | managers and read-only: all |
| Invoices and journal items | none (no access) | **only invoices of their own orders** | **none** (record rule hides all) | finance, managers, read-only: all |
| Quotations and orders | none | own (Odoo standard) | read-only | managers: all |
| Website enquiries | none | own or unassigned | none | managers: all |

## Other server-side controls

* Only the **storekeeper or operations manager can validate any stock transfer, scrap, or apply stock adjustments** (everything else is refused; installation completion and the issue wizard do it for you in a controlled way).
* A device must be **issued to the technician** before the technician can install it; the same IMEI cannot be on two open jobs.
* Quotations over the approval threshold or discount limit **cannot be confirmed without approval**; the person who asked cannot approve their own request (except the Owner); editing prices after approval clears it.
* Only approvers can reset or cancel a posted invoice or payment; every payment is logged with who recorded it.
* Changing the tracking-platform mode or the website connection: Owner only. Platform IDs: operations managers only, logged.
* SIM PIN/PUK and API keys are hidden from everyone except the roles that need them.
* Every change of users, roles, access rights and record rules, every stock transfer and adjustment, payment, approval, sign-in from the website and integration failure is written to the **Activity Log** (append-only; nobody can edit or delete entries).

## Website admin area

| Website section | Owner | Ops Manager | Sales | Support | Others |
|---|---|---|---|---|---|
| Home with operations figures | yes | yes | yes | yes | yes (their own figures) |
| Enquiries | yes | yes | yes | yes | no |
| Deletion requests | yes | yes | no | yes | no |
| Content, media | yes | yes | no | no | no |
| Brand, local users, activity | yes | no | no | no | no |

Requests for a section a person is not allowed answer **403** on the server.
