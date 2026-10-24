# Tracking platform integration contract

The management system **sends** business changes to a small HTTPS endpoint (the *integration layer*) in front of the tracking platform, and **receives** optional signed events back.
It never touches the platform database. If your platform already has an API, the integration layer can be a thin adapter that maps these calls to it. A working stand-in is in
`integration-layer/mock_platform.py` (use it to see the calls and to test).

## Field ownership (who is the master of what)

| Data | Master | Flows | Rule |
|---|---|---|---|
| Customer: name, company, email, phone, country | **Management system** | -> platform | Updated from management; the platform must not overwrite them |
| Customer: login, password, 2FA, last login | **Platform** | never copied | Not stored in management |
| Vehicle: plate, make, model, year, type, VIN, active | **Management system** | -> platform | Plate is the human key |
| Vehicle: icon, odometer, sensors config, geofences, trips, alerts | **Platform** | never copied | Not stored in management |
| Device: IMEI, serial, model, SIM (ICCID, number, carrier, APN), stock status, warranty | **Management system** | -> platform | IMEI is the natural key |
| Device: online status, last position, protocol settings | **Platform** | never copied | |
| Service status: active / suspended / expired / cancelled, paid until, plan | **Management system** | -> platform | The platform enforces expiry; the date comes from management |
| Invoices, payments, quotations, stock, tasks | **Management system** only | never sent | The platform never sees money |
| Platform IDs (customer, vehicle, device) | **Platform** | platform -> management | Stored once, only ops managers can correct by hand (logged), never overwritten by an event |

**Duplicate prevention:** every object has a stable `external_id` (`cus-<id>`, `veh-<id>`, `dev-<id>`, `sub-<id>`). The same `external_id` always means the same object (update, never a second copy). Every request has an `Idempotency-Key`; replaying it returns the same answer. Incoming events carry an `id`; replays are ignored. Incoming events only **link** existing records (matched by IMEI, plate, `external_id` or email); unknown objects are listed under Platform Events for a person to review, nothing is created automatically.

## Outgoing calls (management system -> integration layer)

All are `POST` with `Content-Type: application/json` to `{api_base}/{endpoint}` (endpoint paths are configurable; defaults below).

Headers:

| Header | Meaning |
|---|---|
| `Authorization: Bearer <token>` (or custom header / basic, configurable) | API key |
| `X-ITZ-Signature` | hex HMAC-SHA256 of the **raw request body** with the shared signing secret |
| `Idempotency-Key` | unique per change |

Answer: HTTP 2xx and `{"id": "<platform id>"}` for customers, vehicles and devices. HTTP 5xx, 408, 429 are retried with back-off (up to 8 attempts, then a task is raised for the admin); other 4xx are treated as permanent errors.
Order is guaranteed: customer, then vehicle, then device, then service.

| Endpoint | Payload (version 1) |
|---|---|
| `/customers` | `external_id`, `platform_id`, `name`, `company`, `email`, `phone`, `country` (ISO code) |
| `/vehicles` | `external_id`, `platform_id`, `customer_id`, `customer_external_id`, `plate`, `make`, `model`, `year`, `type`, `vin`, `active` |
| `/devices` | `external_id`, `platform_id`, `imei`, `serial`, `model`, `vehicle_id`, `vehicle_external_id`, `plate`, `customer_id`, `sim` {`iccid`, `msisdn`, `carrier`, `apn`}, `status` |
| `/services` | `external_id`, `vehicle_id`, `vehicle_external_id`, `plate`, `device_imei`, `plan`, `status` (`active`, `suspended`, `expired`, `cancelled`), `expires_on` (date), `payment_status` |
| `GET /ping` | optional, used by *Test connection* |

## Incoming webhook (platform -> management system)

`POST https://manage.itrackzen.net/itz/platform/webhook` with header `X-ITZ-Signature` (HMAC-SHA256 of the raw body, same secret) and body:

```json
{"id": "evt-123", "type": "object.created",
 "data": {"imei": "356307040000050", "device_id": "D-77", "plate": "KDA 123A", "vehicle_id": "V-9",
          "customer_id": "C-5", "email": "ops@customer.example", "external_id": "veh-12"}}
```
Answers `{"status": "matched" | "unmatched" | "duplicate"}`; 401 on a bad signature. In *Dry run* mode nothing is stored.

## Links between the two systems

| From | To | How |
|---|---|---|
| Management -> platform | Customer, vehicle, device page, live map | Buttons use the templates under Configuration > Tracking Platform (`{base}`, `{id}`, `{imei}`, `{plate}`, `{email}`) |
| Platform -> management | A vehicle | `https://manage.itrackzen.net/itz/go/vehicle?plate=KDA123A` or `?imei=...` or `?platform_id=...` |
| Platform -> management | A customer | `/itz/go/customer?platform_id=...` or `?email=...` or `?phone=...` |
| Platform -> management | A device | `/itz/go/device?imei=...` |
The user is asked to sign in first if needed, then lands on the record. Add these as "Billing / customer record" links in the platform's staff screens.

## Rollout checklist

1. Mode **Dry run**: look at the queue; confirm payloads are what the platform expects.
2. Mode **Staging simulator** (no network): confirm IDs, links and screens.
3. Point to the **staging** platform, **Test connection**, mode **Live**, test 3 customers / 5 vehicles / 5 devices.
4. Compare counts on both sides; fix mismatches by hand (platform IDs on the Tracking platform tab).
5. Repeat on production. Do not change live tracking services before step 3 passes.

## What was tested

Unit tests: dry run sends nothing; live sends signed requests with bearer token and idempotency key; parent-before-child; retries with back-off; permanent errors raise a task; duplicate changes queue once; simulator;
platform IDs cannot be edited by ordinary staff; webhook signature, duplicate event, matching, no overwrite, unknown object recorded without creating anything.
A real HTTP run against `mock_platform.py` (customer `C-101`, vehicle `V-201` created and linked, service status delivered, signed webhook matched, replay ignored).
**Not tested:** the real tracking platform (not reachable from the build environment).
