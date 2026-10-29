<?php
/** @var array $p */
defined('APP') || exit;
?>
<div class="wrap page-wrap">
  <article class="article static-page">
    <header class="article-head"><h1><?= e($p['title']) ?></h1></header>
    <div class="article-body"><?= $p['body'] ?></div>
    <p class="muted small">Last updated <?= e(fmt_date($p['updated_at'], 'F j, Y')) ?></p>
  </article>
</div>
