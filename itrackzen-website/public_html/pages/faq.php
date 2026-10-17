<?php
$m = page_meta('faq'); $items = data('faq')['items'] ?? [];
set_breadcrumbs([['FAQ & Support', '/faq']]);
add_ld(ld_faq($items));
layout_start(['title' => $m['title'], 'description' => $m['description'], 'keywords' => $m['keywords'], 'path' => '/faq']);
page_hero($m['h1'], 'Answers about devices, coverage, fuel monitoring, AI dashcams, accounts and pricing, and how to reach our team.', 'FAQ & Support', '', 'addis-street');
$wa = wa_link('Hello ITrackZen, I need support.');
?>
<section class="section tight"><div class="container"><?php section_head('Support', 'How can we help?'); ?>
  <div class="grid grid-4">
    <?php foreach ([['login', 'Sign in to the platform', 'Existing customers sign in at itrackzen.com.', platform_url('login'), 'Client Login'], ['mail', 'Email support', site('emails.info'), mailto(site('emails.info'), 'ITrackZen support'), 'Send an email'], ['building', 'Sales & quotes', 'Prices, hardware and installation.', '/request-quote', 'Request a quote'], ['shield', 'Delete my account', 'Request deletion of your account and data.', '/delete-account', 'Deletion request']] as [$i, $t, $x, $h, $l]): ?>
    <article class="card feature reveal"><span class="ico-wrap"><?= icon($i) ?></span><h3><?= e($t) ?></h3><p><?= e($x) ?></p><a class="more" href="<?= e($h) ?>"<?= str_starts_with($h, 'http') ? ' rel="noopener"' : '' ?>><?= e($l) ?> <?= icon('arrow') ?></a></article>
    <?php endforeach; ?>
  </div>
  <?php if ($wa): ?><p class="center mt-lg"><a class="btn btn-wa" href="<?= e($wa) ?>" target="_blank" rel="noopener"><?= icon('whatsapp') ?>Message us on WhatsApp</a></p><?php endif; ?>
</div></section>
<section class="section alt"><div class="container narrow"><?php section_head('FAQ', 'Frequently asked questions'); faq_list($items, true); ?>
  <p class="center muted mt-lg">For your safety, never send your password to anyone, including us.</p>
</div></section>
<?php cta_band('Still have a question?', 'Send us a message and we will get back to you.'); layout_end();
