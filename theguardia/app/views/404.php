<?php
/** @var array $latest */
defined('APP') || exit;
media_prefetch($latest);
?>
<div class="wrap page-wrap notfound">
  <h1>We couldn’t find that page</h1>
  <p class="standfirst">It may have moved, or the address may be mistyped. Try a search, or read the latest news below.</p>
  <form class="search-page-form" action="<?= e(url('search')) ?>" method="get" role="search">
    <input type="search" name="q" placeholder="Search news" aria-label="Search"><button class="btn" type="submit">Search</button>
  </form>
</div>
<?php if ($latest): ?>
<section class="wrap related"><?= section_head('Latest news', url('latest')) ?><div class="grid-3"><?php foreach ($latest as $a): ?><?= card($a) ?><?php endforeach; ?></div></section>
<?php endif; ?>
