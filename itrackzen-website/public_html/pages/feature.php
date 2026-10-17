<?php
// Generic feature page rendered from data/features.json  ($FEATURE_SLUG set by router)
$slug = $FEATURE_SLUG; $f = data('features')['pages'][$slug] ?? null; if (!$f) { http_response_code(404); require __DIR__ . '/404.php'; return; }
$m = page_meta($f['pagekey']); $path = '/' . $slug;
set_breadcrumbs([[$m['h1'], $path]]);
add_ld(ld_service($m['h1'], $m['description'], $path));
if (!empty($f['faq'])) { add_ld(ld_faq($f['faq'])); }
layout_start(['title' => $m['title'], 'description' => $m['description'], 'keywords' => $m['keywords'], 'path' => $path]);
page_hero($m['h1'], $f['intro'], $f['eyebrow'], art_frame(['fuel-monitoring' => art_gauge(), 'driver-behaviour-safety' => art_scene('camera'), 'alerts-geofencing-reports' => art_scene('alerts')][$slug] ?? art_vehicle('truck')));
?>
<section class="section">
  <div class="container split">
    <div class="split-copy reveal">
      <?php foreach ($f['sections'] as $sec): ?>
        <h2><?= e($sec['title']) ?></h2><?php check_list($sec['points']); ?>
      <?php endforeach; ?>
    </div>
    <div class="split-art reveal"><?php $img = cms_img($f['image'] ?? '', $f['image_alt'] ?? '', 'photo', 800, 600); echo $img ?: '<div class="art-tile"><span class="ico-wrap xl">' . icon($f['icon']) . '</span>' . art_tracker($slug === 'fuel-monitoring' ? 'wired' : ($slug === 'driver-behaviour-safety' ? 'cam' : '4g')) . '</div>'; ?></div>
  </div>
</section>
<section class="section alt"><div class="container narrow">
  <h2 class="center reveal">Requirements and limits</h2><p class="center muted reveal">We describe what depends on your hardware, plan and installation so there are no surprises.</p>
  <?php check_list($f['conditions'], 'checks cond'); ?>
  <div class="btn-row center"><a class="btn btn-primary" href="/request-quote">Request a quote</a><a class="btn btn-outline" href="/supported-gps-trackers">Check supported trackers</a><a class="btn btn-outline" href="<?= e(platform_url('demo')) ?>" target="_blank" rel="noopener">Try the demo</a></div>
</div></section>
<?php if (!empty($f['faq'])): ?><section class="section"><div class="container narrow"><?php section_head('FAQ', 'Common questions'); faq_list($f['faq'], true); ?></div></section><?php endif; ?>
<section class="section alt tight"><div class="container"><?php section_head('Related', 'More ITrackZen services'); ?><div class="grid grid-3">
<?php foreach ([['pin', 'GPS Tracking & Fleet Management', '/gps-tracking-services'], ['camera', 'AI Dashcams & Video Telematics', '/ai-dashcam-video-telematics'], ['fuel', 'Fuel Monitoring', '/fuel-monitoring'], ['driver', 'Driver Behaviour & Safety', '/driver-behaviour-safety'], ['bell', 'Alerts, Geofencing & Reports', '/alerts-geofencing-reports'], ['chip', 'Supported Trackers & Accessories', '/supported-gps-trackers']] as [$i, $t, $h]) { if ($h === $path) { continue; } feature_card(['icon' => $i, 'title' => $t, 'text' => '', 'href' => $h]); } ?></div></div></section>
<?php cta_band(); layout_end();
