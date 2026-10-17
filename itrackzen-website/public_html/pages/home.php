<?php
$m = page_meta('home'); $home = data('home'); $h = $home['hero']; $tour = $home['tour'];
$faq = array_slice(data('faq')['items'] ?? [], 0, 6);
$cats = data('services')['categories'] ?? [];
$sol = data('solutions')['items'] ?? [];
$countries = data('countries')['items'] ?? [];
$brands = data('trackers')['brands'] ?? [];
add_ld(ld_faq($faq));
layout_start(['title' => $m['title'], 'description' => $m['description'], 'keywords' => $m['keywords'], 'path' => '/']);
$ov = $home['overview'];
?>
<section class="hero hero2"<?php if (!empty($h['photo']) && photo_meta($h['photo'])): ?> style="--hero-photo:url(<?= e(photo_url($h['photo'], 'lg')) ?>)"<?php endif; ?>>
  <div class="hero-bg" aria-hidden="true"></div>
  <div class="container hero-grid">
    <div class="hero-copy">
      <p class="eyebrow light reveal"><?= e($h['eyebrow']) ?> &middot; <?= e(site('company')) ?></p>
      <h1 class="reveal"><?= e($m['h1']) ?></h1>
      <p class="lead reveal"><?= e($h['subtext']) ?></p>
      <div class="hero-cta reveal">
        <a class="btn btn-primary btn-lg" href="/request-quote">Get Started <?= icon('arrow') ?></a>
        <a class="btn btn-light btn-lg" href="<?= e(platform_url('demo')) ?>" target="_blank" rel="noopener">Try the Demo</a>
        <a class="btn btn-outline-light btn-lg" href="/contact-sales">Contact Sales</a>
        <a class="btn btn-ghost-light btn-lg" href="<?= e(platform_url('login')) ?>" rel="noopener"><?= icon('login') ?>Client Login</a>
      </div>
      <ul class="chips reveal"><?php foreach ($h['chips'] as $c): ?><li><?= icon('check') ?><?= e($c) ?></li><?php endforeach; ?></ul>
    </div>
    <div class="stage reveal">
      <?php if (!empty($h['image'])): echo cms_img($h['image'], $h['image_alt'] ?? 'Fleet vehicles monitored with ITrackZen GPS tracking', 'hero-photo', 960, 640, true); else: ?>
      <div class="stage-dash"><?= art_dashboard() ?></div>
      <div class="stage-phone"><?= art_phone() ?></div>
      <div class="float-card fc-1"><span class="dot dot-green"></span><div><strong>TRK-204 &middot; Moving</strong><small>62 km/h &middot; Nairobi &rarr; Mombasa</small></div></div>
      <div class="float-card fc-2"><span class="fc-ico"><?= icon('camera') ?></span><div><strong>AI dashcam alert</strong><small>Phone use detected</small></div></div>
      <?php endif; ?>
      <p class="illus">Illustrative interface with sample data</p>
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

<section class="section fleet-sec">
  <div class="container">
    <?php section_head('Every vehicle, one platform', 'Track trucks, buses, vans, cars, motorcycles and assets', 'Whatever you run, ITrackZen gives you location, alerts and reports in one place, wherever your devices support them.'); ?>
    <div class="fleet-strip">
      <?php foreach ([['uganda-banana-truck', 'Trucks & haulage'], ['addis-bus', 'Buses & coaches'], ['iveco-delivery-van', 'Vans & delivery'], ['ghana-taxis', 'Taxis & ride services'], ['scooter', 'Motorcycles & scooters'], ['djibouti-tanker', 'Fuel tankers'], ['uganda-minibus-taxis', 'Minibus fleets']] as [$ps, $l]): ?>
      <a class="fleet-card reveal" href="/solutions"><?= photo($ps, 'fc-img', '(max-width: 620px) 50vw, 200px') ?><span><?= e($l) ?></span></a>
      <?php endforeach; ?>
  </div>
</section>

