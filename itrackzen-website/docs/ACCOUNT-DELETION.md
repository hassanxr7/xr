# Account & data deletion: how it works and what is still needed

## Public page (for Google Play and the App Store)
`https://itrackzen.net/delete-account` (use your real website domain). No sign-in needed. It identifies ITrackZen by LibDex Ltd, explains the steps, how ownership is verified, what is deleted, what is kept (reason and period), the processing time, and has the request form.

Google Play Console: App content > Data safety > Data deletion > "Delete account URL" = the URL above.
Apple App Store Connect: put the same URL in your support / privacy information as well, and see "In-app deletion" below.

## The request process (implemented and tested)
1. Visitor submits the form. A database record is created (reference like `DEL-261016-ABCDE`).
2. A confirmation link is emailed to the address they entered. The link opens a page with a button (so mail scanners cannot confirm by prefetching). Links expire after 48 hours.
3. After confirmation, `info@libdexltd.com` and `sales@itrackzen.net` are emailed (change in Admin > Account & data deletion page > `notify`), and the requester gets an acknowledgement.
4. Staff open **Admin > Deletion requests**, check the person against the platform account and record how identity was verified. Approval is blocked until email is confirmed AND identity is recorded.
5. On approval the platform is notified (optional signed webhook, below). Staff delete the data on the platform, then mark the request **Completed** with a platform reference. The requester is emailed.
6. Every step is stored in an audit trail. Unconfirmed requests expire after 7 days.

## IMPORTANT: what the website cannot do by itself
The website and the tracking platform at itrackzen.com are separate systems. The website cannot delete platform data. Until the platform exposes a deletion function (or someone on your team deletes users in the platform admin), a staff member performs the deletion on the platform and records it in the dashboard. Do not tell Google that deletion is automatic.

## Optional platform integration (webhook + callback)
Set in `includes/config.local.php`:
```
define('DELETION_WEBHOOK_URL',    'https://itrackzen.com/api/website-deletion');   // your endpoint
define('DELETION_WEBHOOK_SECRET', 'long-random-secret');
```
When staff approve a request, the website POSTs JSON:
```
{"event":"account_deletion.approved","ref":"DEL-261016-ABCDE","email":"user@example.com","account_id":"user4821",
 "account_type":"individual|company_owner|company_user","scope":"full_account|data_only",
 "requested_at":"2026-10-16 20:07:47","approved_by":"owner","approved_at":"2026-10-16 20:30:00"}
```
Header `X-ITZ-Signature: sha256=<HMAC-SHA256 of the raw body using the secret>`. The platform must verify the signature, delete the account/data, then call back:
```
POST https://itrackzen.net/api/deletion-callback.php
X-ITZ-Signature: sha256=<HMAC of this body>
{"ref":"DEL-261016-ABCDE","status":"completed","platform_ref":"user 4821 deleted","retained":"Invoices kept 7 years"}
```
The request is then marked completed and the requester emailed. This was tested against a simulated platform; it has NOT been tested against the real platform.

## In-app deletion (needs access to the apps / platform)
Google Play and Apple both expect that if users can create an account in the app, they can also start deletion from inside the app (Apple guideline 5.1.1(v); Google Play Data safety deletion requirements). I do not have the app source or the platform, so this is not done. Brief for the app/platform developer:
1. Add **Settings > Account > Delete account** in the Android and iOS apps (visible only when signed in).
2. Show what will be deleted and kept (reuse the text of the public page), require the user to re-enter their password or confirm by email.
3. Either call a platform endpoint that deletes the user, or (minimum) open `https://itrackzen.net/delete-account` pre-filled with the signed-in user's email, so the same verified process runs.
4. After deletion, sign out and revoke tokens/push tokens.
5. Once live, add the path to `data/deletion.json` > `in_app_path` (Admin > Account & data deletion page) so the public page shows it.

## Defaults you must confirm before submitting to Google Play
Edit in Admin > "Account & data deletion page": timeframe (30 days), retention periods (billing records 7 years, security logs 12 months, deletion record 3 years, backups 90 days), the list of data deleted, and notification emails. These were drafted by me and must match what you really do.
