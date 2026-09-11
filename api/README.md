# SMSBridge API

NestJS + Prisma + PostgreSQL backend. Owner auth via HttpOnly session
cookie, device auth via hashed bearer tokens, live updates via
authenticated SSE. Full interactive API docs (OpenAPI/Swagger) are served
at `/api/docs` once the server is running.

See `../deployment/README.md` for how to run this locally or in
production. This file is a quick reference with sample requests against a
server running at `http://localhost:3001`, using dummy data throughout.

## Auth

```bash
# Log in (sets an HttpOnly `sid` cookie and a readable `csrf_token` cookie)
curl -c cookies.txt -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"a-strong-password"}'

# Every POST/PUT/PATCH/DELETE while signed in must echo the csrf_token
# cookie's value back as an X-CSRF-Token header (double-submit CSRF check).
CSRF=$(grep csrf_token cookies.txt | awk '{print $NF}')
```

## Pairing a device (owner steps, then what the Android app does)

```bash
# Owner, from the dashboard (or directly):
curl -b cookies.txt -c cookies.txt -X POST http://localhost:3001/api/devices/pairing-codes \
  -H "Content-Type: application/json" -H "X-CSRF-Token: $CSRF" \
  -d '{"deviceName":"Home Phone"}'
# => { "code": "K7Q2XJ9P", "qrDataUrl": "data:image/png;base64,...", "expiresAt": "...", ... }

# Android app, unauthenticated -- exchanges the code for device credentials.
# Single-use: a second attempt with the same code returns 400 expired_or_used.
curl -X POST http://localhost:3001/api/devices/pair \
  -H "Content-Type: application/json" \
  -d '{"code":"K7Q2XJ9P","model":"Pixel 7a","androidVersion":"14","appVersion":"1.0.0"}'
# => { "deviceId": "...", "deviceToken": "<credentialId>.<secret>", "deviceName": "Home Phone" }
```

## Sending SMS (what the Android app does after pairing)

```bash
TOKEN="<credentialId>.<secret>"   # from the pair response above

curl -X POST http://localhost:3001/api/devices/me/messages \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{
    "messages": [{
      "clientUuid": "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      "sender": "+15551234567",
      "body": "Your verification code is 482913. Do not share it.",
      "observedAt": "2026-01-15T09:30:00.000Z",
      "sourceCategory": "LIVE"
    }]
  }'
# => { "results": [{ "clientUuid": "...", "status": "created", "serverId": "..." }] }

# Retrying the exact same clientUuid (e.g. after a lost response) is safe --
# it returns "duplicate" with the same serverId rather than creating a copy.
```

```bash
# Device status heartbeat
curl -X POST http://localhost:3001/api/devices/me/status \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"queueSize": 0, "permissions": {"receiveSms": true, "readSms": false}, "batteryPercent": 87, "syncPaused": false}'
```

## Reading messages (dashboard steps)

```bash
# Paginated, newest first, with filters
curl -b cookies.txt "http://localhost:3001/api/messages?limit=20&isRead=false"

# Full-text-ish search across sender and body
curl -b cookies.txt "http://localhost:3001/api/messages?q=verification"

# One message's full detail
curl -b cookies.txt "http://localhost:3001/api/messages/<id>"

# Mark read, then archive
curl -b cookies.txt -X PATCH "http://localhost:3001/api/messages/<id>" \
  -H "Content-Type: application/json" -H "X-CSRF-Token: $CSRF" -d '{"isRead": true}'
curl -b cookies.txt -X PATCH "http://localhost:3001/api/messages/<id>" \
  -H "Content-Type: application/json" -H "X-CSRF-Token: $CSRF" -d '{"isArchived": true}'

# CSV export with the same filters as the inbox view
curl -b cookies.txt "http://localhost:3001/api/messages/export?isArchived=false" -o export.csv

# Live updates (Server-Sent Events)
curl -N -b cookies.txt http://localhost:3001/api/events
```

## Reconciliation cursor (used by the dashboard after an SSE reconnect)

```bash
curl -b cookies.txt "http://localhost:3001/api/messages/sync?limit=200"
# => { "messages": [...], "nextCursor": "<opaque cursor>" }
# Pass nextCursor back as ?cursor=... to fetch anything that arrived since.
```

## Health

```bash
curl http://localhost:3001/api/health          # liveness
curl http://localhost:3001/api/health/ready    # readiness (checks the DB)
```

## Owner-management scripts (run inside the API container/host, not over HTTP)

```bash
npm run owner:create -- --email=you@example.com --password='a-strong-password'
npm run owner:reset-password -- --password='a-new-strong-password'
npm run seed:demo    # SEED_DEMO_DATA=true only -- adds a demo device + sample messages
npm run seed:perf    # SEED_DEMO_DATA=true only -- adds ~100,000 synthetic messages for load testing
```
