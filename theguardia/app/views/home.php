<?php
/** @var array $top @var array $latest @var array $sections @var array $mostRead @var array $photos */
defined('APP') || exit;
$lead = $top[0] ?? null;
$side = array_slice($top, 1, 4);
?>
<h1 class="visually-hidden"><?= e(site_name()) ?> – <?= e(setting('tagline', 'Independent news since 2015')) ?></h1>

<?php if (!$lead): ?>
  <section class="wrap empty-state">
    <h2>No stories published yet</h2>
    <p>Sign in to the newsroom dashboard to publish your first story or start an import.</p>
    <p><a class="btn" href="<?= e(url('admin/')) ?>">Open the dashboard</a></p>
  </section>
<?php else: ?>

<section class="wrap top-stories" aria-label="Top stories">
  <div class="lead-col"><?= card($lead, 'lead', ['eager' => true]) ?></div>
  <div class="side-col">
    <?php foreach ($side as $i => $a): ?><?= card($a, $i < 1 ? 'standard' : 'compact', ['standfirst' => true]) ?><?php endforeach; ?>
  </div>
</section>

<section class="wrap layout-2col">
  <div class="col-main">
    <?= section_head('Latest news', url('latest'), 'All latest') ?>
    <div class="latest-list">
      <?php foreach ($latest as $a): ?><?= card($a, 'compact') ?><?php endforeach; ?>
    </div>
  </div>
  <aside class="col-side">
    <?php if ($mostRead): ?>
      <section class="box most-read">
        <h2 class="box-title">Most read</h2>
        <ol><?php foreach ($mostRead as $a): ?><?= card($a, 'number') ?><?php endforeach; ?></ol>
      </section>
    <?php endif; ?>
    <?= ad('sidebar') ?>
  </aside>
</section>

<?= ($ad = ad('home_middle')) ? '<div class="wrap ad-wrap">' . $ad . '</div>' : '' ?>

<?php foreach ($sections as $i => $s): $items = $s['items']; ?>
  <section class="wrap home-section<?= $s['cat']['slug'] === 'sex-offender-cases' || $s['cat']['slug'] === 'courts' ? ' section-courts' : '' ?>" aria-labelledby="sec-<?= (int) $s['cat']['id'] ?>">
    <header class="section-head"><h2 id="sec-<?= (int) $s['cat']['id'] ?>"><a href="<?= e(category_url($s['cat'])) ?>"><?= e($s['cat']['name']) ?></a></h2>
      <a class="more" href="<?= e(category_url($s['cat'])) ?>">More <?= icon('arrow') ?></a></header>
    <div class="section-grid">
      <div class="section-lead"><?= card($items[0], 'standard', ['standfirst' => true]) ?></div>
      <div class="section-rest">
        <?php foreach (array_slice($items, 1) as $a): ?><?= card($a, 'text') ?><?php endforeach; ?>
      </div>
    </div>
  </section>
  <?php if ($i === 2 && ($ad = ad('home_lower'))): ?><div class="wrap ad-wrap"><?= $ad ?></div><?php endif; ?>
<?php endforeach; ?>

<?php if ($photos): ?>
<section class="wrap photo-promo">
  <?= section_head('Photo store for media', url('photos'), 'Browse photos') ?>
  <p class="muted">Exclusive news photography available to license for broadcasters, newspapers and websites.</p>
  <div class="photo-strip">
    <?php foreach ($photos as $p): ?>
      <a href="<?= e(url('photos/' . $p['slug'])) ?>"><img src="<?= e(url($p['thumb'])) ?>" alt="<?= e($p['title']) ?>" loading="lazy" width="400" height="267"><span><?= e($p['title']) ?></span></a>
    <?php endforeach; ?>
  </div>
</section>
<?php endif; ?>

<?php endif; ?>
