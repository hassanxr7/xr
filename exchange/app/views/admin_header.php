<?php
defined('APP') || exit;
$adm = admin();
$siteName = setting('site_name', 'Hufan Exchange');
$current = basename($_SERVER['SCRIPT_NAME'] ?? '');
$pendingCount = (int) val("SELECT COUNT(*) FROM orders WHERE status IN ('pending','processing')");
$nav = [
    ['index.php', 'grid', t('a_dashboard'), ['index.php']],
    ['orders.php', 'list', t('a_orders'), ['orders.php', 'order.php']],
    ['pairs.php', 'swap', t('a_pairs'), ['pairs.php', 'pair_edit.php']],
    ['gateways.php', 'wallet', t('a_gateways'), ['gateways.php', 'gateway_edit.php']],
    ['customers.php', 'users', t('a_customers'), ['customers.php', 'customer.php']],
    ['reports.php', 'chart', t('a_reports'), ['reports.php']],
    ['sovamoney_withdraw.php', 'download', t('a_swd_nav'), ['sovamoney_withdraw.php']],
    ['settings.php', 'settings', t('a_settings'), ['settings.php']],
    ['admins.php', 'shield', t('a_admins'), ['admins.php']],
];
?><!doctype html>
<html lang="<?= e(lang()) ?>">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title><?= e(($pageTitle ?? t('a_dashboard')) . ' · Admin · ' . $siteName) ?></title>
<link rel="icon" href="<?= e(asset('img/favicon.svg')) ?>" type="image/svg+xml">
<link rel="apple-touch-icon" href="<?= e(asset('img/apple-touch-icon.png')) ?>">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap">
<link rel="stylesheet" href="<?= e(asset('css/app.css')) ?>">
<link rel="stylesheet" href="<?= e(asset('css/admin.css')) ?>">
<style>:root{--brand:<?= e(brand_color()) ?>}</style>
</head>
<body class="admin">
<aside class="sidebar" id="sidebar">
  <a class="brand brand-light sidebar-brand" href="<?= e(url('admin/')) ?>"><?= site_logo(true) ?></a>
  <nav class="side-nav">
    <?php foreach ($nav as [$file, $ic, $label, $files]): ?>
      <a href="<?= e(url('admin/' . $file)) ?>" class="<?= in_array($current, $files, true) ? 'active' : '' ?>">
        <?= icon($ic, 18) ?> <span><?= e($label) ?></span>
        <?php if ($file === 'orders.php' && $pendingCount > 0): ?><em class="side-count"><?= $pendingCount ?></em><?php endif; ?>
      </a>
    <?php endforeach; ?>
  </nav>
  <div class="side-foot">
    <a href="<?= e(url('')) ?>" target="_blank"><?= icon('external', 16) ?> <span><?= e(t('a_view_site')) ?></span></a>
  </div>
</aside>
<div class="admin-main">
  <header class="topbar">
    <button class="nav-toggle" type="button" data-toggle="#sidebar" aria-label="Menu"><?= icon('menu', 22) ?></button>
    <h1 class="topbar-title"><?= e($pageTitle ?? t('a_dashboard')) ?></h1>
    <div class="topbar-right">
      <a class="btn btn-ghost btn-sm" href="<?= e(query_with(['lang' => lang() === 'so' ? 'en' : 'so'])) ?>"><?= icon('globe', 16) ?> <?= lang() === 'so' ? 'EN' : 'SO' ?></a>
      <a class="btn btn-ghost btn-sm" href="<?= e(url('admin/profile.php')) ?>"><?= icon('user', 16) ?> <span class="hide-sm"><?= e($adm['name'] ?? '') ?></span></a>
      <form method="post" action="<?= e(url('admin/logout.php')) ?>" class="inline"><?= csrf_field() ?><button class="btn btn-outline btn-sm" type="submit" title="<?= e(t('nav_logout')) ?>"><?= icon('logout', 16) ?></button></form>
    </div>
  </header>
  <div class="admin-content">
    <?= render_flashes() ?>
