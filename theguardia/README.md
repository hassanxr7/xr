<p align="center"><img src="assets/img/logo.svg" alt="The Guardia" width="420"></p>

# The Guardia — news website (theguardia.ca)

A complete, fast, SEO-ready news website with a newsroom dashboard. It runs on **Hostinger shared hosting** as-is: plain PHP 8.1+ and SQLite, so you don't need Node.js, Composer, SSH or a MySQL setup.

Dashboard languages: **English** and **Somali** (switch with the "Soomaali" button). → [Hage Soomaali](#hage-soomaali)

---

## What's included

**Public website**
- A calm newspaper design (masthead logo, Playfair/Source Serif typography, dark mode). It works on phones, tablets and desktops.
- Home page with lead stories, a "Breaking" banner, Latest, Most read and section blocks. Article pages have share buttons for Facebook, WhatsApp, X, Telegram, LinkedIn, email and copy-link, plus related stories, tags and author pages.
- 17 ready-made sections: Canada, World, U.S., Africa, Politics, **Courts & Justice**, with sub-sections **Sex Offender Cases**, Crime, Fraud & Corruption, Drugs, and National Security, plus Business, Technology, Health, Sports, Culture and Opinion.
- Search (full-text), an archive by year and month back to 2015, RSS feeds for the site and each section, and pages (About, Editorial standards, Corrections, Privacy, Terms, Advertise, Contact form).
- **Push notifications**: visitors can turn on breaking-news alerts in Chrome, Edge, Firefox, Samsung, Opera and Safari (iPhone when the site is added to the home screen).
- **Photo store for media outlets**: watermarked previews, Editorial / Commercial / Exclusive prices, Stripe Checkout (or licence requests), and private time-limited downloads of the original.

**SEO**
- NewsArticle, NewsMediaOrganization, WebSite+SearchAction, BreadcrumbList, CollectionPage and ProfilePage structured data, plus Open Graph, Twitter cards, canonical URLs and `max-image-preview:large` (for Google Discover).
- A sitemap index with article sitemaps of **up to 50,000 URLs each** (image entries included), a **Google News sitemap**, section/tag/page sitemaps, `robots.txt`, and **IndexNow** (Bing, Yandex and others are told about new stories instantly).
- 301 redirects when a URL changes, thin tag pages set to noindex, a page cache, WebP images with `srcset`, self-hosted fonts and almost no JavaScript.

**Newsroom dashboard** (`/admin/`)
- A story editor with formatting, images, YouTube embeds and a key-points box, a **live SEO score**, a Google preview, scheduling, breaking/featured flags and a "send push alert" option.
- **AI writing assistant (Claude)**: give it your notes and it writes a structured story with headline, subtitle, SEO title, meta description, slug, tags, a dateline and alternative headlines. It also lists the facts you must check. It never invents facts.
- **AI Newsroom with three agents**: Alex researches world news, Kristov Joi writes, and David Mario fact-checks and publishes. Together they publish 7–20 stories a day, and you can chat with them to assign topics ([details](#ai-newsroom)).
- **Analytics**: views and visitors by hour, day, month and year, plus countries, **cities**, **traffic sources** (Facebook, WhatsApp, Google, Google Discover/News, X, Telegram, TikTok …), referring sites, campaigns, devices, browsers, top stories and readers right now.
- **Advertising**: Google AdSense (publisher ID, automatic `ads.txt`, verification meta tag, Auto ads), ad units in 11 positions (header, in-article ×2, sidebar, lists, mobile sticky …), and directly sold banner campaigns with dates, rotation, impressions and clicks.
- **Imports** from official and openly licensed sources (see below), image library, sections, tags, pages, team accounts (writer / editor / admin), reader messages and an audit log.

**Security**: bcrypt passwords, CSRF tokens, prepared SQL statements, login throttling, an HTML sanitiser for every story, uploads re-encoded through GD, strict Content-Security-Policy, and `app/` plus the database blocked from the web.

---

## Install on Hostinger (step by step)

1. **hPanel → Websites → Add website → Empty PHP/HTML website** (do *not* choose WordPress or the AI builder) and connect **theguardia.ca**.
2. **hPanel → Advanced → PHP Configuration** → choose **PHP 8.2** (or 8.3). The extensions needed (pdo_sqlite, gd, curl, openssl, mbstring, intl) are on by default.
3. **Files → File Manager → `public_html`**: delete `default.php`. Upload **`theguardia.zip`**, right-click → **Extract**, and make sure `index.php`, `admin/`, `app/` and `.htaccess` sit directly in `public_html/`.
   > `.htaccess` is a hidden file. If you build the ZIP yourself, include it.
4. Open **https://theguardia.ca**: the installer starts. Fill in the site name, the address (`https://theguardia.ca`), the newsroom email and your admin account → **Install now**.
5. Delete the **`install/`** folder in File Manager.
6. **Security → SSL**: install the free SSL. Then remove the `#` signs in the *Force HTTPS* block of `.htaccess`.
7. **Advanced → Cron Jobs → Custom**, every 10 minutes (copy the exact command from *Settings → Cron*):
   ```
   /usr/bin/php /home/u123456789/domains/theguardia.ca/public_html/cron.php
   ```
   The cron job publishes scheduled stories, sends push alerts, imports new official stories, runs the AI newsroom, rolls up analytics and updates the city database.

Dashboard: **https://theguardia.ca/admin/**

### After installing — the "Finish setting up" checklist on the dashboard

| Step | Where |
|---|---|
| Anthropic API key for the AI assistant & newsroom | Settings → AI assistant (create the key at console.anthropic.com) |
| City database for visitor cities (free DB-IP, CC BY 4.0) | Settings → Analytics → **Download now** |
| Start importing official court news | Imports → U.S. Department of Justice → **Import history back to 2015** |
| Google Search Console + submit `sitemap.xml` | Settings → SEO (paste the verification code) |
| Google AdSense | Advertising (publisher ID `pub-…`, slot IDs) |
| Stripe for the photo store | Settings → Photo store (secret key + webhook `https://theguardia.ca/api/stripe-webhook`) |
| Social media links, logo text, about page | Settings → General · Pages |

---

## Content: official sources, no copyright problems

The site does **not** contain invented news. Stories come from three places:

1. **Your newsroom** (and the AI assistant), written from facts you gathered.
2. **Importers** for sources whose licence allows republishing:
   - **U.S. Department of Justice press releases** (public domain). These are official court records since 2015: sentencings, convictions and indictments, including **sex-offence and child-exploitation cases**. They are sorted automatically into *Sex Offender Cases, Fraud & Corruption, Drugs & Trafficking, Crime, National Security* and tagged by district (e.g. "Southern District of Ohio"), "Sentencing", "Guilty plea" … The DOJ has published tens of thousands of these releases, so the *Import history* button can fill the site with 30,000+ real, sourced stories.
   - Ready-to-enable feeds (turn on after checking their terms): The Conversation Canada (CC BY-ND), Global Voices (CC BY), KFF Health News (CC BY-ND), Stateline (CC BY-ND), NASA (public domain). You can add any RSS/Atom feed with its licence.
   - Every imported story shows its source and licence, links to the original, and by default sets the **canonical URL to the original** so Google doesn't see duplicate content. **Images are never copied.** Court stories carry a presumption-of-innocence and correction note.
3. **The AI newsroom**, which writes original stories from multiple reputable sources, with a source list.

> Republished official text ranks below your original journalism. For AdSense approval and Google ranking, publish your own stories every day. Imports are background coverage.

---

## AI Newsroom

Three Claude agents work as a newsroom (dashboard → **AI Newsroom**):

| Agent | Job |
|---|---|
| **Alex**, research editor | Searches reputable outlets worldwide (web search), picks trending and regular stories, collects facts with source links, and skips rumours and duplicates |
| **Kristov Joi**, writer | Writes an original, engaging story with headline, subtitle, SEO fields and tags, and cites the outlets. He finds a free-licence photo (Openverse: CC0, public domain, CC BY, CC BY-SA, credited). If none fits and an OpenAI key is set, he generates an illustration labelled "AI-generated illustration" |
| **David Mario**, fact-checking editor | Checks the claims against the sources with web search, fixes small errors, sends a draft back once, or rejects it. He then publishes (or queues for human review) |

- **7–20 stories a day** (configurable), spread between 06:00 and 22:00 and run by the cron job. You can also press **Run next step now**.
- **Chat**: write "Find the 3 most important stories about Somalia today" and Alex picks it up first.
- The tiles show stories published today against the target, the last 7 days, rejections, the pipeline, and **views of AI stories**.
- Safeguards: David must be ≥ 75 % sure (adjustable). Stories need two independent reputable sources or one official source. Accusations against named private people, minors and victims are never published. Each story ends with a source list and a note that it was produced by the AI agents. Their author pages say they are AI.
- Costs: each story uses a few research, writing and review calls (web search included), billed to your Anthropic account. Choose Sonnet or Haiku in Settings for lower cost. Fully automatic publishing can be switched off so that a human approves every story.

---

## Push notifications & analytics notes

- Push keys are created automatically. Readers see a gentle prompt after their second page and can follow a section from any story.
- WhatsApp and some apps hide where a visitor came from. The site's share buttons add `utm_source`, so those visits are still counted as WhatsApp, Facebook and so on.
- Cities come from Cloudflare headers (if you use Cloudflare) or from the free city database. IP addresses are never stored. Detailed visit rows are kept for 120 days (configurable), and daily totals are kept forever.

---

## Files

```
theguardia/
├── index.php          Front controller (all public URLs) · sw.js service worker · cron.php background jobs
├── admin/             Newsroom dashboard (stories, AI newsroom, analytics, push, imports, ads, photo store, settings …)
├── app/               Application code — blocked from the web
│   ├── content.php seo.php analytics.php geoip.php webpush.php ai.php newsroom.php importers.php store.php ads.php cache.php …
│   ├── views/         Public page templates
│   ├── lang/so.php    Somali dashboard texts
│   └── storage/       database.sqlite, cache, private photo originals, GeoIP database, logs
├── assets/            CSS, JS, self-hosted fonts (OFL), logos, icons, section images
├── uploads/           Uploaded images (scripts cannot run here)
├── install/           Web installer (delete after installing)
└── tests/             php tests/webpush_test.php (push encryption against RFC 8291)
```

**Backups**: hPanel → Files → Backups, and download `app/storage/database.sqlite` and `uploads/` regularly.
**Updating**: upload a new ZIP over the old files. Never delete `app/config.php`, `app/storage/` or `uploads/`.
**Local development**: `php -S localhost:8000 router.php`.

Brand: ink `#121212`, red `#D7261E`, paper `#FAF8F4`. Logo files: `assets/img/logo.svg`, `logo-white.svg`, `logo-compact.svg`, `icon.svg`, `brand/the-guardia-logo.png`.

> **Name note:** "The Guardia" is close to "The Guardian". The logo and design here are original, but ask a trademark lawyer before you launch the brand.

---

## Hage Soomaali

**Rakibidda Hostinger:**
1. hPanel → samee website **madhan (Empty PHP website)**, WordPress ha dooran. Ku xir **theguardia.ca**.
2. PHP Configuration → dooro **PHP 8.2**.
3. File Manager → `public_html` → soo geli `theguardia.zip` → **Extract**. Hubi in `index.php`, `admin/`, `app/` iyo `.htaccess` ay si toos ah ugu jiraan `public_html`.
4. Fur `https://theguardia.ca`, installer-ka ayaa furmaya. Geli magaca, cinwaanka, iimaylka iyo akoonkaaga admin-ka → **Install now**.
5. Tirtir galka **`install/`**, shid **SSL**, kadibna `.htaccess`-ka ka saar calaamadaha `#` ee qaybta *Force HTTPS*.
6. **Cron Jobs**: 10-kii daqiiqo kasta, ku dar amarka ku qoran *Dejinta → Cron*.

**Kadib rakibidda (dashboard → "Dhammaystir diyaarinta"):**
- **Dejinta → Kaaliyaha AI**: geli furaha Anthropic API (console.anthropic.com).
- **Soo dejinta wararka → U.S. Department of Justice → "Soo deji taariikhda ilaa 2015"**: kiisaska rasmiga ah ee maxkamadaha (sex offenders, khiyaano, daroogo …) ayaa la soo galinayaa. Mid kasta ishiisa ayaa lagu xiran yahay, copyright dhibaato ma leh.
- **Qolka Wararka AI**: shid "Si toos ah u shaqee". Alex wuu baaraa, Kristov wuu qoraa, David wuu xaqiijiyaa oo daabacaa, maalintii 7–20 war. Qeybta chat-ka ku qor waxaad rabto inay ka shaqeeyaan.
- **Xayeysiis**: geli Publisher ID-ga AdSense (`pub-…`). `ads.txt` si toos ah ayuu u samaysmaa.
- **Dejinta → SEO**: ku xir Google Search Console, kadib u gudbi `https://theguardia.ca/sitemap.xml`.
- **Xogta booqdayaasha**: Dejinta → Xogta booqdayaasha → **Hadda soo deji** si magaalooyinka loo arko.
- **Dukaanka sawirrada**: ku dar sawirro iyo qiimahooda. Stripe-na ku xir si lacag online ah loo bixiyo.

**Kayd (backup):** si joogto ah u soo deji `app/storage/database.sqlite` iyo `uploads/`. Marka aad cusbooneysiinayso, ha tirtirin `app/config.php`, `app/storage/` iyo `uploads/`.
