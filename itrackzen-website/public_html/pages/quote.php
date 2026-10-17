<?php
$m = page_meta('quote');
set_breadcrumbs([['Request a Quote', '/request-quote']]);
layout_start(['title' => $m['title'], 'description' => $m['description'], 'keywords' => $m['keywords'], 'path' => '/request-quote']);
page_hero($m['h1'], 'Tell us about your vehicles and countries and our team will prepare a proposal. This is a sales enquiry only. It does not create a tracking account.', 'Get started', art_frame(art_phone()));
$reg = platform_url('register');
?>
<section class="section"><div class="container form-layout">
  <div class="form-card reveal" id="form"><h2>Quote request</h2><p class="muted">Your request goes to our sales team.</p><?php render_form('quote'); ?></div>
  <aside class="side reveal">
    <div class="card"><h3>What happens next</h3><ol class="num-list"><li>We review your fleet, devices and countries.</li><li>We confirm hardware compatibility and how supply and installation can be arranged where you operate.</li><li>You receive a written quote with approved pricing.</li><li>Once agreed, your account is set up on the ITrackZen platform.</li></ol></div>
    <div class="card"><h3>Want to explore first?</h3><p>Try the live demo on our tracking platform. No quote needed.</p><a class="btn btn-outline btn-block" href="<?= e(platform_url('demo')) ?>" target="_blank" rel="noopener">Try the demo</a>
    <?php if ($reg): ?><a class="btn btn-primary btn-block mt" href="<?= e($reg) ?>" rel="noopener">Register on the platform</a><?php endif; ?></div>
    <div class="card"><h3>Already a customer?</h3><a class="btn btn-outline btn-block" href="<?= e(platform_url('login')) ?>" rel="noopener"><?= icon('login') ?>Client Login</a></div>
  </aside>
</div></section>
<?php layout_end();
