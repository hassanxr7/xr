<?php
defined('APP') || exit;
$siteName = setting('site_name', 'Hufan Exchange');
$docTitle = isset($pageTitle) ? $pageTitle . ' · ' . $siteName : $siteName . ' — ' . setting('site_tagline');
$me = user();
$current = basename($_SERVER['SCRIPT_NAME'] ?? '');
$announcement = setting('announcement');
?><!doctype html>
<html lang="<?= e(lang()) ?>">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title><?= e($docTitle) ?></title>
<meta name="description" content="<?= e(setting('site_tagline')) ?>">
<meta name="theme-color" content="<?= e(brand_color()) ?>">
<meta property="og:title" content="<?= e($docTitle) ?>">
<meta property="og:description" content="<?= e(setting('site_tagline')) ?>">
<meta property="og:image" content="<?= e(full_url('assets/img/icon-512.png')) ?>">
<link rel="icon" href="<?= e(asset('img/favicon.svg')) ?>" type="image/svg+xml">
<link rel="apple-touch-icon" href="<?= e(asset('img/apple-touch-icon.png')) ?>">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">
<link rel="stylesheet" href="<?= e(asset('css/app.css')) ?>">
<style>:root{--brand:<?= e(brand_color()) ?>}</style>
</head>
<body class="<?= e($bodyClass ?? '') ?>">
<?php if ($announcement !== ''): ?>
<div class="announce"><div class="container"><?= icon('info', 16) ?> <?= e($announcement) ?></div></div>
<?php endif; ?>
<header class="site-header">
  <div class="container nav">
    <a class="brand" href="<?= e(url('')) ?>"><?= site_logo() ?></a>
    <button class="nav-toggle" type="button" data-toggle="#site-nav" aria-label="Menu"><?= icon('menu', 22) ?></button>
    <nav class="nav-links" id="site-nav">
      <a href="<?= e(url('')) ?>#exchange" class="<?= $current === 'index.php' ? 'active' : '' ?>"><?= e(t('nav_exchange')) ?></a>
      <a href="<?= e(url('')) ?>#rates"><?= e(t('nav_rates')) ?></a>
      <a href="<?= e(url('track.php')) ?>" class="<?= $current === 'track.php' ? 'active' : '' ?>"><?= e(t('nav_track')) ?></a>
      <span class="nav-sep"></span>
      <a class="lang-switch" href="<?= e(query_with(['lang' => lang() === 'so' ? 'en' : 'so', 'page' => null])) ?>" title="Language"><?= icon('globe', 16) ?> <?= lang() === 'so' ? 'EN' : 'SO' ?></a>
      <?php if ($me): ?>
        <a href="<?= e(url('account.php')) ?>" class="<?= in_array($current, ['account.php', 'order.php', 'profile.php'], true) ? 'active' : '' ?>"><?= icon('user', 16) ?> <?= e(t('nav_account')) ?></a>
        <a href="<?= e(url('statement.php')) ?>" class="<?= $current === 'statement.php' ? 'active' : '' ?>"><?= icon('file', 16) ?> <?= e(t('nav_statement')) ?></a>
        <form method="post" action="<?= e(url('logout.php')) ?>" class="inline"><?= csrf_field() ?><button class="link-btn" type="submit"><?= icon('logout', 16) ?> <?= e(t('nav_logout')) ?></button></form>
      <?php else: ?>
        <a href="<?= e(url('login.php')) ?>" class="<?= $current === 'login.php' ? 'active' : '' ?>"><?= e(t('nav_login')) ?></a>
        <a href="<?= e(url('register.php')) ?>" class="btn btn-primary btn-sm"><?= e(t('nav_register')) ?></a>
      <?php endif; ?>
    </nav>
  </div>
</header>
<main class="site-main">
<?php $flashHtml = render_flashes(); if ($flashHtml !== ''): ?>
<div class="container flash-wrap"><?= $flashHtml ?></div>
<?php endif; ?>
