<?php
/**
 * Hubdex Store - Shared <head> + site header
 *
 * Expected variables (set in each page before including this file):
 *   $page_title        string  Unique <title>
 *   $page_description  string  Unique meta description
 *   $page_keywords     string  Comma separated keywords (optional)
 *   $page_path         string  Path for canonical URL, e.g. '' or 'about.php'
 *   $page_id           string  Nav key: home|about|contact|privacy|terms|sitemap
 *   $page_type         string  schema.org WebPage subtype (optional)
 *   $breadcrumb_name   string  Name used in BreadcrumbList (optional)
 *   $body_class        string  Extra body class (optional)
 */

require_once __DIR__ . '/functions.php';

$page_title       = $page_title ?? SITE_NAME . ' | Coming Soon';
$page_description = $page_description ?? SITE_TAGLINE;
$page_keywords    = $page_keywords ?? 'Hubdex Store, Hubdex, Hubdex Store LTD, ecommerce, online shopping, online store';
$page_path        = $page_path ?? '';
$page_id          = $page_id ?? '';
$page_type        = $page_type ?? 'WebPage';
$body_class       = $body_class ?? '';
$robots           = $robots ?? 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';
$is_error_page    = $page_id === '404';
// Error pages can be served from any URL depth, so pin relative links to the site root.
$base_href        = $is_error_page ? rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/')), '/') . '/' : '';
$canonical        = url($page_path);
$og_image         = url('assets/img/og-image.png');

// ---------------------------------------------------------------------
// Structured data (schema.org JSON-LD)
// ---------------------------------------------------------------------
$org_id  = url('#organization');
$site_id = url('#website');

$organization = [
    '@type'         => ['Organization', 'OnlineStore'],
    '@id'           => $org_id,
    'name'          => SITE_NAME,
    'legalName'     => COMPANY_LEGAL_NAME,
    'alternateName' => [SITE_SHORT_NAME, COMPANY_LEGAL_NAME, 'Hubdex Store Online Shop'],
    'url'           => url(),
    'logo'          => [
        '@type'  => 'ImageObject',
        'url'    => url('assets/img/logo.png'),
        'width'  => 512,
        'height' => 512,
    ],
    'image'         => $og_image,
    'description'   => 'Hubdex Store is a modern ecommerce and online shopping platform operated by Hubdex Store LTD, launching soon.',
    'email'         => CONTACT_EMAIL,
    'contactPoint'  => [
        '@type'             => 'ContactPoint',
        'contactType'       => 'customer support',
        'email'             => SUPPORT_EMAIL,
        'availableLanguage' => ['English'],
    ],
];
if (CONTACT_PHONE !== '') {
    $organization['telephone'] = CONTACT_PHONE;
    $organization['contactPoint']['telephone'] = CONTACT_PHONE;
}
if (COMPANY_ADDRESS !== '') {
    $organization['address'] = ['@type' => 'PostalAddress', 'streetAddress' => COMPANY_ADDRESS];
}
if ($same_as = social_profiles()) {
    $organization['sameAs'] = $same_as;
}

$website = [
    '@type'         => 'WebSite',
    '@id'           => $site_id,
    'url'           => url(),
    'name'          => SITE_NAME,
    'alternateName' => [SITE_SHORT_NAME, COMPANY_LEGAL_NAME],
    'description'   => SITE_TAGLINE,
    'inLanguage'    => SITE_LANG,
    'publisher'     => ['@id' => $org_id],
];

$webpage = [
    '@type'       => $page_type,
    '@id'         => $canonical . '#webpage',
    'url'         => $canonical,
    'name'        => $page_title,
    'description' => $page_description,
    'isPartOf'    => ['@id' => $site_id],
    'about'       => ['@id' => $org_id],
    'inLanguage'  => SITE_LANG,
];

$graph = [$organization, $website, $webpage];

if ($page_path !== '') {
    $graph[] = [
        '@type'           => 'BreadcrumbList',
        '@id'             => $canonical . '#breadcrumb',
        'itemListElement' => [
            ['@type' => 'ListItem', 'position' => 1, 'name' => SITE_NAME, 'item' => url()],
            ['@type' => 'ListItem', 'position' => 2, 'name' => $breadcrumb_name ?? $page_title, 'item' => $canonical],
        ],
    ];
    $webpage['breadcrumb'] = ['@id' => $canonical . '#breadcrumb'];
    $graph[2] = $webpage;
}

