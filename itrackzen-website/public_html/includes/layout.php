<?php
/** Shared layout, SEO head, JSON-LD and UI helpers. */
require_once __DIR__ . '/art.php';

$GLOBALS['PAGE'] = ['jsonld' => [], 'breadcrumbs' => [], 'body_class' => ''];

function request_path(): string
{
    $p = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
    $p = '/' . trim($p, '/');
    return $p === '' ? '/' : $p;
}

/* ---------- JSON-LD ---------- */
function ld_org(): array
{
    $brand = site('brand'); $url = base_url();
    $sameAs = array_values(array_filter((array)site('social', [])));
    $org = [
        '@type' => 'Organization', '@id' => $url . '/#organization',
        'name' => $brand, 'legalName' => site('company'), 'alternateName' => ['ITrackZen GPS', 'LibDex GPS Tracking'],
        'url' => $url . '/', 'logo' => abs_url('/assets/img/logo-512.png'),
        'slogan' => site('tagline'),
        'description' => 'ITrackZen is the GPS tracking, fleet management and AI dashcam brand of LibDex Ltd, serving businesses in Africa and worldwide.',
        'parentOrganization' => ['@type' => 'Organization', 'name' => site('company')],
        'email' => site('emails.info'),
        'contactPoint' => [['@type' => 'ContactPoint', 'contactType' => 'sales', 'email' => site('emails.sales'), 'availableLanguage' => ['English'], 'areaServed' => 'Worldwide']],
    ];
    if (site('phone')) { $org['contactPoint'][0]['telephone'] = site('phone'); $org['telephone'] = site('phone'); }
    if ($sameAs) { $org['sameAs'] = $sameAs; }
    return $org;
}

function ld_area(): array
{
    $out = [];
    foreach (['Somalia', 'Kenya', 'Uganda', 'Ethiopia', 'South Sudan', 'Democratic Republic of the Congo'] as $c) { $out[] = ['@type' => 'Country', 'name' => $c]; }
    $out[] = ['@type' => 'AdministrativeArea', 'name' => 'East Africa'];
    $out[] = ['@type' => 'AdministrativeArea', 'name' => 'Central Africa'];
    $out[] = ['@type' => 'Continent', 'name' => 'Africa'];
    return $out;
}

function ld_local(): array
{
    $b = [
        '@type' => ['LocalBusiness', 'ProfessionalService'], '@id' => base_url() . '/#localbusiness',
        'name' => site('brand') . ' by ' . site('company'), 'url' => base_url() . '/',
        'image' => abs_url(site('og_image', '/assets/img/og-image.png')),
        'email' => site('emails.sales'), 'priceRange' => 'Contact for quote',
        'description' => 'GPS tracking, fleet management, fuel monitoring and AI dashcam solutions for businesses in Africa and worldwide.',
        'areaServed' => ld_area(), 'parentOrganization' => ['@id' => base_url() . '/#organization'],
        'openingHoursSpecification' => [['@type' => 'OpeningHoursSpecification', 'dayOfWeek' => ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], 'opens' => '00:00', 'closes' => '23:59']],
    ];
    if (site('phone')) { $b['telephone'] = site('phone'); }
    if (site('address') || site('locality')) {
        $b['address'] = array_filter(['@type' => 'PostalAddress', 'streetAddress' => site('address'), 'addressLocality' => site('locality'), 'addressRegion' => site('region'), 'postalCode' => site('postal_code'), 'addressCountry' => site('country_code')]);
    }
    return $b;
}

function ld_software(): array
{
    return [
        '@type' => 'SoftwareApplication', '@id' => base_url() . '/#software',
        'name' => 'ITrackZen GPS Fleet Management Platform', 'applicationCategory' => 'BusinessApplication',
        'operatingSystem' => 'Web, Android, iOS', 'url' => base_url() . '/',
        'description' => 'Real-time GPS vehicle tracking, fleet management, fuel monitoring, driver behaviour analytics and AI dashcam video telematics.',
        'publisher' => ['@id' => base_url() . '/#organization'],
        'featureList' => array_slice(array_map(fn($i) => $i['title'], all_service_items()), 0, 40),
    ];
}

