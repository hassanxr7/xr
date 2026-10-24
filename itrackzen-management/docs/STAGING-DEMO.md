# Staging demo

Load the demo data into a **separate** database (see INSTALL, section 8). It creates invented companies, vehicles, IMEIs, prices and nine staff accounts.
Everything goes through the real business rules, so the demo behaves like production.

All demo users share the password **`ITZ-demo-2026!`** (staging only; never use it in production).

| Person | Login | Role |
|---|---|---|
| Amina Owner | owner@demo.itrackzen.net | Owner / Super Admin |
| Omar Operations | ops@demo.itrackzen.net | Operations Manager |
| Sara Sales | sales@demo.itrackzen.net | Sales Officer |
| Ali Accounts | accounts@demo.itrackzen.net | Accountant / Cashier |
| Sahra Store | store@demo.itrackzen.net | Storekeeper |
| Tariq Technician | tech1@demo.itrackzen.net | Installation Technician |
| Tina Technician | tech2@demo.itrackzen.net | Installation Technician |
| Samir Support | support@demo.itrackzen.net | Customer Support |
| Rana Reader | viewer@demo.itrackzen.net | Read-only |

## What the demo data contains

Six customers (Kenya, Uganda, Somalia, South Sudan, Ethiopia) with 10 vehicles; 4 tracker/dashcam models and SIMs with 65 serial-numbered units (valid IMEIs);
six quotations at different stages (one waiting for approval, one draft, three installed and invoiced, one scheduled for tomorrow); a part-paid invoice, a fully paid invoice with receipt,
an overdue invoice; subscriptions (monthly, quarterly, yearly) with renewals due and renewal invoices; tasks including a collection task and overdue ones; two website enquiries and a deletion request that arrived from the website.

## Walk-through for the demonstration (about 20 minutes)

1. **Receive a tracker into stock.** Sign in as *Sahra Store* > Inventory > Receipts and Transfers > New: supplier receipt, product *Demo GPS Tracker (basic)*, type a new IMEI (try an existing one first: it is refused). Validate. Open Devices: status *Available*.
2. **Create a quotation.** *Sara Sales* > Sales > Quotations > New for *Addis Courier* (a draft exists): confirm tracker, installation and plan lines, set a **20 % discount** on the tracker. *Confirm* is hidden: approval is needed.
3. **Approve the sale.** *Sara* presses *Request approval*. Sign in as *Omar Operations* > Sales > Waiting for Approval: *Approve*. (Try approving as Sara: not allowed.)
4. **Confirm and assign a technician.** *Sara* confirms: an installation job and a subscription (*Waiting for installation*) appear. *Omar* opens the job: choose *Tina Technician*, a date, the IMEI and SIM, *Schedule*.
5. **Issue the equipment.** *Sahra* opens the job > *Issue equipment to technician*. The IMEI shows *Issued to technician*.
6. **Install on the vehicle.** *Tina* (on a phone-sized window) > Installations > My Jobs: *Start job*, add a photo, type the customer name under *Customer confirmation*, *Complete installation*. Try this *before* the equipment is issued: it is refused.
7. **Stock and records update.** The IMEI is *Installed* on the vehicle with warranty dates; the vehicle shows *Tracker installed*; stock moved from Tina's location to the customer; the subscription is *Active* with its renewal date; the device history shows the install.
8. **Invoice and payment.** *Ali Accounts* > Sales > the order > *Create Invoice* > confirm > *Register Payment* (part first, then the rest). Print the invoice and the receipt. Finance > Customer Statement for the customer.
9. **Renew the subscription.** Subscriptions > Renewals Due. Open one: the renewal invoice exists; register payment; the renewal date moves forward. (An unpaid one past its grace date becomes *Expired* and is restored by payment.)
10. **One workspace.** Open `/admin/` on the website as each user: *Sara* sees enquiries but not content; *Tariq* sees only his jobs; *Ali* sees finance tiles; the **Website** menu changes per role. Submit the public contact form and watch the enquiry arrive under *Sales > Website Enquiries*.

## Screenshots

See `docs/screenshots/` (website admin per role, management screens, the printed documents).
