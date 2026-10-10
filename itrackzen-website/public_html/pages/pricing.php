<?php
$m = page_meta('pricing'); $p = data('pricing');
set_breadcrumbs([['Pricing', '/pricing']]);
add_ld(ld_service('ITrackZen GPS Tracking Plans', $m['description'], '/pricing', array_map(fn($x) => $x['name'] . ' Plan', $p['plans'])));
add_ld(ld_faq(array_slice(data('faq')['items'], 3, 3)));
layout_start(['title' => $m['title'], 'description' => $m['description'], 'keywords' => $m['keywords'], 'path' => '/pricing']);
page_hero($m['h1'], $p['intro'], 'Pricing & Plans');
?>
<section class="section">
  <div class="container">
    <div class="plans">
      <?php foreach ($p['plans'] as $pl): ?>
      <article class="plan reveal<?= !empty($pl['highlight']) ? ' hl' : '' ?>">
        <?php if (!empty($pl['badge'])): ?><span class="badge"><?= e($pl['badge']) ?></span><?php endif; ?>
        <h2><?= e($pl['name']) ?> Plan</h2>
        <p class="tag"><?= e($pl['tagline']) ?></p>
        <p class="price"><strong><?= e($pl['price']) ?></strong><small><?= e($pl['unit']) ?></small></p>
        <a class="btn <?= !empty($pl['highlight']) ? 'btn-primary' : 'btn-outline' ?> btn-block" href="<?= e($pl['href']) ?>?service=<?= rawurlencode('GPS vehicle tracking') ?>&amp;topic=<?= rawurlencode($pl['name'] . ' Plan') ?>"><?= e($pl['cta']) ?></a>
        <?php check_list($pl['features']); ?>
      </article>
      <?php endforeach; ?>
    </div>
    <p class="center muted mt-lg"><?= e($p['note']) ?></p>
  </div>
</section>
<section class="section alt">
  <div class="container narrow">
    <?php section_head('Compare plans', 'What is included in each plan'); ?>
    <div class="table-wrap reveal"><table class="compare">
      <thead><tr><th scope="col">Feature</th><?php foreach ($p['plans'] as $pl): ?><th scope="col"><?= e($pl['name']) ?></th><?php endforeach; ?></tr></thead>
      <tbody>
      <?php foreach ($p['compare'] as $r): ?>
        <tr><th scope="row"><?= e($r['feature']) ?></th>
        <?php foreach (['starter', 'business', 'enterprise'] as $k): $v = $r[$k] ?? false; ?>
          <td><?php if ($v === true): ?><span class="yes" aria-label="Included"><?= icon('check') ?></span><?php elseif ($v): ?><span class="opt"><?= e($v) ?></span><?php else: ?><span class="no" aria-label="Not included">&ndash;</span><?php endif; ?></td>
        <?php endforeach; ?></tr>
      <?php endforeach; ?>
      </tbody></table></div>
  </div>
</section>
<section class="section">
  <div class="container split">
    <div class="split-copy reveal"><p class="eyebrow">Hardware &amp; installation</p><h2><?= e($p['addons_heading']) ?></h2><p><?= e($p['addons_text']) ?></p>
      <div class="btn-row"><a class="btn btn-primary" href="/contact-sales?service=Tracker+hardware+%26+installation">Request hardware quote</a><a class="btn btn-outline" href="/supported-gps-trackers">Supported trackers</a></div></div>
    <div class="split-art reveal"><?= art_truck() ?></div>
  </div>
</section>
<section class="section alt"><div class="container narrow"><?php section_head('Pricing FAQ', 'Common pricing questions'); faq_list(array_slice(data('faq')['items'], 3, 3), true); ?></div></section>
<?php cta_band('Get a tailored quote', 'Tell us how many vehicles you have and which features you need. We will respond with a clear proposal.'); layout_end();
