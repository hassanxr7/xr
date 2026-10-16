<?php
$m = page_meta('partners'); $p = data('partners');
set_breadcrumbs([['Partnerships', '/partnerships']]);
layout_start(['title' => $m['title'], 'description' => $m['description'], 'keywords' => $m['keywords'], 'path' => '/partnerships']);
page_hero($m['h1'], $p['intro'], 'Partnerships');
?>
<section class="section"><div class="container">
  <?php section_head('Ways to work with us', 'Partnership opportunities'); ?>
  <div class="grid grid-4"><?php foreach ($p['types'] as $t) { feature_card($t); } ?></div>
</div></section>
<section class="section alt"><div class="container"><?php section_head('Process', 'How a partnership starts'); ?>
  <ol class="steps three"><?php foreach ($p['process'] as $s): ?><li class="reveal"><span class="step-n"><?= e($s['n']) ?></span><h3><?= e($s['title']) ?></h3><p><?= e($s['text']) ?></p></li><?php endforeach; ?></ol>
  <p class="center muted mt-lg"><?= e($p['note']) ?></p></div></section>
<section class="section"><div class="container form-layout">
  <div class="form-card reveal" id="form"><h2>Partnership &amp; corporate enquiry</h2><p class="muted">Sent to our team at <?= e(implode(' and ', (array)site('form_recipients', []))) ?>.</p><?php render_form('partner'); ?></div>
  <aside class="side reveal"><div class="card"><h3>Where we are focusing</h3><p>Somalia, Kenya, Uganda, Ethiopia, South Sudan and DR Congo, with other countries considered case by case.</p><ul class="tag-list"><?php foreach (data('countries')['items'] as $c): ?><li><a href="/<?= e($c['slug']) ?>"><?= e($c['name']) ?></a></li><?php endforeach; ?></ul></div>
  <div class="card"><h3>Looking for a quote instead?</h3><p>For your own fleet, use the quote form.</p><a class="btn btn-outline btn-block" href="/request-quote">Request a quote</a></div></aside>
</div></section>
<?php layout_end();
