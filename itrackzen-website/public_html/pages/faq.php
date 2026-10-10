<?php
$m = page_meta('faq'); $items = data('faq')['items'] ?? [];
set_breadcrumbs([['FAQ', '/faq']]);
add_ld(ld_faq($items));
layout_start(['title' => $m['title'], 'description' => $m['description'], 'keywords' => $m['keywords'], 'path' => '/faq']);
page_hero($m['h1'], 'Clear answers about devices, coverage, fuel monitoring, AI dashcams, apps, security and pricing.', 'FAQ');
?>
<section class="section"><div class="container narrow"><?php faq_list($items, true); ?>
  <div class="card center mt-lg reveal"><h3>Still have a question?</h3><p>Our team is happy to help with device compatibility, quotes and setup.</p><div class="btn-row center"><a class="btn btn-primary" href="/contact-sales">Contact Sales</a><a class="btn btn-outline" href="/supported-gps-trackers">Supported trackers</a></div></div>
</div></section>
<?php layout_end();