function ld_service(string $name, string $desc, string $path, array $items = []): array
{
    $svc = [
        '@type' => 'Service', 'name' => $name, 'description' => $desc, 'url' => abs_url($path),
        'serviceType' => 'GPS tracking and fleet management', 'provider' => ['@id' => base_url() . '/#organization'],
        'areaServed' => ld_area(),
    ];
    if ($items) {
        $svc['hasOfferCatalog'] = ['@type' => 'OfferCatalog', 'name' => $name, 'itemListElement' => array_map(fn($t) => ['@type' => 'Offer', 'itemOffered' => ['@type' => 'Service', 'name' => $t]], $items)];
    }
    return $svc;
}

function ld_faq(array $items): array
{
    return ['@type' => 'FAQPage', 'mainEntity' => array_map(fn($f) => ['@type' => 'Question', 'name' => $f['q'], 'acceptedAnswer' => ['@type' => 'Answer', 'text' => $f['a']]], $items)];
}

function add_ld(array $node): void { $GLOBALS['PAGE']['jsonld'][] = $node; }

/** $items: [[label, path], ...] (excluding Home). */
function set_breadcrumbs(array $items): void { $GLOBALS['PAGE']['breadcrumbs'] = $items; }

function ld_breadcrumbs(): ?array
{
    $bc = $GLOBALS['PAGE']['breadcrumbs'];
    if (!$bc) { return null; }
    $list = [['@type' => 'ListItem', 'position' => 1, 'name' => 'Home', 'item' => abs_url('/')]];
    foreach ($bc as $i => $b) { $list[] = ['@type' => 'ListItem', 'position' => $i + 2, 'name' => $b[0], 'item' => abs_url($b[1])]; }
    return ['@type' => 'BreadcrumbList', 'itemListElement' => $list];
}

/* ---------- Page start / end ---------- */
function layout_start(array $m): void
{
    $brand = site('brand');
    $title = $m['title'] ?? $brand;
    $desc = $m['description'] ?? '';
    $canon = abs_url($m['path'] ?? request_path());
    $img = abs_url($m['image'] ?? site('og_image', '/assets/img/og-image.png'));
    $robots = !empty($m['noindex']) ? 'noindex, nofollow' : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';
    $graph = [ld_org(), ld_local(), ['@type' => 'WebSite', '@id' => base_url() . '/#website', 'url' => base_url() . '/', 'name' => $brand, 'publisher' => ['@id' => base_url() . '/#organization'], 'inLanguage' => 'en']];
    if (($m['path'] ?? '') === '/') { $graph[] = ld_software(); }
    if ($bc = ld_breadcrumbs()) { $graph[] = $bc; }
    foreach ($GLOBALS['PAGE']['jsonld'] as $n) { $graph[] = $n; }
    $ld = json_encode(['@context' => 'https://schema.org', '@graph' => $graph], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG);
    $GLOBALS['PAGE']['body_class'] = $m['body_class'] ?? '';
    header('Content-Type: text/html; charset=utf-8');
    ?>
<!DOCTYPE html>
<html lang="en" class="no-js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= e($title) ?></title>
<meta name="description" content="<?= e($desc) ?>">
<?php if (!empty($m['keywords'])): ?><meta name="keywords" content="<?= e($m['keywords']) ?>">
<?php endif; ?>
<meta name="robots" content="<?= e($robots) ?>">
<meta name="author" content="<?= e(site('company')) ?>">
<meta name="theme-color" content="#0a1f44">
<link rel="canonical" href="<?= e($canon) ?>">
<link rel="alternate" hreflang="en" href="<?= e($canon) ?>">
<link rel="alternate" hreflang="x-default" href="<?= e($canon) ?>">
<meta property="og:type" content="<?= e($m['og_type'] ?? 'website') ?>">
<meta property="og:site_name" content="<?= e($brand) ?>">
<meta property="og:title" content="<?= e($title) ?>">
<meta property="og:description" content="<?= e($desc) ?>">
<meta property="og:url" content="<?= e($canon) ?>">
<meta property="og:image" content="<?= e($img) ?>">
<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta property="og:image:alt" content="ITrackZen GPS tracking and fleet management by LibDex Ltd">
<meta property="og:locale" content="en_US">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="<?= e($title) ?>">
<meta name="twitter:description" content="<?= e($desc) ?>">
<meta name="twitter:image" content="<?= e($img) ?>">
<link rel="icon" href="/assets/img/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/assets/img/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="/assets/img/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">
<link rel="stylesheet" href="<?= e(asset('assets/css/style.css')) ?>">
<script>document.documentElement.className='js';</script>
<script type="application/ld+json"><?= $ld ?></script>
<?php if (site('analytics.gtm') || site('analytics.ga4') || site('analytics.fb_pixel')): ?>
<script>window.ITZ_ANALYTICS={ga4:<?= json_encode((string)site('analytics.ga4')) ?>,gtm:<?= json_encode((string)site('analytics.gtm')) ?>,fb:<?= json_encode((string)site('analytics.fb_pixel')) ?>,banner:<?= site('analytics.cookie_banner', true) ? 'true' : 'false' ?>};</script>
<?php endif; ?>
</head>
<body class="<?= e($GLOBALS['PAGE']['body_class']) ?>">
<a class="skip-link" href="#main">Skip to content</a>
<?php layout_header(); ?>
<main id="main">
<?php
}

