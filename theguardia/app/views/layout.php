<?php
/** @var string $content @var string $view */
defined('APP') || exit;
$s = seo();
$breaking = $view === 'home' || $view === 'article' ? breaking_articles() : [];
$menu = menu_categories();
$articleId = isset($a['id']) && $view === 'article' ? (int) $a['id'] : 0;
$nonce = e(csp_nonce());
?><!doctype html>
<html lang="<?= e($s['lang'] === 'so' ? 'so' : 'en-CA') ?>">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<?= seo_head() ?>
<link rel="preload" href="<?= e(url('assets/fonts/playfair-display-latin-700-normal.woff2')) ?>" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="<?= e(url('assets/fonts/source-serif-4-latin-400-normal.woff2')) ?>" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="<?= e(asset('css/site.css')) ?>">
<link rel="icon" href="<?= e(url('assets/img/favicon.svg')) ?>" type="image/svg+xml">
<link rel="icon" href="<?= e(url('assets/img/favicon-32.png')) ?>" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="<?= e(url('assets/img/apple-touch-icon.png')) ?>">
<link rel="manifest" href="<?= e(url('manifest.webmanifest')) ?>">
<meta name="theme-color" content="#121212">
<?= adsense_head() ?>
<?php if ($ga = setting('ga_measurement_id')): ?>
<script async src="https://www.googletagmanager.com/gtag/js?id=<?= e($ga) ?>" nonce="<?= $nonce ?>"></script>
<?php endif; ?>
<?= setting('head_code') /* verified snippets added by an administrator (e.g. a consent tool) */ ?>
</head>
<body class="v-<?= e($view) ?>" data-base="<?= e(base_url()) ?>" data-article="<?= $articleId ?>" data-vapid="<?= e(setting('vapid_public')) ?>" data-ga="<?= e(setting('ga_measurement_id')) ?>">
<?= icon_sprite() ?>
<a class="skip" href="#main">Skip to content</a>

<header class="site-header">
  <div class="topbar wrap">
    <span class="today"><?= e(date('l, F j, Y')) ?></span>
    <nav class="top-links" aria-label="Utility">
      <a href="<?= e(url('photos')) ?>"><?= icon('camera') ?><span>Photo store</span></a>
      <button type="button" class="js-alerts" aria-label="Get news alerts"><?= icon('bell') ?><span>Alerts</span></button>
      <a href="<?= e(url('search')) ?>" class="js-search-toggle" aria-label="Search"><?= icon('search') ?><span>Search</span></a>
    </nav>
  </div>
  <div class="masthead wrap">
    <button type="button" class="menu-btn js-menu" aria-label="Open sections menu" aria-expanded="false" aria-controls="drawer"><?= icon('menu') ?></button>
    <a class="logo" href="<?= e(url('')) ?>" aria-label="<?= e(site_name()) ?> – home">
      <img class="logo-full" src="<?= e(url('assets/img/logo.svg')) ?>" alt="<?= e(site_name()) ?>" width="384" height="132">
      <img class="logo-compact" src="<?= e(url('assets/img/logo-compact.svg')) ?>" alt="" width="300" height="102" aria-hidden="true">
    </a>
    <a href="<?= e(url('search')) ?>" class="search-btn js-search-toggle" aria-label="Search"><?= icon('search') ?></a>
  </div>
  <form class="searchbar wrap" action="<?= e(url('search')) ?>" method="get" role="search" hidden>
    <input type="search" name="q" placeholder="Search news, cases, places…" aria-label="Search" value="<?= e($q ?? '') ?>">
    <button type="submit">Search</button>
  </form>
  <nav class="nav" aria-label="Sections">
    <div class="wrap nav-inner">
      <a href="<?= e(url('')) ?>"<?= $view === 'home' ? ' aria-current="page"' : '' ?>>Home</a>
      <?php foreach ($menu as $c): ?>
        <a href="<?= e(category_url($c)) ?>"<?= isset($category['id']) && (int) $category['id'] === (int) $c['id'] ? ' aria-current="page"' : '' ?>><?= e($c['name']) ?></a>
      <?php endforeach; ?>
    </div>
  </nav>
  <?php if ($breaking): ?>
  <div class="breaking" role="region" aria-label="Breaking news">
    <div class="wrap breaking-inner"><strong>Breaking</strong>
      <div class="breaking-list"><?php foreach ($breaking as $b): ?><a href="<?= e(article_url($b)) ?>"><?= e($b['title']) ?></a><?php endforeach; ?></div>
    </div>
  </div>
  <?php endif; ?>
</header>

