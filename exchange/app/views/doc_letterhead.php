<?php
/**
 * Letterhead for printable documents.
 * Expects: $docHeading, $docSubheading, $docMeta (array label => value)
 */
defined('APP') || exit;
$siteName = setting('site_name', 'Hufan Exchange');
$contact = array_filter([
    setting('contact_phone') !== '' ? icon('phone', 11) . ' ' . e(setting('contact_phone')) : '',
    setting('contact_email') !== '' ? icon('mail', 11) . ' ' . e(setting('contact_email')) : '',
    icon('globe', 11) . ' ' . e(preg_replace('#^https?://#', '', rtrim(full_url(''), '/'))),
    setting('contact_address') !== '' ? icon('pin', 11) . ' ' . e(setting('contact_address')) : '',
]);
?>
<div class="doc-watermark" aria-hidden="true"><?= e($siteName) ?></div>
<div class="doc-band"></div>
<header class="doc-head">
  <div class="doc-brand">
    <?php if (setting('logo') !== ''): ?>
      <img class="doc-logo-img" src="<?= e(url(setting('logo'))) ?>" alt="<?= e($siteName) ?>">
    <?php else: ?>
      <img class="doc-logo" src="<?= e(asset('img/logo-mark.svg')) ?>" width="48" height="48" alt="">
    <?php endif; ?>
    <div>
      <div class="doc-company"><?= wordmark($siteName) ?></div>
      <div class="doc-tagline"><?= e(setting('site_tagline')) ?></div>
      <div class="doc-contact"><?= implode('<span class="dot">•</span>', $contact) ?></div>
    </div>
  </div>
  <div class="doc-title">
    <h1><?= e($docHeading) ?></h1>
    <div class="doc-title-alt"><?= e($docSubheading) ?></div>
    <table class="doc-meta">
      <?php foreach ($docMeta as $label => $value): ?>
        <tr><th><?= e($label) ?></th><td><?= e($value) ?></td></tr>
      <?php endforeach; ?>
    </table>
  </div>
</header>
