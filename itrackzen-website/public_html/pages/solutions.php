<?php
$m = page_meta('solutions'); $s = data('solutions');
set_breadcrumbs([['Solutions', '/solutions']]);
add_ld(ld_service('Industry GPS Tracking Solutions', $m['description'], '/solutions', array_map(fn($i) => $i['title'], $s['items'])));
layout_start(['title' => $m['title'], 'description' => $m['description'], 'keywords' => $m['keywords'], 'path' => '/solutions']);
page_hero($m['h1'], $s['intro'], 'Solutions');
?>
<nav class="subnav" aria-label="Industries"><div class="container"><?php foreach ($s['items'] as $i): ?><a href="#<?= e($i['id']) ?>"><?= e($i['title']) ?></a><?php endforeach; ?></div></nav>
<section class="section">
  <div class="container sol-list">
    <?php foreach ($s['items'] as $n => $i): ?>
    <article class="sol reveal<?= $n % 2 ? ' flip' : '' ?>" id="<?= e($i['id']) ?>">
      <div class="sol-ico"><span class="ico-wrap xl"><?= icon($i['icon']) ?></span></div>
      <div class="sol-body">
        <h2><?= e($i['title']) ?></h2>
        <p class="lead-sm"><?= e($i['summary']) ?></p>
        <?php check_list($i['points']); ?>
        <a class="btn btn-outline btn-sm" href="/contact-sales?service=<?= rawurlencode('Fleet management software') ?>&amp;topic=<?= rawurlencode($i['title']) ?>">Get a <?= e($i['title']) ?> quote <?= icon('arrow') ?></a>
      </div>
    </article>
    <?php endforeach; ?>
  </div>
</section>
<?php cta_band('Not sure which solution fits?', 'Describe your fleet and routes and our team will design a tracking setup around them.'); layout_end();
