<?php
$m = page_meta('thanks'); $type = $_GET['type'] ?? 'sales';
$msg = ['demo' => 'Your demo request has been received.', 'quote' => 'Your quote request has been received.', 'partner' => 'Your partnership enquiry has been received.'][$type] ?? 'Your message has been received.';
$ref = preg_match('/^[A-Z]{3}-[0-9]{6}-[A-Z0-9]{5}$/', $_GET['ref'] ?? '') ? $_GET['ref'] : '';
layout_start(['title' => $m['title'], 'description' => $m['description'], 'path' => '/thank-you', 'noindex' => true]);
?>
<section class="section"><div class="container narrow center thanks reveal">
  <span class="ico-wrap xl ok"><?= icon('check') ?></span>
  <h1>Thank you!</h1>
  <p class="lead-sm"><?= e($msg) ?><?= $ref ? ' Your reference is ' . e($ref) . '.' : '' ?> A member of the <?= e(site('brand')) ?> team will get back to you by email or WhatsApp. This did not create a tracking account.</p>
  <div class="btn-row center"><a class="btn btn-primary" href="/">Back to home</a><a class="btn btn-outline" href="/supported-gps-trackers">Browse supported trackers</a><a class="btn btn-outline" href="<?= e(platform_url('demo')) ?>" target="_blank" rel="noopener">Try the demo</a></div>
</div></section>
<?php layout_end();
