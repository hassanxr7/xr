<?php
/**
 * Hubdex Store - Global site configuration
 *
 * Edit the values below before uploading to Hostinger.
 * IMPORTANT: Set SITE_URL to your real domain (no trailing slash),
 * and update the same domain inside robots.txt and sitemap.xml.
 */

if (!defined('HUBDEX')) {
    define('HUBDEX', true);
}

// ---------------------------------------------------------------------
// Core brand settings
// ---------------------------------------------------------------------
define('SITE_URL', 'https://hubdexstore.com');
define('SITE_NAME', 'Hubdex Store');
define('SITE_SHORT_NAME', 'Hubdex');
define('COMPANY_LEGAL_NAME', 'Hubdex Store LTD');
define('SITE_TAGLINE', 'A modern online shopping platform by Hubdex Store LTD.');
define('SITE_LANG', 'en');
define('SITE_LOCALE', 'en_GB');
define('THEME_COLOR', '#5b3df5');

// ---------------------------------------------------------------------
// Contact details (shown on the contact page and in structured data)
// ---------------------------------------------------------------------
define('CONTACT_EMAIL', 'info@hubdexstore.com');
define('SUPPORT_EMAIL', 'support@hubdexstore.com');
define('CONTACT_PHONE', '');          // e.g. '+44 20 0000 0000' (leave empty to hide)
define('COMPANY_ADDRESS', '');        // e.g. 'London, United Kingdom' (leave empty to hide)

// ---------------------------------------------------------------------
// Launch countdown (ISO 8601, include timezone offset)
// ---------------------------------------------------------------------
define('LAUNCH_DATE', '2027-01-01T00:00:00+00:00');

// ---------------------------------------------------------------------
// Social media profiles - replace '#' with real URLs when available.
// Real URLs are also added to the Organization schema "sameAs" list.
// ---------------------------------------------------------------------
$SOCIAL_LINKS = [
    'facebook'  => '#',
    'instagram' => '#',
    'x'         => '#',
    'linkedin'  => '#',
    'tiktok'    => '#',
    'youtube'   => '#',
];

// ---------------------------------------------------------------------
// Form handling
// ---------------------------------------------------------------------
// Submissions are saved to /data (protected by .htaccess). To also send
// e-mail notifications, set MAIL_ENABLED to true. On Hostinger, create a
// mailbox (e.g. no-reply@yourdomain) and use it as MAIL_FROM.
define('MAIL_ENABLED', false);
define('MAIL_TO', CONTACT_EMAIL);
define('MAIL_FROM', 'no-reply@hubdexstore.com');
define('DATA_DIR', dirname(__DIR__) . '/data');

// ---------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------
define('COPYRIGHT_YEAR', '2026');
define('ASSET_VERSION', '1.0.0'); // bump to bust browser caches after edits
date_default_timezone_set('UTC');
