<?php
$m = page_meta('home'); $home = data('home'); $h = $home['hero']; $tour = $home['tour'];
$faq = array_slice(data('faq')['items'] ?? [], 0, 6);
$cats = data('services')['categories'] ?? [];
$sol = array_slice(data('solutions')['items'] ?? [], 0, 6);
$countries = data('countries')['items'] ?? [];
$brands = data('trackers')['brands'] ?? [];
add_ld(ld_faq($faq));
layout_start(['title' => $m['title'], 'description' => $m['description'], 'keywords' => $m['keywords'], 'path' => '/']);
$loginUrl = site('client_login_url');
?>
<section class="hero">
  <div class="hero-bg" aria-hidden="true"></div>
  <div class="container hero-grid">
    <div class="hero-copy">
      <p class="eyebrow light reveal"><?= e($h['eyebrow']) ?> &middot; <?= e(site('company')) ?></p>
      <h1 class="reveal"><?= e($m['h1']) ?></h1>
      <p class="lead reveal"><?= e($h['subtext']) ?></p>
      <div class="hero-cta reveal">
        <a class="btn btn-primary btn-lg" href="/pricing">Get Started <?= icon('arrow') ?></a>
        <a class="btn btn-light btn-lg" href="/demo">Request Demo</a>
        <a class="btn btn-outline-light btn-lg" href="/contact-sales">Contact Sales</a>
        <a class="btn btn-ghost-light btn-lg" href="<?= e($loginUrl) ?>" rel="noopener"><?= icon('login') ?>Client Login</a>
      </div>
      <ul class="chips reveal"><?php foreach ($h['chips'] as $c): ?><li><?= icon('check') ?><?= e($c) ?></li><?php endforeach; ?></ul>
    </div>
    <div class="hero-visual reveal">
      <?php if (!empty($h['image'])): ?><img src="<?= e($h['image']) ?>" alt="ITrackZen fleet dashboard" width="640" height="420" fetchpriority="high"><?php else: echo art_dashboard(); endif; ?>
      <div class="float-card fc-1"><span class="dot dot-green"></span><div><strong>TRK-204 &middot; Moving</strong><small>62 km/h &middot; Nairobi &rarr; Mombasa</small></div></div>
      <div class="float-card fc-2"><span class="fc-ico"><?= icon('camera') ?></span><div><strong>AI dashcam alert</strong><small>Phone use detected</small></div></div>
      <div class="float-card fc-3 art-card"><?= art_tracker('wired') ?><div><strong>Any tracker</strong><small><?= count_models() ?>+ models</small></div></div>
    </div>
  </div>
  <div class="container trust">
    <?php foreach ($home['trust'] as $t): ?>
    <div class="trust-item"><span class="ico-wrap sm"><?= icon($t['icon']) ?></span><div><strong><?= e($t['title']) ?></strong><small><?= e($t['text']) ?></small></div></div>
    <?php endforeach; ?>
  </div>
</section>

<section class="brands-strip" aria-label="Supported tracker brands">
  <div class="container">
    <p>Works with leading GPS tracker brands and protocols</p>
    <div class="marquee"><div class="marquee-track">
      <?php for ($i = 0; $i < 2; $i++): foreach ($brands as $b): ?><a href="/supported-gps-trackers" tabindex="<?= $i ? '-1' : '0' ?>"<?= $i ? ' aria-hidden="true"' : '' ?>><?= e($b['name']) ?></a><?php endforeach; endfor; ?>
    </div></div>
  </div>
</section>

<section class="section">
  <div class="container">
    <?php section_head('What we do', $home['overview_heading'], $home['overview_text']); ?>
    <div class="grid grid-3">
      <?php foreach ($home['overview'] as $o) { feature_card($o); } ?>
    </div>
  </div>
</section>

<section class="section section-split alt">
  <div class="container split">
    <div class="split-art reveal"><?= art_truck() ?><div class="orbit-card oc-1"><?= icon('fuel') ?><span>Fuel level 72%</span></div><div class="orbit-card oc-2"><?= icon('geofence') ?><span>Inside geofence</span></div></div>
    <div class="split-copy reveal">
      <p class="eyebrow">Built for African roads</p>
      <h2>Truck, car, bus and motorcycle tracking in one platform</h2>
      <p>Long corridors, remote areas and mixed network coverage need dependable tracking. ITrackZen stores data on the device when signal is lost and fills in your route history when coverage returns, so your records stay complete.</p>
      <?php check_list(['Truck tracking system with fuel, door and temperature sensors', 'Car and bus tracking with driver ID and speed control', 'Compact motorcycle and asset trackers for bikes, trailers and equipment', 'Cross-border visibility across East and Central Africa']); ?>
      <div class="btn-row"><a class="btn btn-primary" href="/gps-tracking-services">Explore GPS services</a><a class="btn btn-outline" href="/solutions">View solutions</a></div>
    </div>
  </div>
</section>

