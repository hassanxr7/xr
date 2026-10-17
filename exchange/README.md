<p align="center"><img src="assets/img/logo.svg" alt="Hufan Exchange" width="420"></p>

# Hufan Exchange — Money Exchange Platform

A complete web platform for exchanging **EVC Plus → MoneyGo**, **EVC Plus → USDT (TRC20 / BEP20)** and **EVC Plus → PayPal**.
It includes **printable account statements and receipts** (A4, "Save as PDF"), a full admin panel, and runs as-is on **Hostinger Shared Hosting** (plain PHP + MySQL — no Node.js, Composer or SSH needed).

Interface languages: **English (default)** and Somali — visitors can switch with the EN/SO button.

---

## Features

**Customers**
- Live exchange calculator: enter what you send → see what you receive (fee, rate, limits, reserve). Works both ways.
- Sign up with phone number + password, log in, profile, change password.
- Create an order → get EVC payment instructions: the number to pay, the amount, and a one-tap **USSD code** (`*712*61xxxxxxx*100#`).
- Submit the **Transaction ID** from the EVC SMS (plus an optional screenshot).
- Payment window (default 60 minutes); unpaid orders expire automatically.
- Dashboard with all orders, status progress and order history.
- **Printable account statement** — choose a period (this month, last month, 3 months, this year, all time), print or save as PDF.
- **Printable receipt** for every order.
- Track an order by order number + phone.

**Admin**
- Dashboard: orders to review, today's volume and fees, 7-day chart, reserves.
- Orders: filter (status, pair, date, search), view payment screenshot, process / complete / reject, record the payout TXID, message the customer, internal notes, **CSV export** (Excel).
- Rates & pairs: rate, fee (% + fixed), min/max; add new directions (e.g. USDT → EVC).
- Payment methods: EVC Plus, MoneyGo, USDT TRC20, USDT BEP20, PayPal — your receiving number/address, USSD template, logo, colour, wallet format check (regex), **reserve**.
- Reserves update automatically when an order is completed (and are restored if it is re-opened).
- Customers: search, order history, **print their statement**, block/unblock, reset password.
- **Printable business report**: period, status, pair — totals, fees, per-pair breakdown and transaction list.
- Settings: name, logo, brand colour, contact details, WhatsApp, announcement bar, payment window, terms, statement footer note, default language.
- **Telegram notifications** when a new order arrives or a customer pays.
- Multiple admin accounts.

**Security**: bcrypt password hashing, CSRF token on every form, PDO prepared statements, login throttling, payment screenshots stored privately (served only to the owner/admin), `.htaccess` rules that block `app/`, `install/schema.sql` and any script inside `uploads/`.

