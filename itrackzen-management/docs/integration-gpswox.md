# Connecting GPSWOX (GPS-Server)

ITrackZen's tracking platform is GPSWOX. This page says what the management system does with it, what it never does, and how to switch it on safely.
It follows the API reference at gpswox.stoplight.io (the exported reference is not part of this package). **It has been tested against a test double that behaves like that reference, not against your real platform.**

## Who owns what

| Data | Owner | Direction |
|---|---|---|
| Customers, quotations, invoices, payments, subscriptions, technicians, stock | Management system | Not sent (only what is listed below) |
| Positions, trips, alerts, geofences, device settings | GPSWOX | Never overwritten |
| Device (IMEI, name = plate, plate, SIM number, owner name) | Management system creates it | Management -> GPSWOX, once the tracker is **installed** |
| Subscription expiry date | Management system | Management -> GPSWOX (`expiration`), optional |
| Customer login account | GPSWOX | Created only if you switch it on |

In GPSWOX a vehicle **is** a device (object). So a vehicle is created in GPSWOX when its tracker is installed on it, not before.

## What happens, step by step

1. A technician completes an installation. The tracker's IMEI, the plate, the customer name and the SIM number are queued.
2. The system signs in to GPSWOX with the **service account** (`POST /api/login`) and keeps the returned `user_api_hash`; it signs in again by itself if the platform rejects the key.
3. It looks the IMEI up first (`GET /api/admin/devices?s=<imei>&property=imei`). If the device exists it is **edited** (`POST /api/edit_device`), otherwise it is created (`POST /api/add_device`). No duplicates.
4. The returned device id is saved on the device and the vehicle. From then on the buttons "Open in tracking platform" use it.
5. When the subscription is activated or renewed, the expiry date is sent (`POST /api/admin/device/{id}/expiration`).
6. If a call fails it is retried with growing delays, then an admin task is created. Nothing is lost; see **Management > Configuration > Tracking Platform > Sync Queue**.

Switched **off by default** because they change how the platform behaves:
* *Create customer accounts in the platform* (`/api/admin/client`): the platform may email the customer a password.
* *Deactivate the device when the subscription expires* (`/api/admin/device/{id}/status`): stops tracking for that device.

## Switching it on safely

1. In GPSWOX create a **dedicated service account** for this connection (an administrator account that is not a person's login). Do not use your own.
2. Management > Configuration > Tracking Platform > Connection: set **Platform type = GPSWOX**, **Platform API address** = `https://<your platform>/api`, the service account email and password (only the Owner sees these), and the platform web address for the links. Press **Test connection**.
3. Mode **Dry run**. Work for a day. Open the Sync Queue: every row lists the exact platform calls that *would* be made. Nothing is sent.
4. Test once against a **staging copy** of the platform (or one throw-away tracker): mode **Live**, install one tracker, check the device in GPSWOX (name, plate, SIM, expiry).
5. Only then use Live on the production platform. Switch the mode back to Dry run at any time to stop sending.

To try without a platform: `python3 integration-layer/mock_gpswox.py 8091`, API address `http://127.0.0.1:8091/api`, service account `svc@itrackzen.net` / `pw`.

## Existing data

Trackers already in GPSWOX are **found by IMEI and adopted** (edited, never duplicated). Import your existing customers and vehicles into the management system first; the first sync of each installed tracker then links it.
Nothing is deleted in GPSWOX by this connection: removing a vehicle or returning a tracker does not delete the device there.

## Links between the two systems

Fill in the page templates (Platform web address, customer, vehicle, device, live map links) with your GPSWOX addresses; the placeholders `{base} {id} {imei} {plate}` are available. The right paths depend on your GPSWOX version, so they are left for you to confirm on a real object page.
GPSWOX also offers `POST /api/one_time_token` (sign-in link for a user); using it to open GPSWOX without a second sign-in is possible but is **not** built yet.

## Not done yet

* Receiving GPSWOX alerts in the management system. GPSWOX alerts can notify a web address (webhook); the management system already has a signed receiving address (`/itz/platform/webhook`), but GPSWOX's payload format and signing have not been checked against your platform.
* Creating GPSWOX groups, sensors, geofences or alert rules.
* The real platform: nothing here has been run against it.