<section class="section tour-section" id="tour">
  <div class="container">
    <?php section_head('Platform tour', $tour['heading'], $tour['text']); ?>
    <div class="tour reveal" data-tour>
      <div class="tour-tabs" role="tablist" aria-label="Platform features">
        <?php foreach ($tour['tabs'] as $i => $t): ?>
        <button type="button" role="tab" id="tab-<?= e($t['key']) ?>" aria-controls="scene-<?= e($t['key']) ?>" aria-selected="<?= $i === 0 ? 'true' : 'false' ?>" class="<?= $i === 0 ? 'active' : '' ?>" data-key="<?= e($t['key']) ?>"><?= e($t['label']) ?></button>
        <?php endforeach; ?>
      </div>
      <div class="tour-screen">
        <div class="tour-bar"><span class="d r"></span><span class="d y"></span><span class="d g"></span><em>ITrackZen &middot; Live demo</em><i class="tour-progress"><b></b></i></div>
        <div class="tour-stage">
          <?php foreach ($tour['tabs'] as $i => $t): ?>
          <div class="scene-wrap<?= $i === 0 ? ' is-active' : '' ?>" role="tabpanel" id="scene-<?= e($t['key']) ?>" aria-labelledby="tab-<?= e($t['key']) ?>" data-key="<?= e($t['key']) ?>">
            <?= art_scene($t['scene']) ?>
            <div class="scene-caption"><h3><?= e($t['title']) ?></h3><p><?= e($t['text']) ?></p></div>
          </div>
          <?php endforeach; ?>
          <?php if (site('hero_video_url')): ?><button type="button" class="play-btn" data-video="<?= e(site('hero_video_url')) ?>" aria-label="Play ITrackZen overview video"><?= icon('video') ?>Watch overview video</button><?php endif; ?>
        </div>
      </div>
    </div>
  </div>
</section>

<section class="section alt">
  <div class="container">
    <?php section_head('Complete feature set', 'Every GPS and fleet service your business needs', 'From live tracking to AI video, each capability is built to cut cost, reduce risk and save time.'); ?>
    <div class="cat-grid">
      <?php foreach ($cats as $c): ?>
      <article class="card cat reveal">
        <div class="cat-head"><span class="ico-wrap"><?= icon($c['icon']) ?></span><h3><a href="/gps-tracking-services#<?= e($c['id']) ?>"><?= e($c['title']) ?></a></h3></div>
        <ul class="tag-list"><?php foreach ($c['items'] as $it): ?><li><?= e($it['title']) ?></li><?php endforeach; ?></ul>
      </article>
      <?php endforeach; ?>
    </div>
    <p class="center mt-lg"><a class="btn btn-primary" href="/gps-tracking-services">See all services <?= icon('arrow') ?></a></p>
  </div>
</section>

<section class="stats-band">
  <div class="container stats">
    <div class="stat reveal"><b data-count="<?= count_models() ?>"><?= count_models() ?>+</b><span>supported tracker models</span></div>
    <div class="stat reveal"><b data-count="<?= count($brands) ?>"><?= count($brands) ?></b><span>brands and protocol families</span></div>
    <div class="stat reveal"><b data-count="<?= count(all_service_items()) ?>"><?= count(all_service_items()) ?></b><span>tracking and fleet features</span></div>
    <div class="stat reveal"><b>24/7</b><span>live monitoring access</span></div>
  </div>
</section>

<section class="section">
  <div class="container">
    <?php section_head('Solutions', 'Tracking solutions for every industry', 'Logistics, transport, taxis, delivery, construction, tankers, buses, government, security and more.'); ?>
    <div class="grid grid-3">
      <?php foreach ($sol as $s) { feature_card(['icon' => $s['icon'], 'title' => $s['title'], 'text' => $s['summary'], 'href' => '/solutions#' . $s['id']]); } ?>
    </div>
    <p class="center mt-lg"><a class="btn btn-outline" href="/solutions">All 12 industry solutions</a></p>
  </div>
</section>

<section class="section alt">
  <div class="container">
    <?php section_head('How it works', 'From installation to insight in four steps'); ?>
    <ol class="steps">
      <?php foreach ($home['steps'] as $s): ?><li class="reveal"><span class="step-n"><?= e($s['n']) ?></span><h3><?= e($s['title']) ?></h3><p><?= e($s['text']) ?></p></li><?php endforeach; ?>
    </ol>
  </div>
</section>

<section class="section">
  <div class="container">
    <?php section_head('Coverage', 'GPS tracking across Africa and beyond', 'Dedicated support for East Africa, Central Africa and international fleets.'); ?>
    <ul class="country-grid">
      <?php foreach ($countries as $c): ?><li class="reveal"><a href="/<?= e($c['slug']) ?>"><?= icon('pin') ?><span>GPS Tracking <?= e($c['name']) ?></span><?= icon('arrow') ?></a></li><?php endforeach; ?>
    </ul>
    <p class="center muted mt">Also serving Tanzania, Rwanda, Djibouti, Sudan, Egypt, Nigeria, Zambia, South Africa and global clients wherever mobile data coverage exists.</p>
  </div>
</section>

<section class="section alt">
  <div class="container narrow">
    <?php section_head('FAQ', 'Questions fleet owners ask us'); ?>
    <?php faq_list($faq, true); ?>
    <p class="center mt-lg"><a class="btn btn-outline" href="/faq">Read all FAQs</a></p>
  </div>
</section>

<?php cta_band($home['cta']['title'], $home['cta']['text']); ?>
<?php layout_end();
