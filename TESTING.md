# Acceptance test results

Results are separated by how they were verified: **automated** (a test
suite that ran and is re-runnable), **manual/browser** (driven by hand or
by real browser automation against the running services, with evidence
captured), and **unverified** (requires real Android hardware/emulator
this environment doesn't have — exact manual steps are given instead).

## Automated: API end-to-end suite

`cd api && npm run test:e2e` — 11/11 passing against a real local
PostgreSQL instance (not mocked). Source: `api/test/app.e2e-spec.ts`.

1. Login rejects a wrong password (rate-limited, timing-safe).
2. Full pipeline: pairing-code creation → QR → redemption → device
   token issuance → SMS ingestion → appears in `GET /messages` → overview
   counts update.
3. Idempotent retry: submitting the same `clientUuid` twice yields
   `created` then `duplicate` with the *same* `serverId`; exactly one row
   exists afterward. (**Maps to acceptance test #4.**)
4. Two messages with identical sender/body/timestamp but different
   `clientUuid`s are both preserved as separate rows. (**#5.**)
5. Reused pairing codes are rejected (single-use enforced atomically,
   with the losing concurrent redemption's orphan device row rolled back
   in the same transaction), and a separately-seeded already-expired code
   is rejected with no device created. (**#12.**)
6. A revoked device's bearer token is rejected on its very next request,
   with no grace period. (**#10, #12.**)
7. Cross-owner isolation: owner B's session sees zero of owner A's
   messages or devices, and can't rename owner A's device by guessing its
   id (404, not 403, so existence isn't confirmed either). (**#13.**)
8. CSV export sanitizes formula-injection payloads (`=`, `+` prefixed
   cells get a leading `'`).
9. `GET /messages/sync` cursor reconciliation, paged one row at a time,
   visits every one of 25 seeded messages exactly once. (**#11, part of
   #14's dedup-by-cursor mechanism.**)
10. Two regression tests for CSRF-middleware bugs found via real browser
    testing (below): pairing redemption still works when a browser
    happens to carry an unrelated owner session cookie, and device
    Bearer-token requests are never CSRF-blocked regardless of any stray
    cookie.

## Manual / real browser automation

Driven with headless Chromium (Playwright) against the actual running
API + Next.js dev servers — not a mock. This is what caught the two CSRF
bugs listed above; screenshots were captured as evidence.

- **#1 (pair a phone, receive an SMS, see it in an open dashboard without
  refreshing)** — verified end-to-end: logged in, opened Devices, generated
  a pairing code, redeemed it exactly as the Android app would (`POST
  /devices/pair`), opened the Inbox tab, then POSTed a live message via
  `POST /devices/me/messages` with the issued device token. The message
  appeared in the open Inbox tab with no page reload, via the SSE
  `message.created` event, and the connection badge showed "Live".
- Detail panel, read/unread toggle, sender/message copy, device+SIM
  badges, and the "Export CSV" link all confirmed working from the same
  session.
- Dark/light/system theme toggle in Settings applies instantly
  (`data-theme` attribute flips, verified via `page.evaluate`).
- Responsive layout confirmed at a 390×844 (phone-width) viewport: no
  horizontal overflow, nav collapses to a top bar, filters stack — Inbox
  and Overview both checked.
- Unicode/emoji/Arabic/Somali text round-tripped correctly through
  ingestion → storage → dashboard rendering (rendered as plain text, not
  interpreted as HTML).

## Manual: 100,000-message scale (#15)

Seeded 100,000 synthetic messages (`api/src/scripts/seed-perf.ts`, gated
behind `SEED_DEMO_DATA=true`, never runs by accident) into a disposable
database and measured real request latency against the running API:

| Request | Latency |
|---|---|
| First inbox page (`GET /messages?limit=50`) | 14.5 ms |
| Page 500 of pagination (~25,000 rows deep via keyset cursor) | 19.2 ms |
| Substring search across all 100k rows (`?q=verification`, trigram index) | 12.6 ms |
| Full CSV export of all 100,000 rows (streamed) | 6.43 s |

The near-identical latency between page 1 and page 500 demonstrates the
keyset (cursor) pagination design is doing its job — an OFFSET-based
approach would have grown noticeably slower by page 500. The database was
then dropped; this was a one-off load test, not a persistent fixture.

## Automated: Android `:core` module

The Android app is split into a pure-Kotlin `:core` module (multipart SMS
reassembly, deterministic UUIDv5 derivation for historical imports,
backoff/jitter, the local queue's state machine, wire DTOs) with zero
Android dependency, specifically so it could be genuinely built and tested
in this sandbox without an Android SDK. `cd android && ./gradlew
:core:test --configure-on-demand` (the flag skips configuring the `:app`
module, which does need the Android SDK this sandbox doesn't have) — 65
tests, re-run and confirmed passing, including a UUIDv5 result
cross-checked against the well-known RFC4122 DNS-namespace test vector and
a case proving two same-broadcast, different-sender PDU groups are kept
separate rather than merged.

That last case is what a manual code review of the `:app` module (which
can't be built/tested here) turned up a real bug in: `SmsReceiver.kt` was
destructuring `groupAndReassemble`'s per-group result but then reading
`sender`/`timestamp` from the whole broadcast's first PDU for every group
— harmless in the overwhelmingly common one-message-per-broadcast case,
but silently wrong for the rare case its own `:core` test already proved
the grouping logic handles correctly. Fixed to use the group's own key;
see git history for the commit.

## Unverified: requires real/emulator Android hardware

These need a physical or emulated Android device this sandboxed
environment doesn't have network/hardware access to provision fully (see
`android/README.md` for exactly what the Android agent could and couldn't
verify in-container, e.g. whether a debug APK actually built). Steps below
are exact manual verification instructions for whoever has that hardware.

- **#2 (screen locked, app in background)** — Send a real SMS to the
  paired phone, lock the screen, background the app, and confirm the
  message still appears in the dashboard within a few seconds (proves the
  manifest-registered broadcast receiver + WorkManager path works without
  the app in the foreground).
- **#3 (offline queue, then reconnect)** — Enable airplane mode on the
  phone, send it 2-3 SMS from another phone, wait, then disable airplane
  mode. Confirm all messages appear in the dashboard shortly after
  reconnecting, and the app's queue-count indicator drops to zero.
- **#6 (multipart SMS reassembly)** — Send an SMS long enough to split
  into multiple parts (e.g. >160 GSM-7 characters) and confirm it appears
  as *one* message with the full text in order, not as separate parts.
- **#7 (long text/emoji/Somali/English/Arabic/alphanumeric senders)** —
  Send SMS containing each from a real carrier (some carriers/short codes
  behave differently than the emulator) and confirm exact preservation.
- **#8 (dual-SIM device identity)** — On a real dual-SIM phone, receive
  SMS on each SIM and confirm the dashboard's Devices page and Inbox SIM
  filter distinguish them (falling back to "Unknown" only where Android
  itself doesn't expose subscription info to the app — this varies by
  OEM).
- **#9 (process death / reboot recovery)** — Force-kill the app process
  (or reboot the phone) with pending queued messages, then confirm
  WorkManager resumes the upload once the app/OS allows it again.
- **#10 (force-stopped / permission revoked)** — Force-stop the app from
  Android Settings, send an SMS, confirm nothing uploads (expected —
  Android will not run this app's workers again until it's reopened,
  per https://developer.android.com/about/versions/15/behavior-changes-all#stopped-state),
  then reopen the app and confirm it recovers (live capture resumes
  immediately; anything missed during the stopped period needs a
  historical import, since Android does not queue broadcasts for a
  stopped app).
- **#14 (historical import doesn't duplicate live-captured messages)** —
  Let a message arrive live, then run a historical import covering that
  same date range, and confirm the inbox still shows it once, not twice.
- **#16 (pause/resume, server failure, invalid records, storage pressure)**
  — Toggle Pause Sync mid-stream and confirm capture/upload actually stop;
  stop the API container while the phone has connectivity and confirm the
  app shows a clear offline/error state and catches up once the API is
  back; the retention cron job and message-delete-then-reimport behavior
  are covered by the "Retention" and "Deletion" notes in
  `deployment/README.md` and `web`'s Settings/Inbox copy, but only
  exercised here against synthetic data, not a genuinely full disk.

## Security checks performed

- CSRF double-submit cookie enforced on every session-cookie-authenticated
  mutating request except login/pair (which don't rely on ambient cookie
  auth); verified rejected (403) without the header, accepted with it.
- Cross-owner data isolation verified at the API layer (see e2e test #7
  above) — ownership is always derived from the authenticated
  session/device, never a client-supplied id.
- Device revocation takes effect immediately, no cached/grace-period
  access (e2e test #6, and confirmed manually via curl mid-session).
- Rate limiting confirmed operational on `/auth/login` and
  `/devices/pair` (tripped deliberately during manual testing, then
  reset via the now-configurable `LOGIN_RATE_LIMIT`/`PAIR_RATE_LIMIT`/
  `GLOBAL_RATE_LIMIT` env vars).
- `npm audit`: 0 vulnerabilities in both `api/` and `web/` dependency
  trees at time of writing (a few transitive packages needed explicit
  version overrides to clear known CVEs — see git history for
  `package.json`).
