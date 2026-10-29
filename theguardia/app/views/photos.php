<?php
/** @var array $list @var int $total @var int $page @var int $pages @var string $q */
defined('APP') || exit;
?>
<div class="wrap list-head">
  <h1>Photo store</h1>
  <p class="intro">Exclusive news photography for broadcasters, newspapers, agencies and websites. Every photo can be licensed online; you receive the full-resolution original right after payment.</p>
  <form class="search-page-form" action="<?= e(url('photos')) ?>" method="get" role="search">
    <input type="search" name="q" value="<?= e($q) ?>" placeholder="Search photos by subject or place" aria-label="Search photos">
    <button class="btn" type="submit">Search</button>
  </form>
</div>
<div class="wrap">
  <?php if (!$list): ?><p class="empty"><?= $q !== '' ? 'No photos match your search.' : 'New photos are coming soon.' ?></p><?php endif; ?>
  <div class="photo-grid">
    <?php foreach ($list as $p): $lic = photo_licences($p); $from = $lic ? min(array_column($lic, 'price')) : 0; ?>
      <a class="photo-card" href="<?= e(url('photos/' . $p['slug'])) ?>">
        <img src="<?= e(url($p['thumb'])) ?>" alt="<?= e($p['title']) ?>" loading="lazy" width="600" height="400">
        <div><h3><?= e($p['title']) ?></h3>
          <?php if ($p['location']): ?><div class="meta"><?= e($p['location']) ?><?= $p['taken_at'] ? ' · ' . e(fmt_date($p['taken_at'])) : '' ?></div><?php endif; ?>
          <div class="price"><?= $p['status'] === 'sold' ? 'Sold (exclusive)' : ($from ? 'From ' . e(money($from, $p['currency'])) : 'Price on request') ?></div></div>
      </a>
    <?php endforeach; ?>
  </div>
  <?= pager($page, $pages, 'photos' . ($q !== '' ? '?q=' . rawurlencode($q) : '')) ?>
</div>