$schema = ['@context' => 'https://schema.org', '@graph' => $graph];

$nav = [
    'home'    => ['label' => 'Home',    'href' => './'],
    'about'   => ['label' => 'About',   'href' => 'about.php'],
    'contact' => ['label' => 'Contact', 'href' => 'contact.php'],
];
?>
<!DOCTYPE html>
<html lang="<?= e(SITE_LANG) ?>">
<head>
    <meta charset="UTF-8">
    <script>document.documentElement.classList.add('js');</script>
    <meta name="viewport" content="width=device-width, initial-scale=1">
<?php if ($base_href): ?>
    <base href="<?= e($base_href) ?>">
<?php endif; ?>
    <title><?= e($page_title) ?></title>
    <meta name="description" content="<?= e($page_description) ?>">
    <meta name="keywords" content="<?= e($page_keywords) ?>">
    <meta name="author" content="<?= e(COMPANY_LEGAL_NAME) ?>">
    <meta name="robots" content="<?= e($robots) ?>">
    <meta name="application-name" content="<?= e(SITE_NAME) ?>">
    <meta name="apple-mobile-web-app-title" content="<?= e(SITE_NAME) ?>">
    <meta name="theme-color" content="<?= e(THEME_COLOR) ?>">
    <meta name="format-detection" content="telephone=no">
<?php if (!$is_error_page): ?>
    <link rel="canonical" href="<?= e($canonical) ?>">
<?php endif; ?>

    <!-- Open Graph -->
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="<?= e(SITE_NAME) ?>">
    <meta property="og:locale" content="<?= e(SITE_LOCALE) ?>">
    <meta property="og:title" content="<?= e($page_title) ?>">
    <meta property="og:description" content="<?= e($page_description) ?>">
    <meta property="og:url" content="<?= e($canonical) ?>">
    <meta property="og:image" content="<?= e($og_image) ?>">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:alt" content="Hubdex Store - modern online shopping by Hubdex Store LTD">

    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="<?= e($page_title) ?>">
    <meta name="twitter:description" content="<?= e($page_description) ?>">
    <meta name="twitter:image" content="<?= e($og_image) ?>">
    <meta name="twitter:image:alt" content="Hubdex Store - modern online shopping by Hubdex Store LTD">

    <!-- Icons -->
    <link rel="icon" href="assets/img/favicon.svg" type="image/svg+xml">
    <link rel="icon" href="assets/img/favicon-32.png" sizes="32x32" type="image/png">
    <link rel="apple-touch-icon" href="assets/img/apple-touch-icon.png">
    <link rel="manifest" href="site.webmanifest">

    <!-- Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap">

    <link rel="stylesheet" href="<?= e(asset('css/style.css')) ?>">

    <script type="application/ld+json"><?= json_encode($schema, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_PRETTY_PRINT) ?></script>
</head>
<body class="page-<?= e($page_id) ?> <?= e($body_class) ?>">
<a class="skip-link" href="#main">Skip to content</a>

<div class="bg-scene" aria-hidden="true">
    <span class="blob blob-1"></span>
    <span class="blob blob-2"></span>
    <span class="blob blob-3"></span>
    <span class="grid-overlay"></span>
</div>

<header class="site-header" id="top">
    <div class="container header-inner">
        <a class="brand" href="./" aria-label="Hubdex Store home">
            <img class="brand-mark" src="assets/img/favicon.svg" width="40" height="40" alt="">
            <span class="brand-text">Hubdex<span>Store</span></span>
        </a>

        <button class="nav-toggle" type="button" aria-controls="site-nav" aria-expanded="false" aria-label="Open menu">
            <span class="nav-toggle-open"><?= icon('menu', 24) ?></span>
            <span class="nav-toggle-close"><?= icon('close', 24) ?></span>
        </button>

        <nav class="site-nav" id="site-nav" aria-label="Main navigation">
            <ul>
                <?php foreach ($nav as $key => $item): ?>
                    <li><a href="<?= e($item['href']) ?>"<?= $key === $page_id ? ' class="active" aria-current="page"' : '' ?>><?= e($item['label']) ?></a></li>
                <?php endforeach; ?>
            </ul>
            <a class="btn btn-sm btn-primary nav-cta" href="./#notify">Get Early Access</a>
        </nav>
    </div>
</header>

<main id="main">
