<?php
$m = page_meta('fleet'); $f = data('fleet');
set_breadcrumbs([['Fleet Management', '/fleet-management']]);
add_ld(ld_service('Fleet Management Software', $m['description'], '/fleet-management', array_map(fn($i) => $i['title'], $f['modules'])));
layout_start(['title' => $m['title'], 'description' => $m['description'], 'keywords' => $m['keywords'], 'path' => '/fleet-management']);
page_hero($m['h1'], $f['intro'], 'Fleet Management');
?>
<section class="section">
  <div class="container split">
    <div class="split-art reveal"><?= art_dashboard() ?></div>
    <div class="split-copy reveal">
      <p class="eyebrow">One dashboard</p>
      <h2>See, manage and improve your entire fleet</h2>
      <p>The ITrackZen fleet management dashboard gives dispatchers, managers and owners a shared, real-time picture of vehicles, drivers, alerts and costs, on desktop and mobile.</p>
      <?php check_list(['Live status for every vehicle: moving, idle, parked or offline', 'Driver identification with RFID / iButton and behaviour scoring', 'Fuel, maintenance and compliance in the same view', 'Daily, weekly and monthly business reports']); ?>
      <div class="btn-row"><a class="btn btn-primary" href="/demo">Request a demo</a><a class="btn btn-outline" href="/pricing">View plans</a></div>
    </div>
  </div>
</section>
<section class="section alt">
  <div class="container">
    <?php section_head('Benefits', 'What better fleet control delivers'); ?>
    <div class="grid grid-3"><?php foreach ($f['benefits'] as $b) { feature_card($b); } ?></div>
  </div>
</section>
<section class="section">
  <div class="container">
    <?php section_head('Dashboard modules', 'Everything in one fleet management platform', 'Each module works on its own and together they form a complete GPS fleet management software suite.'); ?>
    <div class="grid grid-4"><?php foreach ($f['modules'] as $b) { feature_card($b); } ?></div>
  </div>
</section>
<section class="section alt">
  <div class="container">
    <?php section_head('Workflow', 'How fleet managers use ITrackZen every day'); ?>
    <ol class="steps"><?php foreach ($f['steps'] as $s): ?><li class="reveal"><span class="step-n"><?= e($s['n']) ?></span><h3><?= e($s['title']) ?></h3><p><?= e($s['text']) ?></p></li><?php endforeach; ?></ol>
  </div>
</section>
<section class="section">
  <div class="container narrow center reveal">
    <h2>Add fuel monitoring and AI video</h2>
    <p>Extend your fleet dashboard with <a href="/gps-tracking-services#fuel">fuel monitoring and theft detection</a> and <a href="/ai-dashcam-video-telematics">AI dashcams</a> for distraction, drowsiness and phone-use alerts.</p>
  </div>
</section>
<?php cta_band(); layout_end();
