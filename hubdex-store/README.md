# Hubdex Store – Coming Soon website

PHP coming-soon website for **Hubdex Store** (Hubdex Store LTD), built for Hostinger shared hosting.
It needs no database: PHP 7.4+ (8.x recommended), HTML, CSS and vanilla JavaScript.

## Upload to Hostinger

1. In hPanel open **Files → File Manager → `public_html`**.
2. Upload the **contents** of this folder (not the folder itself) into `public_html`. You can upload
   `hubdex-store-upload.zip` from the repository root and use **Extract** instead.
   Make sure hidden files (`.htaccess`) are included.
3. In hPanel, make sure **SSL** is active for the domain. `.htaccess` forces HTTPS and removes `www`.
4. Open your domain and check every page.

## Before going live: set your domain

The site assumes the domain `https://hubdexstore.com`. If yours is different, replace it in **3 places**:

| File | What to change |
|------|----------------|
| `includes/config.php` | `SITE_URL`, plus the e-mail addresses |
| `robots.txt` | the `Sitemap:` line |
| `sitemap.xml` | every `<loc>` URL |

Other settings in `includes/config.php`: launch date (`LAUNCH_DATE`), phone, address,
social media links (replace `#` with real URLs; real links are added to the Google structured data automatically).

## Get it on Google

1. Add the domain to [Google Search Console](https://search.google.com/search-console) and verify it
   (DNS TXT record in Hostinger hPanel → DNS Zone).
2. Submit `https://yourdomain/sitemap.xml` under **Sitemaps**.
3. Use **URL Inspection → Request indexing** for the home page and the about page.
4. Create social profiles named "Hubdex Store" and link them in `config.php` – this helps Google connect
   the brand name to your site. Ranking for a brand name usually takes days to a few weeks after indexing.

## Forms

- **Notify Me** (`subscribe.php`) and the **contact form** (`contact.php`) validate input, use CSRF tokens,
  a honeypot field and a simple rate limit.
- Submissions are saved to `data/subscribers.csv` and `data/messages.csv`. The `data/` folder is
  blocked from the web by `.htaccess`; download the files with File Manager.
- To also get e-mails: create a mailbox in Hostinger (e.g. `no-reply@yourdomain`), set `MAIL_FROM` to it and
  `MAIL_ENABLED` to `true` in `config.php`.
- To connect a CRM, mailing service or database later, edit `handle_contact_submission()` at the top of
  `contact.php` and the saving step in `subscribe.php`.

## Structure

```
index.php        Home / Coming soon (countdown, Notify Me)
about.php        About Hubdex Store
contact.php      Contact form + handler
privacy.php      Privacy Policy
terms.php        Terms and Conditions
sitemap.php      HTML sitemap
404.php          Not-found page (noindex)
subscribe.php    Notify Me handler
robots.txt / sitemap.xml / site.webmanifest / .htaccess
includes/        config.php, functions.php, header.php, footer.php (blocked from the web)
assets/          css/style.css, js/main.js, img/ (logo, favicons, og-image.png)
data/            form submissions (blocked from the web)
```

Every page has its own title, description, keywords, canonical URL, Open Graph and Twitter tags, and
schema.org JSON-LD (Organization/OnlineStore, WebSite, WebPage, BreadcrumbList), all generated in `includes/header.php`.

After editing CSS/JS, bump `ASSET_VERSION` in `config.php` so browsers load the new files.
