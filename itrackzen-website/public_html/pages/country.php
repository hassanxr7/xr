<?php
$c = $COUNTRY; $name = $c['name']; $path = '/' . $c['slug'];
set_breadcrumbs([['Countries', '/countries'], ['GPS Tracking ' . $name, $path]]);
add_ld(ld_service('GPS Tracking and Fleet Management in ' . $name, $c['description'], $path));
add_ld(ld_faq($c['faq']));
layout_start(['title' => $c['title'], 'description' => $c['description'], 'keywords' => $c['keywords'], 'path' => $path]);
page_hero($c['h1'], $c['hero_text'], $name, art_fleet_row());
$byslug = []; foreach (data('countries')['items'] as $o) { $byslug[$o['slug']] = $o; }
?>
<section class="section">
  <div class="container split">
    <div class="split-copy reveal">
      <p class="eyebrow">Market overview</p>
      <h2>Fleet tracking in <?= e($name) ?></h2>
      <p><?= e($c['snapshot']) ?></p>
      <p><strong>Typical routes:</strong> <?= e($c['corridors']) ?></p>
      <ul class="tag-list big"><?php foreach ($c['cities'] as $city): ?><li><?= e($city) ?></li><?php endforeach; ?></ul>
      <div class="btn-row"><a class="btn btn-primary" href="/request-quote?service=GPS+vehicle+tracking&amp;topic=<?= rawurlencode('Tracking in ' . $name) ?>">Request a quote for <?= e($name) ?></a><a class="btn btn-outline" href="<?= e(platform_url('demo')) ?>" target="_blank" rel="noopener">Try the demo</a></div>
    </div>
    <div class="split-art reveal"><?php $im = cms_img($c['image'] ?? '', $c['image_alt'] ?? '', 'photo', 800, 600); echo $im ?: art_truck(); ?></div>
  </div>
</section>
<section class="section alt"><div class="container">
  <?php section_head('Use cases', 'How ' . $name . ' businesses use ITrackZen'); ?>
  <div class="grid grid-4"><?php foreach ($c['use_cases'] as $u): ?><article class="card reveal"><h3><?= e($u['title']) ?></h3><p><?= e($u['text']) ?></p></article><?php endforeach; ?></div>
</div></section>
<section class="section"><div class="container">
  <?php section_head('Getting started', 'How to subscribe or request installation in ' . $name); ?>
  <ol class="steps three"><?php foreach ($c['steps'] as $i => $s): ?><li class="reveal"><span class="step-n"><?= $i + 1 ?></span><h3><?= e($s['title']) ?></h3><p><?= e($s['text']) ?></p></li><?php endforeach; ?></ol>
</div></section>
<section class="section alt"><div class="container split">
  <div class="split-copy reveal"><p class="eyebrow">Connectivity &amp; conditions</p><h2>What to know before you start</h2><p><?= e($c['connectivity']) ?></p><?php check_list($c['conditions']); ?></div>
  <div class="split-copy reveal"><p class="eyebrow">Cooperation</p><h2>Partners and corporate cooperation</h2><p><?= e($c['partners']) ?></p><div class="btn-row"><a class="btn btn-primary" href="/partnerships">Partnership enquiry</a></div><p class="fine">We do not currently claim local offices, installation teams or customers in <?= e($name) ?> on this website.</p></div>
</div></section>
<section class="section"><div class="container narrow"><?php section_head('FAQ', 'GPS tracking in ' . $name . ': questions'); faq_list($c['faq'], true); ?>
  <p class="center muted mt-lg">Also see:<?php foreach ($c['related'] as $r): if (isset($byslug[$r])): ?> <a href="/<?= e($r) ?>">GPS tracking in <?= e($byslug[$r]['name']) ?></a><?php endif; endforeach; ?> &middot; <a href="/countries">All countries</a> &middot; <a href="/supported-gps-trackers">Supported trackers</a></p></div></section>
<?php cta_band('Start tracking your fleet in ' . $name, 'Share your vehicle types and routes and we will tell you what we can support and how to begin.'); layout_end();
