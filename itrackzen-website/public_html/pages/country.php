<?php
$c = $COUNTRY; $name = $c['name'];
set_breadcrumbs([['GPS Tracking ' . $name, '/' . $c['slug']]]);
add_ld(ld_service('GPS Tracking and Fleet Management in ' . $name, $c['description'], '/' . $c['slug']));
add_ld(ld_faq([
    ['q' => 'Does ITrackZen provide GPS tracking in ' . $name . '?', 'a' => 'Yes. ITrackZen supports businesses in ' . $name . ' with real-time vehicle tracking, fleet management, fuel monitoring and AI dashcams. Tracking works wherever your trackers have mobile data coverage.'],
    ['q' => 'Can I use my own GPS trackers in ' . $name . '?', 'a' => 'In most cases yes. ITrackZen supports many GPS tracker models and protocols. Contact us with your device model and we will confirm compatibility.'],
]));
layout_start(['title' => $c['title'], 'description' => $c['description'], 'keywords' => $c['keywords'], 'path' => '/' . $c['slug']]);
page_hero($c['h1'], $c['intro'][0], $name);
$feat = [['icon' => 'pin', 'title' => 'Real-time vehicle tracking', 'text' => 'Live map, speed, ignition and location history for every vehicle in ' . $name . '.', 'href' => '/gps-tracking-services'], ['icon' => 'fuel', 'title' => 'Fuel monitoring', 'text' => 'Detect fuel theft and control consumption with compatible sensors.', 'href' => '/gps-tracking-services#fuel'], ['icon' => 'camera', 'title' => 'AI dashcam', 'text' => 'Driver distraction, drowsiness and phone-use alerts with video evidence.', 'href' => '/ai-dashcam-video-telematics'], ['icon' => 'dashboard', 'title' => 'Fleet management', 'text' => 'Reports, maintenance reminders and driver scores in one dashboard.', 'href' => '/fleet-management'], ['icon' => 'chip', 'title' => 'Any supported tracker', 'text' => 'Teltonika, Concox, Queclink, Meitrack and many more.', 'href' => '/supported-gps-trackers'], ['icon' => 'geofence', 'title' => 'Geofencing & alerts', 'text' => 'Zones, overspeed, route deviation and SOS alerts.', 'href' => '/gps-tracking-services#alerts']];
?>
<section class="section">
  <div class="container split">
    <div class="split-copy reveal">
      <p class="eyebrow">Vehicle tracking in <?= e($name) ?></p>
      <h2>Fleet tracking built for <?= e($name) ?></h2>
      <p><?= e($c['intro'][1]) ?></p>
      <p><?= e($c['extra']) ?></p>
      <p><strong>Typical routes and corridors:</strong> <?= e($c['corridor']) ?>.</p>
      <div class="btn-row"><a class="btn btn-primary" href="/contact-sales?service=GPS+vehicle+tracking">Get a quote for <?= e($name) ?></a><a class="btn btn-outline" href="/demo">Request demo</a></div>
    </div>
    <div class="split-art reveal"><?= art_truck() ?></div>
  </div>
</section>
<section class="section alt"><div class="container">
  <?php section_head('Services', 'GPS tracking services available in ' . $name); ?>
  <div class="grid grid-3"><?php foreach ($feat as $f) { feature_card($f); } ?></div>
</div></section>
<section class="section"><div class="container split">
  <div class="split-copy reveal"><p class="eyebrow">Who we help</p><h2>Industries we serve in <?= e($name) ?></h2><?php check_list($c['sectors']); ?></div>
  <div class="split-copy reveal"><p class="eyebrow">Cities</p><h2>Tracking in major cities and corridors</h2>
    <p>Our platform tracks vehicles in <?= e(implode(', ', array_slice($c['cities'], 0, -1))) ?> and <?= e(end($c['cities'])) ?>, and across the routes between them.</p>
    <ul class="tag-list big"><?php foreach ($c['cities'] as $city): ?><li><?= e($city) ?></li><?php endforeach; ?></ul>
    <p class="muted">Other regions: <?php foreach (data('countries')['items'] as $o): if ($o['slug'] !== $c['slug']): ?><a href="/<?= e($o['slug']) ?>"><?= e($o['name']) ?></a> <?php endif; endforeach; ?></p>
  </div>
</div></section>
<?php cta_band('Start tracking your fleet in ' . $name, 'Share your vehicle types and routes and we will recommend the right trackers, sensors and plan.'); layout_end();
