<?php
$m = page_meta('delete'); $d = data('deletion');
set_breadcrumbs([['Account & Data Deletion', '/delete-account']]);
add_ld(['@type' => 'WebPage', 'name' => $m['title'], 'url' => abs_url('/delete-account'), 'description' => $m['description'], 'isPartOf' => ['@id' => base_url() . '/#website']]);
layout_start(['title' => $m['title'], 'description' => $m['description'], 'keywords' => $m['keywords'], 'path' => '/delete-account']);
page_hero('Account & Data Deletion', $d['app_name'] . ' by ' . $d['developer'] . ': request deletion of your tracking account and personal data.', 'Privacy');
$submitted = preg_match('/^DEL-[0-9]{6}-[A-Z0-9]{5}$/', $_GET['submitted'] ?? '') ? $_GET['submitted'] : '';
?>
<section class="section"><div class="container legal-layout del">
  <aside class="toc" aria-label="On this page"><strong>On this page</strong><ol>
    <li><a href="#how">How to request deletion</a></li><li><a href="#verify">How we verify ownership</a></li><li><a href="#deleted">What is deleted</a></li><li><a href="#kept">What we keep and why</a></li><li><a href="#time">Processing time</a></li><li><a href="#request">Request form</a></li><li><a href="#contact">Contact</a></li>
  </ol></aside>
  <article class="legal">
    <?php if ($submitted): ?><p class="alert-ok" role="status"><?= icon('check') ?><span><strong>Request received.</strong> Your reference is <b><?= e($submitted) ?></b>. Check your email and open the confirmation link to complete your request.</span></p><?php endif; ?>
    <p class="note"><?= icon('shield') ?><span><strong>App:</strong> <?= e($d['app_name']) ?> (<?= e($d['platforms'] ?? 'Android, iOS and web') ?>) &middot; <?= !empty($d['store_names']) ? e($d['store_names']) . ' &middot; ' : '' ?><strong>Developer:</strong> <?= e($d['developer']) ?> &middot; <strong>Platform:</strong> <a href="<?= e($d['platform_url']) ?>" rel="noopener"><?= e(preg_replace('#^https?://#', '', $d['platform_url'])) ?></a></span></p>
    <p class="lead-sm"><?= e($d['intro']) ?></p>

    <h2 id="how">How to request deletion</h2>
    <?php if (!empty($d['in_app_path'])): ?><p><strong>In the app:</strong> <?= e($d['in_app_path']) ?> <?= e($d['in_app_note']) ?></p><p>You can also use this web page:</p><?php endif; ?>
    <ol class="num-list big"><?php foreach ($d['steps'] as $s): ?><li><strong><?= e($s['title']) ?>.</strong> <?= e($s['text']) ?></li><?php endforeach; ?></ol>

    <h2 id="verify">How we verify ownership</h2>
    <ul><?php foreach ($d['verification'] as $v): ?><li><?= e($v) ?></li><?php endforeach; ?></ul>

    <h2 id="deleted">What is deleted</h2>
    <ul><?php foreach ($d['deleted'] as $v): ?><li><?= e($v) ?></li><?php endforeach; ?></ul>
    <p><?= e($d['partial']) ?></p>

    <h2 id="kept">What we keep, why and for how long</h2>
    <div class="table-wrap"><table class="compare"><thead><tr><th scope="col">Data kept</th><th scope="col">Why</th><th scope="col">Retention</th></tr></thead><tbody>
    <?php foreach ($d['retained'] as $r): ?><tr><th scope="row"><?= e($r['data']) ?></th><td><?= e($r['reason']) ?></td><td><?= e($r['period']) ?></td></tr><?php endforeach; ?></tbody></table></div>
    <p class="fine">We do not use retained data for marketing. Anything not listed above is deleted.</p>

    <h2 id="time">Processing time</h2>
    <p><?= e($d['timeframe_text']) ?></p>

    <h2 id="request">Request account and data deletion</h2>
    <div class="form-card"><?php render_deletion_form(); ?></div>

    <h2 id="contact">Contact</h2>
    <p>Questions about deletion or this process? Email <a href="<?= e(mailto($d['support_email'], 'Account deletion')) ?>"><?= e($d['support_email']) ?></a> and quote your reference number if you have one. See also our <a href="/privacy-policy">Privacy Policy</a>.</p>
  </article>
</div></section>
<?php layout_end();
