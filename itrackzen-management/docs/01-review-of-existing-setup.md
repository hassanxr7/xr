# 01. Review of the existing ITrackZen setup

Written before the build, updated afterwards. It separates **what was verified** from **what is assumed**, because the tracking
platform itself could not be reached while building.

## What exists

| Part | What it is | Where | Verified? |
|---|---|---|---|
| **Marketing website** | PHP 8 site for ITrackZen / LibDex, 13+ pages, contact forms, FAQ, SEO pages for six countries, Privacy Policy, Terms, public **Account and Data Deletion** page for Google Play, admin area with content editor, media, brand, enquiries, deletion requests | `itrackzen-website/`, hosted on Hostinger shared hosting (itrackzen.net) | Yes. Built and tested earlier in this project |
| **Tracking platform** | The live SaaS where customers log in and see vehicles on the map. Client login `itrackzen.com/authentication/create`, demo `itrackzen.com/demo` | itrackzen.com | **No.** The address is blocked from the build environment, so no API documentation, database or screens could be reviewed |
| **Mobile apps** | iOS app "ItrackZen" (seen in App Store Connect) and the Android app | App stores | Only the name and icon were seen |
| **Business processes** (quotes, stock, installs, payments, renewals) | Described in your brief; no existing system was shared | n/a | Taken from the brief |

## What this means for the integration

The management system never writes to the tracking platform's database and never changes how live tracking works.
It talks to the platform only through a **dedicated integration layer** (an HTTPS API that you or the platform's developer
switch on), and the connection ships **switched off**. Until it is connected, every link between the two systems is
optional: staff can still work fully in the management system. See [integration-contract](integration-contract.md).

## Gaps found in the current way of working (the reasons for this system)

1. Quotations, stock, installations and payments live in different places, so the same customer or device is typed several times.
2. No single record connects *customer -> vehicle -> tracker IMEI -> SIM -> installer -> invoice -> subscription*.
3. No control over who can change stock, approve a discount or see money.
4. Renewals depend on someone remembering; expired customers are noticed late.
5. The website enquiry form emailed the team but did not create anything anyone could follow up.
6. No audit trail for stock movements, payments and permission changes.

## Things only you can provide (open items)

| # | Needed | Why | Blocks |
|---|---|---|---|
| 1 | Tracking platform **API documentation**, a test account and a staging copy (or a developer to build the small integration layer, spec in [integration-contract](integration-contract.md)) | To switch the connection from simulator to live | Live link only |
| 2 | The platform's **page addresses** for a customer, a vehicle and the live map | The "Open in tracking platform" buttons | Buttons only |
| 3 | Your **approved prices** for hardware, installation and plans | Nothing is invented; products are entered by staff | Go-live |
| 4 | Your real **product list** (brands, models, suppliers) and opening **stock with IMEIs and SIM numbers** | Opening stock import | Go-live |
| 5 | Your **customer and vehicle list** (and which are already on the platform) | Import | Go-live |
| 6 | **Payment instructions** (bank, mobile money) and tax rules per country | Printed on invoices | Go-live |
| 7 | A **VPS** (Ubuntu 24.04, 4 GB RAM or more) and DNS for `manage.itrackzen.net` | Hosting | Go-live |
| 8 | Staff list with roles | Sign-ins | Go-live |
| 9 | Decision on **how customers pay** online (today: manual recording only) | Automatic payment integrations are a separate project | Optional |
