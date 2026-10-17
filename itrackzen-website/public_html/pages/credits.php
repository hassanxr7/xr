<?php
$items = data('photos')['items'] ?? [];
set_breadcrumbs([['Image credits', '/image-credits']]);
layout_start(['title' => 'Image Credits | ITrackZen', 'description' => 'Credits and licences for the photographs used on the ITrackZen website.', 'path' => '/image-credits']);
page_hero('Image credits', 'We are grateful to the photographers who license their work for reuse. Photographs on this website are used under the Creative Commons Attribution 2.0 licence.', 'Credits', '', 'kampala-road');
?>
<section class="section"><div class="container narrow">
  <p>Photos were sourced from the Open Images Dataset, where each image is shown with the licence recorded by its Flickr author (CC BY 2.0). We resized and cropped the images and applied a dark colour overlay for readability. In one image a vehicle licence plate was blurred. No endorsement of ITrackZen by the photographers or the people and brands shown is implied.</p>
  <ul class="credits">
  <?php foreach ($items as $slug => $m): ?>
    <li class="reveal"><img src="<?= e(photo_url($slug, 'sm')) ?>" alt="<?= e($m['alt']) ?>" width="120" height="80" loading="lazy">
      <div><strong>&ldquo;<?= e($m['title']) ?>&rdquo;</strong> by <a href="<?= e($m['authorurl']) ?>" rel="noopener nofollow"><?= e($m['author']) ?></a><br>
      <span class="muted"><?= e($m['place']) ?> &middot; <a href="<?= e($m['url']) ?>" rel="noopener nofollow">Original on Flickr</a> &middot; <a href="<?= e($m['license_url']) ?>" rel="noopener nofollow"><?= e($m['license']) ?></a></span></div></li>
  <?php endforeach; ?>
  </ul>
</div></section>
<?php layout_end();
