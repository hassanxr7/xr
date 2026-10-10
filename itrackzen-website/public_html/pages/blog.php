<?php
$m = page_meta('blog'); $posts = data('blog')['posts'] ?? [];
usort($posts, fn($a, $b) => strcmp($b['date'], $a['date']));
set_breadcrumbs([['Blog', '/blog']]);
layout_start(['title' => $m['title'], 'description' => $m['description'], 'keywords' => $m['keywords'], 'path' => '/blog']);
page_hero($m['h1'], 'Practical guides on GPS tracking, fuel monitoring, AI dashcams and fleet management for African businesses.', 'Blog');
?>
<section class="section"><div class="container"><div class="grid grid-3">
<?php foreach ($posts as $p): ?>
  <article class="card post reveal">
    <?php if (!empty($p['image'])): ?><img src="<?= e($p['image']) ?>" alt="<?= e($p['title']) ?>" loading="lazy" width="600" height="340"><?php else: ?><div class="post-art"><?= icon($p['tag'] === 'Fuel monitoring' ? 'fuel' : ($p['tag'] === 'Video telematics' ? 'camera' : 'chip'), 'ico xl') ?></div><?php endif; ?>
    <p class="meta"><span><?= e($p['tag']) ?></span> &middot; <time datetime="<?= e($p['date']) ?>"><?= e(date('j M Y', strtotime($p['date']))) ?></time></p>
    <h2><a href="/blog/<?= e($p['slug']) ?>"><?= e($p['title']) ?></a></h2>
    <p><?= e($p['description']) ?></p>
    <a class="more" href="/blog/<?= e($p['slug']) ?>">Read article <?= icon('arrow') ?></a>
  </article>
<?php endforeach; ?>
</div></div></section>
<?php cta_band(); layout_end();
