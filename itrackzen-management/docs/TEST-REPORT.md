# Test report

What was run, what passed, what was found and fixed, and what was **not** tested. All runs were on a development machine
with Odoo 18.0 Community (pinned commit), PostgreSQL 16 and the demo data, not on your production server.

## Results

| Test | Result |
|---|---|
| Automated Odoo tests (`--test-tags itz`), all add-ons installed together | **90 tests, 0 failures, 0 errors** (82 before the GPSWOX adapter, 8 added for it) |
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

- The restore script could overwrite the live file store. Fixed, and the recovery was re-tested.
- Several roles were missing access rights that only showed up when clicking through the real screens: sale options, stock
  transfers, the advance-payment wizard, employee fields on the avatar card. Fixed and covered by the smoke test.
- PDF headers and footers did not print with the stock wkhtmltopdf. The installer now fetches the patched build.
- Report tables hid zero values. Fixed.
- Menu and action id collisions between server actions and window actions. Fixed.

## Not tested, and why

- **The real GPSWOX platform.** It was not reachable from the build environment and no test account was available. The GPSWOX
  connection follows the API reference you exported, is tested only against test doubles, and is shipped switched off.
- **Your production server.** `deploy/install-ubuntu.sh` passed a syntax check and its steps were run by hand, but the script
  has not been run end to end on a clean server.
- **Docker files** in `deploy/docker/` are untested.
- **Off-site backup copy and restore on a different server** are not tested.
- **No independent penetration test.** Security controls are tested functionally only.
- **Load testing**: none. Sizing in the plan is an estimate.
- **Your real data and prices**: the system was tested only with demo data.