<div class="drawer" id="drawer" hidden>
  <div class="drawer-panel" role="dialog" aria-label="All sections">
    <div class="drawer-head"><img src="<?= e(url('assets/img/logo-compact.svg')) ?>" alt="<?= e(site_name()) ?>" width="150" height="51"><button type="button" class="js-menu-close" aria-label="Close menu"><?= icon('close') ?></button></div>
    <form action="<?= e(url('search')) ?>" method="get" class="drawer-search"><input type="search" name="q" placeholder="Search" aria-label="Search"></form>
    <ul class="drawer-list">
      <li><a href="<?= e(url('latest')) ?>">Latest news</a></li>
      <?php foreach ($menu as $c): ?>
        <li><a href="<?= e(category_url($c)) ?>"><?= e($c['name']) ?></a>
          <?php if ($kids = category_children((int) $c['id'])): ?><ul><?php foreach ($kids as $k): ?><li><a href="<?= e(category_url($k)) ?>"><?= e($k['name']) ?></a></li><?php endforeach; ?></ul><?php endif; ?>
        </li>
      <?php endforeach; ?>
      <li><a href="<?= e(url('archive')) ?>">Archive since <?= e(setting('founding_year', '2015')) ?></a></li>
      <li><a href="<?= e(url('photos')) ?>">Photo store</a></li>
    </ul>
  </div>
</div>

<?= ($ha = ad('header')) ? '<div class="wrap ad-wrap">' . $ha . '</div>' : '' ?>

<main id="main">
<?= $content ?>
</main>

<?= ($fa = ad('footer')) ? '<div class="wrap ad-wrap">' . $fa . '</div>' : '' ?>

<footer class="site-footer">
  <div class="wrap">
    <div class="footer-top">
      <a href="<?= e(url('')) ?>" class="footer-logo"><img src="<?= e(url('assets/img/logo-white.svg')) ?>" alt="<?= e(site_name()) ?>" width="260" height="89" loading="lazy"></a>
      <div class="footer-alerts">
        <p>Get breaking news on your phone or computer — free, no account needed.</p>
        <button type="button" class="btn btn-light js-alerts"><?= icon('bell') ?> Turn on news alerts</button>
      </div>
    </div>
    <div class="footer-cols">
      <nav aria-label="Sections"><h3>Sections</h3>
        <ul><?php foreach (array_slice($menu, 0, 12) as $c): ?><li><a href="<?= e(category_url($c)) ?>"><?= e($c['name']) ?></a></li><?php endforeach; ?></ul>
      </nav>
      <nav aria-label="About"><h3><?= e(site_name()) ?></h3>
        <ul>
          <?php foreach (footer_pages() as $p): ?><li><a href="<?= e(url($p['slug'])) ?>"><?= e($p['title']) ?></a></li><?php endforeach; ?>
          <li><a href="<?= e(url('contact')) ?>">Contact us</a></li>
        </ul>
      </nav>
      <nav aria-label="More"><h3>More</h3>
        <ul>
          <li><a href="<?= e(url('latest')) ?>">Latest news</a></li>
          <li><a href="<?= e(url('archive')) ?>">Archive since <?= e(setting('founding_year', '2015')) ?></a></li>
          <li><a href="<?= e(url('photos')) ?>">Photo store for media</a></li>
          <li><a href="<?= e(url('feed')) ?>"><?= icon('rss') ?> RSS</a></li>
        </ul>
      </nav>
    </div>
    <div class="footer-bottom">
      <div class="social"><?= social_links() ?></div>
      <p>© <?= e(setting('founding_year', '2015')) ?>–<?= date('Y') ?> <?= e(site_name()) ?>. All rights reserved. <?= e(setting('footer_note')) ?></p>
    </div>
  </div>
</footer>

<div class="alerts-prompt" hidden role="dialog" aria-labelledby="alerts-title">
  <div class="alerts-icon"><?= icon('bell') ?></div>
  <div class="alerts-text"><strong id="alerts-title">Never miss a big story</strong><p>Turn on free alerts for breaking news.</p></div>
  <div class="alerts-actions"><button type="button" class="btn js-alerts-yes">Turn on</button><button type="button" class="btn-link js-alerts-no">Not now</button></div>
</div>
<div class="toast" role="status" aria-live="polite" hidden></div>
<?= ($ma = ad('mobile_anchor')) ? '<div class="mobile-anchor">' . $ma . '<button type="button" class="js-anchor-close" aria-label="Close ad">' . icon('close') . '</button></div>' : '' ?>

<script src="<?= e(asset('js/site.js')) ?>" nonce="<?= $nonce ?>" defer></script>
</body>
</html>
