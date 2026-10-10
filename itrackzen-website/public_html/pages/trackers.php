<?php
$m = page_meta('trackers'); $t = data('trackers');
$brands = $t['brands'] ?? []; $total = count_models();
$tagLabels = [];
foreach ($t['filters'] as $f) { $tagLabels[$f['key']] = $f['label']; }
set_breadcrumbs([['Supported GPS Trackers', '/supported-gps-trackers']]);
add_ld(['@type' => 'ItemList', 'name' => 'Supported GPS tracker brands', 'itemListElement' => array_map(fn($b, $i) => ['@type' => 'ListItem', 'position' => $i + 1, 'name' => $b['name']], $brands, array_keys($brands))]);
layout_start(['title' => $m['title'], 'description' => $m['description'], 'keywords' => $m['keywords'], 'path' => '/supported-gps-trackers']);
page_hero($m['h1'], 'Use the GPS trackers you prefer. ITrackZen works with leading brands, protocols and device types, from OBD plug-ins and motorcycle trackers to 4G fleet units and AI dashcams.', 'Device compatibility');
?>
<section class="section tight">
  <div class="container">
    <div class="notice reveal"><?= icon('chip') ?><p><strong><?= e($t['notice']) ?></strong> Our team will confirm compatibility and help you configure it.</p><a class="btn btn-primary btn-sm" href="/contact-sales?service=Bring+my+own+trackers">Check my device</a></div>

    <div class="device-cards">
      <?php foreach ($t['categories'] as $c): ?>
      <button type="button" class="card device reveal" data-set-filter="<?= e($c['key']) ?>">
        <?= art_tracker($c['art']) ?>
        <h3><?= e($c['title']) ?></h3>
        <p><?= e($c['text']) ?></p>
        <span class="more">Show models <?= icon('arrow') ?></span>
      </button>
      <?php endforeach; ?>
    </div>
  </div>
</section>

<section class="section alt" id="catalog">
  <div class="container">
    <?php section_head('Tracker catalogue', 'Search supported brands and models', 'Type a brand, model or feature, or use the filters. ' . $total . '+ models across ' . count($brands) . ' brand and protocol groups are listed, and more are supported on request.'); ?>
    <div class="finder reveal">
      <label class="search"><?= icon('search') ?><span class="sr">Search trackers</span><input type="search" id="tracker-search" placeholder="Search brand or model, e.g. FMB920, GT06, Queclink, OBD" autocomplete="off"></label>
      <div class="filter-chips" id="tracker-filters" role="group" aria-label="Filter by device type">
        <?php foreach ($t['filters'] as $i => $f): ?><button type="button" data-filter="<?= e($f['key']) ?>" class="<?= $i === 0 ? 'active' : '' ?>" aria-pressed="<?= $i === 0 ? 'true' : 'false' ?>"><?= e($f['label']) ?></button><?php endforeach; ?>
      </div>
      <p class="result-count" id="tracker-count" aria-live="polite">Showing <b><?= $total ?></b> models</p>
    </div>
    <div class="brand-grid" id="brand-grid">
      <?php foreach ($brands as $b): ?>
      <article class="card brand-card reveal" data-brand="<?= e(strtolower($b['name'] . ' ' . $b['protocol'])) ?>">
        <header>
          <h3><?= e($b['name']) ?></h3>
          <span class="proto"><?= e($b['protocol']) ?></span>
        </header>
        <p><?= e($b['desc']) ?></p>
        <ul class="model-list">
          <?php foreach ($b['models'] as $raw): $md = parse_model($raw); ?>
          <li data-name="<?= e(strtolower($md['name'])) ?>" data-tags="<?= e(implode(' ', $md['tags'])) ?>"><?= e($md['name']) ?><?php foreach ($md['tags'] as $tg): if (isset($tagLabels[$tg])): ?><i class="tg tg-<?= e($tg) ?>"><?= e($tagLabels[$tg]) ?></i><?php endif; endforeach; ?></li>
          <?php endforeach; ?>
        </ul>
      </article>
      <?php endforeach; ?>
    </div>
    <div class="empty reveal" id="tracker-empty" hidden>
      <?= icon('search') ?>
      <h3>No exact match, but we probably support it</h3>
      <p>ITrackZen supports many GPS tracker models and protocols. Contact us if your device is not listed and we will check it for you.</p>
      <a class="btn btn-primary" href="/contact-sales?service=Bring+my+own+trackers">Ask about my device</a>
    </div>
  </div>
</section>

<section class="section">
  <div class="container split">
    <div class="split-copy reveal">
      <p class="eyebrow">Sensors &amp; accessories</p>
      <h2>Connect more than location</h2>
      <p>Compatible trackers can read sensors and accessories to unlock fuel monitoring, cargo protection and driver identification.</p>
      <?php check_list($t['sensors']); ?>
    </div>
    <div class="split-copy reveal">
      <p class="eyebrow">Not sure what to buy?</p>
      <h2>We will recommend the right device</h2>
      <p>Tell us your vehicle types, countries and goals. We will suggest OBD, hardwired, 4G, motorcycle, asset or dashcam hardware that matches your budget and risk level, and help with installation.</p>
      <div class="btn-row"><a class="btn btn-primary" href="/contact-sales?service=Tracker+hardware+%26+installation">Get a hardware recommendation</a><a class="btn btn-outline" href="/faq">Read the FAQ</a></div>
      <p class="fine"><?= e($t['disclaimer']) ?></p>
    </div>
  </div>
</section>
<?php cta_band('Is your tracker supported?', 'Send us the model name or protocol and we will confirm compatibility, usually within one business day.'); layout_end();