function nav_active(string $href): bool
{
    $p = request_path();
    return $href === '/' ? $p === '/' : ($p === $href || str_starts_with($p, $href . '/'));
}

function layout_header(): void
{
    $nav = site('nav', []);
    ?>
<header class="site-header" id="top">
  <div class="container nav-wrap">
    <a class="brand" href="/" aria-label="<?= e(site('brand')) ?> home"><img src="/assets/img/logo.svg" width="196" height="44" alt="<?= e(site('brand')) ?> GPS tracking by <?= e(site('company')) ?>"></a>
    <button class="nav-toggle" type="button" aria-controls="primary-nav" aria-expanded="false" aria-label="Open menu"><?= icon('menu') ?><?= icon('close') ?></button>
    <nav id="primary-nav" class="primary-nav" aria-label="Primary">
      <ul class="nav-list">
<?php foreach ($nav as $item): $has = !empty($item['children']); ?>
        <li class="<?= $has ? 'has-sub' : '' ?>">
          <a href="<?= e($item['href']) ?>" class="<?= nav_active($item['href']) ? 'active' : '' ?>"<?= $has ? ' aria-haspopup="true"' : '' ?>><?= e($item['label']) ?><?= $has ? icon('chevron', 'ico caret') : '' ?></a>
<?php if ($has): ?>
          <ul class="sub-menu">
<?php foreach ($item['children'] as $c): ?>
            <li><a href="<?= e($c['href']) ?>"><span class="sm-ico"><?= icon($c['icon'] ?? 'pin') ?></span><span><strong><?= e($c['label']) ?></strong><small><?= e($c['text'] ?? '') ?></small></span></a></li>
<?php endforeach; ?>
          </ul>
<?php endif; ?>
        </li>
<?php endforeach; ?>
      </ul>
      <div class="nav-cta">
        <a class="btn btn-ghost btn-sm" href="<?= e(site('client_login_url')) ?>" rel="noopener"><?= icon('login') ?>Client Login</a>
        <a class="btn btn-primary btn-sm" href="/contact-sales">Contact Sales</a>
      </div>
    </nav>
  </div>
</header>
<?php
}

