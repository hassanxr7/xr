<?php
/** @var string $type @var string $title @var string $intro @var array $items @var int $page @var int $pages @var int $total @var string $base @var array $children @var array $mostRead @var string $feed */
defined('APP') || exit;
$first = $page === 1 && $type !== 'search' ? array_slice($items, 0, 1) : [];
$rest = $first ? array_slice($items, 1) : $items;
$inlineEvery = 6;
?>
<div class="wrap list-head<?= $type === 'category' && in_array($base, ['sex-offender-cases', 'courts'], true) ? ' section-courts' : '' ?>">
  <h1><?= e($title) ?></h1>
  <?php if ($intro): ?><p class="intro"><?= e($intro) ?></p><?php endif; ?>
  <?php if ($type === 'search'): ?>
    <form class="search-page-form" action="<?= e(url('search')) ?>" method="get" role="search">
      <input type="search" name="q" value="<?= e($q ?? '') ?>" placeholder="Search news, cases, places…" aria-label="Search" autofocus>
      <button class="btn" type="submit">Search</button>
    </form>
  <?php endif; ?>
  <?php if ($children): ?>
    <nav class="subnav" aria-label="Subsections"><?php foreach ($children as $c): ?><a href="<?= e(category_url($c)) ?>"><?= e($c['name']) ?></a><?php endforeach; ?></nav>
  <?php endif; ?>
</div>

<div class="wrap layout-2col">
  <div class="col-main">
    <?php if (!$items): ?>
      <p class="empty"><?= $type === 'search' && ($q ?? '') !== '' ? 'No stories matched your search. Try fewer or different words.' : 'No stories here yet.' ?></p>
    <?php endif; ?>
    <?php foreach ($first as $a): ?><div class="list-lead"><?= card($a, 'lead', ['eager' => true]) ?></div><?php endforeach; ?>
    <div class="latest-list">
      <?php foreach ($rest as $i => $a): ?>
        <?= card($a, 'compact') ?>
        <?php if (($i + 1) % $inlineEvery === 0 && ($ad = ad('list_inline'))): ?><?= $ad ?><?php endif; ?>
      <?php endforeach; ?>
    </div>
    <?= pager($page, $pages, $base) ?>
    <?php if ($feed): ?><p class="feed-link"><a href="<?= e($feed) ?>"><?= icon('rss') ?> RSS feed for <?= e($title) ?></a></p><?php endif; ?>
  </div>
  <aside class="col-side">
    <?php if ($mostRead): ?>
      <section class="box most-read"><h2 class="box-title">Most read</h2><ol><?php foreach ($mostRead as $m): ?><?= card($m, 'number') ?><?php endforeach; ?></ol></section>
    <?php endif; ?>
    <div class="sticky"><?= ad('sidebar') ?></div>
  </aside>
</div>
