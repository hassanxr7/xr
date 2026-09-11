# SMSBridge

Self-hosted SMS bridge: install the Android app on a phone, leave it
wherever it has signal and power, and read its incoming SMS from a secure
web dashboard anywhere else. No inbound ports or public IP on the phone —
it only ever makes outbound HTTPS calls to your own server.

"SMSBridge" is a placeholder name — see **Rebranding** below.

## How it works

```
  Incoming SMS ──▶ Android app (Room queue) ──▶ WorkManager upload ──▶ API (Postgres)
                                                                           │
                                                                           ▼
                                                      Dashboard (Next.js) ◀── SSE live push
```

The phone captures SMS via a manifest-registered broadcast receiver,
persists it to a durable local queue immediately, and hands off to
WorkManager for upload — an expedited job for near-real-time delivery,
plus a periodic job (WorkManager's minimum interval, 15 minutes) as a
reconciliation backstop. The API is the single source of truth: it
accepts idempotent batch uploads (retrying an upload after a lost response
never creates a duplicate), stores messages in Postgres, and pushes a live
SSE event to any open dashboard. The dashboard treats SSE as a convenience
push channel only — on connect and every reconnect it replays a
cursor-based sync endpoint, so a dropped connection can never permanently
hide a message.

## Repository layout

- `android/` — Kotlin/Jetpack Compose Android app.
- `api/` — NestJS + Prisma + PostgreSQL backend. See `api/README.md`.
- `web/` — Next.js dashboard.
- `deployment/` — Docker Compose, Caddy, backup/restore scripts. See
  `deployment/README.md` for exact setup commands (local dev and VPS).
- `legacy-xcash/` — an unrelated, empty Flutter project scaffold that was
  already in this repository before SMSBridge; kept aside rather than
  deleted, not part of this system.

## Quick start

Full instructions: `deployment/README.md`. In short, for a VPS:

```bash
git clone <this-repo> smsbridge && cd smsbridge/deployment
cp .env.example .env && nano .env        # set POSTGRES_PASSWORD, SMSBRIDGE_DOMAIN
docker compose build && docker compose up -d
docker compose exec api npm run owner:create -- --email=you@example.com --password='a-strong-password'
```

Then open `https://<your-domain>`, sign in, and go to **Devices → Add
device** to pair your phone.

## Operator guide

**Pairing a phone.** In the dashboard, Devices → Add device → name it
(e.g. "Home Phone") → a QR code and an 8-character code appear, valid for
10 minutes and single-use. In the Android app, scan the QR (or enter the
server address and code by hand), confirm the server address shown, and
grant the SMS permission when prompted. The device appears in the
dashboard's Devices list as soon as pairing completes.

**Reading SMS.** Inbox shows every message, newest first, with search,
device/SIM/date/read-state filters, and CSV export. Opening a message in
the dashboard never marks it read in the phone's own SMS app — the two are
independent. New messages appear within a few seconds under normal
connectivity, live, without reloading the page.

**Offline recovery.** If the phone loses connectivity, it keeps capturing
SMS into its local queue and uploads everything once back online — nothing
is lost or silently dropped. If RECEIVE_SMS/READ_SMS was denied or the
app was force-stopped for a period, use the app's historical import (pick
a date range) to backfill anything missed, once permission is granted
again; this requires READ_SMS and reads only from the phone's own inbox,
never re-sending anything already uploaded.

**Common errors:**
| Symptom | Cause | Fix |
|---|---|---|
| App shows "device revoked" | Owner revoked the device from the dashboard | Re-pair with a new code |
| Pairing code rejected | Code expired (10 min) or already used | Generate a new one |
| Dashboard shows "Status unknown" for a device | No status report received yet | Confirm the app has RECEIVE_SMS and network access |
| Login fails repeatedly | Wrong password, or rate-limited after 5 attempts/min | Wait a minute, or use `owner:reset-password` (see below) |
| Forgot the owner password | No email-based reset (self-hosted, no SMTP by default) | `docker compose exec api npm run owner:reset-password -- --password='...'` |

## Rebranding

"SMSBridge" appears in exactly two places meant to be edited:
- `web/src/lib/branding.ts` (`BRAND_NAME`, overridable via the
  `NEXT_PUBLIC_BRAND_NAME` env var — see `deployment/.env.example`).
- `android/` — see `android/README.md` for `applicationId`/app name/icon.

## Security posture (summary)

- Argon2 password hashing, rate-limited login, HttpOnly session cookies,
  double-submit CSRF protection, hashed (never plaintext) device tokens.
- Device credentials authorize only that device's own upload/status
  endpoints — never owner login, never another device's data. Every
  message/device/export/SSE request is authorized server-side from the
  authenticated session or device token, never from a client-supplied id.
- SMS content never leaves your own infrastructure — no ads/analytics/AI
  services see it. Logs never contain SMS bodies, passwords, pairing
  codes, or tokens.
- Production starts with no demo data and no default password: the owner
  account only exists once you run `owner:create`, and the demo/perf seed
  scripts refuse to run unless `SEED_DEMO_DATA=true` is explicitly set.

## Distribution

This is built for **private installation** (build/sideload the APK
yourself, per `android/README.md`). Cross-device SMS synchronization is
explicitly called out in Google Play's SMS/Call Log permissions policy as
a restricted-use case requiring Play's approval, which is not assumed or
requested here — see
https://support.google.com/googleplay/android-developer/answer/10208820
before considering public Play Store distribution.

## Status / what's verified

See `TESTING.md` for the acceptance-test results: what's covered by the
automated API e2e suite (10/10 passing), what was verified with real
browser automation (live SSE update, pairing, theming, mobile layout),
and what remains manual-verification-only on real Android hardware.
