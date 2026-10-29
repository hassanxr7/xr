<?php
/** @var array $p @var array $licences */
defined('APP') || exit;
?>
<div class="wrap">
  <nav class="crumbs" style="margin-top:18px" aria-label="Breadcrumb"><a href="<?= e(url('photos')) ?>">Photo store</a></nav>
  <div class="photo-detail">
    <div>
      <img src="<?= e(url($p['preview'])) ?>" alt="<?= e($p['title']) ?>" width="<?= (int) min(1400, $p['width']) ?>" height="<?= (int) round(min(1400, $p['width']) * $p['height'] / max(1, $p['width'])) ?>">
      <p class="facts">Preview is watermarked and reduced. Original: <?= (int) $p['width'] ?> × <?= (int) $p['height'] ?> px · Photo ID <?= (int) $p['id'] ?></p>
    </div>
    <div>
      <h1><?= e($p['title']) ?></h1>
      <?php if ($p['description']): ?><p class="standfirst"><?= nl2br(e($p['description'])) ?></p><?php endif; ?>
      <p class="facts">
        <?php if ($p['location']): ?>Location: <?= e($p['location']) ?><br><?php endif; ?>
        <?php if ($p['taken_at']): ?>Date: <?= e(fmt_date($p['taken_at'], 'F j, Y')) ?><br><?php endif; ?>
        Credit: <?= e($p['photographer'] ?: site_name()) ?> / <?= e(site_name()) ?>
      </p>
      <?php foreach (flashes() as [$type, $msg]): ?><div class="notice notice-<?= e($type) ?>"><?= e($msg) ?></div><?php endforeach; ?>
      <?php if ($p['status'] === 'sold'): ?>
        <div class="notice notice-error">This photo has been sold with exclusive rights.</div>
      <?php elseif (!$licences): ?>
        <p><a class="btn" href="<?= e(url('contact')) ?>">Ask for a price</a></p>
      <?php else: ?>
      <form method="post" action="<?= e(url('photos/' . $p['slug'] . '/buy')) ?>" class="form" id="buy">
        <?= csrf_field() ?>
        <div class="licences" role="radiogroup" aria-label="Licence">
          <?php $first = true; foreach ($licences as $k => $l): ?>
            <label><input type="radio" name="licence" value="<?= e($k) ?>"<?= $first ? ' checked' : '' ?>>
              <span><strong><?= e($l['label']) ?></strong><small><?= e($l['desc']) ?></small></span>
              <span class="amount"><?= e(money($l['price'], $p['currency'])) ?></span></label>
          <?php $first = false; endforeach; ?>
        </div>
        <label>Your name <input name="name" required maxlength="100" autocomplete="name"></label>
        <label>Email (the download link is sent here) <input type="email" name="email" required autocomplete="email"></label>
        <label>Media outlet / company <input name="org" maxlength="120" autocomplete="organization"></label>
        <label>Notes (optional) <textarea name="note" rows="3" maxlength="1000"></textarea></label>
        <label style="display:flex;gap:8px;font-weight:500"><input type="checkbox" name="agree" value="1" required> I accept the licence terms and the <a href="<?= e(url('terms')) ?>">terms of use</a>.</label>
        <button class="btn" type="submit"><?= stripe_enabled() ? 'Continue to secure payment' : 'Request this licence' ?></button>
        <?php if (stripe_enabled()): ?><p class="facts">Payments are processed securely by Stripe. You can download the original immediately after paying.</p><?php endif; ?>
      </form>
      <?php endif; ?>
    </div>
  </div>
</div>
