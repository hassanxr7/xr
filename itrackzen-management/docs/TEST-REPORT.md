# Test report

What was run, what passed, what was found and fixed, and what was **not** tested. All runs were on a development machine
with Odoo 18.0 Community (pinned commit), PostgreSQL 16 and the demo data, not on your production server.

## Results

| Test | Result |
|---|---|
| Automated Odoo tests (`--test-tags itz`), all add-ons installed together | **114 tests, 0 failures, 0 errors** (82 originally, 8 for the GPSWOX adapter, 2 for the user-form role check boxes, 5 for the website product list, 10 for emails and AI-assisted replies, 4 for hours online, 2 for the Guide, 1 more role check) |
| GPSWOX adapter against a test double of the documented GPSWOX API, and over real HTTP against `integration-layer/mock_gpswox.py` (sign-in, find-or-create device by IMEI, expiry date) | Passed |
| Single sign-on from the website admin, in a real browser (owner, sales, technician, accountant) | 21 checks passed. Unauthorized sections return 403. |
| Role smoke test: every menu screen opened as each demo role | 203 screens, no access errors and no blank screens |
| Full workflow journey in the browser (quotation to subscription renewal) | Passed |
| Website regression (public pages, contact form, deletion requests, outbox retry) | Passed |
| Integration layer against the mock tracking platform over real HTTP (sync, retry, idempotency, webhook linking, deep links) | Passed |
| Backup, then restore into a temporary database (`verify-restore.sh`), then a real restore | Passed after fixing a bug (below) |
| PDF output: quotation, invoice, receipt, statement, report | Rendered, headers and footers correct (samples in `docs/sample-pdfs/`) |

Automated tests cover: duplicate IMEI/serial protection, unauthorized stock changes, four-eyes quotation approval and discount
limits, partial payments and balances, stock leaving at installation completion, warranty and subscription dates, renewal and
reminder jobs, record-level isolation (technician sees only own jobs and equipment, storekeeper sees no customer invoices, sales
sees only own orders), the audit log being append-only, the website token (expiry, replay, wrong state, bad signature,
redirect allow-list), and the tracking sync queue.

## Bugs found by testing, and fixed

- A local variable named `user` in the AI-reply code made Odoo's translation helper crash on every error message. Found by the error-path test and fixed.

- The restore script could overwrite the live file store. Fixed, and the recovery was re-tested.
- Several roles were missing access rights that only showed up when clicking through the real screens: sale options, stock
  transfers, the advance-payment wizard, employee fields on the avatar card. Fixed and covered by the smoke test.
- PDF headers and footers did not print with the stock wkhtmltopdf. The installer now fetches the patched build.
- Report tables hid zero values. Fixed.
- Menu and action id collisions between server actions and window actions. Fixed.

## Not tested, and why

- **The AI service itself.** The reply helper is tested against a stand-in for the Anthropic library (request contents, error handling, refusal handling). No real call was made: there was no key and no outbound access to the service from the build environment.
- **Real email delivery.** The server that sends mail is configured on your side. Branding, layout and wording were checked on the rendered HTML, not in Gmail or Outlook.
- **Receiving customer replies.** Replies go to the sales mailbox; reading that mailbox from the management system (IMAP) is not set up.

- **The real GPSWOX platform.** It was not reachable from the build environment and no test account was available. The GPSWOX
  connection follows the API reference you exported, is tested only against test doubles, and is shipped switched off.
- **Your production server.** `deploy/install-ubuntu.sh` passed a syntax check and its steps were run by hand, but the script
  has not been run end to end on a clean server.
- **Docker files** in `deploy/docker/` are untested.
- **Off-site backup copy and restore on a different server** are not tested.
- **No independent penetration test.** Security controls are tested functionally only.
- **Load testing**: none. Sizing in the plan is an estimate.
- **Your real data and prices**: the system was tested only with demo data.

## Dashboard, hours online, dark mode and Guide

* Checked in a real browser (Chromium) as the owner: the dashboard in light and dark mode, the Guide in English and Somali, the language choice and the theme choice staying after a switch, the Guide search, with no browser console errors. The dark mode was adjusted after screenshots (forms, lists, kanban, breadcrumbs, chat panel, report preview).
* Hours online use a once-a-minute signal; the automated tests cover counting, ignoring long gaps, per-person separation and who may see the team. The demo hours in the screenshots are made-up sample data.
* **Not tested:** the dark mode on every Odoo screen (the main ones were checked; some rarely used Odoo screens may still show a light patch); real use by several people for a full day; the pictures in the Guide show the English screens.
