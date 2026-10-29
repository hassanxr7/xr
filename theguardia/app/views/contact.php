<?php
/** @var bool $sent */
defined('APP') || exit;
seo(['title' => 'Contact the newsroom', 'description' => 'Send a news tip, a correction request or a business enquiry to ' . site_name() . '.']);
?>
<div class="wrap page-wrap">
  <article class="article static-page">
    <header class="article-head"><h1>Contact the newsroom</h1>
      <p class="standfirst">News tips, corrections, advertising and photo licensing — we read every message.</p></header>
    <?php foreach (flashes() as [$type, $msg]): ?><div class="notice notice-<?= e($type) ?>"><?= e($msg) ?></div><?php endforeach; ?>
    <?php if ($sent): ?>
      <div class="notice notice-success">Thank you — your message has been sent.</div>
    <?php else: ?>
    <form method="post" action="<?= e(url('contact')) ?>" class="form">
      <?= csrf_field() ?>
      <label>Your name <input name="name" required maxlength="100" autocomplete="name"></label>
      <label>Email <input type="email" name="email" required autocomplete="email"></label>
      <label>Subject
        <select name="subject"><option>News tip</option><option>Correction request</option><option>Advertising</option><option>Photo licensing</option><option>Other</option></select>
      </label>
      <label>Message <textarea name="message" rows="7" required minlength="10" maxlength="5000"></textarea></label>
      <label class="hp" aria-hidden="true">Website <input name="website" tabindex="-1" autocomplete="off"></label>
      <button class="btn" type="submit">Send message</button>
    </form>
    <?php endif; ?>
    <?php if ($email = setting('contact_email')): ?><p class="muted">Or email <a href="mailto:<?= e($email) ?>"><?= e($email) ?></a><?php if ($wa = setting('whatsapp')): ?> · WhatsApp <a href="https://wa.me/<?= e(preg_replace('~\D~', '', $wa)) ?>">+<?= e(preg_replace('~\D~', '', $wa)) ?></a><?php endif; ?></p><?php endif; ?>
  </article>
</div>
