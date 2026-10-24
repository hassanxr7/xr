# 04. Paid dependencies and what was avoided

**Result: nothing that has to be bought.** Every component below is free and open source. Money is only needed for the server and (optionally) off-site backup space.

## Used (all free)

| Component | Licence | Used for |
|---|---|---|
| Odoo 18.0 **Community** | LGPL-3 | The foundation (sales, inventory, purchase, accounting-lite, contacts, HR) |
| PostgreSQL 16 | PostgreSQL licence | Database |
| nginx, Let's Encrypt (certbot) | BSD, MPL | HTTPS and reverse proxy |
| wkhtmltopdf 0.12.6.1 (patched Qt) | LGPL-3 | PDF printing |
| XlsxWriter | BSD | Excel export |
| Python 3, requests and the packages in Odoo's `requirements.txt` | various open source | Runtime |
| ITrackZen add-ons (`itz_*`) | LGPL-3 | Written for ITrackZen; source delivered |

## Enterprise-only Odoo features: **not** used, and what replaces them

| Odoo Enterprise feature (paid) | Replaced by |
|---|---|
| Subscriptions | `itz_subscription` (billing cycles, renewals, reminders, expiry) |
| Customer follow-ups and statements (Accounting reports) | `itz_finance` (statement with ageing, collection tasks, overdue list) |
| Approvals | `itz_sales` (quotation approval with thresholds and four-eyes) |
| Field Service / Helpdesk | `itz_fleet` (installation jobs) and `itz_tasks` (tasks) |
| Documents / Sign | Attachments in the chatter, photo gallery and signature field on installation jobs |
| Studio, mobile app, IoT, barcode app | Not needed; technician screens work in a phone browser; the IMEI search box accepts scanner input |
| Full accounting (bank sync, financial statements, asset management) | Not included. The free edition covers invoices, payments and journal entries. For profit-and-loss and balance sheet use your accountant's tool, or a free community add-on |

## Services that cost money only if you choose to add them

| Service | Status |
|---|---|
| Odoo IAP services (SMS, partner autocomplete, OCR) | **Not used and not needed.** Email reminders cover renewals. SMS reminders would need a provider and are a separate decision |
| Payment providers (cards, mobile money) | **Not included.** Payments are recorded manually. Automatic collection is a separate project to define with your provider |
| Odoo.sh or Odoo Online hosting | Not used; you host it yourself |

## Notes

* **Licence terms.** LGPL-3 permits private customisation. "Odoo" is a trademark of Odoo S.A.; the screens say "ITrackZen Management" and no claim of affiliation is made.
* **Odoo Enterprise** can be added later (it is a paid upgrade) without changing data, but the add-ons were designed so it is not needed.
* **No lock-in:** all data is in standard PostgreSQL and can be exported at any time.
