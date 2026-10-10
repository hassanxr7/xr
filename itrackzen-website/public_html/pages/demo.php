<?php
$m = page_meta('demo');
set_breadcrumbs([['Request Demo', '/demo']]);
layout_start(['title' => $m['title'], 'description' => $m['description'], 'keywords' => $m['keywords'], 'path' => '/demo']);
page_hero($m['h1'], 'See live tracking, fleet reports, fuel monitoring and AI dashcam alerts on a guided walkthrough tailored to your vehicles.', 'Free demo');
?>
<section class="section">
  <div class="container form-layout">
    <div class="form-card reveal"><h2>Book your demo</h2><p class="muted">Fill in the form and a specialist will contact you by email or WhatsApp.</p><?php render_form('demo'); ?></div>
    <aside class="side reveal">
      <div class="card"><h3>In your demo you will see</h3><?php check_list(['Live map with moving vehicles and geofences', 'Route history and trip reports', 'Overspeed, ignition and fuel alerts', 'Driver behaviour scores and driver ID', 'AI dashcam events with video', 'How your trackers connect to ITrackZen']); ?></div>
      <div class="card"><h3>Prefer to talk now?</h3><p>Email <a href="<?= e(mailto(site('emails.sales'), 'ITrackZen demo request')) ?>"><?= e(site('emails.sales')) ?></a><?php if (wa_link()): ?> or <a href="<?= e(wa_link('Hello ITrackZen, I would like a demo.')) ?>" target="_blank" rel="noopener">message us on WhatsApp</a><?php endif; ?>.</p></div>
      <div class="art-box"><?= art_dashboard() ?></div>
    </aside>
  </div>
</section>
<?php layout_end();