function layout_end(): void
{
    $wa = wa_link('Hello ITrackZen, I would like to know more about your GPS tracking services.');
    $sales = site('emails.sales'); $info = site('emails.info');
    $countries = data('countries')['items'] ?? [];
    ?>
</main>
<footer class="site-footer">
  <div class="container footer-grid">
    <div class="f-brand">
      <img src="/assets/img/logo-light.svg" width="196" height="44" alt="<?= e(site('brand')) ?> logo">
      <p><?= e(site('brand')) ?> is a <strong><?= e(site('tagline')) ?></strong> by <?= e(site('company')) ?>. GPS tracking, fleet management and AI dashcams for Africa and global businesses.</p>
      <ul class="f-contact">
        <li><?= icon('mail') ?><a href="<?= e(mailto($sales)) ?>"><?= e($sales) ?></a></li>
        <li><?= icon('mail') ?><a href="<?= e(mailto($info)) ?>"><?= e($info) ?></a></li>
<?php if (site('phone')): ?><li><?= icon('headset') ?><a href="tel:<?= e(preg_replace('/[^+\d]/', '', site('phone'))) ?>"><?= e(site('phone')) ?></a></li><?php endif; ?>
<?php if ($wa): ?><li><?= icon('whatsapp') ?><a href="<?= e($wa) ?>" target="_blank" rel="noopener">Chat on WhatsApp</a></li><?php endif; ?>
      </ul>
    </div>
    <div><h3>Services</h3><ul>
      <li><a href="/gps-tracking-services">GPS Tracking Services</a></li>
      <li><a href="/fleet-management">Fleet Management</a></li>
      <li><a href="/ai-dashcam-video-telematics">AI Dashcam &amp; Video Telematics</a></li>
      <li><a href="/supported-gps-trackers">Supported GPS Trackers</a></li>
      <li><a href="/solutions">Solutions</a></li>
      <li><a href="/pricing">Pricing &amp; Plans</a></li>
    </ul></div>
    <div><h3>Company</h3><ul>
      <li><a href="/about-us">About Us</a></li>
      <li><a href="/demo">Request a Demo</a></li>
      <li><a href="/contact-sales">Contact Sales</a></li>
      <li><a href="/faq">FAQ</a></li>
      <li><a href="/blog">Blog</a></li>
      <li><a href="<?= e(site('client_login_url')) ?>" rel="noopener">Client Login</a></li>
    </ul></div>
    <div><h3>Regions</h3><ul>
<?php foreach ($countries as $c): ?>
      <li><a href="/<?= e($c['slug']) ?>">GPS Tracking <?= e($c['name']) ?></a></li>
<?php endforeach; ?>
    </ul></div>
    <div><h3>Legal</h3><ul>
      <li><a href="/privacy-policy">Privacy Policy</a></li>
      <li><a href="/terms-and-conditions">Terms &amp; Conditions</a></li>
      <li><a href="/delete-account">Account &amp; Data Deletion</a></li>
      <li><a href="/sitemap.xml">Sitemap</a></li>
    </ul>
<?php if (site('app_links.android') || site('app_links.ios')): ?>
    <h3 class="mt">Mobile apps</h3><ul>
<?php if (site('app_links.android')): ?><li><a href="<?= e(site('app_links.android')) ?>" rel="noopener">Android app</a></li><?php endif; ?>
<?php if (site('app_links.ios')): ?><li><a href="<?= e(site('app_links.ios')) ?>" rel="noopener">iOS app</a></li><?php endif; ?>
    </ul>
<?php endif; ?>
    </div>
  </div>
  <div class="container footer-bottom">
    <p>&copy; <?= date('Y') ?> <?= e(site('company')) ?>. <?= e(site('brand')) ?> &mdash; <?= e(site('tagline')) ?>. All rights reserved.</p>
    <ul class="social">
<?php foreach ((array)site('social', []) as $k => $u): if (!$u) { continue; } ?>
      <li><a href="<?= e($u) ?>" rel="noopener me" target="_blank"><?= e(ucfirst($k === 'x' ? 'X' : $k)) ?></a></li>
<?php endforeach; ?>
    </ul>
  </div>
</footer>
<?php if ($wa): ?>
<a class="wa-float" href="<?= e($wa) ?>" target="_blank" rel="noopener" aria-label="Chat with ITrackZen on WhatsApp"><?= icon('whatsapp') ?><span>WhatsApp</span></a>
<?php endif; ?>
<?php if (site('analytics.cookie_banner', true) && (site('analytics.ga4') || site('analytics.gtm') || site('analytics.fb_pixel'))): ?>
<div class="cookie" id="cookie" role="dialog" aria-live="polite" aria-label="Cookie notice" hidden>
  <p>We use cookies to run this site and, with your consent, to measure traffic and marketing. See our <a href="/privacy-policy">Privacy Policy</a>.</p>
  <div><button class="btn btn-primary btn-sm" data-cookie="yes" type="button">Accept</button><button class="btn btn-ghost btn-sm" data-cookie="no" type="button">Decline</button></div>
</div>
<?php endif; ?>
<?php if (site('analytics.tawk')): ?><script>window.ITZ_TAWK=<?= json_encode((string)site('analytics.tawk')) ?>;</script><?php endif; ?>
<script src="<?= e(asset('assets/js/main.js')) ?>" defer></script>
</body>
</html>
<?php
}

