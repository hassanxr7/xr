<?php
/** @var array $byYear */
defined('APP') || exit;
?>
<div class="wrap list-head">
  <h1>News archive</h1>
  <p class="intro">Every story we have published since <?= e(setting('founding_year', '2015')) ?>, by month.</p>
</div>
<div class="wrap archive">
  <?php if (!$byYear): ?><p class="empty">No stories yet.</p><?php endif; ?>
  <?php foreach ($byYear as $year => $months): ?>
    <section class="archive-year">
      <h2><a href="<?= e(url('archive/' . $year)) ?>"><?= e($year) ?></a> <small><?= fmt_num(array_sum($months)) ?> stories</small></h2>
      <div class="archive-months">
        <?php for ($m = 1; $m <= 12; $m++): ?>
          <?php if (!empty($months[$m])): ?>
            <a href="<?= e(url(sprintf('archive/%s/%02d', $year, $m))) ?>"><?= e(date('M', mktime(0, 0, 0, $m, 1))) ?> <small><?= fmt_num($months[$m]) ?></small></a>
          <?php else: ?>
            <span><?= e(date('M', mktime(0, 0, 0, $m, 1))) ?></span>
          <?php endif; ?>
        <?php endfor; ?>
      </div>
    </section>
  <?php endforeach; ?>
</div>
