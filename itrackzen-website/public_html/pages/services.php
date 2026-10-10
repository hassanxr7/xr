<?php
$m = page_meta('services'); $cats = data('services')['categories'] ?? [];
set_breadcrumbs([['GPS Tracking Services', '/gps-tracking-services']]);
add_ld(ld_service('GPS Tracking Services', $m['description'], '/gps-tracking-services', array_map(fn($i) => $i['title'], all_service_items())));
layout_start(['title' => $m['title'], 'description' => $m['description'], 'keywords' => $m['keywords'], 'path' => '/gps-tracking-services']);
page_hero($m['h1'], 'Real-time vehicle tracking, route history, geofencing, smart alerts, fuel monitoring, driver ID, sensors, reports and AI video: every capability your fleet needs, on one platform.', 'GPS Tracking Services');
?>
<nav class="subnav" aria-label="Service categories"><div class="container"><?php foreach ($cats as $c): ?><a href="#<?= e($c['id']) ?>"><?= e($c['title']) ?></a><?php endforeach; ?></div></nav>
<?php foreach ($cats as $n => $c): ?>
<section class="section<?= $n % 2 ? ' alt' : '' ?>" id="<?= e($c['id']) ?>">
  <div class="container">
    <?php section_head($c['summary'], $c['title']); ?>
    <div class="grid grid-3"><?php foreach ($c['items'] as $it) { feature_card($it); } ?></div>
    <?php if ($c['id'] === 'video'): ?><p class="center mt-lg"><a class="btn btn-primary" href="/ai-dashcam-video-telematics">Learn about AI dashcams <?= icon('arrow') ?></a></p><?php endif; ?>
  </div>
</section>
<?php endforeach; ?>
<section class="section">
  <div class="container narrow center reveal">
    <h2>Works with the trackers you already use</h2>
    <p>ITrackZen supports many GPS tracker models and protocols, including Teltonika, Concox, Queclink, Meitrack, Ruptela and Jimi IoT. Browse the full list or ask us to check your device.</p>
    <div class="btn-row center"><a class="btn btn-primary" href="/supported-gps-trackers">Supported GPS trackers</a><a class="btn btn-outline" href="/fleet-management">Fleet management</a></div>
  </div>
</section>
<?php cta_band(); layout_end();
