<?php
$m = page_meta('dashcam'); $d = data('dashcam');
set_breadcrumbs([['AI Dashcam & Video Telematics', '/ai-dashcam-video-telematics']]);
add_ld(ld_service('AI Dashcam & Video Telematics', $m['description'], '/ai-dashcam-video-telematics', array_map(fn($i) => $i['title'], $d['detections'])));
layout_start(['title' => $m['title'], 'description' => $m['description'], 'keywords' => $m['keywords'], 'path' => '/ai-dashcam-video-telematics']);
page_hero($m['h1'], $d['intro'], 'AI Dashcam & Video Telematics');
?>
<section class="section">
  <div class="container split">
    <div class="split-art reveal scene-box"><?= art_scene('camera') ?></div>
    <div class="split-copy reveal">
      <p class="eyebrow">Front camera + in-cabin camera</p>
      <h2>Video evidence linked to every GPS event</h2>
      <p>Dual-lens AI dashcams record the road ahead and watch for risky behaviour inside the cabin. Each event is time-stamped and tied to location, speed and sensor data so you get the full story, not just a clip.</p>
      <?php check_list($d['benefits']); ?>
      <div class="btn-row"><a class="btn btn-primary" href="/demo">See it in a demo</a><a class="btn btn-outline" href="/supported-gps-trackers#cam">Supported dashcams</a></div>
    </div>
  </div>
</section>
<section class="section alt">
  <div class="container">
    <?php section_head('AI detection', 'What the AI dashcam can detect', 'Detection availability depends on the camera model and installation.'); ?>
    <div class="grid grid-3"><?php foreach ($d['detections'] as $x) { feature_card($x); } ?></div>
  </div>
</section>
<section class="section">
  <div class="container">
    <?php section_head('How it works', 'From risky moment to coaching in four steps'); ?>
    <ol class="steps"><?php foreach ($d['how'] as $s): ?><li class="reveal"><span class="step-n"><?= e($s['n']) ?></span><h3><?= e($s['title']) ?></h3><p><?= e($s['text']) ?></p></li><?php endforeach; ?></ol>
  </div>
</section>
<section class="section alt">
  <div class="container split">
    <div class="split-art reveal"><?= art_tracker('cam') ?></div>
    <div class="split-copy reveal">
      <p class="eyebrow">Hardware</p>
      <h2>AI dashcams for trucks, buses, taxis and more</h2>
      <p>We work with AI dashcams and mobile DVR systems from leading manufacturers, including Jimi IoT JC-series and Teltonika DualCam, and can advise on the best option for your vehicles and network conditions.</p>
      <p class="note"><?= icon('shield') ?><span><?= e($d['privacy_note']) ?></span></p>
    </div>
  </div>
</section>
<?php cta_band('Make every journey safer with AI video', 'Ask for a live demonstration of AI dashcam alerts, video review and driver coaching.'); layout_end();
