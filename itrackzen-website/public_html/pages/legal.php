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
    <?php if ($key === 'privacy'): ?><p class="alert-ok del-callout"><?= icon('shield') ?><span><strong>Want your account and data deleted?</strong> You can request it without signing in. <a href="/delete-account#request">Go to the deletion request form</a> or read the <a href="#s<?= (int)array_search('Account and data deletion', array_map(fn($x) => $x['h'], $doc['sections'])) + 1 ?>">deletion process</a> below.</span></p><?php endif; ?>
    <?php $dd = data('deletion'); foreach ($doc['sections'] as $i => $s): $h = preg_replace('/^\d+\.\s*/', '', $s['h']); ?>
      <h2 id="s<?= $i + 1 ?>"><?= $i + 1 ?>. <?= e($h) ?></h2>
      <?php foreach ($s['p'] as $p): echo '<p>' . str_replace(['{jurisdiction}', '/delete-account'], [e(site('legal_jurisdiction')), '<a href="/delete-account">/delete-account</a>'], e($p)) . '</p>'; endforeach; ?>
      <?php if (!empty($s['list'])): ?><ul><?php foreach ($s['list'] as $li): ?><li><?= e($li) ?></li><?php endforeach; ?></ul><?php endif; ?>
      <?php if (($s['special'] ?? '') === 'deletion'): ?>
        <h3>How to request deletion</h3>
        <ol class="num-list big"><?php foreach ($dd['steps'] as $st): ?><li><strong><?= e($st['title']) ?>.</strong> <?= e($st['text']) ?></li><?php endforeach; ?></ol>
        <p><a class="btn btn-primary" href="/delete-account#request">Request account deletion <?= icon('arrow') ?></a> &nbsp; <a class="btn btn-outline" href="/delete-account">Read the full deletion page</a></p>
        <h3>How we verify ownership</h3>
        <ul><?php foreach ($dd['verification'] as $v): ?><li><?= e($v) ?></li><?php endforeach; ?></ul>
        <h3>What is deleted</h3>
        <ul><?php foreach ($dd['deleted'] as $v): ?><li><?= e($v) ?></li><?php endforeach; ?></ul>
        <h3>What we keep, why and for how long</h3>
        <div class="table-wrap"><table class="compare"><thead><tr><th scope="col">Data kept</th><th scope="col">Why</th><th scope="col">Retention</th></tr></thead><tbody>
        <?php foreach ($dd['retained'] as $r): ?><tr><th scope="row"><?= e($r['data']) ?></th><td><?= e($r['reason']) ?></td><td><?= e($r['period']) ?></td></tr><?php endforeach; ?></tbody></table></div>
        <h3>Processing time</h3><p><?= e($dd['timeframe_text']) ?></p>
        <p>You can also write to <a href="<?= e(mailto($dd['support_email'], 'Account deletion')) ?>"><?= e($dd['support_email']) ?></a> and we will explain how to proceed. We will never ask for your password.</p>
      <?php endif; ?>
    <?php endforeach; ?>
    <p class="fine">See also: <?= $key === 'privacy' ? '<a href="/terms-and-conditions">Terms &amp; Conditions</a>' : '<a href="/privacy-policy">Privacy Policy</a>' ?> &middot; <a href="/delete-account">Account &amp; Data Deletion</a> &middot; <a href="/contact-sales">Contact us</a></p>
  </article>
</div></section>
<?php layout_end();
