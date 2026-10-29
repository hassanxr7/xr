<?php
/** @var array $a @var ?array $cat @var ?array $parent @var array $tags @var array $img @var string $body @var array $toc @var array $related @var array $mostRead @var ?array $author @var bool $preview */
defined('APP') || exit;
$updated = $a['updated_at'] && strtotime($a['updated_at']) - strtotime($a['published_at']) > 3600;
?>
<?php if ($preview): ?><div class="preview-bar">Preview — this story is <strong><?= e($a['status']) ?></strong> and not visible to readers yet.</div><?php endif; ?>
<div class="wrap article-wrap">
  <article class="article">
    <nav class="crumbs" aria-label="Breadcrumb">
      <a href="<?= e(url('')) ?>">Home</a>
      <?php if ($parent): ?><span>/</span><a href="<?= e(category_url($parent)) ?>"><?= e($parent['name']) ?></a><?php endif; ?>
      <?php if ($cat): ?><span>/</span><a href="<?= e(category_url($cat)) ?>"><?= e($cat['name']) ?></a><?php endif; ?>
    </nav>

    <header class="article-head">
      <?php if ($a['is_breaking'] && strtotime($a['published_at']) > time() - 86400): ?><span class="live">Breaking</span><?php endif; ?>
      <h1><?= e($a['title']) ?></h1>
      <?php if ($a['standfirst']): ?><p class="standfirst"><?= e($a['standfirst']) ?></p><?php endif; ?>
      <div class="byline">
        <?php if ($author && !$a['byline']): ?>
          <span class="avatar" aria-hidden="true"><?= e(mb_strtoupper(mb_substr($author['name'], 0, 1))) ?></span>
          <span class="byline-text"><a href="<?= e(author_url($author)) ?>" rel="author"><?= e($author['name']) ?></a><?php if ($author['title']): ?><small><?= e($author['title']) ?></small><?php endif; ?></span>
        <?php else: ?>
          <span class="avatar" aria-hidden="true"><?= e(mb_strtoupper(mb_substr(article_byline($a), 0, 1))) ?></span>
          <span class="byline-text"><span><?= e(article_byline($a)) ?></span></span>
        <?php endif; ?>
        <span class="dates">
          <time datetime="<?= e(date('c', strtotime($a['published_at']))) ?>"><?= e(date('D j M Y, H:i T', strtotime($a['published_at']))) ?></time>
          <?php if ($updated): ?><span class="updated">Updated <time datetime="<?= e(date('c', strtotime($a['updated_at']))) ?>"><?= e(date('j M Y, H:i', strtotime($a['updated_at']))) ?></time></span><?php endif; ?>
          <span class="read"><?= icon('clock') ?> <?= reading_minutes((int) $a['word_count']) ?> min read</span>
        </span>
      </div>
      <?= share_buttons($a) ?>
    </header>

    <?php if (!$img['default']): ?>
      <figure class="article-figure">
        <?= picture($img, '(min-width: 1100px) 760px, 100vw', '', true) ?>
        <?php if ($img['caption'] || $img['credit']): ?><figcaption><?= e($img['caption']) ?><?php if ($img['credit']): ?> <span class="credit">Photograph: <?= e($img['credit']) ?></span><?php endif; ?></figcaption><?php endif; ?>
      </figure>
    <?php endif; ?>

    <?= ad('article_top') ?>

    <?php if (count($toc) >= 3): ?>
      <nav class="toc" aria-label="In this story"><strong>In this story</strong><ol><?php foreach ($toc as $t): ?><li><a href="#<?= e($t['id']) ?>"><?= e($t['text']) ?></a></li><?php endforeach; ?></ol></nav>
    <?php endif; ?>

    <div class="article-body<?= $a['location'] ? ' has-dateline' : '' ?>">
      <?= $a['location'] ? preg_replace('~<p>~', '<p><strong class="dateline">' . e(mb_strtoupper($a['location'])) . '</strong> — ', $body, 1) : $body ?>
    </div>

    <?php if ($a['source_url']): ?>
      <aside class="source-box">
        <strong>Source</strong>
        <p>This report is based on <?= $a['source_name'] ? e($a['source_name']) : 'an official release' ?><?php if ($a['source_licence']): ?> (<?= e($a['source_licence']) ?>)<?php endif; ?>.
          <a href="<?= e($a['source_url']) ?>" rel="noopener nofollow" target="_blank">Read the original</a>.</p>
        <?php if ($cat && in_array($cat['slug'], ['sex-offender-cases', 'courts', 'crime', 'fraud-corruption', 'drugs', 'national-security'], true)): ?>
          <p class="small">Charges and indictments are allegations; every defendant is presumed innocent unless and until proven guilty in a court of law. Sentences reflect the official record at the time of publication. <a href="<?= e(url('corrections')) ?>">Request a correction</a>.</p>
        <?php endif; ?>
      </aside>
    <?php endif; ?>

    <?php if ($tags): ?>
      <div class="tags" aria-label="Topics"><?php foreach ($tags as $t): ?><a href="<?= e(tag_url($t)) ?>" rel="tag"><?= e($t['name']) ?></a><?php endforeach; ?></div>
    <?php endif; ?>

    <?= share_buttons($a) ?>

    <section class="alerts-cta">
      <div><strong>Follow this story</strong><p>Get an alert when we publish breaking news<?= $cat ? ' in ' . e($cat['name']) : '' ?>.</p></div>
      <button type="button" class="btn js-alerts" data-topic="<?= (int) ($cat['id'] ?? 0) ?>"><?= icon('bell') ?> Turn on alerts</button>
    </section>

    <?= ad('article_bottom') ?>

    <?php if ($author && $author['bio'] && !$a['byline']): ?>
      <aside class="author-box"><span class="avatar" aria-hidden="true"><?= e(mb_strtoupper(mb_substr($author['name'], 0, 1))) ?></span>
        <div><a href="<?= e(author_url($author)) ?>"><strong><?= e($author['name']) ?></strong></a><?php if ($author['title']): ?> · <?= e($author['title']) ?><?php endif; ?><p><?= e($author['bio']) ?></p></div></aside>
    <?php endif; ?>
  </article>

  <aside class="col-side article-side">
    <?php if ($mostRead): ?>
      <section class="box most-read"><h2 class="box-title">Most read</h2><ol><?php foreach ($mostRead as $m): ?><?= card($m, 'number') ?><?php endforeach; ?></ol></section>
    <?php endif; ?>
    <div class="sticky"><?= ad('sidebar') ?></div>
  </aside>
</div>

<?php if ($related): ?>
<section class="wrap related" aria-label="Related stories">
  <?= section_head('More on this story') ?>
  <div class="grid-4"><?php foreach ($related as $r): ?><?= card($r) ?><?php endforeach; ?></div>
</section>
<?php endif; ?>
