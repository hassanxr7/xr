<?php
$m = page_meta('countries'); $d = data('countries'); $items = $d['items'] ?? [];
set_breadcrumbs([['Countries', '/countries']]);
add_ld(['@type' => 'ItemList', 'name' => 'ITrackZen country guides', 'itemListElement' => array_map(fn($c, $i) => ['@type' => 'ListItem', 'position' => $i + 1, 'name' => 'GPS tracking in ' . $c['name'], 'url' => abs_url('/' . $c['slug'])], $items, array_keys($items))]);
layout_start(['title' => $m['title'], 'description' => $m['description'], 'keywords' => $m['keywords'], 'path' => '/countries']);
page_hero($m['h1'], $d['intro'], 'Countries', '', 'addis-street');
?>
<section class="section"><div class="container"><div class="grid grid-3">
<?php foreach ($items as $c): ?>
  <article class="card country-card reveal"><?= item_photo($c, 'cc-img', '(max-width: 700px) 100vw, 380px') ?><h2><a href="/<?= e($c['slug']) ?>"><?= e($c['name']) ?></a></h2><p><?= e(mb_strimwidth($c['snapshot'], 0, 190, '…')) ?></p><p class="small muted"><strong>Typical routes:</strong> <?= e($c['corridors']) ?></p><a class="more" href="/<?= e($c['slug']) ?>">GPS tracking in <?= e($c['name']) ?> <?= icon('arrow') ?></a></article>
<?php endforeach; ?>
</div></div></section>
<section class="section alt"><div class="container narrow">
  <?php section_head('Other countries', 'Is ITrackZen available in my country?'); ?>
  <p class="center">The ITrackZen platform works wherever your trackers have mobile data. What varies by country is how hardware can be supplied and installed and which mobile network and SIM options exist. We confirm this for each enquiry and expand into new countries only where we can genuinely support customers.</p>
  <p class="center">Tell us your country and fleet and we will answer honestly whether we can help today.</p>
  <div class="btn-row center"><a class="btn btn-primary" href="/request-quote">Ask about my country</a><a class="btn btn-outline" href="/partnerships">Become a local partner</a></div>
</div></section>
<?php cta_band(); layout_end();
