# ITrackZen website (LibDex Ltd)

Corporate GPS tracking and fleet management website for **ITrackZen – LibDex Logistics Solution**.
Plain PHP 8+ and JSON files. No database, no build step, no Composer. Runs on Hostinger shared hosting, cPanel or a VPS.

## What is included

| Area | Details |
|---|---|
| Pages | Home, About, GPS Tracking Services, Fleet Management, AI Dashcam & Video Telematics, Supported GPS Trackers (searchable), Solutions, Pricing, Demo, Contact Sales, FAQ, Privacy Policy, Terms, plus Blog, Account & Data Deletion, 6 country pages (Somalia, Kenya, Uganda, Ethiopia, South Sudan, DR Congo) |
| Forms | Contact Sales, Demo and Deletion forms. Delivered to `info@libdexltd.com` and `sales@itrackzen.net`, and logged in the admin panel |
| SEO | Titles, descriptions and Open Graph per page, canonical URLs, JSON-LD (Organization, LocalBusiness, WebSite, SoftwareApplication, Service, FAQPage, BreadcrumbList, BlogPosting), dynamic `sitemap.xml`, `robots.txt`, clean URLs |
| Admin | `/admin/` edits all text, services, trackers, pricing, FAQ, SEO, legal pages and uploads images |
| Tracking | Google Analytics 4 / Tag Manager, Meta (Facebook) Pixel, Tawk.to live chat, WhatsApp floating button, cookie consent |

## Deploy on Hostinger (shared hosting) in 10 steps

1. **Domain and SSL.** In hPanel add `itrackzen.net` and turn on the free SSL (Security > SSL). The included `.htaccess` forces HTTPS.
2. **PHP version.** hPanel > Advanced > PHP Configuration: choose **PHP 8.1 or newer**. Make sure `fileinfo` and `mbstring` are ticked (they are by default).
3. **Upload.** hPanel > File Manager > `public_html`. Delete the default files, then upload `itrackzen-website.zip` (from `dist/`) and **Extract** it directly inside `public_html`. You should see `index.php`, `.htaccess`, `assets/`, `data/` right inside `public_html`. (Turn on "show hidden files" to see `.htaccess`.)
4. **Create the mailboxes.** hPanel > Emails: create `sales@itrackzen.net` and `no-reply@itrackzen.net` (or just use `sales@`). Keep the password.
5. **Private settings.** In `public_html/includes/` copy `config.local.php.sample` to `config.local.php` and edit it: SMTP user and password (host is already `smtp.hostinger.com`, port 465, `ssl`) and a long random `ADMIN_SETUP_KEY`.
6. **Receive on libdexltd.com.** Make sure `info@libdexltd.com` exists on its own mail host. The site sends to it from the itrackzen.net mailbox over SMTP, so no extra setup is needed on that domain.
7. **Create the admin login.** Open `https://itrackzen.net/admin/`, enter your setup key and choose a password (10+ characters).
8. **Fill in your details** in Admin > Site settings: `whatsapp` (digits with country code, e.g. `252611234567`), `phone`, address, `client_login_url`, `social` links, `app_links`, `analytics.ga4` (G-XXXXXXX), `analytics.fb_pixel`, `analytics.tawk`, and `legal_jurisdiction`.
9. **Test.** Submit the Contact Sales form. Check both inboxes. Failed mails show as FAILED in Admin > Inquiries and are never lost.
10. **Search engines.** In Google Search Console add the domain and submit `https://itrackzen.net/sitemap.xml`. Add a Google Business Profile for local SEO.

If your domain is not `itrackzen.net`, change `url` in Site settings and the `Sitemap:` line in `robots.txt`.

### Folder permissions
The folders `data/` and `assets/uploads/` must be writable by PHP (755 is normally enough on Hostinger; use 775 if saves fail).

## Editing content
- **Admin panel** (`/admin/`): forms for every section, one-click Raw JSON mode, automatic backups (last 15 per file) with restore.
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
