<?php
$m = page_meta('countries'); $d = data('countries'); $items = $d['items'] ?? [];
$regions = ['East Africa' => ['gps-tracking-kenya', 'gps-tracking-uganda', 'gps-tracking-tanzania', 'gps-tracking-rwanda', 'gps-tracking-burundi'],
    'Horn of Africa' => ['gps-tracking-ethiopia', 'gps-tracking-somalia', 'gps-tracking-djibouti'],
    'Central Africa' => ['gps-tracking-dr-congo', 'gps-tracking-south-sudan', 'gps-tracking-republic-of-congo'],
    'Southern Africa' => ['gps-tracking-zambia', 'gps-tracking-malawi', 'gps-tracking-mozambique', 'gps-tracking-zimbabwe', 'gps-tracking-south-africa'],
    'West Africa' => ['gps-tracking-nigeria', 'gps-tracking-ghana']];
$bySlug = []; foreach ($items as $c) { $bySlug[$c['slug']] = $c; }
$hubFaq = [
    ['q' => 'Does ITrackZen work across Africa?', 'a' => 'The ITrackZen platform works wherever your trackers have mobile data. Hardware supply, installation and SIM options differ by country, so we confirm what is practical for each request before you commit.'],
    ['q' => 'Which African countries do you focus on?', 'a' => 'Our focus markets are Somalia, Kenya, Uganda, Ethiopia, South Sudan and DR Congo. We also publish guides for Tanzania, Rwanda, Burundi, Djibouti, Zambia, Malawi, Mozambique, Zimbabwe, Nigeria, Ghana, the Republic of the Congo and South Africa.'],
    ['q' => 'Can I track a truck across several countries?', 'a' => 'Yes, if the tracker keeps a data connection along the route, for example with a multi-country SIM. Tell us your corridor and borders and we will advise on a setup.'],
    ['q' => 'What if my country is not listed?', 'a' => 'Contact us with your country and fleet and we will tell you honestly whether we can help today.'],
];
add_ld(ld_faq($hubFaq));
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
  <?php section_head('Browse by region', 'GPS tracking guides across Africa'); ?>
  <?php foreach ($regions as $region => $slugs): $list = array_filter(array_map(fn($sl) => $bySlug[$sl] ?? null, $slugs)); if (!$list) { continue; } ?>
  <p><strong><?= e($region) ?>:</strong> <?php foreach ($list as $i => $c): ?><?= $i ? ' &middot; ' : '' ?><a href="/<?= e($c['slug']) ?>">GPS tracking in <?= e($c['name']) ?></a><?php endforeach; ?></p>
  <?php endforeach; ?>
</div></section>
<section class="section"><div class="container narrow">
  <?php section_head('FAQ', 'GPS tracking in Africa: questions'); faq_list($hubFaq, true); ?>
</div></section>
<section class="section alt"><div class="container narrow">
  <?php section_head('Other countries', 'Is ITrackZen available in my country?'); ?>
  <p class="center">The ITrackZen platform works wherever your trackers have mobile data. What varies by country is how hardware can be supplied and installed and which mobile network and SIM options exist. We confirm this for each enquiry and expand into new countries only where we can genuinely support customers.</p>
  <p class="center">Tell us your country and fleet and we will answer honestly whether we can help today.</p>
  <div class="btn-row center"><a class="btn btn-primary" href="/request-quote">Ask about my country</a><a class="btn btn-outline" href="/partnerships">Become a local partner</a></div>
</div></section>
<?php cta_band(); layout_end();
