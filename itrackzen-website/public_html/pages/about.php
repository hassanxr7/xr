<?php
$m = page_meta('about'); $a = data('about'); $countries = data('countries')['items'] ?? [];
set_breadcrumbs([['About Us', '/about-us']]);
layout_start(['title' => $m['title'], 'description' => $m['description'], 'keywords' => $m['keywords'], 'path' => '/about-us']);
page_hero($m['h1'], $a['intro'], site('tagline'), '', 'mombasa-tusks');
?>
<section class="section">
  <div class="container split">
    <div class="split-copy reveal">
      <p class="eyebrow">Our mission</p>
      <h2>Professional fleet visibility, made accessible</h2>
      <p><?= e($a['mission']) ?></p>
      <p>ITrackZen is part of <?= e(site('company')) ?>, whose focus is logistics technology. We combine <a href="/gps-tracking-services">GPS tracking services</a>, <a href="/fleet-management">fleet management software</a> and <a href="/ai-dashcam-video-telematics">AI dashcams</a> into a single, practical platform.</p>
      <div class="btn-row"><a class="btn btn-primary" href="/contact-sales">Talk to our team</a><a class="btn btn-outline" href="/demo">Try the demo</a></div>
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
    <div class="split-art reveal photo-stack"><?= photo('addis-three-wheeler', 'photo', '(max-width: 900px) 100vw, 540px') ?><?= photo('uganda-banana-truck', 'photo photo-b', '(max-width: 900px) 60vw, 300px') ?></div>
    <div class="split-copy reveal">
      <p class="eyebrow">Why ITrackZen</p>
      <h2>Why businesses choose us</h2>
      <?php check_list($a['why']); ?>
      <div class="btn-row"><a class="btn btn-primary" href="/request-quote">Request a quote</a><a class="btn btn-outline" href="/partnerships">Partner with us</a></div>
    </div>
  </div>
</section>
<section class="section">
  <div class="container split">
    <div class="split-copy reveal">
      <p class="eyebrow">Coverage</p>
      <h2><?= e($a['regions_heading']) ?></h2>
      <p><?= e($a['regions_text']) ?></p>
      <ul class="tag-list big"><?php foreach ($countries as $c): ?><li><a href="/<?= e($c['slug']) ?>"><?= e($c['name']) ?></a></li><?php endforeach; ?></ul>
    </div>
    <div class="split-art reveal"><?= photo('mombasa-tusks', 'photo', '(max-width: 900px) 100vw, 560px') ?></div>
  </div>
</section>
<section class="section alt">
  <div class="container">
    <?php section_head('The roads we build for', 'Moving fleets across East and Central Africa', 'Real roads, real traffic: long corridors, busy city streets and mixed fleets of trucks, buses, minibuses and motorcycles.'); ?>
    <div class="gallery">
      <?php foreach (($a['gallery'] ?? []) as $g): ?><figure class="reveal"><?= photo($g['photo'], 'gal-img', '(max-width: 700px) 100vw, 380px') ?><figcaption><?= e($g['caption']) ?></figcaption></figure><?php endforeach; ?>
    </div>
    <p class="center fine mt">Photographs are credited on the <a href="/image-credits">image credits</a> page.</p>
  </div>
</section>
<?php cta_band(); layout_end();
