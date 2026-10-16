# ITrackZen website (LibDex Ltd)

Corporate GPS tracking and fleet management website for **ITrackZen – LibDex Logistics Solution**.
PHP 8+ with a built-in SQLite database (MySQL optional). No build step, no Composer. Runs on Hostinger shared hosting, cPanel or a VPS.

## What is included

| Area | Details |
|---|---|
| Pages | Home, About, GPS Tracking Services, Fleet Management, AI Dashcam & Video Telematics, Supported GPS Trackers (searchable), Solutions, Pricing, Demo, Contact Sales, FAQ, Privacy Policy, Terms, plus Blog, Account & Data Deletion, 6 country pages (Somalia, Kenya, Uganda, Ethiopia, South Sudan, DR Congo) |
| Forms | Contact Sales, Demo and Deletion forms. Delivered to `info@libdexltd.com` and `sales@itrackzen.net`, and logged in the admin panel |
| SEO | Titles, descriptions and Open Graph per page, canonical URLs, JSON-LD (Organization, LocalBusiness, WebSite, SoftwareApplication, Service, FAQPage, BreadcrumbList, BlogPosting), dynamic `sitemap.xml`, `robots.txt`, clean URLs |
| Admin | `/admin/` manages content, plans, SEO, enquiries, deletion requests, brand assets and media |
| Tracking | Google Analytics 4 / Tag Manager, Meta (Facebook) Pixel, Tawk.to live chat, WhatsApp floating button, cookie consent |

## Deploy on Hostinger (shared hosting)

1. **Domain + SSL.** hPanel: add the website domain (assumed `itrackzen.net`), enable free SSL. The included `.htaccess` forces HTTPS.
2. **PHP.** hPanel > Advanced > PHP Configuration: PHP **8.1+**, with `pdo_sqlite` (or `pdo_mysql`), `mbstring`, `fileinfo`, `gd`, `curl` enabled (all default on Hostinger).
3. **Upload.** File Manager > `public_html`: upload `itrackzen-website.zip` and Extract so `index.php`, `.htaccess`, `assets/`, `data/` sit directly in `public_html`.
4. **Mailbox.** hPanel > Emails: create `no-reply@itrackzen.net` (or use `sales@`).
5. **Private settings.** In `includes/`, copy `config.local.php.sample` to `config.local.php` and fill in SMTP user/password and a long random `ADMIN_SETUP_KEY`.
6. **Admin.** Open `/admin/`, enter the setup key, create the owner username and password.
7. **Database.** Nothing to do: a SQLite database (`data/itrackzen.sqlite`) is created on first visit and is blocked from web access. To use MySQL, create a database in hPanel and set `DB_DSN`, `DB_USER`, `DB_PASS` in `config.local.php`.
8. **Settings.** Admin > Content > Site settings: WhatsApp number, phone, address (only if you want it shown), social links, analytics IDs, `platform` URLs (login, demo, register), `legal_jurisdiction`.
9. **Test** every form (contact, quote, demo, partnership) and a deletion request end to end, then check both inboxes.
10. **Search engines.** Submit `https://itrackzen.net/sitemap.xml` in Google Search Console.

Folders `data/` and `assets/uploads/` must be writable by PHP (755, or 775 if saves fail). Back up `data/itrackzen.sqlite` regularly (File Manager download, or hPanel backups).

## Roles in the admin
- **owner**: everything, including users and the activity log.
- **editor**: content, SEO, media, brand assets.
- **support**: enquiries and deletion requests only.

## Platform links
`Client Login` and `Try the Demo` point to the tracking platform URLs set in Site settings > `platform`. The `register_url` is empty until the platform's customer registration page is confirmed; the Register button stays hidden until you set it. Website forms never create tracking accounts and say so.

## Account deletion
See `docs/ACCOUNT-DELETION.md`.

## Images
The site ships with vector illustrations only. Add photos in Admin > Media (auto-compressed to WebP), then paste the path into an `image` field (home hero / banner, industries, countries, feature pages, blog) and fill in the `image_alt` text. Use only photos you own or that are licensed for commercial use, and keep credits where the licence requires them.

## Editing content
- **Admin panel** (`/admin/`): forms for every section, Raw JSON mode, full version history with restore.
- **Tracker list:** Admin > Supported trackers > each brand has a `models` box, one per line. Add tags in brackets: `FMB920 [moto,asset]`. Tags: `4g 3g obd moto asset fuel cam truck personal ble`.
- **Pricing:** Admin > Pricing & plans (price label, unit, features, comparison table).
- **Images:** Admin > Media, upload, then paste the path (for example `/assets/uploads/hero.jpg`) into the `image` field of the Home hero or a blog post.
- **Hero video:** set `hero_video_url` in Site settings to an `.mp4`, YouTube or Vimeo link to add a "Watch overview video" button to the product tour.

## Security notes
- `data/`, `includes/` and `pages/` are blocked from the web by `.htaccess`. Do not remove those rules.
- Admin uses hashed password, CSRF tokens, login throttling and secure cookies. Uploads accept images only and cannot execute scripts.
- Forms use a honeypot, signed time token and per-IP rate limit.
- SMTP password lives only in `includes/config.local.php`. Never commit or share that file.

## Local preview
```
cd itrackzen-website
php -S 127.0.0.1:8080 -t public_html tools/dev-router.php
```

## Legal pages
`Privacy Policy` and `Terms and Conditions` are written to meet app store requirements (data collected, location use, deletion route, contact). Have a lawyer review them for your jurisdiction before submitting your apps, and set the correct governing law in Site settings.
