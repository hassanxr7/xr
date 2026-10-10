<?php
// Serves Privacy Policy and Terms & Conditions from data/privacy.json and data/terms.json
$key = $PAGE_KEY; $m = page_meta($key); $doc = data($key);
$path = $key === 'privacy' ? '/privacy-policy' : '/terms-and-conditions';
set_breadcrumbs([[$m['h1'], $path]]);
layout_start(['title' => $m['title'], 'description' => $m['description'], 'keywords' => $m['keywords'], 'path' => $path]);
page_hero($m['h1'], 'Last updated: ' . site('legal_updated') . '. Applies to the ITrackZen website, web platform and mobile applications operated by ' . site('company') . '.', 'Legal');
?>
<section class="section"><div class="container legal-layout">
  <aside class="toc" aria-label="Contents"><strong>Contents</strong><ol>
    <?php foreach ($doc['sections'] as $i => $s): ?><li><a href="#s<?= $i + 1 ?>"><?= e(preg_replace('/^\d+\.\s*/', '', $s['h'])) ?></a></li><?php endforeach; ?>
  </ol></aside>
  <article class="legal">
    <p class="lead-sm"><?= e($doc['intro']) ?></p>
    <?php foreach ($doc['sections'] as $i => $s): ?>
      <h2 id="s<?= $i + 1 ?>"><?= e($s['h']) ?></h2>
      <?php foreach ($s['p'] as $p): echo '<p>' . str_replace(['{jurisdiction}', '/delete-account'], [e(site('legal_jurisdiction')), '<a href="/delete-account">/delete-account</a>'], e($p)) . '</p>'; endforeach; ?>
      <?php if (!empty($s['list'])): ?><ul><?php foreach ($s['list'] as $li): ?><li><?= e($li) ?></li><?php endforeach; ?></ul><?php endif; ?>
    <?php endforeach; ?>
    <p class="fine">See also: <?= $key === 'privacy' ? '<a href="/terms-and-conditions">Terms &amp; Conditions</a>' : '<a href="/privacy-policy">Privacy Policy</a>' ?> &middot; <a href="/delete-account">Account &amp; Data Deletion</a> &middot; <a href="/contact-sales">Contact us</a></p>
  </article>
</div></section>
<?php layout_end();
