<?php
defined('APP') || exit;
$wa = whatsapp_link(t('wa_hello'));
?>
</main>
<footer class="site-footer">
  <div class="container footer-grid">
    <div>
      <a class="brand brand-light" href="<?= e(url('')) ?>"><?= site_logo(true) ?></a>
      <p class="footer-text"><?= e(setting('site_tagline')) ?></p>
    </div>
    <div>
      <h4><?= e(t('footer_links')) ?></h4>
      <a href="<?= e(url('')) ?>#exchange"><?= e(t('nav_exchange')) ?></a>
      <a href="<?= e(url('')) ?>#rates"><?= e(t('nav_rates')) ?></a>
      <a href="<?= e(url('track.php')) ?>"><?= e(t('nav_track')) ?></a>
      <a href="<?= e(url('terms.php')) ?>"><?= e(t('terms')) ?></a>
    </div>
    <div>
      <h4><?= e(t('footer_contact')) ?></h4>
      <?php if (setting('contact_phone') !== ''): ?><a href="tel:<?= e(setting('contact_phone')) ?>"><?= icon('phone', 15) ?> <?= e(setting('contact_phone')) ?></a><?php endif; ?>
      <?php if ($wa !== ''): ?><a href="<?= e($wa) ?>" target="_blank" rel="noopener"><?= icon('whatsapp', 15) ?> WhatsApp</a><?php endif; ?>
      <?php if (setting('contact_email') !== ''): ?><a href="mailto:<?= e(setting('contact_email')) ?>"><?= icon('mail', 15) ?> <?= e(setting('contact_email')) ?></a><?php endif; ?>
      <?php if (setting('contact_address') !== ''): ?><span><?= icon('pin', 15) ?> <?= e(setting('contact_address')) ?></span><?php endif; ?>
      <span><?= icon('clock', 15) ?> <?= e(t('working_hours')) ?>: <?= e(setting('working_hours', '24/7')) ?></span>
    </div>
  </div>
  <div class="container footer-bottom">
    <span>&copy; <?= date('Y') ?> <?= e(setting('site_name', 'XR Exchange')) ?>. <?= e(t('rights')) ?></span>
  </div>
</footer>
<?php if ($wa !== ''): ?>
<a class="wa-float" href="<?= e($wa) ?>" target="_blank" rel="noopener" aria-label="WhatsApp"><?= icon('whatsapp', 26) ?></a>
<?php endif; ?>
<script src="<?= e(asset('js/app.js')) ?>"></script>
</body>
</html>
