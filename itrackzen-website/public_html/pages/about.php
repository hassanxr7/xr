<?php
$m = page_meta('about'); $a = data('about'); $countries = data('countries')['items'] ?? [];
set_breadcrumbs([['About Us', '/about-us']]);
layout_start(['title' => $m['title'], 'description' => $m['description'], 'keywords' => $m['keywords'], 'path' => '/about-us']);
page_hero($m['h1'], $a['intro'], site('tagline'));
?>
<section class="section">
  <div class="container split">
    <div class="split-copy reveal">
      <p class="eyebrow">Our mission</p>
      <h2>Professional fleet visibility, made accessible</h2>
      <p><?= e($a['mission']) ?></p>
      <p>ITrackZen is part of <?= e(site('company')) ?>, whose focus is logistics technology. We combine <a href="/gps-tracking-services">GPS tracking services</a>, <a href="/fleet-management">fleet management software</a> and <a href="/ai-dashcam-video-telematics">AI dashcams</a> into a single, practical platform.</p>
      <div class="btn-row"><a class="btn btn-primary" href="/contact-sales">Talk to our team</a><a class="btn btn-outline" href="/demo">Request a demo</a></div>
    </div>
    <div class="split-art reveal"><?= art_dashboard() ?></div>
  </div>
</section>
<section class="section alt">
  <div class="container">
    <?php section_head('What we do', 'Three pillars of the ITrackZen platform'); ?>
    <div class="grid grid-3"><?php foreach ($a['pillars'] as $p) { feature_card($p); } ?></div>
  </div>
</section>
<section class="section">
  <div class="container">
    <?php section_head('Our values', 'How we work with every customer'); ?>
    <div class="grid grid-4"><?php foreach ($a['values'] as $p) { feature_card($p); } ?></div>
  </div>
</section>
<section class="section alt">
  <div class="container split">
    <div class="split-copy reveal">
      <p class="eyebrow">Why ITrackZen</p>
      <h2>Why businesses choose us</h2>
      <?php check_list($a['why']); ?>
    </div>
    <div class="split-copy reveal">
      <p class="eyebrow">Coverage</p>
      <h2><?= e($a['regions_heading']) ?></h2>
      <p><?= e($a['regions_text']) ?></p>
      <ul class="tag-list big"><?php foreach ($countries as $c): ?><li><a href="/<?= e($c['slug']) ?>"><?= e($c['name']) ?></a></li><?php endforeach; ?></ul>
    </div>
  </div>
</section>
<?php cta_band(); layout_end();
