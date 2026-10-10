<?php
$m = page_meta('thanks'); $type = $_GET['type'] ?? 'sales';
$msg = ['demo' => 'Your demo request has been received.', 'delete' => 'Your deletion request has been received.'][$type] ?? 'Your message has been received.';
layout_start(['title' => $m['title'], 'description' => $m['description'], 'path' => '/thank-you', 'noindex' => true]);
?>
<section class="section"><div class="container narrow center thanks reveal">
  <span class="ico-wrap xl ok"><?= icon('check') ?></span>
  <h1>Thank you!</h1>
  <p class="lead-sm"><?= e($msg) ?> A member of the <?= e(site('brand')) ?> team will get back to you shortly by email or WhatsApp.</p>
  <div class="btn-row center"><a class="btn btn-primary" href="/">Back to home</a><a class="btn btn-outline" href="/supported-gps-trackers">Browse supported trackers</a><a class="btn btn-outline" href="/gps-tracking-services">Explore services</a></div>
</div></section>
<?php layout_end();