/* ---------- UI helpers ---------- */
function page_hero(string $h1, string $sub, string $eyebrow = ''): void
{
    ?>
<section class="page-hero">
  <div class="container">
<?php if ($bc = $GLOBALS['PAGE']['breadcrumbs']): ?>
    <nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><?php foreach ($bc as $b): ?><span aria-hidden="true">/</span><a href="<?= e($b[1]) ?>"><?= e($b[0]) ?></a><?php endforeach; ?></nav>
<?php endif; ?>
<?php if ($eyebrow): ?><p class="eyebrow"><?= e($eyebrow) ?></p><?php endif; ?>
    <h1><?= e($h1) ?></h1>
    <p class="lead"><?= e($sub) ?></p>
  </div>
</section>
<?php
}

function section_head(string $eyebrow, string $title, string $text = '', bool $center = true, string $tag = 'h2'): void
{
    ?>
<div class="sec-head<?= $center ? ' center' : '' ?> reveal">
<?php if ($eyebrow): ?><p class="eyebrow"><?= e($eyebrow) ?></p><?php endif; ?>
  <<?= $tag ?>><?= e($title) ?></<?= $tag ?>>
<?php if ($text): ?><p><?= e($text) ?></p><?php endif; ?>
</div>
<?php
}

function cta_band(string $title = '', string $text = ''): void
{
    $home = data('home')['cta'] ?? [];
    $title = $title ?: ($home['title'] ?? 'Talk to ITrackZen');
    $text = $text ?: ($home['text'] ?? '');
    $wa = wa_link('Hello ITrackZen, I would like a GPS tracking quote.');
    ?>
<section class="cta-band">
  <div class="container cta-inner reveal">
    <div><h2><?= e($title) ?></h2><p><?= e($text) ?></p></div>
    <div class="cta-actions">
      <a class="btn btn-primary btn-lg" href="/contact-sales">Contact Sales</a>
      <a class="btn btn-light btn-lg" href="/demo">Request Demo</a>
<?php if ($wa): ?><a class="btn btn-wa btn-lg" href="<?= e($wa) ?>" target="_blank" rel="noopener"><?= icon('whatsapp') ?>WhatsApp</a><?php endif; ?>
      <a class="btn btn-outline-light btn-lg" href="<?= e(mailto(site('emails.sales'), 'ITrackZen enquiry')) ?>"><?= icon('mail') ?>Email Sales</a>
    </div>
  </div>
</section>
<?php
}

function feature_card(array $f, string $tagClass = ''): void
{
    ?>
<article class="card feature reveal <?= e($tagClass) ?>">
  <span class="ico-wrap"><?= icon($f['icon'] ?? 'check') ?></span>
  <h3><?= e($f['title']) ?></h3>
  <p><?= e($f['text'] ?? $f['summary'] ?? '') ?></p>
<?php if (!empty($f['href'])): ?><a class="more" href="<?= e($f['href']) ?>">Learn more <?= icon('arrow') ?></a><?php endif; ?>
</article>
<?php
}

function check_list(array $items, string $class = 'checks'): void
{
    echo '<ul class="' . e($class) . '">';
    foreach ($items as $i) { echo '<li>' . icon('check') . '<span>' . e($i) . '</span></li>'; }
    echo '</ul>';
}

function faq_list(array $items, bool $open_first = false): void
{
    foreach ($items as $n => $f) {
        echo '<details class="faq-item reveal"' . ($open_first && $n === 0 ? ' open' : '') . '><summary>' . e($f['q']) . icon('chevron', 'ico caret') . '</summary><div class="faq-a"><p>' . e($f['a']) . '</p></div></details>';
    }
}