<section class="section tight paths-sec">
  <div class="container">
    <div class="banner reveal has-img">
      <?php $bph = !empty($home['banner']['image']) ? cms_img($home['banner']['image'], $home['banner']['alt'] ?? '', 'banner-img', 1200, 520) : (!empty($home['banner']['photo']) ? photo($home['banner']['photo'], 'banner-img', '(max-width: 900px) 100vw, 560px') : ''); echo $bph; ?>
      <div class="banner-copy"><p class="eyebrow light"><?= e($home['banner']['eyebrow']) ?></p><h2><?= e($home['banner']['title']) ?></h2><p><?= e($home['banner']['text']) ?></p>
        <div class="btn-row"><a class="btn btn-primary" href="/request-quote"><?= e($home['banner']['cta1']) ?></a><a class="btn btn-light" href="<?= e(platform_url('demo')) ?>" target="_blank" rel="noopener"><?= e($home['banner']['cta2']) ?></a></div></div>
      
    </div>
    <div class="grid grid-3 paths">
      <?php foreach ($home['paths'] as $pth): $href = ['demo' => platform_url('demo'), 'quote' => '/request-quote', 'login' => platform_url('login')][$pth['kind']] ?? '/'; $ext = $pth['kind'] !== 'quote'; ?>
      <a class="card path reveal" href="<?= e($href) ?>"<?= $pth['kind'] === 'demo' ? ' target="_blank"' : '' ?><?= $ext ? ' rel="noopener"' : '' ?>><span class="ico-wrap"><?= icon($pth['icon']) ?></span><h3><?= e($pth['title']) ?></h3><p><?= e($pth['text']) ?></p><span class="more"><?= $ext ? 'Open on itrackzen.com' : 'Go to quote form' ?> <?= icon('arrow') ?></span></a>
      <?php endforeach; ?>
    </div>
  </div>
</section>

<section class="section alt">
  <div class="container">
    <?php section_head('What we do', $home['overview_heading'], $home['overview_text']); ?>
    <div class="bento">
      <article class="tile t-a reveal"><div class="tile-media dark"><?= art_scene('map') ?></div><div class="tile-copy"><h3>Real-time GPS tracking</h3><p><?= e($ov[0]['text']) ?></p><a class="more" href="/gps-tracking-services">Explore tracking <?= icon('arrow') ?></a></div></article>
      <article class="tile t-b reveal"><div class="tile-media dark"><?= scene_camera_photo('kampala-road') ?></div><div class="tile-copy"><h3>AI dashcams &amp; video</h3><p><?= e($ov[2]['text']) ?></p><a class="more" href="/ai-dashcam-video-telematics">See video telematics <?= icon('arrow') ?></a></div></article>
      <article class="tile t-c reveal"><div class="tile-media dark"><?= art_scene('analytics') ?></div><div class="tile-copy"><h3>Fleet management</h3><p><?= e($ov[1]['text']) ?></p><a class="more" href="/fleet-management">Fleet dashboard <?= icon('arrow') ?></a></div></article>
      <article class="tile t-d reveal"><div class="tile-media dark"><?= art_scene('alerts') ?></div><div class="tile-copy"><h3>Alerts, geofencing &amp; reports</h3><p>Overspeed, ignition, route deviation and geofence alerts, plus trip and summary reports.</p><a class="more" href="/alerts-geofencing-reports">How alerts work <?= icon('arrow') ?></a></div></article>
      <article class="tile t-e reveal"><div class="tile-media dark gauge"><?= art_gauge() ?></div><div class="tile-copy"><h3>Fuel monitoring</h3><p><?= e($ov[3]['text']) ?></p><a class="more" href="/fuel-monitoring">Fuel monitoring <?= icon('arrow') ?></a></div></article>
    </div>
    <div class="grid grid-3 mt-lg">
      <?php feature_card(['icon' => 'driver', 'title' => 'Driver behaviour & safety', 'text' => 'Speed, driving events, driver ID and SOS alerts to reduce risk.', 'href' => '/driver-behaviour-safety']); feature_card($ov[4]); feature_card($ov[5]); ?>
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
        <div class="tour-bar"><span class="d r"></span><span class="d y"></span><span class="d g"></span><em>ITrackZen &middot; Illustrative demo</em><i class="tour-progress"><b></b></i></div>
        <div class="tour-stage">
          <?php foreach ($tour['tabs'] as $i => $t): ?>
          <div class="scene-wrap<?= $i === 0 ? ' is-active' : '' ?>" role="tabpanel" id="scene-<?= e($t['key']) ?>" aria-labelledby="tab-<?= e($t['key']) ?>" data-key="<?= e($t['key']) ?>">
            <?= $t['scene'] === 'camera' ? scene_camera_photo('kampala-road') : art_scene($t['scene']) ?>
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
    <?php section_head('Industries', 'Built for the way your business moves', 'Logistics, transport, taxis, delivery, construction, tankers, buses, government, security and more.'); ?>
    <div class="rail" tabindex="0" aria-label="Industry solutions">
      <?php foreach ($sol as $s): ?>
      <a class="rail-card reveal" href="/solutions#<?= e($s['id']) ?>"><div class="rail-art"><?php $im = item_photo($s, 'rail-photo'); echo $im ?: '<span class="ico-wrap xl">' . icon($s['icon']) . '</span>'; ?></div><h3><?= e($s['title']) ?></h3><p><?= e($s['summary']) ?></p><span class="more">View solution <?= icon('arrow') ?></span></a>
      <?php endforeach; ?>
    </div>
    <p class="center mt-lg"><a class="btn btn-outline" href="/solutions">All industry solutions</a></p>
  </div>
