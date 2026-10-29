<?php
/** @var array $o */
defined('APP') || exit;
$lic = LICENCES[$o['licence']][0] ?? $o['licence'];
?>
<div class="wrap page-wrap">
  <article class="article static-page">
    <header class="article-head"><h1>Your photo order</h1>
      <p class="standfirst">Reference <strong><?= e($o['ref']) ?></strong> · <?= e($o['title']) ?> · <?= e($lic) ?> · <?= e(money((int) $o['amount'], $o['currency'])) ?></p></header>
    <?php if ($o['status'] === 'paid'): ?>
      <div class="notice notice-success">Payment received — thank you. The download link was also emailed to <?= e($o['buyer_email']) ?>.</div>
      <?php if ($o['download_expires'] >= now() && $o['downloads'] < (int) setting('download_limit', '5')): ?>
        <p><a class="btn" href="<?= e(url('photos/download/' . $o['download_token'])) ?>">Download the original</a></p>
        <p class="facts">Available until <?= e(fmt_date($o['download_expires'], 'F j, Y')) ?> · <?= (int) $o['downloads'] ?> of <?= (int) setting('download_limit', '5') ?> downloads used.</p>
      <?php else: ?>
        <p class="facts">This download link has expired. Contact us with your reference to receive a new one.</p>
      <?php endif; ?>
    <?php elseif ($o['status'] === 'request'): ?>
      <div class="notice notice-success">We received your licence request. Our team will email you the payment details shortly.</div>
    <?php elseif ($o['status'] === 'pending'): ?>
      <div class="notice">We are waiting for the payment confirmation. This page updates when you refresh it.</div>
    <?php else: ?>
      <div class="notice notice-error">This order was cancelled.</div>
    <?php endif; ?>
    <p><a href="<?= e(url('photos/' . $o['slug'])) ?>">← Back to the photo</a> · <a href="<?= e(url('contact')) ?>">Contact us</a></p>
  </article>
</div>
