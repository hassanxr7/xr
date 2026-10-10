<?php
$m = page_meta('notfound');
layout_start(['title' => $m['title'], 'description' => $m['description'], 'path' => request_path(), 'noindex' => true]);
?>
<section class="section"><div class="container narrow center reveal">
  <p class="eyebrow">Error 404</p><h1>This page could not be found</h1>
  <p class="lead-sm">The link may be outdated or the page may have moved. Try one of these instead.</p>
  <div class="btn-row center"><a class="btn btn-primary" href="/">Home</a><a class="btn btn-outline" href="/gps-tracking-services">GPS services</a><a class="btn btn-outline" href="/supported-gps-trackers">Supported trackers</a><a class="btn btn-outline" href="/contact-sales">Contact sales</a></div>
</div></section>
<?php layout_end();
