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

---

## Requirements

- PHP **8.1** or newer (8.2 / 8.3 recommended)
- MySQL 5.7+ or MariaDB 10.3+
- PHP extensions: `pdo_mysql`, `mbstring`, `curl` (Telegram), `gd`/`fileinfo` — all enabled on Hostinger by default.

---

## Installing on Hostinger (step by step)

### 1. Prepare the files
Use the ready-made **`hufan-exchange.zip`**, or build it yourself: open the `exchange` folder, select **everything inside it** (`admin`, `app`, `assets`, `install`, `uploads`, `index.php`, `.htaccess` …) and compress it to a ZIP.
> Make sure `.htaccess` is included — it is a hidden file. Windows: View → Show hidden items. macOS: `Cmd + Shift + .`

### 2. Create a database
1. hPanel → **Websites → Manage → Databases → MySQL Databases**.
2. Enter a database name, user and a strong password → **Create**.
3. Note the **database name**, **username** and **password** (they look like `u123456789_hufan`). The host is `localhost`.

### 3. Upload
1. hPanel → **Files → File Manager** → open **`public_html`**.
2. Delete default files such as `default.php` if present.
3. **Upload** `hufan-exchange.zip` → right-click → **Extract** into `public_html`.
4. Check that `index.php`, `admin/`, `app/` … are directly inside `public_html/` (not `public_html/hufan-exchange/`).
   > Installing in a sub-folder (e.g. `yourdomain.com/exchange/`) also works — the path is detected automatically.

### 4. Choose the PHP version
hPanel → **Advanced → PHP Configuration** → select **PHP 8.2** (or 8.1 / 8.3) → Save.

### 5. Run the installer
1. Open **`https://yourdomain.com/install/`**
2. Fill in the database details, your business name, the **EVC Plus number** customers pay to, WhatsApp, and the admin account (password 8+ characters).
3. Click **Install now**.
4. For security, **delete the `install/` folder** in File Manager (the installer also locks itself).

### 6. SSL (HTTPS)
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
| "Could not connect to the database" | Re-check database name, user and password (hPanel → Databases). Host is `localhost`. |
| Images will not upload | `uploads/` and `app/storage/` must be writable (`755`). |
| Forgot the admin password | Delete `app/storage/installed.lock` and `app/config.php`, open `/install/` again and use the same admin username with a new password. Your data is kept. |
| Wrong time | Admin → Settings → Timezone (`Africa/Mogadishu`). |

**Backups**: hPanel → Files → Backups, or phpMyAdmin → Export, weekly.

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

1. hPanel → Databases → samee database MySQL ah (magac, user, password).
2. File Manager → `public_html` → soo geli `hufan-exchange.zip` → **Extract**.
3. hPanel → PHP Configuration → dooro **PHP 8.2**.
4. Fur `https://domainkaaga.com/install/` → geli xogta database-ka, lambarkaaga EVC iyo akoonka admin-ka → **Install now**.
5. Tirtir galka `install/`, kadib shid **SSL → Force HTTPS**.
6. Admin → *Rates & Pairs* → hagaaji khidmadaha; *Payment methods* → geli kaydkaaga (reserve).

Luqadda Soomaaliga waxaa laga doortaa badhanka **SO** ee website-ka, ama Admin → Settings → Default language.
