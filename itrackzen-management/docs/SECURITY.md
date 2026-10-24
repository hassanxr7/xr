# Security notes

| Topic | What is in place |
|---|---|
| Transport | HTTPS only: nginx with a Let's Encrypt certificate, HTTP redirects, HSTS header. The Odoo port listens on localhost only |
| Sign-in | Personal accounts. Optional **two-step verification** (Odoo's built-in authenticator-app support) for every user. Public sign-up is off. The database manager page is hidden |
| Website admin sign-in | Single sign-on: the website trusts only a **signed token** (HMAC-SHA256, valid 90 seconds, single use, bound to the sign-in that started it, return address on an allow-list). An emergency owner password sign-in exists and can be switched off (`ADMIN_LOCAL_LOGIN`) |
| Permissions | Enforced on the server: access rights and record rules in the management system, a role check on every website admin page (403) |
| Records | Append-only **Activity Log**: stock transfers and adjustments, devices changed, payments recorded/reset, approvals, subscription changes, user/role/permission changes, website sign-ins, integration failures. Nobody can edit or delete entries from the application |
| Secrets | Database password, backup passphrase and first admin password are generated per install and stored root-only; the integration API key and signing secrets are visible to the Owner only |
| Backups | Nightly, AES-256 encrypted, checksummed; restore tested (see BACKUP-AND-RESTORE) |
| Integration | Signed requests, API key, idempotency, no direct database access to the tracking platform, off by default |
| Server | Firewall allows SSH and web only; the service runs as an unprivileged user with systemd hardening |
| Documents | Prices and customer data only in the management system; the website never receives money data |

## Limits you should know

* The two-step verification and the choice of strong passwords depend on your staff. Turn it on for Owner, Operations Manager and Accountant at least.
* The Owner role is powerful by design; keep it to two people. The emergency website owner password should be long and stored offline, or set `ADMIN_LOCAL_LOGIN` to `off`.
* Inside the management system, anyone who can read a record can see what the screen shows. Technician isolation covers jobs, customers, vehicles, devices and stock; it is tested but should be rechecked after you add your own customisations.
* No penetration test by an independent party has been done. Run one before storing sensitive third-party data at scale.
* This system does not take card payments, so no card data is stored.