**Real-time payments**: optionally, any payment method can skip manual Transaction ID verification. [WaafiPay](#waafipay-api--real-time-evc-plus-payments) gives EVC Plus customers an instant PIN-prompt confirmation; [SovaMoney](#sovamoney-api--real-time-hosted-checkout) and [Nebdex](#nebdex-api--evc-plus-zaad-sahal--more) (EVC Plus, ZAAD, Sahal and more) send customers to a hosted checkout page with automatic webhook confirmation. Methods without any of these configured keep the manual verification flow described above.

---

## Requirements

- PHP **8.1** or newer (8.2 / 8.3 recommended)
- **No database setup needed**: by default the installer creates the database automatically (an SQLite file in `app/storage/`).
  MySQL 5.7+ / MariaDB 10.3+ is supported as an optional alternative.
- PHP extensions: `pdo_sqlite` (or `pdo_mysql`), `mbstring`, `curl` (Telegram), `gd`/`fileinfo` — all enabled on Hostinger by default.

---

## Installing on Hostinger (step by step)

### 1. Prepare the files
Use the ready-made **`hufan-exchange.zip`**, or build it yourself: open the `exchange` folder, select **everything inside it** (`admin`, `app`, `assets`, `install`, `uploads`, `index.php`, `.htaccess` …) and compress it to a ZIP.
> Make sure `.htaccess` is included — it is a hidden file. Windows: View → Show hidden items. macOS: `Cmd + Shift + .`

### 2. Upload
1. hPanel → **Files → File Manager** → open **`public_html`**.
2. Delete default files such as `default.php` if present.
3. **Upload** `hufan-exchange.zip` → right-click → **Extract** into `public_html`.
4. Check that `index.php`, `admin/`, `app/` … are directly inside `public_html/` (not `public_html/hufan-exchange/`).
   > Installing in a sub-folder (e.g. `yourdomain.com/exchange/`) also works — the path is detected automatically.

### 3. Choose the PHP version
hPanel → **Advanced → PHP Configuration** → select **PHP 8.2** (or 8.1 / 8.3) → Save.

### 4. Run the installer
1. Open **`https://yourdomain.com`** — you are sent to the installer automatically.
2. Keep **Database → Automatic** selected (the database is created for you), then fill in your business name, the **EVC Plus number** customers pay to, WhatsApp, and the admin account (password 8+ characters).
   > Prefer MySQL? Open *Advanced: use a MySQL database instead* and enter the database created in hPanel → Databases.
3. Click **Install now**.
4. For security, **delete the `install/` folder** in File Manager (the installer also locks itself).

### 5. SSL (HTTPS)
hPanel → **Security → SSL** → make sure SSL is active, then turn on **Force HTTPS**
(or remove the `#` signs in the "Force HTTPS" block of `.htaccess`).

✅ Done: website `https://yourdomain.com` · admin `https://yourdomain.com/admin/`

---

## After installing — important settings

1. **Admin → Payment methods → EVC Plus**: check *Account customers pay into* (your EVC number) and the *Account name*. Default USSD template: `*712*{to}*{amount}#`.
2. **Admin → Rates & Pairs**: set your rates and fees. Formula:
   - `Fee = amount × % + fixed fee`
   - `Received = (amount − fee) × rate`
   - Example: EVC → USDT, rate 1, fee 3% → $100 = 97.00 USDT
   - The seeded fees (MoneyGo 2%, USDT 3%, PayPal 6%) are examples only.
3. **Reserves**: enter how much USDT / MoneyGo / PayPal you actually hold. Orders larger than the reserve are refused.
4. **Settings**: logo (optional — the Hufan logo is used by default), colour, phone, WhatsApp (e.g. `252615551234`), address, terms, statement note.
5. **Telegram (optional)**: in Telegram open `@BotFather` → `/newbot` → copy the token. Send your bot a message, get your chat ID from `@userinfobot`, enter both → *Send test*.
6. **Reverse directions** (e.g. USDT → EVC): first enter your receiving address for that method under Payment methods, then activate the pair under Rates & Pairs.

> Payments are verified manually: the admin checks the EVC SMS, sends the USDT / MoneyGo / PayPal, then marks the order *Completed* with the payout TXID. The system does not connect to EVC, wallets or PayPal automatically.

---

## WaafiPay API — real-time EVC Plus payments

By default the EVC Plus → anything flow is manual: the customer pays by USSD and types in the Transaction ID, then the admin checks it. You can switch EVC Plus to **instant** verification using the [WaafiPay API](https://docs.waafipay.com/quickstart):

1. Get a WaafiPay merchant account and your **Merchant UID**, **API User ID** and **API Key** from WaafiPay (or your aggregator). Ask for sandbox credentials first to test.
2. **Admin → Settings → WaafiPay**:
   - Tick **Enable real-time WaafiPay payments**.
   - Choose **Sandbox** while testing, **Live** once you have production credentials.
   - Pick the **payment method to charge in real time** — normally *EVC Plus*.
   - Enter the Merchant UID, API User ID and API Key, then **Save settings**. The API Key field is always shown blank; leave it empty on later saves to keep the key you already entered.
3. That's it — on the order page, a customer paying with that gateway now sees a **"Pay instantly with WaafiPay"** button. Tapping it sends a PIN prompt to their phone; once they approve it, the order moves straight to *Processing* with no Transaction ID to type. A **"Pay manually instead"** link stays available as a fallback (e.g. if the API is unreachable or the customer prefers USSD).

Notes:
- The server calls WaafiPay directly over HTTPS (`cURL`) and waits for the customer's approval, which can take up to a minute — make sure your host's PHP `max_execution_time` isn't capped below ~90 seconds for this to work reliably.
- If the WaafiPay call fails or times out, the order simply stays "Awaiting payment" and the customer can retry or fall back to the manual Transaction ID form — nothing is charged twice.
- Every attempt (success or failure) is recorded in the order's history for the admin to review.

---

## SovaMoney API — real-time hosted checkout

[SovaMoney](https://sovamoney.com/api/documentation) is a hosted checkout: instead of a PIN prompt, the customer is redirected to SovaMoney's own secure payment page, then brought back once they're done. It can be used for any gateway (bank transfer, card, wallet — whatever payment methods your SovaMoney account supports), independently from WaafiPay.

1. Get your **Public Key** and **Secret Key** from your SovaMoney merchant dashboard (Dashboard → API Key). Use sandbox mode first to test — it doesn't touch live money.
2. **Admin → Settings → SovaMoney**:
   - Tick **Enable real-time SovaMoney payments**.
   - Choose **Sandbox** while testing, **Live** once ready.
   - Pick the **payment method to check out with SovaMoney** (e.g. PayPal, or any gateway you want to automate).
   - Enter the Public Key and Secret Key, then **Save settings**. The Secret Key field is always shown blank; leave it empty on later saves to keep the key already entered.
3. On the order page, a customer paying with that gateway now sees a **"Pay with SovaMoney"** button (it asks for their email, used for the SovaMoney receipt). Tapping it sends them to SovaMoney's checkout page; once they pay, SovaMoney confirms it automatically in the background and the order moves straight to *Processing*.

Customers can also **send from SovaMoney** (SovaMoney → EVC Plus / ZAAD / eDahab / Sahal): orders sent from the SovaMoney wallet always pay through SovaMoney checkout, whichever gateway is selected above. The EVC/ZAAD/eDahab/Sahal payout for those orders is sent by you, then mark the order *Completed*.

### Automatic payouts to SovaMoney (receive side)

Customers can also **receive** SovaMoney (e.g. send EVC Plus → receive SovaMoney). With the Merchant Payout API (U-ID version) the money goes from your SovaMoney merchant wallet to the customer's wallet automatically:

1. **Admin → Settings → SovaMoney → SovaMoney payout**: tick **Send SovaMoney payouts to customers automatically** (uses the same Public Key). Payouts always go to https://sovamoney.com (real money — the payout API has no sandbox); leave *Payout API base URL* empty unless SovaMoney gives you a different address. Use **Test a SovaMoney U-ID** to check the connection: it shows SovaMoney's exact reply (e.g. "Invalid api key." or HTTP 404 if the payout API isn't enabled on the merchant account).
2. At checkout the customer enters their **SovaMoney U-ID** (e.g. `U827389`, or their username/mobile). The site checks it with SovaMoney and shows the wallet name ("SovaMoney: John Doe (U827389)") before the order can be created.
3. As soon as the customer's payment is confirmed (Nebdex / WaafiPay / SovaMoney checkout), `receive_amount` is sent to that U-ID with the order number as `reference`, and the order is marked **Completed** with SovaMoney's Trx as the payout reference.
4. Keep enough balance in your merchant wallet. If a payout fails (e.g. *insufficient balance*), no money moves, the order stays *Processing*, you get a Telegram alert, and **Admin → Orders → (order) → SovaMoney payout** has a **Retry** button.
5. If SovaMoney's reply is lost (timeout / broken response), the payout is marked **Unknown** and never retried automatically — check your SovaMoney merchant history first; retrying asks for confirmation.

Every order can be paid out at most once (a unique database key per order), so duplicate webhooks or double clicks can't pay a customer twice.

Notes:
- Confirmation happens through a signed webhook (`sovamoney_ipn.php`) that SovaMoney calls directly — no need to add anything in your SovaMoney dashboard unless it explicitly asks for an IPN URL (shown under Admin → Settings → SovaMoney once configured).
- The webhook verifies SovaMoney's HMAC-SHA256 signature before touching any order, so it can't be spoofed by a third party.
- The browser redirect to SovaMoney's checkout (`success_url`/`cancel_url`) is only for the customer's convenience — the actual payment confirmation always comes from the signed webhook, so refreshing or closing the tab mid-payment doesn't lose the result.

---

## Nebdex API — EVC Plus, ZAAD, Sahal & more

[Nebdex](https://nebdex.com/api-documentation) is another hosted-checkout aggregator, the same shape as SovaMoney, but its exact list of payment methods (`evc`, `zaad`, `edahab`, `WaafiPay`, and others) is specific to your merchant account rather than fixed, and a single gateway can be reachable through more than one Nebdex channel at once — e.g. EVC Plus can be paid through Nebdex's own `evc` method *and* its `WaafiPay` method, shown as two separate buttons.

1. Get your **Public Key** and **Secret Key** from your Nebdex merchant dashboard (`nebdex.com/merchant/login` → Setting → Api Key). Nebdex's dashboard doesn't display your **Merchant ID** anywhere in its UI — save your Public Key first, then use the **"Fetch merchant ID & methods"** button described below to find it.
2. If you want ZAAD or eDahab as separate payment options on your site and they don't exist yet, add them first under **Admin → Gateways** (give each a name, currency, account label, etc. — same as any other gateway).
3. **Admin → Settings → Nebdex**:
   - Tick **Enable real-time Nebdex payments**.
   - Enter the Public Key and Secret Key, and save.
   - Click **"Fetch merchant ID & methods"** — it calls Nebdex's `/api/payment-methods` with your saved Public Key and shows your real Merchant ID plus every method your account supports (name, currency, `method_code`, limits). **It also auto-adds a method row for anything it can confidently match to one of your gateways** by name (`evc` → your EVC Plus gateway, `zaad` → a ZAAD gateway if you've added one, `edahab` → eDahab, and `WaafiPay` → EVC Plus, since it's another route to the same network). You'll see which ones were added, which were already there, and which it couldn't match (e.g. `Momo MTN`, `jeeb` — these aren't Somalia mobile-money methods this app models, so add a gateway for them yourself first if you actually want to use one). Copy the Merchant ID into the field above and save again.
   - The imported methods appear right there in the same Nebdex card, grouped under each gateway's name — review them, or add/remove rows by hand (a short label like `evc`/`WaafiPay` and a `method_code`). A gateway can have as many rows as you like; each becomes its own "Pay via Nebdex" button on the order page. A gateway with no rows stays on manual verification.
   - Copy the **Nebdex IPN URL** shown on the page and paste it into your Nebdex merchant dashboard's webhook/callback setting — Nebdex's API has no per-request field for this, it's configured once on their side.
4. On the order page, a customer paying with a mapped gateway sees one **"Pay with ‹gateway› via Nebdex (‹label›)"** button per configured method (asking once for their email). Tapping one sends them to Nebdex's checkout for that specific method; once paid, Nebdex confirms it via the signed webhook (`nebdex_ipn.php`) and the order moves to *Processing*.

Notes:
- Nebdex's own documentation states its callback signature covers only the order ID, not the amount — so `nebdex_ipn.php` never trusts the amount from the webhook payload; it always credits the order's own stored amount, and verifies the HMAC-SHA256 signature (uppercase, order ID + your secret key) before touching anything.
- Nebdex's published docs don't mention a sandbox endpoint or a payment-status lookup API — test with small real amounts, and keep an eye on orders that don't get confirmed (the admin Orders page always lets you complete one manually from the EVC/ZAAD/eDahab SMS as a fallback).
- Several gateways and providers can have real-time verification active at once (e.g. WaafiPay direct on EVC Plus, plus Nebdex's `evc` and `WaafiPay` channels on the same gateway) — each gateway only shows the provider(s)/method(s) actually configured for it.
- Updating from an earlier version: if you'd already set a single `method_code` per gateway, it's migrated automatically (as a method labelled "Default") the first time you load Admin → Settings after updating — nothing is lost, you can just add more methods or rename it.

---

## Order flow

```
Customer: create order ─► Awaiting payment ─► (submits Transaction ID) ─► Verifying
Admin:    check the EVC payment ─► Processing ─► send USDT/MoneyGo/PayPal ─► Completed (enter TXID)
```
- Not paid within the window (default 60 min) → **Expired**.
- Admin can also **Reject** (a reason is required) or **Cancel**.

---

## Printing (statement / receipt / report)

| Document | Where |
|---|---|
| Customer statement | Customer: menu → **Statement** · Admin: Customers → 🖨 |
| Order receipt | Order page → **Print receipt** |
| Business report | Admin → **Reports** (or Orders → *Print report*) |

Click **Print / PDF** → choose *Save as PDF* to keep a PDF copy. Tip: enable **"Background graphics"** in the print dialog so colours print.

---

## Brand assets

| File | Use |
|---|---|
| `assets/img/logo.svg` | Horizontal logo for light backgrounds |
| `assets/img/logo-white.svg` | Horizontal logo for dark backgrounds |
| `assets/img/logo-mark.svg` | App icon / mark (also the favicon) |
| `assets/img/icon-512.png`, `apple-touch-icon.png` | PNG icons (social preview, phone home screen) |
| `assets/img/brand/hufan-logo.png`, `hufan-logo-white.png`, `hufan-icon-1024.png` | High-resolution PNGs for social media, flyers and WhatsApp profile |

Brand colours: emerald `#0e7c66` · mint `#1fc79a` · gold `#f5a524` · ink `#0f172a`.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| **500 Internal Server Error** | Check the PHP version (8.1+) and that `.htaccess` was uploaded correctly. |
| Blank page / unknown error | Set `'debug' => true` in `app/config.php` to see the error, then set it back to `false`. Also check `app/storage/error.log`. |
| "Could not create the database file" | `app/storage/` must be writable (`755`). |
| "Could not connect to the database" (MySQL mode) | Re-check database name, user and password (hPanel → Databases). Host is `localhost`. |
| Images will not upload | `uploads/` and `app/storage/` must be writable (`755`). |
| Forgot the admin password | Delete `app/storage/installed.lock` and `app/config.php`, open `/install/` again and use the same admin username with a new password. Your data is kept. |
| Wrong time | Admin → Settings → Timezone (`Africa/Mogadishu`). |

**Backups**: hPanel → Files → Backups. With the automatic database, also download `app/storage/database.sqlite` weekly (File Manager → right-click → Download). With MySQL use phpMyAdmin → Export.

**Updating to a new version**: upload the new ZIP and extract it over the old files. Never delete `app/config.php` or the `app/storage/` folder — they hold your settings, database and payment screenshots.

---

## Project structure

```
exchange/
├── index.php          Home page + calculator
├── exchange.php       Create an order
├── order.php          Order details + payment
├── account.php        Customer dashboard
├── statement.php      Printable statement
├── receipt.php        Printable receipt
├── track.php          Track an order
├── sovamoney_ipn.php  SovaMoney payment webhook (signed, no login required)
├── nebdex_ipn.php     Nebdex payment webhook (signed, no login required)
├── login.php · register.php · profile.php · logout.php · terms.php · proof.php
├── admin/             Admin panel (dashboard, orders, pairs, gateways, customers, reports, settings, admins)
├── app/               Application code (blocked from the web by .htaccess)
│   ├── bootstrap.php · helpers.php · config.php (created by the installer)
│   ├── lang/en.php · lang/so.php
│   ├── views/         Layouts and printable document templates
│   └── storage/       Payment screenshots, error.log
├── assets/            CSS, JS, logo and icons
├── uploads/           Uploaded logos (scripts cannot run here)
└── install/           Web installer (delete after installing)
```

Texts can be edited in `app/lang/en.php` and `app/lang/so.php`.

---

## Hage kooban (Soomaali)

1. File Manager → `public_html` → soo geli `hufan-exchange.zip` → **Extract**.
2. hPanel → PHP Configuration → dooro **PHP 8.2**.
3. Fur `https://domainkaaga.com` → installer-ka ayaa furmaya. **Database: Automatic** ha ahaato (database-ka si toos ah ayaa loo sameeyaa — hPanel wax kama samaynaysid). Geli magaca shirkadda, lambarkaaga EVC iyo akoonka admin-ka → **Install now**.
4. Tirtir galka `install/`, kadib shid **SSL → Force HTTPS**.
5. Admin → *Rates & Pairs* → hagaaji khidmadaha; *Payment methods* → geli kaydkaaga (reserve).
6. Kayd (backup): toddobaad kasta soo deji `app/storage/database.sqlite`. Marka aad cusbooneysiinayso, ha tirtirin `app/config.php` iyo galka `app/storage/`.

Luqadda Soomaaliga waxaa laga doortaa badhanka **SO** ee website-ka, ama Admin → Settings → Default language.
