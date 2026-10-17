<?php
$m = page_meta('demo');
set_breadcrumbs([['Demo', '/demo']]);
layout_start(['title' => $m['title'], 'description' => $m['description'], 'keywords' => $m['keywords'], 'path' => '/demo']);
page_hero($m['h1'], 'The live demo runs on the ITrackZen tracking platform at itrackzen.com. Open it to explore the interface, or ask our team for a guided walkthrough.', 'Demo', '', 'evening-traffic');
?>
<section class="section"><div class="container">
  <div class="demo-hero reveal">
    <div><p class="eyebrow">Self-service demo</p><h2>Explore the platform yourself</h2><p>Open the demo on our tracking platform to see the live map, vehicle details and reports with demo data. It opens in a new tab and does not require a quote.</p>
      <div class="btn-row"><a class="btn btn-primary btn-lg" href="<?= e(platform_url('demo')) ?>" target="_blank" rel="noopener">Open the live demo <?= icon('arrow') ?></a><a class="btn btn-outline btn-lg" href="<?= e(platform_url('login')) ?>" rel="noopener"><?= icon('login') ?>Client Login</a></div>
      <p class="fine">You will leave this website and go to <?= e(preg_replace('#^https?://#', '', platform_url('base'))) ?>.</p></div>
    <div class="art-box"><?= art_dashboard() ?><p class="illus">Illustrative interface with sample data</p></div>
  </div>
</div></section>
<section class="section alt"><div class="container form-layout">
  <div class="form-card reveal" id="form"><h2>Prefer a guided demo?</h2><p class="muted">Tell us what you want to see and when. A specialist will contact you by email or WhatsApp.</p><?php render_form('demo'); ?></div>
  <aside class="side reveal">
    <div class="card"><h3>What to look for in the demo</h3><?php check_list(['Live map and vehicle list', 'Route history and trip reports', 'Alerts and geofences', 'Reports and exports', 'Mobile access']); ?></div>
    <div class="card"><h3>Ready for a proposal?</h3><p>Skip straight to a quote for your fleet.</p><a class="btn btn-outline btn-block" href="/request-quote">Request a quote</a></div>
  </aside>
</div></section>
<?php layout_end();
