<?php
$p = $POST;
set_breadcrumbs([['Blog', '/blog'], [$p['title'], '/blog/' . $p['slug']]]);
add_ld(['@type' => 'BlogPosting', 'headline' => $p['title'], 'description' => $p['description'], 'datePublished' => $p['date'], 'dateModified' => $p['date'],
    'author' => ['@type' => 'Organization', 'name' => site('brand')], 'publisher' => ['@id' => base_url() . '/#organization'],
    'mainEntityOfPage' => abs_url('/blog/' . $p['slug']), 'image' => abs_url($p['image'] ?: site('og_image', '/assets/img/og-image.png'))]);
layout_start(['title' => mb_strlen($p['title']) > 48 ? $p['title'] : $p['title'] . ' | ITrackZen', 'description' => $p['description'], 'path' => '/blog/' . $p['slug'], 'og_type' => 'article', 'image' => $p['image'] ?: null]);
page_hero($p['title'], $p['description'], $p['tag'] . ' · ' . date('j F Y', strtotime($p['date'])));
?>
<section class="section"><div class="container narrow article">
  <?php foreach ($p['body'] as $para): ?><p><?= e($para) ?></p><?php endforeach; ?>
  <div class="card mt-lg"><h3>Talk to an ITrackZen specialist</h3><p>Need help choosing trackers, sensors or dashcams for your fleet? We will recommend a setup and give you a clear quote.</p><div class="btn-row"><a class="btn btn-primary" href="/contact-sales">Contact Sales</a><a class="btn btn-outline" href="/gps-tracking-services">Explore GPS services</a></div></div>
  <p><a href="/blog">&larr; Back to all articles</a></p>
</div></section>
<?php layout_end();