</section>

<section class="section">
  <div class="container">
    <?php section_head('How it works', 'From installation to insight in four steps'); ?>
    <ol class="steps">
      <?php foreach ($home['steps'] as $s): ?><li class="reveal"><span class="step-n"><?= e($s['n']) ?></span><h3><?= e($s['title']) ?></h3><p><?= e($s['text']) ?></p></li><?php endforeach; ?>
    </ol>
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
    <div class="stat reveal"><b data-count="<?= count_models() ?>"><?= count_models() ?>+</b><span>tracker models listed</span></div>
    <div class="stat reveal"><b data-count="<?= count($brands) ?>"><?= count($brands) ?></b><span>brands and protocol families</span></div>
    <div class="stat reveal"><b data-count="<?= count(all_service_items()) ?>"><?= count(all_service_items()) ?></b><span>tracking and fleet features</span></div>
    <div class="stat reveal"><b data-count="<?= count($countries) ?>"><?= count($countries) ?></b><span>focus country guides</span></div>
  </div>
</section>

<section class="section">
  <div class="container">
    <?php section_head('Coverage', 'GPS tracking across East and Central Africa', 'Our focus markets today. Each guide explains local use cases, connectivity conditions and how to start.'); ?>
    <ul class="country-grid">
      <?php foreach ($countries as $c): ?><li class="reveal"><a href="/<?= e($c['slug']) ?>"><?= icon('pin') ?><span>GPS Tracking <?= e($c['name']) ?></span><?= icon('arrow') ?></a></li><?php endforeach; ?>
    </ul>
    <div class="country-pick center reveal"><label for="country-select">Choose your country</label> <select id="country-select" data-country-select><option value="">Select a country</option><?php foreach ($countries as $c): ?><option value="/<?= e($c['slug']) ?>"><?= e($c['name']) ?></option><?php endforeach; ?><option value="/countries">Other countries</option></select> <noscript><a href="/countries">All countries</a></noscript></div>
    <p class="center muted mt">Not on the list? We confirm availability case by case. <a href="/countries">See how we expand</a>.</p>
  </div>
</section>

<section class="section alt">
  <div class="container narrow">
    <?php section_head('FAQ', 'Questions fleet owners ask us'); ?>
    <?php faq_list($faq, true); ?>
    <p class="center mt-lg"><a class="btn btn-outline" href="/faq">FAQ &amp; support</a></p>
  </div>
</section>

<?php cta_band($home['cta']['title'], $home['cta']['text']); ?>
<?php layout_end();
