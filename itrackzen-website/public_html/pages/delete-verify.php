<?php
require_once __DIR__ . '/../includes/mailer.php';
require_once __DIR__ . '/../includes/deletion.php';
header('X-Robots-Tag: noindex'); header('Referrer-Policy: no-referrer'); header('Cache-Control: no-store');
$ref = preg_match('/^DEL-[0-9]{6}-[A-Z0-9]{5}$/', $_REQUEST['ref'] ?? '') ? $_REQUEST['ref'] : '';
$tok = preg_match('/^[a-f0-9]{64}$/', $_REQUEST['token'] ?? '') ? $_REQUEST['token'] : '';
$done = false; $ok = false; $msg = '';
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'POST') { [$ok, $msg] = ($ref && $tok) ? del_confirm_email($ref, $tok) : [false, 'This confirmation link is not valid.']; $done = true; }
layout_start(['title' => 'Confirm deletion request | ITrackZen', 'description' => 'Confirm your account deletion request.', 'path' => '/delete-account', 'noindex' => true]);
?>
<section class="section"><div class="container narrow center thanks">
<?php if ($done): ?>
  <span class="ico-wrap xl <?= $ok ? 'ok' : '' ?>"><?= icon($ok ? 'check' : 'close') ?></span>
  <h1><?= $ok ? 'Request confirmed' : 'Could not confirm' ?></h1><p class="lead-sm"><?= e($msg) ?></p>
  <?php if ($ok): ?><p>We aim to complete verified requests within <?= e(del_timeframe()) ?> days. You will receive an email when it is done.</p><?php endif; ?>
  <div class="btn-row center"><a class="btn btn-primary" href="/delete-account">Account &amp; data deletion page</a><a class="btn btn-outline" href="/">Home</a></div>
<?php elseif ($ref && $tok): ?>
  <span class="ico-wrap xl"><?= icon('shield') ?></span>
  <h1>Confirm your deletion request</h1><p class="lead-sm">Reference <b><?= e($ref) ?></b>. Press the button to confirm that you made this request. Nothing is deleted until our team has also verified your identity.</p>
  <form method="post" action="/delete-account/verify"><input type="hidden" name="ref" value="<?= e($ref) ?>"><input type="hidden" name="token" value="<?= e($tok) ?>"><button class="btn btn-primary btn-lg" type="submit">Confirm deletion request</button></form>
<?php else: ?>
  <h1>Link not valid</h1><p class="lead-sm">This confirmation link is incomplete or invalid. Please use the link in your email or submit a new request.</p><a class="btn btn-primary" href="/delete-account">Go to deletion page</a>
<?php endif; ?>
</div></section>
<?php layout_end();
